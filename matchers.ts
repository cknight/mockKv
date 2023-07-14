import { equal } from "./deps.ts";
import { Matcher } from "./types.ts";

export function anyKey(): Matcher<Deno.KvKey> {
  return new class extends Matcher<Deno.KvKey> {
    matches(_value?: Deno.KvKey): boolean {
      return typeof _value !== "undefined";
    }
  }();
}

export function anyValue(): Matcher<unknown> {
  return new class extends Matcher<unknown> {
    matches(_value?: unknown): boolean {
      return typeof _value !== "undefined";
    }
  }();
}

export function anyListSelector(): Matcher<Deno.KvListSelector> {
  return new class extends Matcher<Deno.KvListSelector> {
    matches(_value?: Deno.KvListSelector): boolean {
      return typeof _value !== "undefined";
    }
  }();
}

export function anyUint8array(): Matcher<Uint8Array> {
  return new class extends Matcher<Uint8Array> {
    matches(_value?: Uint8Array): boolean {
      return typeof _value !== "undefined" && _value instanceof Uint8Array;
    }
  }();
}

export function anyString(): Matcher<string> {
  return new class extends Matcher<string> {
    matches(_value?: string): boolean {
      return typeof _value !== "undefined" && typeof _value === "string";
    }
  }();
}

export function anyNumber(): Matcher<number> {
  return new class extends Matcher<number> {
    matches(_value?: number): boolean {
      return typeof _value !== "undefined" && typeof _value === "number";
    }
  }();
}

export function anyBigInt(): Matcher<bigint> {
  return new class extends Matcher<bigint> {
    matches(_value?: bigint): boolean {
      return typeof _value !== "undefined" && typeof _value === "bigint";
    }
  }();
}

export function anyBoolean(): Matcher<boolean> {
  return new class extends Matcher<boolean> {
    matches(_value?: boolean): boolean {
      return typeof _value !== "undefined" && typeof _value === "boolean";
    }
  }();
}

export function eq<T>(expected: T): Matcher<T> {
  return new class extends Matcher<T> {
    matches(value?: T): boolean {
      return equal(value, expected);
    }
  }();
}

export function anyConsistencyLevel(): Matcher<Deno.KvConsistencyLevel> {
  return new class extends Matcher<Deno.KvConsistencyLevel> {
    matches(_value?: Deno.KvConsistencyLevel): boolean {
      return typeof _value !== "undefined";
    }
  }();
}
