import { AssertionError } from "./deps.ts";
import { eq } from "./matchers.ts";
import {
KvEnqueueOptionsMatcher,
  KvFunctionNames,
  KvListOptionsMatcher,
  KvListSelectorMatcher,
  Matcher,
} from "./types.ts";
import {
  getArray,
  keyPartMatcher,
  matchesListSelector,
  matchesObject,
  MultiKeyMatcher,
} from "./util.ts";

export class Interaction {
  verified = false;
  constructor(public readonly args: unknown[]) {}
}

type KvFunctions = Pick<
  Assertions,
  "get" | "getMany" | "set" | "list" | "close"
>;

export class Assertions {
  constructor(private allInteractions: Map<KvFunctionNames, Interaction[]>) {}
  private verifyNumber = 1;

  get(
    key:
      | Deno.KvKey
      | Matcher<Deno.KvKey>
      | (Deno.KvKeyPart | Matcher<Deno.KvKeyPart>)[],
    options?: {
      consistency?: Deno.KvConsistencyLevel | Matcher<Deno.KvConsistencyLevel>;
    },
  ): boolean {
    const keyMatcher = key instanceof Matcher
      ? key
      : (key instanceof Array)
      ? keyPartMatcher(key as Matcher<Deno.KvKeyPart>[])
      : eq(key);
    const consistencyMatcher =
      (options?.consistency && options?.consistency instanceof Matcher)
        ? options.consistency
        : eq(options?.consistency);
    const interactions = getArray<Interaction>(this.allInteractions, "get");
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

    return this.verification(matchingInteractions);
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
  ): boolean {
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
    const multiKeyMatcher = new MultiKeyMatcher(keyMatchers);
    const consistencyMatcher =
      (options?.consistency && options?.consistency instanceof Matcher)
        ? options.consistency
        : eq(options?.consistency);

    const interactions = getArray<Interaction>(this.allInteractions, "getMany");

    const matchingInteractions = interactions.filter((interaction) => {
      return multiKeyMatcher.matches(interaction.args[0] as Deno.KvKey[]) &&
        (interaction.args[1] === undefined ||
          consistencyMatcher.matches(
            (interaction.args[1] as { consistency?: Deno.KvConsistencyLevel })
              .consistency,
          ));
    });
    matchingInteractions.forEach((interaction) => {
      interaction.verified = true;
    });

    return this.verification(matchingInteractions);
  }

  set(
    key:
      | Deno.KvKey
      | Matcher<Deno.KvKey>
      | (Deno.KvKeyPart | Matcher<Deno.KvKeyPart>)[],
    value: unknown,
  ): boolean {
    const keyMatcher = key instanceof Matcher
      ? key
      : (key instanceof Array)
      ? keyPartMatcher(key as Matcher<Deno.KvKeyPart>[])
      : eq(key);
    const valueMatcher = value instanceof Matcher ? value : eq(value);
    const interactions = getArray<Interaction>(this.allInteractions, "set");
    const matchingInteractions = interactions.filter((interaction) => {
      return keyMatcher.matches(interaction.args[0] as Deno.KvKey) &&
        valueMatcher.matches(interaction.args[1]);
    });
    matchingInteractions.forEach((interaction) => {
      interaction.verified = true;
    });

    return this.verification(matchingInteractions);
  }

  list(
    selector: KvListSelectorMatcher | Matcher<Deno.KvListSelector>,
    options?: KvListOptionsMatcher | Matcher<Deno.KvListOptions>,
  ): boolean {
    const listSelectorMatcher = selector instanceof Matcher
      ? selector
      : matchesListSelector(selector);
    const consistencyMatcher: Matcher<Deno.KvListOptions> =
      options instanceof Matcher ? options : matchesObject(options);
    const interactions = getArray<Interaction>(this.allInteractions, "list");
    const matchingInteractions = interactions.filter((interaction) => {
      const actualOptions = interaction
        .args[1] as (Deno.KvListOptions | undefined);
      return listSelectorMatcher.matches(
        interaction.args[0] as Deno.KvListSelector,
      ) &&
        consistencyMatcher.matches(actualOptions);
    });
    matchingInteractions.forEach((interaction) => {
      interaction.verified = true;
    });

    return this.verification(matchingInteractions);
  }

  enqueue(value: unknown | Matcher<unknown>,
    options?:
      | KvEnqueueOptionsMatcher
      | Matcher<{ delay?: number; keysIfUndelivered?: Deno.KvKey[] }>,
  ): boolean {
    const valueMatcher = value instanceof Matcher ? value : eq(value);
    const optionsMatcher = options instanceof Matcher
      ? options
      : matchesObject(options);
    const interactions = getArray<Interaction>(this.allInteractions, "enqueue");
    const matchingInteractions = interactions.filter((interaction) => {
      const actualOptions = interaction
        .args[1] as { delay?: number; keysIfUndelivered?: Deno.KvKey[] };
      return valueMatcher.matches(interaction.args[0]) &&
        optionsMatcher.matches(actualOptions);
    });
    matchingInteractions.forEach((interaction) => {
      interaction.verified = true;
    });

    return this.verification(matchingInteractions);
  }

  close(): boolean {
    const interactions = getArray<Interaction>(this.allInteractions, "close");
    interactions.forEach((interaction) => {
      interaction.verified = true;
    });
    return this.verification(interactions);
  }

  private resetVerification() {
    this.verification = this.verifyAtLeast;
    this.verifyNumber = 1;
  }

  private verifyOnce = (interactions: Interaction[]) => {
    try {
      if (interactions.length !== 1) {
        throw new AssertionError(
          "Expected to be called once but was called " +
            interactions.length + " times",
        );
      }
      return true;
    } finally {
      this.resetVerification();
    }
  };

  private verifyTimes = (interactions: Interaction[]) => {
    try {
      if (interactions.length !== this.verifyNumber) {
        throw new AssertionError(
          "Expected to be called " + this.verifyNumber +
            " times but was called " +
            interactions.length + " times",
        );
      }
      return true;
    } finally {
      this.resetVerification();
    }
  };

  private verifyNever = (interactions: Interaction[]) => {
    try {
      if (interactions.length !== 0) {
        throw new AssertionError(
          "Expected to never be called but was called " +
            interactions.length + " times",
        );
      }
      return true;
    } finally {
      this.resetVerification();
    }
  };

  private verifyAtLeast = (interactions: Interaction[]) => {
    try {
      if (interactions.length < this.verifyNumber) {
        throw new AssertionError(
          "Expected to be called at least " + this.verifyNumber +
            " times but was only called " +
            interactions.length + " times",
        );
      }
      return true;
    } finally {
      this.resetVerification();
    }
  };

  private verifyAtMost = (interactions: Interaction[]) => {
    try {
      if (interactions.length > this.verifyNumber) {
        throw new AssertionError(
          "Expected to be called at most " + this.verifyNumber +
            " times but was called " +
            interactions.length + " times",
        );
      }
      return true;
    } finally {
      this.resetVerification();
    }
  };
  private verification: (interactions: Interaction[]) => boolean =
    this.verifyAtLeast;

  once(): KvFunctions {
    this.verification = this.verifyOnce;
    return this;
  }

  times(n: number): KvFunctions {
    this.verifyNumber = n;
    this.verification = this.verifyTimes;
    return this;
  }

  never(): KvFunctions {
    this.verification = this.verifyNever;
    return this;
  }

  atLeast(n: number): KvFunctions {
    this.verifyNumber = n;
    this.verification = this.verifyAtLeast;
    return this;
  }

  atMost(n: number): KvFunctions {
    this.verifyNumber = n;
    this.verification = this.verifyAtMost;
    return this;
  }

  noMoreInteractions(): boolean {
    const unverifiedInteractions: string[] = [];
    let visited = 0;
    this.allInteractions.forEach((value, key) => {
      value.filter((interaction) => !interaction.verified).forEach(
        (interaction) => {
          if (visited++ < 10) {
            const args = JSON.stringify(interaction.args);
            unverifiedInteractions.push(
              "kv." + key + "(" + args.substring(1, args.length - 1) + ")",
            );
          }
        },
      );
    });

    if (visited > 10) {
      unverifiedInteractions.push("... (" + (visited - 10) + " more)");
    }

    if (unverifiedInteractions.length !== 0) {
      throw new AssertionError(
        "There are unverified interactions: \n\n   " +
          unverifiedInteractions.join("\n   ") + "\n\n",
      );
    }

    return true;
  }
}
