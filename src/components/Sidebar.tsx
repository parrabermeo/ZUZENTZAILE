import React from 'react';
import {
  Users,
  ClipboardList,
  Sparkles,
  History,
  BarChart3,
  Settings,
  BookOpenCheck,
  X,
} from 'lucide-react';
import type { Language, NavTab } from '../types';
import type { Translations } from '../i18n/translations';
import { SECTION_THEMES } from '../utils/sectionThemes';

interface SidebarProps {
  activeTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  language: Language;
  onChangeLanguage: (lang: Language) => void;
  onOpenSettings: () => void;
  studentCount: number;
  testSessionCount: number;
  t: Translations;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onSelectTab,
  language,
  onChangeLanguage,
  onOpenSettings,
  studentCount,
  testSessionCount,
  t,
  mobileOpen,
  onCloseMobile,
}) => {
  const navItems: Array<{
    id: NavTab;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    badge?: string | number;
  }> = [
    {
      id: 'students',
      label: t.nav.students,
      icon: Users,
      badge: studentCount > 0 ? studentCount : undefined,
    },
    {
      id: 'rubrics',
      label: t.nav.rubrics,
      icon: ClipboardList,
    },
    {
      id: 'evaluate',
      label: t.nav.evaluate,
      icon: Sparkles,
    },
    {
      id: 'history',
      label: t.nav.history,
      icon: History,
      badge: testSessionCount > 0 ? testSessionCount : undefined,
    },
    {
      id: 'reports',
      label: t.nav.reports,
      icon: BarChart3,
    },
  ];

  const content = (
    <div className="flex h-full flex-col bg-white border-r border-slate-200/90">
      {/* Clean Minimal Brand Header (Icon + short title, no long subtitle) */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-600 to-emerald-600 text-white shadow-sm shadow-indigo-600/20">
            <BookOpenCheck className="h-4.5 w-4.5" />
          </div>
          <span className="truncate text-base font-extrabold tracking-tight text-slate-900">
            LH6
          </span>
        </div>
        <button
          type="button"
          onClick={onCloseMobile}
          className="md:hidden flex h-10 w-10 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 hover:text-slate-700"
          aria-label="Close sidebar"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Bilingual Language Switcher */}
      <div className="px-4 pt-3.5 pb-1.5">
        <div className="flex items-center justify-between rounded-xl bg-slate-100/90 p-1">
          <button
            type="button"
            onClick={() => onChangeLanguage('eu')}
            className={`flex-1 min-h-[38px] md:min-h-[32px] rounded-lg py-1.5 text-xs font-semibold transition-all ${
              language === 'eu'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Euskara
          </button>
          <button
            type="button"
            onClick={() => onChangeLanguage('es')}
            className={`flex-1 min-h-[38px] md:min-h-[32px] rounded-lg py-1.5 text-xs font-semibold transition-all ${
              language === 'es'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Castellano
          </button>
        </div>
      </div>

      {/* Color-Coded Section Navigation */}
      <div className="flex-1 overflow-y-auto px-3 py-3">
        <nav className="space-y-1.5 md:space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            const theme = SECTION_THEMES[item.id];
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  onSelectTab(item.id);
                  onCloseMobile();
                }}
                className={`group flex w-full min-h-[46px] md:min-h-0 items-center gap-3 rounded-xl px-3.5 py-3 md:px-3 md:py-2.5 text-left text-sm font-semibold transition-all duration-200 ${
                  isActive
                    ? theme.sidebarActive
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <span
                  className={`flex h-8 w-8 md:h-7 md:w-7 shrink-0 items-center justify-center rounded-lg transition-colors ${
                    isActive
                      ? theme.sidebarIconActive
                      : 'bg-slate-100 text-slate-500 group-hover:bg-slate-200/80 group-hover:text-slate-800'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                </span>
                <span className="flex-1 truncate">{item.label}</span>
                {item.badge !== undefined ? (
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                      isActive ? theme.sidebarBadgeActive : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {item.badge}
                  </span>
                ) : (
                  <span
                    className={`h-2 w-2 rounded-full transition-opacity ${theme.dot} ${
                      isActive ? 'opacity-100' : 'opacity-40 group-hover:opacity-80'
                    }`}
                  />
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Slate Settings Footer */}
      <div className="border-t border-slate-100 p-3.5">
        <button
          type="button"
          onClick={() => {
            onOpenSettings();
            onCloseMobile();
          }}
          className="flex w-full min-h-[44px] md:min-h-0 items-center gap-2.5 rounded-xl bg-slate-900 px-3.5 py-3 md:py-2.5 text-xs font-semibold text-white transition hover:bg-slate-800"
        >
          <Settings className="h-4 w-4 shrink-0 text-slate-300" />
          <span className="truncate">{t.sidebar.settings}</span>
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop & tablet (>= 768px) fixed sidebar */}
      <aside className="hidden md:block md:w-64 md:shrink-0 h-screen sticky top-0">
        {content}
      </aside>

      {/* Mobile (< 768px) slide-over drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          <div
            className="fixed inset-0 bg-slate-900/45 backdrop-blur-xs"
            onClick={onCloseMobile}
          />
          <div className="relative z-10 w-72 max-w-[85vw] h-full shadow-2xl">{content}</div>
        </div>
      )}
    </>
  );
};
