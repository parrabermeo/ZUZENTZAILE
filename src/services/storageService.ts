import { initializeApp, getApps, deleteApp, type FirebaseApp } from 'firebase/app';
import { getFirestore, doc, getDoc, setDoc, type Firestore } from 'firebase/firestore';
import type {
  AppSettings,
  BackupPayload,
  ClassGroup,
  EvaluationRecord,
  FirebaseRuntimeConfig,
  Rubric,
  SavedTestDefinition,
  StorageMode,
  Student,
} from '../types';
import { DEFAULT_GEMINI_MODEL } from './geminiService';
import { createDefaultGroups } from '../data/sampleData';
import { findMatchingStudentEmail } from '../data/studentEmailDirectory';
import { languageToSubject, skillToModalityEs } from '../utils/subjects';
import { extractReferenceImagesFromRecord } from '../utils/referenceImages';
import {
  IDB_DB_NAME,
  IDB_DB_VERSION,
  isIndexedDbAvailable,
  readWorkspaceFromIdb,
  requestBrowserPersistentStorage,
  saveWorkspaceToIdb,
} from './indexedDbService';

const STORAGE_KEYS = {
  GROUPS: 'lh6_ebaluatzailea_groups_v1',
  STUDENTS: 'lh6_ebaluatzailea_students_v1',
  RUBRICS: 'lh6_ebaluatzailea_rubrics_v1',
  TESTS: 'lh6_ebaluatzailea_tests_v1',
  SETTINGS: 'lh6_ebaluatzailea_settings_v1',
} as const;

const FIRESTORE_COLLECTION = 'lh6_ebaluatzailea_workspaces';
const FIRESTORE_DOC_ID = 'default_workspace';
const FIRESTORE_TIMEOUT_MS = 3500;

export interface WorkspaceState {
  groups: ClassGroup[];
  students: Student[];
  rubrics: Rubric[];
  savedTests: SavedTestDefinition[];
}

export interface StorageLoadResult {
  state: WorkspaceState;
  mode: StorageMode;
  migratedFromLocalStorage?: boolean;
  error?: string;
}

let cachedApp: FirebaseApp | null = null;
let cachedDb: Firestore | null = null;
let cachedConfigKey = '';

export function getEnvFirebaseConfig(): FirebaseRuntimeConfig | undefined {
  const apiKey = import.meta.env.VITE_FIREBASE_API_KEY?.trim();
  const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID?.trim();
  if (!apiKey || !projectId) return undefined;

  return {
    apiKey,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN?.trim() || `${projectId}.firebaseapp.com`,
    projectId,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET?.trim() || '',
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID?.trim() || '',
    appId: import.meta.env.VITE_FIREBASE_APP_ID?.trim() || '',
  };
}

export function resolveFirebaseConfig(settings?: AppSettings): FirebaseRuntimeConfig | undefined {
  const manual = settings?.firebaseConfig;
  if (manual?.apiKey?.trim() && manual?.projectId?.trim()) {
    return manual;
  }
  return getEnvFirebaseConfig();
}

async function getFirestoreInstance(config: FirebaseRuntimeConfig): Promise<Firestore> {
  const configKey = `${config.projectId}:${config.apiKey}`;
  if (cachedDb && cachedConfigKey === configKey) {
    return cachedDb;
  }

  if (cachedApp) {
    try {
      await deleteApp(cachedApp);
    } catch {
      // Ignore cleanup errors
    }
    cachedApp = null;
    cachedDb = null;
  }

  const existing = getApps().find((a) => a.name === 'lh6-ebaluatzailea');
  const app = existing || initializeApp(config, 'lh6-ebaluatzailea');
  cachedApp = app;
  cachedDb = getFirestore(app);
  cachedConfigKey = configKey;
  return cachedDb;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Firestore timeout')), ms);
    promise
      .then((val) => {
        clearTimeout(timer);
        resolve(val);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

const CURRENT_SETTINGS_VERSION = 2;

function isValidGeminiModel(val: unknown): val is AppSettings['geminiModel'] {
  return val === 'gemini-4-hydrogen' || val === 'gemini-4-neon' || val === 'gemini-3.8-flash';
}

export function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.SETTINGS);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<AppSettings> & { settingsVersion?: number };
      const isMigrated = (parsed.settingsVersion ?? 1) >= CURRENT_SETTINGS_VERSION;
      const resolvedModel = isMigrated
        ? isValidGeminiModel(parsed.geminiModel)
          ? parsed.geminiModel
          : DEFAULT_GEMINI_MODEL
        : DEFAULT_GEMINI_MODEL;

      const normalized: AppSettings = {
        language: parsed.language === 'es' ? 'es' : 'eu',
        geminiModel: resolvedModel,
        geminiApiKey: typeof parsed.geminiApiKey === 'string' ? parsed.geminiApiKey : '',
        firebaseConfig: parsed.firebaseConfig,
      };

      if (!isMigrated) {
        saveSettings(normalized);
      }
      return normalized;
    }
  } catch {
    // Fallback to defaults
  }

  return {
    language: 'eu',
    geminiModel: DEFAULT_GEMINI_MODEL,
    geminiApiKey: '',
  };
}

export function saveSettings(settings: AppSettings): void {
  try {
    localStorage.setItem(
      STORAGE_KEYS.SETTINGS,
      JSON.stringify({ ...settings, settingsVersion: CURRENT_SETTINGS_VERSION })
    );
  } catch {
    // Ignore quota errors
  }
}

/**
 * Automatic migration for existing saved evaluations & rubrics:
 * Any previously saved evaluation without `asignatura` (e.g. "Futbol Partida")
 * is automatically classified as `asignatura: 'euskera'` and `modalidad: 'comprension'` (`type: 'reading'`, `language: 'eu'`)
 * without losing any grade, image, transcription, or feedback.
 */
export function migrateWorkspaceState(state: WorkspaceState): {
  state: WorkspaceState;
  migrated: boolean;
} {
  let migrated = false;

  const migratedStudents: Student[] = state.students.map((student) => {
    const evals = Array.isArray(student.evaluations) ? student.evaluations : [];
    let studentChanged = false;

    const nextEvals: EvaluationRecord[] = evals.map((ev) => {
      let updated = ev;
      if (!updated.asignatura) {
        migrated = true;
        studentChanged = true;
        updated = {
          ...updated,
          asignatura: 'euskera',
          modalidad: 'comprension',
          type: 'reading',
          language: 'eu',
        };
      } else if (!updated.modalidad) {
        migrated = true;
        studentChanged = true;
        updated = {
          ...updated,
          modalidad: skillToModalityEs(updated.type),
        };
      }

      // Recover any legacy reference image field into canonical `pruebaImagenes`
      if (!updated.pruebaImagenes || updated.pruebaImagenes.length === 0) {
        const recovered = extractReferenceImagesFromRecord(updated, `rec-${updated.id}`);
        if (recovered.length > 0) {
          migrated = true;
          studentChanged = true;
          updated = {
            ...updated,
            pruebaImagenes: recovered,
          };
        }
      }

      return updated;
    });

    // Auto-link student email from the initial Excel roster directory if missing (non-destructive)
    let resolvedEmail = student.email?.trim() || undefined;
    if (!resolvedEmail) {
      const matchedEmail = findMatchingStudentEmail(student.fullName);
      if (matchedEmail) {
        resolvedEmail = matchedEmail;
        migrated = true;
        studentChanged = true;
      }
    }

    return studentChanged
      ? {
          ...student,
          ...(resolvedEmail ? { email: resolvedEmail } : {}),
          evaluations: nextEvals,
        }
      : student;
  });

  const migratedRubrics: Rubric[] = state.rubrics.map((r) => {
    if (!r.asignatura) {
      migrated = true;
      return {
        ...r,
        asignatura: languageToSubject(r.language),
      };
    }
    return r;
  });

  return {
    state: migrated
      ? {
          groups: state.groups,
          students: migratedStudents,
          rubrics: migratedRubrics,
          savedTests: state.savedTests || [],
        }
      : state,
    migrated,
  };
}

export function hasLegacyLocalStorageData(): boolean {
  try {
    return Boolean(
      localStorage.getItem(STORAGE_KEYS.GROUPS) ||
        localStorage.getItem(STORAGE_KEYS.STUDENTS) ||
        localStorage.getItem(STORAGE_KEYS.RUBRICS) ||
        localStorage.getItem(STORAGE_KEYS.TESTS)
    );
  } catch {
    return false;
  }
}

export function loadLocalWorkspace(options?: { persistMigrationToLocalStorage?: boolean }): WorkspaceState {
  try {
    const rawGroups = localStorage.getItem(STORAGE_KEYS.GROUPS);
    const rawStudents = localStorage.getItem(STORAGE_KEYS.STUDENTS);
    const rawRubrics = localStorage.getItem(STORAGE_KEYS.RUBRICS);
    const rawTests = localStorage.getItem(STORAGE_KEYS.TESTS);

    const groups: ClassGroup[] = rawGroups ? JSON.parse(rawGroups) : createDefaultGroups();
    const students: Student[] = rawStudents ? JSON.parse(rawStudents) : [];
    const rubrics: Rubric[] = rawRubrics ? JSON.parse(rawRubrics) : [];
    const savedTests: SavedTestDefinition[] = rawTests ? JSON.parse(rawTests) : [];

    const baseState: WorkspaceState = {
      groups: Array.isArray(groups) && groups.length > 0 ? groups : createDefaultGroups(),
      students: Array.isArray(students) ? students : [],
      rubrics: Array.isArray(rubrics) ? rubrics : [],
      savedTests: Array.isArray(savedTests) ? savedTests : [],
    };

    const { state: migratedState, migrated } = migrateWorkspaceState(baseState);
    if (migrated && options?.persistMigrationToLocalStorage) {
      saveLocalWorkspace(migratedState);
    }
    return migratedState;
  } catch {
    return {
      groups: createDefaultGroups(),
      students: [],
      rubrics: [],
      savedTests: [],
    };
  }
}

export function saveLocalWorkspace(state: WorkspaceState): void {
  try {
    localStorage.setItem(STORAGE_KEYS.GROUPS, JSON.stringify(state.groups));
    localStorage.setItem(STORAGE_KEYS.STUDENTS, JSON.stringify(state.students));
    localStorage.setItem(STORAGE_KEYS.RUBRICS, JSON.stringify(state.rubrics));
    localStorage.setItem(STORAGE_KEYS.TESTS, JSON.stringify(state.savedTests || []));
  } catch {
    // If localStorage quota (~5MB) is exceeded due to many stored images,
    // gracefully prune image blobs from older evaluations while preserving 100% of grades & feedback.
    try {
      const prunedStudents: Student[] = state.students.map((st) => ({
        ...st,
        evaluations: st.evaluations.map((ev, idx, arr) => {
          // Keep images on the most recent evaluation per student; prune older blobs if needed
          if (idx < arr.length - 1) {
            return {
              ...ev,
              pruebaImagenes: undefined,
              studentImages: undefined,
            };
          }
          return ev;
        }),
      }));
      localStorage.setItem(STORAGE_KEYS.GROUPS, JSON.stringify(state.groups));
      localStorage.setItem(STORAGE_KEYS.STUDENTS, JSON.stringify(prunedStudents));
      localStorage.setItem(STORAGE_KEYS.RUBRICS, JSON.stringify(state.rubrics));
      localStorage.setItem(STORAGE_KEYS.TESTS, JSON.stringify(state.savedTests || []));
    } catch {
      try {
        const textOnlyStudents: Student[] = state.students.map((st) => ({
          ...st,
          evaluations: st.evaluations.map((ev) => ({
            ...ev,
            pruebaImagenes: undefined,
            studentImages: undefined,
          })),
        }));
        localStorage.setItem(STORAGE_KEYS.STUDENTS, JSON.stringify(textOnlyStudents));
        localStorage.setItem(
          STORAGE_KEYS.TESTS,
          JSON.stringify((state.savedTests || []).map((t) => ({ ...t, pruebaImagenes: undefined })))
        );
      } catch {
        // Ignore unrecoverable quota errors
      }
    }
  }
}

/**
 * Centralized workspace loader using IndexedDB (EbaluazioaLH6_DB, v1) as the primary
 * unlimited local store. On first startup after upgrading from localStorage, copies
 * 100% of existing localStorage records (groups, students, tests, evaluations, images,
 * and rubrics) into IndexedDB automatically without losing or overwriting any data.
 */
export async function loadWorkspace(settings: AppSettings): Promise<StorageLoadResult> {
  let primaryLocalState: WorkspaceState;
  let primaryLocalMode: StorageMode = 'local-only';
  let migratedFromLocalStorage = false;

  if (isIndexedDbAvailable()) {
    // Request browser persistent storage silently (prevents automatic eviction)
    void requestBrowserPersistentStorage();

    try {
      const idbRead = await readWorkspaceFromIdb();
      if (!idbRead.hasData) {
        // First startup with empty EbaluazioaLH6_DB: inspect legacy localStorage
        const hasLegacy = hasLegacyLocalStorageData();
        const legacySnapshot = loadLocalWorkspace({ persistMigrationToLocalStorage: false });
        const { state: normalized } = migrateWorkspaceState(legacySnapshot);

        await saveWorkspaceToIdb(normalized, {
          migratedFromLocalStorageAt: hasLegacy ? new Date().toISOString() : undefined,
        });

        primaryLocalState = normalized;
        primaryLocalMode = 'indexeddb';
        migratedFromLocalStorage = hasLegacy;
      } else {
        const rawIdbState: WorkspaceState = {
          groups:
            idbRead.state && idbRead.state.groups.length > 0
              ? idbRead.state.groups
              : createDefaultGroups(),
          students: idbRead.state?.students ?? [],
          rubrics: idbRead.state?.rubrics ?? [],
          savedTests: idbRead.state?.savedTests ?? [],
        };

        const { state: migratedState, migrated } = migrateWorkspaceState(rawIdbState);
        if (migrated) {
          await saveWorkspaceToIdb(migratedState);
        }

        primaryLocalState = migratedState;
        primaryLocalMode = 'indexeddb';
      }
    } catch (idbErr) {
      console.warn(
        `[${IDB_DB_NAME} v${IDB_DB_VERSION}] Falling back to localStorage on load:`,
        idbErr
      );
      primaryLocalState = loadLocalWorkspace({ persistMigrationToLocalStorage: true });
      primaryLocalMode = 'local-only';
    }
  } else {
    primaryLocalState = loadLocalWorkspace({ persistMigrationToLocalStorage: true });
    primaryLocalMode = 'local-only';
  }

  const firebaseConfig = resolveFirebaseConfig(settings);
  if (!firebaseConfig) {
    return {
      state: primaryLocalState,
      mode: primaryLocalMode,
      migratedFromLocalStorage,
    };
  }

  try {
    const db = await getFirestoreInstance(firebaseConfig);
    const ref = doc(db, FIRESTORE_COLLECTION, FIRESTORE_DOC_ID);
    const snap = await withTimeout(getDoc(ref), FIRESTORE_TIMEOUT_MS);

    if (snap.exists()) {
      const data = snap.data() as Partial<WorkspaceState>;
      const rawRemoteState: WorkspaceState = {
        groups:
          Array.isArray(data.groups) && data.groups.length > 0
            ? data.groups
            : primaryLocalState.groups,
        students: Array.isArray(data.students) ? data.students : primaryLocalState.students,
        rubrics: Array.isArray(data.rubrics) ? data.rubrics : primaryLocalState.rubrics,
        savedTests: Array.isArray(data.savedTests) ? data.savedTests : primaryLocalState.savedTests,
      };
      const { state: remoteState, migrated } = migrateWorkspaceState(rawRemoteState);
      if (isIndexedDbAvailable()) {
        try {
          await saveWorkspaceToIdb(remoteState);
        } catch {
          saveLocalWorkspace(remoteState);
        }
      } else {
        saveLocalWorkspace(remoteState);
      }
      if (migrated) {
        await withTimeout(
          setDoc(ref, {
            groups: remoteState.groups,
            students: remoteState.students,
            rubrics: remoteState.rubrics,
            savedTests: remoteState.savedTests,
            updatedAt: new Date().toISOString(),
          }),
          FIRESTORE_TIMEOUT_MS
        );
      }
      return {
        state: remoteState,
        mode: 'firestore',
        migratedFromLocalStorage,
      };
    }

    await withTimeout(
      setDoc(ref, {
        groups: primaryLocalState.groups,
        students: primaryLocalState.students,
        rubrics: primaryLocalState.rubrics,
        savedTests: primaryLocalState.savedTests,
        updatedAt: new Date().toISOString(),
      }),
      FIRESTORE_TIMEOUT_MS
    );

    return {
      state: primaryLocalState,
      mode: 'firestore',
      migratedFromLocalStorage,
    };
  } catch (err) {
    return {
      state: primaryLocalState,
      mode: primaryLocalMode === 'indexeddb' ? 'indexeddb' : 'local-fallback',
      migratedFromLocalStorage,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function saveWorkspace(
  state: WorkspaceState,
  settings: AppSettings
): Promise<StorageMode> {
  let localMode: StorageMode = 'local-only';

  // Always persist atomically to IndexedDB (EbaluazioaLH6_DB v1) first — zero image pruning
  if (isIndexedDbAvailable()) {
    try {
      await saveWorkspaceToIdb(state);
      localMode = 'indexeddb';
    } catch (err) {
      console.warn(
        `[${IDB_DB_NAME} v${IDB_DB_VERSION}] IndexedDB save failed, falling back to localStorage:`,
        err
      );
      saveLocalWorkspace(state);
      localMode = 'local-only';
    }
  } else {
    saveLocalWorkspace(state);
  }

  const firebaseConfig = resolveFirebaseConfig(settings);
  if (!firebaseConfig) {
    return localMode;
  }

  try {
    const db = await getFirestoreInstance(firebaseConfig);
    const ref = doc(db, FIRESTORE_COLLECTION, FIRESTORE_DOC_ID);
    await withTimeout(
      setDoc(ref, {
        groups: state.groups,
        students: state.students,
        rubrics: state.rubrics,
        savedTests: state.savedTests || [],
        updatedAt: new Date().toISOString(),
      }),
      FIRESTORE_TIMEOUT_MS
    );
    return 'firestore';
  } catch {
    return localMode === 'indexeddb' ? 'indexeddb' : 'local-fallback';
  }
}

export function buildBackupPayload(state: WorkspaceState, settings: AppSettings): BackupPayload {
  return {
    app: 'idazlan-irakurketa-ebaluatzailea-lh6',
    version: 3,
    exportedAt: new Date().toISOString(),
    groups: state.groups,
    students: state.students,
    rubrics: state.rubrics,
    savedTests: state.savedTests || [],
    settings: {
      language: settings.language,
      geminiModel: settings.geminiModel,
    },
  };
}

export interface LocalStorageUsageStats {
  usedBytes: number;
  usedKb: number;
  usedMb: number;
  quotaMb: number;
  percent: number;
  appKb: number;
}

const DEFAULT_LOCALSTORAGE_QUOTA_BYTES = 5 * 1024 * 1024; // ~5 MB standard browser quota

export function getLocalStorageUsageStats(): LocalStorageUsageStats {
  let totalBytes = 0;
  let appBytes = 0;
  const appKeyValues = new Set<string>(Object.values(STORAGE_KEYS));

  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;
      const val = localStorage.getItem(key) || '';
      // UTF-16 code units = ~2 bytes per char in browser storage quota
      const entryBytes = (key.length + val.length) * 2;
      totalBytes += entryBytes;
      if (appKeyValues.has(key)) {
        appBytes += entryBytes;
      }
    }
  } catch {
    // Ignore restricted storage access
  }

  const usedKb = Math.round(totalBytes / 1024);
  const appKb = Math.round(appBytes / 1024);
  const usedMb = Number((totalBytes / (1024 * 1024)).toFixed(2));
  const quotaMb = 5;
  const percent = Math.min(100, Math.round((totalBytes / DEFAULT_LOCALSTORAGE_QUOTA_BYTES) * 100));

  return {
    usedBytes: totalBytes,
    usedKb,
    usedMb,
    quotaMb,
    percent,
    appKb,
  };
}

export function downloadBackupJson(state: WorkspaceState, settings: AppSettings): void {
  const payload = buildBackupPayload(state, settings);
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: 'application/json;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const dateStamp = new Date().toISOString().slice(0, 10);
  const a = document.createElement('a');
  a.href = url;
  a.download = `ebaluazioa_lh6_${dateStamp}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function parseAndValidateBackupJson(rawText: string): BackupPayload | null {
  try {
    const parsed = JSON.parse(rawText) as Partial<BackupPayload>;
    if (
      !parsed ||
      parsed.app !== 'idazlan-irakurketa-ebaluatzailea-lh6' ||
      !Array.isArray(parsed.groups) ||
      !Array.isArray(parsed.students)
    ) {
      return null;
    }

    const validGroups: ClassGroup[] = parsed.groups
      .filter((g) => g && typeof g.id === 'string' && typeof g.name === 'string')
      .map((g) => ({
        id: g.id,
        name: g.name,
        academicYear: typeof g.academicYear === 'string' ? g.academicYear : '2026-2027',
        color: g.color || 'teal',
        createdAt: typeof g.createdAt === 'string' ? g.createdAt : new Date().toISOString(),
      }));

    const validStudents: Student[] = parsed.students
      .filter((s) => s && typeof s.id === 'string' && typeof s.fullName === 'string')
      .map((s) => ({
        id: s.id,
        code: typeof s.code === 'string' ? s.code : 'LH6-000',
        fullName: s.fullName,
        ...(typeof s.email === 'string' && s.email.trim() ? { email: s.email.trim() } : {}),
        ...(s.pendingSubjects ? { pendingSubjects: s.pendingSubjects } : {}),
        groupId: typeof s.groupId === 'string' ? s.groupId : validGroups[0]?.id || 'group-6a',
        tags: Array.isArray(s.tags) ? s.tags.filter((t) => typeof t === 'string') : [],
        notes: typeof s.notes === 'string' ? s.notes : '',
        createdAt: typeof s.createdAt === 'string' ? s.createdAt : new Date().toISOString(),
        updatedAt: typeof s.updatedAt === 'string' ? s.updatedAt : new Date().toISOString(),
        evaluations: Array.isArray(s.evaluations) ? s.evaluations : [],
      }));

    const validRubrics: Rubric[] = Array.isArray(parsed.rubrics)
      ? parsed.rubrics.filter(
          (r): r is Rubric =>
            Boolean(r) &&
            typeof r.id === 'string' &&
            typeof r.title === 'string' &&
            Array.isArray(r.criteria)
        )
      : [];

    const validSavedTests: SavedTestDefinition[] = Array.isArray(parsed.savedTests)
      ? parsed.savedTests.filter(
          (item): item is SavedTestDefinition =>
            Boolean(item) && typeof item.id === 'string' && typeof item.title === 'string'
        )
      : [];

    const migratedBackup = migrateWorkspaceState({
      groups: validGroups.length > 0 ? validGroups : createDefaultGroups(),
      students: validStudents,
      rubrics: validRubrics,
      savedTests: validSavedTests,
    }).state;

    return {
      app: 'idazlan-irakurketa-ebaluatzailea-lh6',
      version: typeof parsed.version === 'number' ? parsed.version : 3,
      exportedAt:
        typeof parsed.exportedAt === 'string' ? parsed.exportedAt : new Date().toISOString(),
      groups: migratedBackup.groups,
      students: migratedBackup.students,
      rubrics: migratedBackup.rubrics,
      savedTests: migratedBackup.savedTests,
      settings: {
        language: parsed.settings?.language === 'es' ? 'es' : 'eu',
        geminiModel: isValidGeminiModel(parsed.settings?.geminiModel)
          ? parsed.settings.geminiModel
          : DEFAULT_GEMINI_MODEL,
      },
    };
  } catch {
    return null;
  }
}
