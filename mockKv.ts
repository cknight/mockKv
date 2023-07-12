import { Expectations } from "./whenKv.ts";
import { KvFunctionNames } from "./types.ts";
import { Assertions, Interaction } from "./assertKv.ts";
import { getArray } from "./util.ts";

let existingPrototype: Deno.Kv | null = null;

export function mockKv() {
  if (!existingPrototype) {
    existingPrototype = Deno.Kv.prototype;
  }

  const mockedKv = new MockedKv();
  Deno.Kv.prototype.get = mockedKv.get.bind(mockedKv);
  //@ts-ignore - Strange type mapping issues for getMany
  Deno.Kv.prototype.getMany = mockedKv.getMany.bind(mockedKv);
  Deno.Kv.prototype.set = mockedKv.set.bind(mockedKv);

  return { whenKv: mockedKv.whenKv, assertKv: mockedKv.assertions };
}

export function restoreKv() {
  if (existingPrototype) {
    Deno.Kv.prototype = existingPrototype;
  }
}

class MockedKv {
  private calls = new Map<KvFunctionNames, Interaction[]>();
  whenKv = new Expectations();
  assertions = new Assertions(this.calls);

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

  getMany<T extends readonly unknown[]>(
    keys: readonly [...{ [K in keyof T]: Deno.KvKey }],
    options?: { consistency?: Deno.KvConsistencyLevel },
  ): Promise<{ [K in keyof T]: Deno.KvEntryMaybe<T[K]> }> {
    const interaction = options
      ? new Interaction([keys, options])
      : new Interaction([keys]);
    this.addInteraction("getMany", interaction);

    const expectations = this.whenKv.expectationsForGetMany();
    const matchingExpectation = expectations.find((expectation) => {
      const [keyMatcher, consistencyMatcher] = expectation.argMatchers;
      return keyMatcher.matches(keys) &&
        consistencyMatcher.matches(options?.consistency);
    });
    if (matchingExpectation) {
      return Promise.resolve(
        matchingExpectation.thenable.next() as {
          [K in keyof T]: Deno.KvEntryMaybe<T[K]>;
        },
      );
    }

    const defaultValues: Deno.KvEntryMaybe<unknown>[] = [];
    keys.forEach((key) => {
      defaultValues.push({ key, value: null, versionstamp: null });
    });
    //return default value
    return Promise.resolve(
      defaultValues as { [K in keyof T]: Deno.KvEntryMaybe<T[K]> },
    );
  }

  set(key: Deno.KvKey, value: unknown): Promise<Deno.KvCommitResult> {
    const interaction = new Interaction([key, value]);
    this.addInteraction("set", interaction);

    const expectations = this.whenKv.expectationsForSet();
    const matchingExpectation = expectations.find((expectation) => {
      const [keyMatcher, valueMatcher] = expectation.argMatchers;
      return keyMatcher.matches(key) && valueMatcher.matches(value);
    });

    if (matchingExpectation) {
      return Promise.resolve(
        matchingExpectation.thenable.next() as Deno.KvCommitResult,
      );
    }

    //return a default value
    return Promise.resolve({ ok: true, versionstamp: "00000000000000010000"});
  }

  private addInteraction(fn: KvFunctionNames, interaction: Interaction) {
    getArray<Interaction>(this.calls, fn).push(interaction);
  }
}

// This style can't work because it doesn't know if there is a continuing chain, so never() can't be called and easy
// to make mistakes by forgetting the chain
// assertKv.get(["my key"]);  //validates called once, no-op or throws.  Doesn't know if there is a continuing chain, so should it validate or pass-through? Won't work :(
// assertKv.get(["my key"]).once();  //get passes matches through, then counts and no-ops/throws
// assertKv.get(["my key"]).never();
// assertKv.noMoreInteractions();
// cons: easy to forget to call once() or never() which could cause the test to pass when it shouldn't
// cons: not using the assert syntax

// better, as get(anyKey()) won't return a boolean but an ongoing verification?
// INVALID assert(mockKv.get(anyKey())
// assert(calledKv.get(anyKey()).once());
// assert(calledKv.get(anyKey()).atLeastOnce());
// assert(calledKv.get(anyKey()).times(3));
// assert(calledKv.get(anyKey()).never());
// assert(calledKv.noMoreInteractions());
// pros:  Uses assert syntax, forces explicit interaction count
// cons:  Meh, it's ok, but not exciting.  Forces exposure of mockKv?  We could rename and interface it...
// cons:  Assert takes a truthy value, so we'd have to return a boolean from get()

// verify takes ongoingstub or boolean?  If ongoing stub then call once() on it?
// verify(calledKv.get(anyKey())
// verify(calledKv.get(anyKey()).once());
// verify(calledKv.get(anyKey()).times(3));
// verify(calledKv.get(anyKey()).never());
// verify(calledKv.noMoreInteractions());
// pros: matches Mockito syntax, less verbose for single matches
// cons: doesn't match standardized assert syntax, forces exposure of mockKv?  We could rename and interface it...

// assert(calledKv.get(anyKey()));  // get with no chain defaults to once()
// assert(calledKv.once().get(anyKey()));
// assert(calledKv.times(3).get(anyKey()));
// assert(calledKv.atMost(2).get(anyKey()));
// assert(calledKv.never().get(anyKey()));
// assert(calledKv.noMoreInteractions());
