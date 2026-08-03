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

    expect(Object.prototype.hasOwnProperty.call(inst, 'load')).toBe(true);

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
    expect(Object.prototype.hasOwnProperty.call(inst, 'load')).toBe(true);
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

  it('wraps a prototype generator method, so calling it returns a promise', async () => {
    class C {
      id = 7;

      constructor() {
        asyncMethod(this, 'load' as any);
      }

      *load(): any {
        return yield* cancAwait(Promise.resolve(this.id));
      }
    }

    const inst = new C();
    const result = (inst.load as any)();

    expect(Object.prototype.hasOwnProperty.call(inst, 'load')).toBe(true);
    expect(result).toBeInstanceOf(CancelablePromise);
    await expect(result).resolves.toBe(7);
  });

  it('wraps a generator function held in a class field', async () => {
    class C {
      id = 8;

      // Field initializers all run before the constructor body, so the field is there to wrap.
      constructor() {
        asyncMethod(this, 'load');
      }

      load: any = function* (this: C) {
        return yield* cancAwait(Promise.resolve(this.id));
      };
    }

    const inst = new C();
    const result = inst.load();

    expect(result).toBeInstanceOf(CancelablePromise);
    await expect(result).resolves.toBe(8);
  });

  it('keeps this on a wrapped method when it is detached', async () => {
    class C {
      value: string;

      constructor(value: string) {
        this.value = value;
        asyncMethod(this, 'read' as any);
      }

      *read(): any {
        return yield* cancAwait(Promise.resolve(this.value));
      }
    }

    const detached = (new C('bound') as any).read;

    await expect(detached()).resolves.toBe('bound');
  });

  it('does not wrap a getter result twice: the coroutine it returns is installed as is', async () => {
    let bodyRuns = 0;

    class C {
      get load(): any {
        return cancAsync(function* () {
          bodyRuns++;
          return yield* cancAwait(Promise.resolve('once'));
        });
      }
    }

    const inst = new C();
    asyncMethod(inst, 'load');

    await expect(inst.load()).resolves.toBe('once');
    expect(bodyRuns).toBe(1);
  });

  it('forwards coroutine options to the wrapped method', async () => {
    class C {
      constructor() {
        asyncMethod(this, 'load' as any, { shield: true });
      }

      *load(): any {
        return yield* cancAwait(new Promise((r) => setTimeout(r, 1, 'kept')));
      }
    }

    const inst = new C();
    const result = (inst.load as any)();
    result.cancel('ignored');

    // shield makes cancel() a no-op, so the coroutine still settles with its value.
    await expect(result).resolves.toBe('kept');
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
    expect(Object.prototype.hasOwnProperty.call(inst, 'run')).toBe(true);

    void inst.run;
    void inst.run;
    expect(getterCalls).toBe(1);
  });

  it('binds a prototype method without wrapping it', () => {
    class C {
      value = 'plain';

      constructor() {
        bindMethod(this, 'read' as any);
      }

      read(): string {
        return this.value;
      }
    }

    const detached = (new C() as any).read;

    expect(detached()).toBe('plain');
  });

  it('leaves a generator method a generator: binding is all it does', () => {
    class C {
      constructor() {
        bindMethod(this, 'walk' as any);
      }

      *walk(): any {
        yield 1;
      }
    }

    const inst = new C();
    const result = (inst.walk as any)();

    expect(result).not.toBeInstanceOf(CancelablePromise);
    expect(typeof result.next).toBe('function');
  });
});
