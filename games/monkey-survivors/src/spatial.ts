/**
 * Spatial Hash Grid for O(1) broadphase queries across hundreds of enemies at 60fps.
 * Uses integer packed keys and pre-allocated buckets to minimize GC pressure.
 */
export class SpatialHash<T extends { x: number; y: number }> {
  private readonly cellSize: number;
  private readonly buckets = new Map<number, T[]>();
  private readonly activeKeys: number[] = [];

  constructor(cellSize = 96) {
    this.cellSize = cellSize;
  }

  private key(cx: number, cy: number): number {
    // Pack signed 16-bit cell coords into 32-bit integer
    return ((cx & 0xffff) << 16) | (cy & 0xffff);
  }

  clear(): void {
    for (let i = 0; i < this.activeKeys.length; i++) {
      const arr = this.buckets.get(this.activeKeys[i]);
      if (arr) arr.length = 0;
    }
    this.activeKeys.length = 0;
  }

  insert(item: T): void {
    const cx = Math.floor(item.x / this.cellSize);
    const cy = Math.floor(item.y / this.cellSize);
    const k = this.key(cx, cy);
    let arr = this.buckets.get(k);
    if (!arr) {
      arr = [];
      this.buckets.set(k, arr);
    }
    if (arr.length === 0) {
      this.activeKeys.push(k);
    }
    arr.push(item);
  }

  queryRadius(x: number, y: number, radius: number, out: T[]): T[] {
    out.length = 0;
    const minX = Math.floor((x - radius) / this.cellSize);
    const maxX = Math.floor((x + radius) / this.cellSize);
    const minY = Math.floor((y - radius) / this.cellSize);
    const maxY = Math.floor((y + radius) / this.cellSize);

    for (let cx = minX; cx <= maxX; cx++) {
      for (let cy = minY; cy <= maxY; cy++) {
        const arr = this.buckets.get(this.key(cx, cy));
        if (!arr || arr.length === 0) continue;
        for (let i = 0; i < arr.length; i++) {
          out.push(arr[i]);
        }
      }
    }
    return out;
  }
}

/**
 * Fixed-capacity / growable object pool for zero-GC entity reuse.
 */
export class ObjectPool<T extends { active: boolean }> {
  public readonly items: T[] = [];
  private readonly factory: () => T;

  constructor(initialSize: number, factory: () => T) {
    this.factory = factory;
    for (let i = 0; i < initialSize; i++) {
      const item = factory();
      item.active = false;
      this.items.push(item);
    }
  }

  acquire(): T {
    for (let i = 0; i < this.items.length; i++) {
      if (!this.items[i].active) {
        this.items[i].active = true;
        return this.items[i];
      }
    }
    const created = this.factory();
    created.active = true;
    this.items.push(created);
    return created;
  }

  releaseAll(): void {
    for (let i = 0; i < this.items.length; i++) {
      this.items[i].active = false;
    }
  }
}
