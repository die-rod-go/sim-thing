import type { Bucket, Memory } from "@village/shared";

/** Read access to memories, enough for filing (duplicate checks) and recall. */
export interface MemoryReader {
  listByAgent(agentId: string): Memory[];
  listByAgentAndBucket(agentId: string, bucket: Bucket): Memory[];
}

/**
 * All agents' memories, held in memory and keyed by id. Memories are treated as immutable values:
 * changes go through `update`, which replaces the stored memory. Persisted by the db layer.
 */
export class MemoryStore implements MemoryReader {
  private readonly memoriesById = new Map<string, Memory>();

  add(memory: Memory): void {
    if (this.memoriesById.has(memory.id)) {
      throw new Error(`Memory id already exists: ${memory.id}`);
    }
    this.memoriesById.set(memory.id, memory);
  }

  addAll(memories: readonly Memory[]): void {
    for (const memory of memories) this.add(memory);
  }

  get(memoryId: string): Memory | undefined {
    return this.memoriesById.get(memoryId);
  }

  update(memory: Memory): void {
    if (!this.memoriesById.has(memory.id)) {
      throw new Error(`Cannot update unknown memory: ${memory.id}`);
    }
    this.memoriesById.set(memory.id, memory);
  }

  remove(memoryId: string): boolean {
    return this.memoriesById.delete(memoryId);
  }

  listByAgent(agentId: string): Memory[] {
    return this.all().filter((memory) => memory.agentId === agentId);
  }

  listByAgentAndBucket(agentId: string, bucket: Bucket): Memory[] {
    return this.all().filter((memory) => memory.agentId === agentId && memory.bucket === bucket);
  }

  all(): Memory[] {
    return [...this.memoriesById.values()];
  }

  /** Replaces the whole store, e.g. after loading from the database. */
  replaceAll(memories: readonly Memory[]): void {
    this.memoriesById.clear();
    this.addAll(memories);
  }

  get size(): number {
    return this.memoriesById.size;
  }
}

/**
 * Deterministic memory ids: `${agentId}-${tick}-${counter}`. The counter only grows, so ids stay
 * unique as long as its state is saved with the world and restored on load.
 */
export class MemoryIdGenerator {
  private counter: number;

  constructor(startCounter = 0) {
    this.counter = startCounter;
  }

  nextId(agentId: string, tick: number): string {
    const memoryId = `${agentId}-${tick}-${this.counter}`;
    this.counter += 1;
    return memoryId;
  }

  getState(): number {
    return this.counter;
  }

  setState(counter: number): void {
    this.counter = counter;
  }
}
