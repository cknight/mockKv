import { eq, Matcher } from "./matchers.ts";
import { KvFunctionNames } from "./types.ts";
import { getArray, keyPartMatcher, MultiKeyMatcher } from "./util.ts";

class Expectation<T> {
  constructor(
    public readonly argMatchers: Matcher<unknown>[],
    public readonly thenable: ResultsGenerator<T>,
  ) {}
}

type ExpectationTypes = Deno.KvEntryMaybe<unknown> | Deno.KvEntryMaybe<
  unknown
>[] | Deno.KvCommitResult;

interface Thenable<T> {
  thenReturn(...results: T[]): Thenable<T>;
  thenThrow(...errors: Error[]): Thenable<T>;
}

type ThenableThrow<T = void> = Pick<Thenable<T>, "thenThrow">;

class Throwable {
  constructor(private error: Error) {}

  getError() {
    return this.error;
  }
}

class ResultsGenerator<T> implements Thenable<T> {
  private results: (T | Throwable)[] = [];

  thenReturn(...results: T[]): this {
    this.results.push(...results);
    return this;
  }

  thenThrow(...errors: Error[]): this {
    errors.forEach((error) => this.results.push(new Throwable(error)));
    return this;
  }

  next(): T | undefined {
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

export class Expectations {
  //map of function name to map of arguments to return value
  private expectations: Map<KvFunctionNames, Expectation<ExpectationTypes>[]> =
    new Map();

  expectationsForGet(): Expectation<Deno.KvEntryMaybe<unknown>>[] {
    return (this.expectations.get("get") || []) as Expectation<
      Deno.KvEntryMaybe<unknown>
    >[];
  }

  expectationsForGetMany(): Expectation<Deno.KvEntryMaybe<unknown>[]>[] {
    return (this.expectations.get("getMany") || []) as Expectation<
      Deno.KvEntryMaybe<unknown>[]
    >[];
  }

  expectationsForSet(): Expectation<Deno.KvCommitResult>[] {
    return (this.expectations.get("set") || []) as Expectation<
      Deno.KvCommitResult
    >[];
  }

  get(
    key:
      | Deno.KvKey
      | Matcher<Deno.KvKey>
      | (Deno.KvKeyPart | Matcher<Deno.KvKeyPart>)[],
    options?: {
      consistency?: Deno.KvConsistencyLevel | Matcher<Deno.KvConsistencyLevel>;
    },
  ): Thenable<Deno.KvEntryMaybe<unknown>> {
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
    const thenable = new ResultsGenerator<Deno.KvEntryMaybe<unknown>>();

    getExpectations.push(
      new Expectation([keyMatcher, consistencyMatcher], thenable),
    );

    return thenable;
  }

  getMany(
    keys: (
      | Deno.KvKey
      | Matcher<Deno.KvKey>
      | (Deno.KvKeyPart | Matcher<Deno.KvKeyPart>)[]
    )[],
    options?: {
      consistency?: Deno.KvConsistencyLevel | Matcher<Deno.KvConsistencyLevel>;
    },
  ): Thenable<Deno.KvEntry<unknown>[]> {
    const keyMatchers: Matcher<Deno.KvKey>[] = [];
    keys.forEach((key) => {
      if (key instanceof Matcher) {
        keyMatchers.push(key);
      } else if (key instanceof Array) {
        keyMatchers.push(keyPartMatcher(key as Matcher<Deno.KvKeyPart>[]));
      } else {
        keyMatchers.push(eq(key));
      }
    });
    const consistencyMatcher =
      (options?.consistency && options?.consistency instanceof Matcher)
        ? options.consistency
        : eq(options?.consistency);
    const thenable = new ResultsGenerator<Deno.KvEntry<unknown>[]>();

    const getExpectations = getArray<Expectation<ExpectationTypes>>(
      this.expectations,
      "getMany",
    );

    getExpectations.push(
      new Expectation(
        [new MultiKeyMatcher(keyMatchers), consistencyMatcher],
        thenable,
      ),
    );

    return thenable;
  }

  set(
    key:
      | Deno.KvKey
      | Matcher<Deno.KvKey>
      | (Deno.KvKeyPart | Matcher<Deno.KvKeyPart>)[],
    value: unknown | Matcher<unknown>,
  ): Thenable<Deno.KvCommitResult> {
    const keyMatcher = key instanceof Matcher
      ? key
      : (key instanceof Array)
      ? keyPartMatcher(key as Matcher<Deno.KvKeyPart>[])
      : eq(key);

    const valueMatcher = value instanceof Matcher ? value : eq(value);

    const getExpectations = getArray<Expectation<ExpectationTypes>>(
      this.expectations,
      "set",
    );
    const thenable = new ResultsGenerator<never>();

    getExpectations.push(
      new Expectation([keyMatcher, valueMatcher], thenable),
    );

    return thenable;
  }
}
