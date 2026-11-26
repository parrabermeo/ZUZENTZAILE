import React, { useMemo, useRef, useState } from 'react';
import {
  X,
  UserPlus,
  Camera,
  FileText,
  Sparkles,
  Loader2,
  AlertCircle,
  Save,
  Calendar,
  BookOpen,
  PenTool,
  Image as ImageIcon,
  Images,
} from 'lucide-react';
import type {
  AiEvaluationDraft,
  AppSettings,
  BatchEvaluationItem,
  EvaluationRecord,
  FailedBatchPhoto,
  Language,
  Rubric,
  StoredImageAsset,
  Student,
} from '../types';
import type { Translations } from '../i18n/translations';
import type { GroupedTestSession } from './TestHistoryModule';
import { TEXT_TYPOLOGIES, getBaseRubric } from '../data/defaultRubrics';
import {
  calculateWeightedScore,
  evaluateBatchPhotoWithAI,
  evaluateStudentWorkWithAI,
  resolveGeminiApiKey,
  type UploadedImageInput,
} from '../services/geminiService';
import {
  optimizeImageForStorage,
  optimizeJpegForGemini,
  type OptimizedJpegResult,
} from '../utils/imageOptimizer';
import {
  getSubjectBadgeClasses,
  getSubjectLabel,
  skillToModalityEs,
  subjectToLanguage,
} from '../utils/subjects';
import { EvaluationEditorPanel } from './EvaluationEditorPanel';
import { GoogleDriveLinkInput } from './GoogleDriveLinkInput';
import {
  BatchPhotosReviewPanel,
  type BatchPhotoItem,
  type BatchPhotoProgressState,
} from './BatchPhotosReviewPanel';

interface AddLateSubmissionModalProps {
  session: GroupedTestSession | null;
  groupStudents: Student[];
  savedRubrics: Rubric[];
  settings: AppSettings;
  lang: Language;
  t: Translations;
  onClose: () => void;
  onSaveEvaluation: (studentId: string, record: EvaluationRecord) => void;
  onSaveBatchEvaluations: (
    entries: Array<{ studentId: string; record: EvaluationRecord }>
  ) => void;
  onOpenSettings: () => void;
  onNotify: (message: string, type?: 'success' | 'info' | 'warning' | 'error') => void;
}

interface LatePhotoPreview extends UploadedImageInput {
  id: string;
  previewUrl: string;
  storageAsset: StoredImageAsset;
}

function dataUrlToUploadedImage(asset: StoredImageAsset): UploadedImageInput | null {
  if (!asset.dataUrl) return null;
  const commaIdx = asset.dataUrl.indexOf(',');
  if (commaIdx === -1) return null;
  const header = asset.dataUrl.slice(0, commaIdx);
  const base64Data = asset.dataUrl.slice(commaIdx + 1);
  const mimeMatch = header.match(/data:([^;]+);/);
  return {
    mimeType: mimeMatch?.[1] || 'image/jpeg',
    base64Data,
    fileName: asset.name || 'reference.jpg',
  };
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
    studentImages: [...(prev.studentImages || []), ...(cont.studentImages || [])],
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

export const AddLateSubmissionModal: React.FC<AddLateSubmissionModalProps> = ({
  session,
  groupStudents,
  savedRubrics,
  settings,
  lang,
  t,
  onClose,
  onSaveEvaluation,
  onSaveBatchEvaluations,
  onOpenSettings,
  onNotify,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const batchAbortRef = useRef<AbortController | null>(null);
  const optimizedCacheRef = useRef<Map<string, OptimizedJpegResult>>(new Map());

  const [evalMode, setEvalMode] = useState<'batch' | 'individual'>('batch');

  // Batch Multi-JPG State
  const [batchPhotos, setBatchPhotos] = useState<BatchPhotoItem[]>([]);
  const [batchProcessing, setBatchProcessing] = useState<boolean>(false);
  const [batchProgress, setBatchProgress] = useState<BatchPhotoProgressState | null>(null);
  const [batchError, setBatchError] = useState<string | null>(null);
  const [failedPhotos, setFailedPhotos] = useState<FailedBatchPhoto[]>([]);
  const [batchItems, setBatchItems] = useState<BatchEvaluationItem[]>([]);

  // Individual Student State
  const [selectedStudentId, setSelectedStudentId] = useState<string>('');
  const [inputMode, setInputMode] = useState<'image' | 'text'>('image');
  const [studentText, setStudentText] = useState<string>('');
  const [photos, setPhotos] = useState<LatePhotoPreview[]>([]);
  const [evaluating, setEvaluating] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<AiEvaluationDraft | null>(null);

  const evaluatedIds = useMemo(
    () => new Set((session?.entries || []).map((e) => e.student.id)),
    [session]
  );

  const missingStudents = useMemo(
    () =>
      groupStudents
        .filter((s) => !evaluatedIds.has(s.id))
        .sort((a, b) => a.fullName.localeCompare(b.fullName, lang === 'eu' ? 'eu' : 'es')),
    [groupStudents, evaluatedIds, lang]
  );

  const alreadyEvaluatedStudents = useMemo(
    () =>
      groupStudents
        .filter((s) => evaluatedIds.has(s.id))
        .sort((a, b) => a.fullName.localeCompare(b.fullName, lang === 'eu' ? 'eu' : 'es')),
    [groupStudents, evaluatedIds, lang]
  );

  if (!session) return null;

  const evalLang = subjectToLanguage(session.asignatura);
  const subjectLabel = getSubjectLabel(session.asignatura, lang);
  const typologyMeta =
    session.type === 'writing' && session.typology
      ? TEXT_TYPOLOGIES.find((item) => item.id === session.typology)
      : undefined;

  const activeRubric: Rubric = (() => {
    if (session.rubricId) {
      const found = savedRubrics.find((r) => r.id === session.rubricId);
      if (found) return found;
    }
    return getBaseRubric(session.type, evalLang, session.typology || 'narrative');
  })();

  const selectedStudent = groupStudents.find((s) => s.id === selectedStudentId) || null;
  const hasApiKey = Boolean(resolveGeminiApiKey(settings.geminiApiKey));

  const reusedRefImages: UploadedImageInput[] = (session.pruebaImagenes || [])
    .map(dataUrlToUploadedImage)
    .filter((img): img is UploadedImageInput => Boolean(img));

  // ---------- Batch Multi-Image Handlers ----------
  const handleAddBatchPhotos = (files: FileList | File[]) => {
    const validFiles = Array.from(files).filter((f) => {
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
    if (validFiles.length === 0) {
      setBatchError(t.evaluate.batchPhotos.onlyJpgError);
      return;
    }
    const additions: BatchPhotoItem[] = validFiles.map((file) => ({
      id: `hist-photo-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      file,
      name: file.name,
      sizeBytes: file.size,
      previewUrl: URL.createObjectURL(file),
    }));
    setBatchPhotos((prev) => [...prev, ...additions]);
    setBatchError(null);
  };

  const handleRemoveBatchPhoto = (photoId: string) => {
    setBatchPhotos((prev) => {
      const target = prev.find((p) => p.id === photoId);
      if (target) URL.revokeObjectURL(target.previewUrl);
      optimizedCacheRef.current.delete(photoId);
      return prev.filter((p) => p.id !== photoId);
    });
    setFailedPhotos((prev) => prev.filter((f) => f.photoId !== photoId));
  };

  const handleMoveBatchPhoto = (index: number, direction: -1 | 1) => {
    setBatchPhotos((prev) => {
      const targetIdx = index + direction;
      if (targetIdx < 0 || targetIdx >= prev.length) return prev;
      const copy = [...prev];
      const [moved] = copy.splice(index, 1);
      copy.splice(targetIdx, 0, moved);
      return copy;
    });
  };

  const handleClearBatchPhotos = () => {
    batchPhotos.forEach((p) => URL.revokeObjectURL(p.previewUrl));
    optimizedCacheRef.current.clear();
    setBatchPhotos([]);
    setBatchItems([]);
    setFailedPhotos([]);
    setBatchError(null);
    setBatchProgress(null);
  };

  const runBatchPhotos = async (
    entriesToRun: Array<{ photo: BatchPhotoItem; photoNumber: number }>,
    totalPhotosCount: number,
    isSelectiveRetry: boolean
  ) => {
    const abortController = new AbortController();
    batchAbortRef.current = abortController;

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
        let optimized = optimizedCacheRef.current.get(photo.id);
        if (!optimized) {
          optimized = await optimizeJpegForGemini(photo.file, {
            maxWidth: 1200,
            quality: 0.7,
          });
          optimizedCacheRef.current.set(photo.id, optimized);
        }

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

        const rawReturned = await evaluateBatchPhotoWithAI({
          userApiKey: settings.geminiApiKey,
          photoNumber,
          totalPhotos: totalPhotosCount,
          base64Data: optimized.base64Data,
          mimeType: 'image/jpeg',
          previousStudentHint: lastDetectedStudentName,
          evalLanguage: evalLang,
          skill: session.type,
          typologyLabel: typologyMeta ? typologyMeta.title[evalLang] : undefined,
          activityTitle: session.title,
          exerciseContext: session.context,
          referenceImages: reusedRefImages.length > 0 ? reusedRefImages : undefined,
          rubric: activeRubric,
          roster: groupStudents,
          signal: abortController.signal,
          onAttemptStatus: ({ attempt, model }) => {
            setBatchProgress((prev) =>
              prev
                ? { ...prev, activeAttempt: attempt, activeModelName: model }
                : {
                    currentPhoto: photoNumber,
                    totalPhotos: totalPhotosCount,
                    percent: Math.max(4, Math.round((i / entriesToRun.length) * 100)),
                    detectedSoFar: detectedCount,
                    activeAttempt: attempt,
                    activeModelName: model,
                  }
            );
          },
        });

        const returnedItems = rawReturned.map((item) => ({
          ...item,
          studentImages: [studentThumbAsset],
        }));

        if (isSelectiveRetry) {
          recoveredCount += 1;
          setFailedPhotos((prev) => prev.filter((f) => f.photoId !== photo.id));
        }

        if (returnedItems.length > 0) {
          setBatchItems((prev) => {
            const next = [...prev];
            for (const item of returnedItems) {
              if (item.isContinuation && next.length > 0) {
                const targetIdx = isSelectiveRetry
                  ? next.reduce(
                      (best, cur, idx) =>
                        getFirstPageNumber(cur.pages) < photoNumber ? idx : best,
                      -1
                    )
                  : next.length - 1;
                if (targetIdx >= 0) {
                  next[targetIdx] = mergeContinuationIntoPrevious(next[targetIdx], item);
                  continue;
                }
              }
              next.push(item);
            }
            next.sort((a, b) => getFirstPageNumber(a.pages) - getFirstPageNumber(b.pages));
            return next;
          });

          const lastItem = returnedItems[returnedItems.length - 1];
          if (!lastItem.isContinuation) {
            const matchedRosterStudent = lastItem.matchedStudentId
              ? groupStudents.find((s) => s.id === lastItem.matchedStudentId)
              : undefined;
            lastDetectedStudentName =
              matchedRosterStudent?.fullName || lastItem.detectedName || lastDetectedStudentName;
            detectedCount += returnedItems.filter((it) => !it.isContinuation).length;
          }
        }
      } catch (err) {
        if (err instanceof Error && err.message === 'CANCELLED') {
          onNotify(t.evaluate.batchPhotos.cancelledNotice, 'info');
          break;
        }
        const errMsg = err instanceof Error ? err.message : String(err);
        nextFailures.push({
          photoId: photo.id,
          photoNumber,
          fileName: photo.name,
          error: errMsg,
        });
        setFailedPhotos((prev) => {
          const filtered = prev.filter((f) => f.photoId !== photo.id);
          return [...filtered, { photoId: photo.id, photoNumber, fileName: photo.name, error: errMsg }].sort(
            (a, b) => a.photoNumber - b.photoNumber
          );
        });
      }

      setBatchProgress({
        currentPhoto: photoNumber,
        totalPhotos: totalPhotosCount,
        percent: Math.round(((i + 1) / entriesToRun.length) * 100),
        detectedSoFar: detectedCount,
      });
    }

    if (!abortController.signal.aborted) {
      if (isSelectiveRetry && recoveredCount > 0) {
        onNotify(t.evaluate.batchPhotos.retrySuccessNotice(recoveredCount), 'success');
      } else if (!isSelectiveRetry && detectedCount === 0 && nextFailures.length === 0) {
        setBatchError(t.evaluate.batchPhotos.emptyBatchError);
      } else if (!isSelectiveRetry && detectedCount > 0) {
        onNotify(t.evaluate.batchPhotos.detectedLiveCount(detectedCount), 'success');
      }
    }
  };

  const handleProcessBatchPhotos = async () => {
    if (batchPhotos.length === 0 || groupStudents.length === 0) return;
    if (!hasApiKey) {
      setBatchError(t.evaluate.missingKeyWarning);
      return;
    }

    setBatchProcessing(true);
    setBatchError(null);
    setFailedPhotos([]);
    setBatchItems([]);

    try {
      const entries = batchPhotos.map((photo, idx) => ({ photo, photoNumber: idx + 1 }));
      await runBatchPhotos(entries, batchPhotos.length, false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setBatchError(msg);
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
      const entriesToRetry = failedPhotos
        .map((fp) => {
          const idx = batchPhotos.findIndex((p) => p.id === fp.photoId);
          return idx >= 0 ? { photo: batchPhotos[idx], photoNumber: idx + 1 } : null;
        })
        .filter((e): e is { photo: BatchPhotoItem; photoNumber: number } => Boolean(e));
      await runBatchPhotos(entriesToRetry, batchPhotos.length, true);
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
    setBatchItems((prev) => prev.map((it) => (it.batchItemId === batchItemId ? updater(it) : it)));
  };

  const handleSaveAllBatchValidated = () => {
    const selectedByStudent = new Map<string, number>();
    for (const item of batchItems) {
      if (item.selected && item.matchedStudentId) {
        selectedByStudent.set(
          item.matchedStudentId,
          (selectedByStudent.get(item.matchedStudentId) || 0) + 1
        );
      }
    }

    const readyItems = batchItems.filter(
      (item) =>
        item.selected &&
        item.matchedStudentId &&
        (selectedByStudent.get(item.matchedStudentId) || 0) === 1
    );
    if (readyItems.length === 0) return;

    const now = new Date().toISOString();
    const entries = readyItems.map((item, idx) => {
      const studentId = item.matchedStudentId!;
      const criteriaScores: Record<string, number> = {};
      for (const c of item.draft.criteria) {
        criteriaScores[c.criterionId] = c.level;
      }
      const recordId =
        typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? `eval-${crypto.randomUUID()}`
          : `eval-${Date.now()}-${idx}`;

      const record: EvaluationRecord = {
        id: recordId,
        studentId,
        groupId: session.groupId,
        date: session.date,
        asignatura: session.asignatura,
        modalidad: skillToModalityEs(session.type),
        type: session.type,
        typology: session.type === 'writing' ? session.typology : undefined,
        rubricId: activeRubric.id,
        rubricTitle: activeRubric.title,
        language: evalLang,
        title: session.title,
        context: session.context,
        pruebaImagenes: session.pruebaImagenes,
        studentImages:
          item.studentImages && item.studentImages.length > 0 ? item.studentImages : undefined,
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
      return { studentId, record };
    });

    onSaveBatchEvaluations(entries);
    handleClearBatchPhotos();
    onClose();
  };

  // ---------- Individual Student Handlers ----------
  const handlePhotoFiles = async (fileList: FileList | File[] | null) => {
    if (!fileList || fileList.length === 0) return;
    const additions: LatePhotoPreview[] = [];

    for (const file of Array.from(fileList)) {
      if (!file.type.startsWith('image/')) continue;
      const opt = await optimizeJpegForGemini(file, { maxWidth: 1200, quality: 0.7 });
      const id = `late-img-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
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
      setPhotos((prev) => [...prev, ...additions]);
      setError(null);
    }
  };

  const handleRemovePhoto = (id: string) => {
    setPhotos((prev) => {
      const target = prev.find((p) => p.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((p) => p.id !== id);
    });
  };

  const handleEvaluateIndividual = async () => {
    setError(null);
    if (!selectedStudent) {
      setError(t.evaluate.needStudentWarning);
      return;
    }

    const hasContent =
      (inputMode === 'image' && photos.length > 0) ||
      (inputMode === 'text' && studentText.trim().length > 0);

    if (!hasContent) {
      setError(t.evaluate.needInputWarning);
      return;
    }

    if (!hasApiKey) {
      setError(t.evaluate.missingKeyWarning);
      return;
    }

    setEvaluating(true);
    try {
      const pendingCourse =
        session.asignatura === 'euskera'
          ? selectedStudent.pendingSubjects?.euskera ?? null
          : selectedStudent.pendingSubjects?.lengua ?? null;

      const result = await evaluateStudentWorkWithAI({
        userApiKey: settings.geminiApiKey,
        model: settings.geminiModel,
        reasoningLevel: 'medium',
        evalLanguage: evalLang,
        skill: session.type,
        typologyLabel: typologyMeta ? typologyMeta.title[evalLang] : undefined,
        activityTitle: session.title,
        exerciseContext: session.context,
        referenceImages: reusedRefImages.length > 0 ? reusedRefImages : undefined,
        rubric: activeRubric,
        studentName: selectedStudent.fullName,
        studentTags: selectedStudent.tags,
        pendingCourse,
        studentText: studentText.trim(),
        images: inputMode === 'image' ? photos : undefined,
      });

      setDraft(result);
      onNotify(t.toasts.evaluationDone, 'success');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    } finally {
      setEvaluating(false);
    }
  };

  const handleSaveIndividual = () => {
    if (!selectedStudent || !draft) return;

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
      groupId: session.groupId,
      date: session.date,
      asignatura: session.asignatura,
      modalidad: skillToModalityEs(session.type),
      type: session.type,
      typology: session.type === 'writing' ? session.typology : undefined,
      rubricId: activeRubric.id,
      rubricTitle: activeRubric.title,
      language: evalLang,
      title: session.title,
      context: session.context,
      pruebaImagenes: session.pruebaImagenes,
      studentImages:
        inputMode === 'image' && photos.length > 0
          ? photos.map((p) => p.storageAsset)
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
      reasoningLevel: 'medium',
      createdAt: new Date().toISOString(),
    };

    onSaveEvaluation(selectedStudent.id, record);
    photos.forEach((p) => URL.revokeObjectURL(p.previewUrl));
    onClose();
  };

  const hasReusedReference = Boolean(
    session.context?.trim() || (session.pruebaImagenes && session.pruebaImagenes.length > 0)
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4">
      <div
        className="fixed inset-0 bg-slate-900/55 backdrop-blur-xs"
        onClick={() => {
          if (!batchProcessing && !evaluating) onClose();
        }}
      />
      <div className="relative z-10 w-full max-w-5xl max-h-[92vh] overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-2xl">
        {/* Header */}
        <div className="sticky top-0 z-20 flex items-start justify-between gap-3 border-b border-slate-100 bg-white/95 backdrop-blur-xs px-5 py-4">
          <div className="flex items-start gap-3 min-w-0">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-600 border border-amber-200">
              <Sparkles className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h3 className="text-base font-extrabold text-slate-900 truncate">
                {t.history.lateModal.title}
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">{t.history.lateModal.subtitle}</p>
            </div>
          </div>
          <button
            type="button"
            disabled={batchProcessing || evaluating}
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-40"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* Top Reused Test Summary Card (Title, Subject, Date, Rubric, Reference Prompt Thumbnail) */}
          <div className="rounded-xl border border-amber-200/80 bg-amber-50/35 p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0 flex-1 space-y-1.5">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span
                  className={`rounded-full border px-2.5 py-0.5 text-[11px] font-extrabold ${getSubjectBadgeClasses(
                    session.asignatura
                  )}`}
                >
                  {subjectLabel}
                </span>
                <span className="inline-flex items-center gap-1 rounded-lg bg-white border border-slate-200 px-2 py-0.5 font-semibold text-slate-700">
                  <Calendar className="h-3 w-3 text-amber-600" />
                  {session.date}
                </span>
                <span className="rounded-full bg-slate-900 px-2.5 py-0.5 text-[11px] font-bold text-white">
                  {session.groupName}
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-white border border-slate-200 px-2.5 py-0.5 text-[11px] font-bold text-slate-700">
                  {session.type === 'reading' ? (
                    <BookOpen className="h-3 w-3 text-indigo-600" />
                  ) : (
                    <PenTool className="h-3 w-3 text-emerald-600" />
                  )}
                  {session.type === 'reading'
                    ? t.rubrics.readingCardTitle
                    : `${t.rubrics.writingCardTitle}${
                        typologyMeta ? ` · ${typologyMeta.title[lang]}` : ''
                      }`}
                </span>
                {hasReusedReference && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 text-[10px] font-bold text-emerald-800">
                    <ImageIcon className="h-3 w-3" />
                    {t.history.lateModal.reusedRefBadge}
                  </span>
                )}
              </div>
              <p className="text-sm font-extrabold text-slate-900">{session.title}</p>
              <p className="text-[11px] text-slate-600">
                {activeRubric.title} ·{' '}
                {activeRubric.criteria.map((c) => `${c.code} (${c.weight}pt)`).join(' · ')}
              </p>
            </div>

            {session.pruebaImagenes && session.pruebaImagenes.length > 0 && (
              <div className="flex items-center gap-1.5 shrink-0">
                {session.pruebaImagenes.slice(0, 3).map((img, idx) => (
                  <div
                    key={img.id}
                    className="relative h-14 w-14 overflow-hidden rounded-lg border border-amber-300 bg-white shadow-2xs"
                    title={img.name}
                  >
                    <img src={img.dataUrl} alt={img.name} className="h-full w-full object-cover" />
                    <span className="absolute left-0.5 top-0.5 rounded bg-slate-900/75 px-1 text-[9px] font-bold text-white">
                      #{idx + 1}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Evaluation Mode Tabs: Batch Multi-JPG Photos vs Individual Student */}
          <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 pb-3">
            <button
              type="button"
              disabled={batchProcessing || evaluating}
              onClick={() => setEvalMode('batch')}
              className={`inline-flex items-center gap-2 rounded-xl border-2 px-4 py-2 text-xs font-extrabold transition ${
                evalMode === 'batch'
                  ? 'border-indigo-600 bg-indigo-600 text-white shadow-xs'
                  : 'border-slate-200 bg-white text-slate-700 hover:border-indigo-300'
              }`}
            >
              <Images className="h-4 w-4" />
              {t.history.lateModal.batchTab}
            </button>
            <button
              type="button"
              disabled={batchProcessing || evaluating}
              onClick={() => setEvalMode('individual')}
              className={`inline-flex items-center gap-2 rounded-xl border-2 px-4 py-2 text-xs font-extrabold transition ${
                evalMode === 'individual'
                  ? 'border-indigo-600 bg-indigo-600 text-white shadow-xs'
                  : 'border-slate-200 bg-white text-slate-700 hover:border-indigo-300'
              }`}
            >
              <UserPlus className="h-4 w-4" />
              {t.history.lateModal.individualTab}
            </button>
          </div>

          {evalMode === 'batch' ? (
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
              onProcessPhotos={handleProcessBatchPhotos}
              onRetryFailedPhotos={handleRetryFailedPhotos}
              onCancelProcessing={() => batchAbortRef.current?.abort()}
              onUpdateBatchItem={handleUpdateBatchItem}
              onSaveAllValidated={handleSaveAllBatchValidated}
              onOpenSettings={onOpenSettings}
              highlightUpload={batchPhotos.length === 0}
              highlightEvaluate={batchPhotos.length > 0 && !batchProcessing && batchItems.length === 0}
              testTitle={session.title}
              onNotify={onNotify}
              t={t}
            />
          ) : (
            <div className="space-y-4">
              {/* 1. Select Missing Student */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-700">
                  {t.history.lateModal.selectStudentLabel}
                </label>
                <select
                  value={selectedStudentId}
                  onChange={(e) => {
                    setSelectedStudentId(e.target.value);
                    setDraft(null);
                    setError(null);
                  }}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 py-2.5 text-xs font-semibold text-slate-900 focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/15"
                >
                  <option value="">{t.history.lateModal.selectStudentPlaceholder}</option>
                  {missingStudents.length > 0 && (
                    <optgroup label={t.history.lateModal.missingStudentsGroup}>
                      {missingStudents.map((st) => (
                        <option key={st.id} value={st.id}>
                          {st.fullName} ({st.code})
                        </option>
                      ))}
                    </optgroup>
                  )}
                  {alreadyEvaluatedStudents.length > 0 && (
                    <optgroup label={t.history.lateModal.alreadyEvaluatedGroup}>
                      {alreadyEvaluatedStudents.map((st) => (
                        <option key={st.id} value={st.id}>
                          {st.fullName} ({st.code}) — ✓
                        </option>
                      ))}
                    </optgroup>
                  )}
                </select>
                {missingStudents.length === 0 && (
                  <p className="text-[11px] text-amber-700">{t.history.lateModal.allEvaluatedHint}</p>
                )}
              </div>

              {/* 2. Upload Photo (.jpg) OR Paste Text */}
              <div className="space-y-3">
                <div className="inline-flex rounded-xl bg-slate-100 p-1 gap-1">
                  <button
                    type="button"
                    onClick={() => setInputMode('image')}
                    className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-bold transition ${
                      inputMode === 'image'
                        ? 'bg-white text-indigo-800 shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <Camera className="h-3.5 w-3.5" />
                    {t.history.lateModal.uploadPhotoTab}
                  </button>
                  <button
                    type="button"
                    onClick={() => setInputMode('text')}
                    className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-bold transition ${
                      inputMode === 'text'
                        ? 'bg-white text-indigo-800 shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <FileText className="h-3.5 w-3.5" />
                    {t.history.lateModal.pasteTextTab}
                  </button>
                </div>

                {inputMode === 'image' ? (
                  <div className="space-y-3">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={(e) => {
                        void handlePhotoFiles(e.target.files);
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
                        void handlePhotoFiles(e.target.files);
                        e.target.value = '';
                      }}
                      className="hidden"
                    />
                    <div
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault();
                        void handlePhotoFiles(e.dataTransfer.files);
                      }}
                      onClick={() => fileInputRef.current?.click()}
                      className="cursor-pointer rounded-xl border-2 border-dashed border-slate-300 bg-slate-50/70 px-4 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 hover:border-indigo-400 hover:bg-indigo-50/30 transition"
                    >
                      <div className="flex items-center gap-3">
                        <Camera className="h-5 w-5 text-indigo-600 shrink-0" />
                        <div>
                          <p className="text-xs font-bold text-slate-800">
                            {t.evaluate.photoDropTitle}
                          </p>
                          <p className="text-[11px] text-slate-500">{t.evaluate.addPhotoBtn}</p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          cameraInputRef.current?.click();
                        }}
                        className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white shadow-2xs hover:bg-emerald-700 transition min-h-[38px] shrink-0"
                      >
                        <Camera className="h-3.5 w-3.5" />
                        {t.evaluate.takePhotoBtn}
                      </button>
                    </div>

                    <GoogleDriveLinkInput
                      disabled={evaluating}
                      onImageLoaded={(file) => handlePhotoFiles([file])}
                      t={t}
                      compact
                    />

                    {photos.length > 0 && (
                      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                        {photos.map((img, idx) => (
                          <div
                            key={img.id}
                            className="relative overflow-hidden rounded-lg border border-slate-200 bg-slate-100 aspect-[4/3]"
                          >
                            <img
                              src={img.previewUrl}
                              alt={img.fileName}
                              className="h-full w-full object-cover"
                            />
                            <span className="absolute left-1 top-1 rounded bg-slate-900/75 px-1 text-[9px] font-bold text-white">
                              #{idx + 1}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleRemovePhoto(img.id)}
                              className="absolute right-1 top-1 rounded-full bg-slate-900/75 p-0.5 text-white hover:bg-rose-600"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <textarea
                    value={studentText}
                    onChange={(e) => setStudentText(e.target.value)}
                    rows={5}
                    placeholder={t.evaluate.textAreaPlaceholder}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50/50 p-3 text-sm leading-relaxed text-slate-800 placeholder:text-slate-400 focus:border-indigo-500 focus:bg-white focus:outline-none"
                  />
                )}
              </div>

              {error && (
                <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-800">
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-rose-600" />
                  <span className="break-words">{error}</span>
                </div>
              )}

              {/* Evaluate Button (strictly clean "Ebaluatu" / "Evaluar") */}
              <div className="flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={handleEvaluateIndividual}
                  disabled={evaluating}
                  className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-emerald-600 px-6 py-2.5 text-xs font-bold text-white shadow-sm hover:from-indigo-700 hover:to-emerald-700 transition disabled:opacity-60"
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

              {/* Editable Evaluation Result Draft */}
              {draft && selectedStudent && (
                <div className="space-y-4 border-t border-slate-200 pt-5">
                  <EvaluationEditorPanel
                    draft={draft}
                    rubric={activeRubric}
                    studentName={selectedStudent.fullName}
                    studentEmail={selectedStudent.email}
                    asignatura={session.asignatura}
                    testTitle={session.title}
                    evalLanguage={evalLang}
                    modelUsed={settings.geminiModel}
                    reasoningLevel="medium"
                    hasNextPending={false}
                    isSaved={false}
                    embedded
                    onChangeDraft={setDraft}
                    onNotify={onNotify}
                    t={t}
                  />

                  <div className="flex items-center justify-end gap-2.5 pt-2">
                    <button
                      type="button"
                      onClick={onClose}
                      className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                    >
                      {t.history.modalCancel}
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveIndividual}
                      className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-emerald-700 transition"
                    >
                      <Save className="h-4 w-4" />
                      {t.history.lateModal.saveLateBtn}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
