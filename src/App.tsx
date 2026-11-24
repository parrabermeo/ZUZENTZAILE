import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  Menu,
  BookOpenCheck,
  Settings,
  Globe,
  HardDrive,
  CheckCircle2,
  Loader2,
  ShieldAlert,
  Database,
  Cloud,
} from 'lucide-react';
import {
  getRedirectResult,
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  type User,
} from 'firebase/auth';
import { ALLOWED_TEACHER_EMAIL, auth, googleProvider } from './firebase.js';
import type {
  AppSettings,
  BackupPayload,
  ClassGroup,
  EvaluationRecord,
  GroupColor,
  Language,
  NavTab,
  Rubric,
  SavedTestDefinition,
  StorageMode,
  StoredImageAsset,
  Student,
  ToastMessage,
} from './types';
import { translations } from './i18n/translations';
import {
  buildBackupPayload,
  downloadBackupJson,
  loadLocalWorkspace,
  loadSettings,
  loadWorkspace,
  saveSettings,
  saveWorkspace,
} from './services/storageService';
import { saveWorkspaceToIdb } from './services/indexedDbService';
import {
  resetFirestoreSyncCache,
  saveTeacherSettingsToFirestore,
  seedFirestoreIfEmpty,
  subscribeToFirestoreWorkspace,
  subscribeToTeacherSettings,
  syncWorkspaceDiffToFirestore,
} from './services/firestoreSyncService';
import { getEnvGeminiApiKey, setSyncedGeminiApiKey } from './services/geminiService';
import {
  getLinkedMasterFileState,
  isFileSystemAccessSupported,
  linkMasterBackupFile,
  reauthorizeAndWriteMasterFile,
  unlinkMasterBackupFile,
  writeSnapshotToLinkedFile,
  type PcAutoSaveState,
} from './services/fileSyncService';
import { LoginScreen } from './components/LoginScreen';
import { createStudentRecord, generateNextStudentCode } from './utils/studentImporter';
import { resolveEvaluationSubject, skillToModalityEs } from './utils/subjects';
import { SECTION_THEMES } from './utils/sectionThemes';
import { createSampleClassroom } from './data/sampleData';
import { Sidebar } from './components/Sidebar';
import { StudentsModule } from './components/StudentsModule';
import { StudentDossierView } from './components/StudentDossierView';
import { StudentFormModal } from './components/StudentFormModal';
import { RubricsModule } from './components/RubricsModule';
import { EvaluateModule } from './components/EvaluateModule';
import {
  TestHistoryModule,
  buildTestSessions,
  type GroupedTestSession,
} from './components/TestHistoryModule';
import { ReportsModule } from './components/ReportsModule';
import { SettingsModal } from './components/SettingsModal';
import { BackupModal } from './components/BackupModal';
import { ToastContainer } from './components/ToastContainer';

export function App() {
  const [settings, setSettings] = useState<AppSettings>(() => loadSettings());
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState<boolean>(true);
  const [signingIn, setSigningIn] = useState<boolean>(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const initialLocal = useMemo(
    () => loadLocalWorkspace({ persistMigrationToLocalStorage: false }),
    []
  );
  const [groups, setGroups] = useState<ClassGroup[]>(initialLocal.groups);
  const [students, setStudents] = useState<Student[]>(initialLocal.students);
  const [rubrics, setRubrics] = useState<Rubric[]>(initialLocal.rubrics);
  const [savedTests, setSavedTests] = useState<SavedTestDefinition[]>(initialLocal.savedTests || []);
  const [storageMode, setStorageMode] = useState<StorageMode>('indexeddb');
  const [pcAutoSave, setPcAutoSave] = useState<PcAutoSaveState>(() => ({
    supported: isFileSystemAccessSupported(),
    status: isFileSystemAccessSupported() ? 'unlinked' : 'unsupported',
    fileName: null,
    lastSavedAt: null,
  }));
  const [pcSavedPulse, setPcSavedPulse] = useState(false);

  const [activeTab, setActiveTab] = useState<NavTab>('students');
  const [activeDossierStudentId, setActiveDossierStudentId] = useState<string | null>(null);
  const [dossierEditStudentModal, setDossierEditStudentModal] = useState<Student | null>(null);
  const [preselectedStudentId, setPreselectedStudentId] = useState<string | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [backupOpen, setBackupOpen] = useState(false);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const hydratedRef = useRef(false);
  const skipNextPersistRef = useRef(false);
  const pcSaveTimerRef = useRef<number | null>(null);
  const pcPulseTimerRef = useRef<number | null>(null);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const lang = settings.language;
  const t = translations[lang];

  const triggerPcSavedPulse = useCallback(() => {
    setPcSavedPulse(true);
    if (pcPulseTimerRef.current !== null) {
      window.clearTimeout(pcPulseTimerRef.current);
    }
    pcPulseTimerRef.current = window.setTimeout(() => {
      setPcSavedPulse(false);
    }, 3500);
  }, []);

  const pushToast = useCallback((message: string, type: ToastMessage['type'] = 'success') => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setToasts((prev) => [...prev, { id, type, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((item) => item.id !== id));
    }, 3600);
  }, []);

  // Firebase Auth listener + strict teacher email verification + mobile redirect handling
  useEffect(() => {
    let active = true;

    getRedirectResult(auth).catch((err) => {
      if (!active) return;
      if (err && typeof err === 'object' && 'code' in err) {
        const code = String((err as { code?: string }).code || '');
        if (code && code !== 'auth/popup-closed-by-user') {
          setAuthError(translations[settingsRef.current.language].auth.popupError);
        }
      }
    });

    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!active) return;
      if (!user) {
        setAuthUser(null);
        setAuthLoading(false);
        return;
      }

      const email = (user.email || '').trim().toLowerCase();
      const allowed = ALLOWED_TEACHER_EMAIL.trim().toLowerCase();

      if (!email || email !== allowed) {
        await signOut(auth).catch(() => undefined);
        if (!active) return;
        setAuthUser(null);
        setAuthError(
          translations[settingsRef.current.language].auth.unauthorizedError(user.email || '—')
        );
        setAuthLoading(false);
        setSigningIn(false);
        return;
      }

      setAuthError(null);
      setAuthUser(user);
      setAuthLoading(false);
      setSigningIn(false);
    });

    return () => {
      active = false;
      unsub();
    };
  }, []);

  const handleSignInWithGoogle = async () => {
    setSigningIn(true);
    setAuthError(null);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      const code =
        err && typeof err === 'object' && 'code' in err
          ? String((err as { code?: string }).code || '')
          : '';

      // Automatic fallback to signInWithRedirect on mobile / popup-blocked browsers
      if (
        code === 'auth/popup-blocked' ||
        code === 'auth/operation-not-supported-in-this-environment' ||
        code === 'auth/web-storage-unsupported'
      ) {
        try {
          await signInWithRedirect(auth, googleProvider);
          return;
        } catch {
          setAuthError(t.auth.popupError);
        }
      } else if (code !== 'auth/popup-closed-by-user' && code !== 'auth/cancelled-popup-request') {
        setAuthError(t.auth.popupError);
      }
      setSigningIn(false);
    }
  };

  const handleSignOut = async () => {
    resetFirestoreSyncCache();
    setSyncedGeminiApiKey('');
    hydratedRef.current = false;
    await signOut(auth);
    setAuthUser(null);
    pushToast(t.toasts.signedOut, 'info');
  };

  // Once authenticated: hydrate IndexedDB (migrating localStorage if needed), seed empty Firestore,
  // and attach real-time onSnapshot listeners across grupos, alumnos, pruebas, evaluaciones, rubricas
  // plus config/teacherSettings (Gemini API key).
  useEffect(() => {
    if (!authUser) return;

    let cancelled = false;
    let unsubscribeFirestore: (() => void) | null = null;
    let unsubscribeTeacherSettings: (() => void) | null = null;

    // Subscribe to Cloud Firestore config/teacherSettings for instant cross-device API key sync
    const initialLocalOrEnvKey =
      settingsRef.current.geminiApiKey.trim() || getEnvGeminiApiKey();
    unsubscribeTeacherSettings = subscribeToTeacherSettings(
      initialLocalOrEnvKey,
      (remoteConfig) => {
        if (cancelled) return;
        const incomingKey = remoteConfig.geminiApiKey?.trim();
        if (!incomingKey) return;

        setSyncedGeminiApiKey(incomingKey);
        setSettings((prev) => {
          const nextModel = remoteConfig.geminiModel || prev.geminiModel;
          if (prev.geminiApiKey === incomingKey && prev.geminiModel === nextModel) {
            return prev;
          }
          const updated: AppSettings = {
            ...prev,
            geminiApiKey: incomingKey,
            geminiModel: nextModel,
          };
          saveSettings(updated);
          return updated;
        });
      }
    );

    const bootstrapSync = async () => {
      const [localResult, linkedState] = await Promise.all([
        loadWorkspace(settingsRef.current),
        getLinkedMasterFileState(),
      ]);

      if (cancelled) return;

      skipNextPersistRef.current = true;
      setGroups(localResult.state.groups);
      setStudents(localResult.state.students);
      setRubrics(localResult.state.rubrics);
      setSavedTests(localResult.state.savedTests || []);
      setStorageMode(localResult.mode);
      setPcAutoSave((prev) => ({
        ...linkedState,
        lastSavedAt: prev.lastSavedAt || linkedState.lastSavedAt,
      }));
      hydratedRef.current = true;

      if (localResult.migratedFromLocalStorage) {
        pushToast(translations[settingsRef.current.language].toasts.idbMigrated, 'success');
      }

      // First-login automatic migration: if Firestore is empty and local data exists, upload everything
      try {
        const seedRes = await seedFirestoreIfEmpty(localResult.state);
        if (!cancelled && seedRes.uploaded) {
          pushToast(translations[settingsRef.current.language].toasts.firestoreMigrated, 'success');
        }
      } catch (seedErr) {
        console.warn('[Firestore seed]', seedErr);
      }

      if (cancelled) return;

      // Subscribe to real-time updates from Cloud Firestore across all 5 collections
      unsubscribeFirestore = subscribeToFirestoreWorkspace(
        (remoteState) => {
          if (cancelled) return;
          skipNextPersistRef.current = true;
          setGroups(remoteState.groups);
          setStudents(remoteState.students);
          setRubrics(remoteState.rubrics);
          setSavedTests(remoteState.savedTests || []);
          setStorageMode('firestore');
          hydratedRef.current = true;

          // Keep local IndexedDB mirror completely up-to-date with remote changes
          void saveWorkspaceToIdb(remoteState).catch(() => undefined);
        },
        () => {
          if (!cancelled) {
            setStorageMode('indexeddb');
          }
        }
      );
    };

    void bootstrapSync();

    return () => {
      cancelled = true;
      if (unsubscribeFirestore) unsubscribeFirestore();
      if (unsubscribeTeacherSettings) unsubscribeTeacherSettings();
    };
  }, [authUser, pushToast]);

  // Persist workspace atomically to IndexedDB + Cloud Firestore (5 collections) + PC master file auto-save
  useEffect(() => {
    if (!authUser || !hydratedRef.current) return;
    if (skipNextPersistRef.current) {
      skipNextPersistRef.current = false;
      return;
    }

    let cancelled = false;
    const workspaceSnapshot = { groups, students, rubrics, savedTests };

    // 1. Immediate atomic write to local IndexedDB
    saveWorkspace(workspaceSnapshot, { ...settings, firebaseConfig: undefined }).catch(
      () => undefined
    );

    // 2. Real-time diff sync to Cloud Firestore (individual docs per evaluation)
    syncWorkspaceDiffToFirestore(workspaceSnapshot)
      .then(() => {
        if (!cancelled) setStorageMode('firestore');
      })
      .catch((err) => {
        console.warn('[Firestore diff sync]', err);
        if (!cancelled) setStorageMode('indexeddb');
      });

    // 3. Debounced background auto-save to linked PC master .json file (if linked)
    if (pcSaveTimerRef.current !== null) {
      window.clearTimeout(pcSaveTimerRef.current);
    }

    pcSaveTimerRef.current = window.setTimeout(() => {
      if (cancelled) return;
      const payload = buildBackupPayload(workspaceSnapshot, settings);
      setPcAutoSave((prev) =>
        prev.status === 'linked-idle' || prev.status === 'saved'
          ? { ...prev, status: 'saving' }
          : prev
      );

      writeSnapshotToLinkedFile(payload).then((res) => {
        if (cancelled) return;
        if (res.status === 'unlinked' || res.status === 'unsupported') {
          setPcAutoSave((prev) => ({
            ...prev,
            status: res.status,
            fileName: null,
          }));
          return;
        }
        if (res.status === 'saved') {
          setPcAutoSave((prev) => ({
            ...prev,
            status: 'saved',
            fileName: res.fileName,
            lastSavedAt: res.savedAt || new Date().toISOString(),
            lastError: null,
          }));
          triggerPcSavedPulse();
        } else if (res.status === 'needs-permission') {
          setPcAutoSave((prev) => ({
            ...prev,
            status: 'needs-permission',
            fileName: res.fileName,
          }));
        } else if (res.status === 'error') {
          setPcAutoSave((prev) => ({
            ...prev,
            status: 'error',
            fileName: res.fileName,
            lastError: res.error || null,
          }));
        }
      });
    }, 350);

    return () => {
      cancelled = true;
      if (pcSaveTimerRef.current !== null) {
        window.clearTimeout(pcSaveTimerRef.current);
      }
    };
  }, [authUser, groups, students, rubrics, savedTests, settings, triggerPcSavedPulse]);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (pcSaveTimerRef.current !== null) window.clearTimeout(pcSaveTimerRef.current);
      if (pcPulseTimerRef.current !== null) window.clearTimeout(pcPulseTimerRef.current);
    };
  }, []);

  // Keep <html lang> in sync
  useEffect(() => {
    document.documentElement.lang = settings.language;
  }, [settings.language]);

  const handleLanguageChange = (nextLang: Language) => {
    const nextSettings = { ...settings, language: nextLang };
    setSettings(nextSettings);
    saveSettings(nextSettings);
  };

  const handleSaveSettings = (nextSettings: AppSettings) => {
    const cleanKey = nextSettings.geminiApiKey.trim();
    const normalized: AppSettings = { ...nextSettings, geminiApiKey: cleanKey };
    setSettings(normalized);
    saveSettings(normalized);
    setSyncedGeminiApiKey(cleanKey);

    if (authUser) {
      void saveTeacherSettingsToFirestore({
        geminiApiKey: cleanKey,
        geminiModel: normalized.geminiModel,
        language: normalized.language,
      }).catch((err) => {
        console.warn('[Firestore saveTeacherSettings]', err);
      });
    }

    pushToast(translations[normalized.language].toasts.settingsSaved, 'success');
  };

  // Group CRUD
  const handleAddGroup = (data: { name: string; academicYear: string; color: GroupColor }) => {
    const newGroup: ClassGroup = {
      id: `grp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: data.name,
      academicYear: data.academicYear,
      color: data.color,
      createdAt: new Date().toISOString(),
    };
    setGroups((prev) => [...prev, newGroup]);
    pushToast(t.toasts.groupCreated(data.name));
  };

  const handleUpdateGroup = (
    groupId: string,
    data: { name: string; academicYear: string; color: GroupColor }
  ) => {
    setGroups((prev) =>
      prev.map((g) => (g.id === groupId ? { ...g, ...data } : g))
    );
    pushToast(t.toasts.groupUpdated(data.name));
  };

  const handleDeleteGroup = (groupId: string) => {
    const target = groups.find((g) => g.id === groupId);
    if (!target || groups.length <= 1) return;
    setGroups((prev) => prev.filter((g) => g.id !== groupId));
    setStudents((prev) => prev.filter((s) => s.groupId !== groupId));
    pushToast(t.toasts.groupDeleted(target.name), 'info');
  };

  // Student CRUD
  const handleAddStudent = (data: {
    fullName: string;
    groupId: string;
    tags: string[];
    notes: string;
  }) => {
    const group = groups.find((g) => g.id === data.groupId) || groups[0];
    const code = generateNextStudentCode(group, students);
    const created = createStudentRecord({
      fullName: data.fullName,
      groupId: group.id,
      code,
      tags: data.tags,
      notes: data.notes,
    });
    setStudents((prev) => [...prev, created]);
    pushToast(t.toasts.studentCreated(created.fullName));
  };

  const handleUpdateStudent = (
    studentId: string,
    data: { fullName: string; groupId: string; tags: string[]; notes: string }
  ) => {
    setStudents((prev) =>
      prev.map((s) =>
        s.id === studentId
          ? {
              ...s,
              fullName: data.fullName,
              groupId: data.groupId,
              tags: data.tags,
              notes: data.notes,
              updatedAt: new Date().toISOString(),
            }
          : s
      )
    );
    pushToast(t.toasts.studentUpdated(data.fullName));
  };

  const handleDeleteStudent = (studentId: string) => {
    const target = students.find((s) => s.id === studentId);
    if (!target) return;
    setStudents((prev) => prev.filter((s) => s.id !== studentId));
    pushToast(t.toasts.studentDeleted(target.fullName), 'info');
  };

  const handleImportStudents = (newStudents: Student[]) => {
    setStudents((prev) => [...prev, ...newStudents]);
    pushToast(t.toasts.studentsImported(newStudents.length));
  };

  const handleLoadSampleClassroom = () => {
    const sample = createSampleClassroom(groups);
    setGroups(sample.groups);
    setStudents(sample.students);
    pushToast(t.toasts.sampleLoaded);
  };

  // Rubrics CRUD (Module 2)
  const handleSaveRubric = (rubric: Rubric) => {
    setRubrics((prev) => {
      const exists = prev.some((r) => r.id === rubric.id);
      if (exists) {
        return prev.map((r) => (r.id === rubric.id ? rubric : r));
      }
      return [...prev, rubric];
    });
    pushToast(t.toasts.rubricSaved(rubric.title));
  };

  const handleDeleteRubric = (rubricId: string) => {
    const target = rubrics.find((r) => r.id === rubricId);
    if (!target) return;
    setRubrics((prev) => prev.filter((r) => r.id !== rubricId));
    pushToast(t.toasts.rubricDeleted(target.title), 'info');
  };

  // Save Evaluation into Student's Dossier (Module 3)
  const handleSaveEvaluation = (studentId: string, record: EvaluationRecord) => {
    const targetStudent = students.find((s) => s.id === studentId);
    setStudents((prev) =>
      prev.map((s) => {
        if (s.id !== studentId) return s;
        // Replace if same subject + activity title + date + type already exists, otherwise append
        const sameIdx = s.evaluations.findIndex(
          (ev) =>
            ev.date === record.date &&
            ev.type === record.type &&
            resolveEvaluationSubject(ev) === resolveEvaluationSubject(record) &&
            ev.title.trim().toLowerCase() === record.title.trim().toLowerCase()
        );
        const nextEvals =
          sameIdx >= 0
            ? s.evaluations.map((ev, i) => (i === sameIdx ? record : ev))
            : [...s.evaluations, record];
        return {
          ...s,
          evaluations: nextEvals,
          updatedAt: new Date().toISOString(),
        };
      })
    );
    if (targetStudent) {
      pushToast(t.toasts.evaluationSaved(targetStudent.fullName, record.overallScore));
    }
  };

  // Save Batch PDF Evaluations atomically into all validated student dossiers
  const handleSaveBatchEvaluations = (
    entries: Array<{ studentId: string; record: EvaluationRecord }>
  ) => {
    if (entries.length === 0) return;
    const byStudentId = new Map(entries.map((e) => [e.studentId, e.record]));
    const now = new Date().toISOString();

    setStudents((prev) =>
      prev.map((s) => {
        const record = byStudentId.get(s.id);
        if (!record) return s;
        const sameIdx = s.evaluations.findIndex(
          (ev) =>
            ev.date === record.date &&
            ev.type === record.type &&
            resolveEvaluationSubject(ev) === resolveEvaluationSubject(record) &&
            ev.title.trim().toLowerCase() === record.title.trim().toLowerCase()
        );
        const nextEvals =
          sameIdx >= 0
            ? s.evaluations.map((ev, i) => (i === sameIdx ? record : ev))
            : [...s.evaluations, record];
        return {
          ...s,
          evaluations: nextEvals,
          updatedAt: now,
        };
      })
    );

    pushToast(t.toasts.batchPdfSaved(entries.length));
  };

  // Update a single saved evaluation inside a student's full-screen dossier
  const handleUpdateEvaluation = (studentId: string, updated: EvaluationRecord) => {
    setStudents((prev) =>
      prev.map((s) =>
        s.id === studentId
          ? {
              ...s,
              evaluations: s.evaluations.map((ev) => (ev.id === updated.id ? updated : ev)),
              updatedAt: new Date().toISOString(),
            }
          : s
      )
    );
    pushToast(t.toasts.evaluationUpdated);
  };

  // Delete a single saved evaluation from a student's full-screen dossier
  const handleDeleteEvaluation = (studentId: string, evaluationId: string) => {
    setStudents((prev) =>
      prev.map((s) =>
        s.id === studentId
          ? {
              ...s,
              evaluations: s.evaluations.filter((ev) => ev.id !== evaluationId),
              updatedAt: new Date().toISOString(),
            }
          : s
      )
    );
    pushToast(t.toasts.evaluationDeleted, 'info');
  };

  // Save a test definition without student works yet (so it appears in Proben Historiala with 0 evaluated)
  const handleSaveTestWithoutWork = (testDef: SavedTestDefinition) => {
    setSavedTests((prev) => {
      const normalizedTitle = testDef.title.trim().toLowerCase();
      const existingIdx = prev.findIndex(
        (item) =>
          item.groupId === testDef.groupId &&
          item.asignatura === testDef.asignatura &&
          item.date === testDef.date &&
          item.type === testDef.type &&
          (item.typology || '') === (testDef.typology || '') &&
          item.title.trim().toLowerCase() === normalizedTitle
      );
      if (existingIdx >= 0) {
        return prev.map((item, idx) =>
          idx === existingIdx ? { ...testDef, id: item.id, createdAt: item.createdAt } : item
        );
      }
      return [testDef, ...prev];
    });
    pushToast(t.toasts.testSavedWithoutWork(testDef.title), 'success');
  };

  // Cascade delete all evaluations (and any saved test definition) belonging to a grouped test session
  const handleDeleteTestSession = (
    title: string,
    targets: Array<{ studentId: string; evaluationId: string }>,
    savedTestId?: string
  ) => {
    if (savedTestId) {
      setSavedTests((prev) => prev.filter((item) => item.id !== savedTestId));
    }

    if (targets.length > 0) {
      const evalIdsByStudent = new Map<string, Set<string>>();
      for (const item of targets) {
        let set = evalIdsByStudent.get(item.studentId);
        if (!set) {
          set = new Set();
          evalIdsByStudent.set(item.studentId, set);
        }
        set.add(item.evaluationId);
      }

      const now = new Date().toISOString();
      setStudents((prev) =>
        prev.map((s) => {
          const toRemove = evalIdsByStudent.get(s.id);
          if (!toRemove) return s;
          return {
            ...s,
            evaluations: s.evaluations.filter((ev) => !toRemove.has(ev.id)),
            updatedAt: now,
          };
        })
      );
    }

    pushToast(t.toasts.testSessionDeleted(title, targets.length), 'info');
  };

  // Cascade update title & delivery date across all students AND any saved test definition in a grouped test session
  const handleUpdateTestSession = (
    targets: Array<{ studentId: string; evaluationId: string }>,
    nextTitle: string,
    nextDate: string,
    savedTestId?: string
  ) => {
    const now = new Date().toISOString();

    if (savedTestId) {
      setSavedTests((prev) =>
        prev.map((item) =>
          item.id === savedTestId
            ? { ...item, title: nextTitle, date: nextDate, updatedAt: now }
            : item
        )
      );
    }

    if (targets.length > 0) {
      const evalIdsByStudent = new Map<string, Set<string>>();
      for (const item of targets) {
        let set = evalIdsByStudent.get(item.studentId);
        if (!set) {
          set = new Set();
          evalIdsByStudent.set(item.studentId, set);
        }
        set.add(item.evaluationId);
      }

      setStudents((prev) =>
        prev.map((s) => {
          const toUpdate = evalIdsByStudent.get(s.id);
          if (!toUpdate) return s;
          return {
            ...s,
            evaluations: s.evaluations.map((ev) =>
              toUpdate.has(ev.id) ? { ...ev, title: nextTitle, date: nextDate } : ev
            ),
            updatedAt: now,
          };
        })
      );
    }

    pushToast(t.toasts.testSessionUpdated(nextTitle, targets.length));
  };

  // Attach/update reference prompt photo(s) on a test AND propagate in cascade to all its student evaluations
  const handleUpdateTestSessionImages = (
    session: GroupedTestSession,
    nextImages: StoredImageAsset[]
  ) => {
    const now = new Date().toISOString();

    // 1. Update existing SavedTestDefinition or create one to preserve the reference prompt at test level
    setSavedTests((prev) => {
      const normalizedTitle = session.title.trim().toLowerCase();
      const idx = prev.findIndex(
        (item) =>
          (session.savedTestId && item.id === session.savedTestId) ||
          (item.groupId === session.groupId &&
            item.asignatura === session.asignatura &&
            item.date === session.date &&
            item.type === session.type &&
            (item.typology || '') === (session.typology || '') &&
            item.title.trim().toLowerCase() === normalizedTitle)
      );
      if (idx >= 0) {
        return prev.map((item, i) =>
          i === idx ? { ...item, pruebaImagenes: nextImages, updatedAt: now } : item
        );
      }
      const newDef: SavedTestDefinition = {
        id:
          typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
            ? `test-${crypto.randomUUID()}`
            : `test-${Date.now()}`,
        groupId: session.groupId,
        date: session.date,
        asignatura: session.asignatura,
        modalidad: skillToModalityEs(session.type),
        type: session.type,
        typology: session.typology,
        language: session.language,
        title: session.title,
        rubricId: session.rubricId,
        rubricTitle: session.rubricTitle,
        context: session.context,
        pruebaImagenes: nextImages,
        createdAt: now,
        updatedAt: now,
      };
      return [newDef, ...prev];
    });

    // 2. Propagate reference prompt image(s) to every linked student evaluation in cascade
    if (session.entries.length > 0) {
      const evalIdsByStudent = new Map<string, Set<string>>();
      for (const entry of session.entries) {
        let set = evalIdsByStudent.get(entry.student.id);
        if (!set) {
          set = new Set();
          evalIdsByStudent.set(entry.student.id, set);
        }
        set.add(entry.evaluation.id);
      }

      setStudents((prev) =>
        prev.map((s) => {
          const toUpdate = evalIdsByStudent.get(s.id);
          if (!toUpdate) return s;
          return {
            ...s,
            evaluations: s.evaluations.map((ev) =>
              toUpdate.has(ev.id) ? { ...ev, pruebaImagenes: nextImages } : ev
            ),
            updatedAt: now,
          };
        })
      );
    }

    pushToast(t.toasts.testImagesUpdated(session.title, session.entries.length), 'success');
  };

  const testSessionCount = useMemo(
    () => buildTestSessions(groups, students, savedTests).length,
    [groups, students, savedTests]
  );

  // Backup Export, Import & Real-Time PC File Sync
  const handleExportBackup = () => {
    downloadBackupJson({ groups, students, rubrics, savedTests }, settings);
    pushToast(t.toasts.backupExported);
  };

  const handleLinkPcMasterFile = async () => {
    const payload = buildBackupPayload({ groups, students, rubrics, savedTests }, settings);
    const result = await linkMasterBackupFile(payload);
    if (result.cancelled) return;
    if (result.ok && result.fileName) {
      setPcAutoSave({
        supported: true,
        status: 'saved',
        fileName: result.fileName,
        lastSavedAt: result.savedAt || new Date().toISOString(),
        lastError: null,
      });
      triggerPcSavedPulse();
      pushToast(t.toasts.pcFileLinked(result.fileName), 'success');
    } else if (result.error) {
      setPcAutoSave((prev) => ({ ...prev, status: 'error', lastError: result.error }));
      pushToast(t.toasts.pcFileError, 'error');
    }
  };

  const handleReauthorizeOrSavePcFile = async () => {
    const payload = buildBackupPayload({ groups, students, rubrics, savedTests }, settings);
    setPcAutoSave((prev) => ({ ...prev, status: 'saving' }));
    const res = await reauthorizeAndWriteMasterFile(payload);
    if (res.status === 'saved' && res.fileName) {
      setPcAutoSave({
        supported: true,
        status: 'saved',
        fileName: res.fileName,
        lastSavedAt: res.savedAt || new Date().toISOString(),
        lastError: null,
      });
      triggerPcSavedPulse();
      pushToast(t.toasts.pcFileSaved(res.fileName), 'success');
    } else if (res.status === 'needs-permission') {
      setPcAutoSave((prev) => ({ ...prev, status: 'needs-permission', fileName: res.fileName }));
    } else {
      setPcAutoSave((prev) => ({
        ...prev,
        status: 'error',
        lastError: res.error || null,
      }));
      pushToast(t.toasts.pcFileError, 'error');
    }
  };

  const handleUnlinkPcMasterFile = async () => {
    await unlinkMasterBackupFile();
    setPcAutoSave({
      supported: isFileSystemAccessSupported(),
      status: isFileSystemAccessSupported() ? 'unlinked' : 'unsupported',
      fileName: null,
      lastSavedAt: null,
      lastError: null,
    });
    pushToast(t.toasts.pcFileUnlinked, 'info');
  };

  const handleImportBackup = (payload: BackupPayload, mode: 'replace' | 'merge') => {
    const incomingRubrics = payload.rubrics || [];
    const incomingTests = payload.savedTests || [];
    if (mode === 'replace') {
      setGroups(payload.groups);
      setStudents(payload.students);
      setRubrics(incomingRubrics);
      setSavedTests(incomingTests);
    } else {
      setGroups((prev) => {
        const existingIds = new Set(prev.map((g) => g.id));
        const additions = payload.groups.filter((g) => !existingIds.has(g.id));
        return [...prev, ...additions];
      });
      setStudents((prev) => {
        const existingIds = new Set(prev.map((s) => s.id));
        const additions = payload.students.filter((s) => !existingIds.has(s.id));
        return [...prev, ...additions];
      });
      setRubrics((prev) => {
        const existingIds = new Set(prev.map((r) => r.id));
        const additions = incomingRubrics.filter((r) => !existingIds.has(r.id));
        return [...prev, ...additions];
      });
      setSavedTests((prev) => {
        const existingIds = new Set(prev.map((tItem) => tItem.id));
        const additions = incomingTests.filter((tItem) => !existingIds.has(tItem.id));
        return [...prev, ...additions];
      });
    }
    pushToast(t.toasts.backupImported);
  };

  const handleGoToEvaluate = (studentId: string) => {
    setActiveDossierStudentId(null);
    setPreselectedStudentId(studentId);
    setActiveTab('evaluate');
  };

  const handleSelectNavTab = (tab: NavTab) => {
    setActiveDossierStudentId(null);
    setPreselectedStudentId(null);
    setActiveTab(tab);
  };

  const activeDossierStudent = activeDossierStudentId
    ? students.find((s) => s.id === activeDossierStudentId) || null
    : null;

  // Private Google Auth Gate
  if (authLoading || !authUser) {
    return (
      <LoginScreen
        lang={lang}
        loading={authLoading}
        signingIn={signingIn}
        errorMessage={authError}
        onSignInWithGoogle={() => void handleSignInWithGoogle()}
        onChangeLanguage={handleLanguageChange}
        t={t}
      />
    );
  }

  return (
    <div className="min-h-screen flex bg-slate-50 text-slate-900">
      <Sidebar
        activeTab={activeTab}
        onSelectTab={handleSelectNavTab}
        language={settings.language}
        onChangeLanguage={handleLanguageChange}
        onOpenSettings={() => setSettingsOpen(true)}
        studentCount={students.length}
        testSessionCount={testSessionCount}
        t={t}
        mobileOpen={mobileMenuOpen}
        onCloseMobile={() => setMobileMenuOpen(false)}
      />

      <div className="flex-1 flex flex-col min-w-0">
        {/* Unified Persistent Top Bar (Desktop & Mobile) with Instant EU/ES Switcher */}
        <header className="no-print sticky top-0 z-30 flex items-center justify-between gap-2 sm:gap-3 border-b border-slate-200/80 bg-white/90 backdrop-blur-md px-3 py-2 sm:px-6 lg:px-10">
          <div className="flex items-center gap-2 sm:gap-2.5 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="md:hidden flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-slate-700 hover:bg-slate-100 active:bg-slate-200/70"
              aria-label="Open menu"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="flex md:hidden h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-600 to-emerald-600 text-white">
              <BookOpenCheck className="h-4 w-4" />
            </div>
            <div className="flex items-center gap-2.5 min-w-0">
              <span
                className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                  activeDossierStudent
                    ? SECTION_THEMES.students.dot
                    : SECTION_THEMES[activeTab].dot
                }`}
              />
              <span className="truncate text-sm font-extrabold tracking-tight text-slate-900">
                {activeDossierStudent
                  ? activeDossierStudent.fullName
                  : t.nav[activeTab]}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Discreet Persistence & PC Auto-Save Status Indicator */}
            {pcAutoSave.status === 'saving' ? (
              <button
                type="button"
                onClick={() => setSettingsOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-indigo-200 bg-indigo-50/80 px-2.5 py-1 text-[11px] font-bold text-indigo-700 transition"
                title={pcAutoSave.fileName || undefined}
              >
                <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
                <span className="hidden sm:inline">{t.settings.pcFileSavingShort}</span>
              </button>
            ) : pcAutoSave.status === 'saved' || pcAutoSave.status === 'linked-idle' ? (
              <button
                type="button"
                onClick={() => setSettingsOpen(true)}
                className={`inline-flex items-center gap-1.5 rounded-xl border px-2.5 py-1 text-[11px] font-bold transition-all ${
                  pcSavedPulse
                    ? 'border-emerald-300 bg-emerald-100/90 text-emerald-900 shadow-2xs ring-2 ring-emerald-400/30'
                    : 'border-emerald-200/80 bg-emerald-50/70 text-emerald-800 hover:bg-emerald-100/70'
                }`}
                title={
                  pcAutoSave.fileName
                    ? `${t.settings.pcFileSavedShort}: ${pcAutoSave.fileName}`
                    : t.settings.pcFileSavedShort
                }
              >
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                <span className="hidden sm:inline">{t.settings.pcFileSavedShort}</span>
              </button>
            ) : pcAutoSave.status === 'needs-permission' ? (
              <button
                type="button"
                onClick={handleReauthorizeOrSavePcFile}
                className="inline-flex items-center gap-1.5 rounded-xl border border-amber-300 bg-amber-50 px-2.5 py-1 text-[11px] font-bold text-amber-800 hover:bg-amber-100 transition"
                title={pcAutoSave.fileName || undefined}
              >
                <HardDrive className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                <span className="hidden sm:inline">{t.settings.pcFileNeedsPermShort}</span>
              </button>
            ) : pcAutoSave.status === 'error' ? (
              <button
                type="button"
                onClick={() => setSettingsOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-2.5 py-1 text-[11px] font-bold text-rose-700 hover:bg-rose-100 transition"
                title={pcAutoSave.lastError || t.toasts.pcFileError}
              >
                <ShieldAlert className="h-3.5 w-3.5 shrink-0" />
                <span className="hidden sm:inline">PC !</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setSettingsOpen(true)}
                className="hidden sm:inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50/90 px-2.5 py-1 text-[11px] font-semibold text-slate-600 hover:border-indigo-300 hover:bg-indigo-50/50 hover:text-indigo-700 transition"
                title={
                  storageMode === 'firestore'
                    ? t.auth.cloudSyncedShort
                    : t.settings.pcFileUnlinkedHint
                }
              >
                {storageMode === 'firestore' ? (
                  <>
                    <Cloud className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                    <span>Firestore</span>
                  </>
                ) : (
                  <>
                    <Database className="h-3 w-3 text-emerald-600 shrink-0" />
                    <span>IndexedDB</span>
                  </>
                )}
              </button>
            )}

            {/* Instant Interface Language Switcher (EU / ES) */}
            <div
              className="inline-flex items-center rounded-xl border border-slate-200 bg-slate-100/80 p-0.5"
              role="group"
              aria-label={t.sidebar.language}
            >
              <Globe className="ml-2 mr-1 h-3.5 w-3.5 text-slate-400 hidden sm:block" />
              <button
                type="button"
                onClick={() => handleLanguageChange('eu')}
                className={`rounded-lg px-2.5 py-1 text-[11px] font-bold transition-all ${
                  lang === 'eu'
                    ? 'bg-white text-indigo-700 shadow-2xs ring-1 ring-slate-200/70'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                EU
              </button>
              <button
                type="button"
                onClick={() => handleLanguageChange('es')}
                className={`rounded-lg px-2.5 py-1 text-[11px] font-bold transition-all ${
                  lang === 'es'
                    ? 'bg-white text-indigo-700 shadow-2xs ring-1 ring-slate-200/70'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                ES
              </button>
            </div>

            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 hover:text-slate-900 transition"
              aria-label={t.sidebar.settings}
              title={t.sidebar.settings}
            >
              <Settings className="h-3.5 w-3.5 text-slate-500" />
              <span className="hidden md:inline">{t.sidebar.settings}</span>
            </button>
          </div>
        </header>

        {/* Main Workspace */}
        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-10 lg:py-8 max-w-7xl w-full mx-auto">
          {activeDossierStudent ? (
            <StudentDossierView
              student={activeDossierStudent}
              group={groups.find((g) => g.id === activeDossierStudent.groupId)}
              savedRubrics={rubrics}
              settings={settings}
              lang={lang}
              t={t}
              onBack={() => setActiveDossierStudentId(null)}
              onEditStudent={(st) => setDossierEditStudentModal(st)}
              onGoToEvaluate={handleGoToEvaluate}
              onUpdateEvaluation={handleUpdateEvaluation}
              onDeleteEvaluation={handleDeleteEvaluation}
              onNotify={pushToast}
            />
          ) : (
            <>
              {activeTab === 'students' && (
                <StudentsModule
                  groups={groups}
                  students={students}
                  lang={lang}
                  t={t}
                  onAddGroup={handleAddGroup}
                  onUpdateGroup={handleUpdateGroup}
                  onDeleteGroup={handleDeleteGroup}
                  onAddStudent={handleAddStudent}
                  onUpdateStudent={handleUpdateStudent}
                  onDeleteStudent={handleDeleteStudent}
                  onImportStudents={handleImportStudents}
                  onLoadSampleClassroom={handleLoadSampleClassroom}
                  onOpenStudentDossier={(studentId) => setActiveDossierStudentId(studentId)}
                />
              )}

              {activeTab === 'rubrics' && (
                <RubricsModule
                  savedRubrics={rubrics}
                  settings={settings}
                  lang={lang}
                  t={t}
                  onSaveRubric={handleSaveRubric}
                  onDeleteRubric={handleDeleteRubric}
                  onOpenSettings={() => setSettingsOpen(true)}
                  onNotify={pushToast}
                />
              )}

              {activeTab === 'evaluate' && (
                <EvaluateModule
                  students={students}
                  groups={groups}
                  savedRubrics={rubrics}
                  preselectedStudentId={preselectedStudentId}
                  settings={settings}
                  lang={lang}
                  t={t}
                  onSaveEvaluation={handleSaveEvaluation}
                  onSaveBatchEvaluations={handleSaveBatchEvaluations}
                  onSaveTestWithoutWork={handleSaveTestWithoutWork}
                  onOpenSettings={() => setSettingsOpen(true)}
                  onGoToStudents={() => handleSelectNavTab('students')}
                  onGoToRubrics={() => handleSelectNavTab('rubrics')}
                  onNotify={pushToast}
                />
              )}

              {activeTab === 'history' && (
                <TestHistoryModule
                  groups={groups}
                  students={students}
                  savedTests={savedTests}
                  savedRubrics={rubrics}
                  settings={settings}
                  lang={lang}
                  t={t}
                  onSaveEvaluation={handleSaveEvaluation}
                  onSaveBatchEvaluations={handleSaveBatchEvaluations}
                  onUpdateTestSession={handleUpdateTestSession}
                  onUpdateTestSessionImages={handleUpdateTestSessionImages}
                  onDeleteTestSession={handleDeleteTestSession}
                  onDeleteSingleEvaluation={handleDeleteEvaluation}
                  onOpenStudentDossier={(studentId) => setActiveDossierStudentId(studentId)}
                  onGoToEvaluate={() => handleSelectNavTab('evaluate')}
                  onOpenSettings={() => setSettingsOpen(true)}
                  onNotify={pushToast}
                />
              )}

              {activeTab === 'reports' && (
                <ReportsModule
                  groups={groups}
                  students={students}
                  lang={lang}
                  t={t}
                  onOpenStudentDossier={(studentId) => setActiveDossierStudentId(studentId)}
                  onNotify={pushToast}
                />
              )}
            </>
          )}
        </main>
      </div>

      {/* Edit student modal when triggered from Full-Screen Dossier */}
      <StudentFormModal
        open={Boolean(dossierEditStudentModal)}
        editingStudent={dossierEditStudentModal}
        groups={groups}
        defaultGroupId={dossierEditStudentModal?.groupId || groups[0]?.id || ''}
        lang={lang}
        onClose={() => setDossierEditStudentModal(null)}
        onSave={(data) => {
          if (dossierEditStudentModal) {
            handleUpdateStudent(dossierEditStudentModal.id, data);
          }
        }}
        t={t}
      />

      {/* Global Modals */}
      <SettingsModal
        open={settingsOpen}
        settings={settings}
        storageMode={storageMode}
        workspaceState={{ groups, students, rubrics, savedTests }}
        pcAutoSave={pcAutoSave}
        authUserEmail={authUser.email}
        groupCount={groups.length}
        studentCount={students.length}
        onClose={() => setSettingsOpen(false)}
        onSave={handleSaveSettings}
        onExportBackup={handleExportBackup}
        onImportBackup={handleImportBackup}
        onLinkPcMasterFile={handleLinkPcMasterFile}
        onReauthorizeOrSavePcFile={handleReauthorizeOrSavePcFile}
        onUnlinkPcMasterFile={handleUnlinkPcMasterFile}
        onSignOut={handleSignOut}
        t={t}
      />

      <BackupModal
        open={backupOpen}
        groupCount={groups.length}
        studentCount={students.length}
        onClose={() => setBackupOpen(false)}
        onExport={handleExportBackup}
        onImport={handleImportBackup}
        t={t}
      />

      <ToastContainer
        toasts={toasts}
        onDismiss={(id) => setToasts((prev) => prev.filter((item) => item.id !== id))}
      />
    </div>
  );
}

export default App;
