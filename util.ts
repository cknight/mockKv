import { equal } from "./deps.ts";
import { Matcher } from "./matchers.ts";

export function keyPartMatcher(
  matchers: (Deno.KvKeyPart | Matcher<Deno.KvKeyPart>)[],
): Matcher<Deno.KvKey> {
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
  }();
}

export function getArray<T>(map: Map<string, T[]>, key: string): T[] {
  let value = map.get(key);
  if (!value) {
    value = [];
    map.set(key, value);
  }
  return value;
}
