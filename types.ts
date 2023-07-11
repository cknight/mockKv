type FunctionNames<T> = {
  // deno-lint-ignore no-explicit-any
  [K in keyof T]: T[K] extends (...args: any[]) => any ? K : never;
}[keyof T];

export type KvFunctionNames = FunctionNames<Deno.Kv>;

