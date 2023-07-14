import { equal } from "./deps.ts";
import { eq } from "./matchers.ts";
import { KvKeyMatcher, Matcher } from "./types.ts";

export function keyPartMatcher(
  matchers: (Deno.KvKeyPart | Matcher<Deno.KvKeyPart>)[],
): Matcher<Deno.KvKey> {
  return new class extends Matcher<Deno.KvKey> {
    matches(value?: Deno.KvKey): boolean {
      if (value && value.length == matchers.length) {
        for (let i = 0; i < matchers.length; i++) {
          const matcher = matchers[i];
          if (matcher instanceof Matcher) {
            if (!matcher.matches(value[i])) {
              return false;
            }
          } else if (!equal(matcher, value[i])) {
            return false;
          }
        }
        return true;
      }
      return false;
    }
  }();
}

export function getKeyMatcher(key: KvKeyMatcher) {
  return key instanceof Matcher
    ? key
    : (key instanceof Array)
    ? keyPartMatcher(key as Matcher<Deno.KvKeyPart>[])
    : eq(key);
}

export function matchObjectsMatcher<T extends { [key: string]: unknown }>(
  expected: { [key: string]: unknown },
): Matcher<{ [key: string]: unknown }> {
  return new class extends Matcher<T> {
    matches(actual?: { [key: string]: unknown }): boolean {
      if (actual) {
        const expectedKeys = Object.keys(expected);
        const actualKeys = Object.keys(actual);
        if (expectedKeys.length == actualKeys.length) {
          for (let i = 0; i < expectedKeys.length; i++) {
            const key = expectedKeys[i];
            if (!actualKeys.includes(key)) {
              // actual is missing a key which is present in expected
              return false;
            }
            if (expected[key] instanceof Matcher) {
              if (!(expected[key] as Matcher<unknown>).matches(actual[key])) {
                return false;
              }
            } else if (expected[key] instanceof Array && actual[key] instanceof Array) {
              const expectedArray = expected[key] as unknown[];
              const actualArray = actual[key] as unknown[];
              // CAREFUL:  This code assumes object properties of type Array are Deno.KvKeys or Deno.KvKey[]
              if ((expectedArray)[0] && (expectedArray)[0] instanceof Array) {
                // expectedArray is an array of arrays, likely signifying a Deno.KvKey[]
                const expectedKeyMatchers = expectedArray as Array<KvKeyMatcher>;
                if (expectedKeyMatchers.length === actual.length) {
                  const keyMatchers: Matcher<Deno.KvKey>[] = [];
                  expectedKeyMatchers.forEach((key) => {
                    keyMatchers.push(getKeyMatcher(key));
                  });
                  if (!new MultiKeyMatcher(keyMatchers).matches(actual[key] as Deno.KvKey[])) {
                    return false;
                  }
                } else {
                  return false;
                }
              } else if (isKvKeyPartArray(actual[key])) {
                // actual array is a Deno.KvKey (array of Deno.KvKeyParts)
                if (!keyPartMatcher(expected[key] as Matcher<Deno.KvKeyPart>[]).matches(actual[key] as Deno.KvKey)) {
                  return false;
                }
              } else {
                return false;
              }
            } else {
              if (!equal(expected[key], actual[key])) {
                return false;
              }
            }
          }
          return true;
        }
      }
      // different number of keys
      return false;
    }
  }();
}

function isKvKeyPartArray(key: unknown): key is Deno.KvKey {
  if (!Array.isArray(key)) {
    return false;
  }
  
  return key.every(
    (item): item is Deno.KvKeyPart => typeof item === 'string' || typeof item === 'number' || typeof item === 'bigint' || typeof item === 'boolean' || item instanceof Uint8Array
  );
}

export class MultiKeyMatcher extends Matcher<Deno.KvKey[]> {
  constructor(private keyMatchers: Matcher<Deno.KvKey>[]) {
    super();
  }

  matches(inputKeys?: Deno.KvKey[]): boolean {
    if (inputKeys && inputKeys.length == this.keyMatchers.length) {
      for (let i = 0; i < this.keyMatchers.length; i++) {
        const matcher = this.keyMatchers[i];
        const key = inputKeys[i];
        if (!matcher.matches(key)) {
          return false;
        }
      }
      return true;
    }
    return false;
  }
}

export function getArray<T>(map: Map<string, T[]>, key: string): T[] {
  let value = map.get(key);
  if (!value) {
    value = [];
    map.set(key, value);
  }
  return value;
}

type MockIterator<T> = InstanceType<typeof Deno.KvListIterator<T>>;

export class MockKvListIterator<T> implements MockIterator<T> {
  private _cursor = "";
  private index = -1;

  constructor(
    private entries: Deno.KvEntry<T>[],
    private mockCursor: string | string[],
  ) {
    if (mockCursor instanceof Array && mockCursor.length != entries.length) {
      throw new Error(
        "When supplying a mock cursor array, it must have the same length as the entries array.",
      );
    }
  }

  get cursor(): string {
    if (this.index === -1) {
      throw new Error("Cannot get cursor before first iteration");
    }
    return this._cursor;
  }

  async next(): Promise<IteratorResult<Deno.KvEntry<T>, undefined>> {
    if (this.index === -1) {
      this.index = 0;
    }

    if (this.index >= this.entries.length) {
      return { value: undefined, done: true };
    }

    const entry = this.entries[this.index++];
    this._cursor = typeof this.mockCursor === "string"
      ? this.mockCursor
      : this.mockCursor[this.index - 1];

    return { done: false, value: entry };
  }

  [Symbol.asyncIterator](): AsyncIterableIterator<Deno.KvEntry<T>> {
    return this;
  }
}
