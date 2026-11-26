export function openHistory(development) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(development ? 'sekkyaku-training-dev' : 'sekkyaku-training', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('attempts', { keyPath: 'id' });
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

export function getHistory(db) {
  return new Promise((resolve, reject) => {
    const request = db.transaction('attempts').objectStore('attempts').getAll();
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result.sort((a, b) => b.completedAt.localeCompare(a.completedAt)));
  });
}

export function saveAttempt(db, attempt) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('attempts', 'readwrite');
    const store = transaction.objectStore('attempts');
    const existing = store.get(attempt.id);
    existing.onsuccess = () => {
      if (existing.result === undefined) store.add(attempt);
    };
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error ?? new Error('履歴を保存できませんでした。'));
  });
}

export function createHistoryStore(development) {
  let connection;

  function connect() {
    connection ??= openHistory(development).catch((error) => {
      connection = undefined;
      throw error;
    });
    return connection;
  }

  return {
    async list() {
      return getHistory(await connect());
    },
    async save(attempt) {
      await saveAttempt(await connect(), attempt);
    },
  };
}
