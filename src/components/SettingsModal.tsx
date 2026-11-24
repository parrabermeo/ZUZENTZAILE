import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Sparkles,
  KeyRound,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Database,
  ChevronDown,
  ChevronUp,
  Download,
  Upload,
  ShieldCheck,
  HardDrive,
  Zap,
  Brain,
  Link2,
  Unlink,
  RefreshCw,
  FolderOpen,
  LogOut,
  Cloud,
} from 'lucide-react';
import type {
  AppSettings,
  BackupPayload,
  FirebaseRuntimeConfig,
  GeminiModelId,
  StorageMode,
} from '../types';
import type { Translations } from '../i18n/translations';
import {
  GEMINI_MODELS,
  getEnvGeminiApiKey,
  resolveGeminiApiKey,
  testGeminiConnection,
} from '../services/geminiService';
import {
  parseAndValidateBackupJson,
  resolveFirebaseConfig,
  type WorkspaceState,
} from '../services/storageService';
import {
  IDB_DB_NAME,
  IDB_DB_VERSION,
  getIndexedDbStorageStats,
  type IdbStorageStats,
} from '../services/indexedDbService';
import {
  isOpenFilePickerSupported,
  pickMasterFileWithNativePicker,
  type PcAutoSaveState,
} from '../services/fileSyncService';

interface SettingsModalProps {
  open: boolean;
  settings: AppSettings;
  storageMode: StorageMode;
  workspaceState: WorkspaceState;
  pcAutoSave: PcAutoSaveState;
  authUserEmail?: string | null;
  groupCount: number;
  studentCount: number;
  onClose: () => void;
  onSave: (next: AppSettings) => void;
  onExportBackup: () => void;
  onImportBackup: (payload: BackupPayload, mode: 'replace' | 'merge') => void;
  onLinkPcMasterFile: () => Promise<void>;
  onReauthorizeOrSavePcFile: () => Promise<void>;
  onUnlinkPcMasterFile: () => Promise<void>;
  onSignOut?: () => Promise<void>;
  t: Translations;
}

const EMPTY_FB: FirebaseRuntimeConfig = {
  apiKey: '',
  authDomain: '',
  projectId: '',
  storageBucket: '',
  messagingSenderId: '',
  appId: '',
};

export const SettingsModal: React.FC<SettingsModalProps> = ({
  open,
  settings,
  storageMode,
  workspaceState,
  pcAutoSave,
  authUserEmail,
  groupCount,
  studentCount,
  onClose,
  onSave,
  onExportBackup,
  onImportBackup,
  onLinkPcMasterFile,
  onReauthorizeOrSavePcFile,
  onUnlinkPcMasterFile,
  onSignOut,
  t,
}) => {
  const backupFileRef = useRef<HTMLInputElement>(null);

  const [model, setModel] = useState<GeminiModelId>(settings.geminiModel);
  const [apiKey, setApiKey] = useState(settings.geminiApiKey);
  const [showKey, setShowKey] = useState(false);
  const [showFirebase, setShowFirebase] = useState(false);
  const [fbConfig, setFbConfig] = useState<FirebaseRuntimeConfig>(
    settings.firebaseConfig || EMPTY_FB
  );
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [linkingPcFile, setLinkingPcFile] = useState(false);

  // Integrated IndexedDB Storage & Backup State
  const [idbStats, setIdbStats] = useState<IdbStorageStats>({
    engine: 'indexeddb',
    dbName: IDB_DB_NAME,
    schemaVersion: IDB_DB_VERSION,
    usedBytes: 0,
    usedMb: 0,
    quotaMb: null,
    percent: 0,
    persistentGranted: false,
    evaluationCount: 0,
    imageCount: 0,
  });
  const [parsedBackup, setParsedBackup] = useState<BackupPayload | null>(null);
  const [backupError, setBackupError] = useState<string | null>(null);
  const [importMode, setImportMode] = useState<'replace' | 'merge'>('replace');

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setModel(settings.geminiModel);
    setApiKey(settings.geminiApiKey);
    setFbConfig(settings.firebaseConfig || EMPTY_FB);
    setTestResult(null);
    setParsedBackup(null);
    setBackupError(null);
    getIndexedDbStorageStats(workspaceState).then((stats) => {
      if (!cancelled) setIdbStats(stats);
    });
    return () => {
      cancelled = true;
    };
  }, [open, settings, workspaceState, groupCount, studentCount]);

  if (!open) return null;

  const hasEnvKey = Boolean(getEnvGeminiApiKey());
  const effectiveKey = resolveGeminiApiKey(apiKey);
  const hasFirebase = Boolean(resolveFirebaseConfig({ ...settings, firebaseConfig: fbConfig }));

  const isPcLinked =
    pcAutoSave.status === 'saved' ||
    pcAutoSave.status === 'linked-idle' ||
    pcAutoSave.status === 'saving' ||
    pcAutoSave.status === 'needs-permission' ||
    pcAutoSave.status === 'error';

  const formattedLastSavedTime = pcAutoSave.lastSavedAt
    ? new Date(pcAutoSave.lastSavedAt).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      })
    : null;

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    const res = await testGeminiConnection(apiKey, model);
    setTesting(false);
    if (res.ok) {
      setTestResult({ ok: true, message: t.settings.connectionOk });
    } else {
      setTestResult({ ok: false, message: `${t.settings.connectionError} ${res.error}` });
    }
  };

  const handleLinkClick = async () => {
    setLinkingPcFile(true);
    try {
      await onLinkPcMasterFile();
    } finally {
      setLinkingPcFile(false);
    }
  };

  const handleLoadMasterFileClick = async () => {
    setBackupError(null);
    setParsedBackup(null);

    if (isOpenFilePickerSupported()) {
      const picked = await pickMasterFileWithNativePicker();
      if (picked.cancelled) return;
      if (picked.ok && picked.text) {
        const valid = parseAndValidateBackupJson(picked.text);
        if (!valid) {
          setBackupError(t.backup.invalidFile);
        } else {
          setParsedBackup(valid);
        }
        return;
      }
    }

    // Fallback to standard hidden file input
    backupFileRef.current?.click();
  };

  const handleBackupFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBackupError(null);
    setParsedBackup(null);

    try {
      const text = await file.text();
      const valid = parseAndValidateBackupJson(text);
      if (!valid) {
        setBackupError(t.backup.invalidFile);
      } else {
        setParsedBackup(valid);
      }
    } catch {
      setBackupError(t.backup.invalidFile);
    } finally {
      e.target.value = '';
    }
  };

  const handleConfirmRestore = () => {
    if (!parsedBackup) return;
    onImportBackup(parsedBackup, importMode);
    setParsedBackup(null);
    setBackupError(null);
    setTimeout(() => {
      getIndexedDbStorageStats().then(setIdbStats);
    }, 250);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanedFb =
      fbConfig.apiKey.trim() && fbConfig.projectId.trim()
        ? {
            apiKey: fbConfig.apiKey.trim(),
            authDomain: fbConfig.authDomain.trim(),
            projectId: fbConfig.projectId.trim(),
            storageBucket: fbConfig.storageBucket.trim(),
            messagingSenderId: fbConfig.messagingSenderId.trim(),
            appId: fbConfig.appId.trim(),
          }
        : undefined;

    onSave({
      ...settings,
      geminiModel: model,
      geminiApiKey: apiKey.trim(),
      firebaseConfig: cleanedFb,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs" onClick={onClose} />
      <div className="relative z-10 w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white shadow-2xl border border-slate-200">
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-start justify-between border-b border-slate-100 bg-white/95 backdrop-blur-xs px-6 py-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900">{t.settings.title}</h2>
            <p className="text-xs text-slate-500 mt-0.5">{t.settings.subtitle}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* 0. Authenticated Google Account & Discreet Sign Out */}
          {authUserEmail && onSignOut && (
            <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
                  <Cloud className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] font-bold text-slate-500">{t.auth.accountSection}</p>
                  <p className="truncate text-xs font-extrabold text-slate-900">
                    {t.auth.signedInAs} <span className="text-indigo-700">{authUserEmail}</span>
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={async () => {
                  onClose();
                  await onSignOut();
                }}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:border-rose-300 hover:bg-rose-50 hover:text-rose-700 transition"
              >
                <LogOut className="h-3.5 w-3.5" />
                <span>{t.auth.signOutBtn}</span>
              </button>
            </section>
          )}

          {/* 1. Data Shield: IndexedDB (EbaluazioaLH6_DB) + Real-Time PC Auto-Save + Instant Backup */}
          <section className="space-y-4 rounded-2xl border border-indigo-200/80 bg-gradient-to-br from-slate-50/90 via-white to-indigo-50/40 p-4 sm:p-5">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2 text-sm font-extrabold text-slate-900">
                <ShieldCheck className="h-4 w-4 text-indigo-600 shrink-0" />
                <span>{t.settings.securitySection}</span>
              </div>
              <span className="rounded-full bg-emerald-100/90 px-2.5 py-0.5 text-[10px] font-bold text-emerald-800">
                {t.settings.storageUnlimitedBadge}
              </span>
            </div>

            <p className="text-xs leading-relaxed text-slate-600">{t.settings.securityDesc}</p>

            {/* IndexedDB Unlimited Storage Status Card */}
            <div className="rounded-xl border border-slate-200/90 bg-white p-3.5 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="inline-flex items-center gap-1.5 font-bold text-slate-800">
                  <Database className="h-3.5 w-3.5 text-emerald-600" />
                  {t.settings.storageUsageLabel}
                </span>
                <span className="font-mono text-[11px] font-bold text-slate-800">
                  {idbStats.usedMb.toFixed(2)} MB
                  {idbStats.quotaMb ? ` / ${(idbStats.quotaMb / 1024).toFixed(1)} GB` : ''}
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-emerald-500 transition-all duration-300"
                  style={{ width: `${Math.max(Math.min(idbStats.percent, 100), 3)}%` }}
                />
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
                <span>
                  {t.settings.storageMetaSummary(idbStats.evaluationCount, idbStats.imageCount)}
                </span>
                {idbStats.migratedFromLocalStorageAt && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                    <CheckCircle2 className="h-3 w-3" />
                    {t.settings.storageMigratedBadge}
                  </span>
                )}
              </div>
            </div>

            {/* Real-Time PC Physical File Auto-Save (File System Access API) */}
            <div className="rounded-xl border border-emerald-200/90 bg-emerald-50/40 p-3.5 space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="flex items-center gap-2 text-xs font-extrabold text-slate-900">
                  <HardDrive className="h-4 w-4 text-emerald-600 shrink-0" />
                  <span>{t.settings.pcAutoSaveTitle}</span>
                </div>
                {isPcLinked && (
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                      pcAutoSave.status === 'needs-permission'
                        ? 'bg-amber-100 text-amber-800'
                        : pcAutoSave.status === 'error'
                          ? 'bg-rose-100 text-rose-800'
                          : 'bg-emerald-100 text-emerald-800'
                    }`}
                  >
                    {pcAutoSave.status === 'saving' ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <CheckCircle2 className="h-3 w-3" />
                    )}
                    {pcAutoSave.status === 'needs-permission'
                      ? t.settings.pcFileNeedsPermShort
                      : pcAutoSave.status === 'saving'
                        ? t.settings.pcFileSavingShort
                        : t.settings.pcFileSavedShort}
                  </span>
                )}
              </div>

              <p className="text-[11px] leading-relaxed text-slate-600">
                {t.settings.pcAutoSaveDesc}
              </p>

              {!pcAutoSave.supported ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
                  {t.settings.pcFileUnsupportedHint}
                </div>
              ) : isPcLinked ? (
                <div className="space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-emerald-200 bg-white px-3 py-2 text-xs">
                    <div className="flex items-center gap-2 min-w-0">
                      <Link2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                      <span className="font-mono font-bold text-slate-800 truncate">
                        {pcAutoSave.fileName}
                      </span>
                    </div>
                    {formattedLastSavedTime && (
                      <span className="text-[11px] text-emerald-700 font-medium shrink-0">
                        {t.settings.pcFileLastSavedAt(formattedLastSavedTime)}
                      </span>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void onReauthorizeOrSavePcFile()}
                      disabled={pcAutoSave.status === 'saving'}
                      className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold transition ${
                        pcAutoSave.status === 'needs-permission'
                          ? 'bg-amber-600 text-white hover:bg-amber-700 shadow-xs'
                          : 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-xs'
                      }`}
                    >
                      <RefreshCw
                        className={`h-3.5 w-3.5 ${pcAutoSave.status === 'saving' ? 'animate-spin' : ''}`}
                      />
                      {pcAutoSave.status === 'needs-permission'
                        ? t.settings.reauthorizePcBtn
                        : t.settings.saveNowPcBtn}
                    </button>

                    <button
                      type="button"
                      onClick={() => void handleLinkClick()}
                      disabled={linkingPcFile}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
                    >
                      <FolderOpen className="h-3.5 w-3.5 text-slate-500" />
                      {t.settings.changePcFileBtn}
                    </button>

                    <button
                      type="button"
                      onClick={() => void onUnlinkPcMasterFile()}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-white px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-50 transition"
                    >
                      <Unlink className="h-3.5 w-3.5" />
                      {t.settings.unlinkPcFileBtn}
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => void handleLinkClick()}
                  disabled={linkingPcFile}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white shadow-sm shadow-emerald-600/20 hover:bg-emerald-700 transition disabled:opacity-60"
                >
                  {linkingPcFile ? (
                    <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                  ) : (
                    <Link2 className="h-4 w-4 shrink-0" />
                  )}
                  {t.settings.linkPcFileBtn}
                </button>
              )}
            </div>

            {/* Instant Manual Backup & Load Master File (.json) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={onExportBackup}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-bold text-white shadow-sm shadow-indigo-600/20 hover:bg-indigo-700 transition"
              >
                <Download className="h-4 w-4 shrink-0" />
                {t.settings.downloadBackupBtn}
              </button>

              <input
                ref={backupFileRef}
                type="file"
                accept=".json,application/json"
                onChange={handleBackupFileChange}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => void handleLoadMasterFileClick()}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-xs font-bold text-slate-800 shadow-2xs hover:border-indigo-400 hover:bg-indigo-50/40 transition"
              >
                <Upload className="h-4 w-4 shrink-0 text-indigo-600" />
                {t.settings.loadMasterFileBtn}
              </button>
            </div>
            <p className="text-[11px] text-slate-500">
              {t.settings.loadMasterFileHint} {t.settings.manualBackupHint}
            </p>

            {backupError && (
              <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{backupError}</span>
              </div>
            )}

            {parsedBackup && (
              <div className="space-y-3 rounded-xl border border-emerald-200 bg-emerald-50/70 p-3.5">
                <div className="flex items-center gap-2 text-xs font-bold text-emerald-900">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                  <span>
                    {t.backup.previewLoaded(
                      parsedBackup.groups.length,
                      parsedBackup.students.length,
                      parsedBackup.exportedAt.slice(0, 10)
                    )}
                  </span>
                </div>

                <div className="space-y-1.5 text-xs text-slate-700">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="settingsImportMode"
                      checked={importMode === 'replace'}
                      onChange={() => setImportMode('replace')}
                      className="accent-indigo-600"
                    />
                    <span>{t.backup.modeReplace}</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="settingsImportMode"
                      checked={importMode === 'merge'}
                      onChange={() => setImportMode('merge')}
                      className="accent-indigo-600"
                    />
                    <span>{t.backup.modeMerge}</span>
                  </label>
                </div>

                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setParsedBackup(null)}
                    className="rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-white/80"
                  >
                    {t.settings.close}
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmRestore}
                    className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white hover:bg-slate-800 transition"
                  >
                    {t.backup.confirmImport}
                  </button>
                </div>
              </div>
            )}
          </section>

          <hr className="border-slate-100" />

          {/* 2. AI Engine Section */}
          <section className="space-y-4">
            <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
              <Sparkles className="h-4 w-4 text-indigo-600" />
              <span>{t.settings.aiSection}</span>
            </div>

            {/* Discreet Model Selector */}
            <div className="space-y-2.5">
              <label className="block text-xs font-semibold text-slate-700">
                {t.settings.modelLabel}
              </label>

              <select
                value={model}
                onChange={(e) => setModel(e.target.value as GeminiModelId)}
                className="w-full rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 py-2.5 text-xs font-bold text-slate-800 focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              >
                <option value="gemini-4-hydrogen">
                  gemini-4-hydrogen — {t.settings.defaultMediumPill}
                </option>
                <option value="gemini-4-neon">gemini-4-neon — Gemini 4 Neon</option>
                <option value="gemini-3.8-flash">gemini-3.8-flash — Gemini 3.8 Flash</option>
              </select>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                {GEMINI_MODELS.map((opt) => {
                  const selected = model === opt.id;
                  const isHydrogen = opt.id === 'gemini-4-hydrogen';
                  const isFlash = opt.id === 'gemini-3.8-flash';
                  const Icon = isHydrogen || isFlash ? Zap : Brain;
                  const description = isHydrogen
                    ? t.settings.hydrogenDesc
                    : isFlash
                      ? t.settings.flashDesc
                      : t.settings.neonDesc;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setModel(opt.id)}
                      className={`flex flex-col items-start rounded-xl border p-3 text-left transition-all ${
                        selected
                          ? 'border-indigo-500 bg-indigo-50/60 ring-1 ring-indigo-500'
                          : 'border-slate-200 bg-white hover:border-slate-300'
                      }`}
                    >
                      <span className="flex items-center gap-1.5 text-xs font-bold text-slate-900">
                        <Icon
                          className={`h-3.5 w-3.5 shrink-0 ${selected ? 'text-indigo-600' : 'text-slate-400'}`}
                        />
                        {opt.name}
                      </span>
                      <code className="mt-1 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-mono text-slate-600">
                        {opt.id}
                      </code>
                      {isHydrogen && (
                        <span className="mt-1.5 inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                          {t.settings.defaultMediumPill}
                        </span>
                      )}
                      <p className="mt-1.5 text-[11px] leading-relaxed text-slate-600">
                        {description}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* API Key Input */}
            <div className="space-y-2">
              <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                <KeyRound className="h-3.5 w-3.5 text-slate-400" />
                {t.settings.apiKeyLabel}
              </label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <input
                    type={showKey ? 'text' : 'password'}
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder={
                      hasEnvKey ? 'VITE_GEMINI_API_KEY (active)' : t.settings.apiKeyPlaceholder
                    }
                    className="w-full rounded-xl border border-slate-200 bg-slate-50/60 px-3.5 py-2.5 pr-10 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                  />
                  <button
                    type="button"
                    onClick={() => setShowKey((v) => !v)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-400 hover:text-slate-600"
                    tabIndex={-1}
                  >
                    {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <button
                  type="button"
                  onClick={handleTest}
                  disabled={testing || !effectiveKey}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {testing ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      {t.settings.testing}
                    </>
                  ) : (
                    t.settings.testConnection
                  )}
                </button>
              </div>
              <p className="text-[11px] text-slate-500">
                {hasEnvKey ? t.settings.envKeyActive : t.settings.envKeyMissing}
              </p>

              {testResult && (
                <div
                  className={`flex items-start gap-2 rounded-xl border px-3 py-2.5 text-xs ${
                    testResult.ok
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                      : 'border-rose-200 bg-rose-50 text-rose-800'
                  }`}
                >
                  {testResult.ok ? (
                    <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5 text-emerald-600" />
                  ) : (
                    <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-rose-600" />
                  )}
                  <span className="break-words">{testResult.message}</span>
                </div>
              )}
            </div>
          </section>

          <hr className="border-slate-100" />

          {/* 3. Persistence Section */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
                <Database className="h-4 w-4 text-emerald-600" />
                <span>{t.settings.persistenceSection}</span>
              </div>
              <span className="rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700">
                {storageMode === 'firestore'
                  ? 'Firestore + IndexedDB'
                  : storageMode === 'indexeddb'
                    ? `IndexedDB (${IDB_DB_NAME} v${IDB_DB_VERSION})`
                    : storageMode === 'local-fallback'
                      ? 'Local Fallback'
                      : 'LocalStorage'}
              </span>
            </div>
            <p className="text-xs leading-relaxed text-slate-500">{t.settings.persistenceDesc}</p>

            {/* Optional Firebase config accordion */}
            <div className="rounded-xl border border-slate-200 overflow-hidden">
              <button
                type="button"
                onClick={() => setShowFirebase((v) => !v)}
                className="flex w-full items-center justify-between bg-slate-50/80 px-4 py-2.5 text-left text-xs font-semibold text-slate-700 hover:bg-slate-100/70"
              >
                <span>{t.settings.firebaseToggle}</span>
                {showFirebase ? (
                  <ChevronUp className="h-4 w-4 text-slate-400" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-slate-400" />
                )}
              </button>
              {showFirebase && (
                <div className="p-4 bg-white space-y-2.5 border-t border-slate-100">
                  <p className="text-[11px] text-slate-500">
                    {hasFirebase
                      ? t.settings.firebaseConfigured
                      : t.settings.firebaseNotConfigured}
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {(
                      [
                        ['projectId', 'Project ID'],
                        ['apiKey', 'Firebase API Key'],
                        ['authDomain', 'Auth Domain'],
                        ['appId', 'App ID'],
                      ] as const
                    ).map(([field, label]) => (
                      <div key={field}>
                        <label className="block text-[11px] font-medium text-slate-600 mb-1">
                          {label}
                        </label>
                        <input
                          type="text"
                          value={fbConfig[field]}
                          onChange={(e) =>
                            setFbConfig((prev) => ({ ...prev, [field]: e.target.value }))
                          }
                          className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-800 focus:border-indigo-500 focus:outline-none"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* Footer actions */}
          <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100"
            >
              {t.settings.close}
            </button>
            <button
              type="submit"
              className="rounded-xl bg-slate-900 px-5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-slate-800 transition"
            >
              {t.settings.save}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
