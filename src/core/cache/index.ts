// RideIQ Cache Abstraction
// In-memory cache with optional Redis backend.

interface CacheEntry<T> {
  value: T;
  expiry: number;
}

const memoryStore = new Map<string, CacheEntry<unknown>>();

export interface CacheBackend {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttlMs?: number): Promise<void>;
  del(key: string): Promise<void>;
}

class MemoryCache implements CacheBackend {
  async get<T>(key: string): Promise<T | null> {
    const entry = memoryStore.get(key) as CacheEntry<T> | undefined;
    if (!entry) return null;
    if (Date.now() > entry.expiry) {
      memoryStore.delete(key);
      return null;
    }
    return entry.value;
  }

  async set<T>(key: string, value: T, ttlMs = 60000): Promise<void> {
    memoryStore.set(key, { value, expiry: Date.now() + ttlMs });
  }

  async del(key: string): Promise<void> {
    memoryStore.delete(key);
  }
}

export const cache: CacheBackend = new MemoryCache();
