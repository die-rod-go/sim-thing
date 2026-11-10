/**
 * The one seeded random generator for the sim (mulberry32). Its state is a single number, so it
 * can be saved with the world and resumed for reproducible runs.
 */
export class SeededRandom {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  getState(): number {
    return this.state;
  }

  setState(state: number): void {
    this.state = state >>> 0;
  }

  /** A float in [0, 1). */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let mixed = this.state;
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  }

  /** An integer in [min, max]. */
  nextInt(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  pick<Item>(items: readonly Item[]): Item {
    const item = items[Math.floor(this.next() * items.length)];
    if (item === undefined) throw new Error("Cannot pick from an empty list");
    return item;
  }
}
