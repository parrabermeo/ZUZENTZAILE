import type { Language, LinguisticCorrection, SubjectId } from '../types';
import { getSubjectLabel } from './subjects';

export interface BuildReportEmailParams {
  studentName: string;
  studentEmail?: string;
  asignatura: SubjectId;
  testTitle: string;
  language: Language;
  strengths: string[];
  improvements: string[];
  linguisticCorrections: LinguisticCorrection[];
  feedbackSummary: string;
}

export interface BuiltReportEmail {
  to: string;
  subject: string;
  body: string;
  mailtoHref: string;
  plainTextForClipboard: string;
}

/**
 * Formats an individual evaluation report ready for `mailto:` or clipboard copy
 * in the exact language of the evaluated test (Euskera or Castellano), with the
 * 4 structured student-friendly blocks requested:
 * 1. Indarguneak / Puntos fuertes
 * 2. Hobetzekoak / Aspectos a mejorar
 * 3. Ortografia-akatsak eta zuzenketak / Fallos ortográficos y correcciones
 * 4. Azken mezua / Mensaje final
 */
export function buildStudentReportEmail(params: BuildReportEmailParams): BuiltReportEmail {
  const isEu = params.language === 'eu';
  const subjectLabel = getSubjectLabel(params.asignatura, params.language);
  const cleanTitle = params.testTitle.trim() || (isEu ? 'Proba' : 'Prueba');
  const cleanName = params.studentName.trim();
  const to = (params.studentEmail || '').trim();

  const subject = isEu
    ? `[${subjectLabel} - ${cleanTitle}] Ebaluazio-txostena - ${cleanName}`
    : `[${subjectLabel} - ${cleanTitle}] Informe de evaluación - ${cleanName}`;

  const cleanStrengths = params.strengths.map((s) => s.trim()).filter(Boolean);
  const cleanImprovements = params.improvements.map((s) => s.trim()).filter(Boolean);
  const cleanCorrections = params.linguisticCorrections.filter(
    (c) => c.original.trim() || c.correction.trim()
  );
  const cleanFeedback = params.feedbackSummary.trim();

  const greeting = isEu ? `Kaixo ${cleanName},` : `Hola ${cleanName},`;
  const intro = isEu
    ? `Hona hemen "${cleanTitle}" (${subjectLabel}) probako zure ebaluazio-txostena:`
    : `Aquí tienes tu informe de evaluación de la prueba "${cleanTitle}" (${subjectLabel}):`;

  const strengthsHeading = isEu ? '1. INDARGUNEAK' : '1. PUNTOS FUERTES';
  const strengthsBody =
    cleanStrengths.length > 0
      ? cleanStrengths.map((item) => `• ${item}`).join('\n')
      : isEu
        ? '• Lan txukuna eta ahalegin ona.'
        : '• Buen esfuerzo y trabajo realizado.';

  const improvementsHeading = isEu ? '2. HOBETZEKOAK' : '2. ASPECTOS A MEJORAR';
  const improvementsBody =
    cleanImprovements.length > 0
      ? cleanImprovements.map((item) => `• ${item}`).join('\n')
      : isEu
        ? '• Jarraitu bide beretik lanean.'
        : '• Sigue trabajando en esta misma línea.';

  const spellingHeading = isEu
    ? '3. ORTOGRAFIA-AKATSAK ETA ZUZENKETAK'
    : '3. FALLOS ORTOGRÁFICOS Y CORRECCIONES';
  const spellingBody =
    cleanCorrections.length > 0
      ? cleanCorrections
          .map((c) => {
            const pair = `"${c.original.trim()}" → "${c.correction.trim()}"`;
            return c.explanation.trim() ? `• ${pair} (${c.explanation.trim()})` : `• ${pair}`;
          })
          .join('\n')
      : isEu
        ? '• Ez da ortografia-akats nabarmenik detektatu. Zorionak!'
        : '• No se han detectado fallos ortográficos destacables. ¡Buen trabajo!';

  const finalHeading = isEu ? '4. AZKEN MEZUA' : '4. MENSAJE FINAL';
  const finalBody =
    cleanFeedback ||
    (isEu
      ? 'Animo eta jarraitu gogor lanean hurrengo probetarako!'
      : '¡Ánimo y sigue esforzándote para las próximas pruebas!');

  const closing = isEu ? 'Ondo izan,\nZure irakaslea' : 'Un saludo,\nTu profesor/a';

  const body = [
    greeting,
    '',
    intro,
    '',
    strengthsHeading,
    strengthsBody,
    '',
    improvementsHeading,
    improvementsBody,
    '',
    spellingHeading,
    spellingBody,
    '',
    finalHeading,
    finalBody,
    '',
    closing,
  ].join('\n');

  const mailtoHref = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(
    subject
  )}&body=${encodeURIComponent(body)}`;

  const plainTextForClipboard = [
    to ? `${isEu ? 'Nori' : 'Para'}: ${to}` : '',
    `${isEu ? 'Gaia' : 'Asunto'}: ${subject}`,
    '',
    body,
  ]
    .filter((line, idx) => idx > 0 || Boolean(line))
    .join('\n');

  return {
    to,
    subject,
    body,
    mailtoHref,
    plainTextForClipboard,
  };
}
