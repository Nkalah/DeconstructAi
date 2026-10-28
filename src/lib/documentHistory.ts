export class DocumentHistory<T> {
  private past: T[] = [];
  private future: T[] = [];

  constructor(
    private readonly clone: (value: T) => T,
    private readonly limit = 100,
  ) {
    if (!Number.isInteger(limit) || limit < 1) {
      throw new Error('History limit must be a positive integer.');
    }
  }

  get canUndo(): boolean {
    return this.past.length > 0;
  }

  get canRedo(): boolean {
    return this.future.length > 0;
  }

  record(current: T): void {
    this.past.push(this.clone(current));
    if (this.past.length > this.limit) this.past.shift();
    this.future = [];
  }

  undo(current: T): T | null {
    const previous = this.past.pop();
    if (previous === undefined) return null;
    this.future.push(this.clone(current));
    return this.clone(previous);
  }

  redo(current: T): T | null {
    const next = this.future.pop();
    if (next === undefined) return null;
    this.past.push(this.clone(current));
    if (this.past.length > this.limit) this.past.shift();
    return this.clone(next);
  }

  clear(): void {
    this.past = [];
    this.future = [];
  }
}
