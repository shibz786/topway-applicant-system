import "server-only";
import type { KVStore } from "./adapter";

type Entry = { value: string; expiresAt: number | null };

// Cached on globalThis, not a bare module-level `new Map()` — Next.js
// compiles Server Actions, Route Handlers, and Middleware into separate
// module "layers", and a plain module-level singleton gets re-evaluated
// once per layer, silently splitting state across them. This is the exact
// bug class that broke the audit middleware's AsyncLocalStorage in Phase 2
// (see CLAUDE.md) — same fix here: a real global, not a fresh object per
// layer.
declare global {
  var kvMemoryStore: Map<string, Entry> | undefined;
}

const store = globalThis.kvMemoryStore ?? new Map<string, Entry>();
globalThis.kvMemoryStore = store;

function isExpired(entry: Entry): boolean {
  return entry.expiresAt !== null && Date.now() > entry.expiresAt;
}

function readValid(key: string): Entry | null {
  const entry = store.get(key);
  if (!entry) return null;
  if (isExpired(entry)) {
    store.delete(key);
    return null;
  }
  return entry;
}

export const memoryKV: KVStore = {
  async get(key) {
    return readValid(key)?.value ?? null;
  },

  async set(key, value, opts) {
    store.set(key, {
      value,
      expiresAt: opts?.exSeconds ? Date.now() + opts.exSeconds * 1000 : null,
    });
  },

  async incr(key) {
    const entry = readValid(key);
    const next = (entry ? parseInt(entry.value, 10) || 0 : 0) + 1;
    store.set(key, { value: String(next), expiresAt: entry?.expiresAt ?? null });
    return next;
  },

  async expire(key, seconds) {
    const entry = readValid(key);
    if (!entry) return;
    store.set(key, { ...entry, expiresAt: Date.now() + seconds * 1000 });
  },

  async del(key) {
    store.delete(key);
  },
};
