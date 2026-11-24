/**
 * Semantic classroom score badge styling (0-10 scale):
 *  - 8.0 – 10.0 : Emerald
 *  - 6.5 –  7.9 : Blue
 *  - 5.0 –  6.4 : Amber
 *  - < 5.0      : Coral / Rose
 */
export function getScoreBadgeClasses(score: number | null | undefined): string {
  if (score === null || score === undefined) {
    return 'bg-slate-50 text-slate-400 border-slate-200';
  }
  if (score >= 8) {
    return 'bg-emerald-50 text-emerald-800 border-emerald-200';
  }
  if (score >= 6.5) {
    return 'bg-blue-50 text-blue-800 border-blue-200';
  }
  if (score >= 5) {
    return 'bg-amber-50 text-amber-800 border-amber-200';
  }
  return 'bg-rose-50 text-rose-800 border-rose-200';
}

export const RUBRIC_LEVEL_BADGE_CLASSES: Record<1 | 2 | 3 | 4, string> = {
  1: 'bg-rose-50 text-rose-800 border-rose-200',
  2: 'bg-amber-50 text-amber-800 border-amber-200',
  3: 'bg-blue-50 text-blue-800 border-blue-200',
  4: 'bg-emerald-50 text-emerald-800 border-emerald-200',
};
