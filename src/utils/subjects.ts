import type { EvaluationRecord, Language, ModalityEs, SkillMode, SubjectId } from '../types';

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
