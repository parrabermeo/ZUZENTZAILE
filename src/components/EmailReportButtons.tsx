import React, { useState } from 'react';
import { Mail, MailCheck, Copy, Check, AlertCircle, Pencil, Loader2 } from 'lucide-react';
import type { Language, LinguisticCorrection, SubjectId } from '../types';
import type { Translations } from '../i18n/translations';
import { buildStudentReportEmail } from '../utils/reportEmail';
import { sendEvaluationEmail } from '../services/gmailService';

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
  emailSentAt?: string;
  onEmailSent?: (sentAtIso: string) => void;
  onEditStudentEmail?: () => void;
  onNotify?: (message: string, type?: 'success' | 'info' | 'warning' | 'error') => void;
  t: Translations;
  compact?: boolean;
}

function formatSentStamp(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const hours = String(d.getHours()).padStart(2, '0');
    const mins = String(d.getMinutes()).padStart(2, '0');
    return `${day}/${month} ${hours}:${mins}`;
  } catch {
    return '';
  }
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
  emailSentAt,
  onEmailSent,
  onEditStudentEmail,
  onNotify,
  t,
  compact = false,
}) => {
  const [sending, setSending] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showMissingEmailAlert, setShowMissingEmailAlert] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [localSentAt, setLocalSentAt] = useState<string | undefined>(emailSentAt);

  const effectiveSentAt = emailSentAt || localSentAt;
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

  const handleSendEmail = async () => {
    if (sending) return;
    setSendError(null);

    if (!hasEmail) {
      setShowMissingEmailAlert(true);
      return;
    }

    setShowMissingEmailAlert(false);
    setSending(true);
    try {
      const result = await sendEvaluationEmail({
        to: built.to,
        subject: built.subject,
        body: built.body,
      });

      setLocalSentAt(result.sentAt);
      onEmailSent?.(result.sentAt);
      onNotify?.(t.toasts.emailSentSuccess(built.to), 'success');
    } catch (err) {
      const code =
        err && typeof err === 'object' && 'code' in err
          ? String((err as { code?: string }).code || '')
          : '';
      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
        setSending(false);
        return;
      }
      const msg = err instanceof Error ? err.message : String(err);
      setSendError(msg);
      onNotify?.(t.toasts.emailSendError(msg), 'error');
    } finally {
      setSending(false);
    }
  };

  const handleCopyReport = async () => {
    try {
      await navigator.clipboard.writeText(built.plainTextForClipboard);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch {
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

  const sentStamp = effectiveSentAt ? formatSentStamp(effectiveSentAt) : '';

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={sending}
          onClick={() => void handleSendEmail()}
          title={hasEmail ? built.to : t.dossier.noEmailWarning}
          className={`inline-flex items-center justify-center gap-1.5 rounded-xl font-bold transition min-h-[34px] disabled:opacity-70 disabled:cursor-wait ${
            compact ? 'px-2.5 py-1.5 text-[11px]' : 'px-3.5 py-2 text-xs'
          } ${
            !hasEmail
              ? 'border border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100'
              : effectiveSentAt
                ? 'border border-emerald-300 bg-emerald-600 text-white shadow-2xs hover:bg-emerald-700'
                : 'bg-indigo-600 text-white shadow-2xs hover:bg-indigo-700'
          }`}
        >
          {sending ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
              <span>{t.dossier.sendingEmailBtn}</span>
            </>
          ) : effectiveSentAt ? (
            <>
              <MailCheck className="h-3.5 w-3.5 shrink-0" />
              <span>{t.dossier.resendEmailBtn}</span>
            </>
          ) : (
            <>
              <Mail className="h-3.5 w-3.5 shrink-0" />
              <span>{t.dossier.sendEmailBtn}</span>
            </>
          )}
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

        {effectiveSentAt && (
          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-800">
            <MailCheck className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
            <span>
              {t.dossier.emailSentBadge}
              {sentStamp ? ` · ${sentStamp}` : ''}
            </span>
          </span>
        )}
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

      {sendError && (
        <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-[11px] text-rose-800">
          <AlertCircle className="h-3.5 w-3.5 text-rose-600 shrink-0 mt-0.5" />
          <span className="break-words font-medium">{t.toasts.emailSendError(sendError)}</span>
        </div>
      )}
    </div>
  );
};
