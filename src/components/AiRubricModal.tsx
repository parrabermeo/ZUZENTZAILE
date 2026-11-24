import React, { useState, useEffect } from 'react';
import {
  X,
  Sparkles,
  Loader2,
  AlertCircle,
  Settings,
  Zap,
  Wand2,
} from 'lucide-react';
import type { GeminiModelId, Language, Rubric, SkillMode, TextTypologyId } from '../types';
import type { Translations } from '../i18n/translations';
import { TEXT_TYPOLOGIES } from '../data/defaultRubrics';
import {
  DEFAULT_GEMINI_MODEL,
  generateRubricWithAI,
  resolveGeminiApiKey,
} from '../services/geminiService';

interface AiRubricModalProps {
  open: boolean;
  skill: SkillMode;
  typology: TextTypologyId;
  rubricLanguage: Language;
  baseRubric: Rubric;
  userApiKey: string;
  activeModel?: GeminiModelId;
  uiLang: Language;
  t: Translations;
  onClose: () => void;
  onGenerated: (rubric: Rubric) => void;
  onOpenSettings: () => void;
}

export const AiRubricModal: React.FC<AiRubricModalProps> = ({
  open,
  skill,
  typology,
  rubricLanguage,
  baseRubric,
  userApiKey,
  activeModel = DEFAULT_GEMINI_MODEL,
  uiLang,
  t,
  onClose,
  onGenerated,
  onOpenSettings,
}) => {
  const [topic, setTopic] = useState('');
  const [extraNotes, setExtraNotes] = useState('');
  const [targetLang, setTargetLang] = useState<Language>(rubricLanguage);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setTargetLang(rubricLanguage);
      setError(null);
      setLoading(false);
    }
  }, [open, rubricLanguage]);

  if (!open) return null;

  const hasApiKey = Boolean(resolveGeminiApiKey(userApiKey));
  const typologyMeta = TEXT_TYPOLOGIES.find((item) => item.id === typology);
  const quickExamples =
    skill === 'writing' ? t.rubrics.aiModal.examplesWriting : t.rubrics.aiModal.examplesReading;

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!topic.trim() || !hasApiKey) return;

    setLoading(true);
    setError(null);

    try {
      const generated = await generateRubricWithAI({
        userApiKey,
        model: activeModel,
        skill,
        typology: skill === 'writing' ? typology : undefined,
        typologyLabel: typologyMeta ? typologyMeta.title[targetLang] : undefined,
        language: targetLang,
        topic: topic.trim(),
        extraNotes: extraNotes.trim(),
        baseRubric,
      });

      setTopic('');
      setExtraNotes('');
      onGenerated(generated);
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-slate-900/55 backdrop-blur-xs" onClick={onClose} />
      <div className="relative z-10 w-full max-w-xl rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-slate-100 bg-gradient-to-r from-teal-50/80 via-white to-indigo-50/40 px-6 py-4">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-teal-600 to-indigo-600 text-white shadow-sm">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-slate-900">{t.rubrics.aiModal.title}</h2>
                <span className="inline-flex items-center gap-1 rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-bold text-indigo-800">
                  <Zap className="h-3 w-3" />
                  {activeModel} · medium
                </span>
              </div>
              <p className="mt-0.5 text-xs leading-relaxed text-slate-600">
                {t.rubrics.aiModal.subtitle}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleGenerate} className="p-6 space-y-4">
          {/* Context Pill */}
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200/80 bg-slate-50/70 px-3.5 py-2.5 text-xs">
            <div className="flex items-center gap-2 font-semibold text-slate-700">
              <span className="rounded-lg bg-white border border-slate-200 px-2 py-0.5 text-[11px] font-bold text-teal-800">
                {skill === 'writing' ? t.rubrics.writingCardTitle : t.rubrics.readingCardTitle}
              </span>
              {skill === 'writing' && typologyMeta && (
                <span className="text-slate-600">· {typologyMeta.title[uiLang]}</span>
              )}
            </div>

            <div className="flex items-center gap-1 rounded-lg bg-slate-200/70 p-0.5">
              <button
                type="button"
                onClick={() => setTargetLang('eu')}
                className={`rounded-md px-2 py-0.5 text-[11px] font-bold transition ${
                  targetLang === 'eu' ? 'bg-white text-teal-800 shadow-2xs' : 'text-slate-600'
                }`}
              >
                EU
              </button>
              <button
                type="button"
                onClick={() => setTargetLang('es')}
                className={`rounded-md px-2 py-0.5 text-[11px] font-bold transition ${
                  targetLang === 'es' ? 'bg-white text-teal-800 shadow-2xs' : 'text-slate-600'
                }`}
              >
                ES
              </button>
            </div>
          </div>

          {/* Missing API key notice */}
          {!hasApiKey && (
            <div className="flex items-start justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-xs text-amber-900">
              <div className="flex items-start gap-2">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-amber-600" />
                <span>{t.rubrics.aiModal.missingKeyWarning}</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenSettings();
                }}
                className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-amber-600 px-2.5 py-1.5 text-[11px] font-semibold text-white hover:bg-amber-700"
              >
                <Settings className="h-3 w-3" />
                {t.rubrics.aiModal.openSettingsBtn}
              </button>
            </div>
          )}

          {/* Topic Input */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              {t.rubrics.aiModal.topicLabel}
            </label>
            <input
              type="text"
              required
              autoFocus
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder={
                skill === 'writing'
                  ? t.rubrics.aiModal.topicPlaceholderWriting
                  : t.rubrics.aiModal.topicPlaceholderReading
              }
              className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
            />

            {/* Quick Example Chips */}
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] font-medium text-slate-400">
                {t.rubrics.aiModal.quickExamples}
              </span>
              {quickExamples.map((ex) => (
                <button
                  key={ex}
                  type="button"
                  onClick={() => setTopic(ex)}
                  className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-[11px] font-medium text-slate-600 hover:border-teal-300 hover:bg-teal-50 hover:text-teal-800 transition"
                >
                  {ex}
                </button>
              ))}
            </div>
          </div>

          {/* Optional extra notes */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              {t.rubrics.aiModal.extraNotesLabel}
            </label>
            <textarea
              value={extraNotes}
              onChange={(e) => setExtraNotes(e.target.value)}
              rows={3}
              placeholder={t.rubrics.aiModal.extraNotesPlaceholder}
              className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-xs leading-relaxed text-slate-800 placeholder:text-slate-400 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
            />
          </div>

          {/* Error banner */}
          {error && (
            <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs text-rose-800">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-rose-600" />
              <span className="break-words">{error}</span>
            </div>
          )}

          {/* Footer buttons */}
          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="rounded-xl px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-50"
            >
              {t.rubrics.aiModal.cancel}
            </button>
            <button
              type="submit"
              disabled={loading || !topic.trim() || !hasApiKey}
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-teal-600 to-indigo-600 px-5 py-2.5 text-xs font-semibold text-white shadow-sm shadow-teal-600/20 hover:from-teal-700 hover:to-indigo-700 transition disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t.rubrics.aiModal.generating}
                </>
              ) : (
                <>
                  <Wand2 className="h-4 w-4" />
                  {t.rubrics.aiModal.generateBtn}
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
