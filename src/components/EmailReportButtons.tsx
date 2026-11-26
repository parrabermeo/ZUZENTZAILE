import React, { useState } from 'react';
import { Mail, Copy, Check, AlertCircle, Pencil } from 'lucide-react';
import type { Language, LinguisticCorrection, SubjectId } from '../types';
import type { Translations } from '../i18n/translations';
import { buildStudentReportEmail } from '../utils/reportEmail';

interface EmailReportButtonsProps {
  studentName: string;
  studentEmail?: string;
  asignatura: SubjectId;
  testTitle: string;
  language: Language;
  strengths: string[];
  improvements: string[];
  linguisticCorrections: LinguisticCorrection[];
  feedbackSummary: string;
  onEditStudentEmail?: () => void;
  t: Translations;
  compact?: boolean;
}

export const EmailReportButtons: React.FC<EmailReportButtonsProps> = ({
  studentName,
  studentEmail,
  asignatura,
  testTitle,
  language,
  strengths,
  improvements,
  linguisticCorrections,
  feedbackSummary,
  onEditStudentEmail,
  t,
  compact = false,
}) => {
  const [copied, setCopied] = useState(false);
  const [showMissingEmailAlert, setShowMissingEmailAlert] = useState(false);

  const hasEmail = Boolean(studentEmail?.trim());

  const built = buildStudentReportEmail({
    studentName,
    studentEmail,
    asignatura,
    testTitle,
    language,
    strengths,
    improvements,
    linguisticCorrections,
    feedbackSummary,
  });

  const handleSendEmail = () => {
    if (!hasEmail) {
      setShowMissingEmailAlert(true);
      return;
    }
    setShowMissingEmailAlert(false);
    window.location.href = built.mailtoHref;
  };

  const handleCopyReport = async () => {
    try {
      await navigator.clipboard.writeText(built.plainTextForClipboard);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch {
      // Clipboard fallback via temporary textarea
      try {
        const el = document.createElement('textarea');
        el.value = built.plainTextForClipboard;
        el.style.position = 'fixed';
        el.style.opacity = '0';
        document.body.appendChild(el);
        el.select();
        document.execCommand('copy');
        document.body.removeChild(el);
        setCopied(true);
        setTimeout(() => setCopied(false), 2200);
      } catch {
        // Ignore clipboard errors
      }
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={handleSendEmail}
          title={hasEmail ? built.to : t.dossier.noEmailWarning}
          className={`inline-flex items-center justify-center gap-1.5 rounded-xl font-bold transition min-h-[34px] ${
            compact ? 'px-2.5 py-1.5 text-[11px]' : 'px-3.5 py-2 text-xs'
          } ${
            hasEmail
              ? 'bg-indigo-600 text-white shadow-2xs hover:bg-indigo-700'
              : 'border border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100'
          }`}
        >
          <Mail className="h-3.5 w-3.5 shrink-0" />
          <span>{t.dossier.sendEmailBtn}</span>
        </button>

        <button
          type="button"
          onClick={() => void handleCopyReport()}
          className={`inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white font-semibold text-slate-700 hover:border-indigo-300 hover:bg-indigo-50/50 hover:text-indigo-800 transition min-h-[34px] ${
            compact ? 'px-2.5 py-1.5 text-[11px]' : 'px-3 py-2 text-xs'
          }`}
        >
          {copied ? (
            <>
              <Check className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
              <span className="text-emerald-700">{t.dossier.copiedReportBtn}</span>
            </>
          ) : (
            <>
              <Copy className="h-3.5 w-3.5 shrink-0 text-slate-500" />
              <span>{t.dossier.copyReportBtn}</span>
            </>
          )}
        </button>
      </div>

      {showMissingEmailAlert && !hasEmail && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-900">
          <span className="inline-flex items-center gap-1.5 font-semibold">
            <AlertCircle className="h-3.5 w-3.5 text-amber-600 shrink-0" />
            {t.dossier.noEmailWarning}
          </span>
          {onEditStudentEmail && (
            <button
              type="button"
              onClick={() => {
                setShowMissingEmailAlert(false);
                onEditStudentEmail();
              }}
              className="inline-flex items-center gap-1 rounded-lg bg-amber-600 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-amber-700 transition"
            >
              <Pencil className="h-3 w-3" />
              {t.dossier.addEmailAction}
            </button>
          )}
        </div>
      )}
    </div>
  );
};
