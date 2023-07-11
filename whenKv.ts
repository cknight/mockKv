import { Matcher, eq } from "./matchers.ts";
import { KvFunctionNames } from "./types.ts";
import { getArray, keyPartMatcher } from "./util.ts";

class Expectation<T> {
  constructor(
    public readonly argMatchers: Matcher<unknown>[],
    public readonly thenable: ResultsGenerator<T>,
  ) {}
}

type ExpectationTypes = Deno.KvEntryMaybe<unknown>;

interface Thenable<T> {
  thenReturn(...results: T[]): Thenable<T>;
  thenThrow(...errors: Error[]): Thenable<T>;
}

class Throwable {
  constructor(private error: Error) {}

  getError() {
    return this.error;
  }
}

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

export class Expectations {
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
