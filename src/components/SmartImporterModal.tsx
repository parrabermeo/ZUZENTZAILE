import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  X,
  Upload,
  Sparkles,
  Check,
  AlertTriangle,
  FileSpreadsheet,
  Users,
  Tag,
} from 'lucide-react';
import type { ClassGroup, Language, Student } from '../types';
import { PRESET_TAGS, getTagDisplay, type Translations } from '../i18n/translations';
import {
  createStudentRecord,
  parseSmartStudentInput,
  type ParsedImportCandidate,
} from '../utils/studentImporter';

interface SmartImporterModalProps {
  open: boolean;
  groups: ClassGroup[];
  defaultGroupId: string;
  existingStudents: Student[];
  lang: Language;
  onClose: () => void;
  onImport: (newStudents: Student[]) => void;
  t: Translations;
}

export const SmartImporterModal: React.FC<SmartImporterModalProps> = ({
  open,
  groups,
  defaultGroupId,
  existingStudents,
  lang,
  onClose,
  onImport,
  t,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [targetGroupId, setTargetGroupId] = useState(defaultGroupId);
  const [rawText, setRawText] = useState('');
  const [defaultTags, setDefaultTags] = useState<string[]>([]);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<ParsedImportCandidate[]>([]);

  useEffect(() => {
    if (open) {
      setTargetGroupId(defaultGroupId || groups[0]?.id || '');
      setRawText('');
      setDefaultTags([]);
      setUploadedFileName(null);
      setCandidates([]);
    }
  }, [open, defaultGroupId, groups]);

  const targetGroup = useMemo(
    () => groups.find((g) => g.id === targetGroupId) || groups[0],
    [groups, targetGroupId]
  );

  // Re-parse whenever input, group, or default tags change
  useEffect(() => {
    const parsed = parseSmartStudentInput(rawText, targetGroup, existingStudents, defaultTags);
    setCandidates(parsed);
  }, [rawText, targetGroup, existingStudents, defaultTags]);

  if (!open) return null;

  const selectedCandidates = candidates.filter((c) => c.selected && c.fullName.trim().length > 0);

  const handleToggleDefaultTag = (tagId: string) => {
    setDefaultTags((prev) =>
      prev.includes(tagId) ? prev.filter((item) => item !== tagId) : [...prev, tagId]
    );
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      setRawText(text);
      setUploadedFileName(file.name);
    } finally {
      e.target.value = '';
    }
  };

  const handleToggleRow = (tempId: string) => {
    setCandidates((prev) =>
      prev.map((c) => (c.tempId === tempId ? { ...c, selected: !c.selected } : c))
    );
  };

  const handleNameEdit = (tempId: string, fullName: string) => {
    setCandidates((prev) =>
      prev.map((c) => (c.tempId === tempId ? { ...c, fullName } : c))
    );
  };

  const handleToggleRowTag = (tempId: string, tagId: string) => {
    setCandidates((prev) =>
      prev.map((c) => {
        if (c.tempId !== tempId) return c;
        const has = c.tags.includes(tagId);
        return {
          ...c,
          tags: has ? c.tags.filter((x) => x !== tagId) : [...c.tags, tagId],
        };
      })
    );
  };

  const handleConfirm = () => {
    if (!targetGroup || selectedCandidates.length === 0) return;

    const newStudents = selectedCandidates.map((cand) =>
      createStudentRecord({
        fullName: cand.fullName,
        groupId: targetGroup.id,
        code: cand.code,
        tags: cand.tags,
      })
    );

    onImport(newStudents);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5">
      <div className="fixed inset-0 bg-slate-900/55 backdrop-blur-xs" onClick={onClose} />
      <div className="relative z-10 flex w-full max-w-5xl max-h-[92vh] flex-col rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-slate-100 px-6 py-4 bg-gradient-to-r from-teal-50/70 via-white to-white">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-600 text-white shadow-sm shadow-teal-600/20">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">{t.importer.title}</h2>
              <p className="text-xs text-slate-600 mt-0.5 max-w-2xl">{t.importer.subtitle}</p>
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

        {/* Body */}
        <div className="flex-1 overflow-y-auto grid grid-cols-1 lg:grid-cols-12 divide-y lg:divide-y-0 lg:divide-x divide-slate-100">
          {/* Left column: Input */}
          <div className="lg:col-span-5 p-5 space-y-4 bg-slate-50/40">
            {/* Target Group */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                {t.importer.targetGroup}
              </label>
              <select
                value={targetGroup?.id || ''}
                onChange={(e) => setTargetGroupId(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-medium text-slate-800 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
              >
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name} ({g.academicYear})
                  </option>
                ))}
              </select>
            </div>

            {/* File upload dropzone */}
            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.txt,text/csv,text/plain"
                onChange={handleFileUpload}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 bg-white px-4 py-3 text-xs font-semibold text-slate-700 transition hover:border-teal-500 hover:bg-teal-50/40 hover:text-teal-800"
              >
                <Upload className="h-4 w-4 text-teal-600" />
                <span>{t.importer.uploadFile}</span>
              </button>
              {uploadedFileName && (
                <p className="mt-1.5 flex items-center gap-1.5 text-[11px] font-medium text-teal-700">
                  <FileSpreadsheet className="h-3.5 w-3.5" />
                  {t.importer.fileLoaded(uploadedFileName)}
                </p>
              )}
            </div>

            {/* Textarea paste */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-semibold text-slate-700">{t.importer.orPaste}</span>
                {rawText && (
                  <button
                    type="button"
                    onClick={() => {
                      setRawText('');
                      setUploadedFileName(null);
                    }}
                    className="text-[11px] font-semibold text-slate-400 hover:text-slate-600"
                  >
                    ×
                  </button>
                )}
              </div>
              <textarea
                value={rawText}
                onChange={(e) => setRawText(e.target.value)}
                rows={9}
                placeholder={t.importer.pastePlaceholder}
                className="w-full rounded-xl border border-slate-200 bg-white p-3.5 text-sm leading-relaxed text-slate-800 placeholder:text-slate-400 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20 font-mono text-xs"
              />
              <p className="mt-1.5 text-[11px] text-slate-500">{t.importer.smartHint}</p>
            </div>

            {/* Bulk Default Tags */}
            <div>
              <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 mb-2">
                <Tag className="h-3.5 w-3.5 text-slate-400" />
                {t.importer.bulkTags}
              </label>
              <div className="flex flex-wrap gap-1.5">
                {PRESET_TAGS.map((tag) => {
                  const active = defaultTags.includes(tag.id);
                  return (
                    <button
                      key={tag.id}
                      type="button"
                      onClick={() => handleToggleDefaultTag(tag.id)}
                      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition ${
                        active
                          ? 'border-teal-600 bg-teal-600 text-white'
                          : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                      }`}
                    >
                      {active && <Check className="h-3 w-3" />}
                      {tag.label[lang]}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Right column: Structured Preview */}
          <div className="lg:col-span-7 flex flex-col bg-white min-h-[340px]">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-teal-600" />
                <h3 className="text-sm font-bold text-slate-900">{t.importer.previewTitle}</h3>
              </div>
              {candidates.length > 0 && (
                <div className="flex items-center gap-2 text-xs">
                  <span className="rounded-full bg-slate-100 px-2.5 py-0.5 font-semibold text-slate-600">
                    {t.importer.detectedCount(candidates.length)}
                  </span>
                  <span className="rounded-full bg-teal-50 px-2.5 py-0.5 font-semibold text-teal-700">
                    {t.importer.selectedToImport(selectedCandidates.length)}
                  </span>
                </div>
              )}
            </div>

            {candidates.length === 0 ? (
              <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400 mb-3">
                  <FileSpreadsheet className="h-6 w-6" />
                </div>
                <p className="text-xs font-medium text-slate-500 max-w-xs">
                  {rawText.trim() ? t.importer.noValidNames : t.importer.previewEmpty}
                </p>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto">
                <table className="w-full text-left border-collapse">
                  <thead className="sticky top-0 bg-slate-50/95 backdrop-blur-xs border-b border-slate-100 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    <tr>
                      <th className="py-2.5 pl-4 pr-2 w-8"></th>
                      <th className="py-2.5 px-2 w-24">{t.importer.codeCol}</th>
                      <th className="py-2.5 px-2">{t.importer.nameCol}</th>
                      <th className="py-2.5 px-2">{t.importer.tagsCol}</th>
                      <th className="py-2.5 pl-2 pr-4 text-right w-24">{t.importer.statusCol}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {candidates.map((cand) => (
                      <tr
                        key={cand.tempId}
                        className={`transition ${
                          cand.selected ? 'bg-white' : 'bg-slate-50/70 opacity-60'
                        }`}
                      >
                        <td className="py-2.5 pl-4 pr-2">
                          <input
                            type="checkbox"
                            checked={cand.selected}
                            onChange={() => handleToggleRow(cand.tempId)}
                            className="h-4 w-4 rounded accent-teal-600 cursor-pointer"
                          />
                        </td>
                        <td className="py-2.5 px-2">
                          <code className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-mono font-semibold text-slate-700">
                            {cand.code}
                          </code>
                        </td>
                        <td className="py-2.5 px-2">
                          <input
                            type="text"
                            value={cand.fullName}
                            onChange={(e) => handleNameEdit(cand.tempId, e.target.value)}
                            className="w-full rounded-lg border border-transparent bg-transparent px-1.5 py-1 text-xs font-semibold text-slate-800 hover:border-slate-200 focus:border-teal-500 focus:bg-white focus:outline-none"
                          />
                        </td>
                        <td className="py-2.5 px-2">
                          <div className="flex flex-wrap gap-1">
                            {PRESET_TAGS.map((pt) => {
                              const active = cand.tags.includes(pt.id);
                              const disp = getTagDisplay(pt.id, lang);
                              return (
                                <button
                                  key={pt.id}
                                  type="button"
                                  onClick={() => handleToggleRowTag(cand.tempId, pt.id)}
                                  className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold transition ${
                                    active
                                      ? disp.classes
                                      : 'border-slate-200 bg-white text-slate-400 hover:text-slate-600'
                                  }`}
                                >
                                  {pt.shortLabel[lang]}
                                </button>
                              );
                            })}
                          </div>
                        </td>
                        <td className="py-2.5 pl-2 pr-4 text-right">
                          {cand.isDuplicate ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 border border-amber-200 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                              <AlertTriangle className="h-3 w-3" />
                              {t.importer.duplicateBadge}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                              {t.importer.newBadge}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/70 px-6 py-3.5">
          <div className="text-xs text-slate-500">
            {targetGroup && (
              <span>
                {t.importer.targetGroup}:{' '}
                <strong className="text-slate-800">{targetGroup.name}</strong>
              </span>
            )}
          </div>
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-200/70"
            >
              {t.importer.cancel}
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={selectedCandidates.length === 0}
              className="inline-flex items-center gap-1.5 rounded-xl bg-teal-600 px-5 py-2 text-xs font-semibold text-white shadow-sm shadow-teal-600/20 hover:bg-teal-700 transition disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Check className="h-4 w-4" />
              {t.importer.confirm(selectedCandidates.length)}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
