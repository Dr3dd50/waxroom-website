// Local development store: everything in memory, saved to a JSON file.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Collection } from '../types';
import type { Store } from './store';

export class FileStore implements Store {
  private data: Record<string, Record<string, unknown>> = {};
  private timer: NodeJS.Timeout | null = null;

  constructor(private path: string) {
    if (existsSync(path)) this.data = JSON.parse(readFileSync(path, 'utf8'));
  }

  private bucket(col: Collection) {
    return (this.data[col] ??= {});
  }
  private save() {
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      mkdirSync(dirname(this.path), { recursive: true });
      writeFileSync(this.path, JSON.stringify(this.data));
    }, 200);
  }
  async get<T>(col: Collection, id: string) {
    const v = this.bucket(col)[id];
    return v ? (structuredClone(v) as T) : undefined;
  }
  async put<T extends { id: string }>(col: Collection, item: T) {
    this.bucket(col)[item.id] = structuredClone(item);
    this.save();
    return item;
  }
  async claim(col: Collection, id: string, ms: number) {
    const held = this.bucket(col)[id] as { until: number } | undefined;
    if (held && held.until >= Date.now()) return false;
    this.bucket(col)[id] = { id, until: Date.now() + ms };
    return true;
  }
  async delete(col: Collection, id: string) {
    delete this.bucket(col)[id];
    this.save();
  }
  async list<T>(col: Collection) {
    return Object.keys(this.bucket(col))
      .sort()
      .map((k) => structuredClone(this.bucket(col)[k]) as T);
  }
  async range<T>(col: Collection, from: string, to: string) {
    return Object.keys(this.bucket(col))
      .filter((k) => k >= from && k <= to)
      .sort()
      .map((k) => structuredClone(this.bucket(col)[k]) as T);
  }
  isEmpty() {
    return !Object.keys(this.data.services ?? {}).length;
  }
}
