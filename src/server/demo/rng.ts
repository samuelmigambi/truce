/**
 * A small seeded random number generator (mulberry32), so the demo seed comes out the same for
 * every visitor: same buyers, same orders, same cases.
 */
export interface Rng {
  /** A float in [0, 1). */
  next(): number;
  /** An integer in [min, max], both included. */
  int(min: number, max: number): number;
  chance(p: number): boolean;
  pick<T>(items: readonly T[]): T;
  /** Picks by weight; weights needn't add up to anything in particular. */
  weighted<T>(items: readonly { item: T; weight: number }[]): T;
}

export function seededRng(seed: number): Rng {
  let state = seed >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const rng: Rng = {
    next,
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    chance: (p) => next() < p,
    pick: (items) => {
      if (items.length === 0) throw new Error("Nothing to pick from");
      return items[Math.floor(next() * items.length)]!;
    },
    weighted: (items) => {
      const total = items.reduce((sum, i) => sum + i.weight, 0);
      let roll = next() * total;
      for (const { item, weight } of items) {
        roll -= weight;
        if (roll < 0) return item;
      }
      return items[items.length - 1]!.item;
    },
  };
  return rng;
}
