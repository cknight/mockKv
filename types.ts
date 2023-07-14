type FunctionNames<T> = {
  // deno-lint-ignore no-explicit-any
  [K in keyof T]: T[K] extends (...args: any[]) => any ? K : never;
}[keyof T];

export type KvFunctionNames = FunctionNames<Deno.Kv>;

export abstract class Matcher<T> {
  abstract matches(value?: T): boolean;
}

export type KvKeyMatcher =
  | Deno.KvKey
  | Matcher<Deno.KvKey>
  | (Deno.KvKeyPart | Matcher<Deno.KvKeyPart>)[];

export type KvListSelectorMatcher =
  | { prefix: KvKeyMatcher }
  | { prefix: KvKeyMatcher; start: KvKeyMatcher }
  | { prefix: KvKeyMatcher; end: KvKeyMatcher }
  | { start: KvKeyMatcher; end: KvKeyMatcher };

export type KvListOptionsMatcher = {
  limit?: number | Matcher<number>;
  cursor?: string | Matcher<string>;
  reverse?: boolean | Matcher<boolean>;
  consistency?: Deno.KvConsistencyLevel | Matcher<Deno.KvConsistencyLevel>;
  batchSize?: number | Matcher<number>;
};
