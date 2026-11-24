import React, { useMemo, useState } from 'react';
import {
  BarChart3,
  Users,
  ClipboardCheck,
  Award,
  TrendingUp,
  Download,
  Printer,
  Search,
  ArrowUpDown,
  ExternalLink,
} from 'lucide-react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import type { ClassGroup, Language, Student, SubjectId } from '../types';
import type { Translations } from '../i18n/translations';
import { TEXT_TYPOLOGIES } from '../data/defaultRubrics';
import {
  buildClassMatrix,
  exportClassMatrixToCsv,
  type TrendDirection,
} from '../utils/analytics';
import { getScoreBadgeClasses } from '../utils/scoreStyles';
import { getSubjectLabel } from '../utils/subjects';

interface ReportsModuleProps {
  groups: ClassGroup[];
  students: Student[];
  lang: Language;
  t: Translations;
  onOpenStudentDossier: (studentId: string) => void;
  onNotify: (message: string, type?: 'success' | 'info' | 'warning' | 'error') => void;
}

type SortField = 'name' | 'global' | 'reading' | 'writing' | 'evals';

function formatScoreCell(score: number | null | undefined): string {
  if (score === null || score === undefined) return '—';
  return score.toFixed(1);
}

export const ReportsModule: React.FC<ReportsModuleProps> = ({
  groups,
  students,
  lang,
  t,
  onOpenStudentDossier,
  onNotify,
}) => {
  const [selectedGroupId, setSelectedGroupId] = useState<string>(groups[0]?.id || 'all');
  const [selectedSubject, setSelectedSubject] = useState<SubjectId>('euskera');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortAsc, setSortAsc] = useState<boolean>(true);

  const effectiveGroupId =
    selectedGroupId !== 'all' && !groups.some((g) => g.id === selectedGroupId)
      ? 'all'
      : selectedGroupId;

  const activeSubjectLabel = getSubjectLabel(selectedSubject, lang);

  const matrix = useMemo(
    () => buildClassMatrix(students, groups, effectiveGroupId, selectedSubject),
    [students, groups, effectiveGroupId, selectedSubject]
  );

  const improvingCount = useMemo(
    () => matrix.rows.filter((r) => r.trend.direction === 'up').length,
    [matrix.rows]
  );

  const sortedRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const filtered = q
      ? matrix.rows.filter(
          (r) =>
            r.student.fullName.toLowerCase().includes(q) ||
            r.student.code.toLowerCase().includes(q)
        )
      : matrix.rows;

    return [...filtered].sort((a, b) => {
      let cmp = 0;
      if (sortField === 'name') {
        cmp = a.student.fullName.localeCompare(b.student.fullName, lang === 'eu' ? 'eu' : 'es');
      } else if (sortField === 'evals') {
        cmp = a.totalEvals - b.totalEvals;
      } else if (sortField === 'global') {
        cmp = (a.globalAvg ?? -1) - (b.globalAvg ?? -1);
      } else if (sortField === 'reading') {
        cmp = (a.readingAvg ?? -1) - (b.readingAvg ?? -1);
      } else if (sortField === 'writing') {
        cmp = (a.writingAvg ?? -1) - (b.writingAvg ?? -1);
      }
      return sortAsc ? cmp : -cmp;
    });
  }, [matrix.rows, searchQuery, sortField, sortAsc, lang]);

  const activeGroupLabel =
    effectiveGroupId === 'all'
      ? t.reports.allGroups
      : groups.find((g) => g.id === effectiveGroupId)?.name || t.reports.allGroups;

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortAsc((v) => !v);
    } else {
      setSortField(field);
      setSortAsc(field === 'name');
    }
  };

  const handleExportCsv = () => {
    exportClassMatrixToCsv(matrix, lang, activeGroupLabel, activeSubjectLabel);
    onNotify(t.toasts.csvExported, 'success');
  };

  const renderTrendBadge = (direction: TrendDirection, delta: number | null) => {
    if (direction === 'none' || delta === null) {
      return <span className="text-[11px] text-slate-300">—</span>;
    }
    const sign = delta > 0 ? `+${delta.toFixed(1)}` : delta.toFixed(1);
    if (direction === 'up') {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 text-[11px] font-bold text-emerald-800 whitespace-nowrap">
          ↗ {t.reports.trendUp} ({sign})
        </span>
      );
    }
    if (direction === 'down') {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 border border-rose-200 px-2.5 py-0.5 text-[11px] font-bold text-rose-800 whitespace-nowrap">
          ↘ {t.reports.trendDown} ({sign})
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 border border-slate-200 px-2.5 py-0.5 text-[11px] font-bold text-slate-700 whitespace-nowrap">
        → {t.reports.trendStable} ({sign})
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* Dedicated Formal A4 Print Header for Class Matrix */}
      <div className="hidden print:block border-b-2 border-indigo-600 pb-4 mb-2">
        <div className="flex items-end justify-between gap-4">
          <div className="space-y-1">
            <p className="text-[10px] font-bold uppercase tracking-wider text-indigo-700">
              {t.curriculumBadge}
            </p>
            <h1 className="text-xl font-extrabold text-slate-900">
              {t.reports.printMatrixTitle} · {activeSubjectLabel} · {activeGroupLabel}
            </h1>
            <p className="text-xs text-slate-600">
              {t.dossier.printIssueDateLabel}:{' '}
              {new Date().toLocaleDateString(lang === 'eu' ? 'eu-ES' : 'es-ES', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}
            </p>
          </div>
          <div className="flex items-center gap-3 text-center shrink-0">
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5">
              <p className="text-[9px] font-bold uppercase text-slate-500">{t.reports.enrolledLabel}</p>
              <p className="text-sm font-extrabold text-slate-900">{matrix.rows.length}</p>
            </div>
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 px-3 py-1.5">
              <p className="text-[9px] font-bold uppercase text-emerald-700">
                {t.reports.classGlobalAvgLabel}
              </p>
              <p className="text-sm font-extrabold text-emerald-950">
                {matrix.classGlobalAvg !== null ? `${matrix.classGlobalAvg.toFixed(1)}/10` : '—'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Page Header (Violet Theme) */}
      <div className="no-print flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-violet-50 border border-violet-200 px-2.5 py-0.5 text-[11px] font-bold text-violet-800 mb-2">
            <BarChart3 className="h-3.5 w-3.5 text-violet-600" />
            {t.nav.reports}
          </span>
          <h2 className="text-2xl font-extrabold tracking-tight text-slate-900">
            {t.reports.title}
          </h2>
          <p className="text-sm text-slate-500 mt-1 max-w-3xl">{t.reports.subtitle}</p>
        </div>

        {/* Export to Excel (.csv) & Print Matrix CTAs */}
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => window.print()}
            disabled={matrix.rows.length === 0}
            className="inline-flex items-center gap-2 rounded-xl border border-violet-200 bg-white px-4 py-2.5 text-xs font-bold text-violet-800 shadow-2xs hover:bg-violet-50 transition disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Printer className="h-4 w-4 text-violet-600" />
            {t.reports.printMatrixBtn}
          </button>

          <button
            type="button"
            onClick={handleExportCsv}
            disabled={matrix.rows.length === 0}
            className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-xs font-bold text-white shadow-sm shadow-violet-600/20 hover:bg-violet-700 transition disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Download className="h-4 w-4" />
            {t.reports.exportCsvBtn}
          </button>
        </div>
      </div>

      {/* Subject Filter + Group Filter Bar */}
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        {/* Prominent Subject Switcher (Euskera | Lengua Castellana) */}
        <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1 shadow-2xs">
          <button
            type="button"
            onClick={() => setSelectedSubject('euskera')}
            className={`rounded-lg px-4 py-1.5 text-xs font-extrabold transition ${
              selectedSubject === 'euskera'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {t.subjects.euskera}
          </button>
          <button
            type="button"
            onClick={() => setSelectedSubject('castellano')}
            className={`rounded-lg px-4 py-1.5 text-xs font-extrabold transition ${
              selectedSubject === 'castellano'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {t.subjects.castellano}
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setSelectedGroupId('all')}
            className={`rounded-xl px-3.5 py-2 text-xs font-bold transition ${
              effectiveGroupId === 'all'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            {t.reports.allGroups} ({students.length})
          </button>
          {groups.map((grp) => {
            const count = students.filter((s) => s.groupId === grp.id).length;
            const active = effectiveGroupId === grp.id;
            return (
              <button
                key={grp.id}
                type="button"
                onClick={() => setSelectedGroupId(grp.id)}
                className={`rounded-xl px-3.5 py-2 text-xs font-bold transition ${
                  active
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'bg-white border border-slate-200 text-slate-700 hover:border-indigo-300'
                }`}
              >
                {grp.name} ({count})
              </button>
            );
          })}
        </div>
      </div>

      {/* 4 Live KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-2xs">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
            <span>{t.reports.enrolledLabel}</span>
            <Users className="h-4 w-4 text-teal-600" />
          </div>
          <p className="mt-2 text-2xl font-extrabold text-slate-900">{matrix.rows.length}</p>
        </div>

        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-2xs">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
            <span>{t.reports.completedEvalsLabel}</span>
            <ClipboardCheck className="h-4 w-4 text-indigo-600" />
          </div>
          <p className="mt-2 text-2xl font-extrabold text-slate-900">{matrix.totalEvaluations}</p>
        </div>

        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-2xs">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
            <span>{t.reports.classGlobalAvgLabel}</span>
            <Award className="h-4 w-4 text-emerald-600" />
          </div>
          <p className="mt-2 text-2xl font-extrabold text-slate-900">
            {matrix.classGlobalAvg !== null ? `${matrix.classGlobalAvg.toFixed(1)} / 10` : '—'}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-2xs">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
            <span>{t.reports.improvingStudentsLabel}</span>
            <TrendingUp className="h-4 w-4 text-emerald-600" />
          </div>
          <p className="mt-2 text-2xl font-extrabold text-emerald-700">{improvingCount}</p>
        </div>
      </div>

      {/* Live Chronological Group Evolution Chart */}
      <div className="rounded-2xl border border-slate-200/80 bg-white p-5 sm:p-6 shadow-2xs">
        <div className="mb-4">
          <h3 className="text-sm font-extrabold text-slate-900">
            {t.reports.chartTitle} · {activeSubjectLabel} · {activeGroupLabel}
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">{t.reports.chartSubtitle}</p>
        </div>

        {matrix.timeline.length === 0 ? (
          <div className="flex h-52 items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/50 text-xs text-slate-500 px-4 text-center">
            {t.reports.chartEmpty}
          </div>
        ) : (
          <div className="w-full h-[300px] min-h-[300px] max-h-[300px] overflow-hidden relative">
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={matrix.timeline} margin={{ top: 10, right: 20, left: -14, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="dateLabel" tick={{ fontSize: 12, fill: '#64748b' }} />
                <YAxis
                  domain={[0, 10]}
                  ticks={[0, 2, 4, 6, 8, 10]}
                  tick={{ fontSize: 12, fill: '#64748b' }}
                />
                <Tooltip
                  formatter={(value: number) => `${Number(value).toFixed(1)} / 10`}
                  contentStyle={{
                    borderRadius: '12px',
                    border: '1px solid #e2e8f0',
                    fontSize: '12px',
                  }}
                />
                <Legend wrapperStyle={{ fontSize: '12px' }} />
                <Line
                  type="monotone"
                  dataKey="readingAvg"
                  name={t.reports.readingSeries}
                  stroke="#4f46e5"
                  strokeWidth={2.5}
                  connectNulls
                  isAnimationActive={false}
                  dot={{ r: 4, fill: '#4f46e5', stroke: '#ffffff', strokeWidth: 2 }}
                />
                <Line
                  type="monotone"
                  dataKey="writingAvg"
                  name={t.reports.writingSeries}
                  stroke="#0d9488"
                  strokeWidth={2.5}
                  connectNulls
                  isAnimationActive={false}
                  dot={{ r: 4, fill: '#0d9488', stroke: '#ffffff', strokeWidth: 2 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* CLASS PANORAMA MATRIX TABLE */}
      <div className="rounded-2xl border border-slate-200/90 border-t-2 border-t-violet-500 bg-white shadow-2xs overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:px-6 md:flex-row md:items-center md:justify-between">
          <div>
            <h3 className="text-base font-extrabold text-slate-900">
              {t.reports.matrixTitle} · {activeSubjectLabel} · {activeGroupLabel}
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">{t.reports.matrixSubtitle}</p>
          </div>

          <div className="no-print relative w-full md:w-64">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t.reports.searchPlaceholder}
              className="w-full rounded-xl border border-slate-200 bg-slate-50/70 py-2 pl-9 pr-3 text-xs text-slate-800 placeholder:text-slate-400 focus:border-teal-500 focus:bg-white focus:outline-none"
            />
          </div>
        </div>

        {sortedRows.length === 0 ? (
          <div className="p-12 text-center text-xs text-slate-500">{t.reports.noStudents}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead className="bg-slate-50/90 border-b border-slate-200/80 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="py-3 pl-5 pr-3">
                    <button
                      type="button"
                      onClick={() => handleSort('name')}
                      className="inline-flex items-center gap-1 hover:text-slate-900"
                    >
                      {t.reports.colStudent}
                      <ArrowUpDown className="h-3 w-3" />
                    </button>
                  </th>
                  <th className="py-3 px-2.5 text-center">
                    <button
                      type="button"
                      onClick={() => handleSort('evals')}
                      className="inline-flex items-center gap-1 hover:text-slate-900"
                    >
                      {t.reports.colEvals}
                      <ArrowUpDown className="h-3 w-3" />
                    </button>
                  </th>
                  <th className="py-3 px-2.5 text-center">
                    <button
                      type="button"
                      onClick={() => handleSort('global')}
                      className="inline-flex items-center gap-1 hover:text-slate-900"
                    >
                      {t.reports.colGlobal}
                      <ArrowUpDown className="h-3 w-3" />
                    </button>
                  </th>
                  <th className="py-3 px-2.5 text-center text-indigo-700">
                    <button
                      type="button"
                      onClick={() => handleSort('reading')}
                      className="inline-flex items-center gap-1 hover:text-indigo-950"
                    >
                      {t.reports.colReading}
                      <ArrowUpDown className="h-3 w-3" />
                    </button>
                  </th>
                  <th className="py-3 px-2.5 text-center text-teal-700">
                    <button
                      type="button"
                      onClick={() => handleSort('writing')}
                      className="inline-flex items-center gap-1 hover:text-teal-950"
                    >
                      {t.reports.colWriting}
                      <ArrowUpDown className="h-3 w-3" />
                    </button>
                  </th>

                  {/* Dynamic Columns for Each Worked Text Typology */}
                  {matrix.workedTypologies.map((tid) => {
                    const meta = TEXT_TYPOLOGIES.find((item) => item.id === tid);
                    return (
                      <th
                        key={tid}
                        className="py-3 px-2.5 text-center text-[10px] text-slate-500 whitespace-nowrap"
                      >
                        {meta ? meta.title[lang] : tid}
                      </th>
                    );
                  })}

                  <th className="py-3 pl-2.5 pr-5 text-right">{t.reports.colTrend}</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100 text-xs">
                {sortedRows.map((row) => (
                  <tr
                    key={row.student.id}
                    onClick={() => onOpenStudentDossier(row.student.id)}
                    className="group cursor-pointer hover:bg-teal-50/40 transition"
                  >
                    <td className="py-3 pl-5 pr-3">
                      <div className="flex items-center gap-2.5 min-w-[180px]">
                        <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] font-bold text-slate-600">
                          {row.student.code}
                        </code>
                        <span className="font-bold text-slate-900 group-hover:text-teal-800 truncate">
                          {row.student.fullName}
                        </span>
                        <ExternalLink className="h-3 w-3 shrink-0 text-slate-300 group-hover:text-teal-600 transition" />
                      </div>
                    </td>

                    <td className="py-3 px-2.5 text-center font-semibold text-slate-600">
                      {row.totalEvals}
                    </td>

                    <td className="py-3 px-2.5 text-center">
                      {row.globalAvg !== null ? (
                        <span
                          className={`inline-block rounded-lg border px-2 py-0.5 font-extrabold ${getScoreBadgeClasses(
                            row.globalAvg
                          )}`}
                        >
                          {formatScoreCell(row.globalAvg)}
                        </span>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>

                    <td className="py-3 px-2.5 text-center font-bold text-indigo-800">
                      {formatScoreCell(row.readingAvg)}
                    </td>

                    <td className="py-3 px-2.5 text-center font-bold text-teal-800">
                      {formatScoreCell(row.writingAvg)}
                    </td>

                    {matrix.workedTypologies.map((tid) => {
                      const val = row.typologyAvgs[tid];
                      return (
                        <td
                          key={tid}
                          className="py-3 px-2.5 text-center font-semibold text-slate-700"
                        >
                          {formatScoreCell(val)}
                        </td>
                      );
                    })}

                    <td className="py-3 pl-2.5 pr-5 text-right">
                      {renderTrendBadge(row.trend.direction, row.trend.delta)}
                    </td>
                  </tr>
                ))}
              </tbody>

              {/* Summary Footer Row: Class Averages */}
              <tfoot className="border-t-2 border-slate-200 bg-slate-50 font-extrabold text-xs text-slate-900">
                <tr>
                  <td className="py-3.5 pl-5 pr-3">{t.reports.groupAvgRow}</td>
                  <td className="py-3.5 px-2.5 text-center">{matrix.totalEvaluations}</td>
                  <td className="py-3.5 px-2.5 text-center">
                    {formatScoreCell(matrix.classGlobalAvg)}
                  </td>
                  <td className="py-3.5 px-2.5 text-center text-indigo-800">
                    {formatScoreCell(matrix.classReadingAvg)}
                  </td>
                  <td className="py-3.5 px-2.5 text-center text-teal-800">
                    {formatScoreCell(matrix.classWritingAvg)}
                  </td>
                  {matrix.workedTypologies.map((tid) => (
                    <td key={tid} className="py-3.5 px-2.5 text-center text-slate-800">
                      {formatScoreCell(matrix.classTypologyAvgs[tid])}
                    </td>
                  ))}
                  <td className="py-3.5 pl-2.5 pr-5 text-right text-[11px] text-emerald-700">
                    ↗ {improvingCount}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
