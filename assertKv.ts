import { AssertionError } from "./deps.ts";
import { Matcher, eq } from "./matchers.ts";
import { KvFunctionNames } from "./types.ts";
import { getArray, keyPartMatcher } from "./util.ts";

export class Interaction {
  verified = false;
  constructor(public readonly args: unknown[]) {}
}

interface KvFunctions {
  get(
    key:
      | Deno.KvKey
      | Matcher<Deno.KvKey>
      | (Deno.KvKeyPart | Matcher<Deno.KvKeyPart>)[],
    options?: {
      consistency?: Deno.KvConsistencyLevel | Matcher<Deno.KvConsistencyLevel>;
    },
  ): boolean
}

export class Assertions {
  constructor(private calls: Map<KvFunctionNames, Interaction[]>) {}
  private verifyNumber = 1;

  public get(
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

    return this.verification(matchingInteractions);
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
  }

  private verifyTimes = (interactions: Interaction[]) => {
    try {
      if (interactions.length !== this.verifyNumber) {
        throw new AssertionError(
          "Expected to be called " + this.verifyNumber + " times but was called " +
            interactions.length + " times",
        );
      }
      return true;
    } finally {
      this.resetVerification();
    }
  }

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
  }

  private verifyAtLeast = (interactions: Interaction[]) => {
    try {
      if (interactions.length < this.verifyNumber) {
        throw new AssertionError(
          "Expected to be called at least " + this.verifyNumber + " times but was only called " +
            interactions.length + " times",
        );
      }
      return true;
    } finally {
      this.resetVerification();
    }
  }

  private verifyAtMost = (interactions: Interaction[]) => {
    try {
      if (interactions.length > this.verifyNumber) {
        throw new AssertionError(
          "Expected to be called at most " + this.verifyNumber + " times but was called " +
            interactions.length + " times",
        );
      }
      return true;
    } finally {
      this.resetVerification();
    }
  }
  private verification: (interactions: Interaction[]) => boolean = this.verifyAtLeast;

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

  public noMoreInteractions(): boolean {
    const unverifiedInteractions: string[] = [];
    this.calls.forEach((value, key) => {
      value.filter((interaction) => !interaction.verified).forEach(
        (interaction) => {
          const args = JSON.stringify(interaction.args);
          unverifiedInteractions.push("kv." + key + "(" + args.substring(1, args.length -1) + ")");
        },
      );
    });

    if (unverifiedInteractions.length !== 0) {
      throw new AssertionError(
        "There are unverified interactions: \n\n   " + unverifiedInteractions.join("\n   ") + "\n\n",
      );
    }

    return true;
  }
}
