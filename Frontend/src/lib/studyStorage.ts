import type { StudyDocument } from "./study";

const DATABASE_NAME = "stem-study-desk";
const STORE_NAME = "documents";

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE_NAME, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function loadStudyDocuments(): Promise<StudyDocument[]> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const request = database
      .transaction(STORE_NAME, "readonly")
      .objectStore(STORE_NAME)
      .getAll();
    request.onsuccess = () => resolve(request.result as StudyDocument[]);
    request.onerror = () => reject(request.error);
  });
}

export async function saveStudyDocument(
  document: StudyDocument,
): Promise<void> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const request = database
      .transaction(STORE_NAME, "readwrite")
      .objectStore(STORE_NAME)
      .put(document);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function deleteStudyDocument(id: string): Promise<void> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const request = database
      .transaction(STORE_NAME, "readwrite")
      .objectStore(STORE_NAME)
      .delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}
