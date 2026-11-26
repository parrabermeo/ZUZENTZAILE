import React, { useState } from 'react';
import {
  CheckCircle2,
  Save,
  RotateCcw,
  FileText,
  Sparkles,
  ThumbsUp,
  TrendingUp,
  SpellCheck,
  MessageSquareHeart,
  Plus,
  Trash2,
  Copy,
  Check,
  ArrowRight,
  AlertTriangle,
  XCircle,
} from 'lucide-react';
import type {
  AiEvaluationDraft,
  GeminiModelId,
  Language,
  LinguisticCorrection,
  ReasoningEffort,
  Rubric,
  Student,
  SubjectId,
} from '../types';
import type { Translations } from '../i18n/translations';
import { calculateWeightedScore } from '../services/geminiService';
import { getSubjectLabel, languageToSubject, subjectToLanguage } from '../utils/subjects';
import { EmailReportButtons } from './EmailReportButtons';

interface EvaluationEditorPanelProps {
  draft: AiEvaluationDraft;
  rubric: Rubric;
  student?: Student;
  studentName: string;
  studentEmail?: string;
  asignatura?: SubjectId;
  testTitle?: string;
  evalLanguage?: Language;
  modelUsed: GeminiModelId;
  reasoningLevel: ReasoningEffort;
  hasNextPending: boolean;
  isSaved: boolean;
  embedded?: boolean;
  onChangeDraft: (next: AiEvaluationDraft) => void;
  onSave?: (goToNextPending: boolean) => void;
  onGoToNextPending?: () => void;
  onEditStudentEmail?: () => void;
  onNotify?: (message: string, type?: 'success' | 'info' | 'warning' | 'error') => void;
  t: Translations;
}

const LEVEL_BUTTON_STYLES: Record<1 | 2 | 3 | 4, { active: string; idle: string }> = {
  1: {
    active: 'border-rose-500 bg-rose-50 text-rose-900 ring-1 ring-rose-500',
    idle: 'border-slate-200 bg-white text-slate-600 hover:border-rose-300 hover:bg-rose-50/40',
  },
  2: {
    active: 'border-amber-500 bg-amber-50 text-amber-900 ring-1 ring-amber-500',
    idle: 'border-slate-200 bg-white text-slate-600 hover:border-amber-300 hover:bg-amber-50/40',
  },
  3: {
    active: 'border-teal-600 bg-teal-50 text-teal-900 ring-1 ring-teal-600',
    idle: 'border-slate-200 bg-white text-slate-600 hover:border-teal-300 hover:bg-teal-50/40',
  },
  4: {
    active: 'border-emerald-600 bg-emerald-50 text-emerald-900 ring-1 ring-emerald-600',
    idle: 'border-slate-200 bg-white text-slate-600 hover:border-emerald-300 hover:bg-emerald-50/40',
  },
};

export const EvaluationEditorPanel: React.FC<EvaluationEditorPanelProps> = ({
  draft,
  rubric,
  student,
  studentName,
  studentEmail,
  asignatura,
  testTitle,
  evalLanguage,
  modelUsed,
  reasoningLevel,
  hasNextPending,
  isSaved,
  embedded = false,
  onChangeDraft,
  onSave,
  onGoToNextPending,
  onEditStudentEmail,
  onNotify,
  t,
}) => {
  const [copiedFeedback, setCopiedFeedback] = useState(false);
  const resolvedSubject: SubjectId =
    asignatura || rubric.asignatura || languageToSubject(evalLanguage || rubric.language);
  const resolvedEvalLang: Language = evalLanguage || subjectToLanguage(resolvedSubject);
  const resolvedTestTitle = testTitle || rubric.title;

  const computedFromRubric = calculateWeightedScore(draft.criteria);
  const isManualScoreOverridden = Math.abs(draft.finalScore - computedFromRubric) > 0.05;

  const rubricCriteriaMap = new Map(rubric.criteria.map((c) => [c.id, c]));

  const handleLevelClick = (criterionId: string, newLevel: 1 | 2 | 3 | 4) => {
    const nextCriteria = draft.criteria.map((c) =>
      c.criterionId === criterionId ? { ...c, level: newLevel } : c
    );
    const recalculated = calculateWeightedScore(nextCriteria);
    onChangeDraft({
      ...draft,
      criteria: nextCriteria,
      finalScore: recalculated,
    });
  };

  const handleJustificationChange = (criterionId: string, justification: string) => {
    onChangeDraft({
      ...draft,
      criteria: draft.criteria.map((c) =>
        c.criterionId === criterionId ? { ...c, justification } : c
      ),
    });
  };

  const handleManualScoreChange = (val: string) => {
    const num = parseFloat(val);
    if (Number.isNaN(num)) {
      onChangeDraft({ ...draft, finalScore: 0 });
      return;
    }
    const clamped = Math.min(10, Math.max(0, Number(num.toFixed(1))));
    onChangeDraft({ ...draft, finalScore: clamped });
  };

  const handleListItemChange = (
    field: 'strengths' | 'improvements',
    idx: number,
    value: string
  ) => {
    const next = [...draft[field]];
    next[idx] = value;
    onChangeDraft({ ...draft, [field]: next });
  };

  const handleListItemRemove = (field: 'strengths' | 'improvements', idx: number) => {
    onChangeDraft({
      ...draft,
      [field]: draft[field].filter((_, i) => i !== idx),
    });
  };

  const handleListItemAdd = (field: 'strengths' | 'improvements') => {
    onChangeDraft({
      ...draft,
      [field]: [...draft[field], ''],
    });
  };

  const handleCorrectionChange = (
    id: string,
    field: keyof Omit<LinguisticCorrection, 'id'>,
    value: string
  ) => {
    onChangeDraft({
      ...draft,
      linguisticCorrections: draft.linguisticCorrections.map((item) =>
        item.id === id ? { ...item, [field]: value } : item
      ),
    });
  };

  const handleAddCorrection = () => {
    const newItem: LinguisticCorrection = {
      id: `lc-${Date.now()}`,
      original: '',
      correction: '',
      explanation: '',
      category: 'grammar',
    };
    onChangeDraft({
      ...draft,
      linguisticCorrections: [...draft.linguisticCorrections, newItem],
    });
  };

  const handleRemoveCorrection = (id: string) => {
    onChangeDraft({
      ...draft,
      linguisticCorrections: draft.linguisticCorrections.filter((item) => item.id !== id),
    });
  };

  const handleCopyFeedback = async () => {
    try {
      await navigator.clipboard.writeText(draft.studentFeedback);
      setCopiedFeedback(true);
      setTimeout(() => setCopiedFeedback(false), 1800);
    } catch {
      // Clipboard blocked
    }
  };

  const scoreTone =
    draft.finalScore >= 8.5
      ? 'from-emerald-600 to-teal-600'
      : draft.finalScore >= 6.5
        ? 'from-teal-600 to-cyan-600'
        : draft.finalScore >= 5
          ? 'from-amber-500 to-orange-500'
          : 'from-rose-600 to-pink-600';

  return (
    <div className="space-y-5">
      {/* Top Score & Teacher Control Header */}
      <div className="rounded-2xl border border-slate-200/90 bg-white shadow-sm overflow-hidden">
        <div className="flex flex-col gap-4 border-b border-slate-100 bg-gradient-to-r from-slate-50 via-white to-teal-50/40 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <span className="inline-flex items-center gap-1 rounded-full bg-teal-100 px-2.5 py-0.5 text-[11px] font-bold text-teal-800">
                <Sparkles className="h-3 w-3" />
                {modelUsed} · {reasoningLevel}
              </span>
              <span className="text-xs font-semibold text-slate-500">{studentName}</span>
            </div>
            <h3 className="text-lg font-extrabold text-slate-900">
              {t.evaluate.results.headerTitle}
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">{t.evaluate.results.headerSub}</p>
          </div>

          {/* Editable Final Score Box */}
          <div className="flex items-center gap-3">
            <div
              className={`flex items-center gap-2 rounded-2xl bg-gradient-to-br ${scoreTone} px-4 py-3 text-white shadow-sm`}
            >
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-white/80">
                  {t.evaluate.results.finalScoreLabel}
                </p>
                <div className="flex items-baseline gap-1 mt-0.5">
                  <input
                    type="number"
                    min={0}
                    max={10}
                    step={0.1}
                    value={draft.finalScore}
                    onChange={(e) => handleManualScoreChange(e.target.value)}
                    className="w-16 rounded-lg bg-white/20 px-1.5 py-0.5 text-2xl font-extrabold text-white text-center focus:bg-white/30 focus:outline-none"
                  />
                  <span className="text-sm font-bold text-white/85">
                    {t.evaluate.results.outOfTen}
                  </span>
                </div>
              </div>
            </div>

            {isManualScoreOverridden && (
              <button
                type="button"
                onClick={() => onChangeDraft({ ...draft, finalScore: computedFromRubric })}
                title={t.evaluate.results.recalculateBtn}
                className="inline-flex flex-col items-center gap-1 rounded-xl border border-amber-200 bg-amber-50 px-2.5 py-2 text-[10px] font-bold text-amber-800 hover:bg-amber-100 transition"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                <span>{computedFromRubric.toFixed(1)}</span>
              </button>
            )}
          </div>
        </div>

        {/* Saved banner */}
        {isSaved && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-emerald-200 bg-emerald-50 px-5 py-3 text-xs font-semibold text-emerald-900">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              <span>{t.evaluate.results.savedSuccessBanner}</span>
            </div>
            {hasNextPending && onGoToNextPending && (
              <button
                type="button"
                onClick={onGoToNextPending}
                className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-700 transition"
              >
                {t.evaluate.results.nextPendingBtn}
              </button>
            )}
          </div>
        )}

        <div className="p-5 sm:p-6 space-y-6">
          {/* 1. Editable Transcription */}
          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-600">
                <FileText className="h-4 w-4 text-teal-600" />
                {t.evaluate.results.transcriptionTitle}
              </label>
              <span className="text-[11px] text-slate-400">
                {t.evaluate.results.transcriptionHint}
              </span>
            </div>
            <textarea
              value={draft.transcription}
              onChange={(e) => onChangeDraft({ ...draft, transcription: e.target.value })}
              rows={5}
              className="w-full rounded-xl border border-slate-200 bg-slate-50/50 p-3.5 text-sm leading-relaxed text-slate-800 focus:border-teal-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500/15"
            />
          </section>

          {/* 2. Rubric Criteria Breakdown (Interactive 1-4 Level Selector with auto-recalculation) */}
          <section className="space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-600">
              {t.evaluate.results.rubricBreakdownTitle}
            </h4>
            <div className="space-y-3">
              {draft.criteria.map((crit) => {
                const earnedPts = ((crit.level / 4) * crit.weight).toFixed(2);
                const rubDef = rubricCriteriaMap.get(crit.criterionId);
                const activeDescriptor = rubDef?.levels[crit.level];

                return (
                  <div
                    key={crit.criterionId}
                    className="rounded-2xl border border-slate-200/90 bg-slate-50/40 p-4 space-y-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="rounded-md bg-teal-50 border border-teal-200/80 px-2 py-0.5 font-mono text-[11px] font-bold text-teal-800">
                          {crit.code}
                        </span>
                        <h5 className="text-sm font-bold text-slate-900">{crit.name}</h5>
                      </div>
                      <span className="rounded-full bg-white border border-slate-200 px-2.5 py-0.5 text-xs font-extrabold text-slate-700">
                        {earnedPts} / {crit.weight.toFixed(1)} pt
                      </span>
                    </div>

                    {/* Clickable Levels 1-4 */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {([1, 2, 3, 4] as const).map((lvl, idx) => {
                        const isSelected = crit.level === lvl;
                        const lvlMeta = t.rubrics.levels[idx];
                        return (
                          <button
                            key={lvl}
                            type="button"
                            onClick={() => handleLevelClick(crit.criterionId, lvl)}
                            title={rubDef?.levels[lvl]}
                            className={`flex items-center justify-between rounded-xl border px-3 py-2 text-left text-xs font-bold transition ${
                              isSelected
                                ? LEVEL_BUTTON_STYLES[lvl].active
                                : LEVEL_BUTTON_STYLES[lvl].idle
                            }`}
                          >
                            <span className="truncate">{lvlMeta.name}</span>
                            <span className="ml-1.5 rounded bg-black/5 px-1.5 py-0.5 text-[10px] font-extrabold">
                              {lvl}
                            </span>
                          </button>
                        );
                      })}
                    </div>

                    {/* Descriptor hint of selected level */}
                    {activeDescriptor && (
                      <p className="text-[11px] italic leading-relaxed text-slate-500 px-1">
                        {activeDescriptor}
                      </p>
                    )}

                    {/* Editable Justification */}
                    <textarea
                      value={crit.justification}
                      onChange={(e) => handleJustificationChange(crit.criterionId, e.target.value)}
                      rows={2}
                      placeholder={t.evaluate.results.justificationPlaceholder}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs leading-relaxed text-slate-700 focus:border-teal-500 focus:outline-none"
                    />
                  </div>
                );
              })}
            </div>
          </section>

          {/* 3. Strengths & Improvements (Indarguneak & Hobetzekoak) */}
          <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Strengths */}
            <div className="rounded-2xl border border-emerald-200/80 bg-emerald-50/40 p-4 space-y-2.5">
              <div className="flex items-center justify-between">
                <h4 className="flex items-center gap-2 text-xs font-extrabold text-emerald-900">
                  <ThumbsUp className="h-4 w-4 text-emerald-600" />
                  {t.evaluate.results.strengthsTitle}
                </h4>
                <button
                  type="button"
                  onClick={() => handleListItemAdd('strengths')}
                  className="inline-flex items-center gap-1 rounded-lg bg-white border border-emerald-200 px-2 py-1 text-[11px] font-semibold text-emerald-800 hover:bg-emerald-50"
                >
                  <Plus className="h-3 w-3" />
                  {t.evaluate.results.addPointBtn}
                </button>
              </div>
              <div className="space-y-2">
                {draft.strengths.map((item, idx) => (
                  <div key={idx} className="flex items-start gap-1.5">
                    <input
                      type="text"
                      value={item}
                      onChange={(e) => handleListItemChange('strengths', idx, e.target.value)}
                      className="flex-1 rounded-xl border border-emerald-200/70 bg-white px-3 py-2 text-xs text-slate-800 focus:border-emerald-500 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => handleListItemRemove('strengths', idx)}
                      className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Improvements */}
            <div className="rounded-2xl border border-amber-200/80 bg-amber-50/40 p-4 space-y-2.5">
              <div className="flex items-center justify-between">
                <h4 className="flex items-center gap-2 text-xs font-extrabold text-amber-900">
                  <TrendingUp className="h-4 w-4 text-amber-600" />
                  {t.evaluate.results.improvementsTitle}
                </h4>
                <button
                  type="button"
                  onClick={() => handleListItemAdd('improvements')}
                  className="inline-flex items-center gap-1 rounded-lg bg-white border border-amber-200 px-2 py-1 text-[11px] font-semibold text-amber-800 hover:bg-amber-50"
                >
                  <Plus className="h-3 w-3" />
                  {t.evaluate.results.addPointBtn}
                </button>
              </div>
              <div className="space-y-2">
                {draft.improvements.map((item, idx) => (
                  <div key={idx} className="flex items-start gap-1.5">
                    <input
                      type="text"
                      value={item}
                      onChange={(e) => handleListItemChange('improvements', idx, e.target.value)}
                      className="flex-1 rounded-xl border border-amber-200/70 bg-white px-3 py-2 text-xs text-slate-800 focus:border-amber-500 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => handleListItemRemove('improvements', idx)}
                      className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* 4. Linguistic Corrections */}
          <section className="rounded-2xl border border-slate-200/90 bg-white overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-slate-50/70 px-4 py-3">
              <h4 className="flex items-center gap-2 text-xs font-extrabold text-slate-800">
                <SpellCheck className="h-4 w-4 text-indigo-600" />
                {t.evaluate.results.linguisticTitle} ({draft.linguisticCorrections.length})
              </h4>
              <button
                type="button"
                onClick={handleAddCorrection}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
              >
                <Plus className="h-3 w-3" />
                {t.evaluate.results.addCorrectionBtn}
              </button>
            </div>

            {draft.linguisticCorrections.length === 0 ? (
              <p className="p-4 text-xs text-slate-400 italic">
                {t.evaluate.results.linguisticEmpty}
              </p>
            ) : (
              <div className="divide-y divide-slate-100">
                {draft.linguisticCorrections.map((item) => (
                  <div
                    key={item.id}
                    className="grid grid-cols-1 md:grid-cols-12 gap-2 p-3 items-start hover:bg-slate-50/50"
                  >
                    <div className="md:col-span-3">
                      <label className="block md:hidden text-[10px] font-bold text-slate-400 mb-0.5">
                        {t.evaluate.results.originalCol}
                      </label>
                      <input
                        type="text"
                        value={item.original}
                        onChange={(e) =>
                          handleCorrectionChange(item.id, 'original', e.target.value)
                        }
                        placeholder={t.evaluate.results.originalCol}
                        className="w-full rounded-lg border border-rose-200/80 bg-rose-50/40 px-2.5 py-1.5 text-xs font-medium text-rose-900 focus:border-rose-400 focus:bg-white focus:outline-none"
                      />
                    </div>
                    <div className="md:col-span-3">
                      <label className="block md:hidden text-[10px] font-bold text-slate-400 mb-0.5">
                        {t.evaluate.results.correctionCol}
                      </label>
                      <input
                        type="text"
                        value={item.correction}
                        onChange={(e) =>
                          handleCorrectionChange(item.id, 'correction', e.target.value)
                        }
                        placeholder={t.evaluate.results.correctionCol}
                        className="w-full rounded-lg border border-emerald-200/80 bg-emerald-50/40 px-2.5 py-1.5 text-xs font-semibold text-emerald-900 focus:border-emerald-400 focus:bg-white focus:outline-none"
                      />
                    </div>
                    <div className="md:col-span-5">
                      <label className="block md:hidden text-[10px] font-bold text-slate-400 mb-0.5">
                        {t.evaluate.results.explanationCol}
                      </label>
                      <input
                        type="text"
                        value={item.explanation}
                        onChange={(e) =>
                          handleCorrectionChange(item.id, 'explanation', e.target.value)
                        }
                        placeholder={t.evaluate.results.explanationCol}
                        className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 focus:border-teal-500 focus:outline-none"
                      />
                    </div>
                    <div className="md:col-span-1 flex justify-end">
                      <button
                        type="button"
                        onClick={() => handleRemoveCorrection(item.id)}
                        className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* 5. Pending Subject Assessment (LH4 / LH5) when applicable */}
          {draft.pendingSubjectAssessment && (
            <section
              className={`rounded-2xl border p-4 space-y-3 ${
                draft.pendingSubjectAssessment.sufficient
                  ? 'border-emerald-300 bg-emerald-50/50'
                  : 'border-amber-300 bg-amber-50/60'
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h4 className="flex items-center gap-2 text-xs font-extrabold text-slate-900">
                  <AlertTriangle
                    className={`h-4 w-4 shrink-0 ${
                      draft.pendingSubjectAssessment.sufficient
                        ? 'text-emerald-600'
                        : 'text-amber-600'
                    }`}
                  />
                  <span>
                    {t.dossier.pendingEvalCardTitle(
                      getSubjectLabel(draft.pendingSubjectAssessment.subject, resolvedEvalLang),
                      draft.pendingSubjectAssessment.pendingCourse
                    )}
                  </span>
                </h4>

                <div className="inline-flex rounded-xl bg-white border border-slate-200 p-0.5 gap-1">
                  <button
                    type="button"
                    onClick={() =>
                      onChangeDraft({
                        ...draft,
                        pendingSubjectAssessment: {
                          ...draft.pendingSubjectAssessment!,
                          sufficient: true,
                        },
                      })
                    }
                    className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-bold transition ${
                      draft.pendingSubjectAssessment.sufficient
                        ? 'bg-emerald-600 text-white shadow-2xs'
                        : 'text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    {t.dossier.pendingEvalSufficient}
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      onChangeDraft({
                        ...draft,
                        pendingSubjectAssessment: {
                          ...draft.pendingSubjectAssessment!,
                          sufficient: false,
                        },
                      })
                    }
                    className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-bold transition ${
                      !draft.pendingSubjectAssessment.sufficient
                        ? 'bg-rose-600 text-white shadow-2xs'
                        : 'text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    <XCircle className="h-3.5 w-3.5" />
                    {t.dossier.pendingEvalInsufficient}
                  </button>
                </div>
              </div>

              <textarea
                value={draft.pendingSubjectAssessment.justification}
                onChange={(e) =>
                  onChangeDraft({
                    ...draft,
                    pendingSubjectAssessment: {
                      ...draft.pendingSubjectAssessment!,
                      justification: e.target.value,
                    },
                  })
                }
                rows={2}
                placeholder={t.dossier.pendingEvalJustificationPlaceholder}
                className="w-full rounded-xl border border-slate-200 bg-white p-3 text-xs leading-relaxed text-slate-800 focus:border-indigo-500 focus:outline-none"
              />
            </section>
          )}

          {/* 6. Motivating Student Feedback */}
          <section className="rounded-2xl border border-teal-200/80 bg-teal-50/40 p-4 space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="flex items-center gap-2 text-xs font-extrabold text-teal-900">
                <MessageSquareHeart className="h-4 w-4 text-teal-600" />
                {t.evaluate.results.feedbackTitle}
              </h4>
              <button
                type="button"
                onClick={handleCopyFeedback}
                className="inline-flex items-center gap-1 rounded-lg border border-teal-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-teal-800 hover:bg-teal-50 transition"
              >
                {copiedFeedback ? (
                  <>
                    <Check className="h-3 w-3 text-emerald-600" />
                    {t.evaluate.results.copiedFeedback}
                  </>
                ) : (
                  <>
                    <Copy className="h-3 w-3" />
                    {t.evaluate.results.copyFeedbackBtn}
                  </>
                )}
              </button>
            </div>
            <textarea
              value={draft.studentFeedback}
              onChange={(e) => onChangeDraft({ ...draft, studentFeedback: e.target.value })}
              rows={4}
              className="w-full rounded-xl border border-teal-200/80 bg-white p-3.5 text-sm leading-relaxed text-slate-800 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/15"
            />
          </section>

          {/* 7. Send / Copy Student Evaluation Report via Email */}
          <section className="rounded-2xl border border-indigo-200/80 bg-indigo-50/35 p-3.5">
            <EmailReportButtons
              student={student}
              studentName={studentName}
              studentEmail={studentEmail}
              asignatura={resolvedSubject}
              testTitle={resolvedTestTitle}
              language={resolvedEvalLang}
              strengths={draft.strengths}
              improvements={draft.improvements}
              linguisticCorrections={draft.linguisticCorrections}
              feedbackSummary={draft.studentFeedback}
              emailSentAt={draft.emailSentAt}
              onEmailSent={(sentAt) => onChangeDraft({ ...draft, emailSentAt: sentAt })}
              onEditStudentEmail={onEditStudentEmail}
              onNotify={onNotify}
              t={t}
            />
          </section>
        </div>

        {/* Sticky Bottom Action Bar */}
        {!embedded && onSave && (
          <div className="flex flex-wrap items-center justify-end gap-2.5 border-t border-slate-100 bg-slate-50/80 px-5 py-4">
            <button
              type="button"
              onClick={() => onSave(false)}
              className="inline-flex items-center gap-2 rounded-xl bg-teal-600 px-5 py-2.5 text-xs font-bold text-white shadow-sm shadow-teal-600/20 hover:bg-teal-700 transition"
            >
              <Save className="h-4 w-4" />
              {t.evaluate.results.saveToDossierBtn}
            </button>

            {hasNextPending && (
              <button
                type="button"
                onClick={() => onSave(true)}
                className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-slate-800 transition"
              >
                <span>{t.evaluate.results.saveAndNextBtn}</span>
                <ArrowRight className="h-4 w-4" />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
