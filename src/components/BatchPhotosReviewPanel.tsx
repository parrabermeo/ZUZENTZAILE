import React, { useMemo, useRef, useState, useEffect } from 'react';
import {
  Images,
  ImagePlus,
  Camera,
  Sparkles,
  Loader2,
  AlertCircle,
  CheckCircle2,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  Save,
  Users,
  X,
  Settings,
  UserCheck,
  UserX,
  Square,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import type {
  AiEvaluationDraft,
  BatchEvaluationItem,
  FailedBatchPhoto,
  GeminiModelId,
  Rubric,
  Student,
} from '../types';
import type { Translations } from '../i18n/translations';
import { DEFAULT_GEMINI_MODEL } from '../services/geminiService';
import { EvaluationEditorPanel } from './EvaluationEditorPanel';
import { GoogleDriveLinkInput } from './GoogleDriveLinkInput';

export interface BatchPhotoItem {
  id: string;
  file: File;
  name: string;
  sizeBytes: number;
  previewUrl: string;
}

export interface BatchPhotoProgressState {
  currentPhoto: number;
  totalPhotos: number;
  percent: number;
  detectedSoFar: number;
  activeAttempt?: number;
  activeModelName?: string;
}

interface BatchPhotosReviewPanelProps {
  groupStudents: Student[];
  activeRubric: Rubric;
  activeModelId?: GeminiModelId;
  hasApiKey: boolean;
  processing: boolean;
  progress: BatchPhotoProgressState | null;
  error: string | null;
  failedPhotos: FailedBatchPhoto[];
  photos: BatchPhotoItem[];
  batchItems: BatchEvaluationItem[];
  onAddPhotos: (files: FileList | File[]) => void;
  onRemovePhoto: (photoId: string) => void;
  onMovePhoto: (index: number, direction: -1 | 1) => void;
  onClearAllPhotos: () => void;
  onProcessPhotos: () => void;
  onRetryFailedPhotos: () => void;
  onCancelProcessing: () => void;
  onUpdateBatchItem: (
    batchItemId: string,
    updater: (item: BatchEvaluationItem) => BatchEvaluationItem
  ) => void;
  onSaveAllValidated: () => void;
  onOpenSettings: () => void;
  highlightUpload?: boolean;
  highlightEvaluate?: boolean;
  testTitle?: string;
  t: Translations;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export const BatchPhotosReviewPanel: React.FC<BatchPhotosReviewPanelProps> = ({
  groupStudents,
  activeRubric,
  activeModelId = DEFAULT_GEMINI_MODEL,
  hasApiKey,
  processing,
  progress,
  error,
  failedPhotos,
  photos,
  batchItems,
  onAddPhotos,
  onRemovePhoto,
  onMovePhoto,
  onClearAllPhotos,
  onProcessPhotos,
  onRetryFailedPhotos,
  onCancelProcessing,
  onUpdateBatchItem,
  onSaveAllValidated,
  onOpenSettings,
  highlightUpload = false,
  highlightEvaluate = false,
  testTitle,
  t,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [expandedItems, setExpandedItems] = useState<Record<string, boolean>>({});
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  const safeGroupStudents = Array.isArray(groupStudents) ? groupStudents : [];
  const safeBatchItems = Array.isArray(batchItems) ? batchItems : [];
  const safePhotos = Array.isArray(photos) ? photos : [];

  // Clean up expanded map only when the entire batch is cleared
  useEffect(() => {
    if (safeBatchItems.length === 0) {
      setExpandedItems({});
    }
  }, [safeBatchItems.length]);

  const toggleItemExpanded = (itemId: string) => {
    setExpandedItems((prev) => ({
      ...prev,
      [itemId]: !prev[itemId],
    }));
  };

  const allExpanded =
    safeBatchItems.length > 0 &&
    safeBatchItems.every((item) => Boolean(expandedItems[item.batchItemId]));

  const handleToggleAllExpanded = () => {
    if (allExpanded) {
      setExpandedItems({});
    } else {
      const next: Record<string, boolean> = {};
      for (const item of safeBatchItems) {
        next[item.batchItemId] = true;
      }
      setExpandedItems(next);
    }
  };

  const studentMap = useMemo(
    () => new Map(safeGroupStudents.map((s) => [s.id, s])),
    [safeGroupStudents]
  );

  const assignedStudentCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of safeBatchItems) {
      if (item?.selected && item?.matchedStudentId) {
        counts.set(item.matchedStudentId, (counts.get(item.matchedStudentId) || 0) + 1);
      }
    }
    return counts;
  }, [safeBatchItems]);

  const matchedIds = useMemo(() => {
    const set = new Set<string>();
    safeBatchItems.forEach((item) => {
      if (item?.matchedStudentId) set.add(item.matchedStudentId);
    });
    return set;
  }, [safeBatchItems]);

  const missingStudents = useMemo(
    () => safeGroupStudents.filter((s) => s?.id && !matchedIds.has(s.id)),
    [safeGroupStudents, matchedIds]
  );

  const matchedCount = safeBatchItems.filter((i) => Boolean(i?.matchedStudentId)).length;
  const unmatchedCount = safeBatchItems.length - matchedCount;

  const validatedItemsReadyToSave = useMemo(
    () =>
      safeBatchItems.filter(
        (item) =>
          item?.selected &&
          Boolean(item?.matchedStudentId) &&
          (assignedStudentCounts.get(item.matchedStudentId!) || 0) === 1
      ),
    [safeBatchItems, assignedStudentCounts]
  );

  const progressMessage = progress
    ? t.evaluate.batchPhotos.analyzingPhoto(progress.currentPhoto, progress.totalPhotos)
    : t.evaluate.batchPhotos.processingTitle;

  const progressPercent = progress ? Math.min(100, Math.max(4, Math.round(progress.percent))) : 5;

  return (
    <div className="space-y-5">
      {/* Multi-Image Upload, Direct Rear Camera & Google Drive Link Zone */}
      <div className="space-y-3">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          onChange={(e) => {
            if (e.target.files && e.target.files.length > 0) {
              onAddPhotos(e.target.files);
            }
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
            if (e.target.files && e.target.files.length > 0) {
              onAddPhotos(e.target.files);
            }
            e.target.value = '';
          }}
          className="hidden"
        />

        {safePhotos.length === 0 ? (
          <div className="space-y-2.5">
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                  onAddPhotos(e.dataTransfer.files);
                }
              }}
              onClick={() => fileInputRef.current?.click()}
              className={`cursor-pointer rounded-xl border-2 border-dashed px-4 py-3.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 transition-all duration-300 ${
                highlightUpload
                  ? 'border-indigo-400 bg-indigo-50/60 ring-2 ring-indigo-400/50 shadow-xs'
                  : 'border-slate-300 bg-slate-50/70 hover:border-indigo-400 hover:bg-indigo-50/40'
              }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-600 to-emerald-600 text-white shadow-xs">
                  <Images className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-extrabold text-slate-900 truncate">
                    {t.evaluate.batchPhotos.dropTitle}
                  </p>
                  <p className="text-[11px] text-slate-500 line-clamp-1 mt-0.5">
                    {t.evaluate.cleanStartHint}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    cameraInputRef.current?.click();
                  }}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white shadow-2xs hover:bg-emerald-700 transition min-h-[38px]"
                >
                  <Camera className="h-3.5 w-3.5" />
                  {t.evaluate.takePhotoBtn}
                </button>
                <span className="inline-flex items-center gap-1.5 rounded-xl bg-white border border-indigo-200 px-3.5 py-2 text-xs font-bold text-indigo-700 shadow-2xs hover:bg-indigo-50 transition min-h-[38px]">
                  <ImagePlus className="h-3.5 w-3.5" />
                  {t.evaluate.batchPhotos.selectBtn}
                </span>
                <button
                  type="button"
                  disabled
                  onClick={(e) => e.stopPropagation()}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-slate-200 px-4 py-2 text-xs font-bold text-slate-500 cursor-not-allowed min-h-[38px]"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  {t.evaluate.batchPhotos.processBtn}
                </button>
              </div>
            </div>

            <GoogleDriveLinkInput
              disabled={processing}
              onImageLoaded={(file) => onAddPhotos([file])}
              t={t}
              compact
            />
          </div>
        ) : (
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              if (dragIndex !== null) return;
              e.preventDefault();
              if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                onAddPhotos(e.dataTransfer.files);
              }
            }}
            className="panel-slide-down rounded-xl border border-indigo-200/90 bg-indigo-50/30 p-3 space-y-3 transition-all duration-300"
          >
            {/* Compact Top Action Bar: Count + Camera + Add More + Clear + ALWAYS-VISIBLE "Ebaluatu" CTA */}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-600 px-2.5 py-0.5 text-[11px] font-bold text-white">
                  <Images className="h-3 w-3" />
                  {t.evaluate.batchPhotos.photosCountLabel(safePhotos.length)}
                </span>
                <span className="hidden md:inline text-[11px] text-slate-500">
                  {t.evaluate.batchPhotos.reorderHint}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={processing}
                  onClick={() => cameraInputRef.current?.click()}
                  className="inline-flex items-center gap-1 rounded-xl bg-emerald-600 px-2.5 py-1.5 text-[11px] font-bold text-white hover:bg-emerald-700 disabled:opacity-50 transition min-h-[34px]"
                >
                  <Camera className="h-3.5 w-3.5" />
                  {t.evaluate.takePhotoBtn}
                </button>
                <button
                  type="button"
                  disabled={processing}
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center gap-1 rounded-xl border border-indigo-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-indigo-700 hover:bg-indigo-50 disabled:opacity-50 transition min-h-[34px]"
                >
                  <ImagePlus className="h-3.5 w-3.5" />
                  {t.evaluate.batchPhotos.addMoreBtn}
                </button>
                <button
                  type="button"
                  disabled={processing}
                  onClick={onClearAllPhotos}
                  className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-slate-600 hover:bg-rose-50 hover:text-rose-700 hover:border-rose-200 disabled:opacity-50 transition min-h-[34px]"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  {t.evaluate.batchPhotos.clearAllBtn}
                </button>

                {!processing && (
                  <button
                    type="button"
                    onClick={onProcessPhotos}
                    disabled={!hasApiKey || safeGroupStudents.length === 0}
                    className={`inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-indigo-600 to-emerald-600 px-5 py-1.5 text-xs font-extrabold text-white shadow-sm hover:from-indigo-700 hover:to-emerald-700 transition-all duration-300 disabled:cursor-not-allowed disabled:opacity-50 min-h-[34px] ${
                      highlightEvaluate ? 'ring-2 ring-indigo-400/60 cta-ready-pulse scale-[1.02]' : ''
                    }`}
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    {t.evaluate.batchPhotos.processBtn}
                  </button>
                )}
              </div>
            </div>

            {!processing && (
              <GoogleDriveLinkInput
                disabled={processing}
                onImageLoaded={(file) => onAddPhotos([file])}
                t={t}
                compact
              />
            )}

            {/* Compact Small Numbered Thumbnails Row */}
            <div className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8 gap-2">
              {safePhotos.map((photo, idx) => (
                <div
                  key={photo.id}
                  draggable={!processing}
                  onDragStart={() => setDragIndex(idx)}
                  onDragOver={(e) => {
                    if (dragIndex !== null && dragIndex !== idx) {
                      e.preventDefault();
                    }
                  }}
                  onDrop={(e) => {
                    if (dragIndex === null || dragIndex === idx) return;
                    e.preventDefault();
                    e.stopPropagation();
                    const step = dragIndex < idx ? 1 : -1;
                    let curr = dragIndex;
                    while (curr !== idx) {
                      onMovePhoto(curr, step);
                      curr += step;
                    }
                    setDragIndex(null);
                  }}
                  onDragEnd={() => setDragIndex(null)}
                  className={`group relative flex flex-col overflow-hidden rounded-lg border bg-white shadow-2xs transition ${
                    dragIndex === idx
                      ? 'border-indigo-500 opacity-60 ring-2 ring-indigo-300'
                      : 'border-slate-200 hover:border-indigo-300'
                  }`}
                >
                  <div className="relative aspect-[4/3] w-full bg-slate-100 overflow-hidden">
                    <img
                      src={photo.previewUrl}
                      alt={photo.name}
                      className="h-full w-full object-cover"
                    />
                    <span className="absolute left-1 top-1 flex h-5 min-w-5 items-center justify-center rounded bg-slate-900/85 px-1 font-mono text-[10px] font-extrabold text-white">
                      {idx + 1}
                    </span>
                    {!processing && (
                      <button
                        type="button"
                        onClick={() => onRemovePhoto(photo.id)}
                        className="absolute right-1 top-1 rounded-full bg-slate-900/75 p-0.5 text-white hover:bg-rose-600 transition"
                        aria-label="Remove photo"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </div>

                  <div className="flex items-center justify-between gap-0.5 px-1.5 py-1 border-t border-slate-100">
                    <p
                      className="truncate text-[9px] font-semibold text-slate-600 flex-1"
                      title={`${photo.name} (${formatFileSize(photo.sizeBytes)})`}
                    >
                      {photo.name}
                    </p>
                    {!processing && safePhotos.length > 1 && (
                      <div className="flex items-center shrink-0">
                        <button
                          type="button"
                          disabled={idx === 0}
                          onClick={() => onMovePhoto(idx, -1)}
                          title={t.evaluate.batchPhotos.moveLeft}
                          className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-800 disabled:opacity-25"
                        >
                          <ChevronLeft className="h-3 w-3" />
                        </button>
                        <button
                          type="button"
                          disabled={idx === safePhotos.length - 1}
                          onClick={() => onMovePhoto(idx, 1)}
                          title={t.evaluate.batchPhotos.moveRight}
                          className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-800 disabled:opacity-25"
                        >
                          <ChevronRight className="h-3 w-3" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {!hasApiKey && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-900">
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

            {/* Real-time per-photo progress bar */}
            {processing && (
              <div className="rounded-xl border border-indigo-200 bg-white p-3.5 space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-bold text-indigo-900">
                  <div className="flex flex-wrap items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin text-indigo-600" />
                    <span>{progressMessage}</span>
                    {progress?.activeModelName && (
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                          (progress.activeAttempt || 1) > 1
                            ? 'bg-amber-100 text-amber-800 border border-amber-200'
                            : 'bg-indigo-50 text-indigo-700 border border-indigo-200/70'
                        }`}
                      >
                        {t.evaluate.batchPhotos.retryingPhotoNote(
                          progress.activeAttempt || 1,
                          progress.activeModelName
                        )}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    {progress && progress.detectedSoFar > 0 && (
                      <span className="rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 text-[11px] font-bold text-emerald-700">
                        {t.evaluate.batchPhotos.detectedLiveCount(progress.detectedSoFar)}
                      </span>
                    )}
                    <span className="font-mono text-indigo-700">{progressPercent}%</span>
                    <button
                      type="button"
                      onClick={onCancelProcessing}
                      className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1 text-[11px] font-bold text-rose-700 hover:bg-rose-100 transition"
                    >
                      <Square className="h-3 w-3 fill-current" />
                      {t.evaluate.batchPhotos.stopBatchBtn}
                    </button>
                  </div>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-indigo-100">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-indigo-600 to-emerald-500 transition-all duration-300"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {/* Selective Retry Card for Failed Photos */}
        {failedPhotos.length > 0 && (
          <div className="rounded-xl border border-amber-300 bg-amber-50/90 px-4 py-3.5 text-xs text-amber-950 space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 font-bold">
                <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
                <span>{t.evaluate.batchPhotos.failedPhotosTitle(failedPhotos.length)}</span>
              </div>
              <button
                type="button"
                disabled={processing}
                onClick={onRetryFailedPhotos}
                className="inline-flex items-center gap-1.5 rounded-xl bg-amber-600 px-3.5 py-2 text-xs font-bold text-white shadow-2xs hover:bg-amber-700 transition disabled:opacity-50"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${processing ? 'animate-spin' : ''}`} />
                {t.evaluate.batchPhotos.retryFailedBtn(failedPhotos.length)}
              </button>
            </div>
            <div className="space-y-1">
              {failedPhotos.map((fp) => (
                <div
                  key={fp.photoId}
                  className="flex items-start gap-2 rounded-lg bg-white/80 border border-amber-200/80 px-2.5 py-1.5 text-[11px]"
                >
                  <span className="shrink-0 rounded bg-amber-100 px-1.5 py-0.5 font-mono font-bold text-amber-900">
                    {t.evaluate.batchPhotos.photoBadge(String(fp.photoNumber))} ({fp.fileName})
                  </span>
                  <span className="font-mono text-amber-900/85 break-words">{fp.error}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {error && failedPhotos.length === 0 && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3.5 text-xs text-rose-900 space-y-2">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-2 min-w-0">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-rose-600" />
                <div className="min-w-0">
                  <p className="font-bold text-rose-950">{t.evaluate.batchPhotos.errorTitle}</p>
                  <p className="mt-1 font-mono text-[11px] leading-relaxed text-rose-800 break-words">
                    {error}
                  </p>
                </div>
              </div>
              {safePhotos.length > 0 && !processing && (
                <button
                  type="button"
                  onClick={onProcessPhotos}
                  className="shrink-0 rounded-lg bg-rose-600 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-rose-700 transition"
                >
                  {t.evaluate.batchPhotos.retryBtn}
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* LIVE REVIEW & VALIDATION TRAY */}
      {safeBatchItems.length > 0 && (
        <div className="rounded-2xl border border-slate-200/90 bg-white shadow-sm overflow-hidden">
          <div className="border-b border-slate-100 bg-gradient-to-r from-indigo-50/70 via-white to-teal-50/50 p-5 space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-base font-extrabold text-slate-900">
                  {t.evaluate.batchPhotos.trayTitle}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  {t.evaluate.batchPhotos.traySubtitle}
                </p>
              </div>

              <button
                type="button"
                onClick={onSaveAllValidated}
                disabled={processing || validatedItemsReadyToSave.length === 0}
                className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-teal-600 px-4 py-2.5 text-xs font-bold text-white shadow-sm shadow-teal-600/20 hover:bg-teal-700 transition disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Save className="h-4 w-4" />
                {t.evaluate.batchPhotos.saveAllBtn(validatedItemsReadyToSave.length)}
              </button>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-900 px-3 py-1 font-bold text-white">
                  <Images className="h-3.5 w-3.5" />
                  {t.evaluate.batchPhotos.detectedStat(safeBatchItems.length)}
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 border border-emerald-200 px-3 py-1 font-bold text-emerald-800">
                  <UserCheck className="h-3.5 w-3.5 text-emerald-600" />
                  {t.evaluate.batchPhotos.matchedStat(matchedCount)}
                </span>
                {unmatchedCount > 0 && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 border border-amber-300 px-3 py-1 font-bold text-amber-900">
                    <UserX className="h-3.5 w-3.5 text-amber-600" />
                    {t.evaluate.batchPhotos.unmatchedStat(unmatchedCount)}
                  </span>
                )}
              </div>

              <button
                type="button"
                onClick={handleToggleAllExpanded}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
              >
                {allExpanded ? (
                  <>
                    <ChevronUp className="h-3.5 w-3.5 text-slate-500" />
                    {t.evaluate.batchPhotos.collapseAllBtn}
                  </>
                ) : (
                  <>
                    <ChevronDown className="h-3.5 w-3.5 text-slate-500" />
                    {t.evaluate.batchPhotos.expandAllBtn}
                  </>
                )}
              </button>
            </div>

            {/* Informational non-blocking list of absent students */}
            {!processing &&
              (missingStudents.length === 0 ? (
                <div className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-50/80 border border-emerald-200 px-3 py-2 text-xs font-semibold text-emerald-800">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  {t.evaluate.batchPhotos.allDetectedBadge}
                </div>
              ) : (
                <div className="rounded-xl border border-slate-200 bg-white/90 p-3.5 space-y-2">
                  <div>
                    <p className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                      <Users className="h-3.5 w-3.5 text-slate-500" />
                      {t.evaluate.batchPhotos.missingTitle(missingStudents.length)}
                    </p>
                    <p className="mt-0.5 text-[11px] text-slate-500">
                      {t.evaluate.batchPhotos.missingSubtitle}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {missingStudents.map((st) => (
                      <span
                        key={st.id}
                        className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-[11px] font-medium text-slate-600"
                      >
                        {st.fullName}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
          </div>

          <div className="divide-y divide-slate-200/80">
            {safeBatchItems.map((item, idx) => {
              const itemUid = item.batchItemId || `batch-row-${idx}`;
              const isExpanded = Boolean(expandedItems[itemUid]);
              const matchedStudent = item.matchedStudentId
                ? studentMap.get(item.matchedStudentId)
                : undefined;
              const isDuplicate =
                Boolean(item.matchedStudentId) &&
                item.selected &&
                (assignedStudentCounts.get(item.matchedStudentId!) || 0) > 1;
              const isUnmatched = !item.matchedStudentId;

              const scoreBadgeColor =
                item.draft.finalScore >= 8
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                  : item.draft.finalScore >= 5
                    ? 'bg-teal-50 text-teal-800 border-teal-200'
                    : 'bg-rose-50 text-rose-800 border-rose-200';

              return (
                <div
                  key={item.batchItemId}
                  className={isUnmatched ? 'bg-amber-50/30' : 'bg-white'}
                >
                  <div className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex flex-wrap items-center gap-3 flex-1 min-w-0">
                      <input
                        type="checkbox"
                        checked={item.selected}
                        onChange={() =>
                          onUpdateBatchItem(item.batchItemId, (prev) => ({
                            ...prev,
                            selected: !prev.selected,
                          }))
                        }
                        className="h-4 w-4 rounded accent-teal-600 cursor-pointer shrink-0"
                      />

                      <span className="shrink-0 rounded-lg bg-slate-100 border border-slate-200 px-2 py-1 font-mono text-[11px] font-bold text-slate-700">
                        {t.evaluate.batchPhotos.photoBadge(item.pages)}
                      </span>

                      <div className="flex-1 min-w-[220px] max-w-sm">
                        <select
                          value={item.matchedStudentId || ''}
                          onChange={(e) => {
                            const val = e.target.value || null;
                            onUpdateBatchItem(item.batchItemId, (prev) => ({
                              ...prev,
                              matchedStudentId: val,
                              matchConfidence: val ? 'high' : 'unmatched',
                              selected: Boolean(val),
                              saved: false,
                            }));
                          }}
                          className={`w-full rounded-xl border px-3 py-2 text-xs font-bold focus:outline-none focus:ring-2 ${
                            isUnmatched || isDuplicate
                              ? 'border-amber-400 bg-amber-50 text-amber-950 focus:border-amber-500 focus:ring-amber-500/20'
                              : 'border-slate-200 bg-white text-slate-900 focus:border-teal-500 focus:ring-teal-500/20'
                          }`}
                        >
                          <option value="">{t.evaluate.batchPhotos.unmatchedOption}</option>
                          {safeGroupStudents.map((st) => (
                            <option key={st.id} value={st.id}>
                              {st.fullName} ({st.code})
                            </option>
                          ))}
                        </select>

                        <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px]">
                          {item.detectedName && (
                            <span className="text-slate-500">
                              {t.evaluate.batchPhotos.readHandwritingLabel}{' '}
                              <strong className="text-slate-700">"{item.detectedName}"</strong>
                            </span>
                          )}
                          {isDuplicate && (
                            <span className="inline-flex items-center gap-1 font-bold text-amber-700">
                              <AlertTriangle className="h-3 w-3" />
                              {t.evaluate.batchPhotos.duplicateStudentWarning}
                            </span>
                          )}
                          {isUnmatched && (
                            <span className="inline-flex items-center gap-1 font-bold text-amber-700">
                              <AlertTriangle className="h-3 w-3" />
                              {t.evaluate.batchPhotos.unassignedWarning}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between lg:justify-end gap-2.5 shrink-0">
                      {item.saved && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-bold text-emerald-800">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          {t.evaluate.batchPhotos.savedBadge}
                        </span>
                      )}

                      <span
                        className={`rounded-xl border px-3 py-1.5 text-xs font-extrabold ${scoreBadgeColor}`}
                      >
                        {item.draft.finalScore.toFixed(1)} / 10
                      </span>

                      <button
                        type="button"
                        onClick={() => toggleItemExpanded(itemUid)}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
                      >
                        <span>
                          {isExpanded
                            ? t.evaluate.batchPhotos.collapseReview
                            : t.evaluate.batchPhotos.expandReview}
                        </span>
                        {isExpanded ? (
                          <ChevronUp className="h-4 w-4 text-slate-400" />
                        ) : (
                          <ChevronDown className="h-4 w-4 text-slate-400" />
                        )}
                      </button>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="border-t border-slate-100 bg-slate-50/70 p-4 sm:p-5">
                      <EvaluationEditorPanel
                        draft={item.draft}
                        rubric={activeRubric}
                        studentName={
                          matchedStudent
                            ? matchedStudent.fullName
                            : item.detectedName || t.evaluate.batchPhotos.unmatchedOption
                        }
                        studentEmail={matchedStudent?.email}
                        asignatura={activeRubric.asignatura}
                        testTitle={testTitle || activeRubric.title}
                        evalLanguage={activeRubric.language}
                        modelUsed={(item.actualModelUsed as GeminiModelId) || activeModelId}
                        reasoningLevel="low"
                        hasNextPending={false}
                        isSaved={item.saved}
                        embedded
                        onChangeDraft={(nextDraft: AiEvaluationDraft) =>
                          onUpdateBatchItem(item.batchItemId, (prev) => ({
                            ...prev,
                            draft: nextDraft,
                            saved: false,
                          }))
                        }
                        t={t}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 bg-slate-50/80 px-5 py-4">
            <p className="text-xs text-slate-600">
              {validatedItemsReadyToSave.length === 0
                ? t.evaluate.batchPhotos.saveAllEmptyWarning
                : `${t.evaluate.batchPhotos.matchedStat(validatedItemsReadyToSave.length)} · ${activeRubric.title}`}
            </p>
            <button
              type="button"
              onClick={onSaveAllValidated}
              disabled={processing || validatedItemsReadyToSave.length === 0}
              className="inline-flex items-center gap-2 rounded-xl bg-teal-600 px-5 py-2.5 text-xs font-bold text-white shadow-sm shadow-teal-600/20 hover:bg-teal-700 transition disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Save className="h-4 w-4" />
              {t.evaluate.batchPhotos.saveAllBtn(validatedItemsReadyToSave.length)}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
