import { CancelablePromise, isCancelError } from '@cancjs/promise';

import { asyncMethod, bindMethod, cancAsync, cancAwait } from './coroutine';

describe('asyncMethod', () => {
  it('memoizes a cancAsync getter, returns CancelablePromise', async () => {
    class C {
      id = 42;

      get load(): any {
        return cancAsync(function* (this: C) {
          return yield* cancAwait(Promise.resolve(this.id));
        }, this);
      }
    }

    const inst = new C();
    asyncMethod(inst, 'load');
    const result = inst.load();

    expect(result).toBeInstanceOf(CancelablePromise);
    await expect(result).resolves.toBe(42);
  });

  it('binds and keeps this when detached', async () => {
    class C {
      value: string;
      constructor(v: string) {
        this.value = v;
        asyncMethod(this, 'run' as any);
      }

      get run(): any {
        return cancAsync(function* (this: C) {
          return yield* cancAwait(Promise.resolve(this.value));
        }, this);
      }
    }

    const inst = new C('hello');
    const detached = inst.run;
    await expect(detached()).resolves.toBe('hello');
  });

  it('isolates instances', async () => {
    class C {
      id: number;
      constructor(id: number) {
        this.id = id;
        asyncMethod(this, 'load' as any);
      }

      get load(): any {
        return cancAsync(function* (this: C) {
          return yield* cancAwait(Promise.resolve(this.id));
        }, this);
      }
    }

    const a = new C(1);
    const b = new C(2);

    await expect(a.load()).resolves.toBe(1);
    await expect(b.load()).resolves.toBe(2);
  });

  it('installs an own property that shadows the getter', () => {
    let getterCalls = 0;

    class C {
      get load(): any {
        getterCalls++;
        return cancAsync(function* () {
          return yield* cancAwait(Promise.resolve(1));
        });
      }
    }

    const inst = new C();
    asyncMethod(inst, 'load');
    expect(getterCalls).toBe(1);

    expect(inst.hasOwnProperty('load')).toBe(true);

    void inst.load;
    void inst.load;
    expect(getterCalls).toBe(1);
  });

  it('throws TypeError when getter does not return a function', () => {
    class C {
      get load(): any {
        return 123;
      }
    }

    const inst = new C();
    expect(() => asyncMethod(inst, 'load')).toThrow(TypeError);
  });

  it('works with a raw generator function getter (binds without wrapping)', () => {
    class C {
      id = 99;

      get load(): any {
        return function* (this: C) {
          return yield* cancAwait(Promise.resolve(this.id));
        };
      }
    }

    const inst = new C();
    asyncMethod(inst, 'load');
    expect(inst.hasOwnProperty('load')).toBe(true);
    expect(typeof inst.load).toBe('function');

    const gen = inst.load();
    expect(typeof gen.next).toBe('function');
    expect(typeof gen[Symbol.iterator]).toBe('function');
  });

  it('raw gen fn getter: bound this flows through', () => {
    class C {
      value = 'raw';

      get method(): any {
        return function (this: C) {
          return this.value;
        };
      }
    }

    const inst = new C();
    asyncMethod(inst, 'method' as any);
    const detached = inst.method;
    expect(detached()).toBe('raw');
  });

  it('cancel surfaces CancelError', async () => {
    class C {
      get load(): any {
        return cancAsync(function* () {
          return yield* cancAwait(new Promise((r) => setTimeout(r, 10_000, 'late')));
        });
      }
    }

    const inst = new C();
    asyncMethod(inst, 'load');
    const p: CancelablePromise<any> = inst.load();
    p.cancel('reason');

    let caught: unknown;
    try {
      await p;
    } catch (err) {
      caught = err;
    }

    expect(isCancelError(caught)).toBe(true);
  });
});

describe('bindMethod', () => {
  it('binds a pre-wrapped cancAsync getter result', async () => {
    class C {
      id: number;
      constructor(id: number) {
        this.id = id;
        bindMethod(this, 'load' as any);
      }

      get load(): any {
        return cancAsync(function* (this: C) {
          return yield* cancAwait(Promise.resolve(this.id));
        }, this);
      }
    }

    const inst = new C(7);
    const detached = inst.load;
    const result = detached();

    expect(result).toBeInstanceOf(CancelablePromise);
    await expect(result).resolves.toBe(7);
  });

  it('binds a plain function', () => {
    class C {
      value = 'test';
      constructor() {
        bindMethod(this, 'greet' as any);
      }

      get greet(): any {
        return function (this: C) {
          return this.value;
        };
      }
    }

    const inst = new C();
    const detached = inst.greet;
    expect(detached()).toBe('test');
  });

  it('isolates instances', () => {
    class C {
      id: number;
      constructor(id: number) {
        this.id = id;
        bindMethod(this, 'getId' as any);
      }

      get getId(): any {
        return function (this: C) {
          return this.id;
        };
      }
    }

    const a = new C(10);
    const b = new C(20);

    expect(a.getId()).toBe(10);
    expect(b.getId()).toBe(20);
  });

  it('throws TypeError when getter does not return a function', () => {
    class C {
      get load(): any {
        return null;
      }
    }

    const inst = new C();
    expect(() => bindMethod(inst, 'load')).toThrow(TypeError);
  });

  it('installs an own property that shadows the getter', () => {
    let getterCalls = 0;

    class C {
      get run(): any {
        getterCalls++;
        return function () {
          return 1;
        };
      }
    }

    const inst = new C();
    bindMethod(inst, 'run');
    expect(getterCalls).toBe(1);
    expect(inst.hasOwnProperty('run')).toBe(true);

    void inst.run;
    void inst.run;
    expect(getterCalls).toBe(1);
  });
});
