import type { Collection } from '../types';

/**
 * The platform's storage: a handful of collections keyed by id. Ids that need
 * ordering (appointments, messages, payments) start with an ISO timestamp, so
 * `range` returns them in time order. Small-business volumes keep this simple.
 */
export interface Store {
  get<T>(col: Collection, id: string): Promise<T | undefined>;
  put<T extends { id: string }>(col: Collection, item: T): Promise<T>;
  delete(col: Collection, id: string): Promise<void>;
  list<T>(col: Collection): Promise<T[]>;
  /** Items whose id sorts between `from` and `to` (inclusive). */
  range<T>(col: Collection, from: string, to: string): Promise<T[]>;
}
