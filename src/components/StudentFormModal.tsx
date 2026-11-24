import React, { useState, useEffect } from 'react';
import { X, UserPlus, Check, Plus } from 'lucide-react';
import type { ClassGroup, Language, Student } from '../types';
import { PRESET_TAGS, getTagDisplay, type Translations } from '../i18n/translations';

interface StudentFormModalProps {
  open: boolean;
  editingStudent: Student | null;
  groups: ClassGroup[];
  defaultGroupId: string;
  lang: Language;
  onClose: () => void;
  onSave: (data: {
    fullName: string;
    groupId: string;
    tags: string[];
    notes: string;
  }) => void;
  t: Translations;
}

export const StudentFormModal: React.FC<StudentFormModalProps> = ({
  open,
  editingStudent,
  groups,
  defaultGroupId,
  lang,
  onClose,
  onSave,
  t,
}) => {
  const [fullName, setFullName] = useState('');
  const [groupId, setGroupId] = useState(defaultGroupId);
  const [tags, setTags] = useState<string[]>([]);
  const [customTag, setCustomTag] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (open) {
      if (editingStudent) {
        setFullName(editingStudent.fullName);
        setGroupId(editingStudent.groupId);
        setTags(editingStudent.tags);
        setNotes(editingStudent.notes);
      } else {
        setFullName('');
        setGroupId(defaultGroupId || groups[0]?.id || '');
        setTags([]);
        setNotes('');
      }
      setCustomTag('');
    }
  }, [open, editingStudent, defaultGroupId, groups]);

  if (!open) return null;

  const presetIds = new Set<string>(PRESET_TAGS.map((p) => p.id));
  const customTags = tags.filter((tag) => !presetIds.has(tag));

  const toggleTag = (tagId: string) => {
    setTags((prev) =>
      prev.includes(tagId) ? prev.filter((item) => item !== tagId) : [...prev, tagId]
    );
  };

  const addCustomTag = () => {
    const cleaned = customTag.trim();
    if (!cleaned) return;
    if (!tags.includes(cleaned)) {
      setTags((prev) => [...prev, cleaned]);
    }
    setCustomTag('');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim()) return;
    onSave({
      fullName: fullName.trim(),
      groupId: groupId || groups[0]?.id || '',
      tags,
      notes: notes.trim(),
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs" onClick={onClose} />
      <div className="relative z-10 w-full max-w-lg rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-50 text-teal-700">
              <UserPlus className="h-4 w-4" />
            </div>
            <h2 className="text-base font-bold text-slate-900">
              {editingStudent ? t.studentForm.editTitle : t.studentForm.addTitle}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              {t.studentForm.fullName}
            </label>
            <input
              type="text"
              required
              autoFocus
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder={t.studentForm.fullNamePlaceholder}
              className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              {t.studentForm.group}
            </label>
            <select
              value={groupId}
              onChange={(e) => setGroupId(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-800 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
            >
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name} ({g.academicYear})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-2">
              {t.studentForm.tags}
            </label>
            <div className="flex flex-wrap gap-2 mb-2.5">
              {PRESET_TAGS.map((tag) => {
                const active = tags.includes(tag.id);
                return (
                  <button
                    key={tag.id}
                    type="button"
                    onClick={() => toggleTag(tag.id)}
                    title={tag.description[lang]}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition ${
                      active
                        ? 'border-teal-600 bg-teal-600 text-white'
                        : 'border-slate-200 bg-slate-50 text-slate-600 hover:border-slate-300'
                    }`}
                  >
                    {active && <Check className="h-3 w-3" />}
                    {tag.label[lang]}
                  </button>
                );
              })}
            </div>

            {/* Custom tags */}
            {customTags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-2.5">
                {customTags.map((ct) => {
                  const disp = getTagDisplay(ct, lang);
                  return (
                    <span
                      key={ct}
                      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${disp.classes}`}
                    >
                      {disp.label}
                      <button
                        type="button"
                        onClick={() => toggleTag(ct)}
                        className="ml-0.5 hover:text-rose-600"
                      >
                        ×
                      </button>
                    </span>
                  );
                })}
              </div>
            )}

            <div className="flex gap-2">
              <input
                type="text"
                value={customTag}
                onChange={(e) => setCustomTag(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addCustomTag();
                  }
                }}
                placeholder={t.studentForm.customTagPlaceholder}
                className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-800 placeholder:text-slate-400 focus:border-teal-500 focus:outline-none"
              />
              <button
                type="button"
                onClick={addCustomTag}
                className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100"
              >
                <Plus className="h-3.5 w-3.5" />
                {t.studentForm.addTagBtn}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              {t.studentForm.notes}
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder={t.studentForm.notesPlaceholder}
              className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-xs leading-relaxed text-slate-800 placeholder:text-slate-400 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
            />
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100"
            >
              {t.studentForm.cancel}
            </button>
            <button
              type="submit"
              className="rounded-xl bg-teal-600 px-5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-teal-700 transition"
            >
              {editingStudent ? t.studentForm.save : t.studentForm.create}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
