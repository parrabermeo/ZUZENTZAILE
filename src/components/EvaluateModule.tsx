import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Sparkles,
  Settings,
  Calendar,
  ChevronDown,
  ChevronUp,
  Users,
  FileText,
  Images,
  ImagePlus,
  Camera,
  X,
  Loader2,
  AlertCircle,
  ClipboardList,
  ArrowRight,
  Brain,
  Zap,
  PenLine,
  Check,
  BookOpen,
  PenTool,
  BookmarkPlus,
} from 'lucide-react';
import type {
  AiEvaluationDraft,
  AppSettings,
  BatchEvaluationItem,
  ClassGroup,
  EvaluationRecord,
  FailedBatchPhoto,
  Language,
  ReasoningEffort,
  Rubric,
  SavedTestDefinition,
  SkillMode,
  StoredImageAsset,
  Student,
  SubjectId,
  TextTypologyId,
} from '../types';
import { getTagDisplay, type Translations } from '../i18n/translations';
import {
  languageToSubject,
  resolveEvaluationSubject,
  skillToModalityEs,
  subjectToLanguage,
} from '../utils/subjects';
import {
  calculateWeightedScore,
  evaluateBatchPhotoWithAI,
  evaluateStudentWorkWithAI,
  resolveGeminiApiKey,
  type UploadedImageInput,
} from '../services/geminiService';
import { TEXT_TYPOLOGIES, getBaseRubric } from '../data/defaultRubrics';
import {
  optimizeImageForStorage,
  optimizeJpegForGemini,
  type OptimizedJpegResult,
} from '../utils/imageOptimizer';
import { EvaluationEditorPanel } from './EvaluationEditorPanel';
import { GoogleDriveLinkInput } from './GoogleDriveLinkInput';
import {
  BatchPhotosReviewPanel,
  type BatchPhotoItem,
  type BatchPhotoProgressState,
} from './BatchPhotosReviewPanel';

interface EvaluateModuleProps {
  students: Student[];
  groups: ClassGroup[];
  savedRubrics: Rubric[];
  preselectedStudentId: string | null;
  settings: AppSettings;
  lang: Language;
  t: Translations;
  onSaveEvaluation: (studentId: string, record: EvaluationRecord) => void;
  onSaveBatchEvaluations: (
    entries: Array<{ studentId: string; record: EvaluationRecord }>
  ) => void;
  onSaveTestWithoutWork: (testDef: SavedTestDefinition) => void;
  onOpenSettings: () => void;
  onGoToStudents: () => void;
  onGoToRubrics: () => void;
  onNotify: (message: string, type?: 'success' | 'info' | 'warning' | 'error') => void;
}

interface PreviewImage extends UploadedImageInput {
  id: string;
  previewUrl: string;
  storageAsset: StoredImageAsset;
}

interface ReferencePhotoItem extends UploadedImageInput {
  id: string;
  previewUrl: string;
  sizeKb: number;
  storageAsset: StoredImageAsset;
}

function getTodayIsoDate(): string {
  const now = new Date();
  const offsetMs = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - offsetMs).toISOString().slice(0, 10);
}

function mergePageRanges(prevPages: string, nextPage: string): string {
  const nums = `${prevPages},${nextPage}`
    .match(/\d+/g)
    ?.map((n) => parseInt(n, 10))
    .filter((n) => !Number.isNaN(n));
  if (!nums || nums.length === 0) return `${prevPages}-${nextPage}`;
  const minP = Math.min(...nums);
  const maxP = Math.max(...nums);
  return minP === maxP ? `${minP}` : `${minP}-${maxP}`;
}

function getFirstPageNumber(pagesText: string): number {
  const m = pagesText.match(/\d+/);
  return m ? parseInt(m[0], 10) : 9999;
}

function mergeContinuationIntoPrevious(
  prev: BatchEvaluationItem,
  cont: BatchEvaluationItem
): BatchEvaluationItem {
  const mergedPages = mergePageRanges(prev.pages, cont.pages);
  const mergedTranscription = [prev.draft.transcription, cont.draft.transcription]
    .map((s) => s.trim())
    .filter(Boolean)
    .join('\n\n');

  const contCriteriaMap = new Map(cont.draft.criteria.map((c) => [c.criterionId, c]));
  const mergedCriteria = prev.draft.criteria.map((prevC) => {
    const contC = contCriteriaMap.get(prevC.criterionId);
    if (!contC) return prevC;
    const avgLevel = Math.min(4, Math.max(1, Math.round((prevC.level + contC.level) / 2))) as
      | 1
      | 2
      | 3
      | 4;
    const mergedJust =
      contC.justification && contC.justification !== prevC.justification
        ? `${prevC.justification} ${contC.justification}`.trim()
        : prevC.justification || contC.justification;
    return {
      ...prevC,
      level: avgLevel,
      justification: mergedJust,
    };
  });

  const mergedStrengths = Array.from(
    new Set([...prev.draft.strengths, ...cont.draft.strengths].filter(Boolean))
  ).slice(0, 5);
  const mergedImprovements = Array.from(
    new Set([...prev.draft.improvements, ...cont.draft.improvements].filter(Boolean))
  ).slice(0, 5);

  const seenCorr = new Set(prev.draft.linguisticCorrections.map((c) => c.original.toLowerCase()));
  const mergedCorrections = [
    ...prev.draft.linguisticCorrections,
    ...cont.draft.linguisticCorrections.filter((c) => !seenCorr.has(c.original.toLowerCase())),
  ].slice(0, 8);

  const mergedFeedback =
    cont.draft.studentFeedback.length > prev.draft.studentFeedback.length
      ? cont.draft.studentFeedback
      : prev.draft.studentFeedback;

  return {
    ...prev,
    pages: mergedPages,
    studentImages: [
      ...(prev.studentImages || []),
      ...(cont.studentImages || []),
    ],
    saved: false,
    draft: {
      transcription: mergedTranscription,
      criteria: mergedCriteria,
      finalScore: calculateWeightedScore(mergedCriteria),
      strengths: mergedStrengths,
      improvements: mergedImprovements,
      linguisticCorrections: mergedCorrections,
      studentFeedback: mergedFeedback,
      ...(cont.draft.pendingSubjectAssessment || prev.draft.pendingSubjectAssessment
        ? {
            pendingSubjectAssessment:
              cont.draft.pendingSubjectAssessment || prev.draft.pendingSubjectAssessment,
          }
        : {}),
    },
  };
}

export const EvaluateModule: React.FC<EvaluateModuleProps> = ({
  students,
  groups,
  savedRubrics,
  preselectedStudentId,
  settings,
  lang,
  t,
  onSaveEvaluation,
  onSaveBatchEvaluations,
  onSaveTestWithoutWork,
  onOpenSettings,
  onGoToStudents,
  onGoToRubrics,
  onNotify,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const refPhotoInputRef = useRef<HTMLInputElement>(null);
  const refCameraInputRef = useRef<HTMLInputElement>(null);
  const step1Ref = useRef<HTMLDivElement>(null);
  const step2Ref = useRef<HTMLDivElement>(null);
  const activityTitleInputRef = useRef<HTMLInputElement>(null);
  const contextTextareaRef = useRef<HTMLTextAreaElement>(null);

  // 1. Sequential Guided Configuration (Step 1: Language -> Step 2: Skill & Typology -> Step 3: Class, Title & Date)
  const [selectedSubject, setSelectedSubject] = useState<SubjectId | null>(null);
  const [selectedSkill, setSelectedSkill] = useState<SkillMode | null>(null);
  const [selectedGroupId, setSelectedGroupId] = useState<string>(() => {
    if (preselectedStudentId) {
      const st = students.find((s) => s.id === preselectedStudentId);
      if (st) return st.groupId;
    }
    return groups[0]?.id || '';
  });
  const [deliveryDate, setDeliveryDate] = useState<string>(() => getTodayIsoDate());
  const [typology, setTypology] = useState<TextTypologyId>('narrative');
  const [activityTitle, setActivityTitle] = useState<string>('');
  const [titleError, setTitleError] = useState<boolean>(false);
  const [pendingEvalConfirm, setPendingEvalConfirm] = useState<'individual' | 'batch' | null>(null);
  const [selectedRubricId, setSelectedRubricId] = useState<string>('base');

  const activeSubject: SubjectId = selectedSubject || languageToSubject(lang);
  const evalLang: Language = subjectToLanguage(activeSubject);
  const skill: SkillMode = selectedSkill || 'reading';

  // 2. Collapsible Accordions (both start collapsed for ultra-compact 1-screen UX)
  const [rubricOpen, setRubricOpen] = useState<boolean>(false);
  const [contextOpen, setContextOpen] = useState<boolean>(false);
  const [exerciseContext, setExerciseContext] = useState<string>('');
  const [referencePhotos, setReferencePhotos] = useState<ReferencePhotoItem[]>([]);
  const [optimizingRefPhotos, setOptimizingRefPhotos] = useState<boolean>(false);

  // 3. Student & Work Input (Clean start: no preselected student unless opened directly from a student's dossier)
  const [selectedStudentId, setSelectedStudentId] = useState<string>(preselectedStudentId || '');
  const [inputMode, setInputMode] = useState<'text' | 'image' | 'photo_batch'>(
    preselectedStudentId ? 'text' : 'photo_batch'
  );
  const [studentText, setStudentText] = useState<string>('');
  const [images, setImages] = useState<PreviewImage[]>([]);
  const [reasoningLevel, setReasoningLevel] = useState<ReasoningEffort>('medium');

  // 4. Individual AI Evaluation State
  const [evaluating, setEvaluating] = useState<boolean>(false);
  const [evalError, setEvalError] = useState<string | null>(null);
  const [draft, setDraft] = useState<AiEvaluationDraft | null>(null);
  const [savedForCurrentStudent, setSavedForCurrentStudent] = useState<boolean>(false);
  const [sessionEvaluatedIds, setSessionEvaluatedIds] = useState<Record<string, number>>({});

  // 5. Batch JPG Photos Classroom State (canvas 1400px 0.75 -> 1 photo/req low + resilience cascade)
  const batchAbortRef = useRef<AbortController | null>(null);
  const optimizedCacheRef = useRef<Map<string, OptimizedJpegResult>>(new Map());
  const [batchPhotos, setBatchPhotos] = useState<BatchPhotoItem[]>([]);
  const [batchProcessing, setBatchProcessing] = useState<boolean>(false);
  const [batchProgress, setBatchProgress] = useState<BatchPhotoProgressState | null>(null);
  const [batchError, setBatchError] = useState<string | null>(null);
  const [failedPhotos, setFailedPhotos] = useState<FailedBatchPhoto[]>([]);
  const [batchItems, setBatchItems] = useState<BatchEvaluationItem[]>([]);

  // Sync when navigated directly from a student's dossier
  useEffect(() => {
    if (!preselectedStudentId) return;
    const st = students.find((s) => s.id === preselectedStudentId);
    if (st) {
      setSelectedGroupId(st.groupId);
      setSelectedStudentId(st.id);
      setInputMode('text');
    }
  }, [preselectedStudentId, students]);

  // Keep group valid if groups change
  useEffect(() => {
    if (!groups.some((g) => g.id === selectedGroupId) && groups[0]) {
      setSelectedGroupId(groups[0].id);
    }
  }, [groups, selectedGroupId]);

  const groupStudents = useMemo(
    () =>
      students
        .filter((s) => s.groupId === selectedGroupId)
        .sort((a, b) => a.fullName.localeCompare(b.fullName, lang === 'eu' ? 'eu' : 'es')),
    [students, selectedGroupId, lang]
  );

  // Never auto-preselect a student; only clear if the previously chosen student left the group
  useEffect(() => {
    if (selectedStudentId && !groupStudents.some((s) => s.id === selectedStudentId)) {
      setSelectedStudentId('');
    }
  }, [groupStudents, selectedStudentId]);

  // Matching rubrics from Module 2
  const matchingRubrics = useMemo(
    () =>
      savedRubrics.filter(
        (r) =>
          r.skill === skill &&
          r.language === evalLang &&
          (skill === 'reading' || r.typology === typology)
      ),
    [savedRubrics, skill, evalLang, typology]
  );

  const activeRubric: Rubric = useMemo(() => {
    if (selectedRubricId !== 'base') {
      const found = matchingRubrics.find((r) => r.id === selectedRubricId);
      if (found) return found;
    }
    return getBaseRubric(skill, evalLang, typology);
  }, [selectedRubricId, matchingRubrics, skill, evalLang, typology]);

  const selectedStudent = useMemo(
    () => groupStudents.find((s) => s.id === selectedStudentId) || null,
    [groupStudents, selectedStudentId]
  );

  // Determine which students are already evaluated for THIS activity (by matching title+date+skill or saved in session)
  const normalizedTitle = activityTitle.trim().toLowerCase();
  const evaluatedMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const st of groupStudents) {
      if (sessionEvaluatedIds[st.id] !== undefined) {
        map.set(st.id, sessionEvaluatedIds[st.id]);
        continue;
      }
      const match = st.evaluations.find(
        (ev) =>
          ev.date === deliveryDate &&
          ev.type === skill &&
          resolveEvaluationSubject(ev) === activeSubject &&
          (normalizedTitle
            ? ev.title.trim().toLowerCase() === normalizedTitle
            : ev.rubricId === activeRubric.id)
      );
      if (match) {
        map.set(st.id, match.overallScore);
      }
    }
    return map;
  }, [groupStudents, sessionEvaluatedIds, deliveryDate, skill, normalizedTitle, activeRubric.id]);

  const pendingStudents = useMemo(
    () => groupStudents.filter((s) => !evaluatedMap.has(s.id)),
    [groupStudents, evaluatedMap]
  );

  const nextPendingStudent = useMemo(
    () => pendingStudents.find((s) => s.id !== selectedStudentId) || pendingStudents[0] || null,
    [pendingStudents, selectedStudentId]
  );

  const hasApiKey = Boolean(resolveGeminiApiKey(settings.geminiApiKey));

  const wordCount = useMemo(() => {
    const trimmed = studentText.trim();
    return trimmed ? trimmed.split(/\s+/).length : 0;
  }, [studentText]);

  const clearWorkForNextStudent = () => {
    images.forEach((img) => URL.revokeObjectURL(img.previewUrl));
    setImages([]);
    setStudentText('');
    setDraft(null);
    setEvalError(null);
    setSavedForCurrentStudent(false);
  };

  const handleSelectStudent = (studentId: string) => {
    if (studentId === selectedStudentId) return;
    setSelectedStudentId(studentId);
    clearWorkForNextStudent();
  };

  const handleReferencePhotoFiles = async (
    fileList: FileList | File[] | null,
    replaceId?: string
  ) => {
    if (!fileList || fileList.length === 0) return;
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

    setOptimizingRefPhotos(true);
    try {
      const additions: ReferencePhotoItem[] = [];
      for (const file of validFiles) {
        const opt = await optimizeJpegForGemini(file, { maxWidth: 1200, quality: 0.7 });
        const id = `ref-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        additions.push({
          id,
          mimeType: 'image/jpeg',
          base64Data: opt.base64Data,
          fileName: file.name,
          previewUrl: URL.createObjectURL(file),
          sizeKb: opt.sizeKb,
          storageAsset: {
            id,
            name: file.name,
            dataUrl: opt.dataUrl,
            sizeKb: opt.sizeKb,
          },
        });
      }

      if (replaceId && additions[0]) {
        setReferencePhotos((prev) =>
          prev.map((item) => {
            if (item.id !== replaceId) return item;
            URL.revokeObjectURL(item.previewUrl);
            return additions[0];
          })
        );
      } else {
        setReferencePhotos((prev) => [...prev, ...additions]);
      }
      setContextOpen(true);
    } finally {
      setOptimizingRefPhotos(false);
    }
  };

  const handleRemoveReferencePhoto = (id: string) => {
    setReferencePhotos((prev) => {
      const target = prev.find((p) => p.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((p) => p.id !== id);
    });
  };

  const handleImageFiles = async (fileList: FileList | File[] | null) => {
    if (!fileList || fileList.length === 0) return;
    const additions: PreviewImage[] = [];

    for (const file of Array.from(fileList)) {
      if (!file.type.startsWith('image/')) continue;
      const opt = await optimizeJpegForGemini(file, { maxWidth: 1200, quality: 0.7 });
      const id = `img-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      additions.push({
        id,
        mimeType: 'image/jpeg',
        base64Data: opt.base64Data,
        fileName: file.name,
        previewUrl: URL.createObjectURL(file),
        storageAsset: {
          id,
          name: file.name,
          dataUrl: opt.dataUrl,
          sizeKb: opt.sizeKb,
        },
      });
    }

    if (additions.length > 0) {
      setImages((prev) => [...prev, ...additions]);
      setInputMode('image');
      setEvalError(null);
    }
  };

  const handleRemoveImage = (id: string) => {
    setImages((prev) => {
      const target = prev.find((i) => i.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((i) => i.id !== id);
    });
  };

  const ensureTitlePresent = (): boolean => {
    if (!selectedSubject) {
      onNotify(t.evaluate.chooseLanguageFirst, 'warning');
      step1Ref.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return false;
    }
    if (!selectedSkill) {
      onNotify(t.evaluate.chooseSkillFirst, 'warning');
      step2Ref.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return false;
    }
    if (!activityTitle.trim()) {
      setTitleError(true);
      onNotify(t.evaluate.titleRequiredError, 'warning');
      activityTitleInputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setTimeout(() => activityTitleInputRef.current?.focus(), 120);
      return false;
    }
    setTitleError(false);
    return true;
  };

  const hasReferenceProvided =
    exerciseContext.trim().length > 0 || referencePhotos.length > 0;

  const handleSaveTestWithoutWork = () => {
    if (!ensureTitlePresent()) return;
    const now = new Date().toISOString();
    const id =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? `test-${crypto.randomUUID()}`
        : `test-${Date.now()}`;

    const testDef: SavedTestDefinition = {
      id,
      groupId: selectedGroupId,
      date: deliveryDate,
      asignatura: activeSubject,
      modalidad: skillToModalityEs(skill),
      type: skill,
      typology: skill === 'writing' ? typology : undefined,
      language: evalLang,
      title: activityTitle.trim(),
      rubricId: activeRubric.id,
      rubricTitle: activeRubric.title,
      context: exerciseContext.trim() || undefined,
      pruebaImagenes:
        referencePhotos.length > 0 ? referencePhotos.map((p) => p.storageAsset) : undefined,
      createdAt: now,
      updatedAt: now,
    };

    onSaveTestWithoutWork(testDef);
  };

  const requestIndividualEvaluation = () => {
    setEvalError(null);

    if (!ensureTitlePresent()) return;

    if (!selectedStudent) {
      setEvalError(t.evaluate.needStudentWarning);
      return;
    }

    const hasContent =
      (inputMode === 'text' && studentText.trim().length > 0) ||
      (inputMode === 'image' && images.length > 0);

    if (!hasContent) {
      setEvalError(t.evaluate.needInputWarning);
      return;
    }

    if (!hasApiKey) {
      setEvalError(t.evaluate.missingKeyWarning);
      return;
    }

    if (!hasReferenceProvided) {
      setPendingEvalConfirm('individual');
      return;
    }

    void executeIndividualEvaluation();
  };

  const executeIndividualEvaluation = async () => {
    if (!selectedStudent) return;
    setEvalError(null);
    setEvaluating(true);
    setSavedForCurrentStudent(false);

    try {
      const typologyMeta = TEXT_TYPOLOGIES.find((item) => item.id === typology);
      const effectiveTitle = activityTitle.trim();

      const pendingCourse =
        activeSubject === 'euskera'
          ? selectedStudent.pendingSubjects?.euskera ?? null
          : selectedStudent.pendingSubjects?.lengua ?? null;

      const result = await evaluateStudentWorkWithAI({
        userApiKey: settings.geminiApiKey,
        model: settings.geminiModel,
        reasoningLevel,
        evalLanguage: evalLang,
        skill,
        typologyLabel: typologyMeta ? typologyMeta.title[evalLang] : undefined,
        activityTitle: effectiveTitle,
        exerciseContext,
        referenceImages: referencePhotos.length > 0 ? referencePhotos : undefined,
        rubric: activeRubric,
        studentName: selectedStudent.fullName,
        studentTags: selectedStudent.tags,
        pendingCourse,
        studentText: studentText.trim(),
        images: inputMode === 'image' ? images : undefined,
      });

      setDraft(result);
      onNotify(t.toasts.evaluationDone, 'success');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setEvalError(msg);
    } finally {
      setEvaluating(false);
    }
  };

  // Manual fallback so teachers can also score a student manually if offline
  const handleManualDraft = () => {
    if (!ensureTitlePresent()) return;
    if (!selectedStudent) {
      setEvalError(t.evaluate.needStudentWarning);
      return;
    }
    const baseCriteria = activeRubric.criteria.map((c) => ({
      criterionId: c.id,
      code: c.code,
      name: c.name,
      weight: c.weight,
      level: 3 as const,
      justification: '',
    }));

    setDraft({
      transcription: studentText.trim(),
      criteria: baseCriteria,
      finalScore: calculateWeightedScore(baseCriteria),
      strengths: [''],
      improvements: [''],
      linguisticCorrections: [],
      studentFeedback: '',
    });
    setSavedForCurrentStudent(false);
    setEvalError(null);
  };

  const handleSaveToDossier = (goToNextPending: boolean) => {
    if (!selectedStudent || !draft) return;

    const typologyMeta = TEXT_TYPOLOGIES.find((item) => item.id === typology);
    const effectiveTitle =
      activityTitle.trim() ||
      (skill === 'writing' && typologyMeta
        ? `${typologyMeta.title[evalLang]} (${deliveryDate})`
        : `${t.rubrics.readingCardTitle} (${deliveryDate})`);

    const criteriaScores: Record<string, number> = {};
    for (const c of draft.criteria) {
      criteriaScores[c.criterionId] = c.level;
    }

    const recordId =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? `eval-${crypto.randomUUID()}`
        : `eval-${Date.now()}`;

    const record: EvaluationRecord = {
      id: recordId,
      studentId: selectedStudent.id,
      groupId: selectedGroupId,
      date: deliveryDate,
      asignatura: activeSubject,
      modalidad: skillToModalityEs(skill),
      type: skill,
      typology: skill === 'writing' ? typology : undefined,
      rubricId: activeRubric.id,
      rubricTitle: activeRubric.title,
      language: evalLang,
      title: effectiveTitle,
      context: exerciseContext.trim() || undefined,
      pruebaImagenes:
        referencePhotos.length > 0
          ? referencePhotos.map((p) => p.storageAsset)
          : undefined,
      studentImages:
        inputMode === 'image' && images.length > 0
          ? images.map((img) => img.storageAsset)
          : undefined,
      inputMode,
      transcription: draft.transcription.trim(),
      overallScore: draft.finalScore,
      criteriaScores,
      criteriaResults: draft.criteria,
      strengths: draft.strengths.map((s) => s.trim()).filter(Boolean),
      improvements: draft.improvements.map((s) => s.trim()).filter(Boolean),
      linguisticCorrections: draft.linguisticCorrections.filter(
        (c) => c.original.trim() || c.correction.trim()
      ),
      feedbackSummary: draft.studentFeedback.trim(),
      ...(draft.pendingSubjectAssessment
        ? { pendingSubjectAssessment: draft.pendingSubjectAssessment }
        : {}),
      ...(draft.emailSentAt ? { emailSentAt: draft.emailSentAt } : {}),
      modelUsed: settings.geminiModel,
      reasoningLevel,
      createdAt: new Date().toISOString(),
    };

    onSaveEvaluation(selectedStudent.id, record);
    setSessionEvaluatedIds((prev) => ({ ...prev, [selectedStudent.id]: draft.finalScore }));
    setSavedForCurrentStudent(true);

    if (goToNextPending) {
      const next = groupStudents.find(
        (s) => s.id !== selectedStudent.id && !evaluatedMap.has(s.id)
      );
      if (next) {
        setSelectedStudentId(next.id);
        clearWorkForNextStudent();
      }
    }
  };

  // Batch Image Photos Handlers (all image/* -> canvas 1200px 0.70 -> 1 photo/req + resilience cascade)
  const handleAddBatchPhotos = (incoming: FileList | File[]) => {
    const fileArr = Array.from(incoming);
    const validJpgs = fileArr.filter((f) => {
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

    if (validJpgs.length === 0) {
      setBatchError(t.evaluate.batchPhotos.onlyJpgError);
      return;
    }

    // Sort newly dropped files naturally by filename (e.g. foto_1.jpg, foto_2.jpg, foto_10.jpg)
    validJpgs.sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
    );

    const newItems: BatchPhotoItem[] = validJpgs.map((file, idx) => ({
      id: `bphoto-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 6)}`,
      file,
      name: file.name,
      sizeBytes: file.size,
      previewUrl: URL.createObjectURL(file),
    }));

    setBatchError(null);
    setBatchPhotos((prev) => [...prev, ...newItems]);
  };

  const handleRemoveBatchPhoto = (photoId: string) => {
    setBatchPhotos((prev) => {
      const target = prev.find((p) => p.id === photoId);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((p) => p.id !== photoId);
    });
    optimizedCacheRef.current.delete(photoId);
    setFailedPhotos((prev) => prev.filter((fp) => fp.photoId !== photoId));
  };

  const handleMoveBatchPhoto = (index: number, direction: -1 | 1) => {
    setBatchPhotos((prev) => {
      const targetIndex = index + direction;
      if (targetIndex < 0 || targetIndex >= prev.length) return prev;
      const next = [...prev];
      const [moved] = next.splice(index, 1);
      next.splice(targetIndex, 0, moved);
      return next;
    });
  };

  const handleClearBatchPhotos = () => {
    batchAbortRef.current?.abort();
    batchAbortRef.current = null;
    batchPhotos.forEach((p) => URL.revokeObjectURL(p.previewUrl));
    optimizedCacheRef.current.clear();
    setBatchPhotos([]);
    setBatchItems([]);
    setFailedPhotos([]);
    setBatchProgress(null);
    setBatchError(null);
  };

  const handleCancelBatchProcessing = () => {
    batchAbortRef.current?.abort();
  };

  const appendOrMergePhotoResults = (
    photoResults: BatchEvaluationItem[],
    isSelectiveRetry: boolean
  ) => {
    if (photoResults.length === 0) return;

    setBatchItems((prev) => {
      const next = [...prev];

      for (const item of photoResults) {
        if (item.isContinuation && next.length > 0) {
          const itemNum = getFirstPageNumber(item.pages);
          let targetIdx = next.length - 1;
          if (isSelectiveRetry) {
            for (let k = next.length - 1; k >= 0; k--) {
              if (getFirstPageNumber(next[k].pages) < itemNum) {
                targetIdx = k;
                break;
              }
            }
          }
          next[targetIdx] = mergeContinuationIntoPrevious(next[targetIdx], item);
        } else {
          next.push(item);
        }
      }

      if (isSelectiveRetry) {
        next.sort((a, b) => getFirstPageNumber(a.pages) - getFirstPageNumber(b.pages));
      }
      return next;
    });
  };

  const runBatchPhotos = async (
    entriesToRun: Array<{ photo: BatchPhotoItem; photoNumber: number }>,
    totalPhotosCount: number,
    isSelectiveRetry: boolean
  ) => {
    if (entriesToRun.length === 0) return;

    batchAbortRef.current?.abort();
    const abortController = new AbortController();
    batchAbortRef.current = abortController;

    const typologyMeta = TEXT_TYPOLOGIES.find((item) => item.id === typology);
    const effectiveTitle =
      activityTitle.trim() ||
      (skill === 'writing' && typologyMeta
        ? `${typologyMeta.title[evalLang]} (${deliveryDate})`
        : `${t.rubrics.readingCardTitle} (${deliveryDate})`);

    let lastDetectedStudentName: string | undefined;
    let recoveredCount = 0;
    let detectedCount = isSelectiveRetry ? batchItems.length : 0;
    const nextFailures: FailedBatchPhoto[] = [];

    for (let i = 0; i < entriesToRun.length; i++) {
      if (abortController.signal.aborted) {
        onNotify(t.evaluate.batchPhotos.cancelledNotice, 'info');
        break;
      }

      const { photo, photoNumber } = entriesToRun[i];

      setBatchProgress({
        currentPhoto: photoNumber,
        totalPhotos: totalPhotosCount,
        percent: Math.max(4, Math.round((i / entriesToRun.length) * 100)),
        detectedSoFar: detectedCount,
        activeAttempt: 1,
        activeModelName: 'gemini-4-hydrogen',
      });

      try {
        // Optimize JPEG via lightweight <canvas> (max width 1200px, quality 0.70) & cache for retries
        let optimized = optimizedCacheRef.current.get(photo.id);
        if (!optimized) {
          optimized = await optimizeJpegForGemini(photo.file, {
            maxWidth: 1200,
            quality: 0.7,
          });
          optimizedCacheRef.current.set(photo.id, optimized);
        }

        // Prepare compressed archival JPEG (1200px, quality 0.70) safe for individual Firestore doc (< 1 MB)
        const storageThumb = await optimizeImageForStorage(photo.file, {
          maxWidth: 1200,
          quality: 0.7,
        });
        const studentThumbAsset: StoredImageAsset = {
          id: `stimg-${photo.id}`,
          name: photo.name,
          dataUrl: storageThumb.dataUrl,
          sizeKb: storageThumb.sizeKb,
        };

        if (abortController.signal.aborted) {
          onNotify(t.evaluate.batchPhotos.cancelledNotice, 'info');
          break;
        }

        const photoResults = await evaluateBatchPhotoWithAI({
          userApiKey: settings.geminiApiKey,
          photoNumber,
          totalPhotos: totalPhotosCount,
          base64Data: optimized.base64Data,
          mimeType: 'image/jpeg',
          previousStudentHint: lastDetectedStudentName,
          evalLanguage: evalLang,
          skill,
          typologyLabel: typologyMeta ? typologyMeta.title[evalLang] : undefined,
          activityTitle: effectiveTitle,
          exerciseContext,
          referenceImages: referencePhotos.length > 0 ? referencePhotos : undefined,
          rubric: activeRubric,
          roster: groupStudents,
          signal: abortController.signal,
          onAttemptStatus: ({ attempt, model }) => {
            setBatchProgress((prev) =>
              prev
                ? {
                    ...prev,
                    activeAttempt: attempt,
                    activeModelName: model,
                  }
                : prev
            );
          },
        });

        if (abortController.signal.aborted) {
          onNotify(t.evaluate.batchPhotos.cancelledNotice, 'info');
          break;
        }

        if (Array.isArray(photoResults) && photoResults.length > 0) {
          const resultsWithThumb = photoResults.map((res) => ({
            ...res,
            studentImages: [studentThumbAsset],
          }));
          const nonContCount = resultsWithThumb.filter((r) => !r.isContinuation).length;
          detectedCount += nonContCount;
          recoveredCount += 1;

          const lastItem = resultsWithThumb[resultsWithThumb.length - 1];
          const matchedStu = lastItem.matchedStudentId
            ? groupStudents.find((s) => s.id === lastItem.matchedStudentId)
            : undefined;
          if (!lastItem.isContinuation) {
            lastDetectedStudentName =
              matchedStu?.fullName || lastItem.detectedName || lastDetectedStudentName;
          }

          appendOrMergePhotoResults(resultsWithThumb, isSelectiveRetry);
        } else {
          recoveredCount += 1;
        }

        if (isSelectiveRetry) {
          setFailedPhotos((prev) => prev.filter((fp) => fp.photoId !== photo.id));
        }
      } catch (photoErr) {
        if (photoErr instanceof Error && photoErr.message === 'CANCELLED') {
          onNotify(t.evaluate.batchPhotos.cancelledNotice, 'info');
          break;
        }
        const msg = photoErr instanceof Error ? photoErr.message : String(photoErr);
        const failure: FailedBatchPhoto = {
          photoId: photo.id,
          photoNumber,
          fileName: photo.name,
          error: msg,
        };
        nextFailures.push(failure);
        if (!isSelectiveRetry) {
          setFailedPhotos((prev) => [
            ...prev.filter((fp) => fp.photoId !== photo.id),
            failure,
          ]);
        }
      }

      setBatchProgress({
        currentPhoto: photoNumber,
        totalPhotos: totalPhotosCount,
        percent: Math.round(((i + 1) / entriesToRun.length) * 100),
        detectedSoFar: detectedCount,
      });
    }

    if (isSelectiveRetry) {
      setFailedPhotos(nextFailures);
      if (recoveredCount > 0) {
        onNotify(t.evaluate.batchPhotos.retrySuccessNotice(recoveredCount), 'success');
      }
    } else if (!abortController.signal.aborted) {
      if (detectedCount === 0 && nextFailures.length === 0) {
        setBatchError(t.evaluate.batchPhotos.emptyBatchError);
        onNotify(t.evaluate.batchPhotos.emptyBatchError, 'warning');
      } else if (detectedCount > 0) {
        onNotify(t.toasts.batchPdfDone(detectedCount), 'success');
      }
    }
  };

  const requestBatchPhotosEvaluation = () => {
    if (batchPhotos.length === 0 || groupStudents.length === 0) return;
    if (!ensureTitlePresent()) return;
    if (!hasApiKey) {
      setBatchError(t.evaluate.missingKeyWarning);
      return;
    }
    if (!hasReferenceProvided) {
      setPendingEvalConfirm('batch');
      return;
    }
    void executeBatchPhotosEvaluation();
  };

  const executeBatchPhotosEvaluation = async () => {
    if (batchPhotos.length === 0 || groupStudents.length === 0) return;

    setBatchProcessing(true);
    setBatchError(null);
    setFailedPhotos([]);
    setBatchItems([]);

    try {
      const entries = batchPhotos.map((photo, idx) => ({
        photo,
        photoNumber: idx + 1,
      }));
      await runBatchPhotos(entries, batchPhotos.length, false);
    } catch (err) {
      const technicalDetail =
        err instanceof Error ? err.message : typeof err === 'string' ? err : JSON.stringify(err);
      setBatchError(technicalDetail || 'Unknown error while processing photos');
      onNotify(`${t.evaluate.batchPhotos.errorTitle}: ${technicalDetail.slice(0, 120)}`, 'error');
    } finally {
      batchAbortRef.current = null;
      setBatchProcessing(false);
      setBatchProgress(null);
    }
  };

  const handleRetryFailedPhotos = async () => {
    if (failedPhotos.length === 0 || batchPhotos.length === 0 || batchProcessing) return;

    setBatchProcessing(true);
    setBatchError(null);
    onNotify(t.evaluate.batchPhotos.retryingFailedNotice(failedPhotos.length), 'info');

    try {
      const failedIds = new Set(failedPhotos.map((fp) => fp.photoId));
      const onlyFailedEntries = batchPhotos
        .map((photo, idx) => ({ photo, photoNumber: idx + 1 }))
        .filter(({ photo }) => failedIds.has(photo.id));

      await runBatchPhotos(onlyFailedEntries, batchPhotos.length, true);
    } catch (err) {
      const technicalDetail =
        err instanceof Error ? err.message : typeof err === 'string' ? err : JSON.stringify(err);
      setBatchError(technicalDetail);
    } finally {
      batchAbortRef.current = null;
      setBatchProcessing(false);
      setBatchProgress(null);
    }
  };

  const handleUpdateBatchItem = (
    batchItemId: string,
    updater: (item: BatchEvaluationItem) => BatchEvaluationItem
  ) => {
    setBatchItems((prev) =>
      prev.map((item) => (item.batchItemId === batchItemId ? updater(item) : item))
    );
  };

  const handleSaveAllBatchValidated = () => {
    // Only save checked items with a unique valid matched student
    const counts = new Map<string, number>();
    for (const item of batchItems) {
      if (item.selected && item.matchedStudentId) {
        counts.set(item.matchedStudentId, (counts.get(item.matchedStudentId) || 0) + 1);
      }
    }

    const readyItems = batchItems.filter(
      (item) =>
        item.selected &&
        Boolean(item.matchedStudentId) &&
        (counts.get(item.matchedStudentId!) || 0) === 1
    );

    if (readyItems.length === 0) return;

    const typologyMeta = TEXT_TYPOLOGIES.find((item) => item.id === typology);
    const effectiveTitle =
      activityTitle.trim() ||
      (skill === 'writing' && typologyMeta
        ? `${typologyMeta.title[evalLang]} (${deliveryDate})`
        : `${t.rubrics.readingCardTitle} (${deliveryDate})`);

    const now = new Date().toISOString();
    const savedIdsSet = new Set<string>();
    const newSessionScores: Record<string, number> = {};

    const entries = readyItems.map((item, idx) => {
      const studentId = item.matchedStudentId!;
      const criteriaScores: Record<string, number> = {};
      for (const c of item.draft.criteria) {
        criteriaScores[c.criterionId] = c.level;
      }

      const recordId =
        typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? `eval-${crypto.randomUUID()}`
          : `eval-batch-${Date.now()}-${idx}`;

      const record: EvaluationRecord = {
        id: recordId,
        studentId,
        groupId: selectedGroupId,
        date: deliveryDate,
        asignatura: activeSubject,
        modalidad: skillToModalityEs(skill),
        type: skill,
        typology: skill === 'writing' ? typology : undefined,
        rubricId: activeRubric.id,
        rubricTitle: activeRubric.title,
        language: evalLang,
        title: effectiveTitle,
        context: exerciseContext.trim() || undefined,
        pruebaImagenes:
          referencePhotos.length > 0
            ? referencePhotos.map((p) => p.storageAsset)
            : undefined,
        studentImages:
          item.studentImages && item.studentImages.length > 0
            ? item.studentImages
            : undefined,
        inputMode: 'photo_batch',
        photoNumbers: item.pages,
        transcription: item.draft.transcription.trim(),
        overallScore: item.draft.finalScore,
        criteriaScores,
        criteriaResults: item.draft.criteria,
        strengths: item.draft.strengths.map((s) => s.trim()).filter(Boolean),
        improvements: item.draft.improvements.map((s) => s.trim()).filter(Boolean),
        linguisticCorrections: item.draft.linguisticCorrections.filter(
          (c) => c.original.trim() || c.correction.trim()
        ),
        feedbackSummary: item.draft.studentFeedback.trim(),
        ...(item.draft.pendingSubjectAssessment
          ? { pendingSubjectAssessment: item.draft.pendingSubjectAssessment }
          : {}),
        ...(item.draft.emailSentAt ? { emailSentAt: item.draft.emailSentAt } : {}),
        modelUsed: settings.geminiModel,
        reasoningLevel: 'low',
        createdAt: now,
      };

      savedIdsSet.add(item.batchItemId);
      newSessionScores[studentId] = item.draft.finalScore;
      return { studentId, record };
    });

    onSaveBatchEvaluations(entries);
    setSessionEvaluatedIds((prev) => ({ ...prev, ...newSessionScores }));
    setBatchItems((prev) =>
      prev.map((item) => (savedIdsSet.has(item.batchItemId) ? { ...item, saved: true } : item))
    );
  };

  // Live 5-step sequential flow states (non-intrusive progressive highlights)
  const step1Done = selectedSubject !== null;
  const step2Done = step1Done && selectedSkill !== null;
  const step3Done = step2Done && activityTitle.trim().length > 0;
  const step4Done = hasReferenceProvided;
  const step5HasWork =
    inputMode === 'photo_batch'
      ? batchPhotos.length > 0
      : inputMode === 'text'
        ? studentText.trim().length > 0
        : images.length > 0;
  const step5Done =
    inputMode === 'photo_batch'
      ? batchItems.length > 0 && batchItems.every((i) => i.saved)
      : savedForCurrentStudent;

  const activeStep: 1 | 2 | 3 | 4 | 5 = !step1Done
    ? 1
    : !step2Done
      ? 2
      : !step3Done
        ? 3
        : !step5HasWork
          ? 5
          : 5;

  const stepsMeta = [
    { num: 1 as const, label: t.evaluate.compactStep1, done: step1Done },
    { num: 2 as const, label: t.evaluate.compactStep2, done: step2Done },
    { num: 3 as const, label: t.evaluate.compactStep3, done: step3Done },
    { num: 4 as const, label: t.evaluate.compactStep4, done: step4Done },
    { num: 5 as const, label: t.evaluate.compactStep5, done: step5Done },
  ];

  const contextSummaryBadge = (() => {
    const parts: string[] = [];
    if (exerciseContext.trim()) parts.push('TXT');
    if (referencePhotos.length > 0) parts.push(t.evaluate.refPhotosCount(referencePhotos.length));
    return parts.length > 0 ? parts.join(' + ') : null;
  })();

  const renderStepBadge = (num: number, done: boolean, isCurrent: boolean) => (
    <span
      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-xs font-extrabold transition-colors duration-300 ${
        done
          ? 'bg-emerald-600 text-white'
          : isCurrent
            ? 'bg-indigo-600 text-white shadow-xs'
            : 'bg-slate-100 text-slate-500'
      }`}
    >
      {done ? <Check className="h-3.5 w-3.5 stroke-[3]" /> : num}
    </span>
  );

  return (
    <div className="space-y-3">
      {/* Page Title with Indigo Section Badge + Compact 5-Step Progress Strip */}
      <div className="flex flex-col gap-2.5 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-0.5 text-[11px] font-bold text-indigo-800 shrink-0">
            <Sparkles className="h-3.5 w-3.5 text-indigo-600" />
            {t.nav.evaluate}
          </span>
          {groupStudents.length > 0 && evaluatedMap.size > 0 && (
            <span className="rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 text-[11px] font-bold text-emerald-800 shrink-0">
              {evaluatedMap.size}/{groupStudents.length}
            </span>
          )}
        </div>

        {/* 5-Step Horizontal Visual Progress Pills */}
        <ol className="flex flex-wrap items-center gap-1.5">
          {stepsMeta.map((st, idx) => {
            const isCurrent =
              (st.num === activeStep && !st.done) ||
              (st.num === 4 && step3Done && !step4Done && !step5HasWork);
            return (
              <React.Fragment key={st.num}>
                <li
                  className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-bold transition-all duration-300 ${
                    st.done
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                      : isCurrent
                        ? 'border-indigo-400 bg-indigo-50 text-indigo-900 ring-1 ring-indigo-400/40'
                        : 'border-slate-200 bg-white text-slate-400'
                  }`}
                >
                  <span
                    className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[9px] font-extrabold transition-colors duration-300 ${
                      st.done
                        ? 'bg-emerald-600 text-white'
                        : isCurrent
                          ? 'bg-indigo-600 text-white'
                          : 'bg-slate-200 text-slate-500'
                    }`}
                  >
                    {st.done ? <Check className="h-2.5 w-2.5 stroke-[3]" /> : st.num}
                  </span>
                  <span className="hidden sm:inline whitespace-nowrap">{st.label}</span>
                </li>
                {idx < stepsMeta.length - 1 && (
                  <span
                    className={`hidden md:inline-block h-0.5 w-2.5 rounded-full transition-colors duration-300 ${
                      st.done ? 'bg-emerald-400' : 'bg-slate-200'
                    }`}
                  />
                )}
              </React.Fragment>
            );
          })}
        </ol>
      </div>

      {/* PASO 1 — Hizkuntza (Idioma del texto: Euskera | Lengua Castellana, none preselected by default) */}
      <div
        ref={step1Ref}
        className={`rounded-2xl border border-t-2 border-t-indigo-500 bg-white px-4 py-3 shadow-2xs transition-all duration-300 ${
          !step1Done
            ? 'border-indigo-300 ring-2 ring-indigo-400/50'
            : 'border-slate-200/90'
        }`}
      >
        <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2.5">
            {renderStepBadge(1, step1Done, !step1Done)}
            <div>
              <h3 className="text-xs font-extrabold text-slate-900">
                1. {t.evaluate.compactStep1}
              </h3>
              {!step1Done && (
                <p className="text-[11px] text-indigo-700 font-medium">{t.evaluate.step1Hint}</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:w-auto sm:min-w-[300px]">
            <button
              type="button"
              onClick={() => {
                setSelectedSubject('euskera');
                setSelectedRubricId('base');
                setDraft(null);
              }}
              className={`rounded-xl border-2 px-4 py-2 text-xs font-extrabold transition-all duration-200 ${
                selectedSubject === 'euskera'
                  ? 'border-emerald-600 bg-emerald-600 text-white shadow-xs'
                  : 'border-slate-200 bg-slate-50/70 text-slate-700 hover:border-emerald-400 hover:bg-emerald-50/50'
              }`}
            >
              {t.subjects.euskera}
            </button>
            <button
              type="button"
              onClick={() => {
                setSelectedSubject('castellano');
                setSelectedRubricId('base');
                setDraft(null);
              }}
              className={`rounded-xl border-2 px-4 py-2 text-xs font-extrabold transition-all duration-200 ${
                selectedSubject === 'castellano'
                  ? 'border-indigo-600 bg-indigo-600 text-white shadow-xs'
                  : 'border-slate-200 bg-slate-50/70 text-slate-700 hover:border-indigo-400 hover:bg-indigo-50/50'
              }`}
            >
              {t.subjects.castellano}
            </button>
          </div>
        </div>
      </div>

      {/* PASO 2 — Trebetasuna eta Testu-mota (+ Errubrika kompaktoa) */}
      <div
        ref={step2Ref}
        className={`rounded-2xl border bg-white px-4 py-3 shadow-2xs space-y-2.5 transition-all duration-300 ${
          !step1Done
            ? 'border-slate-200/70 opacity-60'
            : !step2Done
              ? 'panel-slide-down border-indigo-300 ring-2 ring-indigo-400/50'
              : 'border-slate-200/90'
        }`}
      >
        <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2.5">
            {renderStepBadge(2, step2Done, step1Done && !step2Done)}
            <div>
              <h3 className="text-xs font-extrabold text-slate-900">
                2. {t.evaluate.compactStep2}
              </h3>
              {step1Done && !step2Done && (
                <p className="text-[11px] text-indigo-700 font-medium">{t.evaluate.step2Hint}</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:min-w-[300px]">
            <button
              type="button"
              onClick={() => {
                if (!selectedSubject) setSelectedSubject(languageToSubject(lang));
                setSelectedSkill('reading');
                setSelectedRubricId('base');
                setDraft(null);
              }}
              className={`inline-flex items-center justify-center gap-1.5 rounded-xl border-2 px-3.5 py-2 text-xs font-extrabold transition-all duration-200 ${
                selectedSkill === 'reading'
                  ? 'border-indigo-600 bg-indigo-600 text-white shadow-xs'
                  : 'border-slate-200 bg-slate-50/70 text-slate-700 hover:border-indigo-400 hover:bg-indigo-50/50'
              }`}
            >
              <BookOpen className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{t.rubrics.readingCardTitle}</span>
            </button>
            <button
              type="button"
              onClick={() => {
                if (!selectedSubject) setSelectedSubject(languageToSubject(lang));
                setSelectedSkill('writing');
                setSelectedRubricId('base');
                setDraft(null);
              }}
              className={`inline-flex items-center justify-center gap-1.5 rounded-xl border-2 px-3.5 py-2 text-xs font-extrabold transition-all duration-200 ${
                selectedSkill === 'writing'
                  ? 'border-indigo-600 bg-indigo-600 text-white shadow-xs'
                  : 'border-slate-200 bg-slate-50/70 text-slate-700 hover:border-indigo-400 hover:bg-indigo-50/50'
              }`}
            >
              <PenTool className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{t.rubrics.writingCardTitle}</span>
            </button>
          </div>
        </div>

        {/* 7 Text Typologies (compact chips when Expresión Escrita is selected) */}
        {selectedSkill === 'writing' && (
          <div className="panel-slide-down flex flex-wrap items-center gap-1.5 pt-1 border-t border-slate-100">
            {TEXT_TYPOLOGIES.map((typ) => {
              const active = typology === typ.id;
              return (
                <button
                  key={typ.id}
                  type="button"
                  onClick={() => {
                    setTypology(typ.id);
                    setSelectedRubricId('base');
                    setDraft(null);
                  }}
                  className={`rounded-xl border px-3 py-1 text-[11px] font-bold transition-all duration-200 ${
                    active
                      ? 'border-indigo-600 bg-indigo-50 text-indigo-900 ring-1 ring-indigo-500/30'
                      : 'border-slate-200 bg-slate-50/70 text-slate-600 hover:border-indigo-300 hover:text-slate-900'
                  }`}
                >
                  {typ.title[lang]}
                </button>
              );
            })}
          </div>
        )}

        {/* Compact 1-line Rubric Accordion inside Step 2 */}
        {step2Done && (
          <div className="panel-slide-down rounded-xl border border-slate-200/90 bg-slate-50/60 overflow-hidden">
            <button
              type="button"
              onClick={() => setRubricOpen((v) => !v)}
              className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-xs hover:bg-slate-100/70 transition"
            >
              <span className="flex items-center gap-2 min-w-0">
                <ClipboardList className="h-3.5 w-3.5 shrink-0 text-cyan-600" />
                <span className="font-bold text-slate-800 truncate">
                  {t.evaluate.compactRubricSummary(activeRubric.criteria.length)}
                </span>
                <span className="hidden sm:inline-block truncate max-w-[240px] rounded-full bg-white border border-slate-200 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                  {activeRubric.title}
                </span>
              </span>
              <span className="inline-flex items-center gap-1 rounded-lg bg-white border border-slate-200 px-2 py-0.5 text-[10px] font-bold text-indigo-700 shrink-0">
                {rubricOpen ? t.evaluate.compactCloseAction : t.evaluate.compactChangeAction}
                {rubricOpen ? (
                  <ChevronUp className="h-3 w-3" />
                ) : (
                  <ChevronDown className="h-3 w-3" />
                )}
              </span>
            </button>

            {rubricOpen && (
              <div className="panel-slide-down border-t border-slate-200 bg-white p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <select
                    value={selectedRubricId}
                    onChange={(e) => {
                      setSelectedRubricId(e.target.value);
                      setDraft(null);
                    }}
                    className="flex-1 rounded-lg border border-slate-200 bg-slate-50/60 px-2.5 py-1.5 text-xs font-semibold text-slate-800 focus:border-indigo-500 focus:bg-white focus:outline-none"
                  >
                    <option value="base">
                      {t.rubrics.baseRubricOption} ({evalLang.toUpperCase()})
                    </option>
                    {matchingRubrics.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.generatedByAI ? '✦ ' : ''}
                        {r.title}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={onGoToRubrics}
                    className="shrink-0 rounded-lg border border-cyan-200 bg-cyan-50 px-2.5 py-1.5 text-[11px] font-bold text-cyan-800 hover:bg-cyan-100 transition"
                  >
                    {t.evaluate.customizeRubricBtn}
                  </button>
                </div>
                <p className="text-[11px] text-slate-500">
                  {activeRubric.criteria.map((c) => `${c.code} (${c.weight}pt)`).join(' · ')}
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* PASO 3 — Taldea eta Probaren Izenburua (Clase, Título obligatorio y Fecha) */}
      <div
        className={`rounded-2xl border bg-white px-4 py-3 shadow-2xs space-y-2.5 transition-all duration-300 ${
          !step2Done
            ? 'border-slate-200/70 opacity-60'
            : !step3Done
              ? 'panel-slide-down border-indigo-300 ring-2 ring-indigo-400/50'
              : 'border-slate-200/90'
        }`}
      >
        <div className="flex items-center gap-2.5">
          {renderStepBadge(3, step3Done, step2Done && !step3Done)}
          <h3 className="text-xs font-extrabold text-slate-900">
            3. {t.evaluate.compactStep3}
          </h3>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-end">
          {/* Group / Class */}
          <div className="sm:col-span-3">
            <label className="block text-[11px] font-bold text-slate-500 mb-1">
              {t.evaluate.groupLabel}
            </label>
            <select
              value={selectedGroupId}
              onChange={(e) => {
                setSelectedGroupId(e.target.value);
                setSelectedStudentId('');
                setSessionEvaluatedIds({});
                clearWorkForNextStudent();
                handleClearBatchPhotos();
              }}
              className="w-full rounded-xl border border-slate-200 bg-slate-50/60 px-2.5 py-2 text-xs font-semibold text-slate-800 focus:border-indigo-500 focus:bg-white focus:outline-none"
            >
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name} ({g.academicYear})
                </option>
              ))}
            </select>
          </div>

          {/* Mandatory Activity Title */}
          <div className="sm:col-span-6">
            <label
              className={`block text-[11px] font-bold mb-1 ${
                titleError ? 'text-rose-700' : 'text-slate-600'
              }`}
            >
              {t.evaluate.activityTitleLabel}
            </label>
            <input
              ref={activityTitleInputRef}
              type="text"
              value={activityTitle}
              onChange={(e) => {
                setActivityTitle(e.target.value);
                if (e.target.value.trim()) setTitleError(false);
                setSessionEvaluatedIds({});
              }}
              placeholder={t.evaluate.activityTitlePlaceholder}
              className={`w-full rounded-xl border px-3 py-2 text-xs font-semibold text-slate-900 placeholder:text-slate-400 focus:outline-none transition-all duration-300 ${
                titleError
                  ? 'border-rose-500 bg-rose-50/60 ring-2 ring-rose-500/25'
                  : 'border-slate-200 bg-slate-50/60 focus:border-indigo-500 focus:bg-white focus:ring-2 focus:ring-indigo-500/15'
              }`}
            />
          </div>

          {/* Delivery Date */}
          <div className="sm:col-span-3">
            <label className="flex items-center gap-1 text-[11px] font-bold text-slate-500 mb-1">
              <Calendar className="h-3 w-3 text-indigo-600" />
              {t.evaluate.dateLabel}
            </label>
            <input
              type="date"
              value={deliveryDate}
              onChange={(e) => {
                setDeliveryDate(e.target.value);
                setSessionEvaluatedIds({});
              }}
              className="w-full rounded-xl border border-slate-200 bg-slate-50/60 px-2.5 py-2 text-xs font-semibold text-slate-800 focus:border-indigo-500 focus:bg-white focus:outline-none"
            />
          </div>
        </div>

        {titleError && (
          <p className="panel-slide-down flex items-center gap-1.5 text-[11px] font-bold text-rose-600">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            {t.evaluate.titleRequiredError}
          </p>
        )}
      </div>

      {/* PASO 4 — Oinarrizko Testua / Enuntziatua (Texto base + Foto(s) de referencia) */}
      <div
        className={`rounded-2xl border bg-white overflow-hidden shadow-2xs transition-all duration-300 ${
          !step3Done
            ? 'border-slate-200/70 opacity-60'
            : !step4Done && !step5HasWork && !contextOpen
              ? 'border-indigo-300 ring-2 ring-indigo-400/40'
              : step4Done
                ? 'border-emerald-200/90'
                : 'border-slate-200/90'
        }`}
      >
        <input
          ref={refPhotoInputRef}
          type="file"
          accept="image/*"
          multiple
          onChange={(e) => {
            void handleReferencePhotoFiles(e.target.files);
            e.target.value = '';
          }}
          className="hidden"
        />
        <input
          ref={refCameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={(e) => {
            void handleReferencePhotoFiles(e.target.files);
            e.target.value = '';
          }}
          className="hidden"
        />

        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
          <button
            type="button"
            onClick={() => setContextOpen((v) => !v)}
            className="flex items-center gap-2.5 text-left min-w-0 flex-1"
          >
            {renderStepBadge(4, step4Done, step3Done && !step4Done && !step5HasWork)}
            <div className="flex flex-wrap items-center gap-2 min-w-0">
              <h3 className="text-xs font-extrabold text-slate-900">
                4. {t.evaluate.compactStep4}
              </h3>
              {contextSummaryBadge ? (
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                  {t.evaluate.compactContextReady} · {contextSummaryBadge}
                </span>
              ) : (
                <span className="text-[11px] text-slate-400 font-medium">
                  {t.evaluate.compactContextEmpty}
                </span>
              )}
            </div>
          </button>

          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 shrink-0">
            <button
              type="button"
              disabled={optimizingRefPhotos}
              onClick={() => refCameraInputRef.current?.click()}
              className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-2.5 py-1.5 text-[11px] font-bold text-white hover:bg-emerald-700 transition disabled:opacity-50 min-h-[34px]"
            >
              <Camera className="h-3.5 w-3.5" />
              <span>{t.evaluate.takePhotoBtn}</span>
            </button>

            <button
              type="button"
              disabled={optimizingRefPhotos}
              onClick={() => refPhotoInputRef.current?.click()}
              className="inline-flex items-center gap-1.5 rounded-xl border border-indigo-200 bg-indigo-50/80 px-2.5 py-1.5 text-[11px] font-bold text-indigo-800 hover:bg-indigo-100 transition disabled:opacity-50 min-h-[34px]"
            >
              {optimizingRefPhotos ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <ImagePlus className="h-3.5 w-3.5" />
              )}
              <span className="hidden sm:inline">{t.evaluate.uploadRefPhotosBtn}</span>
              <span className="sm:hidden">Irudia</span>
            </button>

            <button
              type="button"
              onClick={() => setContextOpen((v) => !v)}
              className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[11px] font-bold text-slate-700 hover:bg-slate-100 transition min-h-[34px]"
            >
              {contextOpen ? t.evaluate.compactCloseAction : t.evaluate.compactOpenAction}
              {contextOpen ? (
                <ChevronUp className="h-3.5 w-3.5" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5" />
              )}
            </button>
          </div>
        </div>

        {contextOpen && (
          <div className="panel-slide-down border-t border-slate-100 bg-slate-50/40 px-4 py-3 space-y-2.5">
            <GoogleDriveLinkInput
              disabled={optimizingRefPhotos}
              onImageLoaded={async (file) => {
                await handleReferencePhotoFiles([file]);
                onNotify(t.toasts.driveImageLoaded, 'success');
              }}
              t={t}
              compact
            />
            {referencePhotos.length > 0 && (
              <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                {referencePhotos.map((refImg, idx) => (
                  <div
                    key={refImg.id}
                    className="group relative overflow-hidden rounded-lg border border-indigo-200/80 bg-white"
                  >
                    <div className="relative aspect-[4/3] w-full bg-slate-100">
                      <img
                        src={refImg.previewUrl}
                        alt={refImg.fileName}
                        className="h-full w-full object-cover"
                      />
                      <span className="absolute left-1 top-1 rounded bg-indigo-700/90 px-1 py-0.5 font-mono text-[9px] font-bold text-white">
                        #{idx + 1}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleRemoveReferencePhoto(refImg.id)}
                        className="absolute right-1 top-1 rounded-full bg-slate-900/75 p-0.5 text-white hover:bg-rose-600 transition"
                        aria-label="Remove reference image"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                    <div className="flex items-center justify-between gap-1 px-1.5 py-0.5 text-[9px]">
                      <span className="truncate font-medium text-slate-700" title={refImg.fileName}>
                        {refImg.fileName}
                      </span>
                      <label className="shrink-0 cursor-pointer font-bold text-indigo-700 hover:underline">
                        {t.evaluate.replaceRefPhotoBtn}
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(e) => {
                            void handleReferencePhotoFiles(e.target.files, refImg.id);
                            e.target.value = '';
                          }}
                          className="hidden"
                        />
                      </label>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <textarea
              ref={contextTextareaRef}
              value={exerciseContext}
              onChange={(e) => setExerciseContext(e.target.value)}
              rows={2}
              placeholder={
                skill === 'writing'
                  ? t.evaluate.contextPlaceholderWriting
                  : t.evaluate.contextPlaceholderReading
              }
              className="w-full rounded-xl border border-slate-200 bg-white p-2.5 text-xs leading-relaxed text-slate-800 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none"
            />
          </div>
        )}
      </div>

      {/* PASO 5 — Lanen Sarrerak (Ejercicios del alumnado + Botón principal "Ebaluatu") */}
      <div
        className={`rounded-2xl border bg-white px-4 py-3.5 shadow-2xs space-y-3 transition-all duration-300 ${
          !step3Done
            ? 'border-slate-200/70 opacity-65'
            : !step5HasWork
              ? 'border-indigo-300 ring-2 ring-indigo-400/50'
              : 'border-slate-200/90'
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            {renderStepBadge(5, step5Done, step3Done && !step5Done)}
            <h3 className="text-xs font-extrabold text-slate-900">
              5. {t.evaluate.compactStep5}
            </h3>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleSaveTestWithoutWork}
              disabled={batchProcessing || evaluating}
              className="inline-flex items-center gap-1.5 rounded-xl border border-amber-300 bg-amber-50/90 px-3 py-1.5 text-[11px] font-bold text-amber-900 shadow-2xs hover:bg-amber-100 hover:border-amber-400 transition disabled:opacity-50"
            >
              <BookmarkPlus className="h-3.5 w-3.5 text-amber-700 shrink-0" />
              <span>{t.evaluate.saveWithoutWorkBtn}</span>
            </button>

            {groupStudents.length > 0 && (
              <div className="inline-flex flex-wrap items-center gap-1 rounded-xl bg-slate-100 p-0.5">
              <button
                type="button"
                onClick={() => setInputMode('photo_batch')}
                className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-extrabold transition ${
                  inputMode === 'photo_batch'
                    ? 'bg-indigo-600 text-white shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Images className="h-3.5 w-3.5" />
                <span>{t.evaluate.inputModePhotoBatch}</span>
                {batchPhotos.length > 0 && (
                  <span
                    className={`rounded-full px-1.5 text-[10px] font-bold ${
                      inputMode === 'photo_batch'
                        ? 'bg-white/25 text-white'
                        : 'bg-indigo-600 text-white'
                    }`}
                  >
                    {batchPhotos.length}
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={() => setInputMode('text')}
                className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-bold transition ${
                  inputMode === 'text'
                    ? 'bg-white text-indigo-800 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <FileText className="h-3 w-3" />
                {t.evaluate.inputModeText}
              </button>
              <button
                type="button"
                onClick={() => setInputMode('image')}
                className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-bold transition ${
                  inputMode === 'image'
                    ? 'bg-white text-indigo-800 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Camera className="h-3 w-3" />
                {t.evaluate.inputModePhoto}
                {images.length > 0 && (
                  <span className="rounded-full bg-indigo-600 px-1.5 text-[10px] text-white">
                    {images.length}
                  </span>
                )}
              </button>
            </div>
          )}
          </div>
        </div>

        {groupStudents.length === 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50/70 p-3.5 text-xs text-amber-900">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 shrink-0 text-amber-600" />
              <span>{t.evaluate.noStudentsInGroup}</span>
            </div>
            <button
              type="button"
              onClick={onGoToStudents}
              className="inline-flex items-center gap-1 rounded-xl bg-amber-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-amber-700"
            >
              {t.evaluate.goToStudents}
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {inputMode === 'photo_batch' ? (
              <BatchPhotosReviewPanel
                groupStudents={groupStudents}
                activeRubric={activeRubric}
                activeModelId={settings.geminiModel}
                hasApiKey={hasApiKey}
                processing={batchProcessing}
                progress={batchProgress}
                error={batchError}
                failedPhotos={failedPhotos}
                photos={batchPhotos}
                batchItems={batchItems}
                onAddPhotos={handleAddBatchPhotos}
                onRemovePhoto={handleRemoveBatchPhoto}
                onMovePhoto={handleMoveBatchPhoto}
                onClearAllPhotos={handleClearBatchPhotos}
                onProcessPhotos={requestBatchPhotosEvaluation}
                onRetryFailedPhotos={handleRetryFailedPhotos}
                onCancelProcessing={handleCancelBatchProcessing}
                onUpdateBatchItem={handleUpdateBatchItem}
                onSaveAllValidated={handleSaveAllBatchValidated}
                onOpenSettings={onOpenSettings}
                highlightUpload={step3Done && !step5HasWork}
                highlightEvaluate={
                  step3Done && step5HasWork && !batchProcessing && batchItems.length === 0
                }
                testTitle={activityTitle.trim() || activeRubric.title}
                onNotify={onNotify}
                t={t}
              />
            ) : (
              <>
                  {/* Manual Student Selector ONLY shown in individual text/photo mode (never preselected) */}
                  <div className="rounded-xl border border-slate-200/90 bg-slate-50/70 p-3.5 space-y-2">
                    <label className="block text-xs font-bold text-slate-700">
                      {t.evaluate.selectStudent}
                    </label>
                    <select
                      value={selectedStudentId}
                      onChange={(e) => handleSelectStudent(e.target.value)}
                      className="w-full sm:max-w-md rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-semibold text-slate-800 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/15"
                    >
                      <option value="">{t.evaluate.selectStudentPlaceholder}</option>
                      {groupStudents.map((st) => {
                        const score = evaluatedMap.get(st.id);
                        return (
                          <option key={st.id} value={st.id}>
                            {st.fullName} ({st.code})
                            {score !== undefined ? ` — ✓ ${score.toFixed(1)}/10` : ''}
                          </option>
                        );
                      })}
                    </select>

                    {selectedStudent && selectedStudent.tags.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1.5 pt-1">
                        <span className="text-[11px] font-semibold text-slate-500">
                          {selectedStudent.code}:
                        </span>
                        {selectedStudent.tags.map((tag) => {
                          const disp = getTagDisplay(tag, lang);
                          return (
                            <span
                              key={tag}
                              className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${disp.classes}`}
                            >
                              {disp.label}
                            </span>
                          );
                        })}
                      </div>
                    )}
                  </div>
                  {inputMode === 'text' ? (
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="text-xs font-bold text-slate-700">
                          {t.evaluate.textAreaLabel}
                        </label>
                        <span className="text-[11px] font-semibold text-slate-400">
                          {t.evaluate.wordCount(wordCount)}
                        </span>
                      </div>
                      <textarea
                        value={studentText}
                        onChange={(e) => setStudentText(e.target.value)}
                        rows={8}
                        placeholder={t.evaluate.textAreaPlaceholder}
                        className="w-full rounded-xl border border-slate-200 bg-slate-50/40 p-4 text-sm leading-relaxed text-slate-800 placeholder:text-slate-400 focus:border-teal-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500/15"
                      />
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        multiple
                        onChange={(e) => {
                          void handleImageFiles(e.target.files);
                          e.target.value = '';
                        }}
                        className="hidden"
                      />
                      <input
                        ref={cameraInputRef}
                        type="file"
                        accept="image/*"
                        capture="environment"
                        onChange={(e) => {
                          void handleImageFiles(e.target.files);
                          e.target.value = '';
                        }}
                        className="hidden"
                      />

                      <div
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => {
                          e.preventDefault();
                          void handleImageFiles(e.dataTransfer.files);
                        }}
                        onClick={() => fileInputRef.current?.click()}
                        className="cursor-pointer rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50/60 px-6 py-7 text-center transition hover:border-teal-500 hover:bg-teal-50/30"
                      >
                        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-teal-600 shadow-xs border border-slate-100 mb-3">
                          <Camera className="h-6 w-6" />
                        </div>
                        <p className="text-sm font-bold text-slate-900">
                          {t.evaluate.photoDropTitle}
                        </p>
                        <p className="mx-auto mt-1 max-w-lg text-xs text-slate-500">
                          {t.evaluate.photoDropDesc}
                        </p>
                        <div className="mt-4 flex flex-wrap items-center justify-center gap-2.5">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              cameraInputRef.current?.click();
                            }}
                            className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow-2xs hover:bg-emerald-700 transition min-h-[38px]"
                          >
                            <Camera className="h-3.5 w-3.5" />
                            {t.evaluate.takePhotoBtn}
                          </button>
                          <span className="inline-flex items-center gap-1.5 rounded-xl bg-white border border-slate-200 px-4 py-2 text-xs font-bold text-teal-700 shadow-2xs min-h-[38px]">
                            <ImagePlus className="h-3.5 w-3.5" />
                            {t.evaluate.addPhotoBtn}
                          </span>
                        </div>
                      </div>

                      <GoogleDriveLinkInput
                        disabled={evaluating}
                        onImageLoaded={async (file) => {
                          await handleImageFiles([file]);
                          onNotify(t.toasts.driveImageLoaded, 'success');
                        }}
                        t={t}
                        compact
                      />

                      {/* Image Thumbnails */}
                      {images.length > 0 && (
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                          {images.map((img, idx) => (
                            <div
                              key={img.id}
                              className="group relative overflow-hidden rounded-xl border border-slate-200 bg-slate-100 aspect-[4/3]"
                            >
                              <img
                                src={img.previewUrl}
                                alt={img.fileName}
                                className="h-full w-full object-cover"
                              />
                              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-900/70 to-transparent px-2.5 py-1.5 text-[10px] font-semibold text-white truncate">
                                {idx + 1}. {img.fileName}
                              </div>
                              <button
                                type="button"
                                onClick={() => handleRemoveImage(img.id)}
                                className="absolute right-1.5 top-1.5 rounded-full bg-slate-900/75 p-1 text-white hover:bg-rose-600 transition"
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Optional extra text note alongside photo */}
                      <input
                        type="text"
                        value={studentText}
                        onChange={(e) => setStudentText(e.target.value)}
                        placeholder={t.evaluate.photoOptionalNote}
                        className="w-full rounded-xl border border-slate-200 bg-slate-50/40 px-3.5 py-2 text-xs text-slate-800 placeholder:text-slate-400 focus:border-teal-500 focus:bg-white focus:outline-none"
                      />
                    </div>
                  )}

                  {/* Missing API Key Warning */}
                  {!hasApiKey && (
                    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-xs text-amber-900">
                      <div className="flex items-center gap-2">
                        <AlertCircle className="h-4 w-4 shrink-0 text-amber-600" />
                        <span>{t.evaluate.missingKeyWarning}</span>
                      </div>
                      <button
                        type="button"
                        onClick={onOpenSettings}
                        className="inline-flex items-center gap-1 rounded-lg bg-amber-600 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-amber-700"
                      >
                        <Settings className="h-3.5 w-3.5" />
                        {t.evaluate.configureAi}
                      </button>
                    </div>
                  )}

                  {/* Error Alert */}
                  {evalError && (
                    <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-800">
                      <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-rose-600" />
                      <span className="break-words">{evalError}</span>
                    </div>
                  )}

                  {/* Evaluate Action Bar with Reasoning Level Selector */}
                  <div className="flex flex-col gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
                    {/* Reasoning Level Toggle (medium / high) */}
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-bold text-slate-600">
                        {t.evaluate.reasoningLabel}:
                      </span>
                      <div className="inline-flex rounded-xl bg-slate-100 p-1">
                        <button
                          type="button"
                          onClick={() => setReasoningLevel('medium')}
                          className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                            reasoningLevel === 'medium'
                              ? 'bg-white text-teal-800 shadow-2xs'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          <Zap className="h-3.5 w-3.5" />
                          {t.evaluate.reasoningMedium}
                        </button>
                        <button
                          type="button"
                          onClick={() => setReasoningLevel('high')}
                          className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                            reasoningLevel === 'high'
                              ? 'bg-white text-indigo-800 shadow-2xs'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          <Brain className="h-3.5 w-3.5" />
                          {t.evaluate.reasoningHigh}
                        </button>
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex flex-wrap items-center gap-2.5">
                      <button
                        type="button"
                        onClick={handleManualDraft}
                        disabled={evaluating}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition disabled:opacity-50"
                      >
                        <PenLine className="h-3.5 w-3.5" />
                        {t.evaluate.manualFallbackBtn}
                      </button>

                      <button
                        type="button"
                        onClick={requestIndividualEvaluation}
                        disabled={evaluating}
                        className={`inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-emerald-600 px-6 py-2.5 text-xs font-bold text-white shadow-sm shadow-indigo-600/25 hover:from-indigo-700 hover:to-emerald-700 transition-all duration-300 disabled:cursor-not-allowed disabled:opacity-60 ${
                          step3Done && step5HasWork && !evaluating && !draft
                            ? 'ring-2 ring-indigo-400/60 cta-ready-pulse scale-[1.02]'
                            : ''
                        }`}
                      >
                        {evaluating ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            {t.evaluate.evaluatingBtn}
                          </>
                        ) : (
                          <>
                            <Sparkles className="h-4 w-4" />
                            {t.evaluate.evaluateBtn}
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
        )}
      </div>

      {/* SECTION 3: Teacher Review & Editable Results Panel (Individual mode) */}
      {inputMode !== 'photo_batch' && draft && selectedStudent && (
        <EvaluationEditorPanel
          draft={draft}
          rubric={activeRubric}
          studentName={selectedStudent.fullName}
          studentEmail={selectedStudent.email}
          asignatura={activeSubject}
          testTitle={activityTitle.trim() || activeRubric.title}
          evalLanguage={evalLang}
          modelUsed={settings.geminiModel}
          reasoningLevel={reasoningLevel}
          hasNextPending={Boolean(nextPendingStudent && nextPendingStudent.id !== selectedStudent.id)}
          isSaved={savedForCurrentStudent}
          onChangeDraft={(next) => {
            setDraft(next);
            setSavedForCurrentStudent(false);
          }}
          onSave={handleSaveToDossier}
          onGoToNextPending={() => {
            if (nextPendingStudent) {
              setSelectedStudentId(nextPendingStudent.id);
              clearWorkForNextStudent();
            }
          }}
          onNotify={onNotify}
          t={t}
        />
      )}

      {/* Missing Reference Context Warning Modal */}
      {pendingEvalConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-slate-900/55 backdrop-blur-xs"
            onClick={() => setPendingEvalConfirm(null)}
          />
          <div className="relative z-10 w-full max-w-md rounded-2xl border border-amber-200 bg-white shadow-2xl overflow-hidden">
            <div className="flex items-start gap-3 border-b border-amber-100 bg-amber-50/80 px-6 py-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
                <AlertCircle className="h-5 w-5" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-base font-extrabold text-amber-950">
                  {t.evaluate.missingContextModal.title}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setPendingEvalConfirm(null)}
                className="rounded-lg p-1 text-amber-500 hover:bg-amber-100 hover:text-amber-800"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-6 space-y-5">
              <p className="text-sm leading-relaxed text-slate-700">
                {t.evaluate.missingContextModal.message}
              </p>

              <div className="flex flex-wrap items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    setPendingEvalConfirm(null);
                    setContextOpen(true);
                    setTimeout(() => {
                      contextTextareaRef.current?.scrollIntoView({
                        behavior: 'smooth',
                        block: 'center',
                      });
                      contextTextareaRef.current?.focus();
                    }, 120);
                  }}
                  className="rounded-xl bg-teal-600 px-4 py-2.5 text-xs font-bold text-white shadow-xs hover:bg-teal-700 transition"
                >
                  {t.evaluate.missingContextModal.addContextBtn}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const mode = pendingEvalConfirm;
                    setPendingEvalConfirm(null);
                    if (mode === 'individual') {
                      void executeIndividualEvaluation();
                    } else if (mode === 'batch') {
                      void executeBatchPhotosEvaluation();
                    }
                  }}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 transition"
                >
                  {t.evaluate.missingContextModal.continueAnywayBtn}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
