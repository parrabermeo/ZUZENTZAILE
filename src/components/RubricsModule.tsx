import React, { useState, useEffect, useMemo } from 'react';
import {
  ClipboardList,
  Sparkles,
  Save,
  CopyPlus,
  RotateCcw,
  Trash2,
  Plus,
  Scale,
  AlertTriangle,
  CheckCircle2,
  Languages,
  Zap,
} from 'lucide-react';
import type {
  AppSettings,
  Language,
  Rubric,
  RubricCriterion,
  SkillMode,
  SubjectId,
  TextTypologyId,
} from '../types';
import type { Translations } from '../i18n/translations';
import { getBaseRubric } from '../data/defaultRubrics';
import { languageToSubject, subjectToLanguage } from '../utils/subjects';
import { SkillAndTypologySelector } from './SkillAndTypologySelector';
import { AiRubricModal } from './AiRubricModal';

interface RubricsModuleProps {
  savedRubrics: Rubric[];
  settings: AppSettings;
  lang: Language;
  t: Translations;
  onSaveRubric: (rubric: Rubric) => void;
  onDeleteRubric: (rubricId: string) => void;
  onOpenSettings: () => void;
  onNotify: (message: string, type?: 'success' | 'info' | 'warning' | 'error') => void;
}

const LEVEL_STYLES = [
  {
    level: 1 as const,
    headerBg: 'bg-rose-50/90 border-rose-200/80 text-rose-900',
    badgeBg: 'bg-rose-100 text-rose-800',
  },
  {
    level: 2 as const,
    headerBg: 'bg-amber-50/90 border-amber-200/80 text-amber-900',
    badgeBg: 'bg-amber-100 text-amber-800',
  },
  {
    level: 3 as const,
    headerBg: 'bg-teal-50/90 border-teal-200/80 text-teal-900',
    badgeBg: 'bg-teal-100 text-teal-800',
  },
  {
    level: 4 as const,
    headerBg: 'bg-emerald-50/90 border-emerald-200/80 text-emerald-900',
    badgeBg: 'bg-emerald-100 text-emerald-800',
  },
];

function cloneRubric(r: Rubric): Rubric {
  return {
    ...r,
    criteria: r.criteria.map((c) => ({
      ...c,
      levels: { ...c.levels },
    })),
  };
}

export const RubricsModule: React.FC<RubricsModuleProps> = ({
  savedRubrics,
  settings,
  lang,
  t,
  onSaveRubric,
  onDeleteRubric,
  onOpenSettings,
  onNotify,
}) => {
  const [skill, setSkill] = useState<SkillMode>('writing');
  const [typology, setTypology] = useState<TextTypologyId>('narrative');
  const [rubricLang, setRubricLang] = useState<Language>(lang);
  const [selectedRubricId, setSelectedRubricId] = useState<string>('base');
  const [draft, setDraft] = useState<Rubric>(() => getBaseRubric('writing', lang, 'narrative'));
  const [isDirty, setIsDirty] = useState(false);
  const [aiModalOpen, setAiModalOpen] = useState(false);

  // Sync rubric content language when UI language switches (unless user has unsaved edits)
  useEffect(() => {
    if (!isDirty) {
      setRubricLang(lang);
    }
  }, [lang, isDirty]);

  const baseRubric = useMemo(
    () => getBaseRubric(skill, rubricLang, typology),
    [skill, rubricLang, typology]
  );

  // Saved custom rubrics matching current skill + typology (+ language)
  const matchingSavedRubrics = useMemo(
    () =>
      savedRubrics.filter(
        (r) =>
          r.skill === skill &&
          r.language === rubricLang &&
          (skill === 'reading' || r.typology === typology)
      ),
    [savedRubrics, skill, rubricLang, typology]
  );

  // Keep draft synced when selection context changes
  useEffect(() => {
    if (selectedRubricId === 'base') {
      setDraft(cloneRubric(baseRubric));
      setIsDirty(false);
      return;
    }
    const found = matchingSavedRubrics.find((r) => r.id === selectedRubricId);
    if (found) {
      setDraft(cloneRubric(found));
      setIsDirty(false);
    } else {
      setSelectedRubricId('base');
      setDraft(cloneRubric(baseRubric));
      setIsDirty(false);
    }
  }, [baseRubric, selectedRubricId, matchingSavedRubrics]);

  const totalWeight = useMemo(
    () => Number(draft.criteria.reduce((acc, c) => acc + (Number(c.weight) || 0), 0).toFixed(2)),
    [draft.criteria]
  );
  const isWeightValid = Math.abs(totalWeight - 10) < 0.05;

  const isEditingSavedCustom = selectedRubricId !== 'base' && !draft.isBase;

  const handleChangeSkill = (nextSkill: SkillMode) => {
    setSkill(nextSkill);
    setSelectedRubricId('base');
  };

  const handleChangeTypology = (nextTypology: TextTypologyId) => {
    setTypology(nextTypology);
    setSelectedRubricId('base');
  };

  const handleChangeRubricLang = (nextLang: Language) => {
    setRubricLang(nextLang);
    setSelectedRubricId('base');
  };

  const handleChangeSubject = (nextSubject: SubjectId) => {
    handleChangeRubricLang(subjectToLanguage(nextSubject));
  };

  const activeSubject: SubjectId = languageToSubject(rubricLang);

  const updateDraft = (updater: (prev: Rubric) => Rubric) => {
    setDraft((prev) => updater(prev));
    setIsDirty(true);
  };

  const handleCriterionFieldChange = (
    criterionId: string,
    field: 'code' | 'name' | 'weight',
    value: string | number
  ) => {
    updateDraft((prev) => ({
      ...prev,
      criteria: prev.criteria.map((c) => (c.id === criterionId ? { ...c, [field]: value } : c)),
    }));
  };

  const handleLevelChange = (criterionId: string, level: 1 | 2 | 3 | 4, value: string) => {
    updateDraft((prev) => ({
      ...prev,
      criteria: prev.criteria.map((c) =>
        c.id === criterionId
          ? {
              ...c,
              levels: {
                ...c.levels,
                [level]: value,
              },
            }
          : c
      ),
    }));
  };

  const handleAddCriterion = () => {
    const idx = draft.criteria.length + 1;
    const newCrit: RubricCriterion = {
      id: `crit-${Date.now()}-${idx}`,
      code: skill === 'writing' ? `CE5.${idx}` : `CE4.${idx}`,
      name: rubricLang === 'eu' ? `Irizpide berria ${idx}` : `Nuevo criterio ${idx}`,
      weight: 1.0,
      levels: { 1: '', 2: '', 3: '', 4: '' },
    };
    updateDraft((prev) => ({
      ...prev,
      criteria: [...prev.criteria, newCrit],
    }));
  };

  const handleRemoveCriterion = (criterionId: string) => {
    if (draft.criteria.length <= 1) return;
    updateDraft((prev) => ({
      ...prev,
      criteria: prev.criteria.filter((c) => c.id !== criterionId),
    }));
  };

  const handleAutoBalanceWeights = () => {
    const count = draft.criteria.length;
    if (count === 0) return;
    const each = Number((10 / count).toFixed(1));
    let running = 0;

    updateDraft((prev) => ({
      ...prev,
      criteria: prev.criteria.map((c, idx) => {
        if (idx === count - 1) {
          return { ...c, weight: Number((10 - running).toFixed(1)) };
        }
        running += each;
        return { ...c, weight: each };
      }),
    }));
  };

  const handleSave = (asNew = false) => {
    const now = new Date().toISOString();
    const shouldCreateNew = asNew || draft.isBase || selectedRubricId === 'base';
    const nextId = shouldCreateNew
      ? typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? `rub-${crypto.randomUUID()}`
        : `rub-${Date.now()}`
      : draft.id;

    const toSave: Rubric = {
      ...cloneRubric(draft),
      id: nextId,
      asignatura: activeSubject,
      skill,
      typology: skill === 'writing' ? typology : undefined,
      language: rubricLang,
      isBase: false,
      createdAt: shouldCreateNew ? now : draft.createdAt,
      updatedAt: now,
    };

    onSaveRubric(toSave);
    setSelectedRubricId(toSave.id);
    setDraft(toSave);
    setIsDirty(false);
  };

  const handleResetBase = () => {
    setSelectedRubricId('base');
    setDraft(cloneRubric(baseRubric));
    setIsDirty(false);
    onNotify(t.toasts.rubricReset, 'info');
  };

  const handleDeleteCurrent = () => {
    if (!isEditingSavedCustom) return;
    if (!window.confirm(t.rubrics.confirmDeleteRubric(draft.title))) return;
    onDeleteRubric(draft.id);
    setSelectedRubricId('base');
  };

  const handleAiGenerated = (generated: Rubric) => {
    // Load into editor as an editable draft BEFORE saving so teacher can edit any cell manually
    setRubricLang(generated.language);
    setDraft(generated);
    setIsDirty(true);
    onNotify(t.toasts.rubricGenerated, 'success');
  };

  return (
    <div className="space-y-6">
      {/* Page Header (Cyan Theme) */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-cyan-50 border border-cyan-200 px-2.5 py-0.5 text-[11px] font-bold text-cyan-800 mb-2">
            <ClipboardList className="h-3.5 w-3.5 text-cyan-600" />
            {t.nav.rubrics}
          </span>
          <h2 className="text-2xl font-extrabold tracking-tight text-slate-900">
            {t.rubrics.title}
          </h2>
          <p className="text-sm text-slate-500 mt-1 max-w-3xl">{t.rubrics.subtitle}</p>
        </div>

        {/* Primary AI Generator Button */}
        <button
          type="button"
          onClick={() => setAiModalOpen(true)}
          className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-cyan-600 px-4 py-2.5 text-xs font-bold text-white shadow-sm shadow-cyan-600/20 hover:bg-cyan-700 transition"
        >
          <Sparkles className="h-4 w-4" />
          <span>{t.rubrics.aiGenerateBtn}</span>
        </button>
      </div>

      {/* Prominent Subject Selector (Euskera | Lengua Castellana) */}
      <div className="rounded-2xl border border-slate-200/90 border-t-2 border-t-cyan-500 bg-white p-4 shadow-2xs flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
            <Languages className="h-4 w-4" />
          </span>
          <div>
            <p className="text-xs font-extrabold uppercase tracking-wider text-slate-500">
              {t.subjects.label}
            </p>
            <p className="text-[11px] text-slate-500">
              {activeSubject === 'euskera'
                ? t.subjects.euskeraCriteriaHint
                : t.subjects.castellanoCriteriaHint}
            </p>
          </div>
        </div>

        <div className="inline-flex rounded-xl bg-slate-100 p-1 shrink-0">
          <button
            type="button"
            onClick={() => handleChangeSubject('euskera')}
            className={`rounded-lg px-4 py-2 text-xs font-extrabold transition ${
              activeSubject === 'euskera'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {t.subjects.euskera}
          </button>
          <button
            type="button"
            onClick={() => handleChangeSubject('castellano')}
            className={`rounded-lg px-4 py-2 text-xs font-extrabold transition ${
              activeSubject === 'castellano'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {t.subjects.castellano}
          </button>
        </div>
      </div>

      {/* Reusable Modality + Typology Selector */}
      <SkillAndTypologySelector
        skill={skill}
        typology={typology}
        onChangeSkill={handleChangeSkill}
        onChangeTypology={handleChangeTypology}
        lang={lang}
        t={t}
      />

      {/* Rubric Toolbar & Editor Card */}
      <div className="rounded-2xl border border-slate-200/90 bg-white shadow-2xs overflow-hidden">
        {/* Top Controls Bar */}
        <div className="border-b border-slate-100 bg-slate-50/70 p-4 sm:px-6 space-y-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            {/* Saved Rubric Switcher + Language */}
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  {t.rubrics.savedRubricsLabel}:
                </label>
                <select
                  value={selectedRubricId}
                  onChange={(e) => setSelectedRubricId(e.target.value)}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 focus:border-teal-500 focus:outline-none"
                >
                  <option value="base">{t.rubrics.baseRubricOption}</option>
                  {matchingSavedRubrics.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.generatedByAI ? '✦ ' : ''}
                      {r.title}
                    </option>
                  ))}
                </select>
              </div>

              {/* Rubric Content Language Toggle (EU / ES) */}
              <div className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2.5 py-1">
                <Languages className="h-3.5 w-3.5 text-slate-400" />
                <span className="text-[11px] font-semibold text-slate-500">
                  {t.rubrics.rubricLangLabel}:
                </span>
                <button
                  type="button"
                  onClick={() => handleChangeRubricLang('eu')}
                  className={`rounded-md px-2 py-0.5 text-[11px] font-bold transition ${
                    rubricLang === 'eu'
                      ? 'bg-teal-600 text-white'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  EU
                </button>
                <button
                  type="button"
                  onClick={() => handleChangeRubricLang('es')}
                  className={`rounded-md px-2 py-0.5 text-[11px] font-bold transition ${
                    rubricLang === 'es'
                      ? 'bg-teal-600 text-white'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  ES
                </button>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleResetBase}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 transition"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                {t.rubrics.resetBaseBtn}
              </button>

              {isEditingSavedCustom && (
                <>
                  <button
                    type="button"
                    onClick={() => handleSave(true)}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition"
                  >
                    <CopyPlus className="h-3.5 w-3.5" />
                    {t.rubrics.saveAsNewBtn}
                  </button>
                  <button
                    type="button"
                    onClick={handleDeleteCurrent}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100 transition"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    {t.rubrics.deleteRubricBtn}
                  </button>
                </>
              )}

              <button
                type="button"
                onClick={() => handleSave(false)}
                className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-1.5 text-xs font-bold shadow-xs transition ${
                  isDirty
                    ? 'bg-teal-600 text-white hover:bg-teal-700'
                    : 'bg-slate-900 text-white hover:bg-slate-800'
                }`}
              >
                <Save className="h-3.5 w-3.5" />
                {t.rubrics.saveBtn}
              </button>
            </div>
          </div>

          {/* Rubric Title Input + Badges + Weight Meter */}
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex-1 min-w-0 space-y-1.5">
              <input
                type="text"
                value={draft.title}
                onChange={(e) => updateDraft((prev) => ({ ...prev, title: e.target.value }))}
                placeholder={t.rubrics.rubricTitlePlaceholder}
                className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-bold text-slate-900 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
              />
              <div className="flex flex-wrap items-center gap-2">
                {draft.generatedByAI && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 border border-indigo-200 px-2.5 py-0.5 text-[11px] font-semibold text-indigo-700">
                    <Zap className="h-3 w-3" />
                    {t.rubrics.aiGeneratedBadge}
                  </span>
                )}
                {draft.topic && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-medium text-slate-700">
                    <strong>{t.rubrics.topicBadge}</strong> {draft.topic}
                  </span>
                )}
                {isDirty && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 border border-amber-200 px-2.5 py-0.5 text-[11px] font-semibold text-amber-800">
                    {t.rubrics.unsavedBadge}
                  </span>
                )}
              </div>
            </div>

            {/* Live Weight / 10 Points Indicator */}
            <div className="flex items-center gap-2.5 shrink-0">
              <div
                className={`flex items-center gap-2 rounded-xl border px-3.5 py-2 text-xs font-bold ${
                  isWeightValid
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                    : 'border-amber-300 bg-amber-50 text-amber-900'
                }`}
              >
                {isWeightValid ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                ) : (
                  <AlertTriangle className="h-4 w-4 text-amber-600" />
                )}
                <span>
                  {t.rubrics.totalWeightLabel}: {totalWeight.toFixed(1)} / 10 pt
                </span>
              </div>

              {!isWeightValid && (
                <button
                  type="button"
                  onClick={handleAutoBalanceWeights}
                  className="inline-flex items-center gap-1 rounded-xl border border-amber-300 bg-white px-3 py-2 text-xs font-semibold text-amber-800 hover:bg-amber-50 transition"
                >
                  <Scale className="h-3.5 w-3.5" />
                  {t.rubrics.autoBalanceBtn}
                </button>
              )}
            </div>
          </div>

          {!isWeightValid && (
            <p className="text-[11px] font-medium text-amber-700">{t.rubrics.weightWarning}</p>
          )}
        </div>

        {/* Editable 4-Level Rubric Matrix */}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] border-collapse text-left">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/50">
                <th className="w-56 p-3.5 text-[11px] font-bold uppercase tracking-wider text-slate-500 border-r border-slate-100">
                  {t.rubrics.criterionCol}
                </th>
                <th className="w-24 p-3.5 text-center text-[11px] font-bold uppercase tracking-wider text-slate-500 border-r border-slate-100">
                  {t.rubrics.weightCol}
                </th>
                {t.rubrics.levels.map((lvl, idx) => (
                  <th
                    key={lvl.num}
                    className={`p-3 border-r last:border-r-0 border-slate-100 align-top ${LEVEL_STYLES[idx].headerBg}`}
                  >
                    <div className="flex items-center justify-between gap-1.5">
                      <span className="text-xs font-extrabold">{lvl.name}</span>
                      <span
                        className={`rounded-md px-1.5 py-0.5 text-[10px] font-extrabold ${LEVEL_STYLES[idx].badgeBg}`}
                      >
                        {lvl.num} / 4
                      </span>
                    </div>
                    <p className="mt-0.5 text-[10px] font-medium opacity-75">{lvl.desc}</p>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/80">
              {draft.criteria.map((crit) => (
                <tr key={crit.id} className="group align-top bg-white hover:bg-slate-50/40">
                  {/* Criterion Name & Competency Code */}
                  <td className="p-3 border-r border-slate-100 space-y-2">
                    <div className="flex items-center justify-between gap-1.5">
                      <input
                        type="text"
                        value={crit.code}
                        onChange={(e) =>
                          handleCriterionFieldChange(crit.id, 'code', e.target.value)
                        }
                        className="w-20 rounded-md border border-teal-200/80 bg-teal-50/70 px-2 py-0.5 font-mono text-[11px] font-bold text-teal-800 focus:border-teal-500 focus:bg-white focus:outline-none"
                      />
                      {draft.criteria.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveCriterion(crit.id)}
                          className="rounded-md p-1 text-slate-300 opacity-0 group-hover:opacity-100 hover:bg-rose-50 hover:text-rose-600 transition"
                          title={t.rubrics.deleteRubricBtn}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                    <textarea
                      value={crit.name}
                      onChange={(e) => handleCriterionFieldChange(crit.id, 'name', e.target.value)}
                      rows={3}
                      className="w-full resize-none rounded-lg border border-transparent bg-transparent p-1 text-xs font-bold leading-snug text-slate-900 hover:border-slate-200 focus:border-teal-500 focus:bg-white focus:outline-none"
                    />
                  </td>

                  {/* Weight over 10 pts */}
                  <td className="p-3 border-r border-slate-100 text-center">
                    <div className="inline-flex flex-col items-center gap-1">
                      <input
                        type="number"
                        min={0.5}
                        max={10}
                        step={0.5}
                        value={crit.weight}
                        onChange={(e) =>
                          handleCriterionFieldChange(
                            crit.id,
                            'weight',
                            Math.max(0, parseFloat(e.target.value) || 0)
                          )
                        }
                        className="w-16 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-center text-xs font-extrabold text-slate-800 focus:border-teal-500 focus:bg-white focus:outline-none"
                      />
                      <span className="text-[10px] font-semibold text-slate-400">
                        {((crit.weight / 10) * 100).toFixed(0)}%
                      </span>
                    </div>
                  </td>

                  {/* Editable Cells for Levels 1-4 */}
                  {([1, 2, 3, 4] as const).map((lvl) => (
                    <td key={lvl} className="p-2 border-r last:border-r-0 border-slate-100">
                      <textarea
                        value={crit.levels[lvl]}
                        onChange={(e) => handleLevelChange(crit.id, lvl, e.target.value)}
                        rows={5}
                        className="w-full resize-y rounded-xl border border-transparent bg-transparent p-2 text-xs leading-relaxed text-slate-700 hover:border-slate-200 hover:bg-slate-50/70 focus:border-teal-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500/15"
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Footer: Add Criterion */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 bg-slate-50/60 px-5 py-3.5">
          <button
            type="button"
            onClick={handleAddCriterion}
            className="inline-flex items-center gap-1.5 rounded-xl border border-dashed border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:border-teal-400 hover:bg-teal-50/40 hover:text-teal-800 transition"
          >
            <Plus className="h-3.5 w-3.5" />
            {t.rubrics.addCriterionBtn}
          </button>

          <button
            type="button"
            onClick={() => setAiModalOpen(true)}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-700 hover:text-indigo-900"
          >
            <Sparkles className="h-3.5 w-3.5" />
            {t.rubrics.aiGenerateBtn}
          </button>
        </div>
      </div>

      {/* AI Rubric Generator Modal */}
      <AiRubricModal
        open={aiModalOpen}
        skill={skill}
        typology={typology}
        rubricLanguage={rubricLang}
        baseRubric={baseRubric}
        userApiKey={settings.geminiApiKey}
        activeModel={settings.geminiModel}
        uiLang={lang}
        t={t}
        onClose={() => setAiModalOpen(false)}
        onGenerated={handleAiGenerated}
        onOpenSettings={onOpenSettings}
      />
    </div>
  );
};
