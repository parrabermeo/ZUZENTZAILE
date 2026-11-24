import React, { useState } from 'react';
import { Link2, Loader2, AlertCircle, Plus } from 'lucide-react';
import { fetchGoogleDriveImageAsFile } from '../utils/googleDriveLoader';
import type { Translations } from '../i18n/translations';

interface GoogleDriveLinkInputProps {
  disabled?: boolean;
  onImageLoaded: (file: File) => void | Promise<void>;
  t: Translations;
  compact?: boolean;
}

export const GoogleDriveLinkInput: React.FC<GoogleDriveLinkInputProps> = ({
  disabled = false,
  onImageLoaded,
  t,
  compact = false,
}) => {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLoad = async () => {
    const trimmed = url.trim();
    if (!trimmed || loading || disabled) return;

    setLoading(true);
    setError(null);
    try {
      const file = await fetchGoogleDriveImageAsFile(trimmed);
      await onImageLoaded(file);
      setUrl('');
    } catch (err) {
      const code = err instanceof Error ? err.message : '';
      if (code === 'INVALID_DRIVE_LINK') {
        setError(t.evaluate.driveLinkInvalid);
      } else {
        setError(t.evaluate.driveLinkFetchError);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-1.5" onClick={(e) => e.stopPropagation()}>
      <div className={`flex flex-col sm:flex-row items-stretch sm:items-center gap-2 ${compact ? '' : 'pt-0.5'}`}>
        <div className="relative flex-1 min-w-0">
          <Link2 className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
          <input
            type="url"
            value={url}
            disabled={disabled || loading}
            onChange={(e) => {
              setUrl(e.target.value);
              if (error) setError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void handleLoad();
              }
            }}
            placeholder={t.evaluate.driveLinkPlaceholder}
            aria-label={t.evaluate.driveLinkLabel}
            className="w-full rounded-xl border border-slate-200 bg-white pl-8 pr-3 py-2 text-xs text-slate-800 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/15 disabled:opacity-50"
          />
        </div>
        <button
          type="button"
          disabled={disabled || loading || !url.trim()}
          onClick={() => void handleLoad()}
          className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl border border-indigo-200 bg-indigo-50/80 px-3.5 py-2 text-xs font-bold text-indigo-800 hover:bg-indigo-100 transition disabled:opacity-50 disabled:cursor-not-allowed min-h-[36px]"
        >
          {loading ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              <span>{t.evaluate.driveLinkLoading}</span>
            </>
          ) : (
            <>
              <Plus className="h-3.5 w-3.5" />
              <span>{t.evaluate.driveLinkAddBtn}</span>
            </>
          )}
        </button>
      </div>

      {error && (
        <p className="flex items-start gap-1.5 text-[11px] font-medium text-rose-700">
          <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5 text-rose-500" />
          <span>{error}</span>
        </p>
      )}
    </div>
  );
};
