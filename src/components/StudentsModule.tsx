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
} from 'lucide-react';
import type { ClassGroup, GroupColor, Language, Student } from '../types';
import { PRESET_TAGS, getTagDisplay, type Translations } from '../i18n/translations';
import { SmartImporterModal } from './SmartImporterModal';
import { StudentFormModal } from './StudentFormModal';
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
  onAddStudent: (data: {
    fullName: string;
    groupId: string;
    tags: string[];
    notes: string;
  }) => void;
  onUpdateStudent: (
    studentId: string,
    data: { fullName: string; groupId: string; tags: string[]; notes: string }
  ) => void;
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
  const [selectedGroupId, setSelectedGroupId] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTagFilter, setSelectedTagFilter] = useState<string>('all');

  const [importerOpen, setImporterOpen] = useState(false);
  const [studentModalOpen, setStudentModalOpen] = useState(false);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [groupModalOpen, setGroupModalOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<ClassGroup | null>(null);

  const activeGroup = useMemo(
    () => (selectedGroupId === 'all' ? undefined : groups.find((g) => g.id === selectedGroupId)),
    [groups, selectedGroupId]
  );

  // If the selected group was deleted, reset to 'all'
  const effectiveGroupId =
    selectedGroupId !== 'all' && !groups.some((g) => g.id === selectedGroupId)
      ? 'all'
      : selectedGroupId;

  const groupMap = useMemo(() => new Map(groups.map((g) => [g.id, g])), [groups]);

  const studentsInGroup = useMemo(
    () =>
      effectiveGroupId === 'all'
        ? students
        : students.filter((s) => s.groupId === effectiveGroupId),
    [students, effectiveGroupId]
  );

  const filteredStudents = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return studentsInGroup
      .filter((s) => {
        if (selectedTagFilter !== 'all' && !s.tags.includes(selectedTagFilter)) {
          return false;
        }
        if (!q) return true;
        return (
          s.fullName.toLowerCase().includes(q) ||
          s.code.toLowerCase().includes(q) ||
          s.notes.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => a.fullName.localeCompare(b.fullName, lang === 'eu' ? 'eu' : 'es'));
  }, [studentsInGroup, searchQuery, selectedTagFilter, lang]);

  const allUniqueTags = useMemo(() => {
    const set = new Set<string>(PRESET_TAGS.map((p) => p.id));
    students.forEach((s) => s.tags.forEach((tag) => set.add(tag)));
    return Array.from(set);
  }, [students]);

  const withTagsCount = useMemo(
    () => studentsInGroup.filter((s) => s.tags.length > 0).length,
    [studentsInGroup]
  );

  const defaultTargetGroupId =
    effectiveGroupId !== 'all' ? effectiveGroupId : groups[0]?.id || '';

  const handleConfirmDeleteGroup = (group: ClassGroup) => {
    const count = students.filter((s) => s.groupId === group.id).length;
    if (window.confirm(t.students.confirmDeleteGroup(group.name, count))) {
      onDeleteGroup(group.id);
      if (selectedGroupId === group.id) {
        setSelectedGroupId('all');
      }
    }
  };

  const handleConfirmDeleteStudent = (student: Student) => {
    if (window.confirm(t.students.confirmDeleteStudent(student.fullName))) {
      onDeleteStudent(student.id);
    }
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

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => {
              setEditingStudent(null);
              setStudentModalOpen(true);
            }}
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
          <p className="mt-2 text-2xl font-extrabold text-slate-900">{studentsInGroup.length}</p>
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
          <p className="mt-2 text-2xl font-extrabold text-slate-900">{studentsInGroup.length}</p>
        </div>
      </div>

      {/* Groups Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200/80 bg-white p-3 shadow-2xs">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setSelectedGroupId('all')}
            className={`inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-semibold transition ${
              effectiveGroupId === 'all'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'bg-slate-100/80 text-slate-600 hover:bg-slate-200/70 hover:text-slate-900'
            }`}
          >
            <span>{t.students.allGroups}</span>
            <span
              className={`rounded-full px-1.5 py-0.5 text-[10px] ${
                effectiveGroupId === 'all'
                  ? 'bg-white/20 text-white'
                  : 'bg-white text-slate-600'
              }`}
            >
              {students.length}
            </span>
          </button>

          {groups.map((group) => {
            const count = students.filter((s) => s.groupId === group.id).length;
            const active = effectiveGroupId === group.id;
            return (
              <div
                key={group.id}
                className={`group inline-flex items-center rounded-xl transition ${
                  active
                    ? 'bg-teal-50 ring-1 ring-teal-300 text-teal-900'
                    : 'bg-slate-100/80 text-slate-700 hover:bg-slate-200/60'
                }`}
              >
                <button
                  type="button"
                  onClick={() => setSelectedGroupId(group.id)}
                  className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold"
                >
                  <span className={`h-2 w-2 rounded-full ${GROUP_DOT_CLASSES[group.color]}`} />
                  <span>{group.name}</span>
                  <span className="rounded-full bg-white/80 px-1.5 py-0.5 text-[10px] text-slate-600">
                    {count}
                  </span>
                </button>
                {active && (
                  <div className="flex items-center pr-1.5 gap-0.5">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingGroup(group);
                        setGroupModalOpen(true);
                      }}
                      title={t.students.editGroup}
                      className="rounded-lg p-1 text-teal-700/70 hover:bg-teal-100 hover:text-teal-900"
                    >
                      <Pencil className="h-3 w-3" />
                    </button>
                    {groups.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleConfirmDeleteGroup(group)}
                        title={t.students.deleteGroup}
                        className="rounded-lg p-1 text-teal-700/70 hover:bg-rose-100 hover:text-rose-700"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <button
          type="button"
          onClick={() => {
            setEditingGroup(null);
            setGroupModalOpen(true);
          }}
          className="inline-flex items-center gap-1.5 rounded-xl border border-dashed border-slate-300 px-3 py-2 text-xs font-semibold text-slate-600 transition hover:border-teal-400 hover:bg-teal-50/50 hover:text-teal-800"
        >
          <FolderPlus className="h-3.5 w-3.5" />
          {t.students.newGroup}
        </button>
      </div>

      {/* Main Roster Panel */}
      <div className="rounded-2xl border border-slate-200/80 bg-white shadow-2xs overflow-hidden">
        {/* Search & Tag Filters */}
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 md:flex-row md:items-center md:justify-between">
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

        {/* Empty State or Table */}
        {studentsInGroup.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-teal-50 text-teal-600 mb-4">
              <Users className="h-8 w-8" />
            </div>
            <h3 className="text-base font-bold text-slate-900">
              {activeGroup ? `${activeGroup.name}: ` : ''}
              {t.students.emptyTitle}
            </h3>
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
                onClick={() => {
                  setEditingStudent(null);
                  setStudentModalOpen(true);
                }}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
              >
                <UserPlus className="h-4 w-4" />
                {t.students.addStudent}
              </button>
              {students.length === 0 && (
                <button
                  type="button"
                  onClick={onLoadSampleClassroom}
                  className="inline-flex items-center gap-2 rounded-xl border border-teal-200 bg-teal-50/70 px-4 py-2.5 text-xs font-semibold text-teal-800 hover:bg-teal-100/70 transition"
                >
                  <Wand2 className="h-4 w-4" />
                  {t.students.loadSample}
                </button>
              )}
            </div>
          </div>
        ) : filteredStudents.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
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
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead className="bg-slate-50/80 border-b border-slate-100 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="py-3 pl-5 pr-3">{t.students.columns.student}</th>
                  <th className="py-3 px-3">{t.students.columns.code}</th>
                  <th className="py-3 px-3">{t.students.columns.group}</th>
                  <th className="py-3 px-3">{t.students.columns.tags}</th>
                  <th className="py-3 px-3">{t.students.columns.records}</th>
                  <th className="py-3 pl-3 pr-5 text-right">{t.students.columns.actions}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {filteredStudents.map((student) => {
                  const grp = groupMap.get(student.groupId);
                  return (
                    <tr
                      key={student.id}
                      onClick={() => onOpenStudentDossier(student.id)}
                      className="group cursor-pointer transition hover:bg-slate-50/80"
                    >
                      <td className="py-3.5 pl-5 pr-3">
                        <div className="flex items-center gap-3">
                          <div
                            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-xs font-bold ${getAvatarBg(
                              student.fullName
                            )}`}
                          >
                            {getInitials(student.fullName)}
                          </div>
                          <div className="min-w-0">
                            <p className="font-semibold text-slate-900 truncate group-hover:text-teal-700 transition-colors">
                              {student.fullName}
                            </p>
                            {student.notes && (
                              <p className="text-[11px] text-slate-400 truncate max-w-xs">
                                {student.notes}
                              </p>
                            )}
                          </div>
                        </div>
                      </td>

                      <td className="py-3.5 px-3">
                        <code className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-mono font-semibold text-slate-700">
                          {student.code}
                        </code>
                      </td>

                      <td className="py-3.5 px-3">
                        {grp ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700">
                            <span
                              className={`h-1.5 w-1.5 rounded-full ${GROUP_DOT_CLASSES[grp.color]}`}
                            />
                            {grp.name}
                          </span>
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </td>

                      <td className="py-3.5 px-3">
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

                      <td className="py-3.5 px-3">
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-50 border border-slate-200/80 px-2.5 py-0.5 text-[11px] font-medium text-slate-600">
                          <span
                            className={`h-1.5 w-1.5 rounded-full ${
                              student.evaluations.length > 0 ? 'bg-emerald-500' : 'bg-slate-300'
                            }`}
                          />
                          {t.students.evaluationsCount(student.evaluations.length)}
                        </span>
                      </td>

                      <td
                        className="py-3.5 pl-3 pr-5 text-right"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="inline-flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => onOpenStudentDossier(student.id)}
                            title={t.students.actions.viewDossier}
                            className="rounded-lg p-1.5 text-slate-400 hover:bg-teal-50 hover:text-teal-700 transition"
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
                            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleConfirmDeleteStudent(student)}
                            title={t.students.actions.delete}
                            className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modals & Dossier Drawer */}
      <SmartImporterModal
        open={importerOpen}
        groups={groups}
        defaultGroupId={defaultTargetGroupId}
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
        defaultGroupId={defaultTargetGroupId}
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
