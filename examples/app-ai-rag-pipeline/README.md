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

The cancelable pipeline reads like pseudocode. Each mock call is cancelified once at the module's
top, so the coroutine body itself carries no signal at all:

```ts
const embedQuery = cancelify(({ getSignal }, [query]) => embed(query, getSignal()));
// ...rerank, retrieveLegsSource, generateAnswer wrapped the same way

cancAsync(function* () {
 // embed the query — canceled here, nothing below runs
 yield* cancAwait(embedQuery(query));

 // parallel retrieve, collected as a finite set with cancForAwait.toArray
 const legsSource = yield* cancAwait(retrieveLegsSource(ragApi, query));
 const legResultsArr = yield* cancForAwait.toArray(legsSource);
 const hits = mergeHits(legResultsArr);

 // rerank the merged hits — canceled here, generate never starts
 const ranked = yield* cancAwait(rerankHits(query, hits));

 // generate the answer, consuming the token stream with cancForAwait
 const context = ranked.slice(0, 3).map((c) => c.text).join(' ');
 let text = '';
 const tokenStream = yield* cancAwait(generateAnswer(chatApi, context));
 yield* cancForAwait(tokenStream, (token) => {
 text += token;
 });
 return { query, text, sources: ranked.slice(0, 3).map((c) => c.id) };
});
```

The two iterator combinators show side by side: `cancForAwait.toArray` buffers a bounded source
(the retrieval legs) into an array, and `cancForAwait` consumes an open stream (the answer tokens)
one at a time. Both cancel their source when the pipeline is canceled.

## The cost of not canceling

Without cancellation, each step above runs to the end no matter what the caller does. If the user
navigates away during rerank, the answer still gets generated and billed. If a cache lookup wins a
race against the pipeline, the pipeline loses the race but keeps running in the background,
embedding, retrieving, reranking, and generating an answer nobody will read. In the vanilla flavor
those are real charges. In the canc flavor a cancel (or a lost race) stops the in-flight step at the
mock-api boundary, and no later step is ever started.

## Prerequisites

The examples consume the built `dist` of each `@cancjs/*` package through a npm `file:`. Build the
monorepo first, then install this workspace:

```
cd ../../ # monorepo root (canc)
npm run build
cd examples
npm install
```

## Run

```
npm run start:vanilla --workspace=app-ai-rag-pipeline
npm run start:canc --workspace=app-ai-rag-pipeline
npm run test --workspace=app-ai-rag-pipeline
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

- **Where cancellation stops:** each step is cancelified once at the mock-API boundary, so
 canceling the coroutine aborts whichever step is in flight and shows up as an aborted marker in
 `mockApi.calls`. Steps that already completed are not undone; steps below the cancel point never
 start.
- **Rerank is aux, not a network call**, so a cancel during rerank rejects the rerank promise rather
 than leaving a mock marker. The proof it worked is that the generate step (the `chat.token` calls)
 never runs.
