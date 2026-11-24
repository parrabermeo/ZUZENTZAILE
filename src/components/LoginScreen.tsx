import React from 'react';
import { BookOpenCheck, ShieldCheck, AlertCircle, Loader2, Cloud, Smartphone, Globe } from 'lucide-react';
import type { Language } from '../types';
import type { Translations } from '../i18n/translations';

interface LoginScreenProps {
  lang: Language;
  loading: boolean;
  signingIn: boolean;
  errorMessage: string | null;
  onSignInWithGoogle: () => void;
  onChangeLanguage: (lang: Language) => void;
  t: Translations;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({
  lang,
  loading,
  signingIn,
  errorMessage,
  onSignInWithGoogle,
  onChangeLanguage,
  t,
}) => {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-slate-50 via-indigo-50/40 to-emerald-50/40 px-4 py-8">
      {/* Top-right language toggle */}
      <div className="fixed top-4 right-4 z-10">
        <div
          className="inline-flex items-center rounded-xl border border-slate-200 bg-white/90 backdrop-blur-xs p-1 shadow-2xs"
          role="group"
          aria-label={t.sidebar.language}
        >
          <Globe className="ml-2 mr-1 h-3.5 w-3.5 text-slate-400" />
          <button
            type="button"
            onClick={() => onChangeLanguage('eu')}
            className={`rounded-lg px-2.5 py-1 text-xs font-bold transition-all ${
              lang === 'eu'
                ? 'bg-indigo-600 text-white shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            EU
          </button>
          <button
            type="button"
            onClick={() => onChangeLanguage('es')}
            className={`rounded-lg px-2.5 py-1 text-xs font-bold transition-all ${
              lang === 'es'
                ? 'bg-indigo-600 text-white shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            ES
          </button>
        </div>
      </div>

      <div className="w-full max-w-md rounded-3xl border border-slate-200/90 bg-white p-7 sm:p-9 shadow-xl shadow-slate-900/5 space-y-6">
        {/* Brand mark */}
        <div className="flex flex-col items-center text-center space-y-3">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-600 to-emerald-600 text-white shadow-lg shadow-indigo-600/25">
            <BookOpenCheck className="h-7 w-7" />
          </div>
          <div>
            <span className="inline-flex items-center rounded-full bg-indigo-50 border border-indigo-200/80 px-2.5 py-0.5 text-[11px] font-bold text-indigo-700">
              {t.curriculumBadge}
            </span>
            <h1 className="mt-2.5 text-xl sm:text-2xl font-extrabold tracking-tight text-slate-900">
              {t.appName} LH6
            </h1>
            <p className="mt-1.5 text-xs sm:text-sm leading-relaxed text-slate-500">
              {t.auth.subtitle}
            </p>
          </div>
        </div>

        {/* Cloud sync feature pills */}
        <div className="grid grid-cols-2 gap-2.5">
          <div className="flex items-center gap-2 rounded-xl border border-slate-200/80 bg-slate-50/70 px-3 py-2.5">
            <Cloud className="h-4 w-4 text-indigo-600 shrink-0" />
            <span className="text-[11px] font-semibold text-slate-700 leading-tight">
              {t.auth.cloudSyncFeature}
            </span>
          </div>
          <div className="flex items-center gap-2 rounded-xl border border-slate-200/80 bg-slate-50/70 px-3 py-2.5">
            <Smartphone className="h-4 w-4 text-emerald-600 shrink-0" />
            <span className="text-[11px] font-semibold text-slate-700 leading-tight">
              {t.auth.mobileCameraFeature}
            </span>
          </div>
        </div>

        {/* Error banner (unauthorized account or auth failure) */}
        {errorMessage && (
          <div className="flex items-start gap-2.5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-800">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-rose-600" />
            <span className="leading-relaxed font-medium break-words">{errorMessage}</span>
          </div>
        )}

        {/* Primary Google Sign-In CTA */}
        {loading ? (
          <div className="flex items-center justify-center gap-2.5 py-4 text-xs font-semibold text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin text-indigo-600" />
            <span>{t.auth.checkingSession}</span>
          </div>
        ) : (
          <button
            type="button"
            disabled={signingIn}
            onClick={onSignInWithGoogle}
            className="w-full min-h-[48px] inline-flex items-center justify-center gap-3 rounded-2xl border border-slate-300 bg-white px-5 py-3 text-sm font-bold text-slate-800 shadow-sm hover:bg-slate-50 hover:border-indigo-400 active:scale-[0.99] transition disabled:opacity-60"
          >
            {signingIn ? (
              <Loader2 className="h-5 w-5 animate-spin text-indigo-600 shrink-0" />
            ) : (
              <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  fill="#4285F4"
                  d="M23.49 12.27c0-.79-.07-1.54-.2-2.27H12v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z"
                />
                <path
                  fill="#34A853"
                  d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09C3.26 21.3 7.31 24 12 24z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.27 14.29c-.25-.72-.38-1.49-.38-2.29s.14-1.57.38-2.29V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.98-3.09z"
                />
                <path
                  fill="#EA4335"
                  d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.98 3.09c.95-2.85 3.6-4.96 6.73-4.96z"
                />
              </svg>
            )}
            <span>{signingIn ? t.auth.signingIn : t.auth.signInGoogleBtn}</span>
          </button>
        )}

        <div className="flex items-center justify-center gap-1.5 text-[11px] text-slate-400 pt-1">
          <ShieldCheck className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
          <span>{t.auth.privateAccessNote}</span>
        </div>
      </div>
    </div>
  );
};
