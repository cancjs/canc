import { Observable, Subject } from 'rxjs';

import { toCancelable } from './to-cancelable';

describe('toCancelable', () => {
 it('resolves with the first emitted value', async () => {
 const source = new Observable<number>((subscriber) => {
 subscriber.next(42);
 });
 await expect(toCancelable(source)).resolves.toBe(42);
 });

 it('unsubscribes from the source when the promise is canceled (Angular-side abort)', () => {
 let unsubscribed = false;
 const source = new Observable<number>(() => {
 // The teardown fn is what Angular's HttpClient runs to abort the underlying request.
 return () => {
 unsubscribed = true;
 };
 });

 const promise = toCancelable(source);
 expect(unsubscribed).toBe(false);
 promise.cancel();
 expect(unsubscribed).toBe(true);
 });

 it('does not resolve after cancel even if the source emits late', async () => {
 const subject = new Subject<number>();
 const promise = toCancelable(subject);
 const onFulfilled = jest.fn();
 promise.then(onFulfilled, () => {});

 promise.cancel();
 subject.next(7); // late emission after cancel — must be ignored

 await Promise.resolve();
 expect(onFulfilled).not.toHaveBeenCalled();
 });
});
