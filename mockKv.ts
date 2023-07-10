import { AssertionError } from "https://deno.land/std@0.193.0/testing/asserts.ts";
import { equal } from "./deps.ts";
import { eq, Matcher } from "./matchers.ts";

let existingPrototype: Deno.Kv | null = null;

type FunctionNames<T> = {
  // deno-lint-ignore no-explicit-any
  [K in keyof T]: T[K] extends (...args: any[]) => any ? K : never;
}[keyof T];

type KvFunctionNames = FunctionNames<Deno.Kv>;

class Expectation<T> {
  constructor(
    public readonly argMatchers: Matcher<unknown>[],
    public readonly thenable: ResultsGenerator<T>,
  ) {}
}

class Interaction {
  verified = false;
  constructor(public readonly args: unknown[]) {}
}

class Throwable {
  constructor(private error: Error) {}

  getError() {
    return this.error;
  }
}

type ExpectationTypes = Deno.KvEntryMaybe<unknown>;

class ResultsGenerator<T> implements Thenable<T> {
  private results: (T | Throwable)[] = [];

  public thenReturn(...results: T[]): this {
    this.results.push(...results);
    return this;
  }

  public thenThrow(...errors: Error[]): this {
    errors.forEach((error) => this.results.push(new Throwable(error)));
    return this;
  }

  public next(): T | undefined {
    let result: T | Throwable;
    if (this.results.length > 0) {
      result = this.results.length == 1
        ? this.results[0]
        : this.results.shift()!;

      if (result instanceof Throwable) {
        throw result.getError();
      }

      return result;
    }
    return undefined;
  }
}

class OnGoingAssertion {
  constructor(
    private readonly interactions: Interaction[],
    private readonly id: number,
    private readonly ongoingAssertions: Map<number, KvFunctionNames>,
  ) {}

  once(): void {
    this.ongoingAssertions.delete(this.id);
    if (this.interactions.length !== 1) {
      throw new AssertionError(
        "Expected to be called once but was called " +
          this.interactions.length + " times",
      );
    }
  }

  times(n: number): void {
    this.ongoingAssertions.delete(this.id);
    if (this.interactions.length !== n) {
      throw new AssertionError(
        "Expected to be called " + n + " times but was called " +
          this.interactions.length + " times",
      );
    }
  }

  never(): void {
    this.ongoingAssertions.delete(this.id);
    if (this.interactions.length !== 0) {
      throw new AssertionError(
        "Expected to never be called but was called " +
          this.interactions.length + " times",
      );
    }
  }

  atLeast(n: number): void {
    this.ongoingAssertions.delete(this.id);
    if (this.interactions.length < n) {
      throw new AssertionError(
        "Expected to be called at least " + n + " times but was only called " +
          this.interactions.length + " times",
      );
    }
  }

  atMost(n: number): void {
    this.ongoingAssertions.delete(this.id);
    if (this.interactions.length > n) {
      throw new AssertionError(
        "Expected to be called at most " + n + " times but was called " +
          this.interactions.length + " times",
      );
    }
  }
}

export function mockKv() {
  if (!existingPrototype) {
    existingPrototype = Deno.Kv.prototype;
  }

  const mockedKv = new MockedKv();
  Deno.Kv.prototype.get = mockedKv.get.bind(mockedKv);

  return { whenKv: mockedKv.whenKv, assertKv: mockedKv.assertions };
}

export function restoreKv() {
  if (existingPrototype) {
    Deno.Kv.prototype = existingPrototype;
  }
}

class MockedKv {
  public whenKv = new Expectations();
  private calls = new Map<KvFunctionNames, Interaction[]>();
  public assertions = new Assertions(this.calls);

  get<T = unknown>(
    key: Deno.KvKey,
    options?: { consistency?: Deno.KvConsistencyLevel },
  ): Promise<Deno.KvEntryMaybe<T>> {
    const interaction = options
      ? new Interaction([key, options])
      : new Interaction([key]);
    this.addInteraction("get", interaction);

    const expectations = this.whenKv.expectationsForGet();
    const matchingExpectation = expectations.find((expectation) => {
      const [keyMatcher, consistencyMatcher] = expectation.argMatchers;
      return keyMatcher.matches(key) &&
        consistencyMatcher.matches(options?.consistency);
    });
    if (matchingExpectation) {
      return Promise.resolve(
        matchingExpectation.thenable.next() as Deno.KvEntryMaybe<T>,
      );
    }

    //return default value
    return Promise.resolve({ key, value: null, versionstamp: null });
  }

  private addInteraction(fn: KvFunctionNames, interaction: Interaction) {
    getArray<Interaction>(this.calls, fn).push(interaction);
  }
}

class Expectations {
  //map of function name to map of arguments to return value
  private expectations: Map<KvFunctionNames, Expectation<ExpectationTypes>[]> =
    new Map();

  public expectationsForGet(): Expectation<Deno.KvEntryMaybe<unknown>>[] {
    return this.expectations.get("get") || [];
  }

  public get<T = unknown>(
    key:
      | Deno.KvKey
      | Matcher<Deno.KvKey>
      | (Deno.KvKeyPart | Matcher<Deno.KvKeyPart>)[],
    options?: {
      consistency?: Deno.KvConsistencyLevel | Matcher<Deno.KvConsistencyLevel>;
    },
  ): Thenable<Deno.KvEntryMaybe<T>> {
    const keyMatcher = key instanceof Matcher
      ? key
      : (key instanceof Array)
      ? keyPartMatcher(key as Matcher<Deno.KvKeyPart>[])
      : eq(key);
    const consistencyMatcher =
      (options?.consistency && options?.consistency instanceof Matcher)
        ? options.consistency
        : eq(options?.consistency);
    const getExpectations = getArray<Expectation<ExpectationTypes>>(
      this.expectations,
      "get",
    );
    const thenable = new ResultsGenerator<Deno.KvEntryMaybe<T>>();

    getExpectations.push(
      new Expectation([keyMatcher, consistencyMatcher], thenable),
    );

    return thenable;
  }
}

class Assertions {
  constructor(private calls: Map<KvFunctionNames, Interaction[]>) {
    addEventListener("unload", () => {
      if (this.ongoingAssertions.size > 0) {
        const firstKey = this.ongoingAssertions.values().next().value;
        throw new Error(
          "There are ongoing KV assertions which were started but not completed. Did you forget to call, e.g. once(), on assertKv." +
            firstKey + "(...)?  The correct format is assertKv." + firstKey + "(...).once()",
        );
      }
    });
  }
  private ongoingAssertions = new Map<number, KvFunctionNames>();
  private nextId = 0;

  public get(
    key:
      | Deno.KvKey
      | Matcher<Deno.KvKey>
      | (Deno.KvKeyPart | Matcher<Deno.KvKeyPart>)[],
    options?: {
      consistency?: Deno.KvConsistencyLevel | Matcher<Deno.KvConsistencyLevel>;
    },
  ): OnGoingAssertion {
    const keyMatcher = key instanceof Matcher
      ? key
      : (key instanceof Array)
      ? keyPartMatcher(key as Matcher<Deno.KvKeyPart>[])
      : eq(key);
    const consistencyMatcher =
      (options?.consistency && options?.consistency instanceof Matcher)
        ? options.consistency
        : eq(options?.consistency);
    const interactions = getArray<Interaction>(this.calls, "get");
    const matchingInteractions = interactions.filter((interaction) => {
      return keyMatcher.matches(interaction.args[0] as Deno.KvKey) &&
        (interaction.args[1] === undefined ||
          consistencyMatcher.matches(
            (interaction.args[1] as { consistency?: Deno.KvConsistencyLevel })
              .consistency,
          ));
    });
    matchingInteractions.forEach((interaction) => {
      interaction.verified = true;
    });

    this.ongoingAssertions.set(this.nextId, "get");
    return new OnGoingAssertion(
      matchingInteractions,
      this.nextId++,
      this.ongoingAssertions,
    );
  }

  public noMoreInteractions(): void {
    //combine all calls values into one array

    pick up here:  need to loop over keys, and for each key store array of kv calls

    const allInteractions = Array.from(this.calls.values()).reduce(
      (acc, val) => acc.concat(val),
      [],
    );
    const unverifiedInteractions = allInteractions.filter(
      (interaction) => !interaction.verified,
    );
    if (unverifiedInteractions.length !== 0) {
      throw new Error(
        "There are unverified interactions: " +
          unverifiedInteractions.map((interaction) => JSON.stringify(interaction.args)),
      );
    }
  }
}

function getArray<T>(map: Map<string, T[]>, key: string): T[] {
  let value = map.get(key);
  if (!value) {
    value = [];
    map.set(key, value);
  }
  return value;
}

interface Thenable<T> {
  thenReturn(...results: T[]): Thenable<T>;
  thenThrow(...errors: Error[]): Thenable<T>;
}

function keyPartMatcher(
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

// This style can't work because it doesn't know if there is a continuing chain, so never() can't be called and easy
// to make mistakes by forgetting the chain
// assertKv.get(["my key"]);  //validates called once, no-op or throws.  Doesn't know if there is a continuing chain, so should it validate or pass-through? Won't work :(
// assertKv.get(["my key"]).once();  //get passes matches through, then counts and no-ops/throws
// assertKv.get(["my key"]).never();
// assertKv.noMoreInteractions();

// assert(mockKv).verify(mockKv.get(anyKey()).atLeastOnce());

// better, as get(anyKey()) won't return a boolean but an ongoing verification?
// INVALID assert(mockKv.get(anyKey())
// assert(calledKv.get(anyKey()).once());
// assert(calledKv.get(anyKey()).atLeastOnce());
// assert(calledKv.get(anyKey()).times(3));
// assert(calledKv.get(anyKey()).never());
// assert(calledKv.noMoreInteractions());
// pros:  Uses assert syntax, forces explicit interaction count
// cons:  Meh, it's ok, but not exciting.  Forces exposure of mockKv?  We could rename and interface it...

// verify takes ongoingstub or boolean?  If ongoing stub then call once() on it?
// verify(calledKv.get(anyKey())
// verify(calledKv.get(anyKey()).once());
// verify(calledKv.get(anyKey()).times(3));
// verify(calledKv.get(anyKey()).never());
// verify(calledKv.noMoreInteractions());
// pros: matches Mockito syntax, less verbose for single matches
// cons: doesn't match standardized assert syntax, forces exposure of mockKv?  We could rename and interface it...
