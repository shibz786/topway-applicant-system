import "server-only";

// Minimal key-value store abstraction — same adapter pattern as
// lib/storage/adapter.ts. Backs rate limiting (login attempts) and the
// session blacklist. Today this resolves to an in-memory stand-in; set
// UPSTASH_REDIS_REST_URL/UPSTASH_REDIS_REST_TOKEN in .env and swap in a
// real @upstash/redis-backed implementation behind this same interface —
// nothing else in the app should need to change.
export interface KVStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, opts?: { exSeconds?: number }): Promise<void>;
  incr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<void>;
  del(key: string): Promise<void>;
}

import { memoryKV } from "./memory-adapter";

// No Upstash credentials configured yet (Phase 6 stand-in, per CLAUDE.md)
// — this is the only place that needs to change once they exist.
export const kv: KVStore = memoryKV;
