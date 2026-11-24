import React from 'react';
import {
  BookOpen,
  PenTool,
  Image,
  FileSpreadsheet,
  Scale,
  ListOrdered,
  Mail,
  Newspaper,
  CheckCircle2,
} from 'lucide-react';
import type { Language, SkillMode, TextTypologyId } from '../types';
import type { Translations } from '../i18n/translations';
import { TEXT_TYPOLOGIES, type TextTypologyMeta } from '../data/defaultRubrics';

interface SkillAndTypologySelectorProps {
  skill: SkillMode;
  typology: TextTypologyId;
  onChangeSkill: (skill: SkillMode) => void;
  onChangeTypology: (typology: TextTypologyId) => void;
  lang: Language;
  t: Translations;
  compact?: boolean;
}

const TYPOLOGY_ICONS: Record<
  TextTypologyMeta['iconName'],
  React.ComponentType<{ className?: string }>
> = {
  'book-open': BookOpen,
  image: Image,
  'file-spreadsheet': FileSpreadsheet,
  scale: Scale,
  'list-ordered': ListOrdered,
  mail: Mail,
  newspaper: Newspaper,
};

export const SkillAndTypologySelector: React.FC<SkillAndTypologySelectorProps> = ({
  skill,
  typology,
  onChangeSkill,
  onChangeTypology,
  lang,
  t,
  compact = false,
}) => {
  return (
    <div className="space-y-5">
      {/* 1. Large Visual Modality Selector */}
      <div>
        <p className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2.5">
          {t.rubrics.modalityLabel}
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {/* Comprensión Escrita (Irakurmenaren Ulermena) */}
          <button
            type="button"
            onClick={() => onChangeSkill('reading')}
            className={`group relative flex items-start gap-4 rounded-2xl border-2 p-5 text-left transition-all ${
              skill === 'reading'
                ? 'border-indigo-600 bg-gradient-to-br from-indigo-50/90 via-white to-white shadow-md shadow-indigo-600/10'
                : 'border-slate-200/90 bg-white hover:border-indigo-300 hover:bg-slate-50/50'
            }`}
          >
            <div
              className={`flex h-13 w-13 shrink-0 items-center justify-center rounded-2xl transition-all ${
                skill === 'reading'
                  ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-600/30'
                  : 'bg-indigo-50 text-indigo-600 group-hover:bg-indigo-100'
              }`}
            >
              <BookOpen className="h-6 w-6" />
            </div>
            <div className="min-w-0 flex-1 pr-6">
              <h3 className="text-base font-extrabold text-slate-900">
                {t.rubrics.readingCardTitle}
              </h3>
              <p className="mt-1 text-xs leading-relaxed text-slate-500">
                {t.rubrics.readingCardSub}
              </p>
            </div>
            {skill === 'reading' && (
              <CheckCircle2 className="absolute right-4 top-4 h-5 w-5 text-indigo-600" />
            )}
          </button>

          {/* Expresión Escrita (Idazmena) */}
          <button
            type="button"
            onClick={() => onChangeSkill('writing')}
            className={`group relative flex items-start gap-4 rounded-2xl border-2 p-5 text-left transition-all ${
              skill === 'writing'
                ? 'border-teal-600 bg-gradient-to-br from-teal-50/90 via-white to-white shadow-md shadow-teal-600/10'
                : 'border-slate-200/90 bg-white hover:border-teal-300 hover:bg-slate-50/50'
            }`}
          >
            <div
              className={`flex h-13 w-13 shrink-0 items-center justify-center rounded-2xl transition-all ${
                skill === 'writing'
                  ? 'bg-teal-600 text-white shadow-sm shadow-teal-600/30'
                  : 'bg-teal-50 text-teal-600 group-hover:bg-teal-100'
              }`}
            >
              <PenTool className="h-6 w-6" />
            </div>
            <div className="min-w-0 flex-1 pr-6">
              <h3 className="text-base font-extrabold text-slate-900">
                {t.rubrics.writingCardTitle}
              </h3>
              <p className="mt-1 text-xs leading-relaxed text-slate-500">
                {t.rubrics.writingCardSub}
              </p>
            </div>
            {skill === 'writing' && (
              <CheckCircle2 className="absolute right-4 top-4 h-5 w-5 text-teal-600" />
            )}
          </button>
        </div>
      </div>

      {/* 2. Sub-selector de Tipología Textual (visible when Expresión Escrita is active) */}
      {skill === 'writing' && (
        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 sm:p-5 shadow-2xs">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">
            {t.rubrics.typologyLabel}
          </p>
          <div
            className={`grid gap-2.5 ${
              compact
                ? 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4'
                : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4'
            }`}
          >
            {TEXT_TYPOLOGIES.map((item) => {
              const Icon = TYPOLOGY_ICONS[item.iconName];
              const active = typology === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onChangeTypology(item.id)}
                  className={`group relative flex items-start gap-3 rounded-xl border p-3.5 text-left transition-all ${
                    active
                      ? 'border-teal-600 bg-teal-50/70 ring-1 ring-teal-500 shadow-xs'
                      : 'border-slate-200/90 bg-slate-50/40 hover:border-teal-300 hover:bg-white'
                  }`}
                >
                  <div
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-xs ${item.accentClasses} ${
                      active ? 'opacity-100 scale-105' : 'opacity-80 group-hover:opacity-100'
                    } transition-all`}
                  >
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p
                      className={`text-xs font-bold leading-snug ${
                        active ? 'text-teal-950' : 'text-slate-800'
                      }`}
                    >
                      {item.title[lang]}
                    </p>
                    <p className="mt-0.5 text-[11px] leading-snug text-slate-500 line-clamp-2">
                      {item.subtitle[lang]}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
