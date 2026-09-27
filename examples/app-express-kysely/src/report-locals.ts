// types for vanilla workaround signal on res.locals

declare global {
  namespace Express {
    interface Locals {
      /** vanilla workaround flavor: a signal that fires when the client disconnects. */
      abortSignal?: AbortSignal;
    }
  }
}

export {};
