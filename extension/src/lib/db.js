// IndexedDB shared by the background worker (the only writer) and the UI pages.
// `requests` holds the light metadata the list needs; `bodies` holds query,
// variables and response, read only when a request is opened.
const DB_NAME = 'contember-inspector';
const VERSION = 1;

let dbPromise = null;

export function openDb() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        const requests = db.createObjectStore('requests', { keyPath: 'id', autoIncrement: true });
        requests.createIndex('tabId', 'tabId');
        db.createObjectStore('bodies', { keyPath: 'id' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

const done = (tx) => new Promise((resolve, reject) => {
  tx.oncomplete = () => resolve();
  tx.onerror = () => reject(tx.error);
  tx.onabort = () => reject(tx.error);
});

export async function addRequest(meta, body) {
  const db = await openDb();
  const tx = db.transaction(['requests', 'bodies'], 'readwrite');
  const id = await new Promise((resolve, reject) => {
    const r = tx.objectStore('requests').add(meta);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
  tx.objectStore('bodies').put({ ...body, id });
  await done(tx);
  return id;
}

// Newest first. afterId: only requests newer than that id.
export async function listRequests({ afterId = 0, tabId = null } = {}) {
  const db = await openDb();
  const tx = db.transaction('requests');
  const store = tx.objectStore('requests');
  const out = [];
  await new Promise((resolve, reject) => {
    const range = afterId ? IDBKeyRange.lowerBound(afterId, true) : null;
    const req = store.openCursor(range, 'prev');
    req.onsuccess = () => {
      const cursor = req.result;
      if (!cursor) return resolve();
      if (tabId == null || cursor.value.tabId === tabId) out.push(cursor.value);
      cursor.continue();
    };
    req.onerror = () => reject(req.error);
  });
  return out;
}

export async function getBody(id) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const req = db.transaction('bodies').objectStore('bodies').get(id);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

const deleteIds = async (ids) => {
  if (!ids.length) return;
  const db = await openDb();
  const tx = db.transaction(['requests', 'bodies'], 'readwrite');
  for (const id of ids) {
    tx.objectStore('requests').delete(id);
    tx.objectStore('bodies').delete(id);
  }
  await done(tx);
};

const keysOf = (source, query) => new Promise((resolve, reject) => {
  const req = source.getAllKeys(query);
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error);
});

export async function clearRequests(tabId = null) {
  const db = await openDb();
  if (tabId == null) {
    const tx = db.transaction(['requests', 'bodies'], 'readwrite');
    tx.objectStore('requests').clear();
    tx.objectStore('bodies').clear();
    return done(tx);
  }
  const ids = await keysOf(db.transaction('requests').objectStore('requests').index('tabId'), IDBKeyRange.only(tabId));
  return deleteIds(ids);
}

// Keeps the newest `max` requests.
export async function pruneRequests(max) {
  const db = await openDb();
  const keys = await keysOf(db.transaction('requests').objectStore('requests'));
  if (keys.length <= max) return 0;
  const drop = keys.slice(0, keys.length - max);
  await deleteIds(drop);
  return drop.length;
}
