import React, { useEffect, useState } from 'react';
import {
  Sparkles,
  Loader2,
  Printer,
  RefreshCw,
  AlertCircle,
  FileText,
  X,
  BookOpenCheck,
} from 'lucide-react';
import type {
  AppSettings,
  ClassGroup,
  EvaluationRecord,
  Language,
  Student,
  SubjectId,
} from '../types';
import type { Translations } from '../i18n/translations';
import {
  generateStudentEvolutionReportWithAI,
  resolveGeminiApiKey,
  type StudentEvolutionReport,
} from '../services/geminiService';
import { getSubjectLabel, subjectToLanguage } from '../utils/subjects';

interface StudentEvolutionReportPanelProps {
  student: Student;
  group: ClassGroup | undefined;
  subject: SubjectId;
  subjectEvaluations: EvaluationRecord[];
  settings: AppSettings;
  uiLang: Language;
  t: Translations;
  subjectAvg: number | null;
  readingAvg: number | null;
  writingAvg: number | null;
  onReportPrintModeChange: (printOnlyReport: boolean) => void;
  onNotify: (message: string, type?: 'success' | 'info' | 'warning' | 'error') => void;
}

export const StudentEvolutionReportPanel: React.FC<StudentEvolutionReportPanelProps> = ({
  student,
  group,
  subject,
  subjectEvaluations,
  settings,
  uiLang,
  t,
  subjectAvg,
  readingAvg,
  writingAvg,
  onReportPrintModeChange,
  onNotify,
}) => {
  const [reportLang, setReportLang] = useState<Language>(() => subjectToLanguage(subject));
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reportsBySubject, setReportsBySubject] = useState<
    Record<SubjectId, StudentEvolutionReport | null>
  >({
    euskera: null,
    castellano: null,
  });

  // Sync default report language to the active subject when switching between Euskera and Castellano
  useEffect(() => {
    setReportLang(subjectToLanguage(subject));
    setError(null);
  }, [subject]);

  const report = reportsBySubject[subject];
  const setCurrentReport = (next: StudentEvolutionReport | null) => {
    setReportsBySubject((prev) => ({ ...prev, [subject]: next }));
  };

  const hasApiKey = Boolean(resolveGeminiApiKey(settings.geminiApiKey));
  const hasEvaluations = subjectEvaluations.length > 0;
  const subjectName = getSubjectLabel(subject, uiLang);

  const handleGenerate = async () => {
    if (!hasEvaluations) {
      setError(t.dossier.aiReportNeedEvals);
      return;
    }
    if (!hasApiKey) {
      setError(t.evaluate.missingKeyWarning);
      return;
    }

    setGenerating(true);
    setError(null);
    try {
      const result = await generateStudentEvolutionReportWithAI({
        userApiKey: settings.geminiApiKey,
        model: settings.geminiModel,
        reportLanguage: reportLang,
        subject,
        evaluations: subjectEvaluations,
        student,
        groupName: group ? `${group.name} (${group.academicYear})` : 'LH6',
      });
      setCurrentReport(result);
      onNotify(t.toasts.reportGenerated, 'success');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    } finally {
      setGenerating(false);
    }
  };

  const handlePrintBoletin = () => {
    onReportPrintModeChange(true);
    setTimeout(() => {
      window.print();
      setTimeout(() => onReportPrintModeChange(false), 300);
    }, 60);
  };

  const todayFormatted = new Date().toLocaleDateString(
    reportLang === 'eu' ? 'eu-ES' : 'es-ES',
    { year: 'numeric', month: 'long', day: 'numeric' }
  );

  return (
    <section className="space-y-4">
      {/* Trigger Bar (hidden in print) */}
      <div className="no-print rounded-2xl border border-indigo-200/80 bg-gradient-to-r from-indigo-50/70 via-white to-emerald-50/50 p-4 sm:p-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-600 to-emerald-600 text-white shadow-xs">
            <FileText className="h-5 w-5" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-extrabold text-slate-900">{t.dossier.aiReportTitle}</h3>
              <span
                className={`rounded-full border px-2.5 py-0.5 text-[10px] font-extrabold ${
                  subject === 'euskera'
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                    : 'border-indigo-200 bg-indigo-50 text-indigo-800'
                }`}
              >
                {subjectName}
              </span>
            </div>
            <p className="text-xs text-slate-600 mt-0.5">{t.dossier.aiReportSubtitle}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          {/* Report Language Switch */}
          <div className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white p-1">
            <button
              type="button"
              onClick={() => setReportLang('eu')}
              className={`rounded-lg px-2.5 py-1 text-[11px] font-bold transition ${
                reportLang === 'eu' ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              EU
            </button>
            <button
              type="button"
              onClick={() => setReportLang('es')}
              className={`rounded-lg px-2.5 py-1 text-[11px] font-bold transition ${
                reportLang === 'es' ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              ES
            </button>
          </div>

          <button
            type="button"
            disabled={generating || !hasEvaluations}
            onClick={handleGenerate}
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-emerald-600 px-4 py-2.5 text-xs font-bold text-white shadow-sm shadow-indigo-600/20 hover:from-indigo-700 hover:to-emerald-700 transition disabled:cursor-not-allowed disabled:opacity-50"
          >
            {generating ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                {t.dossier.aiReportGenerating}
              </>
            ) : (
              <>
                {report ? <RefreshCw className="h-3.5 w-3.5" /> : <Sparkles className="h-4 w-4" />}
                {report ? t.dossier.aiReportRegenerateBtn : t.dossier.aiReportBtn}
              </>
            )}
          </button>
        </div>
      </div>

      {error && (
        <div className="no-print flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-800">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-rose-600" />
          <span className="break-words">{error}</span>
        </div>
      )}

      {/* Editable A4 Formal Boletín Card */}
      {report && (
        <div className="boletin-print-sheet rounded-2xl border-2 border-indigo-200/90 bg-white shadow-sm overflow-hidden">
          {/* Action bar (hidden when printing) */}
          <div className="no-print flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-slate-50/80 px-5 py-3">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-100 px-2.5 py-0.5 text-[11px] font-bold text-indigo-800">
              <Sparkles className="h-3 w-3" />
              {subjectName} · {report.language.toUpperCase()}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handlePrintBoletin}
                className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-slate-800 transition"
              >
                <Printer className="h-3.5 w-3.5" />
                {t.dossier.aiReportPrintBtn}
              </button>
              <button
                type="button"
                onClick={() => setCurrentReport(null)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-200/60 hover:text-slate-700"
                aria-label={t.dossier.close}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Printable Formal A4 Content */}
          <div className="p-6 sm:p-8 space-y-6">
            {/* Official A4 Boletín Header */}
            <div className="border-b-2 border-indigo-600/80 pb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div className="space-y-1 flex-1">
                <p className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-indigo-700">
                  <BookOpenCheck className="h-3.5 w-3.5" />
                  {t.dossier.aiReportOfficialHeader} · {subjectName}
                </p>
                <input
                  type="text"
                  value={report.title}
                  onChange={(e) => setCurrentReport({ ...report, title: e.target.value })}
                  className="no-print w-full rounded-lg border border-transparent bg-transparent text-xl font-extrabold text-slate-900 hover:border-slate-200 focus:border-indigo-500 focus:bg-slate-50 px-1 py-0.5 focus:outline-none"
                />
                <h2 className="hidden print:block text-xl font-extrabold text-slate-900">
                  {report.title}
                </h2>
                <p className="text-xs text-slate-600">
                  <strong>{student.fullName}</strong> ({student.code}) · {t.dossier.printCourseLabel}{' '}
                  · {group?.name || 'LH6'} ({group?.academicYear || '2026-2027'}) ·{' '}
                  <strong>{subjectName}</strong> · {todayFormatted}
                </p>
              </div>

              {/* Compact Subject-Scoped Averages Strip inside Boletín */}
              <div className="flex items-center gap-3 text-center shrink-0">
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5">
                  <p className="text-[9px] font-bold uppercase text-slate-500">
                    {t.dossier.subjectAvgLabel}
                  </p>
                  <p className="text-sm font-extrabold text-slate-900">
                    {subjectAvg !== null ? `${subjectAvg.toFixed(1)}/10` : '—'}
                  </p>
                </div>
                <div className="rounded-xl border border-indigo-200 bg-indigo-50/60 px-3 py-1.5">
                  <p className="text-[9px] font-bold uppercase text-indigo-700">
                    {t.dossier.readingAvg}
                  </p>
                  <p className="text-sm font-extrabold text-indigo-950">
                    {readingAvg !== null ? `${readingAvg.toFixed(1)}/10` : '—'}
                  </p>
                </div>
                <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 px-3 py-1.5">
                  <p className="text-[9px] font-bold uppercase text-emerald-700">
                    {t.dossier.writingAvg}
                  </p>
                  <p className="text-sm font-extrabold text-emerald-950">
                    {writingAvg !== null ? `${writingAvg.toFixed(1)}/10` : '—'}
                  </p>
                </div>
              </div>
            </div>

            {/* 4 Editable Report Sections */}
            {(
              [
                ['temporalEvolution', t.dossier.aiReportSecTemporal],
                ['modalityAndTypologyAnalysis', t.dossier.aiReportSecModality],
                ['consolidatedStrengths', t.dossier.aiReportSecStrengths],
                ['improvementObjectives', t.dossier.aiReportSecObjectives],
              ] as const
            ).map(([field, heading]) => (
              <div key={field} className="print-avoid-break space-y-1.5">
                <h4 className="text-xs font-extrabold uppercase tracking-wider text-indigo-800">
                  {heading}
                </h4>
                <textarea
                  value={report[field]}
                  onChange={(e) => setCurrentReport({ ...report, [field]: e.target.value })}
                  rows={4}
                  className="no-print w-full rounded-xl border border-slate-200/90 bg-slate-50/50 p-3.5 text-sm leading-relaxed text-slate-800 focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/15"
                />
                <p className="hidden print:block text-sm leading-relaxed text-slate-800 whitespace-pre-wrap">
                  {report[field]}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
};
