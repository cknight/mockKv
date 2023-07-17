import { equal } from "./deps.ts";
import { eq } from "./matchers.ts";
import {
  KvKeyMatcher,
  KvListOptionsMatcher,
  KvListSelectorMatcher,
  Matcher,
} from "./types.ts";

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

interface Test {
  limit?: number;
}

export function matchesListSelector(
  expected: KvListSelectorMatcher | Matcher<Deno.KvListSelector>,
) {
  return new class extends Matcher<Deno.KvListSelector> {
    matches(actual?: Deno.KvListSelector): boolean {
      if (actual) {
        //check number of actual properties matches expected
        if (Object.keys(expected).length !== Object.keys(actual).length) {
          return false;
        } else if (expected instanceof Matcher) {
          return expected.matches(actual);
        } else {
          const expectedMatcher = expected as KvListSelectorMatcher;
          if ("prefix" in expectedMatcher) {
            if (
              !("prefix" in actual) ||
              !getKeyMatcher(expectedMatcher.prefix).matches(actual.prefix)
            ) {
              return false;
            }
          }
          if ("start" in expectedMatcher) {
            if (
              !("start" in actual) ||
              !getKeyMatcher(expectedMatcher.start).matches(actual.start)
            ) {
              return false;
            }
          }
          if ("end" in expectedMatcher) {
            if (
              !("end" in actual) ||
              !getKeyMatcher(expectedMatcher.end).matches(actual.end)
            ) {
              return false;
            }
          }
        }
        return true;
      }
      return false;
    }
  }();
}

/**
 * Match an arbitrary object.  The actual object must exist and have the same number of properties.
 * Values of the expected objected can be exact values (compared using deep object comparison) or
 * a matcher.
 *
 * @param expected, an object of key/value pairs or a matcher
 * @returns a matcher which accepts an actual object, which will return true if the actual object
 * meets the definition of matching
 */
export function matchesObject(
  expected: { [key: string]: unknown } | Matcher<unknown> | undefined,
) {
  return new class extends Matcher<Deno.KvListOptions> {
    matches(actual?: { [key: string]: unknown }): boolean {
      if ((expected === undefined && actual !== undefined) || (expected !== undefined && actual === undefined)) {
        return false;
      } else if (expected === undefined && actual === undefined) {
        return true;
      } else if (expected !== undefined && actual !== undefined) {
        //check number of actual properties matches expected
        if (Object.keys(expected).length !== Object.keys(actual).length) {
          return false;
        } else if (expected instanceof Matcher) {
          return expected.matches(actual);
        } else {
          let objectsMatch = true;
          Object.keys(expected).forEach((key) => {
            if (!(key in actual)) {
              objectsMatch = false;
              return;
            } else if (expected[key] instanceof Matcher) {
              if (!(expected[key] as Matcher<unknown>).matches(actual[key])) {
                objectsMatch = false;
                return;
              }
            } else if (!equal(expected[key], actual[key])) {
              objectsMatch = false;
              return;
            }
          });
          return objectsMatch;
        }
      }
      throw new Error("Design error, this should be unreachable");
    }
  }();
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
