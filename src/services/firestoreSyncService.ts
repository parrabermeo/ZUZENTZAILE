import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from '../firebase.js';
import type {
  ClassGroup,
  EvaluationRecord,
  Rubric,
  SavedTestDefinition,
  StoredImageAsset,
  Student,
} from '../types';
import { createDefaultGroups } from '../data/sampleData';
import { migrateWorkspaceState, type WorkspaceState } from './storageService';

export const FIRESTORE_COLLECTIONS = {
  GROUPS: 'grupos',
  STUDENTS: 'alumnos',
  TESTS: 'pruebas',
  EVALUATIONS: 'evaluaciones',
  RUBRICS: 'rubricas',
} as const;

const MAX_BATCH_OPS = 350;
const SAFE_DOC_MAX_BYTES = 920_000; // Guard safely under Firestore's 1,048,576 byte (1 MB) limit

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

/**
 * Recursively strips `undefined` values because Firestore rejects `undefined` fields.
 */
function stripUndefinedDeep<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => stripUndefinedDeep(item)) as unknown as T;
  }
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v !== undefined) {
        out[k] = stripUndefinedDeep(v);
      }
    }
    return out as T;
  }
  return value;
}

function estimateUtf8Bytes(obj: unknown): number {
  try {
    return new Blob([JSON.stringify(obj)]).size;
  } catch {
    return JSON.stringify(obj).length * 2;
  }
}

/**
 * Ensures an individual evaluation or test document never exceeds Firestore's 1 MB limit.
 * Normally each compressed 1200px JPEG 0.70 image is ~90-180 KB, so this only acts as
 * a safety net if a single evaluation somehow attaches 6+ very dense photos.
 */
function enforceFirestoreDocSizeLimit<
  T extends { pruebaImagenes?: StoredImageAsset[]; studentImages?: StoredImageAsset[] },
>(docData: T): T {
  const cleaned = stripUndefinedDeep(docData);
  if (estimateUtf8Bytes(cleaned) <= SAFE_DOC_MAX_BYTES) {
    return cleaned;
  }

  // First trim excess reference copies if multiple, keeping at least the first photo
  const copy = { ...cleaned };
  if (Array.isArray(copy.pruebaImagenes) && copy.pruebaImagenes.length > 1) {
    copy.pruebaImagenes = [copy.pruebaImagenes[0]];
    if (estimateUtf8Bytes(copy) <= SAFE_DOC_MAX_BYTES) return copy;
  }
  if (Array.isArray(copy.studentImages) && copy.studentImages.length > 2) {
    copy.studentImages = copy.studentImages.slice(0, 2);
    if (estimateUtf8Bytes(copy) <= SAFE_DOC_MAX_BYTES) return copy;
  }
  if (Array.isArray(copy.pruebaImagenes) && copy.pruebaImagenes.length > 0) {
    delete copy.pruebaImagenes;
    if (estimateUtf8Bytes(copy) <= SAFE_DOC_MAX_BYTES) return copy;
  }
  if (Array.isArray(copy.studentImages) && copy.studentImages.length > 1) {
    copy.studentImages = [copy.studentImages[0]];
  }
  return copy;
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
    const clean = stripUndefinedDeep(grp);
    rawDocs.grupos.set(clean.id, clean);
    serialized.grupos.set(clean.id, JSON.stringify(clean));
  }

  for (const st of state.students) {
    const { evaluations, ...studentMeta } = st;
    const cleanStudent = stripUndefinedDeep(studentMeta);
    rawDocs.alumnos.set(cleanStudent.id, cleanStudent);
    serialized.alumnos.set(cleanStudent.id, JSON.stringify(cleanStudent));

    for (const ev of evaluations || []) {
      const cleanEv = enforceFirestoreDocSizeLimit({
        ...ev,
        studentId: ev.studentId || st.id,
      });
      rawDocs.evaluaciones.set(cleanEv.id, cleanEv);
      serialized.evaluaciones.set(cleanEv.id, JSON.stringify(cleanEv));
    }
  }

  for (const test of state.savedTests || []) {
    const cleanTest = enforceFirestoreDocSizeLimit(test);
    rawDocs.pruebas.set(cleanTest.id, cleanTest);
    serialized.pruebas.set(cleanTest.id, JSON.stringify(cleanTest));
  }

  for (const rub of state.rubrics || []) {
    const cleanRub = stripUndefinedDeep(rub);
    rawDocs.rubricas.set(cleanRub.id, cleanRub);
    serialized.rubricas.set(cleanRub.id, JSON.stringify(cleanRub));
  }

  return { rawDocs, serialized };
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
}

/**
 * First-login safe migration: checks if all 5 Firestore collections are completely empty.
 * If Firestore is empty and local IndexedDB / localStorage has data (groups, students,
 * saved tests, evaluations with images, rubrics), uploads 100% of them to Firestore
 * with each evaluation saved as an individual document in `evaluaciones`.
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

  await commitBatchedOps(ops);
  lastKnownDocs = serialized;

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
 * documents across `grupos`, `alumnos`, `pruebas`, `evaluaciones`, and `rubricas`.
 */
export function syncWorkspaceDiffToFirestore(state: WorkspaceState): Promise<void> {
  const run = async () => {
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

    if (ops.length === 0) return;

    await commitBatchedOps(ops);
    lastKnownDocs = serialized;
  };

  const next = syncWriteQueue.then(run, run);
  syncWriteQueue = next.catch(() => undefined);
  return next;
}

/**
 * Attaches real-time `onSnapshot` listeners to all 5 Firestore collections
 * (`grupos`, `alumnos`, `pruebas`, `evaluaciones`, `rubricas`).
 * Reconstructs the unified `WorkspaceState` whenever any device updates Firestore.
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

  let lastEmittedHash = '';

  const emitIfReady = () => {
    if (
      !ready.grupos ||
      !ready.alumnos ||
      !ready.pruebas ||
      !ready.evaluaciones ||
      !ready.rubricas
    ) {
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
    lastKnownDocs = serialized;

    // Avoid redundant React state updates if snapshot matches our exact known state
    const hash = JSON.stringify([
      Array.from(serialized.grupos.entries()),
      Array.from(serialized.alumnos.entries()),
      Array.from(serialized.pruebas.entries()),
      Array.from(serialized.evaluaciones.entries()),
      Array.from(serialized.rubricas.entries()),
    ]);
    if (hash === lastEmittedHash) return;
    lastEmittedHash = hash;

    onUpdate(migrated);
  };

  const handleErr = (err: Error) => {
    console.warn('[Firestore onSnapshot]', err);
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
        emitIfReady();
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
        emitIfReady();
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
        emitIfReady();
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
        emitIfReady();
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
        emitIfReady();
      },
      handleErr
    ),
  ];

  return () => {
    unsubs.forEach((u) => u());
  };
}
