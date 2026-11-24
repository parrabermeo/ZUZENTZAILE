import type {
  ClassGroup,
  EvaluationRecord,
  Language,
  Student,
  SubjectId,
  TextTypologyId,
} from '../types';
import { TEXT_TYPOLOGIES } from '../data/defaultRubrics';
import { resolveEvaluationSubject } from './subjects';

export type TrendDirection = 'up' | 'stable' | 'down' | 'none';

export interface StudentTrendResult {
  direction: TrendDirection;
  delta: number | null;
}

export interface TimelinePoint {
  id: string;
  date: string;
  dateLabel: string;
  xAxisLabel: string; // e.g. "12/10 - Irakurmena 1"
  title: string;
  type: 'reading' | 'writing';
  typology?: TextTypologyId;
  readingScore: number | null;
  writingScore: number | null;
}

export interface RadarDimensionPoint {
  key: string;
  dimension: string;
  score: number; // 0-4 scale
  fullMark: 4;
  sampleCount: number;
}

export interface ClassMatrixRow {
  student: Student;
  groupName: string;
  totalEvals: number;
  globalAvg: number | null;
  readingAvg: number | null;
  writingAvg: number | null;
  typologyAvgs: Partial<Record<TextTypologyId, number | null>>;
  trend: StudentTrendResult;
}

export interface ClassTimelinePoint {
  date: string;
  dateLabel: string;
  readingAvg: number | null;
  writingAvg: number | null;
  readingCount: number;
  writingCount: number;
}

export interface ClassMatrixSummary {
  rows: ClassMatrixRow[];
  workedTypologies: TextTypologyId[];
  classGlobalAvg: number | null;
  classReadingAvg: number | null;
  classWritingAvg: number | null;
  classTypologyAvgs: Partial<Record<TextTypologyId, number | null>>;
  timeline: ClassTimelinePoint[];
  totalEvaluations: number;
}

function avg(nums: number[]): number | null {
  if (nums.length === 0) return null;
  const sum = nums.reduce((a, b) => a + b, 0);
  return Number((sum / nums.length).toFixed(1));
}

export function sortEvaluationsChronologically(evals: EvaluationRecord[]): EvaluationRecord[] {
  return [...evals].sort((a, b) => {
    const dateDiff = a.date.localeCompare(b.date);
    if (dateDiff !== 0) return dateDiff;
    return (a.createdAt || '').localeCompare(b.createdAt || '');
  });
}

function formatShortDate(isoDate: string): string {
  const parts = isoDate.split('-');
  if (parts.length !== 3) return isoDate;
  return `${parts[2]}/${parts[1]}`;
}

function buildXAxisLabel(isoDate: string, title: string): string {
  const shortDate = formatShortDate(isoDate);
  const cleanTitle = title.trim();
  const shortTitle = cleanTitle.length > 18 ? `${cleanTitle.slice(0, 17)}…` : cleanTitle;
  return shortTitle ? `${shortDate} - ${shortTitle}` : shortDate;
}

export function computeStudentTimelineData(
  evaluations: EvaluationRecord[],
  modalityFilter: 'all' | 'reading' | 'writing' = 'all',
  typologyFilter: 'all' | TextTypologyId = 'all'
): TimelinePoint[] {
  // Strictly chronological left-to-right (oldest -> newest)
  const sorted = sortEvaluationsChronologically(evaluations);
  const filtered = sorted.filter((ev) => {
    if (modalityFilter === 'reading' && ev.type !== 'reading') return false;
    if (modalityFilter === 'writing' && ev.type !== 'writing') return false;
    if (typologyFilter !== 'all') {
      if (ev.type !== 'writing' || ev.typology !== typologyFilter) return false;
    }
    return true;
  });

  return filtered.map((ev) => ({
    id: ev.id,
    date: ev.date,
    dateLabel: formatShortDate(ev.date),
    xAxisLabel: buildXAxisLabel(ev.date, ev.title),
    title: ev.title,
    type: ev.type,
    typology: ev.typology,
    readingScore: ev.type === 'reading' ? ev.overallScore : null,
    writingScore: ev.type === 'writing' ? ev.overallScore : null,
  }));
}

type CoreDimensionKey = 'adequacy' | 'coherence' | 'cohesion' | 'lexicon' | 'orthography';

const CORE_DIMENSION_LABELS: Record<CoreDimensionKey, Record<Language, string>> = {
  adequacy: { eu: 'Egokitasuna', es: 'Adecuación' },
  coherence: { eu: 'Koherentzia', es: 'Coherencia' },
  cohesion: { eu: 'Kohesioa', es: 'Cohesión' },
  lexicon: { eu: 'Lexikoa', es: 'Léxico' },
  orthography: { eu: 'Ortografia', es: 'Ortografía' },
};

function classifyWritingDimension(name: string, index: number): CoreDimensionKey {
  const norm = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

  if (/adecuaci|egokitasun|proposit|helburu/.test(norm)) return 'adequacy';
  if (/coheren|koherentz|estructur|egitur|gener/.test(norm)) return 'coherence';
  if (/cohesi|kohesio|conector|lokailu/.test(norm)) return 'cohesion';
  if (/lexic|vocabular|hiztegi|aberastasun/.test(norm)) return 'lexicon';
  if (/ortograf|gramat|zuzentasun|puntuaci|puntuazio|ergatib/.test(norm)) return 'orthography';

  const fallbackOrder: CoreDimensionKey[] = [
    'adequacy',
    'coherence',
    'cohesion',
    'lexicon',
    'orthography',
  ];
  return fallbackOrder[index % fallbackOrder.length];
}

type ReadingDimensionKey = 'explicit' | 'inference' | 'global' | 'writingQuality';

const READING_DIMENSION_LABELS: Record<ReadingDimensionKey, Record<Language, string>> = {
  explicit: { eu: 'Inf. Esplizitua', es: 'Inf. Explícita' },
  inference: { eu: 'Inferentzia', es: 'Inferencia' },
  global: { eu: 'Ulermen Globala', es: 'Comp. Global' },
  writingQuality: { eu: 'Idazkera', es: 'Redacción Resp.' },
};

function classifyReadingDimension(name: string, index: number): ReadingDimensionKey {
  const norm = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

  if (/explicit|esplizitu|localiz|kokapen/.test(norm)) return 'explicit';
  if (/inferen|interpret/.test(norm)) return 'inference';
  if (/global|estructur|egitur|resumen|laburpen/.test(norm)) return 'global';
  if (/redacc|idazker|respuest|erantzun|ortograf/.test(norm)) return 'writingQuality';

  const order: ReadingDimensionKey[] = ['explicit', 'inference', 'global', 'writingQuality'];
  return order[index % order.length];
}

export function computeStudentRadarData(
  evaluations: EvaluationRecord[],
  lang: Language
): { mode: 'writing' | 'reading' | 'empty'; data: RadarDimensionPoint[] } {
  const writingEvals = evaluations.filter(
    (ev) => ev.type === 'writing' && ev.criteriaResults && ev.criteriaResults.length > 0
  );

  if (writingEvals.length > 0) {
    const buckets: Record<CoreDimensionKey, number[]> = {
      adequacy: [],
      coherence: [],
      cohesion: [],
      lexicon: [],
      orthography: [],
    };

    for (const ev of writingEvals) {
      (ev.criteriaResults || []).forEach((crit, idx) => {
        const key = classifyWritingDimension(crit.name, idx);
        buckets[key].push(crit.level);
      });
    }

    const keys: CoreDimensionKey[] = [
      'adequacy',
      'coherence',
      'cohesion',
      'lexicon',
      'orthography',
    ];

    return {
      mode: 'writing',
      data: keys.map((key) => {
        const vals = buckets[key];
        const score = vals.length > 0 ? Number((vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2)) : 0;
        return {
          key,
          dimension: CORE_DIMENSION_LABELS[key][lang],
          score,
          fullMark: 4,
          sampleCount: vals.length,
        };
      }),
    };
  }

  // Fallback to Reading competency radar if student only has Reading evaluations so far
  const readingEvals = evaluations.filter(
    (ev) => ev.type === 'reading' && ev.criteriaResults && ev.criteriaResults.length > 0
  );

  if (readingEvals.length > 0) {
    const buckets: Record<ReadingDimensionKey, number[]> = {
      explicit: [],
      inference: [],
      global: [],
      writingQuality: [],
    };

    for (const ev of readingEvals) {
      (ev.criteriaResults || []).forEach((crit, idx) => {
        const key = classifyReadingDimension(crit.name, idx);
        buckets[key].push(crit.level);
      });
    }

    const keys: ReadingDimensionKey[] = ['explicit', 'inference', 'global', 'writingQuality'];
    return {
      mode: 'reading',
      data: keys.map((key) => {
        const vals = buckets[key];
        const score = vals.length > 0 ? Number((vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2)) : 0;
        return {
          key,
          dimension: READING_DIMENSION_LABELS[key][lang],
          score,
          fullMark: 4,
          sampleCount: vals.length,
        };
      }),
    };
  }

  return { mode: 'empty', data: [] };
}

export function computeStudentTrend(evaluations: EvaluationRecord[]): StudentTrendResult {
  if (evaluations.length < 2) {
    return { direction: 'none', delta: null };
  }

  const sorted = sortEvaluationsChronologically(evaluations);
  const latest = sorted[sorted.length - 1].overallScore;
  const previousScores = sorted.slice(0, -1).map((e) => e.overallScore);
  const prevAvg = previousScores.reduce((a, b) => a + b, 0) / previousScores.length;
  const delta = Number((latest - prevAvg).toFixed(1));

  if (delta >= 0.3) return { direction: 'up', delta };
  if (delta <= -0.3) return { direction: 'down', delta };
  return { direction: 'stable', delta };
}

export function buildClassMatrix(
  students: Student[],
  groups: ClassGroup[],
  groupFilter: string,
  subjectFilter: SubjectId = 'euskera'
): ClassMatrixSummary {
  const groupMap = new Map(groups.map((g) => [g.id, g]));
  const filteredStudents =
    groupFilter === 'all' ? students : students.filter((s) => s.groupId === groupFilter);

  const workedTypologySet = new Set<TextTypologyId>();
  const allGlobalScores: number[] = [];
  const allReadingScores: number[] = [];
  const allWritingScores: number[] = [];
  const typologyBucket: Partial<Record<TextTypologyId, number[]>> = {};
  const dateBuckets = new Map<string, { reading: number[]; writing: number[] }>();

  let totalEvaluations = 0;

  const rows: ClassMatrixRow[] = filteredStudents.map((student) => {
    const evals = (student.evaluations || []).filter(
      (ev) => resolveEvaluationSubject(ev) === subjectFilter
    );
    totalEvaluations += evals.length;

    const readingScores: number[] = [];
    const writingScores: number[] = [];
    const perTypology: Partial<Record<TextTypologyId, number[]>> = {};

    for (const ev of evals) {
      allGlobalScores.push(ev.overallScore);

      let dateEntry = dateBuckets.get(ev.date);
      if (!dateEntry) {
        dateEntry = { reading: [], writing: [] };
        dateBuckets.set(ev.date, dateEntry);
      }

      if (ev.type === 'reading') {
        readingScores.push(ev.overallScore);
        allReadingScores.push(ev.overallScore);
        dateEntry.reading.push(ev.overallScore);
      } else {
        writingScores.push(ev.overallScore);
        allWritingScores.push(ev.overallScore);
        dateEntry.writing.push(ev.overallScore);

        if (ev.typology) {
          workedTypologySet.add(ev.typology);
          if (!perTypology[ev.typology]) perTypology[ev.typology] = [];
          perTypology[ev.typology]!.push(ev.overallScore);
          if (!typologyBucket[ev.typology]) typologyBucket[ev.typology] = [];
          typologyBucket[ev.typology]!.push(ev.overallScore);
        }
      }
    }

    const typologyAvgs: Partial<Record<TextTypologyId, number | null>> = {};
    for (const t of TEXT_TYPOLOGIES) {
      typologyAvgs[t.id] = avg(perTypology[t.id] || []);
    }

    return {
      student,
      groupName: groupMap.get(student.groupId)?.name || '—',
      totalEvals: evals.length,
      globalAvg: avg(evals.map((e) => e.overallScore)),
      readingAvg: avg(readingScores),
      writingAvg: avg(writingScores),
      typologyAvgs,
      trend: computeStudentTrend(evals),
    };
  });

  // Preserve canonical typology order
  const workedTypologies = TEXT_TYPOLOGIES.map((t) => t.id).filter((id) =>
    workedTypologySet.has(id)
  );

  const classTypologyAvgs: Partial<Record<TextTypologyId, number | null>> = {};
  for (const tid of workedTypologies) {
    classTypologyAvgs[tid] = avg(typologyBucket[tid] || []);
  }

  const timeline: ClassTimelinePoint[] = Array.from(dateBuckets.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, bucket]) => ({
      date,
      dateLabel: formatShortDate(date),
      readingAvg: avg(bucket.reading),
      writingAvg: avg(bucket.writing),
      readingCount: bucket.reading.length,
      writingCount: bucket.writing.length,
    }));

  return {
    rows,
    workedTypologies,
    classGlobalAvg: avg(allGlobalScores),
    classReadingAvg: avg(allReadingScores),
    classWritingAvg: avg(allWritingScores),
    classTypologyAvgs,
    timeline,
    totalEvaluations,
  };
}

function escapeCsvCell(val: string | number | null | undefined): string {
  const s = val === null || val === undefined ? '' : String(val);
  if (s.includes(';') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function exportClassMatrixToCsv(
  summary: ClassMatrixSummary,
  lang: Language,
  groupLabel: string,
  subjectLabel?: string
): void {
  const typologyHeaders = summary.workedTypologies.map((tid) => {
    const meta = TEXT_TYPOLOGIES.find((t) => t.id === tid);
    return meta ? meta.title[lang] : tid;
  });

  const headers =
    lang === 'eu'
      ? [
          'ID Kodea',
          'Ikaslea',
          'Taldea',
          'Etiketak',
          'Entregak',
          'Batez besteko globala',
          'Irakurmena (Batez bestekoa)',
          'Idazmena (Batez bestekoa)',
          ...typologyHeaders,
          'Joera',
        ]
      : [
          'Código ID',
          'Alumno/a',
          'Grupo',
          'Etiquetas',
          'Entregas',
          'Media Global',
          'Media Comprensión',
          'Media Expresión',
          ...typologyHeaders,
          'Tendencia',
        ];

  const trendText = (dir: TrendDirection, delta: number | null): string => {
    if (dir === 'none' || delta === null) return '-';
    const sign = delta > 0 ? `+${delta.toFixed(1)}` : delta.toFixed(1);
    if (dir === 'up') return lang === 'eu' ? `↗ Hobetzen (${sign})` : `↗ Mejora (${sign})`;
    if (dir === 'down') return lang === 'eu' ? `↘ Behera (${sign})` : `↘ Baja (${sign})`;
    return lang === 'eu' ? `→ Egonkorra (${sign})` : `→ Estable (${sign})`;
  };

  const lines: string[] = [headers.map(escapeCsvCell).join(';')];

  for (const row of summary.rows) {
    const cells = [
      row.student.code,
      row.student.fullName,
      row.groupName,
      row.student.tags.join(', '),
      row.totalEvals,
      row.globalAvg !== null ? row.globalAvg.toFixed(1).replace('.', ',') : '',
      row.readingAvg !== null ? row.readingAvg.toFixed(1).replace('.', ',') : '',
      row.writingAvg !== null ? row.writingAvg.toFixed(1).replace('.', ',') : '',
      ...summary.workedTypologies.map((tid) => {
        const val = row.typologyAvgs[tid];
        return val !== null && val !== undefined ? val.toFixed(1).replace('.', ',') : '';
      }),
      trendText(row.trend.direction, row.trend.delta),
    ];
    lines.push(cells.map(escapeCsvCell).join(';'));
  }

  // Group averages summary row
  const summaryRow = [
    '',
    lang === 'eu' ? 'TALDEAREN BATEZ BESTEKOA' : 'MEDIA DEL GRUPO',
    groupLabel,
    '',
    summary.totalEvaluations,
    summary.classGlobalAvg !== null ? summary.classGlobalAvg.toFixed(1).replace('.', ',') : '',
    summary.classReadingAvg !== null ? summary.classReadingAvg.toFixed(1).replace('.', ',') : '',
    summary.classWritingAvg !== null ? summary.classWritingAvg.toFixed(1).replace('.', ',') : '',
    ...summary.workedTypologies.map((tid) => {
      const val = summary.classTypologyAvgs[tid];
      return val !== null && val !== undefined ? val.toFixed(1).replace('.', ',') : '';
    }),
    '',
  ];
  lines.push(summaryRow.map(escapeCsvCell).join(';'));

  // UTF-8 BOM ensures Excel opens Basque/Spanish accents cleanly on Windows
  const csvContent = '\uFEFF' + lines.join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const safeGroupSlug = groupLabel
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  const safeSubjectSlug = (subjectLabel || 'area')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  const dateStamp = new Date().toISOString().slice(0, 10);

  const a = document.createElement('a');
  a.href = url;
  a.download = `notas-lh6-${safeSubjectSlug}-${safeGroupSlug || 'grupo'}-${dateStamp}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
