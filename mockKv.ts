import { equal } from "./deps.ts";
import { Matcher, eq } from "./matchers.ts";

let existingPrototype: Deno.Kv|null = null;

class Expectation<T> {
  constructor(public readonly argMatchers: Matcher<unknown>[], public readonly thenable:ResultsGenerator<T>) {}
}

class Throwable {
  constructor(private error: Error){}
  
  getError() {
    return this.error;
  }
}

type ExpectationTypes = Deno.KvEntryMaybe<unknown>;

class ResultsGenerator<T> implements Thenable<T>{
  private results: (T|Throwable)[] = [];

  public thenReturn(...results: T[]): this {
    this.results.push(...results);
    return this;
  }

  public thenThrow(...errors: Error[]): this {
    errors.forEach(error => this.results.push(new Throwable(error)));
    return this;
  }

  public next(): T | undefined {
    let result: T | Throwable;
    if (this.results.length > 0) {
      result = this.results.length == 1 ? this.results[0] : this.results.shift()!;

      if (result instanceof Throwable) {
        throw result.getError();
      }

      return result;
    }
    return undefined;
  }
}

export function mockKv() {
  if (!existingPrototype) {
    existingPrototype = Deno.Kv.prototype;
  }
    
  const mockedKv = new MockedKv();
  Deno.Kv.prototype.get = mockedKv.get.bind(mockedKv);
  const whenKv = mockedKv.whenKv;

  return {whenKv};
}

export function restoreKv() {
  if (existingPrototype) {
    Deno.Kv.prototype = existingPrototype;
  }
}

class MockedKv {
  public whenKv = new Expectations();

  get<T = unknown>(
    key: Deno.KvKey,
    options?: { consistency?: Deno.KvConsistencyLevel },
  ): Promise<Deno.KvEntryMaybe<T>> {
    const expectations = this.whenKv.expectationsForGet();
    const matchingExpectation = expectations.find(expectation => {
      const [keyMatcher, consistencyMatcher] = expectation.argMatchers;
      return keyMatcher.matches(key) && consistencyMatcher.matches(options?.consistency);
    });
    if (matchingExpectation) {
      return Promise.resolve(matchingExpectation.thenable.next() as Deno.KvEntryMaybe<T>);
    }

    //return default value
    return Promise.resolve({ key, value: null, versionstamp: null});
  }
}

class Expectations {
  //map of function name to map of arguments to return value
  private expectations: Map<string, Expectation<ExpectationTypes>[]> = new Map();

  public expectationsForGet(): Expectation<Deno.KvEntryMaybe<unknown>>[] {
    return this.expectations.get("get") || [];
  }

  public get<T=unknown>(key: Deno.KvKey | Matcher<Deno.KvKey> | (Deno.KvKeyPart | Matcher<Deno.KvKeyPart>)[], 
      options?: { consistency?: Deno.KvConsistencyLevel | Matcher<Deno.KvConsistencyLevel> }): Thenable<Deno.KvEntryMaybe<T>> {
    const keyMatcher = key instanceof Matcher ? key : (key instanceof Array) ? keyPartMatcher(key as Matcher<Deno.KvKeyPart>[]) : eq(key);
    const consistencyMatcher = (options?.consistency && options?.consistency instanceof Matcher) ? options.consistency : eq(options?.consistency);
    let getExpectations = this.expectations.get("get");
    if (!getExpectations) {
      getExpectations = [];
      this.expectations.set("get", getExpectations);
    }
    const thenable = new ResultsGenerator<Deno.KvEntryMaybe<T>>();

    getExpectations.push(new Expectation([keyMatcher, consistencyMatcher], thenable));

    return thenable;
  }
}

interface Thenable<T> {
  thenReturn(...results: T[]): Thenable<T>;
  thenThrow(...errors: Error[]): Thenable<T>;
}


function keyPartMatcher(matchers: (Deno.KvKeyPart | Matcher<Deno.KvKeyPart>)[]): Matcher<Deno.KvKey> {
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
  };
}



// whenKv.get(anyKey()).thenReturn(...).thenThrow(...).thenReturn(...);
// whenKv.get(anyKey()).thenReturn(KvEntryMaybe, KvEntryMaybe, KvEntryMaybe);

// whenKv.get(anyUint8array(), anyString(), anyNumber(), anyBigInt(), anyBoolean())
// whenKv.get(myCustomerMatcher())
// whenKv.get([eq("my key")])

// assertKv.get(["my key"]);
// assertKv.times(1).get(["my key"]);
// assertKv.atMostOnce().get(["my key"]);
// assertKv.atMost(2).get(["my key"]);
// assertKv.atLeastOnce().get(["my key"]);
// assertKv.atLeast(2).get(["my key"]);
// assertKv.never().get(["my key"]);
