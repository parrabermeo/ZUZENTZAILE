import React, { useMemo, useState } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
} from 'recharts';
import { TrendingUp, Radar as RadarIcon, Filter } from 'lucide-react';
import type { EvaluationRecord, Language, TextTypologyId } from '../types';
import type { Translations } from '../i18n/translations';
import { TEXT_TYPOLOGIES } from '../data/defaultRubrics';
import {
  computeStudentRadarData,
  computeStudentTimelineData,
  type TimelinePoint,
} from '../utils/analytics';

interface StudentEvolutionChartsProps {
  evaluations: EvaluationRecord[];
  subjectLabel?: string;
  lang: Language;
  t: Translations;
}

interface CustomLineTooltipProps {
  active?: boolean;
  payload?: Array<{
    name: string;
    value: number;
    color: string;
    payload: TimelinePoint;
  }>;
  lang: Language;
}

const CustomTimelineTooltip: React.FC<CustomLineTooltipProps> = ({ active, payload, lang }) => {
  if (!active || !payload || payload.length === 0) return null;
  const point = payload[0].payload;
  const typMeta = point.typology
    ? TEXT_TYPOLOGIES.find((item) => item.id === point.typology)
    : undefined;

  return (
    <div className="rounded-xl border border-slate-200 bg-white/95 p-3 shadow-lg text-xs max-w-xs">
      <p className="font-mono text-[11px] font-bold text-slate-400">{point.date}</p>
      <p className="mt-0.5 font-extrabold text-slate-900 leading-snug">{point.title}</p>
      {typMeta && (
        <span className="mt-1 inline-block rounded-full bg-amber-50 border border-amber-200 px-2 py-0.5 text-[10px] font-bold text-amber-900">
          {typMeta.title[lang]}
        </span>
      )}
      <div className="mt-2 space-y-1 border-t border-slate-100 pt-1.5">
        {payload.map((entry) => (
          <div key={entry.name} className="flex items-center justify-between gap-4 font-bold">
            <span className="flex items-center gap-1.5" style={{ color: entry.color }}>
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: entry.color }}
              />
              {entry.name}
            </span>
            <span className="text-slate-900">{Number(entry.value).toFixed(1)} / 10</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export const StudentEvolutionCharts: React.FC<StudentEvolutionChartsProps> = ({
  evaluations,
  subjectLabel,
  lang,
  t,
}) => {
  const [modalityFilter, setModalityFilter] = useState<'all' | 'reading' | 'writing'>('all');
  const [typologyFilter, setTypologyFilter] = useState<'all' | TextTypologyId>('all');

  const availableTypologies = useMemo(() => {
    const set = new Set<TextTypologyId>();
    evaluations.forEach((ev) => {
      if (ev.type === 'writing' && ev.typology) set.add(ev.typology);
    });
    return TEXT_TYPOLOGIES.filter((item) => set.has(item.id));
  }, [evaluations]);

  const timelineData = useMemo(
    () =>
      computeStudentTimelineData(
        evaluations,
        modalityFilter,
        modalityFilter === 'reading' ? 'all' : typologyFilter
      ),
    [evaluations, modalityFilter, typologyFilter]
  );

  const radarResult = useMemo(
    () => computeStudentRadarData(evaluations, lang),
    [evaluations, lang]
  );

  if (evaluations.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-200/80 bg-white p-6 text-center text-xs text-slate-500">
        {t.dossier.noChartsData}
      </div>
    );
  }

  const showReadingLine = modalityFilter !== 'writing' && typologyFilter === 'all';
  const showWritingLine = modalityFilter !== 'reading';

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-extrabold uppercase tracking-wider text-slate-700">
          <TrendingUp className="h-4 w-4 text-teal-600" />
          {t.dossier.evolutionSectionTitle}
          {subjectLabel && (
            <span className="rounded-full bg-slate-100 border border-slate-200 px-2.5 py-0.5 text-[11px] font-bold normal-case text-slate-700">
              {subjectLabel}
            </span>
          )}
        </h3>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* 1. Chronological Line Chart (0-10, strictly left-to-right by delivery date) */}
        <div className="lg:col-span-7 rounded-2xl border border-slate-200/90 bg-white p-5 shadow-2xs">
          <div className="flex flex-col gap-3 mb-4">
            <div>
              <h4 className="text-sm font-extrabold text-slate-900">
                {t.dossier.evolutionLineTitle}
              </h4>
              <p className="text-[11px] text-slate-500 mt-0.5">{t.dossier.evolutionLineSub}</p>
            </div>

            {/* Modality & Typology Filters */}
            <div className="no-print flex flex-wrap items-center justify-between gap-2">
              <div className="inline-flex flex-wrap rounded-xl bg-slate-100 p-1 gap-0.5">
                {(
                  [
                    ['all', t.dossier.filterAllTests],
                    ['reading', t.dossier.filterReadingOnly],
                    ['writing', t.dossier.filterWritingOnly],
                  ] as const
                ).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => {
                      setModalityFilter(key);
                      if (key === 'reading') setTypologyFilter('all');
                    }}
                    className={`rounded-lg px-2.5 py-1 text-[11px] font-bold transition ${
                      modalityFilter === key
                        ? 'bg-white text-teal-800 shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {modalityFilter !== 'reading' && availableTypologies.length > 0 && (
                <div className="inline-flex items-center gap-1.5 shrink-0">
                  <Filter className="h-3.5 w-3.5 text-slate-400" />
                  <select
                    value={typologyFilter}
                    onChange={(e) => setTypologyFilter(e.target.value as 'all' | TextTypologyId)}
                    className="rounded-xl border border-slate-200 bg-slate-50/70 px-2.5 py-1.5 text-xs font-semibold text-slate-700 focus:border-teal-500 focus:bg-white focus:outline-none"
                  >
                    <option value="all">{t.dossier.allTypologiesFilter}</option>
                    {availableTypologies.map((typ) => (
                      <option key={typ.id} value={typ.id}>
                        {typ.title[lang]}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          </div>

          <div className="w-full h-[320px] min-h-[320px] max-h-[320px] overflow-hidden relative">
            <ResponsiveContainer width="100%" height={320}>
              <LineChart data={timelineData} margin={{ top: 12, right: 18, left: -16, bottom: 26 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis
                  dataKey="xAxisLabel"
                  interval={0}
                  angle={timelineData.length > 4 ? -22 : 0}
                  textAnchor={timelineData.length > 4 ? 'end' : 'middle'}
                  height={timelineData.length > 4 ? 54 : 32}
                  tick={{ fontSize: 10, fill: '#475569', fontWeight: 600 }}
                  tickMargin={8}
                />
                <YAxis
                  domain={[0, 10]}
                  ticks={[0, 2, 4, 6, 8, 10]}
                  tick={{ fontSize: 11, fill: '#64748b' }}
                />
                <Tooltip content={<CustomTimelineTooltip lang={lang} />} />
                <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '4px' }} />
                {showReadingLine && (
                  <Line
                    type="monotone"
                    dataKey="readingScore"
                    name={t.reports.readingSeries}
                    stroke="#4f46e5"
                    strokeWidth={2.5}
                    connectNulls
                    isAnimationActive={false}
                    dot={{ r: 5.5, fill: '#4f46e5', strokeWidth: 2, stroke: '#ffffff' }}
                    activeDot={{ r: 7.5 }}
                  />
                )}
                {showWritingLine && (
                  <Line
                    type="monotone"
                    dataKey="writingScore"
                    name={t.reports.writingSeries}
                    stroke="#0d9488"
                    strokeWidth={2.5}
                    connectNulls
                    isAnimationActive={false}
                    dot={{ r: 5.5, fill: '#0d9488', strokeWidth: 2, stroke: '#ffffff' }}
                    activeDot={{ r: 7.5 }}
                  />
                )}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* 2. Competency Profile Radar (Spider) Chart */}
        <div className="lg:col-span-5 rounded-2xl border border-slate-200/90 bg-white p-5 shadow-2xs">
          <div className="mb-3">
            <h4 className="flex items-center gap-1.5 text-sm font-extrabold text-slate-900">
              <RadarIcon className="h-4 w-4 text-indigo-600" />
              {t.dossier.radarTitle}
            </h4>
            <p className="text-[11px] text-slate-500 mt-0.5">
              {radarResult.mode === 'reading'
                ? t.dossier.radarReadingSub
                : t.dossier.radarWritingSub}
            </p>
          </div>

          {radarResult.mode === 'empty' ? (
            <div className="flex h-[300px] items-center justify-center text-xs text-slate-400">
              {t.dossier.noChartsData}
            </div>
          ) : (
            <div className="w-full h-[300px] min-h-[300px] max-h-[300px] overflow-hidden relative">
              <ResponsiveContainer width="100%" height={300}>
                <RadarChart cx="50%" cy="50%" outerRadius="72%" data={radarResult.data}>
                  <PolarGrid stroke="#e2e8f0" />
                  <PolarAngleAxis
                    dataKey="dimension"
                    tick={{ fontSize: 11, fill: '#334155', fontWeight: 600 }}
                  />
                  <PolarRadiusAxis
                    angle={90}
                    domain={[0, 4]}
                    tickCount={5}
                    tick={{ fontSize: 10, fill: '#94a3b8' }}
                  />
                  <Tooltip
                    formatter={(value: number) => [`${Number(value).toFixed(2)} / 4`, 'Nivel']}
                    contentStyle={{
                      borderRadius: '12px',
                      border: '1px solid #e2e8f0',
                      fontSize: '12px',
                    }}
                  />
                  <Radar
                    name={radarResult.mode === 'reading' ? t.reports.readingSeries : t.reports.writingSeries}
                    dataKey="score"
                    stroke={radarResult.mode === 'reading' ? '#4f46e5' : '#0d9488'}
                    fill={radarResult.mode === 'reading' ? '#4f46e5' : '#0d9488'}
                    fillOpacity={0.28}
                    strokeWidth={2.5}
                    isAnimationActive={false}
                  />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>
    </section>
  );
};
