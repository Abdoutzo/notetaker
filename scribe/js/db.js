// Stockage local (IndexedDB) des réunions et des segments audio.
// Rien ne quitte le navigateur, à part les appels aux APIs de transcription/résumé.

const DB_NAME = 'scribe';
const DB_VERSION = 1;

let dbPromise;

function openDb() {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      db.createObjectStore('sessions', { keyPath: 'id' });
      db.createObjectStore('chunks', { keyPath: 'id' }).createIndex('bySession', 'sessionId');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function run(storeName, mode, fn) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const req = fn(tx.objectStore(storeName));
    tx.oncomplete = () => resolve(req?.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export const putSession = (session) => run('sessions', 'readwrite', (st) => st.put(session));
export const getSession = (id) => run('sessions', 'readonly', (st) => st.get(id));

export async function listSessions() {
  const all = await run('sessions', 'readonly', (st) => st.getAll());
  return all.sort((a, b) => b.createdAt - a.createdAt);
}

// Lecture-modification-écriture dans une seule transaction, pour ne pas écraser
// une modification faite en parallèle (ex. titre édité pendant le résumé).
export async function patchSession(id, patch) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('sessions', 'readwrite');
    const store = tx.objectStore('sessions');
    let updated;
    const req = store.get(id);
    req.onsuccess = () => {
      if (!req.result) return;
      updated = typeof patch === 'function' ? (patch(req.result) ?? req.result) : { ...req.result, ...patch };
      store.put(updated);
    };
    tx.oncomplete = () => resolve(updated);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export const putChunk = (chunk) => run('chunks', 'readwrite', (st) => st.put(chunk));

export async function getChunks(sessionId) {
  const chunks = await run('chunks', 'readonly', (st) => st.index('bySession').getAll(sessionId));
  return chunks.sort((a, b) => a.index - b.index || a.track.localeCompare(b.track));
}

export async function deleteSession(id) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['sessions', 'chunks'], 'readwrite');
    tx.objectStore('sessions').delete(id);
    const chunks = tx.objectStore('chunks');
    const cursorReq = chunks.index('bySession').openKeyCursor(IDBKeyRange.only(id));
    cursorReq.onsuccess = () => {
      const cursor = cursorReq.result;
      if (!cursor) return;
      chunks.delete(cursor.primaryKey);
      cursor.continue();
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
