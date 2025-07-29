# app-ai-rag-pipeline

An "ask the manual" docs assistant. A question runs through a retrieval-augmented pipeline: embed
the query, retrieve candidates in parallel, rerank them, then stream an answer. The whole thing is
one cancelable flow, so a cancel at any point aborts the in-flight step and skips everything below
it.

Keyless by default: mock embeddings and a mock token stream, no API key, no network. Swapping in a
real model is a documentation-only change (see `src/mock/llm.ts`); the pipeline itself does not
change. It works with any SDK that accepts an AbortSignal.

## Domain

Product-manual Q&A. The corpus is a handful of short doc chunks; the point is the pipeline shape,
not the data.

## The pipeline

The cancelable pipeline reads like pseudocode. Cancellation is ambient, there are no per-step
checks:

```ts
const runPipeline = cancAsync(function* (mockApi, query, signal) {
 // embed the query — canceled here, nothing below runs
 yield* cancAwait(embed(query, signal));

 // parallel retrieve — both legs needed, so this is `all`, not a race
 const [vector, keyword] = yield* cancAwait.all([
 vectorSearch(mockApi, query, signal),
 keywordSearch(mockApi, query, signal),
 ]);
 const hits = mergeHits(vector, keyword);

 // rerank the merged hits — canceled here, generate never starts
 const ranked = yield* cancAwait(rerank(query, hits, signal));

 // generate the answer from the top chunks — an abort mid-stream stops emitting tokens
 const stream = generate(mockApi, ranked.slice(0, 3).map((c) => c.text).join(' '), signal);
 let text = '';
 while (true) {
 const next = yield* cancAwait(stream.next());
 if (next.done) break;
 text += next.value;
 }
 return { query, text, sources: ranked.slice(0, 3).map((c) => c.id) };
});
```

## The cost of not canceling

Without cancellation, each step above runs to the end no matter what the caller does. If the user
navigates away during rerank, the answer still gets generated and billed. If a cache lookup wins a
race against the pipeline, the pipeline loses the race but keeps running in the background,
embedding, retrieving, reranking, and generating an answer nobody will read. In the vanilla flavor
those are real charges. In the canc flavor a cancel (or a lost race) stops the in-flight step at the
mock-api boundary, and no later step is ever started.

## Prerequisites

The examples consume the built `dist` of each `@cancjs/*` package through a yarn `link:`. Build the
monorepo first, then install this workspace:

```
cd ../../ # monorepo root (canc)
yarn build
cd examples
yarn
```

## Run

```
yarn workspace app-ai-rag-pipeline start:vanilla
yarn workspace app-ai-rag-pipeline start:canc
yarn workspace app-ai-rag-pipeline test
```

Each entry runs three scenarios: a full run, a cancel during rerank, and a race where a cached
answer beats the pipeline. The canc entry prints the aborted-call count so you can see the pipeline
stop at the mock-api boundary; the vanilla entry prints how many calls ran even after the result was
discarded.

## Files to compare

Same file names modulo the `-vanilla` / `-canc` suffix, same function order and comment anchors:

```
diff src/pipeline-vanilla.ts src/pipeline-canc.ts
diff src/cache-race-vanilla.ts src/cache-race-canc.ts
diff src/main-vanilla.ts src/main-canc.ts
```

- `src/pipeline.ts` holds the shared types and the embed and retrieval steps used by both flavors.
- `src/mock/` is scaffolding (rerank service, mock LLM). Treat it as a black box, pretend it is your
 API.

## Notes

- **Where cancellation stops:** each step is a signal-aware call. The pipeline's cancellation is
 wired to a native AbortSignal that is threaded into every step, so a cancel aborts the request
 that is in flight and shows up as an aborted marker in `mockApi.calls`. Steps that already
 completed are not undone; steps below the cancel point never start.
- **Rerank is aux, not a network call**, so a cancel during rerank rejects the rerank promise rather
 than leaving a mock marker. The proof it worked is that the generate step (the `chat.token` calls)
 never runs.
