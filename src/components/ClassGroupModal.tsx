import React, { useState, useEffect } from 'react';
import { X, FolderPlus } from 'lucide-react';
import type { ClassGroup, GroupColor } from '../types';
import type { Translations } from '../i18n/translations';

interface ClassGroupModalProps {
  open: boolean;
  editingGroup: ClassGroup | null;
  onClose: () => void;
  onSave: (data: { name: string; academicYear: string; color: GroupColor }) => void;
  t: Translations;
}

const COLOR_OPTIONS: Array<{ id: GroupColor; swatch: string }> = [
  { id: 'teal', swatch: 'bg-teal-500' },
  { id: 'indigo', swatch: 'bg-indigo-500' },
  { id: 'emerald', swatch: 'bg-emerald-500' },
  { id: 'amber', swatch: 'bg-amber-500' },
  { id: 'sky', swatch: 'bg-sky-500' },
  { id: 'rose', swatch: 'bg-rose-500' },
];

export const ClassGroupModal: React.FC<ClassGroupModalProps> = ({
  open,
  editingGroup,
  onClose,
  onSave,
  t,
}) => {
  const [name, setName] = useState('');
  const [academicYear, setAcademicYear] = useState('2026-2027');
  const [color, setColor] = useState<GroupColor>('teal');

  useEffect(() => {
    if (open) {
      if (editingGroup) {
        setName(editingGroup.name);
        setAcademicYear(editingGroup.academicYear);
        setColor(editingGroup.color);
      } else {
        setName('');
        setAcademicYear('2026-2027');
        setColor('teal');
      }
    }
  }, [open, editingGroup]);

  if (!open) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onSave({
      name: name.trim(),
      academicYear: academicYear.trim() || '2026-2027',
      color,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-50 text-teal-700">
              <FolderPlus className="h-4 w-4" />
            </div>
            <h2 className="text-base font-bold text-slate-900">
              {editingGroup ? t.groupModal.editTitle : t.groupModal.createTitle}
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
              {t.groupModal.nameLabel}
            </label>
            <input
              type="text"
              required
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t.groupModal.namePlaceholder}
              className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              {t.groupModal.yearLabel}
            </label>
            <input
              type="text"
              value={academicYear}
              onChange={(e) => setAcademicYear(e.target.value)}
              placeholder={t.groupModal.yearPlaceholder}
              className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-2">
              {t.groupModal.colorLabel}
            </label>
            <div className="flex items-center gap-2.5">
              {COLOR_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setColor(opt.id)}
                  className={`h-8 w-8 rounded-full ${opt.swatch} transition-transform ${
                    color === opt.id
                      ? 'ring-2 ring-offset-2 ring-slate-900 scale-110'
                      : 'opacity-70 hover:opacity-100'
                  }`}
                  aria-label={opt.id}
                />
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100"
            >
              {t.groupModal.cancel}
            </button>
            <button
              type="submit"
              className="rounded-xl bg-teal-600 px-5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-teal-700 transition"
            >
              {t.groupModal.save}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
