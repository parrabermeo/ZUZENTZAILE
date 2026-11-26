import React, { useMemo, useState, useEffect } from 'react';
import {
  ArrowLeft,
  Printer,
  Pencil,
  Sparkles,
  BookOpen,
  PenTool,
  Calendar,
  ThumbsUp,
  TrendingUp,
  SpellCheck,
  MessageSquareHeart,
  FileText,
  Trash2,
  ClipboardCheck,
  Save,
  X,
  Tag,
  ZoomIn,
  ZoomOut,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Images,
  Mail,
  MailCheck,
  AlertTriangle,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import type {
  AiEvaluationDraft,
  AppSettings,
  ClassGroup,
  EvaluationRecord,
  Language,
  Rubric,
  SkillMode,
  Student,
  SubjectId,
} from '../types';
import { getTagDisplay, type Translations } from '../i18n/translations';
import { TEXT_TYPOLOGIES, getBaseRubric } from '../data/defaultRubrics';
import { getScoreBadgeClasses, RUBRIC_LEVEL_BADGE_CLASSES } from '../utils/scoreStyles';
import { getSubjectLabel, resolveEvaluationSubject } from '../utils/subjects';
import { EvaluationEditorPanel } from './EvaluationEditorPanel';
import { EmailReportButtons } from './EmailReportButtons';
import { StudentEvolutionCharts } from './StudentEvolutionCharts';
import { StudentEvolutionReportPanel } from './StudentEvolutionReportPanel';

interface StudentDossierViewProps {
  student: Student;
  group: ClassGroup | undefined;
  savedRubrics: Rubric[];
  settings: AppSettings;
  lang: Language;
  t: Translations;
  onBack: () => void;
  onEditStudent: (student: Student) => void;
  onGoToEvaluate: (studentId: string) => void;
  onUpdateEvaluation: (studentId: string, updated: EvaluationRecord) => void;
  onDeleteEvaluation: (studentId: string, evaluationId: string) => void;
  onNotify: (message: string, type?: 'success' | 'info' | 'warning' | 'error') => void;
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

function computeAvg(evals: EvaluationRecord[]): number | null {
  if (evals.length === 0) return null;
  const sum = evals.reduce((acc, ev) => acc + (Number(ev.overallScore) || 0), 0);
  return Number((sum / evals.length).toFixed(1));
}

function formatDisplayDate(isoDate: string): string {
  const parts = isoDate.split('-');
  if (parts.length !== 3) return isoDate;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

const LEVEL_PILL_CLASSES = RUBRIC_LEVEL_BADGE_CLASSES;

export const StudentDossierView: React.FC<StudentDossierViewProps> = ({
  student,
  group,
  savedRubrics,
  settings,
  lang,
  t,
  onBack,
  onEditStudent,
  onGoToEvaluate,
  onUpdateEvaluation,
  onDeleteEvaluation,
  onNotify,
}) => {
  const [printOnlyBoletin, setPrintOnlyBoletin] = useState(false);

  // Separate evaluations strictly by subject (Euskera vs Lengua Castellana) — NEVER mixed
  const euskeraEvals = useMemo(
    () =>
      student.evaluations
        .filter((ev) => resolveEvaluationSubject(ev) === 'euskera')
        .sort((a, b) => b.date.localeCompare(a.date)),
    [student.evaluations]
  );

  const castellanoEvals = useMemo(
    () =>
      student.evaluations
        .filter((ev) => resolveEvaluationSubject(ev) === 'castellano')
        .sort((a, b) => b.date.localeCompare(a.date)),
    [student.evaluations]
  );

  const [activeSubject, setActiveSubject] = useState<SubjectId>(() => {
    if (euskeraEvals.length === 0 && castellanoEvals.length > 0) return 'castellano';
    return 'euskera';
  });

  // Separate averages per subject & modality (never mixed into one global average)
  const euReadingAvg = computeAvg(euskeraEvals.filter((ev) => ev.type === 'reading'));
  const euWritingAvg = computeAvg(euskeraEvals.filter((ev) => ev.type === 'writing'));
  const esReadingAvg = computeAvg(castellanoEvals.filter((ev) => ev.type === 'reading'));
  const esWritingAvg = computeAvg(castellanoEvals.filter((ev) => ev.type === 'writing'));

  const subjectEvals = activeSubject === 'euskera' ? euskeraEvals : castellanoEvals;
  const activeSubjectLabel = getSubjectLabel(activeSubject, lang);

  const readingEvals = useMemo(
    () => subjectEvals.filter((ev) => ev.type === 'reading'),
    [subjectEvals]
  );

  const writingEvals = useMemo(
    () => subjectEvals.filter((ev) => ev.type === 'writing'),
    [subjectEvals]
  );

  const allSortedEvals = subjectEvals;

  const [activeBlock, setActiveBlock] = useState<'all' | SkillMode>(() => {
    if (readingEvals.length > 0 && writingEvals.length === 0) return 'reading';
    if (writingEvals.length > 0 && readingEvals.length === 0) return 'writing';
    return 'all';
  });

  // When switching between Euskera and Castellano, pick a sensible sub-tab if one side has data
  const handleSelectSubject = (nextSubj: SubjectId) => {
    setActiveSubject(nextSubj);
    const nextList = nextSubj === 'euskera' ? euskeraEvals : castellanoEvals;
    const hasR = nextList.some((e) => e.type === 'reading');
    const hasW = nextList.some((e) => e.type === 'writing');
    if (hasR && !hasW) setActiveBlock('reading');
    else if (hasW && !hasR) setActiveBlock('writing');
    else setActiveBlock('all');
  };

  // Independent accordion state per evaluation ID (all collapsed by default)
  const [expandedPruebaIds, setExpandedPruebaIds] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setExpandedPruebaIds({});
    if (euskeraEvals.length === 0 && castellanoEvals.length > 0) {
      setActiveSubject('castellano');
    } else if (castellanoEvals.length === 0 && euskeraEvals.length > 0) {
      setActiveSubject('euskera');
    }
  }, [student.id]);

  const togglePruebaExpanded = (evalId: string) => {
    setExpandedPruebaIds((prev) => ({
      ...prev,
      [evalId]: !prev[evalId],
    }));
  };

  // Inline quick-edit state for title & date on a single evaluation card
  const [quickEditId, setQuickEditId] = useState<string | null>(null);
  const [quickEditTitle, setQuickEditTitle] = useState<string>('');
  const [quickEditDate, setQuickEditDate] = useState<string>('');

  // Full inline editing state for a specific evaluation card
  const [editingEvalId, setEditingEvalId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState<string>('');
  const [editingDate, setEditingDate] = useState<string>('');
  const [editingDraft, setEditingDraft] = useState<AiEvaluationDraft | null>(null);

  // Full-screen Lightbox / Zoom state for reference & student sheet images
  const [lightbox, setLightbox] = useState<{
    images: Array<{ dataUrl: string; caption: string; badge: string }>;
    index: number;
    zoom: number;
  } | null>(null);

  useEffect(() => {
    if (!lightbox) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightbox(null);
      if (e.key === 'ArrowRight') {
        setLightbox((prev) =>
          prev ? { ...prev, index: (prev.index + 1) % prev.images.length, zoom: 1 } : null
        );
      }
      if (e.key === 'ArrowLeft') {
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

  const openLightboxForEvaluation = (ev: EvaluationRecord, targetDataUrl: string) => {
    const gallery: Array<{ dataUrl: string; caption: string; badge: string }> = [];
    (ev.pruebaImagenes || []).forEach((img, idx) => {
      gallery.push({
        dataUrl: img.dataUrl,
        caption: img.name,
        badge: `${t.dossier.referenceTestSection} #${idx + 1}`,
      });
    });
    (ev.studentImages || []).forEach((img, idx) => {
      gallery.push({
        dataUrl: img.dataUrl,
        caption: img.name,
        badge: `${t.dossier.studentSheetSection} #${idx + 1}`,
      });
    });
    const startIdx = Math.max(
      0,
      gallery.findIndex((g) => g.dataUrl === targetDataUrl)
    );
    setLightbox({ images: gallery, index: startIdx, zoom: 1 });
  };

  const subjectAvg = computeAvg(subjectEvals);
  const readingAvg = computeAvg(readingEvals);
  const writingAvg = computeAvg(writingEvals);

  const visibleEvals =
    activeBlock === 'reading'
      ? readingEvals
      : activeBlock === 'writing'
        ? writingEvals
        : allSortedEvals;

  const resolveRubricForEval = (ev: EvaluationRecord): Rubric => {
    if (ev.rubricId) {
      const found = savedRubrics.find((r) => r.id === ev.rubricId);
      if (found) return found;
    }
    return getBaseRubric(ev.type, ev.language, ev.typology || 'narrative');
  };

  const handleStartEditEval = (ev: EvaluationRecord) => {
    setExpandedPruebaIds((prev) => ({ ...prev, [ev.id]: true }));
    const fallbackRubric = resolveRubricForEval(ev);
    const criteria =
      ev.criteriaResults && ev.criteriaResults.length > 0
        ? ev.criteriaResults.map((c) => ({ ...c }))
        : fallbackRubric.criteria.map((rc) => ({
            criterionId: rc.id,
            code: rc.code,
            name: rc.name,
            weight: rc.weight,
            level: (ev.criteriaScores?.[rc.id] || 3) as 1 | 2 | 3 | 4,
            justification: '',
          }));

    setEditingEvalId(ev.id);
    setEditingTitle(ev.title);
    setEditingDate(ev.date);
    setEditingDraft({
      transcription: ev.transcription || '',
      criteria,
      finalScore: ev.overallScore,
      strengths: ev.strengths && ev.strengths.length > 0 ? [...ev.strengths] : [''],
      improvements: ev.improvements && ev.improvements.length > 0 ? [...ev.improvements] : [''],
      linguisticCorrections: ev.linguisticCorrections
        ? ev.linguisticCorrections.map((lc) => ({ ...lc }))
        : [],
      studentFeedback: ev.feedbackSummary || '',
      ...(ev.pendingSubjectAssessment
        ? { pendingSubjectAssessment: { ...ev.pendingSubjectAssessment } }
        : {}),
      ...(ev.emailSentAt ? { emailSentAt: ev.emailSentAt } : {}),
    });
  };

  const handleCancelEditEval = () => {
    setEditingEvalId(null);
    setEditingDraft(null);
  };

  const handleCommitEditEval = (original: EvaluationRecord) => {
    if (!editingDraft) return;

    const nextScores: Record<string, number> = {};
    for (const c of editingDraft.criteria) {
      nextScores[c.criterionId] = c.level;
    }

    const updated: EvaluationRecord = {
      ...original,
      title: editingTitle.trim() || original.title,
      date: editingDate || original.date,
      transcription: editingDraft.transcription.trim(),
      overallScore: editingDraft.finalScore,
      criteriaScores: nextScores,
      criteriaResults: editingDraft.criteria,
      strengths: editingDraft.strengths.map((s) => s.trim()).filter(Boolean),
      improvements: editingDraft.improvements.map((s) => s.trim()).filter(Boolean),
      linguisticCorrections: editingDraft.linguisticCorrections.filter(
        (c) => c.original.trim() || c.correction.trim()
      ),
      feedbackSummary: editingDraft.studentFeedback.trim(),
      pendingSubjectAssessment: editingDraft.pendingSubjectAssessment,
      emailSentAt: editingDraft.emailSentAt || original.emailSentAt,
    };

    onUpdateEvaluation(student.id, updated);
    setEditingEvalId(null);
    setEditingDraft(null);
  };

  const handleConfirmDeleteEval = (ev: EvaluationRecord) => {
    if (window.confirm(t.dossier.confirmDeleteEval(ev.title))) {
      onDeleteEvaluation(student.id, ev.id);
      if (editingEvalId === ev.id) {
        handleCancelEditEval();
      }
    }
  };

  const renderEvaluationCard = (ev: EvaluationRecord, forceExpandedForPrint = false) => {
    const isEditing = editingEvalId === ev.id && editingDraft !== null;
    const isExpanded = forceExpandedForPrint || Boolean(expandedPruebaIds[ev.id]);
    const typologyMeta = ev.typology
      ? TEXT_TYPOLOGIES.find((item) => item.id === ev.typology)
      : undefined;
    const activeRubric = resolveRubricForEval(ev);

    if (isEditing && editingDraft) {
      return (
        <div
          key={ev.id}
          className="rounded-2xl border-2 border-teal-500 bg-white shadow-md overflow-hidden"
        >
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-teal-50/70 px-5 py-3.5">
            <div className="flex flex-wrap items-center gap-3 flex-1 min-w-0">
              <input
                type="text"
                value={editingTitle}
                onChange={(e) => setEditingTitle(e.target.value)}
                className="flex-1 min-w-[200px] rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-sm font-bold text-slate-900 focus:border-teal-500 focus:outline-none"
              />
              <input
                type="date"
                value={editingDate}
                onChange={(e) => setEditingDate(e.target.value)}
                className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 focus:border-teal-500 focus:outline-none"
              />
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleCancelEditEval}
                className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
              >
                <X className="h-3.5 w-3.5" />
                {t.dossier.cancelEdit}
              </button>
              <button
                type="button"
                onClick={() => handleCommitEditEval(ev)}
                className="inline-flex items-center gap-1.5 rounded-xl bg-teal-600 px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-teal-700"
              >
                <Save className="h-3.5 w-3.5" />
                {t.dossier.saveEvaluationChanges}
              </button>
            </div>
          </div>

          <div className="p-4 sm:p-5 bg-slate-50/60">
            <EvaluationEditorPanel
              draft={editingDraft}
              rubric={activeRubric}
              student={student}
              studentName={student.fullName}
              studentEmail={student.email}
              asignatura={resolveEvaluationSubject(ev)}
              testTitle={editingTitle.trim() || ev.title}
              evalLanguage={ev.language}
              modelUsed={ev.modelUsed}
              reasoningLevel={ev.reasoningLevel || 'medium'}
              hasNextPending={false}
              isSaved={false}
              embedded
              onChangeDraft={setEditingDraft}
              onEditStudentEmail={() => onEditStudent(student)}
              onNotify={onNotify}
              t={t}
            />
          </div>
        </div>
      );
    }

    const hasOriginalMaterials = Boolean(
      (ev.pruebaImagenes && ev.pruebaImagenes.length > 0) ||
        (ev.studentImages && ev.studentImages.length > 0) ||
        ev.context?.trim()
    );

    const evaluationBreakdownContent = (
      <div className="space-y-6">
        {/* 1. Rubric Criteria Breakdown */}
        {ev.criteriaResults && ev.criteriaResults.length > 0 && (
          <section className="space-y-3">
            <h4 className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider text-slate-500">
              <ClipboardCheck className="h-4 w-4 text-teal-600" />
              {t.dossier.rubricBreakdown}
            </h4>
            <div
              className={`grid grid-cols-1 ${
                hasOriginalMaterials ? 'xl:grid-cols-2' : 'md:grid-cols-2'
              } gap-3`}
            >
              {ev.criteriaResults.map((crit) => {
                const lvlIdx = Math.min(4, Math.max(1, crit.level)) - 1;
                const lvlName = t.rubrics.levels[lvlIdx]?.name || `Nivel ${crit.level}`;
                const earned = ((crit.level / 4) * crit.weight).toFixed(2);
                return (
                  <div
                    key={crit.criterionId}
                    className="rounded-xl border border-slate-200/80 bg-slate-50/50 p-3.5 space-y-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <span className="inline-block rounded bg-teal-50 border border-teal-200/80 px-1.5 py-0.5 font-mono text-[10px] font-bold text-teal-800 mr-1.5">
                          {crit.code}
                        </span>
                        <span className="text-xs font-bold text-slate-900">{crit.name}</span>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span
                          className={`rounded-full border px-2 py-0.5 text-[10px] font-extrabold ${LEVEL_PILL_CLASSES[crit.level]}`}
                        >
                          {crit.level}/4 · {lvlName}
                        </span>
                        <span className="text-[11px] font-bold text-slate-500">
                          {earned}/{crit.weight}pt
                        </span>
                      </div>
                    </div>
                    {crit.justification && (
                      <p className="text-xs leading-relaxed text-slate-600">
                        {crit.justification}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* 2. Transcription / Student Text Extract */}
        {ev.transcription && (
          <section className="space-y-2">
            <h4 className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider text-slate-500">
              <FileText className="h-4 w-4 text-slate-500" />
              {t.dossier.transcriptionTitle}
            </h4>
            <div className="rounded-xl border border-slate-200/90 bg-slate-50/70 p-4 text-sm leading-relaxed text-slate-800 whitespace-pre-wrap">
              {ev.transcription}
            </div>
          </section>
        )}

        {/* 3. Strengths (Indarguneak) & Improvements (Hobetzekoak) */}
        {((ev.strengths && ev.strengths.length > 0) ||
          (ev.improvements && ev.improvements.length > 0)) && (
          <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-xl border border-emerald-200/80 bg-emerald-50/40 p-4 space-y-2">
              <h4 className="flex items-center gap-2 text-xs font-extrabold text-emerald-900">
                <ThumbsUp className="h-4 w-4 text-emerald-600" />
                {t.dossier.strengthsTitle}
              </h4>
              <ul className="space-y-1.5 text-xs leading-relaxed text-slate-700 list-disc pl-4">
                {(ev.strengths || []).map((item, idx) => (
                  <li key={idx}>{item}</li>
                ))}
              </ul>
            </div>

            <div className="rounded-xl border border-amber-200/80 bg-amber-50/40 p-4 space-y-2">
              <h4 className="flex items-center gap-2 text-xs font-extrabold text-amber-900">
                <TrendingUp className="h-4 w-4 text-amber-600" />
                {t.dossier.improvementsTitle}
              </h4>
              <ul className="space-y-1.5 text-xs leading-relaxed text-slate-700 list-disc pl-4">
                {(ev.improvements || []).map((item, idx) => (
                  <li key={idx}>{item}</li>
                ))}
              </ul>
            </div>
          </section>
        )}

        {/* 4. Linguistic Corrections */}
        {ev.linguisticCorrections && ev.linguisticCorrections.length > 0 && (
          <section className="space-y-2.5">
            <h4 className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider text-slate-500">
              <SpellCheck className="h-4 w-4 text-indigo-600" />
              {t.dossier.linguisticTitle} ({ev.linguisticCorrections.length})
            </h4>
            <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 overflow-hidden bg-white">
              {ev.linguisticCorrections.map((lc) => (
                <div
                  key={lc.id}
                  className="grid grid-cols-1 sm:grid-cols-12 gap-2 px-4 py-2.5 text-xs items-baseline"
                >
                  <div className="sm:col-span-3 font-medium text-rose-700 line-through">
                    {lc.original}
                  </div>
                  <div className="sm:col-span-3 font-bold text-emerald-700">→ {lc.correction}</div>
                  <div className="sm:col-span-6 text-slate-600">{lc.explanation}</div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* 5. Pending Subject Assessment (LH4 / LH5) */}
        {ev.pendingSubjectAssessment && (
          <section
            className={`rounded-xl border p-4 space-y-2 ${
              ev.pendingSubjectAssessment.sufficient
                ? 'border-emerald-300 bg-emerald-50/60'
                : 'border-amber-300 bg-amber-50/70'
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="flex items-center gap-2 text-xs font-extrabold text-slate-900">
                <AlertTriangle
                  className={`h-4 w-4 shrink-0 ${
                    ev.pendingSubjectAssessment.sufficient ? 'text-emerald-600' : 'text-amber-600'
                  }`}
                />
                <span>
                  {t.dossier.pendingEvalCardTitle(
                    getSubjectLabel(ev.pendingSubjectAssessment.subject, lang),
                    ev.pendingSubjectAssessment.pendingCourse
                  )}
                </span>
              </h4>
              <span
                className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-extrabold ${
                  ev.pendingSubjectAssessment.sufficient
                    ? 'bg-emerald-600 text-white'
                    : 'bg-rose-600 text-white'
                }`}
              >
                {ev.pendingSubjectAssessment.sufficient ? (
                  <CheckCircle2 className="h-3.5 w-3.5" />
                ) : (
                  <XCircle className="h-3.5 w-3.5" />
                )}
                {ev.pendingSubjectAssessment.sufficient
                  ? t.dossier.pendingEvalSufficient
                  : t.dossier.pendingEvalInsufficient}
              </span>
            </div>
            {ev.pendingSubjectAssessment.justification && (
              <p className="text-xs leading-relaxed text-slate-800">
                {ev.pendingSubjectAssessment.justification}
              </p>
            )}
          </section>
        )}

        {/* 6. Personalized Student Feedback */}
        {ev.feedbackSummary && (
          <section className="rounded-xl border border-teal-200/80 bg-teal-50/50 p-4 space-y-1.5">
            <h4 className="flex items-center gap-2 text-xs font-extrabold text-teal-900">
              <MessageSquareHeart className="h-4 w-4 text-teal-600" />
              {t.dossier.feedbackTitle}
            </h4>
            <p className="text-sm leading-relaxed text-slate-800">{ev.feedbackSummary}</p>
          </section>
        )}
      </div>
    );

    const modalityPillText =
      ev.type === 'reading'
        ? t.reports.readingSeries
        : `${t.reports.writingSeries}${typologyMeta ? ` · ${typologyMeta.title[lang]}` : ''}`;

    return (
      <article
        key={ev.id}
        className={`rounded-2xl border bg-white shadow-2xs overflow-hidden transition-all duration-200 ${
          isExpanded
            ? 'border-emerald-300/90 shadow-sm'
            : 'border-slate-200/90 hover:border-emerald-300/80 hover:shadow-xs'
        }`}
      >
        {/* Compact Clickable Summary Header (Collapsed by default; click anywhere to expand/collapse) */}
        <div
          role="button"
          tabIndex={0}
          aria-expanded={isExpanded}
          onClick={() => {
            if (!forceExpandedForPrint && quickEditId !== ev.id) {
              togglePruebaExpanded(ev.id);
            }
          }}
          onKeyDown={(e) => {
            if (
              (e.key === 'Enter' || e.key === ' ') &&
              !forceExpandedForPrint &&
              quickEditId !== ev.id
            ) {
              e.preventDefault();
              togglePruebaExpanded(ev.id);
            }
          }}
          className={`print-avoid-break flex flex-col gap-3 px-4 py-3.5 sm:px-5 sm:flex-row sm:items-center sm:justify-between cursor-pointer select-none transition-colors ${
            isExpanded
              ? 'border-b border-slate-100 bg-gradient-to-r from-emerald-50/40 via-white to-white'
              : 'bg-white hover:bg-slate-50/70'
          }`}
        >
          <div className="min-w-0 flex-1 space-y-1">
            {quickEditId === ev.id ? (
              <div
                className="no-print flex flex-wrap items-center gap-2 py-0.5"
                onClick={(e) => e.stopPropagation()}
              >
                <input
                  type="text"
                  value={quickEditTitle}
                  onChange={(e) => setQuickEditTitle(e.target.value)}
                  className="flex-1 min-w-[200px] rounded-xl border border-emerald-400 bg-white px-3 py-1.5 text-sm font-bold text-slate-900 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                />
                <input
                  type="date"
                  value={quickEditDate}
                  onChange={(e) => setQuickEditDate(e.target.value)}
                  className="rounded-xl border border-emerald-400 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 focus:border-emerald-600 focus:outline-none"
                />
                <button
                  type="button"
                  disabled={!quickEditTitle.trim() || !quickEditDate.trim()}
                  onClick={() => {
                    onUpdateEvaluation(student.id, {
                      ...ev,
                      title: quickEditTitle.trim(),
                      date: quickEditDate.trim(),
                    });
                    setQuickEditId(null);
                  }}
                  className="inline-flex items-center gap-1 rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  <Save className="h-3.5 w-3.5" />
                  {t.dossier.saveMetaBtn}
                </button>
                <button
                  type="button"
                  onClick={() => setQuickEditId(null)}
                  className="rounded-xl border border-slate-200 bg-white p-1.5 text-slate-500 hover:bg-slate-50"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
                <span className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2 py-0.5 font-mono text-[11px] font-bold text-slate-700 shrink-0">
                  <Calendar className="h-3 w-3 text-emerald-600" />
                  {formatDisplayDate(ev.date)}
                </span>
                <span className="text-slate-300 hidden sm:inline">—</span>
                <h3 className="text-sm sm:text-base font-extrabold text-slate-900 leading-snug truncate max-w-full sm:max-w-md">
                  {ev.title}
                </h3>
                <span
                  className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-bold shrink-0 ${
                    ev.type === 'reading'
                      ? 'bg-indigo-50 text-indigo-800 border-indigo-200/80'
                      : 'bg-emerald-50 text-emerald-800 border-emerald-200/80'
                  }`}
                >
                  {ev.type === 'reading' ? (
                    <BookOpen className="h-3 w-3" />
                  ) : (
                    <PenTool className="h-3 w-3" />
                  )}
                  {modalityPillText}
                </span>
                {ev.emailSentAt && (
                  <span
                    className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-800 shrink-0"
                    title={ev.emailSentAt}
                  >
                    <MailCheck className="h-3 w-3 text-emerald-600" />
                    {t.dossier.emailSentBadge}
                  </span>
                )}
              </div>
            )}
            {isExpanded && ev.rubricTitle && (
              <p className="text-[11px] text-slate-500">{ev.rubricTitle}</p>
            )}
          </div>

          {/* Right side: Semantic Score Badge + Subtle Expand/Collapse Indicator */}
          <div className="flex items-center justify-between sm:justify-end gap-2.5 shrink-0">
            <div
              className={`flex items-baseline gap-1 rounded-xl border px-3 py-1 ${getScoreBadgeClasses(
                ev.overallScore
              )}`}
            >
              <span className="text-base sm:text-lg font-extrabold">
                {ev.overallScore.toFixed(1)}
              </span>
              <span className="text-[11px] font-bold opacity-75">/ 10</span>
            </div>

            {!forceExpandedForPrint && (
              <span
                className={`no-print inline-flex items-center gap-1 rounded-xl border px-2.5 py-1.5 text-[11px] font-bold transition ${
                  isExpanded
                    ? 'border-slate-200 bg-slate-100 text-slate-700 hover:bg-slate-200/70'
                    : 'border-emerald-200 bg-emerald-50/70 text-emerald-800 hover:bg-emerald-100/70'
                }`}
              >
                <span>{isExpanded ? t.dossier.collapseReportBtn : t.dossier.viewReportBtn}</span>
                {isExpanded ? (
                  <ChevronUp className="h-3.5 w-3.5" />
                ) : (
                  <ChevronDown className="h-3.5 w-3.5" />
                )}
              </span>
            )}
          </div>
        </div>

        {/* Expandable Full Evaluation Report */}
        {isExpanded && (
          <div className="panel-slide-down">
            {/* Action Toolbar inside Expanded Report (Email Report, Edit Title/Date, Full Edit, Delete) */}
            <div className="no-print space-y-2.5 border-b border-slate-100 bg-slate-50/60 px-4 sm:px-5 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setQuickEditId(ev.id);
                      setQuickEditTitle(ev.title);
                      setQuickEditDate(ev.date);
                    }}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-800 transition"
                  >
                    <Calendar className="h-3.5 w-3.5 text-emerald-600" />
                    {t.dossier.quickEditMetaBtn}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleStartEditEval(ev)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-800 transition"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    {t.dossier.editEvaluation}
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => handleConfirmDeleteEval(ev)}
                  className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-[11px] font-bold text-rose-700 hover:bg-rose-100 transition"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  {t.dossier.deleteEvaluation}
                </button>
              </div>

              <EmailReportButtons
                student={student}
                studentName={student.fullName}
                studentEmail={student.email}
                asignatura={resolveEvaluationSubject(ev)}
                testTitle={ev.title}
                language={ev.language}
                strengths={ev.strengths || []}
                improvements={ev.improvements || []}
                linguisticCorrections={ev.linguisticCorrections || []}
                feedbackSummary={ev.feedbackSummary || ''}
                emailSentAt={ev.emailSentAt}
                onEmailSent={(sentAt) =>
                  onUpdateEvaluation(student.id, {
                    ...ev,
                    emailSentAt: sentAt,
                  })
                }
                onEditStudentEmail={() => onEditStudent(student)}
                onNotify={onNotify}
                t={t}
                compact
              />
            </div>

            {/* Card Detailed Body: 2-column split viewer when reference test or student photos exist */}
            {hasOriginalMaterials ? (
              <div className="grid grid-cols-1 lg:grid-cols-12 divide-y lg:divide-y-0 lg:divide-x divide-slate-200/80">
                {/* LEFT COLUMN: Original Test (Reading + Questions) & Student's Handwritten Sheet */}
                <div className="lg:col-span-5 bg-slate-50/60 p-5 space-y-5">
                  <h4 className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider text-indigo-800">
                    <Images className="h-4 w-4 text-indigo-600" />
                    {t.dossier.originalMaterialsCol}
                  </h4>

                  {/* Reference Test / Reading Prompt */}
                  {((ev.pruebaImagenes && ev.pruebaImagenes.length > 0) || ev.context?.trim()) && (
                    <div className="print-avoid-break space-y-2.5">
                      <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
                        {t.dossier.referenceTestSection}
                      </p>

                      {ev.pruebaImagenes && ev.pruebaImagenes.length > 0 && (
                        <div className="grid grid-cols-2 gap-2.5">
                          {ev.pruebaImagenes.map((img, idx) => (
                            <button
                              key={img.id}
                              type="button"
                              onClick={() => openLightboxForEvaluation(ev, img.dataUrl)}
                              className="group relative overflow-hidden rounded-xl border border-indigo-200 bg-white text-left shadow-2xs transition hover:border-indigo-500 hover:shadow-sm"
                            >
                              <div className="relative aspect-[4/3] w-full bg-slate-100">
                                <img
                                  src={img.dataUrl}
                                  alt={img.name}
                                  className="h-full w-full object-cover transition group-hover:scale-105"
                                />
                                <span className="absolute left-1.5 top-1.5 rounded-md bg-indigo-700/90 px-1.5 py-0.5 font-mono text-[10px] font-bold text-white">
                                  Ref #{idx + 1}
                                </span>
                                <span className="no-print absolute inset-0 flex items-center justify-center bg-slate-900/0 group-hover:bg-slate-900/35 transition">
                                  <span className="inline-flex items-center gap-1 rounded-lg bg-white/95 px-2 py-1 text-[10px] font-bold text-slate-900 opacity-0 group-hover:opacity-100 shadow-sm transition">
                                    <ZoomIn className="h-3 w-3 text-indigo-600" />
                                    {t.dossier.zoomHint}
                                  </span>
                                </span>
                              </div>
                              <p className="truncate px-2 py-1 text-[10px] font-medium text-slate-600">
                                {img.name}
                              </p>
                            </button>
                          ))}
                        </div>
                      )}

                      {ev.context?.trim() && (
                        <div className="rounded-xl border border-indigo-100 bg-white p-3.5 text-xs leading-relaxed text-slate-700 whitespace-pre-wrap max-h-60 overflow-y-auto print:max-h-none">
                          {ev.context}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Student's Handwritten Sheet(s) */}
                  {ev.studentImages && ev.studentImages.length > 0 && (
                    <div className="print-avoid-break space-y-2.5">
                      <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
                        {t.dossier.studentSheetSection}
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2 gap-2.5">
                        {ev.studentImages.map((img, idx) => (
                          <button
                            key={img.id}
                            type="button"
                            onClick={() => openLightboxForEvaluation(ev, img.dataUrl)}
                            className="group relative overflow-hidden rounded-xl border border-emerald-200 bg-white text-left shadow-2xs transition hover:border-emerald-500 hover:shadow-sm"
                          >
                            <div className="relative aspect-[3/4] w-full bg-slate-100">
                              <img
                                src={img.dataUrl}
                                alt={img.name}
                                className="h-full w-full object-cover transition group-hover:scale-105"
                              />
                              <span className="absolute left-1.5 top-1.5 rounded-md bg-emerald-700/90 px-1.5 py-0.5 font-mono text-[10px] font-bold text-white">
                                #{idx + 1}
                              </span>
                              <span className="no-print absolute inset-0 flex items-center justify-center bg-slate-900/0 group-hover:bg-slate-900/35 transition">
                                <span className="inline-flex items-center gap-1 rounded-lg bg-white/95 px-2 py-1 text-[10px] font-bold text-slate-900 opacity-0 group-hover:opacity-100 shadow-sm transition">
                                  <ZoomIn className="h-3 w-3 text-emerald-600" />
                                  {t.dossier.zoomHint}
                                </span>
                              </span>
                            </div>
                            <p className="truncate px-2 py-1 text-[10px] font-medium text-slate-600">
                              {img.name}
                            </p>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* RIGHT COLUMN: Full Evaluation Breakdown */}
                <div className="lg:col-span-7 p-5 sm:p-6">
                  {evaluationBreakdownContent}
                </div>
              </div>
            ) : (
              <div className="p-5 sm:p-6">{evaluationBreakdownContent}</div>
            )}

            {/* Bottom Collapse Button inside Expanded Report */}
            {!forceExpandedForPrint && (
              <div className="no-print flex justify-end border-t border-slate-100 bg-slate-50/70 px-5 py-2.5">
                <button
                  type="button"
                  onClick={() => togglePruebaExpanded(ev.id)}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-100 transition"
                >
                  <ChevronUp className="h-3.5 w-3.5" />
                  {t.dossier.collapseReportBtn}
                </button>
              </div>
            )}
          </div>
        )}
      </article>
    );
  };

  return (
    <div className={`space-y-6 ${printOnlyBoletin ? 'print-only-boletin' : ''}`}>
      {/* Top Action Bar */}
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700 shadow-2xs hover:bg-slate-50 hover:text-slate-900 transition"
        >
          <ArrowLeft className="h-4 w-4 text-teal-600" />
          {t.dossier.backToList.replace(/^←\s*/, '')}
        </button>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => onEditStudent(student)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
          >
            <Pencil className="h-3.5 w-3.5 text-slate-500" />
            {t.dossier.editStudent}
          </button>

          <button
            type="button"
            onClick={() => onGoToEvaluate(student.id)}
            className="inline-flex items-center gap-1.5 rounded-xl bg-teal-600 px-3.5 py-2 text-xs font-bold text-white shadow-xs hover:bg-teal-700 transition"
          >
            <Sparkles className="h-3.5 w-3.5" />
            {t.dossier.goToEvaluate}
          </button>

          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-slate-800 transition"
          >
            <Printer className="h-3.5 w-3.5" />
            {t.dossier.printPdf}
          </button>
        </div>
      </div>

      {/* Dedicated Formal A4 Print Header (only visible when printing full dossier, scoped to active subject) */}
      <div className="hidden print:block dossier-non-boletin border-b-2 border-indigo-600 pb-4 mb-2">
        <div className="flex items-end justify-between gap-4">
          <div className="space-y-1">
            <p className="text-[10px] font-bold uppercase tracking-wider text-indigo-700">
              {t.curriculumBadge} · {activeSubjectLabel}
            </p>
            <h1 className="text-xl font-extrabold text-slate-900">
              {t.dossier.printFormalTitle} ({activeSubjectLabel})
            </h1>
            <p className="text-xs text-slate-700">
              <strong>{student.fullName}</strong> ({student.code}) · {t.dossier.printCourseLabel} ·{' '}
              {group ? `${group.name} (${group.academicYear})` : 'LH6'}
            </p>
            <p className="text-[11px] text-slate-500">
              {t.dossier.printIssueDateLabel}:{' '}
              {new Date().toLocaleDateString(lang === 'eu' ? 'eu-ES' : 'es-ES', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}
            </p>
          </div>
          <div className="flex items-center gap-2.5 text-center shrink-0">
            <div className="rounded-xl border border-indigo-200 bg-indigo-50/70 px-3 py-1.5">
              <p className="text-[9px] font-bold uppercase text-indigo-700">{t.dossier.readingAvg}</p>
              <p className="text-sm font-extrabold text-indigo-950">
                {readingAvg !== null ? `${readingAvg.toFixed(1)}/10` : '—'}
              </p>
            </div>
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 px-3 py-1.5">
              <p className="text-[9px] font-bold uppercase text-emerald-700">{t.dossier.writingAvg}</p>
              <p className="text-sm font-extrabold text-emerald-950">
                {writingAvg !== null ? `${writingAvg.toFixed(1)}/10` : '—'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Full-Width Student Header Card with STRICTLY SEPARATED Subject Averages (Emerald Dossier Accent) */}
      <div className="no-print dossier-non-boletin rounded-2xl border border-slate-200/90 border-t-2 border-t-emerald-500 bg-white p-6 shadow-2xs space-y-5">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex items-start gap-4 min-w-0">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-600 to-emerald-600 text-xl font-extrabold text-white shadow-sm">
              {getInitials(student.fullName)}
            </div>
            <div className="min-w-0 space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <code className="rounded-md bg-slate-100 px-2 py-0.5 font-mono text-xs font-bold text-slate-700">
                  {student.code}
                </code>
                {group && (
                  <span className="rounded-full bg-indigo-50 border border-indigo-200/70 px-3 py-0.5 text-xs font-bold text-indigo-800">
                    {group.name} · {group.academicYear}
                  </span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-2xl font-extrabold tracking-tight text-slate-900 break-words">
                  {student.fullName}
                </h2>
                {student.pendingSubjects?.euskera && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2.5 py-0.5 text-[11px] font-bold text-amber-800">
                    <AlertTriangle className="h-3 w-3 text-amber-600 shrink-0" />
                    {t.studentForm.pendingBadgeEu(student.pendingSubjects.euskera)}
                  </span>
                )}
                {student.pendingSubjects?.lengua && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2.5 py-0.5 text-[11px] font-bold text-amber-800">
                    <AlertTriangle className="h-3 w-3 text-amber-600 shrink-0" />
                    {t.studentForm.pendingBadgeEs(student.pendingSubjects.lengua)}
                  </span>
                )}
              </div>

              {student.email && (
                <p className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500">
                  <Mail className="h-3.5 w-3.5 text-indigo-500 shrink-0" />
                  <span className="truncate">{student.email}</span>
                </p>
              )}

              {/* Pedagogical Tags */}
              {student.tags.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                  <Tag className="h-3.5 w-3.5 text-slate-400" />
                  {student.tags.map((tag) => {
                    const disp = getTagDisplay(tag, lang);
                    return (
                      <span
                        key={tag}
                        className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${disp.classes}`}
                      >
                        {disp.label}
                      </span>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* TWO INDEPENDENT SUBJECT SUMMARY BLOCKS (Never mixed into one global average) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 shrink-0">
            {/* Euskera Summary Block */}
            <button
              type="button"
              onClick={() => handleSelectSubject('euskera')}
              className={`rounded-2xl border-2 p-3.5 text-left transition ${
                activeSubject === 'euskera'
                  ? 'border-emerald-500 bg-emerald-50/70 shadow-xs'
                  : 'border-slate-200 bg-slate-50/50 hover:border-emerald-300'
              }`}
            >
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="text-xs font-extrabold text-emerald-900">
                  {t.subjects.euskera}
                </span>
                <span className="rounded-full bg-white border border-emerald-200 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                  {euskeraEvals.length}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-center">
                <div className="rounded-xl bg-white/90 border border-emerald-200/60 px-2.5 py-1.5">
                  <p className="text-[10px] font-bold text-slate-500 truncate">
                    {t.reports.readingSeries}
                  </p>
                  <p className="text-base font-extrabold text-slate-900">
                    {euReadingAvg !== null ? euReadingAvg.toFixed(1) : '—'}
                  </p>
                </div>
                <div className="rounded-xl bg-white/90 border border-emerald-200/60 px-2.5 py-1.5">
                  <p className="text-[10px] font-bold text-slate-500 truncate">
                    {t.reports.writingSeries}
                  </p>
                  <p className="text-base font-extrabold text-slate-900">
                    {euWritingAvg !== null ? euWritingAvg.toFixed(1) : '—'}
                  </p>
                </div>
              </div>
            </button>

            {/* Lengua Castellana Summary Block */}
            <button
              type="button"
              onClick={() => handleSelectSubject('castellano')}
              className={`rounded-2xl border-2 p-3.5 text-left transition ${
                activeSubject === 'castellano'
                  ? 'border-indigo-500 bg-indigo-50/70 shadow-xs'
                  : 'border-slate-200 bg-slate-50/50 hover:border-indigo-300'
              }`}
            >
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="text-xs font-extrabold text-indigo-900">
                  {t.subjects.castellano}
                </span>
                <span className="rounded-full bg-white border border-indigo-200 px-2 py-0.5 text-[10px] font-bold text-indigo-800">
                  {castellanoEvals.length}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-center">
                <div className="rounded-xl bg-white/90 border border-indigo-200/60 px-2.5 py-1.5">
                  <p className="text-[10px] font-bold text-slate-500 truncate">
                    {t.reports.readingSeries}
                  </p>
                  <p className="text-base font-extrabold text-slate-900">
                    {esReadingAvg !== null ? esReadingAvg.toFixed(1) : '—'}
                  </p>
                </div>
                <div className="rounded-xl bg-white/90 border border-indigo-200/60 px-2.5 py-1.5">
                  <p className="text-[10px] font-bold text-slate-500 truncate">
                    {t.reports.writingSeries}
                  </p>
                  <p className="text-base font-extrabold text-slate-900">
                    {esWritingAvg !== null ? esWritingAvg.toFixed(1) : '—'}
                  </p>
                </div>
              </div>
            </button>
          </div>
        </div>

        {/* Pedagogical Notes Strip (if any) */}
        {student.notes && (
          <div className="rounded-xl border border-slate-100 bg-slate-50/70 px-4 py-3 text-xs leading-relaxed text-slate-700">
            <strong className="text-slate-900">{t.dossier.notes}: </strong>
            {student.notes}
          </div>
        )}
      </div>

      {/* Primary Subject Tabs Bar (Euskera vs Lengua Castellana) */}
      <div className="no-print dossier-non-boletin grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => handleSelectSubject('euskera')}
          className={`flex items-center justify-between rounded-2xl border-2 px-5 py-3.5 text-left transition ${
            activeSubject === 'euskera'
              ? 'border-emerald-600 bg-emerald-600 text-white shadow-sm'
              : 'border-slate-200 bg-white text-slate-700 hover:border-emerald-300'
          }`}
        >
          <span className="text-sm font-extrabold">{t.subjects.euskera}</span>
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-extrabold ${
              activeSubject === 'euskera'
                ? 'bg-white/20 text-white'
                : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
            }`}
          >
            {euskeraEvals.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => handleSelectSubject('castellano')}
          className={`flex items-center justify-between rounded-2xl border-2 px-5 py-3.5 text-left transition ${
            activeSubject === 'castellano'
              ? 'border-indigo-600 bg-indigo-600 text-white shadow-sm'
              : 'border-slate-200 bg-white text-slate-700 hover:border-indigo-300'
          }`}
        >
          <span className="text-sm font-extrabold">{t.subjects.castellano}</span>
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-extrabold ${
              activeSubject === 'castellano'
                ? 'bg-white/20 text-white'
                : 'bg-indigo-50 text-indigo-800 border border-indigo-200'
            }`}
          >
            {castellanoEvals.length}
          </span>
        </button>
      </div>

      {/* MODULE 4: Chronological Evolution Line Chart + Competency Radar Chart (scoped to active subject) */}
      <div className="dossier-non-boletin">
        <StudentEvolutionCharts
          evaluations={subjectEvals}
          subjectLabel={activeSubjectLabel}
          lang={lang}
          t={t}
        />
      </div>

      {/* MODULE 4: AI Evolutionary Pedagogical Report & Printable A4 Boletín (scoped to active subject) */}
      <StudentEvolutionReportPanel
        student={student}
        group={group}
        subject={activeSubject}
        subjectEvaluations={subjectEvals}
        settings={settings}
        uiLang={lang}
        t={t}
        subjectAvg={subjectAvg}
        readingAvg={readingAvg}
        writingAvg={writingAvg}
        onReportPrintModeChange={setPrintOnlyBoletin}
        onNotify={onNotify}
      />

      {/* Full-Width Classification Tabs: Comprensión Escrita vs Expresión Escrita (+ Todas) */}
      <div className="no-print grid grid-cols-1 md:grid-cols-12 gap-3">
        <button
          type="button"
          onClick={() => setActiveBlock('reading')}
          className={`md:col-span-5 flex items-center justify-between rounded-2xl border-2 px-5 py-4 text-left transition ${
            activeBlock === 'reading'
              ? 'border-indigo-600 bg-indigo-50/80 text-indigo-950 shadow-sm'
              : 'border-slate-200 bg-white text-slate-700 hover:border-indigo-300'
          }`}
        >
          <div className="flex items-center gap-3 min-w-0">
            <span
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                activeBlock === 'reading'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-indigo-50 text-indigo-600'
              }`}
            >
              <BookOpen className="h-5 w-5" />
            </span>
            <span className="text-sm font-extrabold truncate">{t.dossier.tabReading}</span>
          </div>
          <span className="ml-2 rounded-full bg-white border border-indigo-200 px-2.5 py-0.5 text-xs font-extrabold text-indigo-800">
            {readingEvals.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveBlock('writing')}
          className={`md:col-span-5 flex items-center justify-between rounded-2xl border-2 px-5 py-4 text-left transition ${
            activeBlock === 'writing'
              ? 'border-teal-600 bg-teal-50/80 text-teal-950 shadow-sm'
              : 'border-slate-200 bg-white text-slate-700 hover:border-teal-300'
          }`}
        >
          <div className="flex items-center gap-3 min-w-0">
            <span
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                activeBlock === 'writing'
                  ? 'bg-teal-600 text-white'
                  : 'bg-teal-50 text-teal-600'
              }`}
            >
              <PenTool className="h-5 w-5" />
            </span>
            <span className="text-sm font-extrabold truncate">{t.dossier.tabWriting}</span>
          </div>
          <span className="ml-2 rounded-full bg-white border border-teal-200 px-2.5 py-0.5 text-xs font-extrabold text-teal-800">
            {writingEvals.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveBlock('all')}
          className={`md:col-span-2 flex items-center justify-center gap-2 rounded-2xl border-2 px-4 py-4 text-xs font-extrabold transition ${
            activeBlock === 'all'
              ? 'border-slate-900 bg-slate-900 text-white shadow-sm'
              : 'border-slate-200 bg-white text-slate-600 hover:border-slate-400'
          }`}
        >
          <span>{t.dossier.tabAll}</span>
          <span
            className={`rounded-full px-2 py-0.5 text-[11px] ${
              activeBlock === 'all' ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-700'
            }`}
          >
            {subjectEvals.length}
          </span>
        </button>
      </div>

      {/* Screen View: Active Category Cards (Compact Collapsed by Default + Expand/Collapse All Toolbar) */}
      <div className="space-y-3 print:hidden">
        {visibleEvals.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <p className="text-xs font-bold text-slate-500">
              {visibleEvals.length} {t.dossier.evaluationsTitle.toLowerCase()}
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  const next: Record<string, boolean> = { ...expandedPruebaIds };
                  visibleEvals.forEach((ev) => {
                    next[ev.id] = true;
                  });
                  setExpandedPruebaIds(next);
                }}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-bold text-slate-700 hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-800 transition"
              >
                <ChevronDown className="h-3.5 w-3.5" />
                {t.dossier.expandAllEvalsBtn}
              </button>
              <button
                type="button"
                onClick={() => setExpandedPruebaIds({})}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-bold text-slate-600 hover:bg-slate-100 transition"
              >
                <ChevronUp className="h-3.5 w-3.5" />
                {t.dossier.collapseAllEvalsBtn}
              </button>
            </div>
          </div>
        )}

        {subjectEvals.length === 0 ? (
          <div className="rounded-2xl border-2 border-dashed border-slate-200 bg-white px-6 py-14 text-center space-y-3">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600">
              <Sparkles className="h-7 w-7" />
            </div>
            <h3 className="text-base font-bold text-slate-900">
              {t.dossier.noEvalsForSubject(activeSubjectLabel)}
            </h3>
            <p className="mx-auto max-w-md text-xs leading-relaxed text-slate-500">
              {t.dossier.emptyEvalsDesc}
            </p>
            <button
              type="button"
              onClick={() => onGoToEvaluate(student.id)}
              className="mt-2 inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-indigo-700 transition"
            >
              <Sparkles className="h-4 w-4" />
              {t.dossier.goToEvaluate}
            </button>
          </div>
        ) : visibleEvals.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white px-6 py-12 text-center space-y-2">
            <p className="text-sm font-semibold text-slate-600">{t.dossier.emptyCategoryDesc}</p>
            <button
              type="button"
              onClick={() => onGoToEvaluate(student.id)}
              className="mt-2 inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700"
            >
              <Sparkles className="h-3.5 w-3.5" />
              {t.dossier.goToEvaluate}
            </button>
          </div>
        ) : (
          visibleEvals.map((ev) => renderEvaluationCard(ev, false))
        )}
      </div>

      {/* Print-Only Full Dossier (Prints expanded tests if user selected specific ones, or ALL full reports cleanly if none are toggled) */}
      {(() => {
        const hasManuallyExpanded = subjectEvals.some((ev) => Boolean(expandedPruebaIds[ev.id]));
        const printReadingEvals = hasManuallyExpanded
          ? readingEvals.filter((ev) => Boolean(expandedPruebaIds[ev.id]))
          : readingEvals;
        const printWritingEvals = hasManuallyExpanded
          ? writingEvals.filter((ev) => Boolean(expandedPruebaIds[ev.id]))
          : writingEvals;

        return (
          <div className="dossier-non-boletin hidden print:block space-y-6">
            {printReadingEvals.length > 0 && (
              <div className="space-y-4">
                <h3 className="text-base font-extrabold text-indigo-900 border-b-2 border-indigo-200 pb-1">
                  {t.dossier.tabReading} ({printReadingEvals.length})
                </h3>
                {printReadingEvals.map((ev) => renderEvaluationCard(ev, true))}
              </div>
            )}
            {printWritingEvals.length > 0 && (
              <div className="space-y-4">
                <h3 className="text-base font-extrabold text-emerald-900 border-b-2 border-emerald-200 pb-1">
                  {t.dossier.tabWriting} ({printWritingEvals.length})
                </h3>
                {printWritingEvals.map((ev) => renderEvaluationCard(ev, true))}
              </div>
            )}
          </div>
        );
      })()}

      {/* Full-Screen Zoom Lightbox Modal for Test & Student Sheet Photos */}
      {lightbox && lightbox.images[lightbox.index] && (
        <div
          className="no-print fixed inset-0 z-[70] flex flex-col bg-slate-950/90 backdrop-blur-xs"
          onClick={() => setLightbox(null)}
        >
          {/* Lightbox Top Controls */}
          <div
            className="flex items-center justify-between gap-3 border-b border-white/10 px-5 py-3.5 text-white"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="min-w-0">
              <span className="rounded-full bg-white/15 px-2.5 py-0.5 text-[11px] font-bold text-teal-200">
                {lightbox.images[lightbox.index].badge}
              </span>
              <p className="mt-1 truncate text-xs text-slate-300">
                {lightbox.images[lightbox.index].caption} ({lightbox.index + 1} /{' '}
                {lightbox.images.length})
              </p>
            </div>

            <div className="flex items-center gap-2">
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

          {/* Image Stage */}
          <div
            className="relative flex-1 overflow-auto flex items-center justify-center p-6"
            onClick={(e) => e.stopPropagation()}
          >
            {lightbox.images.length > 1 && (
              <button
                type="button"
                onClick={() =>
                  setLightbox((prev) =>
                    prev
                      ? {
                          ...prev,
                          index: (prev.index - 1 + prev.images.length) % prev.images.length,
                          zoom: 1,
                        }
                      : null
                  )
                }
                className="fixed left-4 top-1/2 -translate-y-1/2 z-10 rounded-full bg-white/15 p-3 text-white hover:bg-white/25 transition"
              >
                <ChevronLeft className="h-6 w-6" />
              </button>
            )}

            <img
              src={lightbox.images[lightbox.index].dataUrl}
              alt={lightbox.images[lightbox.index].caption}
              style={{
                transform: `scale(${lightbox.zoom})`,
                transformOrigin: 'center center',
              }}
              className="max-h-[80vh] max-w-full rounded-xl shadow-2xl transition-transform duration-150"
            />

            {lightbox.images.length > 1 && (
              <button
                type="button"
                onClick={() =>
                  setLightbox((prev) =>
                    prev ? { ...prev, index: (prev.index + 1) % prev.images.length, zoom: 1 } : null
                  )
                }
                className="fixed right-4 top-1/2 -translate-y-1/2 z-10 rounded-full bg-white/15 p-3 text-white hover:bg-white/25 transition"
              >
                <ChevronRight className="h-6 w-6" />
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
