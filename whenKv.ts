import { eq } from "./matchers.ts";
import {
  KvEnqueueOptionsMatcher,
  KvFunctionNames,
  KvKeyMatcher,
  KvListOptionsMatcher,
  KvListSelectorMatcher,
  Matcher,
} from "./types.ts";
import {
  getArray,
  getKeyMatcher,
  matchesListSelector,
  matchesObject,
  MultiKeyMatcher,
} from "./util.ts";

class Expectation<T> {
  constructor(
    public readonly argMatchers: Matcher<unknown>[],
    public readonly thenable: ResultsGenerator<T>,
  ) {}
}

type ExpectationTypes =
  | Deno.KvEntryMaybe<unknown>
  | Deno.KvEntryMaybe<
    unknown
  >[]
  | Deno.KvCommitResult
  | Deno.KvListIterator<unknown>
  | undefined;

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

  thenReturn(...results: T[]): this {
    if (results.length == 0) {
      this.results.push(undefined as unknown as T);
    }
    this.results.push(...results);
    return this;
  }

  thenThrow(...errors: Error[]): this {
    errors.forEach((error) => this.results.push(new Throwable(error)));
    return this;
  }

  getResults(): (T | Throwable)[] {
    return this.results;
  }

  next(): T | undefined {
    let result: T | Throwable;
    if (this.results.length > 0) {
      result = this.results.length == 1
        ? this.results[0]
        : this.results.shift()!;

      if (result instanceof Throwable) {
        Error.captureStackTrace(result.getError());
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

  expectationsFor(functionName: KvFunctionNames) {
    return this.expectations.get(functionName) || [];
  }

  get(
    key: KvKeyMatcher,
    options?: {
      consistency?: Deno.KvConsistencyLevel | Matcher<Deno.KvConsistencyLevel>;
    },
  ): Thenable<Deno.KvEntryMaybe<unknown>> {
    const keyMatcher = getKeyMatcher(key);
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
    keys: KvKeyMatcher[] | Matcher<Deno.KvKey[]>,
    options?: {
      consistency?: Deno.KvConsistencyLevel | Matcher<Deno.KvConsistencyLevel>;
    },
  ): Thenable<Deno.KvEntry<unknown>[]> {
    let keyMatcher: Matcher<Deno.KvKey[]>;
    if (keys instanceof Matcher) {
      keyMatcher = keys;
    } else {
      const keyMatchers: Matcher<Deno.KvKey>[] = [];
      keys.forEach((key) => {
        keyMatchers.push(getKeyMatcher(key));
      });
      keyMatcher = new MultiKeyMatcher(keyMatchers);
    }
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
        [keyMatcher, consistencyMatcher],
        thenable,
      ),
    );

    return thenable;
  }

  set(
    key: KvKeyMatcher,
    value: unknown | Matcher<unknown>,
  ): Thenable<Deno.KvCommitResult> {
    const keyMatcher = getKeyMatcher(key);

    const valueMatcher = value instanceof Matcher ? value : eq(value);

    const getExpectations = getArray<Expectation<ExpectationTypes>>(
      this.expectations,
      "set",
    );
    const thenable = new ResultsGenerator<Deno.KvCommitResult>();
    getExpectations.push(
      new Expectation([keyMatcher, valueMatcher], thenable),
    );

    return thenable;
  }

  delete(
    key: KvKeyMatcher,
  ): Thenable<undefined> {
    const keyMatcher = getKeyMatcher(key);
    const getExpectations = getArray<Expectation<ExpectationTypes>>(
      this.expectations,
      "delete",
    );
    const thenable = new ResultsGenerator<undefined>();
    getExpectations.push(
      new Expectation([keyMatcher], thenable),
    );

    return thenable;
  }

  list<T = unknown>(
    selector: KvListSelectorMatcher | Matcher<Deno.KvListSelector>,
    options?: KvListOptionsMatcher | Matcher<Deno.KvListOptions>,
  ): Thenable<Deno.KvListIterator<T>> {
    const listSelectorMatcher = selector instanceof Matcher
      ? selector
      : matchesListSelector(selector);
    const consistencyMatcher = options
      ? (options instanceof Matcher ? options : matchesObject(options))
      : eq(undefined);

    const listExpectations = getArray<Expectation<ExpectationTypes>>(
      this.expectations,
      "list",
    );
    const thenable = new ResultsGenerator<Deno.KvListIterator<T>>();

    listExpectations.push(
      new Expectation([listSelectorMatcher, consistencyMatcher], thenable),
    );

    return thenable;
  }

  enqueue(
    value: unknown | Matcher<unknown>,
    options?:
      | KvEnqueueOptionsMatcher
      | Matcher<{ delay?: number; keysIfUndelivered?: Deno.KvKey[] }>,
  ): Thenable<Deno.KvCommitResult> {
    const valueMatcher = value instanceof Matcher ? value : eq(value);
    const processedOptions: _KvEnqueueOptionsMatcher = {};
    if (
      typeof options === "object" && "delay" in options &&
      options.delay !== undefined
    ) {
      processedOptions.delay = options.delay;
    }
    if (
      typeof options === "object" && "keysIfUndelivered" in options &&
      options.keysIfUndelivered !== undefined
    ) {
      let keyMatcher: Matcher<Deno.KvKey[]>;
      if (options.keysIfUndelivered instanceof Matcher) {
        keyMatcher = options.keysIfUndelivered;
      } else {
        const keyMatchers: Matcher<Deno.KvKey>[] = [];
        options.keysIfUndelivered.forEach((key) => {
          keyMatchers.push(getKeyMatcher(key));
        });
        keyMatcher = new MultiKeyMatcher(keyMatchers);
      }

      processedOptions.keysIfUndelivered = keyMatcher;
    }
    const optionsMatcher = options
      ? (options instanceof Matcher ? options : matchesObject(processedOptions))
      : eq(undefined);

    const enqueueExpectations = getArray<Expectation<ExpectationTypes>>(
      this.expectations,
      "enqueue",
    );
    const thenable = new ResultsGenerator<Deno.KvCommitResult>();

    enqueueExpectations.push(
      new Expectation([valueMatcher, optionsMatcher], thenable),
    );

    return thenable;
  }

  listenQueue(
    handler:
      | Matcher<(value: unknown) => Promise<void> | void>
      | ((value: unknown) => Promise<void> | void),
  ): Thenable<undefined> {
    const handlerMatcher = handler instanceof Matcher ? handler : eq(handler);
    const listenExpectations = getArray<Expectation<ExpectationTypes>>(
      this.expectations,
      "listenQueue",
    );
    const thenable = new ResultsGenerator<undefined>();
    listenExpectations.push(
      new Expectation([handlerMatcher], thenable),
    );
    return thenable;
  }
}

type _KvEnqueueOptionsMatcher = {
  delay?: number | Matcher<number>;
  keysIfUndelivered?: Matcher<Deno.KvKey[]>;
};
