import type { NavTab } from '../types';

export interface SectionTheme {
  id: NavTab;
  dot: string;
  sidebarActive: string;
  sidebarIconActive: string;
  sidebarBadgeActive: string;
  headerPill: string;
  cardTopBorder: string;
  accentText: string;
}

export const SECTION_THEMES: Record<NavTab, SectionTheme> = {
  students: {
    id: 'students',
    dot: 'bg-emerald-500',
    sidebarActive: 'bg-emerald-50 text-emerald-950 shadow-xs ring-1 ring-emerald-200/90',
    sidebarIconActive: 'bg-emerald-600 text-white shadow-xs',
    sidebarBadgeActive: 'bg-emerald-600/15 text-emerald-800',
    headerPill: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    cardTopBorder: 'border-t-2 border-t-emerald-500',
    accentText: 'text-emerald-700',
  },
  rubrics: {
    id: 'rubrics',
    dot: 'bg-cyan-500',
    sidebarActive: 'bg-cyan-50 text-cyan-950 shadow-xs ring-1 ring-cyan-200/90',
    sidebarIconActive: 'bg-cyan-600 text-white shadow-xs',
    sidebarBadgeActive: 'bg-cyan-600/15 text-cyan-800',
    headerPill: 'bg-cyan-50 text-cyan-800 border-cyan-200',
    cardTopBorder: 'border-t-2 border-t-cyan-500',
    accentText: 'text-cyan-700',
  },
  evaluate: {
    id: 'evaluate',
    dot: 'bg-indigo-500',
    sidebarActive: 'bg-indigo-50 text-indigo-950 shadow-xs ring-1 ring-indigo-200/90',
    sidebarIconActive: 'bg-indigo-600 text-white shadow-xs',
    sidebarBadgeActive: 'bg-indigo-600/15 text-indigo-800',
    headerPill: 'bg-indigo-50 text-indigo-800 border-indigo-200',
    cardTopBorder: 'border-t-2 border-t-indigo-500',
    accentText: 'text-indigo-700',
  },
  history: {
    id: 'history',
    dot: 'bg-amber-500',
    sidebarActive: 'bg-amber-50 text-amber-950 shadow-xs ring-1 ring-amber-200/90',
    sidebarIconActive: 'bg-amber-500 text-white shadow-xs',
    sidebarBadgeActive: 'bg-amber-500/15 text-amber-900',
    headerPill: 'bg-amber-50 text-amber-800 border-amber-200',
    cardTopBorder: 'border-t-2 border-t-amber-500',
    accentText: 'text-amber-700',
  },
  reports: {
    id: 'reports',
    dot: 'bg-violet-500',
    sidebarActive: 'bg-violet-50 text-violet-950 shadow-xs ring-1 ring-violet-200/90',
    sidebarIconActive: 'bg-violet-600 text-white shadow-xs',
    sidebarBadgeActive: 'bg-violet-600/15 text-violet-800',
    headerPill: 'bg-violet-50 text-violet-800 border-violet-200',
    cardTopBorder: 'border-t-2 border-t-violet-500',
    accentText: 'text-violet-700',
  },
};
