import type {
  EvaluationRecord,
  Language,
  ModalityEs,
  SavedTestDefinition,
  SkillMode,
  SubjectId,
} from '../types';

export function subjectToLanguage(subject: SubjectId): Language {
  return subject === 'castellano' ? 'es' : 'eu';
}

export function languageToSubject(lang: Language): SubjectId {
  return lang === 'es' ? 'castellano' : 'euskera';
}

export function skillToModalityEs(skill: SkillMode): ModalityEs {
  return skill === 'reading' ? 'comprension' : 'expresion';
}

export function resolveEvaluationSubject(ev: Pick<EvaluationRecord, 'asignatura' | 'language'>): SubjectId {
  if (ev.asignatura === 'euskera' || ev.asignatura === 'castellano') {
    return ev.asignatura;
  }
  return ev.language === 'es' ? 'castellano' : 'euskera';
}

/**
 * Guarantees that every saved EvaluationRecord has canonical, strictly matching
 * `asignatura`, `language`, `type`, `modalidad`, and `typology` fields so
 * StudentDossierView (Ikasleak) and TestHistoryModule (Proben Historiala)
 * always classify and display it identically.
 */
export function normalizeEvaluationRecord(record: EvaluationRecord): EvaluationRecord {
  const asignatura = resolveEvaluationSubject(record);
  const language = subjectToLanguage(asignatura);
  const type: SkillMode = record.type === 'writing' ? 'writing' : 'reading';
  const modalidad = skillToModalityEs(type);
  const typology = type === 'writing' ? record.typology || 'narrative' : undefined;
  const hasLocalImage = Boolean(
    record.hasLocalImage ||
      (record.pruebaImagenes && record.pruebaImagenes.length > 0) ||
      (record.studentImages && record.studentImages.length > 0)
  );

  return {
    ...record,
    title: record.title.trim(),
    asignatura,
    language,
    type,
    modalidad,
    typology,
    hasLocalImage: hasLocalImage || undefined,
  };
}

export function normalizeSavedTestDefinition(test: SavedTestDefinition): SavedTestDefinition {
  const asignatura: SubjectId =
    test.asignatura === 'castellano' || test.asignatura === 'euskera'
      ? test.asignatura
      : languageToSubject(test.language);
  const language = subjectToLanguage(asignatura);
  const type: SkillMode = test.type === 'writing' ? 'writing' : 'reading';
  const modalidad = skillToModalityEs(type);
  const typology = type === 'writing' ? test.typology || 'narrative' : undefined;
  const hasLocalImage = Boolean(
    test.hasLocalImage || (test.pruebaImagenes && test.pruebaImagenes.length > 0)
  );

  return {
    ...test,
    title: test.title.trim(),
    asignatura,
    language,
    type,
    modalidad,
    typology,
    hasLocalImage: hasLocalImage || undefined,
  };
}

export function getSubjectLabel(subject: SubjectId, uiLang: Language): string {
  if (subject === 'euskera') {
    return uiLang === 'eu' ? 'Euskara' : 'Euskera';
  }
  return uiLang === 'eu' ? 'Gaztelania' : 'Lengua Castellana';
}

export function getSubjectBadgeClasses(subject: SubjectId): string {
  if (subject === 'euskera') {
    return 'bg-emerald-50 text-emerald-800 border-emerald-200';
  }
  return 'bg-indigo-50 text-indigo-800 border-indigo-200';
}
