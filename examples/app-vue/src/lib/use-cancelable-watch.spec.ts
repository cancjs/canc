import { CancelablePromise } from '@cancjs/promise';
import { mount } from '@vue/test-utils';
import { defineComponent, h, onErrorCaptured, ref } from 'vue';

import { useCancelableWatch } from './use-cancelable-watch';

function createDeferred<T = string>(): {
  promise: CancelablePromise<T>;
  reject: (err: unknown) => void;
  isCanceled: () => boolean;
} {
  let reject!: (err: unknown) => void;
  let canceled = false;
  const promise = new CancelablePromise<T>((_res, rej, { handleCancel }) => {
    reject = rej;
    handleCancel(() => {
      canceled = true;
    });
  });
  return { promise, reject, isCanceled: () => canceled };
}

describe('useCancelableWatch error routing', () => {
  it('routes a non-cancel rejection to the nearest onErrorCaptured', async () => {
    const deferred = createDeferred<string>();
    const caught: unknown[] = [];

    const Child = defineComponent({
      setup() {
        const trigger = ref(0);
        useCancelableWatch(trigger, () => deferred.promise, { immediate: true });
        return () => h('div');
      },
    });

    const Parent = defineComponent({
      setup() {
        onErrorCaptured((error) => {
          caught.push(error);
          return false;
        });
        return () => h(Child);
      },
    });

    mount(Parent);

    const failure = new Error('catalog backend is down');
    deferred.reject(failure);
    await Promise.resolve();
    await Promise.resolve();

    expect(caught).toEqual([failure]);
  });

  it("does not route a superseded run's CancelError", async () => {
    const first = createDeferred<string>();
    const second = createDeferred<string>();
    const caught: unknown[] = [];

    const Child = defineComponent({
      setup() {
        const trigger = ref(1);
        useCancelableWatch(trigger, (value) => (value === 1 ? first.promise : second.promise), { immediate: true });
        return { trigger };
      },
      render() {
        return h('div');
      },
    });

    const Parent = defineComponent({
      setup() {
        onErrorCaptured((error) => {
          caught.push(error);
          return false;
        });
        return () => h(Child, { ref: 'child' });
      },
    });

    const wrapper = mount(Parent);
    await Promise.resolve();

    // Trigger change supersedes the first run: useCancelableWatch cancels it with a CancelError.
    const child = wrapper.getComponent(Child);
    (child.vm as unknown as { trigger: number }).trigger = 2;
    await Promise.resolve();
    await Promise.resolve();

    expect(first.isCanceled()).toBe(true);
    expect(caught).toEqual([]);
  });
});
