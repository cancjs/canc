import { NotImplementedError } from './errors/classes';

/**
 * Return implementation unchanged when available, or a function throwing NotImplementedError.
 */
export function gated<TFn extends (...args: any[]) => any>(
  available: boolean,
  feature: string,
  required: string,
  impl: TFn,
): TFn {
  if (available) {
    return impl;
  }

  return ((..._args: any[]): any => {
    throw new NotImplementedError(`${feature} requires Node >= ${required}`, {
      feature,
      required,
    });
  }) as TFn;
}
