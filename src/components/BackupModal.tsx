import React, { useEffect, useRef, useState } from 'react';
import { X, Download, Upload, CheckCircle2, AlertCircle, FileJson, Database } from 'lucide-react';
import type { BackupPayload } from '../types';
import type { Translations } from '../i18n/translations';
import { parseAndValidateBackupJson } from '../services/storageService';
import {
  IDB_DB_NAME,
  IDB_DB_VERSION,
  getIndexedDbStorageStats,
  type IdbStorageStats,
} from '../services/indexedDbService';

interface BackupModalProps {
  open: boolean;
  groupCount: number;
  studentCount: number;
  onClose: () => void;
  onExport: () => void;
  onImport: (payload: BackupPayload, mode: 'replace' | 'merge') => void;
  t: Translations;
}

export const BackupModal: React.FC<BackupModalProps> = ({
  open,
  groupCount,
  studentCount,
  onClose,
  onExport,
  onImport,
  t,
}) => {
  const fileRef = useRef<HTMLInputElement>(null);
  const [parsedBackup, setParsedBackup] = useState<BackupPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<'replace' | 'merge'>('replace');
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

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    getIndexedDbStorageStats().then((stats) => {
      if (!cancelled) setIdbStats(stats);
    });
    return () => {
      cancelled = true;
    };
  }, [open, groupCount, studentCount]);

  if (!open) return null;

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setParsedBackup(null);

    try {
      const text = await file.text();
      const valid = parseAndValidateBackupJson(text);
      if (!valid) {
        setError(t.backup.invalidFile);
      } else {
        setParsedBackup(valid);
      }
    } catch {
      setError(t.backup.invalidFile);
    } finally {
      e.target.value = '';
    }
  };

  const handleConfirmImport = () => {
    if (!parsedBackup) return;
    onImport(parsedBackup, mode);
    setParsedBackup(null);
    setError(null);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs" onClick={onClose} />
      <div className="relative z-10 w-full max-w-lg rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden">
        <div className="flex items-start justify-between border-b border-slate-100 px-6 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-teal-50 text-teal-700">
              <FileJson className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">{t.backup.title}</h2>
              <p className="text-xs text-slate-500">{t.backup.subtitle}</p>
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

        <div className="p-6 space-y-5">
          {/* IndexedDB Storage Usage Bar */}
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="inline-flex items-center gap-1.5 font-bold text-slate-700">
                <Database className="h-3.5 w-3.5 text-emerald-600" />
                {t.settings.storageUsageLabel}
              </span>
              <span className="font-mono text-[11px] font-bold text-slate-800">
                {idbStats.usedMb.toFixed(2)} MB
                {idbStats.quotaMb ? ` / ${(idbStats.quotaMb / 1024).toFixed(1)} GB` : ''}
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200/80">
              <div
                className="h-full rounded-full bg-emerald-500 transition-all"
                style={{ width: `${Math.max(Math.min(idbStats.percent, 100), 3)}%` }}
              />
            </div>
          </div>

          {/* Export Card */}
          <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 space-y-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900">{t.backup.exportTitle}</h3>
              <p className="text-xs text-slate-600 mt-0.5">
                {t.backup.exportDesc(groupCount, studentCount)}
              </p>
            </div>
            <button
              type="button"
              onClick={onExport}
              className="inline-flex items-center gap-2 rounded-xl bg-teal-600 px-4 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-teal-700 transition"
            >
              <Download className="h-4 w-4" />
              {t.backup.exportBtn}
            </button>
          </div>

          {/* Import Card */}
          <div className="rounded-xl border border-slate-200 p-4 space-y-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900">{t.backup.importTitle}</h3>
              <p className="text-xs text-slate-600 mt-0.5">{t.backup.importDesc}</p>
            </div>

            <input
              ref={fileRef}
              type="file"
              accept=".json,application/json"
              onChange={handleFileChange}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50/50 px-4 py-4 text-xs font-semibold text-slate-700 transition hover:border-teal-400 hover:bg-teal-50/40 hover:text-teal-800"
            >
              <Upload className="h-4 w-4" />
              {t.backup.selectFile}
            </button>

            {error && (
              <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {parsedBackup && (
              <div className="space-y-3 rounded-xl border border-emerald-200 bg-emerald-50/60 p-3.5">
                <div className="flex items-center gap-2 text-xs font-semibold text-emerald-800">
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
                      name="importMode"
                      checked={mode === 'replace'}
                      onChange={() => setMode('replace')}
                      className="accent-teal-600"
                    />
                    <span>{t.backup.modeReplace}</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="importMode"
                      checked={mode === 'merge'}
                      onChange={() => setMode('merge')}
                      className="accent-teal-600"
                    />
                    <span>{t.backup.modeMerge}</span>
                  </label>
                </div>

                <button
                  type="button"
                  onClick={handleConfirmImport}
                  className="w-full rounded-xl bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 transition"
                >
                  {t.backup.confirmImport}
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-end border-t border-slate-100 bg-slate-50/60 px-6 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-200/60"
          >
            {t.backup.close}
          </button>
        </div>
      </div>
    </div>
  );
};
