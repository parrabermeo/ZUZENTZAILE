import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  History,
  Calendar,
  Users,
  Trash2,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  Search,
  AlertTriangle,
  Award,
  ClipboardCheck,
  Sparkles,
  ExternalLink,
  X,
  ZoomIn,
  ZoomOut,
  Pencil,
  Check,
  UserPlus,
  ImagePlus,
  Camera,
  Loader2,
  BookOpen,
  PenTool,
  GraduationCap,
} from 'lucide-react';
import type {
  AppSettings,
  ClassGroup,
  EvaluationRecord,
  GroupColor,
  Language,
  Rubric,
  SavedTestDefinition,
  SkillMode,
  StoredImageAsset,
  Student,
  SubjectId,
  TextTypologyId,
} from '../types';
import type { Translations } from '../i18n/translations';
import { TEXT_TYPOLOGIES } from '../data/defaultRubrics';
import { getScoreBadgeClasses } from '../utils/scoreStyles';
import {
  getSubjectBadgeClasses,
  getSubjectLabel,
  resolveEvaluationSubject,
} from '../utils/subjects';
import {
  extractReferenceImagesFromRecord,
  mergeUniqueReferenceImages,
} from '../utils/referenceImages';
import { optimizeImageForStorage } from '../utils/imageOptimizer';
import { AddLateSubmissionModal } from './AddLateSubmissionModal';

export interface GroupedTestEntry {
  student: Student;
  evaluation: EvaluationRecord;
}

export interface GroupedTestSession {
  key: string;
  savedTestId?: string;
  groupId: string;
  groupName: string;
  title: string;
  date: string;
  asignatura: SubjectId;
  type: SkillMode;
  typology?: TextTypologyId;
  language: Language;
  rubricId?: string;
  rubricTitle?: string;
  context?: string;
  pruebaImagenes?: StoredImageAsset[];
  thumbnailUrl?: string;
  entries: GroupedTestEntry[];
  averageScore: number;
  totalStudentsInGroup: number;
}

export function buildTestSessions(
  groups: ClassGroup[],
  students: Student[],
  savedTests: SavedTestDefinition[] = []
): GroupedTestSession[] {
  const groupMap = new Map(groups.map((g) => [g.id, g]));
  const groupCounts = new Map<string, number>();
  for (const s of students) {
    groupCounts.set(s.groupId, (groupCounts.get(s.groupId) || 0) + 1);
  }

  const sessionMap = new Map<string, GroupedTestSession>();

  // 1. Seed all saved tests (including 0-evaluation tests created in advance)
  for (const def of savedTests) {
    const normalizedTitle = def.title.trim().toLowerCase();
    const key = `${def.groupId}::${def.asignatura}::${def.date}::${def.type}::${def.typology || ''}::${normalizedTitle}`;
    if (!sessionMap.has(key)) {
      const grp = groupMap.get(def.groupId);
      const defImages = extractReferenceImagesFromRecord(def, `def-${def.id}`);
      sessionMap.set(key, {
        key,
        savedTestId: def.id,
        groupId: def.groupId,
        groupName: grp?.name || '—',
        title: def.title.trim(),
        date: def.date,
        asignatura: def.asignatura,
        type: def.type,
        typology: def.typology,
        language: def.language,
        rubricId: def.rubricId,
        rubricTitle: def.rubricTitle,
        context: def.context,
        pruebaImagenes: defImages.length > 0 ? defImages : undefined,
        thumbnailUrl: defImages[0]?.dataUrl,
        entries: [],
        averageScore: 0,
        totalStudentsInGroup: groupCounts.get(def.groupId) || 0,
      });
    }
  }

  // 2. Merge all saved student evaluations into matching or new test sessions
  //    and smartly recover any reference image stored on any linked evaluation (including legacy schemas)
  for (const student of students) {
    for (const ev of student.evaluations) {
      const effectiveGroupId = ev.groupId || student.groupId;
      const effectiveSubject = resolveEvaluationSubject(ev);
      const normalizedTitle = ev.title.trim().toLowerCase();
      const key = `${effectiveGroupId}::${effectiveSubject}::${ev.date}::${ev.type}::${ev.typology || ''}::${normalizedTitle}`;
      const evImages = extractReferenceImagesFromRecord(ev, `ev-${ev.id}`);

      let session = sessionMap.get(key);
      if (!session) {
        const grp = groupMap.get(effectiveGroupId);
        session = {
          key,
          groupId: effectiveGroupId,
          groupName: grp?.name || '—',
          title: ev.title.trim(),
          date: ev.date,
          asignatura: effectiveSubject,
          type: ev.type,
          typology: ev.typology,
          language: ev.language,
          rubricId: ev.rubricId,
          rubricTitle: ev.rubricTitle,
          context: ev.context,
          pruebaImagenes: evImages.length > 0 ? evImages : undefined,
          thumbnailUrl: evImages[0]?.dataUrl,
          entries: [],
          averageScore: 0,
          totalStudentsInGroup: groupCounts.get(effectiveGroupId) || 0,
        };
        sessionMap.set(key, session);
      }

      if (!session.context && ev.context) session.context = ev.context;
      if (!session.rubricId && ev.rubricId) {
        session.rubricId = ev.rubricId;
        session.rubricTitle = ev.rubricTitle;
      }
      if (evImages.length > 0) {
        const merged = mergeUniqueReferenceImages(session.pruebaImagenes, evImages);
        session.pruebaImagenes = merged;
        session.thumbnailUrl = merged[0]?.dataUrl;
      }

      session.entries.push({ student, evaluation: ev });
    }
  }

  const sessions = Array.from(sessionMap.values()).map((session) => {
    const sum = session.entries.reduce(
      (acc, entry) => acc + (Number(entry.evaluation.overallScore) || 0),
      0
    );
    const avg =
      session.entries.length > 0 ? Number((sum / session.entries.length).toFixed(1)) : 0;

    session.entries.sort((a, b) => a.student.fullName.localeCompare(b.student.fullName));
    return {
      ...session,
      averageScore: avg,
    };
  });

  // Sort most recent delivery date first, then alphabetically by title
  sessions.sort((a, b) => {
    const dateDiff = b.date.localeCompare(a.date);
    if (dateDiff !== 0) return dateDiff;
    return a.title.localeCompare(b.title);
  });

  return sessions;
}

interface TestHistoryModuleProps {
  groups: ClassGroup[];
  students: Student[];
  savedTests: SavedTestDefinition[];
  savedRubrics: Rubric[];
  settings: AppSettings;
  lang: Language;
  t: Translations;
  onSaveEvaluation: (studentId: string, record: EvaluationRecord) => void;
  onSaveBatchEvaluations: (
    entries: Array<{ studentId: string; record: EvaluationRecord }>
  ) => void;
  onUpdateTestSession: (
    targets: Array<{ studentId: string; evaluationId: string }>,
    nextTitle: string,
    nextDate: string,
    savedTestId?: string
  ) => void;
  onUpdateTestSessionImages: (
    session: GroupedTestSession,
    nextImages: StoredImageAsset[]
  ) => void;
  onDeleteTestSession: (
    title: string,
    targets: Array<{ studentId: string; evaluationId: string }>,
    savedTestId?: string
  ) => void;
  onDeleteSingleEvaluation: (studentId: string, evaluationId: string) => void;
  onOpenStudentDossier: (studentId: string) => void;
  onGoToEvaluate: () => void;
  onOpenSettings: () => void;
  onNotify: (message: string, type?: 'success' | 'info' | 'warning' | 'error') => void;
}

const GROUP_DOT_CLASSES: Record<GroupColor, string> = {
  teal: 'bg-teal-500',
  indigo: 'bg-indigo-500',
  emerald: 'bg-emerald-500',
  amber: 'bg-amber-500',
  sky: 'bg-sky-500',
  rose: 'bg-rose-500',
};

export const TestHistoryModule: React.FC<TestHistoryModuleProps> = ({
  groups,
  students,
  savedTests,
  savedRubrics,
  settings,
  lang,
  t,
  onSaveEvaluation,
  onSaveBatchEvaluations,
  onUpdateTestSession,
  onUpdateTestSessionImages,
  onDeleteTestSession,
  onDeleteSingleEvaluation,
  onOpenStudentDossier,
  onGoToEvaluate,
  onOpenSettings,
  onNotify,
}) => {
  const promptPhotoInputRef = useRef<HTMLInputElement>(null);
  const promptCameraInputRef = useRef<HTMLInputElement>(null);
  const uploadTargetSessionRef = useRef<GroupedTestSession | null>(null);

  const [groupFilter, setGroupFilter] = useState<string>('all');
  const [subjectFilter, setSubjectFilter] = useState<'all' | SubjectId>('all');
  const [modalityFilter, setModalityFilter] = useState<'all' | SkillMode>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  // 3-Level Hierarchical Accordion States (ALL collapsed initially by default)
  const [expandedClassIds, setExpandedClassIds] = useState<Record<string, boolean>>({});
  const [expandedModalityKeys, setExpandedModalityKeys] = useState<Record<string, boolean>>({});
  const [expandedSessions, setExpandedSessions] = useState<Record<string, boolean>>({});
  const [editingSessionKey, setEditingSessionKey] = useState<string | null>(null);
  const [editTitleValue, setEditTitleValue] = useState<string>('');
  const [editDateValue, setEditDateValue] = useState<string>('');
  const [pendingDeleteSession, setPendingDeleteSession] = useState<GroupedTestSession | null>(null);
  const [lateSubmissionSessionKey, setLateSubmissionSessionKey] = useState<string | null>(null);
  const [uploadingSessionKey, setUploadingSessionKey] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<{
    images: StoredImageAsset[];
    index: number;
    title: string;
    zoom: number;
  } | null>(null);

  useEffect(() => {
    if (!lightbox) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightbox(null);
      if (e.key === 'ArrowRight' && lightbox.images.length > 1) {
        setLightbox((prev) =>
          prev ? { ...prev, index: (prev.index + 1) % prev.images.length, zoom: 1 } : null
        );
      }
      if (e.key === 'ArrowLeft' && lightbox.images.length > 1) {
        setLightbox((prev) =>
          prev
            ? {
                ...prev,
                index: (prev.index - 1 + prev.images.length) % prev.images.length,
                zoom: 1,
              }
            : null
        );
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [lightbox]);

  const handleTriggerPromptUpload = (session: GroupedTestSession) => {
    uploadTargetSessionRef.current = session;
    promptPhotoInputRef.current?.click();
  };

  const handleTriggerPromptCamera = (session: GroupedTestSession) => {
    uploadTargetSessionRef.current = session;
    promptCameraInputRef.current?.click();
  };

  const handlePromptFilesSelected = async (fileList: FileList | null) => {
    const targetSession = uploadTargetSessionRef.current;
    if (!targetSession || !fileList || fileList.length === 0) return;

    const validFiles = Array.from(fileList).filter((f) => {
      const lower = f.name.toLowerCase();
      return (
        f.type.startsWith('image/') ||
        lower.endsWith('.jpg') ||
        lower.endsWith('.jpeg') ||
        lower.endsWith('.png') ||
        lower.endsWith('.webp') ||
        lower.endsWith('.heic')
      );
    });
    if (validFiles.length === 0) return;

    setUploadingSessionKey(targetSession.key);
    try {
      const additions: StoredImageAsset[] = [];
      for (const file of validFiles) {
        const opt = await optimizeImageForStorage(file, { maxWidth: 1200, quality: 0.7 });
        additions.push({
          id: `ref-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          name: file.name,
          dataUrl: opt.dataUrl,
          sizeKb: opt.sizeKb,
        });
      }
      const nextImages = mergeUniqueReferenceImages(targetSession.pruebaImagenes, additions);
      onUpdateTestSessionImages(targetSession, nextImages);
    } finally {
      setUploadingSessionKey(null);
      uploadTargetSessionRef.current = null;
    }
  };

  const allSessions = useMemo(
    () => buildTestSessions(groups, students, savedTests),
    [groups, students, savedTests]
  );

  const activeLateSession = useMemo(
    () =>
      lateSubmissionSessionKey
        ? allSessions.find((s) => s.key === lateSubmissionSessionKey) || null
        : null,
    [allSessions, lateSubmissionSessionKey]
  );

  const filteredSessions = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return allSessions.filter((session) => {
      if (groupFilter !== 'all' && session.groupId !== groupFilter) return false;
      if (subjectFilter !== 'all' && session.asignatura !== subjectFilter) return false;
      if (modalityFilter !== 'all' && session.type !== modalityFilter) return false;
      if (q && !session.title.toLowerCase().includes(q) && !session.groupName.toLowerCase().includes(q)) {
        return false;
      }
      return true;
    });
  }, [allSessions, groupFilter, subjectFilter, modalityFilter, searchQuery]);

  const totalSubmissions = useMemo(
    () => allSessions.reduce((acc, s) => acc + s.entries.length, 0),
    [allSessions]
  );

  const globalAvg = useMemo(() => {
    let sum = 0;
    let count = 0;
    for (const s of allSessions) {
      for (const e of s.entries) {
        sum += Number(e.evaluation.overallScore) || 0;
        count += 1;
      }
    }
    return count > 0 ? Number((sum / count).toFixed(1)) : null;
  }, [allSessions]);

  const toggleClassExpanded = (groupId: string) => {
    setExpandedClassIds((prev) => ({
      ...prev,
      [groupId]: !prev[groupId],
    }));
  };

  const toggleModalityExpanded = (groupId: string, skill: SkillMode) => {
    const key = `${groupId}::${skill}`;
    setExpandedModalityKeys((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const toggleSession = (key: string) => {
    setExpandedSessions((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const hasActiveHistoryFilter =
    searchQuery.trim().length > 0 ||
    groupFilter !== 'all' ||
    subjectFilter !== 'all' ||
    modalityFilter !== 'all';

  // Organize filtered test sessions by Class -> Modality (reading / writing)
  const classBuckets = useMemo(() => {
    const buckets: Array<{
      group: ClassGroup;
      reading: GroupedTestSession[];
      writing: GroupedTestSession[];
      total: number;
    }> = [];

    const byGroup = new Map<string, GroupedTestSession[]>();
    for (const s of filteredSessions) {
      const list = byGroup.get(s.groupId) || [];
      list.push(s);
      byGroup.set(s.groupId, list);
    }

    for (const grp of groups) {
      if (groupFilter !== 'all' && grp.id !== groupFilter) continue;
      const list = byGroup.get(grp.id) || [];
      if (hasActiveHistoryFilter && list.length === 0) continue;

      const reading = list.filter((s) => s.type === 'reading');
      const writing = list.filter((s) => s.type === 'writing');
      buckets.push({
        group: grp,
        reading,
        writing,
        total: list.length,
      });
    }

    return buckets;
  }, [groups, filteredSessions, groupFilter, hasActiveHistoryFilter]);

  const handleStartEditSession = (session: GroupedTestSession) => {
    setEditingSessionKey(session.key);
    setEditTitleValue(session.title);
    setEditDateValue(session.date);
  };

  const handleSaveEditSession = (session: GroupedTestSession) => {
    const cleanTitle = editTitleValue.trim();
    const cleanDate = editDateValue.trim();
    if (!cleanTitle || !cleanDate) return;
    const targets = session.entries.map((entry) => ({
      studentId: entry.student.id,
      evaluationId: entry.evaluation.id,
    }));
    onUpdateTestSession(targets, cleanTitle, cleanDate, session.savedTestId);
    setEditingSessionKey(null);
  };

  const handleConfirmCascadeDelete = () => {
    if (!pendingDeleteSession) return;
    const targets = pendingDeleteSession.entries.map((entry) => ({
      studentId: entry.student.id,
      evaluationId: entry.evaluation.id,
    }));
    onDeleteTestSession(
      pendingDeleteSession.title,
      targets,
      pendingDeleteSession.savedTestId
    );
    setPendingDeleteSession(null);
  };

  const handleDeleteSingle = (entry: GroupedTestEntry, sessionTitle: string) => {
    if (
      window.confirm(t.history.confirmSingleDelete(entry.student.fullName, sessionTitle))
    ) {
      onDeleteSingleEvaluation(entry.student.id, entry.evaluation.id);
    }
  };

  return (
    <div className="space-y-6">
      {/* Hidden multi-file & direct rear-camera inputs for attaching/updating reference prompt photos */}
      <input
        ref={promptPhotoInputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={(e) => {
          void handlePromptFilesSelected(e.target.files);
          e.target.value = '';
        }}
        className="hidden"
      />
      <input
        ref={promptCameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={(e) => {
          void handlePromptFilesSelected(e.target.files);
          e.target.value = '';
        }}
        className="hidden"
      />

      {/* Header (Amber Theme) */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 border border-amber-200 px-2.5 py-0.5 text-[11px] font-bold text-amber-800 mb-2">
            <History className="h-3.5 w-3.5 text-amber-600" />
            {t.nav.history}
          </span>
          <h2 className="text-2xl font-extrabold tracking-tight text-slate-900">
            {t.history.title}
          </h2>
          <p className="text-sm text-slate-500 mt-1 max-w-3xl">{t.history.subtitle}</p>
        </div>

        <button
          type="button"
          onClick={onGoToEvaluate}
          className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-amber-500 px-4 py-2.5 text-xs font-bold text-white shadow-sm shadow-amber-500/20 hover:bg-amber-600 transition"
        >
          <Sparkles className="h-4 w-4" />
          {t.history.goToEvaluate}
        </button>
      </div>

      {/* KPI Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-2xl border border-slate-200/80 border-t-2 border-t-amber-500 bg-white p-4 shadow-2xs">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
            <span>{t.history.statsTests}</span>
            <History className="h-4 w-4 text-amber-600" />
          </div>
          <p className="mt-2 text-2xl font-extrabold text-slate-900">{allSessions.length}</p>
        </div>

        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-2xs">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
            <span>{t.history.statsSubmissions}</span>
            <ClipboardCheck className="h-4 w-4 text-indigo-600" />
          </div>
          <p className="mt-2 text-2xl font-extrabold text-slate-900">{totalSubmissions}</p>
        </div>

        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-2xs">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
            <span>{t.history.statsGlobalAvg}</span>
            <Award className="h-4 w-4 text-emerald-600" />
          </div>
          <p className="mt-2 text-2xl font-extrabold text-slate-900">
            {globalAvg !== null ? `${globalAvg.toFixed(1)} / 10` : '—'}
          </p>
        </div>
      </div>

      {/* Filters Toolbar */}
      {allSessions.length > 0 && (
        <div className="flex flex-col gap-3 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-2xs md:flex-row md:items-center md:justify-between">
          <div className="relative flex-1 max-w-md">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t.history.searchPlaceholder}
              className="w-full rounded-xl border border-slate-200 bg-slate-50/60 py-2 pl-10 pr-4 text-xs text-slate-800 placeholder:text-slate-400 focus:border-teal-500 focus:bg-white focus:outline-none"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={subjectFilter}
              onChange={(e) => setSubjectFilter(e.target.value as 'all' | SubjectId)}
              className="rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-2 text-xs font-semibold text-slate-700 focus:border-indigo-500 focus:bg-white focus:outline-none"
            >
              <option value="all">{t.history.allSubjects}</option>
              <option value="euskera">{t.subjects.euskera}</option>
              <option value="castellano">{t.subjects.castellano}</option>
            </select>

            <select
              value={groupFilter}
              onChange={(e) => setGroupFilter(e.target.value)}
              className="rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-2 text-xs font-semibold text-slate-700 focus:border-indigo-500 focus:bg-white focus:outline-none"
            >
              <option value="all">{t.history.allGroups}</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>

            <select
              value={modalityFilter}
              onChange={(e) => setModalityFilter(e.target.value as 'all' | SkillMode)}
              className="rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-2 text-xs font-semibold text-slate-700 focus:border-teal-500 focus:bg-white focus:outline-none"
            >
              <option value="all">{t.history.allModalities}</option>
              <option value="reading">{t.rubrics.readingCardTitle}</option>
              <option value="writing">{t.rubrics.writingCardTitle}</option>
            </select>
          </div>
        </div>
      )}

      {/* Sessions List or Empty State */}
      {allSessions.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-slate-200 bg-white px-6 py-16 text-center space-y-3">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-teal-50 text-teal-600">
            <History className="h-7 w-7" />
          </div>
          <h3 className="text-base font-bold text-slate-900">{t.history.emptyTitle}</h3>
          <p className="mx-auto max-w-md text-xs leading-relaxed text-slate-500">
            {t.history.emptyDesc}
          </p>
          <button
            type="button"
            onClick={onGoToEvaluate}
            className="mt-2 inline-flex items-center gap-2 rounded-xl bg-teal-600 px-5 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-teal-700 transition"
          >
            <Sparkles className="h-4 w-4" />
            {t.history.goToEvaluate}
          </button>
        </div>
      ) : filteredSessions.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white px-6 py-12 text-center space-y-3">
          <p className="text-sm font-bold text-slate-800">{t.history.noResultsTitle}</p>
          <button
            type="button"
            onClick={() => {
              setGroupFilter('all');
              setSubjectFilter('all');
              setModalityFilter('all');
              setSearchQuery('');
            }}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            {t.history.clearFilters}
          </button>
        </div>
      ) : (
        /* 3-Level Hierarchical Accordion: Level 1 (Classes) -> Level 2 (Irakurmena / Idazmena) -> Level 3 (Tests) */
        <div className="space-y-3">
          {!hasActiveHistoryFilter && (
            <p className="text-xs font-medium text-slate-500 px-1">{t.history.hierarchyHint}</p>
          )}

          {classBuckets.map(({ group, reading, writing, total }) => {
            const isClassExpanded = hasActiveHistoryFilter
              ? true
              : Boolean(expandedClassIds[group.id]);

            const modalities: Array<{
              skill: SkillMode;
              title: string;
              sessions: GroupedTestSession[];
              icon: React.ComponentType<{ className?: string }>;
              accentActive: string;
              badgeClasses: string;
              iconClasses: string;
            }> = [
              {
                skill: 'reading',
                title: t.rubrics.readingCardTitle,
                sessions: reading,
                icon: BookOpen,
                accentActive: 'border-indigo-300 bg-indigo-50/60',
                badgeClasses: 'bg-indigo-100 text-indigo-800 border-indigo-200',
                iconClasses: 'bg-indigo-100 text-indigo-700',
              },
              {
                skill: 'writing',
                title: t.rubrics.writingCardTitle,
                sessions: writing,
                icon: PenTool,
                accentActive: 'border-emerald-300 bg-emerald-50/60',
                badgeClasses: 'bg-emerald-100 text-emerald-800 border-emerald-200',
                iconClasses: 'bg-emerald-100 text-emerald-700',
              },
            ];

            const renderSessionCard = (session: GroupedTestSession) => {
              const isExpanded = Boolean(expandedSessions[session.key]);
              const typologyMeta = session.typology
                ? TEXT_TYPOLOGIES.find((item) => item.id === session.typology)
                : undefined;

              return (
                <div
                  key={session.key}
                  className="rounded-2xl border border-slate-200/90 bg-white shadow-2xs overflow-hidden"
                >
                  {/* Test Session Row / Card Header */}
                  <div className="flex flex-col gap-4 p-4 sm:p-5 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex items-start gap-4 min-w-0 flex-1">
                      {/* Prominent Expandable Reference Prompt Thumbnail(s) OR Clean Attach-Photo Placeholder */}
                      {session.pruebaImagenes && session.pruebaImagenes.length > 0 ? (
                        <div className="flex flex-col items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() =>
                              setLightbox({
                                images: session.pruebaImagenes!,
                                index: 0,
                                title: session.title,
                                zoom: 1,
                              })
                            }
                            className="group relative h-16 w-16 sm:h-[72px] sm:w-[72px] overflow-hidden rounded-xl border-2 border-indigo-200 bg-slate-100 shadow-2xs hover:border-indigo-500 transition"
                            title={t.dossier.zoomHint}
                          >
                            <img
                              src={session.pruebaImagenes[0].dataUrl}
                              alt={session.title}
                              className="h-full w-full object-cover transition group-hover:scale-110"
                            />
                            {session.pruebaImagenes.length > 1 && (
                              <span className="absolute bottom-1 right-1 rounded-md bg-slate-900/85 px-1.5 py-0.5 font-mono text-[9px] font-extrabold text-white shadow-xs">
                                1/{session.pruebaImagenes.length}
                              </span>
                            )}
                            <span className="absolute inset-0 flex items-center justify-center bg-slate-900/0 group-hover:bg-slate-900/35 transition">
                              <ZoomIn className="h-4 w-4 text-white opacity-0 group-hover:opacity-100 transition" />
                            </span>
                          </button>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              disabled={uploadingSessionKey === session.key}
                              onClick={() => handleTriggerPromptUpload(session)}
                              className="inline-flex items-center gap-0.5 text-[10px] font-bold text-indigo-700 hover:underline disabled:opacity-50"
                            >
                              {uploadingSessionKey === session.key ? (
                                <Loader2 className="h-2.5 w-2.5 animate-spin" />
                              ) : (
                                <ImagePlus className="h-2.5 w-2.5" />
                              )}
                              <span>
                                {uploadingSessionKey === session.key
                                  ? t.history.uploadingPromptPhoto
                                  : t.history.updatePromptPhotoBtn}
                              </span>
                            </button>
                            <button
                              type="button"
                              disabled={uploadingSessionKey === session.key}
                              onClick={() => handleTriggerPromptCamera(session)}
                              title={t.evaluate.takePhotoBtn}
                              className="inline-flex items-center text-[10px] font-bold text-emerald-700 hover:text-emerald-900 disabled:opacity-50"
                            >
                              <Camera className="h-3 w-3" />
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-col gap-1 shrink-0">
                          <button
                            type="button"
                            disabled={uploadingSessionKey === session.key}
                            onClick={() => handleTriggerPromptUpload(session)}
                            title={t.history.addPromptPhotoBtn}
                            className="group flex h-[62px] w-[112px] sm:w-[132px] flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-amber-300 bg-amber-50/50 px-2 text-center text-amber-800 hover:border-amber-500 hover:bg-amber-50 transition disabled:opacity-50"
                          >
                            {uploadingSessionKey === session.key ? (
                              <Loader2 className="h-4 w-4 animate-spin text-amber-600" />
                            ) : (
                              <ImagePlus className="h-4 w-4 text-amber-600 group-hover:scale-110 transition" />
                            )}
                            <span className="text-[10px] font-bold leading-tight">
                              {uploadingSessionKey === session.key
                                ? t.history.uploadingPromptPhoto
                                : t.history.addPromptPhotoBtn}
                            </span>
                          </button>
                          <button
                            type="button"
                            disabled={uploadingSessionKey === session.key}
                            onClick={() => handleTriggerPromptCamera(session)}
                            className="inline-flex items-center justify-center gap-1 rounded-lg bg-emerald-600 px-2 py-1 text-[10px] font-bold text-white hover:bg-emerald-700 transition disabled:opacity-50"
                          >
                            <Camera className="h-3 w-3" />
                            <span>{t.evaluate.takePhotoBtn}</span>
                          </button>
                        </div>
                      )}

                      {/* Test Metadata (or Inline Cascade Edit Form for Title + Date) */}
                      <div className="min-w-0 flex-1 space-y-1.5">
                        {editingSessionKey === session.key ? (
                          <div className="flex flex-wrap items-center gap-2 py-1">
                            <input
                              type="text"
                              value={editTitleValue}
                              onChange={(e) => setEditTitleValue(e.target.value)}
                              className="flex-1 min-w-[200px] rounded-xl border border-teal-400 bg-white px-3 py-1.5 text-sm font-bold text-slate-900 focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
                            />
                            <input
                              type="date"
                              value={editDateValue}
                              onChange={(e) => setEditDateValue(e.target.value)}
                              className="rounded-xl border border-teal-400 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 focus:border-teal-600 focus:outline-none"
                            />
                            <button
                              type="button"
                              onClick={() => handleSaveEditSession(session)}
                              disabled={!editTitleValue.trim() || !editDateValue.trim()}
                              className="inline-flex items-center gap-1 rounded-xl bg-teal-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-teal-700 disabled:opacity-50"
                            >
                              <Check className="h-3.5 w-3.5" />
                              {t.history.saveTestEditBtn}
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingSessionKey(null)}
                              className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                            >
                              <X className="h-3.5 w-3.5" />
                              {t.history.cancelTestEditBtn}
                            </button>
                          </div>
                        ) : (
                          <>
                            <div className="flex flex-wrap items-center gap-2 text-xs">
                              <span
                                className={`rounded-full border px-2.5 py-0.5 text-[11px] font-extrabold ${getSubjectBadgeClasses(
                                  session.asignatura
                                )}`}
                              >
                                {getSubjectLabel(session.asignatura, lang)}
                              </span>
                              <span className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2 py-0.5 font-semibold text-slate-700">
                                <Calendar className="h-3 w-3 text-teal-600" />
                                {session.date}
                              </span>
                              {session.type === 'writing' && typologyMeta && (
                                <span className="inline-flex items-center gap-1 rounded-full bg-teal-50 border border-teal-200/70 px-2.5 py-0.5 text-[11px] font-bold text-teal-800">
                                  {typologyMeta.title[lang]}
                                </span>
                              )}
                              <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] font-bold text-slate-600">
                                {session.language.toUpperCase()}
                              </span>
                            </div>

                            <h3 className="text-base font-extrabold text-slate-900 truncate">
                              {session.title}
                            </h3>
                          </>
                        )}

                        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
                          <span className="inline-flex items-center gap-1.5 font-semibold text-slate-700">
                            <Users className="h-3.5 w-3.5 text-slate-400" />
                            {t.history.evaluatedRatio(
                              session.entries.length,
                              session.totalStudentsInGroup
                            )}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Right side: Group Average + Add Work & Evaluate + Edit + Expand + Delete */}
                    <div className="flex flex-wrap items-center justify-between lg:justify-end gap-2 shrink-0">
                      {session.entries.length === 0 ? (
                        <span className="inline-flex items-center gap-1.5 rounded-xl border border-amber-200 bg-amber-50 px-3 py-1.5 text-[11px] font-extrabold text-amber-800">
                          <Sparkles className="h-3.5 w-3.5 text-amber-600" />
                          {t.history.zeroEvaluatedBadge}
                        </span>
                      ) : (
                        <div
                          className={`rounded-xl border px-3 py-1.5 text-center ${getScoreBadgeClasses(
                            session.averageScore
                          )}`}
                        >
                          <p className="text-[9px] font-bold uppercase tracking-wider opacity-75">
                            {t.history.groupAvgLabel}
                          </p>
                          <p className="text-sm font-extrabold">
                            {session.averageScore.toFixed(1)} / 10
                          </p>
                        </div>
                      )}

                      <button
                        type="button"
                        onClick={() => setLateSubmissionSessionKey(session.key)}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3.5 py-2 text-xs font-bold text-white shadow-xs hover:bg-indigo-700 transition"
                      >
                        <UserPlus className="h-3.5 w-3.5" />
                        <span>{t.history.addLateStudentBtn}</span>
                      </button>

                      {editingSessionKey !== session.key && (
                        <button
                          type="button"
                          onClick={() => handleStartEditSession(session)}
                          className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:border-amber-300 hover:bg-amber-50 hover:text-amber-800 transition"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                          <span>{t.history.editTestBtn}</span>
                        </button>
                      )}

                      {session.entries.length > 0 && (
                        <button
                          type="button"
                          onClick={() => toggleSession(session.key)}
                          className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
                        >
                          <span>
                            {isExpanded ? t.history.hideStudentsBtn : t.history.viewStudentsBtn}
                          </span>
                          {isExpanded ? (
                            <ChevronUp className="h-4 w-4 text-slate-400" />
                          ) : (
                            <ChevronDown className="h-4 w-4 text-slate-400" />
                          )}
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => setPendingDeleteSession(session)}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2 text-xs font-bold text-rose-700 hover:bg-rose-100 hover:border-rose-300 transition"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        <span>{t.history.deleteFullTestBtn}</span>
                      </button>
                    </div>
                  </div>

                  {/* Expandable Per-Student List (Selective Delete + Link to Dossier) */}
                  {isExpanded && (
                    <div className="border-t border-slate-100 bg-slate-50/70 p-4 sm:px-6">
                      <div className="divide-y divide-slate-200/70 rounded-xl border border-slate-200/90 bg-white overflow-hidden">
                        {session.entries.map((entry) => (
                          <div
                            key={entry.evaluation.id}
                            className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 hover:bg-slate-50/70 transition"
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <code className="rounded bg-slate-100 px-2 py-0.5 font-mono text-[11px] font-bold text-slate-600">
                                {entry.student.code}
                              </code>
                              <button
                                type="button"
                                onClick={() => onOpenStudentDossier(entry.student.id)}
                                title={t.history.openDossierTooltip}
                                className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-900 hover:text-teal-700 truncate transition"
                              >
                                <span className="truncate">{entry.student.fullName}</span>
                                <ExternalLink className="h-3 w-3 shrink-0 opacity-60" />
                              </button>
                            </div>

                            <div className="flex items-center gap-2.5 shrink-0">
                              <span
                                className={`rounded-lg border px-2.5 py-0.5 text-xs font-extrabold ${getScoreBadgeClasses(
                                  entry.evaluation.overallScore
                                )}`}
                              >
                                {entry.evaluation.overallScore.toFixed(1)} / 10
                              </span>

                              <button
                                type="button"
                                onClick={() => handleDeleteSingle(entry, session.title)}
                                title={t.history.deleteSingleTooltip}
                                className="inline-flex items-center gap-1 rounded-lg border border-transparent p-1.5 text-slate-400 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600 transition"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            };

            return (
              <section
                key={group.id}
                className={`rounded-2xl border bg-white shadow-2xs overflow-hidden transition-all duration-200 ${
                  isClassExpanded
                    ? 'border-amber-300/90 shadow-xs'
                    : 'border-slate-200/90 hover:border-amber-300/70'
                }`}
              >
                {/* LEVEL 1: Class Header */}
                <button
                  type="button"
                  aria-expanded={isClassExpanded}
                  onClick={() => toggleClassExpanded(group.id)}
                  className={`flex w-full items-center justify-between gap-3 px-4 py-4 sm:px-5 text-left transition-colors ${
                    isClassExpanded
                      ? 'bg-gradient-to-r from-amber-50/70 via-white to-white border-b border-slate-100'
                      : 'bg-white hover:bg-slate-50/80'
                  }`}
                >
                  <div className="flex flex-wrap items-center gap-2.5 min-w-0">
                    <span
                      className={`h-3 w-3 shrink-0 rounded-full ${GROUP_DOT_CLASSES[group.color]}`}
                    />
                    <GraduationCap className="h-4 w-4 text-amber-600 shrink-0" />
                    <span className="text-base font-extrabold text-slate-900 truncate">
                      {group.name}
                    </span>
                    <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-semibold text-slate-600">
                      {group.academicYear}
                    </span>
                    <span className="rounded-full bg-amber-50 border border-amber-200/80 px-2.5 py-0.5 text-[11px] font-bold text-amber-800">
                      {t.history.testsCountBadge(total)}
                    </span>
                  </div>

                  <span
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border transition ${
                      isClassExpanded
                        ? 'border-amber-200 bg-amber-50 text-amber-700'
                        : 'border-slate-200 bg-slate-50 text-slate-500'
                    }`}
                  >
                    {isClassExpanded ? (
                      <ChevronUp className="h-4 w-4" />
                    ) : (
                      <ChevronDown className="h-4 w-4" />
                    )}
                  </span>
                </button>

                {/* LEVEL 2: Skill / Modality (Irakurmena & Idazmena) */}
                {isClassExpanded && (
                  <div className="panel-slide-down p-3 sm:p-4 space-y-2.5 bg-slate-50/50">
                    {modalities.map((mod) => {
                      if (modalityFilter !== 'all' && modalityFilter !== mod.skill) {
                        return null;
                      }
                      const modKey = `${group.id}::${mod.skill}`;
                      const isModExpanded = hasActiveHistoryFilter
                        ? mod.sessions.length > 0
                        : Boolean(expandedModalityKeys[modKey]);
                      const ModIcon = mod.icon;

                      return (
                        <div
                          key={modKey}
                          className={`rounded-xl border bg-white overflow-hidden transition-all ${
                            isModExpanded ? mod.accentActive : 'border-slate-200/90'
                          }`}
                        >
                          <button
                            type="button"
                            aria-expanded={isModExpanded}
                            onClick={() => toggleModalityExpanded(group.id, mod.skill)}
                            className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-slate-50/70 transition min-h-[48px]"
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <span
                                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${mod.iconClasses}`}
                              >
                                <ModIcon className="h-4 w-4" />
                              </span>
                              <span className="text-sm font-extrabold text-slate-900 truncate">
                                {mod.title}
                              </span>
                              <span
                                className={`rounded-full border px-2.5 py-0.5 text-[11px] font-bold shrink-0 ${mod.badgeClasses}`}
                              >
                                {t.history.testsCountBadge(mod.sessions.length)}
                              </span>
                            </div>

                            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/80 border border-slate-200 text-slate-500">
                              {isModExpanded ? (
                                <ChevronUp className="h-4 w-4" />
                              ) : (
                                <ChevronDown className="h-4 w-4" />
                              )}
                            </span>
                          </button>

                          {/* LEVEL 3: Saved Tests for this Class + Modality */}
                          {isModExpanded && (
                            <div className="panel-slide-down border-t border-slate-100 bg-slate-50/60 p-3 sm:p-4 space-y-3">
                              {mod.sessions.length === 0 ? (
                                <p className="text-xs text-slate-500 py-2 px-1">
                                  {t.history.noTestsInModality}
                                </p>
                              ) : (
                                mod.sessions.map((session) => renderSessionCard(session))
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}

      {/* Add Exercises & Evaluate Modal (Batch .jpg + Individual) */}
      <AddLateSubmissionModal
        session={activeLateSession}
        groupStudents={
          activeLateSession
            ? students.filter((s) => s.groupId === activeLateSession.groupId)
            : []
        }
        savedRubrics={savedRubrics}
        settings={settings}
        lang={lang}
        t={t}
        onClose={() => setLateSubmissionSessionKey(null)}
        onSaveEvaluation={onSaveEvaluation}
        onSaveBatchEvaluations={onSaveBatchEvaluations}
        onOpenSettings={onOpenSettings}
        onNotify={onNotify}
      />

      {/* Explicit Cascade Delete Confirmation Modal */}
      {pendingDeleteSession && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-slate-900/55 backdrop-blur-xs"
            onClick={() => setPendingDeleteSession(null)}
          />
          <div className="relative z-10 w-full max-w-md rounded-2xl border border-rose-200 bg-white shadow-2xl overflow-hidden">
            <div className="flex items-start gap-3 border-b border-rose-100 bg-rose-50/80 px-6 py-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-100 text-rose-600">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-base font-extrabold text-rose-950">{t.history.modalTitle}</h3>
                <p className="mt-0.5 text-xs font-semibold text-rose-700">
                  {pendingDeleteSession.groupName} · {pendingDeleteSession.date}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPendingDeleteSession(null)}
                className="rounded-lg p-1 text-rose-400 hover:bg-rose-100 hover:text-rose-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-6 space-y-5">
              <p className="text-sm leading-relaxed text-slate-700">
                {t.history.modalMessage(
                  pendingDeleteSession.title,
                  pendingDeleteSession.date,
                  pendingDeleteSession.entries.length
                )}
              </p>

              <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setPendingDeleteSession(null)}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
                >
                  {t.history.modalCancel}
                </button>
                <button
                  type="button"
                  onClick={handleConfirmCascadeDelete}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-rose-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-rose-700 transition"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  {t.history.modalConfirm}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Full-Screen Multi-Image Lightbox for Reference Prompt Photos (Esc or click outside to close) */}
      {lightbox && lightbox.images[lightbox.index] && (
        <div
          className="fixed inset-0 z-[70] flex flex-col bg-slate-950/90 backdrop-blur-xs"
          onClick={() => setLightbox(null)}
        >
          {/* Top Lightbox Controls */}
          <div
            className="flex items-center justify-between gap-3 border-b border-white/10 px-5 py-3.5 text-white"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-amber-500/20 border border-amber-400/40 px-2.5 py-0.5 font-mono text-[11px] font-bold text-amber-200">
                  {lightbox.index + 1} / {lightbox.images.length}
                </span>
                <p className="truncate text-sm font-bold text-white">{lightbox.title}</p>
              </div>
              <p className="mt-0.5 truncate text-[11px] text-slate-400">
                {lightbox.images[lightbox.index].name}
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() =>
                  setLightbox((prev) =>
                    prev ? { ...prev, zoom: Math.max(0.75, prev.zoom - 0.25) } : null
                  )
                }
                className="rounded-lg bg-white/10 p-2 hover:bg-white/20 transition"
                aria-label="Zoom out"
              >
                <ZoomOut className="h-4 w-4" />
              </button>
              <span className="min-w-12 text-center font-mono text-xs font-bold">
                {Math.round(lightbox.zoom * 100)}%
              </span>
              <button
                type="button"
                onClick={() =>
                  setLightbox((prev) =>
                    prev ? { ...prev, zoom: Math.min(2.5, prev.zoom + 0.25) } : null
                  )
                }
                className="rounded-lg bg-white/10 p-2 hover:bg-white/20 transition"
                aria-label="Zoom in"
              >
                <ZoomIn className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setLightbox(null)}
                className="ml-2 rounded-lg bg-white/15 p-2 hover:bg-rose-600 transition"
                aria-label={t.dossier.close}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Center Image Viewer with Prev/Next Arrows */}
          <div className="relative flex-1 overflow-auto flex items-center justify-center p-6">
            {lightbox.images.length > 1 && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setLightbox((prev) =>
                    prev
                      ? {
                          ...prev,
                          index: (prev.index - 1 + prev.images.length) % prev.images.length,
                          zoom: 1,
                        }
                      : null
                  );
                }}
                className="fixed left-4 top-1/2 -translate-y-1/2 z-20 rounded-full bg-white/15 p-3 text-white hover:bg-white/30 transition"
                aria-label="Previous image"
              >
                <ChevronLeft className="h-6 w-6" />
              </button>
            )}

            <img
              src={lightbox.images[lightbox.index].dataUrl}
              alt={lightbox.images[lightbox.index].name}
              onClick={(e) => e.stopPropagation()}
              style={{
                transform: `scale(${lightbox.zoom})`,
                transformOrigin: 'center center',
              }}
              className="max-h-[78vh] max-w-[90vw] rounded-xl shadow-2xl transition-transform duration-150"
            />

            {lightbox.images.length > 1 && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setLightbox((prev) =>
                    prev
                      ? { ...prev, index: (prev.index + 1) % prev.images.length, zoom: 1 }
                      : null
                  );
                }}
                className="fixed right-4 top-1/2 -translate-y-1/2 z-20 rounded-full bg-white/15 p-3 text-white hover:bg-white/30 transition"
                aria-label="Next image"
              >
                <ChevronRight className="h-6 w-6" />
              </button>
            )}
          </div>

          {/* Bottom Thumbnail Strip for Multi-Page Reference Prompts */}
          {lightbox.images.length > 1 && (
            <div
              className="flex items-center justify-center gap-2 border-t border-white/10 bg-slate-950/80 px-4 py-3"
              onClick={(e) => e.stopPropagation()}
            >
              {lightbox.images.map((img, idx) => (
                <button
                  key={img.id}
                  type="button"
                  onClick={() => setLightbox((prev) => (prev ? { ...prev, index: idx, zoom: 1 } : null))}
                  className={`relative h-12 w-12 overflow-hidden rounded-lg border-2 transition ${
                    idx === lightbox.index
                      ? 'border-amber-400 scale-105'
                      : 'border-white/20 opacity-60 hover:opacity-100'
                  }`}
                >
                  <img src={img.dataUrl} alt={img.name} className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
