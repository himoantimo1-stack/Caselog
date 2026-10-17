/* On-device store (IndexedDB). In the phone edition this is the only copy, so back up to Files regularly. */
(function () {
  const DB_NAME = 'caselog';
  const STORES = ['cases', 'templates', 'rotations', 'lists'];
  let dbPromise = null;

  function open() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 2);
      req.onupgradeneeded = () => {
        const db = req.result;
        STORES.forEach((s) => { if (!db.objectStoreNames.contains(s)) db.createObjectStore(s, { keyPath: 'id' }); });
        if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'key' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbPromise;
  }

  function tx(store, mode, fn) {
    return open().then((db) => new Promise((resolve, reject) => {
      const t = db.transaction(store, mode);
      const s = t.objectStore(store);
      let result;
      Promise.resolve(fn(s)).then((r) => { result = r; });
      t.oncomplete = () => resolve(result);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error);
    }));
  }

  function reqP(req) {
    return new Promise((resolve, reject) => { req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); });
  }

  window.Store = {
    STORES,
    getAll(store) { return tx(store, 'readonly', (s) => reqP(s.getAll())); },
    put(store, obj) { return tx(store, 'readwrite', (s) => { s.put(obj); }); },
    putMany(store, list) { return tx(store, 'readwrite', (s) => { list.forEach((o) => s.put(o)); }); },
    async getMeta(key, fallback) {
      const row = await tx('meta', 'readonly', (s) => reqP(s.get(key)));
      return row ? row.value : fallback;
    },
    setMeta(key, value) { return tx('meta', 'readwrite', (s) => { s.put({ key, value }); }); },
    async clearAll() {
      for (const s of [...STORES, 'meta']) await tx(s, 'readwrite', (st) => { st.clear(); });
    },
  };
})();
