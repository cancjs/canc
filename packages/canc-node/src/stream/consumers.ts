import * as nodeConsumers from 'node:stream/consumers';

import { CancelablePromise } from '@cancjs/promise';

import { features } from '../features';
import { gated } from '../gate';

// the major the API lock confirms; the exact minor is unverified, which is why the gate below is
// feature detection and this string only ever reaches an error message
const BYTES_REQUIRED = 'v24';

/** Everything node's consumers accept: a node stream, a web stream, or any async iterable. */
type TConsumerSource = Parameters<typeof nodeConsumers.text>[0];

/** The teardown member a node stream carries and the other accepted source shapes do not. */
interface IDestroyableSource {
  destroy?: () => void;
}

export interface IConsumerOptions {
  /**
   * Destroy the source stream when the promise is canceled. Defaults to `true`.
   *
   * Set it to `false` when the stream is shared and somebody else still needs it. Canceling then
   * rejects the promise, but nothing stops the underlying read: it runs to completion and its
   * result is discarded.
   */
  destroyOnCancel?: boolean;
}

/**
 * Stop a node stream from being read any further.
 *
 * `destroy()` takes no reason argument on purpose. Cancellation is not a failure, and
 * `destroy(error)` makes the stream emit `error`, which throws for a caller who never attached a
 * listener to a stream they only handed over to be consumed.
 *
 * A web stream or a bare async iterable has nothing equivalent to call. Node holds the reader by
 * the time the read is under way, so the source is locked to us as well and there is no honest
 * teardown to run.
 */
function destroySource(stream: TConsumerSource): void {
  const source = stream as IDestroyableSource;

  if (typeof source.destroy === 'function') {
    source.destroy();
  }
}

/**
 * Wrap one of node's consumers. These are the only functions in this subpath that take no signal,
 * so the wrapper is the whole cancellation story: it registers the teardown node has no way to run
 * for itself.
 */
function consumerWrapped<TValue>(
  consume: (stream: TConsumerSource) => Promise<TValue>,
): (stream: TConsumerSource, options?: IConsumerOptions) => CancelablePromise<TValue> {
  return function consumerCall(stream: TConsumerSource, options?: IConsumerOptions): CancelablePromise<TValue> {
    const destroyOnCancel = options?.destroyOnCancel !== false;

    return new CancelablePromise<TValue>((resolve, _reject, { handleCancel }) => {
      handleCancel(() => {
        if (destroyOnCancel) {
          destroySource(stream);
        }
      });

      resolve(consume(stream));
    });
  };
}

/**
 * Reads the whole stream and fulfills with its contents as a UTF-8 string.
 *
 * Canceling destroys the source stream, which is the only way to stop a read node gives no signal
 * for. The stream is unusable afterwards, so pass `{ destroyOnCancel: false }` when it is shared.
 * A source with no `destroy` (a web stream or a bare async iterable) cannot be torn down at all;
 * the read finishes and its result is discarded.
 */
export const text = consumerWrapped(nodeConsumers.text);

/**
 * Reads the whole stream and fulfills with its contents parsed as JSON.
 *
 * Malformed input rejects with the parse error node throws, never with a `CancelError`. Canceling
 * destroys the source stream unless `{ destroyOnCancel: false }` is passed.
 */
export const json = consumerWrapped(nodeConsumers.json);

/**
 * Reads the whole stream and fulfills with its contents as a `Buffer`.
 *
 * Canceling destroys the source stream unless `{ destroyOnCancel: false }` is passed.
 */
export const buffer = consumerWrapped(nodeConsumers.buffer);

/**
 * Reads the whole stream and fulfills with its contents as an `ArrayBuffer`.
 *
 * Canceling destroys the source stream unless `{ destroyOnCancel: false }` is passed.
 */
export const arrayBuffer = consumerWrapped(nodeConsumers.arrayBuffer);

/**
 * Reads the whole stream and fulfills with its contents as a `Blob`.
 *
 * Canceling destroys the source stream unless `{ destroyOnCancel: false }` is passed.
 */
export const blob = consumerWrapped(nodeConsumers.blob);

// not in the typings this package builds against, and absent on the older runtimes it supports
const rawBytes = (nodeConsumers as { bytes?: (stream: TConsumerSource) => Promise<Uint8Array> }).bytes;

/**
 * Reads the whole stream and fulfills with its contents as a `Uint8Array`.
 *
 * Node added this later than the other consumers and the exact version is unconfirmed, so it is
 * detected rather than assumed. Calling it on a runtime that lacks it throws a
 * `NotImplementedError`.
 *
 * Canceling destroys the source stream unless `{ destroyOnCancel: false }` is passed.
 */
export const bytes = gated(
  features.hasConsumersBytes,
  'consumers.bytes',
  BYTES_REQUIRED,
  () =>
    consumerWrapped((stream: TConsumerSource) =>
      (rawBytes as (source: TConsumerSource) => Promise<Uint8Array>)(stream),
    ),
  'promise',
);
