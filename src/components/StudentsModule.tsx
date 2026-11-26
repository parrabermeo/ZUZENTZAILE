import React, { useMemo, useState } from 'react';
import {
  Users,
  UserPlus,
  Sparkles,
  Search,
  FolderPlus,
  Pencil,
  Trash2,
  Eye,
  Tag,
  GraduationCap,
  ClipboardCheck,
  Wand2,
  ChevronDown,
  ChevronUp,
  Mail,
  AlertTriangle,
} from 'lucide-react';
import type { ClassGroup, GroupColor, Language, Student } from '../types';
import { PRESET_TAGS, getTagDisplay, type Translations } from '../i18n/translations';
import { SmartImporterModal } from './SmartImporterModal';
import { StudentFormModal, type StudentFormSaveData } from './StudentFormModal';
import { ClassGroupModal } from './ClassGroupModal';

interface StudentsModuleProps {
  groups: ClassGroup[];
  students: Student[];
  lang: Language;
  t: Translations;
  onAddGroup: (data: { name: string; academicYear: string; color: GroupColor }) => void;
  onUpdateGroup: (
    groupId: string,
    data: { name: string; academicYear: string; color: GroupColor }
  ) => void;
  onDeleteGroup: (groupId: string) => void;
  onAddStudent: (data: StudentFormSaveData) => void;
  onUpdateStudent: (studentId: string, data: StudentFormSaveData) => void;
  onDeleteStudent: (studentId: string) => void;
  onImportStudents: (newStudents: Student[]) => void;
  onLoadSampleClassroom: () => void;
  onOpenStudentDossier: (studentId: string) => void;
}

const GROUP_DOT_CLASSES: Record<GroupColor, string> = {
  teal: 'bg-teal-500',
  indigo: 'bg-indigo-500',
  emerald: 'bg-emerald-500',
  amber: 'bg-amber-500',
  sky: 'bg-sky-500',
  rose: 'bg-rose-500',
};

function getAvatarBg(name: string): string {
  const palette = [
    'bg-teal-100 text-teal-800',
    'bg-indigo-100 text-indigo-800',
    'bg-emerald-100 text-emerald-800',
    'bg-sky-100 text-sky-800',
    'bg-amber-100 text-amber-800',
    'bg-violet-100 text-violet-800',
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return palette[Math.abs(hash) % palette.length];
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

export const StudentsModule: React.FC<StudentsModuleProps> = ({
  groups,
  students,
  lang,
  t,
  onAddGroup,
  onUpdateGroup,
  onDeleteGroup,
  onAddStudent,
  onUpdateStudent,
  onDeleteStudent,
  onImportStudents,
  onLoadSampleClassroom,
  onOpenStudentDossier,
}) => {
  // Independent per-class accordion state — ALL collapsed initially by default
  const [expandedGroupIds, setExpandedGroupIds] = useState<Record<string, boolean>>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTagFilter, setSelectedTagFilter] = useState<string>('all');

  const [importerOpen, setImporterOpen] = useState(false);
  const [studentModalOpen, setStudentModalOpen] = useState(false);
  const [modalDefaultGroupId, setModalDefaultGroupId] = useState<string>('');
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [groupModalOpen, setGroupModalOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<ClassGroup | null>(null);

  const hasActiveFilter = searchQuery.trim().length > 0 || selectedTagFilter !== 'all';

  const filteredStudentsByGroup = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const map = new Map<string, Student[]>();
    for (const g of groups) {
      map.set(g.id, []);
    }

    for (const s of students) {
      if (selectedTagFilter !== 'all' && !s.tags.includes(selectedTagFilter)) {
        continue;
      }
      if (q) {
        const match =
          s.fullName.toLowerCase().includes(q) ||
          s.code.toLowerCase().includes(q) ||
          (s.email && s.email.toLowerCase().includes(q)) ||
          s.notes.toLowerCase().includes(q);
        if (!match) continue;
      }
      const list = map.get(s.groupId);
      if (list) {
        list.push(s);
      } else {
        map.set(s.groupId, [s]);
      }
    }

    for (const list of map.values()) {
      list.sort((a, b) => a.fullName.localeCompare(b.fullName, lang === 'eu' ? 'eu' : 'es'));
    }

    return map;
  }, [groups, students, searchQuery, selectedTagFilter, lang]);

  const totalCountByGroup = useMemo(() => {
    const counts = new Map<string, number>();
    for (const s of students) {
      counts.set(s.groupId, (counts.get(s.groupId) || 0) + 1);
    }
    return counts;
  }, [students]);

  const totalFilteredCount = useMemo(() => {
    let total = 0;
    for (const list of filteredStudentsByGroup.values()) {
      total += list.length;
    }
    return total;
  }, [filteredStudentsByGroup]);

  const allUniqueTags = useMemo(() => {
    const set = new Set<string>(PRESET_TAGS.map((p) => p.id));
    students.forEach((s) => s.tags.forEach((tag) => set.add(tag)));
    return Array.from(set);
  }, [students]);

  const withTagsCount = useMemo(
    () => students.filter((s) => s.tags.length > 0).length,
    [students]
  );

  const toggleGroupExpanded = (groupId: string) => {
    setExpandedGroupIds((prev) => ({
      ...prev,
      [groupId]: !prev[groupId],
    }));
  };

  const handleConfirmDeleteGroup = (group: ClassGroup) => {
    const count = totalCountByGroup.get(group.id) || 0;
    if (window.confirm(t.students.confirmDeleteGroup(group.name, count))) {
      onDeleteGroup(group.id);
    }
  };

  const handleConfirmDeleteStudent = (student: Student) => {
    if (window.confirm(t.students.confirmDeleteStudent(student.fullName))) {
      onDeleteStudent(student.id);
    }
  };

  const openAddStudentForGroup = (groupId?: string) => {
    setEditingStudent(null);
    setModalDefaultGroupId(groupId || groups[0]?.id || '');
    setStudentModalOpen(true);
  };

  return (
    <div className="space-y-6">
      {/* Top Page Header (Emerald Theme) */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 text-[11px] font-bold text-emerald-800 mb-2">
            <Users className="h-3.5 w-3.5 text-emerald-600" />
            {t.nav.students}
          </div>
          <h2 className="text-2xl font-extrabold tracking-tight text-slate-900">
            {t.students.title}
          </h2>
          <p className="text-sm text-slate-500 mt-1">{t.students.subtitle}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setEditingGroup(null);
              setGroupModalOpen(true);
            }}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-semibold text-slate-700 shadow-2xs transition hover:border-emerald-300 hover:bg-emerald-50/40"
          >
            <FolderPlus className="h-4 w-4 text-emerald-600" />
            {t.students.newGroup}
          </button>
          <button
            type="button"
            onClick={() => openAddStudentForGroup()}
            className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-white px-4 py-2.5 text-xs font-semibold text-emerald-800 shadow-xs transition hover:bg-emerald-50"
          >
            <UserPlus className="h-4 w-4 text-emerald-600" />
            {t.students.addStudent}
          </button>
          <button
            type="button"
            onClick={() => setImporterOpen(true)}
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-semibold text-white shadow-sm shadow-emerald-600/20 transition hover:bg-emerald-700"
          >
            <Sparkles className="h-4 w-4" />
            {t.students.smartImport}
          </button>
        </div>
      </div>

      {/* KPI Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div className="rounded-2xl border border-slate-200/80 border-t-2 border-t-emerald-500 bg-white p-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">
              {t.students.stats.totalStudents}
            </span>
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-teal-50 text-teal-600">
              <Users className="h-4 w-4" />
            </span>
          </div>
          <p className="mt-2 text-2xl font-extrabold text-slate-900">{students.length}</p>
        </div>

        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">{t.students.stats.groups}</span>
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
              <GraduationCap className="h-4 w-4" />
            </span>
          </div>
          <p className="mt-2 text-2xl font-extrabold text-slate-900">{groups.length}</p>
        </div>

        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">
              {t.students.stats.withTags}
            </span>
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-violet-50 text-violet-600">
              <Tag className="h-4 w-4" />
            </span>
          </div>
          <p className="mt-2 text-2xl font-extrabold text-slate-900">{withTagsCount}</p>
        </div>

        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">
              {t.students.stats.pendingEval}
            </span>
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
              <ClipboardCheck className="h-4 w-4" />
            </span>
          </div>
          <p className="mt-2 text-2xl font-extrabold text-slate-900">{students.length}</p>
        </div>
      </div>

      {/* Search & Tag Filters Toolbar */}
      {students.length > 0 && (
        <div className="flex flex-col gap-3 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-2xs md:flex-row md:items-center md:justify-between">
          <div className="relative flex-1 max-w-md">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t.students.searchPlaceholder}
              className="w-full rounded-xl border border-slate-200 bg-slate-50/60 py-2 pl-10 pr-4 text-xs text-slate-800 placeholder:text-slate-400 focus:border-teal-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500/20"
            />
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setSelectedTagFilter('all')}
              className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold transition ${
                selectedTagFilter === 'all'
                  ? 'border-slate-900 bg-slate-900 text-white'
                  : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              {t.students.filterAllTags}
            </button>
            {allUniqueTags.map((tag) => {
              const disp = getTagDisplay(tag, lang);
              const active = selectedTagFilter === tag;
              return (
                <button
                  key={tag}
                  type="button"
                  onClick={() => setSelectedTagFilter(active ? 'all' : tag)}
                  className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold transition ${
                    active
                      ? 'border-teal-600 bg-teal-600 text-white'
                      : `${disp.classes} opacity-80 hover:opacity-100`
                  }`}
                >
                  {disp.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Empty global state (0 students in any class) */}
      {students.length === 0 ? (
        <div className="rounded-2xl border border-slate-200/80 bg-white shadow-2xs flex flex-col items-center justify-center px-6 py-16 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-teal-50 text-teal-600 mb-4">
            <Users className="h-8 w-8" />
          </div>
          <h3 className="text-base font-bold text-slate-900">{t.students.emptyTitle}</h3>
          <p className="mt-1.5 max-w-md text-xs leading-relaxed text-slate-500">
            {t.students.emptyDesc}
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-2.5">
            <button
              type="button"
              onClick={() => setImporterOpen(true)}
              className="inline-flex items-center gap-2 rounded-xl bg-teal-600 px-4 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-teal-700 transition"
            >
              <Sparkles className="h-4 w-4" />
              {t.students.smartImport}
            </button>
            <button
              type="button"
              onClick={() => openAddStudentForGroup()}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
            >
              <UserPlus className="h-4 w-4" />
              {t.students.addStudent}
            </button>
            <button
              type="button"
              onClick={onLoadSampleClassroom}
              className="inline-flex items-center gap-2 rounded-xl border border-teal-200 bg-teal-50/70 px-4 py-2.5 text-xs font-semibold text-teal-800 hover:bg-teal-100/70 transition"
            >
              <Wand2 className="h-4 w-4" />
              {t.students.loadSample}
            </button>
          </div>
        </div>
      ) : hasActiveFilter && totalFilteredCount === 0 ? (
        <div className="rounded-2xl border border-slate-200/80 bg-white shadow-2xs flex flex-col items-center justify-center px-6 py-14 text-center">
          <p className="text-sm font-bold text-slate-800">{t.students.noResultsTitle}</p>
          <p className="mt-1 text-xs text-slate-500">{t.students.noResultsDesc}</p>
          <button
            type="button"
            onClick={() => {
              setSearchQuery('');
              setSelectedTagFilter('all');
            }}
            className="mt-4 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            {t.students.clearFilters}
          </button>
        </div>
      ) : (
        /* Hierarchical Per-Class Accordion List (All Collapsed Initially by Default) */
        <div className="space-y-3">
          {!hasActiveFilter && (
            <p className="text-xs font-medium text-slate-500 px-1">{t.students.accordionHint}</p>
          )}

          {groups.map((group) => {
            const classStudents = filteredStudentsByGroup.get(group.id) || [];
            const totalInClass = totalCountByGroup.get(group.id) || 0;

            if (hasActiveFilter && classStudents.length === 0) {
              return null;
            }

            const isExpanded = hasActiveFilter
              ? true
              : Boolean(expandedGroupIds[group.id]);

            return (
              <section
                key={group.id}
                className={`rounded-2xl border bg-white shadow-2xs overflow-hidden transition-all duration-200 ${
                  isExpanded
                    ? 'border-emerald-300/90 shadow-xs'
                    : 'border-slate-200/90 hover:border-emerald-300/70'
                }`}
              >
                {/* Class Accordion Header */}
                <div
                  role="button"
                  tabIndex={0}
                  aria-expanded={isExpanded}
                  onClick={() => toggleGroupExpanded(group.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      toggleGroupExpanded(group.id);
                    }
                  }}
                  className={`flex flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-5 cursor-pointer select-none transition-colors ${
                    isExpanded
                      ? 'bg-gradient-to-r from-emerald-50/70 via-white to-white border-b border-slate-100'
                      : 'bg-white hover:bg-slate-50/80'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span
                      className={`h-3 w-3 shrink-0 rounded-full ${GROUP_DOT_CLASSES[group.color]}`}
                    />
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-base font-extrabold text-slate-900 truncate">
                          {group.name}
                        </h3>
                        <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-semibold text-slate-600">
                          {group.academicYear}
                        </span>
                        <span className="rounded-full bg-emerald-50 border border-emerald-200/80 px-2.5 py-0.5 text-[11px] font-bold text-emerald-800">
                          {t.students.studentCount(
                            hasActiveFilter ? classStudents.length : totalInClass
                          )}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div
                    className="flex items-center gap-1.5 shrink-0"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      type="button"
                      onClick={() => openAddStudentForGroup(group.id)}
                      title={t.students.addStudent}
                      className="rounded-xl border border-slate-200 bg-white p-2 text-slate-500 hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700 transition"
                    >
                      <UserPlus className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingGroup(group);
                        setGroupModalOpen(true);
                      }}
                      title={t.students.editGroup}
                      className="rounded-xl border border-slate-200 bg-white p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    {groups.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleConfirmDeleteGroup(group)}
                        title={t.students.deleteGroup}
                        className="rounded-xl border border-slate-200 bg-white p-2 text-slate-500 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700 transition"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => toggleGroupExpanded(group.id)}
                      aria-label={isExpanded ? 'Collapse class' : 'Expand class'}
                      className={`ml-1 flex h-9 w-9 items-center justify-center rounded-xl border transition ${
                        isExpanded
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                          : 'border-slate-200 bg-slate-50 text-slate-500'
                      }`}
                    >
                      {isExpanded ? (
                        <ChevronUp className="h-4 w-4" />
                      ) : (
                        <ChevronDown className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Expanded Class Student Roster */}
                {isExpanded && (
                  <div className="panel-slide-down">
                    {classStudents.length === 0 ? (
                      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-5 py-6 text-xs text-slate-500">
                        <span>{t.students.noStudentsInClass}</span>
                        <button
                          type="button"
                          onClick={() => openAddStudentForGroup(group.id)}
                          className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-emerald-700 transition"
                        >
                          <UserPlus className="h-3.5 w-3.5" />
                          {t.students.addStudent}
                        </button>
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                          <thead className="bg-slate-50/80 border-b border-slate-100 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                            <tr>
                              <th className="py-2.5 pl-5 pr-3">{t.students.columns.student}</th>
                              <th className="py-2.5 px-3 hidden sm:table-cell">
                                {t.students.columns.code}
                              </th>
                              <th className="py-2.5 px-3 hidden md:table-cell">
                                {t.students.columns.tags}
                              </th>
                              <th className="py-2.5 px-3">{t.students.columns.records}</th>
                              <th className="py-2.5 pl-3 pr-5 text-right">
                                {t.students.columns.actions}
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 text-sm">
                            {classStudents.map((student) => (
                              <tr
                                key={student.id}
                                onClick={() => onOpenStudentDossier(student.id)}
                                className="group cursor-pointer transition hover:bg-slate-50/80"
                              >
                                <td className="py-3 pl-5 pr-3">
                                  <div className="flex items-center gap-3">
                                    <div
                                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-xs font-bold ${getAvatarBg(
                                        student.fullName
                                      )}`}
                                    >
                                      {getInitials(student.fullName)}
                                    </div>
                                    <div className="min-w-0 space-y-0.5">
                                      <div className="flex flex-wrap items-center gap-1.5">
                                        <p className="font-semibold text-slate-900 truncate group-hover:text-teal-700 transition-colors">
                                          {student.fullName}
                                        </p>
                                        {student.pendingSubjects?.euskera && (
                                          <span className="inline-flex items-center gap-0.5 rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-800">
                                            <AlertTriangle className="h-2.5 w-2.5 text-amber-600" />
                                            {t.studentForm.pendingBadgeEu(
                                              student.pendingSubjects.euskera
                                            )}
                                          </span>
                                        )}
                                        {student.pendingSubjects?.lengua && (
                                          <span className="inline-flex items-center gap-0.5 rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-800">
                                            <AlertTriangle className="h-2.5 w-2.5 text-amber-600" />
                                            {t.studentForm.pendingBadgeEs(
                                              student.pendingSubjects.lengua
                                            )}
                                          </span>
                                        )}
                                      </div>
                                      <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
                                        {student.email && (
                                          <span className="inline-flex items-center gap-1 text-slate-500 truncate max-w-[220px]">
                                            <Mail className="h-3 w-3 text-indigo-400 shrink-0" />
                                            <span className="truncate">{student.email}</span>
                                          </span>
                                        )}
                                        {student.notes && (
                                          <span className="truncate max-w-xs hidden sm:inline">
                                            {student.notes}
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                </td>

                                <td className="py-3 px-3 hidden sm:table-cell">
                                  <code className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-mono font-semibold text-slate-700">
                                    {student.code}
                                  </code>
                                </td>

                                <td className="py-3 px-3 hidden md:table-cell">
                                  {student.tags.length === 0 ? (
                                    <span className="text-xs text-slate-300">—</span>
                                  ) : (
                                    <div className="flex flex-wrap gap-1">
                                      {student.tags.map((tag) => {
                                        const disp = getTagDisplay(tag, lang);
                                        return (
                                          <span
                                            key={tag}
                                            className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${disp.classes}`}
                                          >
                                            {disp.label}
                                          </span>
                                        );
                                      })}
                                    </div>
                                  )}
                                </td>

                                <td className="py-3 px-3">
                                  <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-50 border border-slate-200/80 px-2.5 py-0.5 text-[11px] font-medium text-slate-600 whitespace-nowrap">
                                    <span
                                      className={`h-1.5 w-1.5 rounded-full ${
                                        student.evaluations.length > 0
                                          ? 'bg-emerald-500'
                                          : 'bg-slate-300'
                                      }`}
                                    />
                                    {t.students.evaluationsCount(student.evaluations.length)}
                                  </span>
                                </td>

                                <td
                                  className="py-3 pl-3 pr-5 text-right"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <div className="inline-flex items-center justify-end gap-1">
                                    <button
                                      type="button"
                                      onClick={() => onOpenStudentDossier(student.id)}
                                      title={t.students.actions.viewDossier}
                                      className="rounded-lg p-2 text-slate-400 hover:bg-teal-50 hover:text-teal-700 transition"
                                    >
                                      <Eye className="h-4 w-4" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setEditingStudent(student);
                                        setStudentModalOpen(true);
                                      }}
                                      title={t.students.actions.edit}
                                      className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition"
                                    >
                                      <Pencil className="h-4 w-4" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleConfirmDeleteStudent(student)}
                                      title={t.students.actions.delete}
                                      className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition"
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}

      {/* Modals */}
      <SmartImporterModal
        open={importerOpen}
        groups={groups}
        defaultGroupId={groups[0]?.id || ''}
        existingStudents={students}
        lang={lang}
        onClose={() => setImporterOpen(false)}
        onImport={onImportStudents}
        t={t}
      />

      <StudentFormModal
        open={studentModalOpen}
        editingStudent={editingStudent}
        groups={groups}
        defaultGroupId={modalDefaultGroupId || groups[0]?.id || ''}
        lang={lang}
        onClose={() => {
          setStudentModalOpen(false);
          setEditingStudent(null);
        }}
        onSave={(data) => {
          if (editingStudent) {
            onUpdateStudent(editingStudent.id, data);
          } else {
            onAddStudent(data);
          }
        }}
        t={t}
      />

      <ClassGroupModal
        open={groupModalOpen}
        editingGroup={editingGroup}
        onClose={() => {
          setGroupModalOpen(false);
          setEditingGroup(null);
        }}
        onSave={(data) => {
          if (editingGroup) {
            onUpdateGroup(editingGroup.id, data);
          } else {
            onAddGroup(data);
          }
        }}
        t={t}
      />
    </div>
  );
};
