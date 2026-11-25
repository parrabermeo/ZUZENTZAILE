import type {
  ClassGroup,
  EvaluationRecord,
  Rubric,
  SavedTestDefinition,
  StoredImageAsset,
  Student,
} from '../types';

/**
 * ============================================================================
 * STRICT PERSISTENCE STABILITY RULE — DO NOT ALTER WITHOUT ADDITIVE MIGRATION
 * ============================================================================
 * Database Name  : EbaluazioaLH6_DB
 * Schema Version : 1
 * Object Stores  :
 *   1. 'workspace'   — Canonical persistence for:
 *        - 'groups'      (ClassGroup[])
 *        - 'students'    (Student[], including full evaluations + base64 images)
 *        - 'rubrics'     (Rubric[])
 *        - 'savedTests'  (SavedTestDefinition[], including prompt base64 images)
 *        - 'evaluations' (EvaluationRecord[], flat archival index of all evaluations)
 *        - 'meta'        (IdbWorkspaceMeta)
 *   2. 'fileHandles' — Native FileSystemFileHandle persistence:
 *        - 'master_backup_handle'
 *
 * RULE: Future UI, CSS, layout, or component refactors MUST NEVER change
 * IDB_DB_NAME, IDB_DB_VERSION (unless adding a non-destructive upgrade path),
 * IDB_STORES, or IDB_WORKSPACE_KEYS. Existing records and embedded images must
 * remain readable and intact across all future updates.
 * ============================================================================
 */
export const IDB_DB_NAME = 'EbaluazioaLH6_DB' as const;
export const IDB_DB_VERSION = 1 as const;

export const IDB_STORES = {
  WORKSPACE: 'workspace',
  FILE_HANDLES: 'fileHandles',
} as const;

export const IDB_WORKSPACE_KEYS = {
  GROUPS: 'groups',
  STUDENTS: 'students',
  RUBRICS: 'rubrics',
  SAVED_TESTS: 'savedTests',
  EVALUATIONS: 'evaluations',
  IMAGE_INDEX: 'imageIndex', // Local-only Base64 archive for rehydrating Firestore snapshots
  META: 'meta',
} as const;

export interface LocalImageIndex {
  evalImages: Record<
    string,
    {
      pruebaImagenes?: StoredImageAsset[];
      studentImages?: StoredImageAsset[];
    }
  >;
  testImages: Record<string, StoredImageAsset[]>;
}

export const IDB_HANDLE_KEYS = {
  MASTER_BACKUP: 'master_backup_handle',
} as const;

export interface IdbWorkspacePayload {
  groups: ClassGroup[];
  students: Student[];
  rubrics: Rubric[];
  savedTests: SavedTestDefinition[];
}

export interface IdbWorkspaceMeta {
  schemaVersion: number;
  dbName: string;
  migratedFromLocalStorageAt?: string;
  updatedAt: string;
  groupCount: number;
  studentCount: number;
  rubricCount: number;
  savedTestCount: number;
  evaluationCount: number;
  imageCount: number;
}

export interface IdbStorageStats {
  engine: 'indexeddb' | 'localstorage';
  dbName: string;
  schemaVersion: number;
  usedBytes: number;
  usedMb: number;
  quotaMb: number | null; // null or large browser quota (e.g. hundreds of MB / GB)
  percent: number;
  persistentGranted: boolean;
  evaluationCount: number;
  imageCount: number;
  migratedFromLocalStorageAt?: string;
}

let dbPromise: Promise<IDBDatabase> | null = null;

export function isIndexedDbAvailable(): boolean {
  return typeof window !== 'undefined' && typeof window.indexedDB !== 'undefined';
}

export function openEbaluazioaDb(): Promise<IDBDatabase> {
  if (!isIndexedDbAvailable()) {
    return Promise.reject(new Error('IndexedDB is not available in this browser'));
  }

  if (dbPromise) {
    return dbPromise;
  }

  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const request = window.indexedDB.open(IDB_DB_NAME, IDB_DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(IDB_STORES.WORKSPACE)) {
        db.createObjectStore(IDB_STORES.WORKSPACE);
      }
      if (!db.objectStoreNames.contains(IDB_STORES.FILE_HANDLES)) {
        db.createObjectStore(IDB_STORES.FILE_HANDLES);
      }
    };

    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => {
        db.close();
        dbPromise = null;
      };
      resolve(db);
    };

    request.onerror = () => {
      dbPromise = null;
      reject(request.error || new Error('Failed to open EbaluazioaLH6_DB'));
    };

    request.onblocked = () => {
      dbPromise = null;
      reject(new Error('Opening EbaluazioaLH6_DB was blocked by another tab'));
    };
  });

  return dbPromise;
}

function requestToPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('IndexedDB request failed'));
  });
}

function transactionDone(tx: IDBTransaction): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error('IndexedDB transaction failed'));
    tx.onabort = () => reject(tx.error || new Error('IndexedDB transaction aborted'));
  });
}

function collectFlatEvaluations(students: Student[]): EvaluationRecord[] {
  const flat: EvaluationRecord[] = [];
  for (const st of students) {
    if (Array.isArray(st.evaluations)) {
      for (const ev of st.evaluations) {
        flat.push(ev);
      }
    }
  }
  return flat;
}

function countEmbeddedImages(state: IdbWorkspacePayload): number {
  let count = 0;
  for (const test of state.savedTests || []) {
    if (Array.isArray(test.pruebaImagenes)) {
      count += test.pruebaImagenes.length;
    }
  }
  for (const student of state.students || []) {
    for (const ev of student.evaluations || []) {
      if (Array.isArray(ev.pruebaImagenes)) count += ev.pruebaImagenes.length;
      if (Array.isArray(ev.studentImages)) count += ev.studentImages.length;
    }
  }
  return count;
}

/**
 * Reconcile students with the flat evaluations store in case an evaluation
 * exists in the flat index but is missing on the student record.
 */
function reconcileStudentEvaluations(
  students: Student[],
  flatEvaluations: EvaluationRecord[] | undefined
): Student[] {
  if (!Array.isArray(flatEvaluations) || flatEvaluations.length === 0) {
    return students;
  }

  const byStudent = new Map<string, EvaluationRecord[]>();
  for (const ev of flatEvaluations) {
    if (!ev || typeof ev.studentId !== 'string') continue;
    const list = byStudent.get(ev.studentId) || [];
    list.push(ev);
    byStudent.set(ev.studentId, list);
  }

  return students.map((st) => {
    const existing = Array.isArray(st.evaluations) ? st.evaluations : [];
    const indexed = byStudent.get(st.id);
    if (!indexed || indexed.length === 0) return st;

    const existingIds = new Set(existing.map((e) => e.id));
    const missing = indexed.filter((e) => !existingIds.has(e.id));
    if (missing.length === 0) return st;

    return {
      ...st,
      evaluations: [...existing, ...missing],
    };
  });
}

export interface IdbWorkspaceReadResult {
  hasData: boolean;
  state: IdbWorkspacePayload | null;
  meta: IdbWorkspaceMeta | null;
}

function applyImageIndexToState(
  state: IdbWorkspacePayload,
  imageIndex: LocalImageIndex | undefined
): IdbWorkspacePayload {
  if (!imageIndex) return state;

  const nextSavedTests = (state.savedTests || []).map((test) => {
    if (test.pruebaImagenes && test.pruebaImagenes.length > 0) return test;
    const cached = imageIndex.testImages?.[test.id];
    if (cached && cached.length > 0) {
      return {
        ...test,
        pruebaImagenes: cached,
        hasLocalImage: true,
      };
    }
    return test;
  });

  const nextStudents = (state.students || []).map((st) => {
    let changed = false;
    const nextEvals = (st.evaluations || []).map((ev) => {
      const cached = imageIndex.evalImages?.[ev.id];
      if (!cached) return ev;

      const needsRef =
        (!ev.pruebaImagenes || ev.pruebaImagenes.length === 0) &&
        cached.pruebaImagenes &&
        cached.pruebaImagenes.length > 0;
      const needsStudent =
        (!ev.studentImages || ev.studentImages.length === 0) &&
        cached.studentImages &&
        cached.studentImages.length > 0;

      if (!needsRef && !needsStudent) return ev;
      changed = true;
      return {
        ...ev,
        pruebaImagenes: needsRef ? cached.pruebaImagenes : ev.pruebaImagenes,
        studentImages: needsStudent ? cached.studentImages : ev.studentImages,
        hasLocalImage: true,
      };
    });

    return changed ? { ...st, evaluations: nextEvals } : st;
  });

  return {
    ...state,
    students: nextStudents,
    savedTests: nextSavedTests,
  };
}

function mergeIntoImageIndex(
  existing: LocalImageIndex | undefined,
  state: IdbWorkspacePayload
): LocalImageIndex {
  const evalImages: LocalImageIndex['evalImages'] = { ...(existing?.evalImages || {}) };
  const testImages: LocalImageIndex['testImages'] = { ...(existing?.testImages || {}) };

  for (const test of state.savedTests || []) {
    if (test.pruebaImagenes && test.pruebaImagenes.length > 0) {
      testImages[test.id] = test.pruebaImagenes;
    }
  }

  for (const st of state.students || []) {
    for (const ev of st.evaluations || []) {
      const hasRef = Boolean(ev.pruebaImagenes && ev.pruebaImagenes.length > 0);
      const hasStu = Boolean(ev.studentImages && ev.studentImages.length > 0);
      if (hasRef || hasStu) {
        const prev = evalImages[ev.id] || {};
        evalImages[ev.id] = {
          pruebaImagenes: hasRef ? ev.pruebaImagenes : prev.pruebaImagenes,
          studentImages: hasStu ? ev.studentImages : prev.studentImages,
        };
      }
    }
  }

  return { evalImages, testImages };
}

/**
 * Rehydrates Base64 images stored locally in IndexedDB (`imageIndex`) onto a
 * lightweight workspace snapshot received from Cloud Firestore.
 */
export async function rehydrateWorkspaceImagesFromIdb(
  state: IdbWorkspacePayload
): Promise<IdbWorkspacePayload> {
  if (!isIndexedDbAvailable()) return state;
  try {
    const db = await openEbaluazioaDb();
    const tx = db.transaction(IDB_STORES.WORKSPACE, 'readonly');
    const store = tx.objectStore(IDB_STORES.WORKSPACE);
    const [imageIndex, storedStudents, storedTests] = await Promise.all([
      requestToPromise<LocalImageIndex | undefined>(store.get(IDB_WORKSPACE_KEYS.IMAGE_INDEX)),
      requestToPromise<Student[] | undefined>(store.get(IDB_WORKSPACE_KEYS.STUDENTS)),
      requestToPromise<SavedTestDefinition[] | undefined>(
        store.get(IDB_WORKSPACE_KEYS.SAVED_TESTS)
      ),
    ]);
    await transactionDone(tx);

    // Also harvest any Base64 images already on legacy IndexedDB records before imageIndex existed
    const combinedIndex = mergeIntoImageIndex(imageIndex, {
      groups: [],
      students: Array.isArray(storedStudents) ? storedStudents : [],
      rubrics: [],
      savedTests: Array.isArray(storedTests) ? storedTests : [],
    });

    return applyImageIndexToState(state, combinedIndex);
  } catch {
    return state;
  }
}

export async function readWorkspaceFromIdb(): Promise<IdbWorkspaceReadResult> {
  const db = await openEbaluazioaDb();
  const tx = db.transaction(IDB_STORES.WORKSPACE, 'readonly');
  const store = tx.objectStore(IDB_STORES.WORKSPACE);

  const [groups, students, rubrics, savedTests, flatEvaluations, imageIndex, meta] =
    await Promise.all([
      requestToPromise<ClassGroup[] | undefined>(store.get(IDB_WORKSPACE_KEYS.GROUPS)),
      requestToPromise<Student[] | undefined>(store.get(IDB_WORKSPACE_KEYS.STUDENTS)),
      requestToPromise<Rubric[] | undefined>(store.get(IDB_WORKSPACE_KEYS.RUBRICS)),
      requestToPromise<SavedTestDefinition[] | undefined>(
        store.get(IDB_WORKSPACE_KEYS.SAVED_TESTS)
      ),
      requestToPromise<EvaluationRecord[] | undefined>(store.get(IDB_WORKSPACE_KEYS.EVALUATIONS)),
      requestToPromise<LocalImageIndex | undefined>(store.get(IDB_WORKSPACE_KEYS.IMAGE_INDEX)),
      requestToPromise<IdbWorkspaceMeta | undefined>(store.get(IDB_WORKSPACE_KEYS.META)),
    ]);

  await transactionDone(tx);

  const hasAnyCollection =
    meta !== undefined ||
    groups !== undefined ||
    students !== undefined ||
    rubrics !== undefined ||
    savedTests !== undefined;

  if (!hasAnyCollection) {
    return { hasData: false, state: null, meta: null };
  }

  const normalizedStudents = reconcileStudentEvaluations(
    Array.isArray(students) ? students : [],
    flatEvaluations
  );

  const hydrated = applyImageIndexToState(
    {
      groups: Array.isArray(groups) ? groups : [],
      students: normalizedStudents,
      rubrics: Array.isArray(rubrics) ? rubrics : [],
      savedTests: Array.isArray(savedTests) ? savedTests : [],
    },
    imageIndex
  );

  return {
    hasData: true,
    state: hydrated,
    meta: meta || null,
  };
}

/**
 * Atomically saves the entire workspace (groups, students, rubrics, savedTests,
 * flat evaluations index, local Base64 imageIndex, and metadata) into IndexedDB
 * with zero image pruning.
 */
export async function saveWorkspaceToIdb(
  state: IdbWorkspacePayload,
  options?: { migratedFromLocalStorageAt?: string }
): Promise<IdbWorkspaceMeta> {
  const db = await openEbaluazioaDb();
  const tx = db.transaction(IDB_STORES.WORKSPACE, 'readwrite');
  const store = tx.objectStore(IDB_STORES.WORKSPACE);

  const [existingMeta, existingImageIndex] = await Promise.all([
    requestToPromise<IdbWorkspaceMeta | undefined>(store.get(IDB_WORKSPACE_KEYS.META)),
    requestToPromise<LocalImageIndex | undefined>(store.get(IDB_WORKSPACE_KEYS.IMAGE_INDEX)),
  ]);

  const nextImageIndex = mergeIntoImageIndex(existingImageIndex, state);
  const rehydratedState = applyImageIndexToState(state, nextImageIndex);

  const flatEvaluations = collectFlatEvaluations(rehydratedState.students);
  const meta: IdbWorkspaceMeta = {
    schemaVersion: IDB_DB_VERSION,
    dbName: IDB_DB_NAME,
    migratedFromLocalStorageAt:
      options?.migratedFromLocalStorageAt || existingMeta?.migratedFromLocalStorageAt,
    updatedAt: new Date().toISOString(),
    groupCount: rehydratedState.groups.length,
    studentCount: rehydratedState.students.length,
    rubricCount: rehydratedState.rubrics.length,
    savedTestCount: rehydratedState.savedTests.length,
    evaluationCount: flatEvaluations.length,
    imageCount: countEmbeddedImages(rehydratedState),
  };

  store.put(rehydratedState.groups, IDB_WORKSPACE_KEYS.GROUPS);
  store.put(rehydratedState.students, IDB_WORKSPACE_KEYS.STUDENTS);
  store.put(rehydratedState.rubrics, IDB_WORKSPACE_KEYS.RUBRICS);
  store.put(rehydratedState.savedTests, IDB_WORKSPACE_KEYS.SAVED_TESTS);
  store.put(flatEvaluations, IDB_WORKSPACE_KEYS.EVALUATIONS);
  store.put(nextImageIndex, IDB_WORKSPACE_KEYS.IMAGE_INDEX);
  store.put(meta, IDB_WORKSPACE_KEYS.META);

  await transactionDone(tx);
  return meta;
}

/**
 * Store or retrieve any structured-cloneable handle (e.g. FileSystemFileHandle)
 * inside EbaluazioaLH6_DB -> fileHandles.
 */
export async function saveFileHandleToIdb<T>(key: string, handle: T): Promise<void> {
  const db = await openEbaluazioaDb();
  const tx = db.transaction(IDB_STORES.FILE_HANDLES, 'readwrite');
  tx.objectStore(IDB_STORES.FILE_HANDLES).put(handle, key);
  await transactionDone(tx);
}

export async function readFileHandleFromIdb<T>(key: string): Promise<T | null> {
  if (!isIndexedDbAvailable()) return null;
  try {
    const db = await openEbaluazioaDb();
    const tx = db.transaction(IDB_STORES.FILE_HANDLES, 'readonly');
    const result = await requestToPromise<T | undefined>(
      tx.objectStore(IDB_STORES.FILE_HANDLES).get(key)
    );
    await transactionDone(tx);
    return result ?? null;
  } catch {
    return null;
  }
}

export async function deleteFileHandleFromIdb(key: string): Promise<void> {
  if (!isIndexedDbAvailable()) return;
  const db = await openEbaluazioaDb();
  const tx = db.transaction(IDB_STORES.FILE_HANDLES, 'readwrite');
  tx.objectStore(IDB_STORES.FILE_HANDLES).delete(key);
  await transactionDone(tx);
}

/**
 * Ask the browser to mark this origin as persistent storage so IndexedDB
 * will not be automatically evicted under low disk space.
 */
export async function requestBrowserPersistentStorage(): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && navigator.storage?.persisted) {
      const already = await navigator.storage.persisted();
      if (already) return true;
      if (navigator.storage.persist) {
        return await navigator.storage.persist();
      }
    }
  } catch {
    // Ignore unsupported environments
  }
  return false;
}

export async function getIndexedDbStorageStats(
  currentState?: IdbWorkspacePayload
): Promise<IdbStorageStats> {
  let persistentGranted = false;
  let quotaMb: number | null = null;
  let estimatedUsageBytes: number | null = null;

  try {
    if (typeof navigator !== 'undefined' && navigator.storage) {
      if (navigator.storage.persisted) {
        persistentGranted = await navigator.storage.persisted();
      }
      if (navigator.storage.estimate) {
        const estimate = await navigator.storage.estimate();
        if (typeof estimate.quota === 'number' && estimate.quota > 0) {
          quotaMb = Math.round(estimate.quota / (1024 * 1024));
        }
        if (typeof estimate.usage === 'number' && estimate.usage >= 0) {
          estimatedUsageBytes = estimate.usage;
        }
      }
    }
  } catch {
    // Ignore estimation errors
  }

  let meta: IdbWorkspaceMeta | null = null;
  let stateToMeasure = currentState;

  if (isIndexedDbAvailable()) {
    try {
      const read = await readWorkspaceFromIdb();
      meta = read.meta;
      if (!stateToMeasure && read.state) {
        stateToMeasure = read.state;
      }
    } catch {
      // Ignore read errors
    }
  }

  let serializedBytes = 0;
  let evaluationCount = meta?.evaluationCount ?? 0;
  let imageCount = meta?.imageCount ?? 0;

  if (stateToMeasure) {
    try {
      const json = JSON.stringify(stateToMeasure);
      serializedBytes = new Blob([json]).size;
      evaluationCount = collectFlatEvaluations(stateToMeasure.students).length;
      imageCount = countEmbeddedImages(stateToMeasure);
    } catch {
      // Ignore measurement errors
    }
  }

  const usedBytes = Math.max(serializedBytes, estimatedUsageBytes ?? 0);
  const usedMb = Number((usedBytes / (1024 * 1024)).toFixed(2));
  const percent =
    quotaMb && quotaMb > 0 ? Math.min(100, Number(((usedMb / quotaMb) * 100).toFixed(1))) : 0;

  return {
    engine: isIndexedDbAvailable() ? 'indexeddb' : 'localstorage',
    dbName: IDB_DB_NAME,
    schemaVersion: IDB_DB_VERSION,
    usedBytes,
    usedMb,
    quotaMb,
    percent,
    persistentGranted,
    evaluationCount,
    imageCount,
    migratedFromLocalStorageAt: meta?.migratedFromLocalStorageAt,
  };
}
