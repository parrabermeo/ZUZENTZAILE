import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  setDoc,
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from '../firebase.js';
import type {
  ClassGroup,
  EvaluationRecord,
  GeminiModelId,
  Language,
  Rubric,
  SavedTestDefinition,
  StoredImageAsset,
  Student,
} from '../types';
import { createDefaultGroups } from '../data/sampleData';
import { setSyncedGeminiApiKey } from './geminiService';
import { migrateWorkspaceState, type WorkspaceState } from './storageService';
import {
  normalizeEvaluationRecord,
  normalizeSavedTestDefinition,
} from '../utils/subjects';

export const FIRESTORE_COLLECTIONS = {
  GROUPS: 'grupos',
  STUDENTS: 'alumnos',
  TESTS: 'pruebas',
  EVALUATIONS: 'evaluaciones',
  RUBRICS: 'rubricas',
  CONFIG: 'config',
} as const;

export const FIRESTORE_TEACHER_SETTINGS_DOC = 'teacherSettings' as const;

export interface CloudTeacherSettings {
  geminiApiKey?: string;
  geminiModel?: GeminiModelId;
  language?: Language;
  updatedAt?: string;
}

function isValidCloudGeminiModel(val: unknown): val is GeminiModelId {
  return val === 'gemini-4-hydrogen' || val === 'gemini-4-neon' || val === 'gemini-3.8-flash';
}

const MAX_BATCH_OPS = 350;

/**
 * Heavy image / Base64 keys that MUST NEVER be uploaded to Cloud Firestore.
 * All Base64 images stay exclusively in local IndexedDB (`EbaluazioaLH6_DB`)
 * and are rehydrated locally on read.
 */
const FORBIDDEN_FIRESTORE_IMAGE_KEYS = new Set<string>([
  'pruebaImagenes',
  'studentImages',
  'imageDataUrl',
  'referenceImages',
  'enunciadoImagenes',
  'imagenPrueba',
  'enunciadoImagen',
  'referenceImage',
  'testImages',
  'enunciadoFotos',
  'readingImages',
  'imagenEnunciado',
  'testImage',
]);

type FirestoreStudentDoc = Omit<Student, 'evaluations'>;

interface CollectionSnapshotMaps {
  grupos: Map<string, string>;
  alumnos: Map<string, string>;
  pruebas: Map<string, string>;
  evaluaciones: Map<string, string>;
  rubricas: Map<string, string>;
}

function createEmptyMaps(): CollectionSnapshotMaps {
  return {
    grupos: new Map(),
    alumnos: new Map(),
    pruebas: new Map(),
    evaluaciones: new Map(),
    rubricas: new Map(),
  };
}

let lastKnownDocs: CollectionSnapshotMaps = createEmptyMaps();
let syncWriteQueue: Promise<unknown> = Promise.resolve();
let activeLocalWriteCount = 0;
let lastLocalSyncFailed = false;
let pendingPostWriteCallback: (() => void) | null = null;

/**
 * Recursively strips `undefined` values AND any Base64 `data:image/...` strings
 * so Cloud Firestore documents are guaranteed lightweight (< 20 KB) and can NEVER
 * fail due to the 1 MB per-document limit.
 */
function stripUndefinedAndDataUrlsDeep<T>(value: T): T {
  if (typeof value === 'string') {
    if (value.startsWith('data:image/') || value.startsWith('data:application/')) {
      return '' as unknown as T;
    }
    return value;
  }
  if (Array.isArray(value)) {
    const cleanedArr = value
      .map((item) => stripUndefinedAndDataUrlsDeep(item))
      .filter((item) => item !== undefined && item !== '');
    return cleanedArr as unknown as T;
  }
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v === undefined) continue;
      if (FORBIDDEN_FIRESTORE_IMAGE_KEYS.has(k)) continue;
      if (typeof v === 'string' && (v.startsWith('data:image/') || v.startsWith('data:application/'))) {
        continue;
      }
      out[k] = stripUndefinedAndDataUrlsDeep(v);
    }
    return out as T;
  }
  return value;
}

function collectDriveUrls(assets?: StoredImageAsset[]): string[] {
  if (!Array.isArray(assets)) return [];
  const urls: string[] = [];
  for (const asset of assets) {
    if (asset?.driveUrl && typeof asset.driveUrl === 'string' && asset.driveUrl.startsWith('http')) {
      urls.push(asset.driveUrl);
    }
  }
  return urls;
}

/**
 * Builds a lightweight Cloud Firestore representation of an EvaluationRecord:
 * - Normalizes asignatura, language, type, modalidad, typology
 * - Strips ALL Base64 images (which remain preserved in IndexedDB)
 * - Keeps lightweight metadata (`hasLocalImage`, counts, and any Google Drive links)
 */
function sanitizeEvaluationForFirestore(record: EvaluationRecord, fallbackStudentId: string): EvaluationRecord {
  const normalized = normalizeEvaluationRecord({
    ...record,
    studentId: record.studentId || fallbackStudentId,
  });

  const refCount = normalized.pruebaImagenes?.length || normalized.localReferenceImageCount || 0;
  const stuCount = normalized.studentImages?.length || normalized.localStudentImageCount || 0;
  const hasLocalImage = Boolean(normalized.hasLocalImage || refCount > 0 || stuCount > 0);
  const driveUrls = Array.from(
    new Set([
      ...(normalized.driveImageUrls || []),
      ...collectDriveUrls(normalized.pruebaImagenes),
      ...collectDriveUrls(normalized.studentImages),
    ])
  );

  const stripped = stripUndefinedAndDataUrlsDeep({
    ...normalized,
    pruebaImagenes: undefined,
    studentImages: undefined,
    hasLocalImage: hasLocalImage || undefined,
    localReferenceImageCount: refCount > 0 ? refCount : undefined,
    localStudentImageCount: stuCount > 0 ? stuCount : undefined,
    driveImageUrls: driveUrls.length > 0 ? driveUrls : undefined,
  });

  return stripped;
}

function sanitizeSavedTestForFirestore(test: SavedTestDefinition): SavedTestDefinition {
  const normalized = normalizeSavedTestDefinition(test);
  const refCount = normalized.pruebaImagenes?.length || normalized.localReferenceImageCount || 0;
  const hasLocalImage = Boolean(normalized.hasLocalImage || refCount > 0);
  const driveUrls = Array.from(
    new Set([
      ...(normalized.driveImageUrls || []),
      ...collectDriveUrls(normalized.pruebaImagenes),
    ])
  );

  return stripUndefinedAndDataUrlsDeep({
    ...normalized,
    pruebaImagenes: undefined,
    hasLocalImage: hasLocalImage || undefined,
    localReferenceImageCount: refCount > 0 ? refCount : undefined,
    driveImageUrls: driveUrls.length > 0 ? driveUrls : undefined,
  });
}

function computeCanonicalMapsHash(maps: CollectionSnapshotMaps): string {
  const sortEntries = (m: Map<string, string>) =>
    Array.from(m.entries()).sort((a, b) => a[0].localeCompare(b[0]));

  return JSON.stringify([
    sortEntries(maps.grupos),
    sortEntries(maps.alumnos),
    sortEntries(maps.pruebas),
    sortEntries(maps.evaluaciones),
    sortEntries(maps.rubricas),
  ]);
}

function serializeWorkspaceToDocMaps(state: WorkspaceState): {
  rawDocs: {
    grupos: Map<string, ClassGroup>;
    alumnos: Map<string, FirestoreStudentDoc>;
    pruebas: Map<string, SavedTestDefinition>;
    evaluaciones: Map<string, EvaluationRecord>;
    rubricas: Map<string, Rubric>;
  };
  serialized: CollectionSnapshotMaps;
} {
  const rawDocs = {
    grupos: new Map<string, ClassGroup>(),
    alumnos: new Map<string, FirestoreStudentDoc>(),
    pruebas: new Map<string, SavedTestDefinition>(),
    evaluaciones: new Map<string, EvaluationRecord>(),
    rubricas: new Map<string, Rubric>(),
  };

  const serialized = createEmptyMaps();

  for (const grp of state.groups) {
    const clean = stripUndefinedAndDataUrlsDeep(grp);
    rawDocs.grupos.set(clean.id, clean);
    serialized.grupos.set(clean.id, JSON.stringify(clean));
  }

  for (const st of state.students) {
    const { evaluations, ...studentMeta } = st;
    const cleanStudent = stripUndefinedAndDataUrlsDeep(studentMeta);
    rawDocs.alumnos.set(cleanStudent.id, cleanStudent);
    serialized.alumnos.set(cleanStudent.id, JSON.stringify(cleanStudent));

    for (const ev of evaluations || []) {
      const cleanEv = sanitizeEvaluationForFirestore(ev, st.id);
      rawDocs.evaluaciones.set(cleanEv.id, cleanEv);
      serialized.evaluaciones.set(cleanEv.id, JSON.stringify(cleanEv));
    }
  }

  for (const test of state.savedTests || []) {
    const cleanTest = sanitizeSavedTestForFirestore(test);
    rawDocs.pruebas.set(cleanTest.id, cleanTest);
    serialized.pruebas.set(cleanTest.id, JSON.stringify(cleanTest));
  }

  for (const rub of state.rubrics || []) {
    const cleanRub = stripUndefinedAndDataUrlsDeep(rub);
    rawDocs.rubricas.set(cleanRub.id, cleanRub);
    serialized.rubricas.set(cleanRub.id, JSON.stringify(cleanRub));
  }

  return { rawDocs, serialized };
}

/**
 * Persists the teacher's Gemini API key (and model/language preference) into
 * Cloud Firestore `config/teacherSettings` using `{ merge: true }`.
 */
export async function saveTeacherSettingsToFirestore(
  settings: Partial<CloudTeacherSettings>
): Promise<void> {
  const payload = stripUndefinedAndDataUrlsDeep({
    ...settings,
    updatedAt: new Date().toISOString(),
  });
  await setDoc(doc(db, FIRESTORE_COLLECTIONS.CONFIG, FIRESTORE_TEACHER_SETTINGS_DOC), payload, {
    merge: true,
  });
}

/**
 * Subscribes in real time (`onSnapshot`) to `config/teacherSettings`.
 * - If Firestore already holds a non-empty `geminiApiKey`, updates `geminiService`
 *   and notifies the app immediately (which also caches it in localStorage for offline use).
 * - If Firestore does NOT yet have a key, and a local/env key exists, uploads it once
 *   automatically via `setDoc(..., { merge: true })`.
 */
export function subscribeToTeacherSettings(
  localFallbackKey: string,
  onRemoteSettings: (data: CloudTeacherSettings) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  const ref = doc(db, FIRESTORE_COLLECTIONS.CONFIG, FIRESTORE_TEACHER_SETTINGS_DOC);
  let seededLocalKey = false;

  return onSnapshot(
    ref,
    (snap) => {
      const data = snap.exists() ? (snap.data() as Record<string, unknown>) : null;
      const remoteKey = typeof data?.geminiApiKey === 'string' ? data.geminiApiKey.trim() : '';
      const remoteModel = isValidCloudGeminiModel(data?.geminiModel)
        ? data.geminiModel
        : undefined;

      if (remoteKey) {
        setSyncedGeminiApiKey(remoteKey);
        onRemoteSettings({
          geminiApiKey: remoteKey,
          geminiModel: remoteModel,
        });
        return;
      }

      const cleanLocal = localFallbackKey.trim();
      if (cleanLocal && !seededLocalKey) {
        seededLocalKey = true;
        setSyncedGeminiApiKey(cleanLocal);
        void saveTeacherSettingsToFirestore({ geminiApiKey: cleanLocal }).catch((err) => {
          console.error('[Firestore seed teacherSettings]', err);
          onError?.(err instanceof Error ? err : new Error(String(err)));
        });
      }
    },
    (err) => {
      console.error('[Firestore teacherSettings onSnapshot]', err);
      onError?.(err);
    }
  );
}

interface PendingBatchOp {
  type: 'set' | 'delete';
  collectionName: string;
  id: string;
  data?: Record<string, unknown>;
}

async function commitBatchedOps(ops: PendingBatchOp[]): Promise<void> {
  if (ops.length === 0) return;

  for (let i = 0; i < ops.length; i += MAX_BATCH_OPS) {
    const chunk = ops.slice(i, i + MAX_BATCH_OPS);
    const batch = writeBatch(db);
    for (const op of chunk) {
      const ref = doc(db, op.collectionName, op.id);
      if (op.type === 'set' && op.data) {
        batch.set(ref, op.data);
      } else if (op.type === 'delete') {
        batch.delete(ref);
      }
    }
    await batch.commit();
  }
}

export function resetFirestoreSyncCache(): void {
  lastKnownDocs = createEmptyMaps();
  activeLocalWriteCount = 0;
  lastLocalSyncFailed = false;
  pendingPostWriteCallback = null;
}

/**
 * First-login safe migration: checks if all 5 Firestore collections are completely empty.
 * If Firestore is empty and local IndexedDB / localStorage has data (groups, students,
 * saved tests, evaluations, rubrics), uploads 100% of them to Firestore WITHOUT Base64
 * blobs (which remain safely in local IndexedDB).
 */
export async function seedFirestoreIfEmpty(localState: WorkspaceState): Promise<{
  uploaded: boolean;
  counts: { groups: number; students: number; tests: number; evaluations: number; rubrics: number };
}> {
  const [gSnap, sSnap, tSnap, eSnap, rSnap] = await Promise.all([
    getDocs(collection(db, FIRESTORE_COLLECTIONS.GROUPS)),
    getDocs(collection(db, FIRESTORE_COLLECTIONS.STUDENTS)),
    getDocs(collection(db, FIRESTORE_COLLECTIONS.TESTS)),
    getDocs(collection(db, FIRESTORE_COLLECTIONS.EVALUATIONS)),
    getDocs(collection(db, FIRESTORE_COLLECTIONS.RUBRICS)),
  ]);

  const firestoreIsEmpty =
    gSnap.empty && sSnap.empty && tSnap.empty && eSnap.empty && rSnap.empty;

  const totalLocalEvals = localState.students.reduce(
    (acc, s) => acc + (s.evaluations?.length || 0),
    0
  );
  const hasLocalData =
    localState.students.length > 0 ||
    localState.savedTests.length > 0 ||
    localState.rubrics.length > 0 ||
    totalLocalEvals > 0 ||
    localState.groups.length > 0;

  if (!firestoreIsEmpty || !hasLocalData) {
    return {
      uploaded: false,
      counts: { groups: 0, students: 0, tests: 0, evaluations: 0, rubrics: 0 },
    };
  }

  const { rawDocs, serialized } = serializeWorkspaceToDocMaps(localState);
  const ops: PendingBatchOp[] = [];

  for (const [id, data] of rawDocs.grupos.entries()) {
    ops.push({
      type: 'set',
      collectionName: FIRESTORE_COLLECTIONS.GROUPS,
      id,
      data: data as unknown as Record<string, unknown>,
    });
  }
  for (const [id, data] of rawDocs.alumnos.entries()) {
    ops.push({
      type: 'set',
      collectionName: FIRESTORE_COLLECTIONS.STUDENTS,
      id,
      data: data as unknown as Record<string, unknown>,
    });
  }
  for (const [id, data] of rawDocs.pruebas.entries()) {
    ops.push({
      type: 'set',
      collectionName: FIRESTORE_COLLECTIONS.TESTS,
      id,
      data: data as unknown as Record<string, unknown>,
    });
  }
  for (const [id, data] of rawDocs.evaluaciones.entries()) {
    ops.push({
      type: 'set',
      collectionName: FIRESTORE_COLLECTIONS.EVALUATIONS,
      id,
      data: data as unknown as Record<string, unknown>,
    });
  }
  for (const [id, data] of rawDocs.rubricas.entries()) {
    ops.push({
      type: 'set',
      collectionName: FIRESTORE_COLLECTIONS.RUBRICS,
      id,
      data: data as unknown as Record<string, unknown>,
    });
  }

  activeLocalWriteCount += 1;
  try {
    await commitBatchedOps(ops);
    lastKnownDocs = serialized;
    lastLocalSyncFailed = false;
  } finally {
    activeLocalWriteCount = Math.max(0, activeLocalWriteCount - 1);
  }

  const hasMeaningfulUserRecords =
    rawDocs.alumnos.size > 0 ||
    rawDocs.pruebas.size > 0 ||
    rawDocs.evaluaciones.size > 0 ||
    rawDocs.rubricas.size > 0;

  return {
    uploaded: hasMeaningfulUserRecords,
    counts: {
      groups: rawDocs.grupos.size,
      students: rawDocs.alumnos.size,
      tests: rawDocs.pruebas.size,
      evaluations: rawDocs.evaluaciones.size,
      rubrics: rawDocs.rubricas.size,
    },
  };
}

/**
 * Computes a minimal diff against lastKnownDocs and persists ONLY changed/added/deleted
 * lightweight documents (NEVER Base64 images) across all 5 Firestore collections.
 * Protects local state against intermediate `onSnapshot` race conditions while committing.
 */
export function syncWorkspaceDiffToFirestore(state: WorkspaceState): Promise<void> {
  // Increment synchronously BEFORE queueing so no pending onSnapshot debounce timer can overwrite React state
  activeLocalWriteCount += 1;

  const run = async () => {
    try {
      const { rawDocs, serialized } = serializeWorkspaceToDocMaps(state);
      const ops: PendingBatchOp[] = [];

      const collections: Array<{
        key: keyof CollectionSnapshotMaps;
        name: string;
        map: Map<string, unknown>;
      }> = [
        { key: 'grupos', name: FIRESTORE_COLLECTIONS.GROUPS, map: rawDocs.grupos },
        { key: 'alumnos', name: FIRESTORE_COLLECTIONS.STUDENTS, map: rawDocs.alumnos },
        { key: 'pruebas', name: FIRESTORE_COLLECTIONS.TESTS, map: rawDocs.pruebas },
        { key: 'evaluaciones', name: FIRESTORE_COLLECTIONS.EVALUATIONS, map: rawDocs.evaluaciones },
        { key: 'rubricas', name: FIRESTORE_COLLECTIONS.RUBRICS, map: rawDocs.rubricas },
      ];

      for (const col of collections) {
        const prevMap = lastKnownDocs[col.key];
        const nextSerializedMap = serialized[col.key];

        for (const [id, nextJson] of nextSerializedMap.entries()) {
          if (prevMap.get(id) !== nextJson) {
            ops.push({
              type: 'set',
              collectionName: col.name,
              id,
              data: col.map.get(id) as Record<string, unknown>,
            });
          }
        }

        for (const prevId of prevMap.keys()) {
          if (!nextSerializedMap.has(prevId)) {
            ops.push({
              type: 'delete',
              collectionName: col.name,
              id: prevId,
            });
          }
        }
      }

      if (ops.length === 0) {
        lastLocalSyncFailed = false;
        return;
      }

      await commitBatchedOps(ops);
      lastKnownDocs = serialized;
      lastLocalSyncFailed = false;
    } catch (err) {
      lastLocalSyncFailed = true;
      console.error('[Firestore syncWorkspaceDiffToFirestore] Write failed:', err);
      throw err instanceof Error ? err : new Error(String(err));
    } finally {
      activeLocalWriteCount = Math.max(0, activeLocalWriteCount - 1);
      if (activeLocalWriteCount === 0 && pendingPostWriteCallback) {
        const cb = pendingPostWriteCallback;
        pendingPostWriteCallback = null;
        cb();
      }
    }
  };

  const next = syncWriteQueue.then(run, run);
  syncWriteQueue = next.catch(() => undefined);
  return next;
}

/**
 * Attaches real-time `onSnapshot` listeners to all 5 Firestore collections
 * (`grupos`, `alumnos`, `pruebas`, `evaluaciones`, `rubricas`).
 *
 * Race-condition & data-loss protections:
 * - Coalesces multi-collection emissions with a 200ms debounce so a batch writing
 *   `alumnos` + `evaluaciones` NEVER emits a partial intermediate state missing the new evaluation.
 * - Defers snapshot emission while a local `writeBatch` is in-flight (`activeLocalWriteCount > 0`).
 * - Never overwrites local React state if the incoming snapshot matches our already-committed
 *   `lastKnownDocs` hash (echo suppression), or if the last local write failed (`lastLocalSyncFailed`).
 */
export function subscribeToFirestoreWorkspace(
  onUpdate: (state: WorkspaceState) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  const groupsMap = new Map<string, ClassGroup>();
  const studentsMap = new Map<string, FirestoreStudentDoc>();
  const testsMap = new Map<string, SavedTestDefinition>();
  const evalsMap = new Map<string, EvaluationRecord>();
  const rubricsMap = new Map<string, Rubric>();

  const ready = {
    grupos: false,
    alumnos: false,
    pruebas: false,
    evaluaciones: false,
    rubricas: false,
  };

  let initialEmissionDone = false;
  let lastEmittedHash = '';
  let emitTimer: number | null = null;
  let disposed = false;

  const flushEmit = () => {
    if (disposed) return;
    if (
      !ready.grupos ||
      !ready.alumnos ||
      !ready.pruebas ||
      !ready.evaluaciones ||
      !ready.rubricas
    ) {
      return;
    }

    // Never overwrite React state mid-write; wait until the active local batch finishes
    if (activeLocalWriteCount > 0) {
      pendingPostWriteCallback = scheduleEmit;
      return;
    }

    // Never clobber unsaved local edits if the previous Firestore write failed
    if (lastLocalSyncFailed && initialEmissionDone) {
      return;
    }

    const evalsByStudent = new Map<string, EvaluationRecord[]>();
    for (const ev of evalsMap.values()) {
      if (!ev || typeof ev.studentId !== 'string') continue;
      const list = evalsByStudent.get(ev.studentId) || [];
      list.push(ev);
      evalsByStudent.set(ev.studentId, list);
    }

    const groups = Array.from(groupsMap.values()).sort((a, b) =>
      (a.createdAt || '').localeCompare(b.createdAt || '')
    );
    const students: Student[] = Array.from(studentsMap.values())
      .map((st) => ({
        ...st,
        evaluations: (evalsByStudent.get(st.id) || []).sort((a, b) => {
          const d = (a.date || '').localeCompare(b.date || '');
          if (d !== 0) return d;
          return (a.createdAt || '').localeCompare(b.createdAt || '');
        }),
      }))
      .sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));

    const savedTests = Array.from(testsMap.values()).sort((a, b) =>
      (b.date || '').localeCompare(a.date || '')
    );
    const rubrics = Array.from(rubricsMap.values()).sort((a, b) =>
      (a.createdAt || '').localeCompare(b.createdAt || '')
    );

    const rawState: WorkspaceState = {
      groups: groups.length > 0 ? groups : createDefaultGroups(),
      students,
      rubrics,
      savedTests,
    };

    const { state: migrated } = migrateWorkspaceState(rawState);
    const { serialized } = serializeWorkspaceToDocMaps(migrated);
    const incomingHash = computeCanonicalMapsHash(serialized);
    const knownHash = computeCanonicalMapsHash(lastKnownDocs);

    // If this snapshot is merely an echo of our own just-committed local write, skip React overwrite!
    if (initialEmissionDone && (incomingHash === lastEmittedHash || incomingHash === knownHash)) {
      lastKnownDocs = serialized;
      lastEmittedHash = incomingHash;
      return;
    }

    lastKnownDocs = serialized;
    lastEmittedHash = incomingHash;
    initialEmissionDone = true;
    onUpdate(migrated);
  };

  const scheduleEmit = () => {
    if (disposed) return;
    if (emitTimer !== null) {
      window.clearTimeout(emitTimer);
    }
    emitTimer = window.setTimeout(() => {
      emitTimer = null;
      flushEmit();
    }, 200);
  };

  const handleErr = (err: Error) => {
    console.error('[Firestore onSnapshot]', err);
    onError?.(err);
  };

  const unsubs: Unsubscribe[] = [
    onSnapshot(
      collection(db, FIRESTORE_COLLECTIONS.GROUPS),
      (snap) => {
        groupsMap.clear();
        snap.forEach((d) => {
          const data = d.data() as ClassGroup;
          groupsMap.set(d.id, { ...data, id: data.id || d.id });
        });
        ready.grupos = true;
        scheduleEmit();
      },
      handleErr
    ),
    onSnapshot(
      collection(db, FIRESTORE_COLLECTIONS.STUDENTS),
      (snap) => {
        studentsMap.clear();
        snap.forEach((d) => {
          const data = d.data() as FirestoreStudentDoc;
          studentsMap.set(d.id, { ...data, id: data.id || d.id });
        });
        ready.alumnos = true;
        scheduleEmit();
      },
      handleErr
    ),
    onSnapshot(
      collection(db, FIRESTORE_COLLECTIONS.TESTS),
      (snap) => {
        testsMap.clear();
        snap.forEach((d) => {
          const data = d.data() as SavedTestDefinition;
          testsMap.set(d.id, { ...data, id: data.id || d.id });
        });
        ready.pruebas = true;
        scheduleEmit();
      },
      handleErr
    ),
    onSnapshot(
      collection(db, FIRESTORE_COLLECTIONS.EVALUATIONS),
      (snap) => {
        evalsMap.clear();
        snap.forEach((d) => {
          const data = d.data() as EvaluationRecord;
          evalsMap.set(d.id, { ...data, id: data.id || d.id });
        });
        ready.evaluaciones = true;
        scheduleEmit();
      },
      handleErr
    ),
    onSnapshot(
      collection(db, FIRESTORE_COLLECTIONS.RUBRICS),
      (snap) => {
        rubricsMap.clear();
        snap.forEach((d) => {
          const data = d.data() as Rubric;
          rubricsMap.set(d.id, { ...data, id: data.id || d.id });
        });
        ready.rubricas = true;
        scheduleEmit();
      },
      handleErr
    ),
  ];

  return () => {
    disposed = true;
    if (emitTimer !== null) {
      window.clearTimeout(emitTimer);
      emitTimer = null;
    }
    pendingPostWriteCallback = null;
    unsubs.forEach((u) => u());
  };
}
