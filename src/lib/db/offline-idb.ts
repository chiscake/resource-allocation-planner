/** Minimal IndexedDB helpers with an in-memory backend for unit tests. */

export type IdbStoreName = 'meta' | 'tasks';

const DB_NAME = 'rap-offline-v1';
const DB_VERSION = 1;

/**
 * Strip Svelte proxies / non-cloneable values before IDB put.
 * structuredClone fails on Proxy; JSON round-trip is enough for our model JSON.
 */
export function toIdbValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export type KvBackend = {
  get<T>(store: IdbStoreName, key: string): Promise<T | undefined>;
  put(store: IdbStoreName, key: string, value: unknown): Promise<void>;
  delete(store: IdbStoreName, key: string): Promise<void>;
  getAllKeys(store: IdbStoreName): Promise<string[]>;
  getAll<T>(store: IdbStoreName): Promise<T[]>;
  clear(store: IdbStoreName): Promise<void>;
};

function memoryBackend(): KvBackend {
  const maps: Record<IdbStoreName, Map<string, unknown>> = {
    meta: new Map(),
    tasks: new Map(),
  };
  return {
    async get<T>(store: IdbStoreName, key: string) {
      return maps[store].get(key) as T | undefined;
    },
    async put(store: IdbStoreName, key: string, value: unknown) {
      maps[store].set(key, toIdbValue(value));
    },
    async delete(store: IdbStoreName, key: string) {
      maps[store].delete(key);
    },
    async getAllKeys(store: IdbStoreName) {
      return [...maps[store].keys()];
    },
    async getAll<T>(store: IdbStoreName) {
      return [...maps[store].values()] as T[];
    },
    async clear(store: IdbStoreName) {
      maps[store].clear();
    },
  };
}

function idbBackend(): KvBackend {
  let dbPromise: Promise<IDBDatabase> | null = null;

  function openDb(): Promise<IDBDatabase> {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta');
        if (!db.objectStoreNames.contains('tasks')) db.createObjectStore('tasks');
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error ?? new Error('indexedDB open failed'));
    });
    return dbPromise;
  }

  async function withStore<T>(
    store: IdbStoreName,
    mode: IDBTransactionMode,
    fn: (os: IDBObjectStore) => IDBRequest<T> | void,
  ): Promise<T> {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, mode);
      const os = tx.objectStore(store);
      const req = fn(os);
      tx.oncomplete = () => {
        if (req) resolve(req.result);
        else resolve(undefined as T);
      };
      tx.onerror = () => reject(tx.error ?? new Error('idb tx failed'));
      if (req) {
        req.onerror = () => reject(req.error ?? new Error('idb request failed'));
      }
    });
  }

  return {
    async get<T>(store: IdbStoreName, key: string) {
      return withStore(store, 'readonly', (os) => os.get(key));
    },
    async put(store: IdbStoreName, key: string, value: unknown) {
      const plain = toIdbValue(value);
      await withStore(store, 'readwrite', (os) => {
        os.put(plain, key);
      });
    },
    async delete(store: IdbStoreName, key: string) {
      await withStore(store, 'readwrite', (os) => {
        os.delete(key);
      });
    },
    async getAllKeys(store: IdbStoreName) {
      const keys = await withStore<IDBValidKey[]>(store, 'readonly', (os) => os.getAllKeys());
      return (keys ?? []).map(String);
    },
    async getAll<T>(store: IdbStoreName) {
      return (await withStore<T[]>(store, 'readonly', (os) => os.getAll())) ?? [];
    },
    async clear(store: IdbStoreName) {
      await withStore(store, 'readwrite', (os) => {
        os.clear();
      });
    },
  };
}

let active: KvBackend | null = null;

/** Override for tests; pass `null` to reset to default (IDB or memory). */
export function setOfflineBackend(backend: KvBackend | null): void {
  active = backend;
}

export function createMemoryOfflineBackend(): KvBackend {
  return memoryBackend();
}

export function getOfflineBackend(): KvBackend {
  if (active) return active;
  if (typeof indexedDB === 'undefined') {
    active = memoryBackend();
    return active;
  }
  active = idbBackend();
  return active;
}
