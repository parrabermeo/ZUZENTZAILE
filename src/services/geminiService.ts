import { GoogleGenAI, ThinkingLevel, Type, type Part, type Schema } from '@google/genai';
import type {
  AiEvaluationDraft,
  BatchEvaluationItem,
  EvaluatedCriterionResult,
  GeminiModelId,
  Language,
  LinguisticCorrection,
  PendingSubjectAssessment,
  ReasoningEffort,
  Rubric,
  RubricCriterion,
  SkillMode,
  Student,
  SubjectId,
  TextTypologyId,
} from '../types';

export interface GeminiModelOption {
  id: GeminiModelId;
  name: string;
  tier: 'default' | 'secondary' | 'stable';
}

export const GEMINI_MODELS: GeminiModelOption[] = [
  {
    id: 'gemini-4-hydrogen',
    name: 'Gemini 4 Hydrogen',
    tier: 'default',
  },
  {
    id: 'gemini-4-neon',
    name: 'Gemini 4 Neon',
    tier: 'secondary',
  },
  {
    id: 'gemini-3.8-flash',
    name: 'Gemini 3.8 Flash',
    tier: 'stable',
  },
];

export const DEFAULT_GEMINI_MODEL: GeminiModelId = 'gemini-4-hydrogen';
export const STABLE_FALLBACK_MODEL: GeminiModelId = 'gemini-3.8-flash';
export const DEFAULT_REASONING_LEVEL: ReasoningEffort = 'medium';

export function supportsThinkingLevel(model: string): boolean {
  return model.startsWith('gemini-4');
}

export function resolveThinkingLevel(level: ReasoningEffort = DEFAULT_REASONING_LEVEL): ThinkingLevel {
  if (level === 'low') return ThinkingLevel.LOW;
  if (level === 'high') return ThinkingLevel.HIGH;
  return ThinkingLevel.MEDIUM;
}

function sleepMs(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error('CANCELLED'));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new Error('CANCELLED'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

function isRetryableGeminiError(err: unknown): boolean {
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  return (
    msg.includes('503') ||
    msg.includes('unavailable') ||
    msg.includes('high demand') ||
    msg.includes('overloaded') ||
    msg.includes('429') ||
    msg.includes('resource_exhausted') ||
    msg.includes('quota') ||
    msg.includes('timeout') ||
    msg.includes('etimedout') ||
    msg.includes('fetch failed') ||
    msg.includes('network') ||
    msg.includes('deadline')
  );
}

export interface ResilientGeminiCallParams {
  ai: GoogleGenAI;
  contents: Array<{ role: string; parts: Part[] }>;
  responseSchema: Schema;
  maxOutputTokens?: number;
  temperature?: number;
  timeoutMs?: number;
  label: string;
  signal?: AbortSignal;
  onAttemptStatus?: (info: { attempt: number; model: string; retryingAfterError?: string }) => void;
}

/**
 * Cascading resilience wrapper against 503 (High Demand), 429, and Timeouts:
 * 1. gemini-4-hydrogen (thinkingLevel: low)
 * 2. Wait 3s -> gemini-4-neon (thinkingLevel: low)
 * 3. Ultra-fast stable fallback -> gemini-3.8-flash (standard compatible config, no thinkingConfig)
 */
export async function callGeminiWithResilience(params: ResilientGeminiCallParams): Promise<{
  response: Awaited<ReturnType<GoogleGenAI['models']['generateContent']>>;
  modelUsed: string;
}> {
  const timeoutMs = params.timeoutMs ?? 150000;

  const cascade: Array<{
    model: GeminiModelId;
    thinkingLevel?: ThinkingLevel;
    delayBeforeMs: number;
  }> = [
    { model: 'gemini-4-hydrogen', thinkingLevel: ThinkingLevel.LOW, delayBeforeMs: 0 },
    { model: 'gemini-4-neon', thinkingLevel: ThinkingLevel.LOW, delayBeforeMs: 3000 },
    { model: STABLE_FALLBACK_MODEL, thinkingLevel: undefined, delayBeforeMs: 1000 },
  ];

  let lastError: unknown = null;

  for (let idx = 0; idx < cascade.length; idx++) {
    if (params.signal?.aborted) {
      throw new Error('CANCELLED');
    }

    const step = cascade[idx];
    if (step.delayBeforeMs > 0) {
      await sleepMs(step.delayBeforeMs, params.signal);
    }

    const prevErrorMsg =
      lastError instanceof Error ? lastError.message : lastError ? String(lastError) : undefined;
    params.onAttemptStatus?.({
      attempt: idx + 1,
      model: step.model,
      retryingAfterError: prevErrorMsg,
    });

    try {
      const config: Record<string, unknown> = {
        responseMimeType: 'application/json',
        responseSchema: params.responseSchema,
        maxOutputTokens: params.maxOutputTokens ?? 8192,
        temperature: params.temperature ?? 0.25,
      };

      if (step.thinkingLevel) {
        config.thinkingConfig = {
          thinkingLevel: step.thinkingLevel,
        };
      }

      const response = await withRequestTimeout(
        params.ai.models.generateContent({
          model: step.model,
          contents: params.contents,
          config,
        }),
        timeoutMs,
        `${params.label}:${step.model}`
      );

      return { response, modelUsed: step.model };
    } catch (err) {
      if (err instanceof Error && err.message === 'CANCELLED') {
        throw err;
      }
      lastError = err;
      const isLast = idx === cascade.length - 1;
      if (isLast || !isRetryableGeminiError(err)) {
        throw err;
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError || 'Gemini failed'));
}

/**
 * Cleans markdown code fences (```json ... ```) and extracts the JSON payload safely.
 */
function cleanAndParseJson<T>(rawText: string, contextLabel: string): T {
  let cleaned = (rawText || '').trim();
  if (!cleaned) {
    throw new Error(`[${contextLabel}] Empty response from Gemini API.`);
  }

  // Strip leading/trailing markdown fences like ```json ... ``` or ``` ... ```
  cleaned = cleaned
    .replace(/^```(?:json|JSON)?\s*\r?\n?/i, '')
    .replace(/\r?\n?```\s*$/i, '')
    .trim();

  // If surrounding prose leaked outside the outermost JSON braces, slice the JSON object/array
  const firstObj = cleaned.indexOf('{');
  const lastObj = cleaned.lastIndexOf('}');
  const firstArr = cleaned.indexOf('[');
  const lastArr = cleaned.lastIndexOf(']');

  if (firstObj !== -1 && lastObj > firstObj && (firstArr === -1 || firstObj < firstArr)) {
    cleaned = cleaned.slice(firstObj, lastObj + 1);
  } else if (firstArr !== -1 && lastArr > firstArr) {
    cleaned = cleaned.slice(firstArr, lastArr + 1);
  }

  try {
    return JSON.parse(cleaned) as T;
  } catch (err) {
    const parseMsg = err instanceof Error ? err.message : String(err);
    throw new Error(
      `[${contextLabel}] JSON parse error (possible truncated response): ${parseMsg}`
    );
  }
}

function withRequestTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(
        new Error(
          `[${label}] Request timeout after ${Math.round(timeoutMs / 1000)}s. Intenta con menos páginas por lote o revisa tu conexión.`
        )
      );
    }, timeoutMs);

    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

let syncedCloudGeminiApiKey = '';

export function setSyncedGeminiApiKey(apiKey: string): void {
  syncedCloudGeminiApiKey = typeof apiKey === 'string' ? apiKey.trim() : '';
}

export function getSyncedGeminiApiKey(): string {
  return syncedCloudGeminiApiKey;
}

export function getEnvGeminiApiKey(): string {
  const envKey = import.meta.env.VITE_GEMINI_API_KEY;
  return typeof envKey === 'string' ? envKey.trim() : '';
}

export function resolveGeminiApiKey(userApiKey?: string): string {
  const manual = userApiKey?.trim();
  if (manual) return manual;
  if (syncedCloudGeminiApiKey) return syncedCloudGeminiApiKey;
  return getEnvGeminiApiKey();
}

export function createGeminiClient(userApiKey?: string): GoogleGenAI {
  const apiKey = resolveGeminiApiKey(userApiKey);
  if (!apiKey) {
    throw new Error('Missing Gemini API Key');
  }
  return new GoogleGenAI({ apiKey });
}

export async function testGeminiConnection(
  userApiKey: string,
  model: GeminiModelId = DEFAULT_GEMINI_MODEL
): Promise<{ ok: boolean; reply?: string; error?: string }> {
  try {
    const ai = createGeminiClient(userApiKey);
    const response = await ai.models.generateContent({
      model,
      contents: 'Respond only with OK.',
      ...(supportsThinkingLevel(model)
        ? {
            config: {
              thinkingConfig: {
                thinkingLevel: ThinkingLevel.MEDIUM,
              },
            },
          }
        : {}),
    });
    return {
      ok: true,
      reply: response.text?.trim() || 'OK',
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      error: message,
    };
  }
}

export function calculateWeightedScore(criteria: EvaluatedCriterionResult[]): number {
  const totalWeight = criteria.reduce((acc, c) => acc + (Number(c.weight) || 0), 0);
  if (totalWeight <= 0) return 0;

  const earned = criteria.reduce((acc, c) => {
    const clampedLevel = Math.min(4, Math.max(1, c.level));
    return acc + (clampedLevel / 4) * (Number(c.weight) || 0);
  }, 0);

  const normalized = (earned / totalWeight) * 10;
  return Number(Math.min(10, Math.max(0, normalized)).toFixed(1));
}

const RUBRIC_RESPONSE_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    title: {
      type: Type.STRING,
      description: 'Concise pedagogical title for the customized rubric.',
    },
    criteria: {
      type: Type.ARRAY,
      description: 'Evaluation criteria weighted so that the sum of all weights equals exactly 10.',
      items: {
        type: Type.OBJECT,
        properties: {
          code: {
            type: Type.STRING,
            description: 'Decreto 77/2023 specific competency code (e.g. CE5.1, CE5.2, CE4.1).',
          },
          name: {
            type: Type.STRING,
            description: 'Criterion title.',
          },
          weight: {
            type: Type.NUMBER,
            description: 'Numeric weight out of 10 points (e.g. 2, 2.5, 1.5). Total sum must be 10.',
          },
          level1: {
            type: Type.STRING,
            description: 'Descriptor for Level 1 (Hasiberria / Iniciado).',
          },
          level2: {
            type: Type.STRING,
            description: 'Descriptor for Level 2 (Garapenean / En desarrollo).',
          },
          level3: {
            type: Type.STRING,
            description: 'Descriptor for Level 3 (Aurreratua / Avanzado).',
          },
          level4: {
            type: Type.STRING,
            description: 'Descriptor for Level 4 (Bikaina / Experto).',
          },
        },
        required: ['code', 'name', 'weight', 'level1', 'level2', 'level3', 'level4'],
      },
    },
  },
  required: ['title', 'criteria'],
};

interface AiRubricRawResponse {
  title: string;
  criteria: Array<{
    code: string;
    name: string;
    weight: number;
    level1: string;
    level2: string;
    level3: string;
    level4: string;
  }>;
}

export interface GenerateRubricParams {
  userApiKey: string;
  model?: GeminiModelId;
  skill: SkillMode;
  typology?: TextTypologyId;
  typologyLabel?: string;
  language: Language;
  topic: string;
  extraNotes?: string;
  baseRubric: Rubric;
}

export async function generateRubricWithAI(params: GenerateRubricParams): Promise<Rubric> {
  const ai = createGeminiClient(params.userApiKey);
  const langName = params.language === 'eu' ? 'Euskara (Batua, hezkuntza-erregistroa)' : 'Castellano';

  const baseCriteriaSummary = params.baseRubric.criteria
    .map((c) => `- [${c.code}] ${c.name} (${c.weight} pt)`)
    .join('\n');

  const skillDesc =
    params.skill === 'writing'
      ? `Expresión Escrita (Idazmena) - Tipología textual: ${params.typologyLabel || params.typology}`
      : 'Comprensión Escrita (Irakurmenaren Ulermena)';

  const subjectLabel = params.language === 'eu' ? 'Euskara (Euskera)' : 'Lengua Castellana';

  const languageOrthographyGuidance =
    params.language === 'eu'
      ? 'Al tratarse de la asignatura de EUSKERA (LH6, Decreto 77/2023), asegúrate de evaluar criterios lingüísticos propios del euskera: ortografía (h letra, s/z/x, ts/tz/tx), deklinabidea (ergatiboa -k y casos), aditza (NOR/NOR-NORI/NOR-NORK/NOR-NORI-NORK), léxico (hiztegia) y coherencia/cohesión.'
      : 'Al tratarse de la asignatura de LENGUA CASTELLANA (6º Primaria, Decreto 77/2023), asegúrate de evaluar criterios lingüísticos propios del castellano: acentuación (reglas generales, hiatos, tilde diacrítica), ortografía (b/v, h, g/j, ll/y, puntuación), concordancia verbal y nominal, conectores, léxico y adecuación.';

  const prompt = `Eres un experto pedagogo de 6º de Educación Primaria (LH6) en Euskadi, especialista en el Decreto 77/2023 (Currículo de Educación Básica de la CAPV).

Genera una rúbrica de evaluación personalizada en ${langName} para el siguiente ejercicio:
- Asignatura: ${subjectLabel}
- Destreza: ${skillDesc}
- Tema o título del ejercicio: "${params.topic}"
${params.extraNotes?.trim() ? `- Indicaciones adicionales del docente: "${params.extraNotes.trim()}"` : ''}

Estructura base de criterios que debes mantener y adaptar al tema concreto (la suma total de "weight" DEBE ser exactamente 10):
${baseCriteriaSummary}

Escala de 4 niveles obligatoria:
- level1: Hasiberria / Iniciado (1)
- level2: Garapenean / En desarrollo (2)
- level3: Aurreratua / Avanzado (3)
- level4: Bikaina / Experto (4)

Requisitos pedagógicos:
1. Todos los textos (título, nombres de criterios y descriptores de los 4 niveles) deben escribirse íntegramente en ${langName}.
2. Haz que cada descriptor sea observable, claro, específico para 6º de Primaria (11-12 años) y directamente vinculado al tema "${params.topic}".
3. ${languageOrthographyGuidance}
4. Mantén las ponderaciones ("weight") sumando exactamente 10 puntos.`;

  const rubricModel = params.model || DEFAULT_GEMINI_MODEL;
  const response = await ai.models.generateContent({
    model: rubricModel,
    contents: prompt,
    config: {
      responseMimeType: 'application/json',
      responseSchema: RUBRIC_RESPONSE_SCHEMA,
      ...(supportsThinkingLevel(rubricModel)
        ? {
            thinkingConfig: {
              thinkingLevel: ThinkingLevel.MEDIUM,
            },
          }
        : {}),
      temperature: 0.45,
    },
  });

  const parsed = cleanAndParseJson<AiRubricRawResponse>(response.text || '', 'generateRubricWithAI');
  if (!parsed || !Array.isArray(parsed.criteria) || parsed.criteria.length === 0) {
    throw new Error('Invalid structured rubric JSON returned by Gemini 4');
  }

  const criteria: RubricCriterion[] = parsed.criteria.map((item, idx) => ({
    id: `crit-ai-${Date.now()}-${idx}`,
    code: item.code?.trim() || (params.skill === 'writing' ? `CE5.${idx + 1}` : `CE4.${idx + 1}`),
    name: item.name?.trim() || `Criterio ${idx + 1}`,
    weight: typeof item.weight === 'number' && !Number.isNaN(item.weight) ? item.weight : 2,
    levels: {
      1: item.level1?.trim() || '',
      2: item.level2?.trim() || '',
      3: item.level3?.trim() || '',
      4: item.level4?.trim() || '',
    },
  }));

  const sum = criteria.reduce((acc, c) => acc + c.weight, 0);
  if (sum > 0 && Math.abs(sum - 10) > 0.05) {
    let running = 0;
    criteria.forEach((c, idx) => {
      if (idx === criteria.length - 1) {
        c.weight = Math.max(0.5, Number((10 - running).toFixed(1)));
      } else {
        c.weight = Number(((c.weight / sum) * 10).toFixed(1));
        running += c.weight;
      }
    });
  }

  const now = new Date().toISOString();
  const id =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? `rub-${crypto.randomUUID()}`
      : `rub-${Date.now()}`;

  return {
    id,
    title: parsed.title?.trim() || params.topic,
    topic: params.topic.trim(),
    asignatura: params.language === 'es' ? 'castellano' : 'euskera',
    skill: params.skill,
    typology: params.skill === 'writing' ? params.typology : undefined,
    language: params.language,
    criteria,
    isBase: false,
    generatedByAI: true,
    createdAt: now,
    updatedAt: now,
  };
}

// ---------------------------------------------------------------------------
// Module 3: AI-Assisted Evaluation Engine (gemini-4-neon / gemini-4-hydrogen)
// ---------------------------------------------------------------------------

const EVALUATION_RESPONSE_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    transcripcion: {
      type: Type.STRING,
      description:
        'Transcripción fiel del texto manuscrito si se adjuntó imagen (manteniendo los errores originales del alumno para su diagnóstico), o el texto evaluado.',
    },
    criterios: {
      type: Type.ARRAY,
      description: 'Evaluación exacta de cada uno de los criterios de la rúbrica proporcionada.',
      items: {
        type: Type.OBJECT,
        properties: {
          criterionId: {
            type: Type.STRING,
            description: 'Exact id of the rubric criterion.',
          },
          criterio: {
            type: Type.STRING,
            description: 'Name of the rubric criterion.',
          },
          nivel: {
            type: Type.INTEGER,
            description: 'Assigned achievement level: 1, 2, 3, or 4.',
          },
          justificacion: {
            type: Type.STRING,
            description: 'Brief, concrete justification citing evidence from the student work.',
          },
        },
        required: ['criterionId', 'criterio', 'nivel', 'justificacion'],
      },
    },
    notaFinal: {
      type: Type.NUMBER,
      description: 'Final weighted numerical grade out of 10 with 1 decimal (e.g. 7.8).',
    },
    puntosFuertes: {
      type: Type.ARRAY,
      description: 'List of 2 to 4 concrete strengths (Indarguneak).',
      items: { type: Type.STRING },
    },
    aspectosMejorar: {
      type: Type.ARRAY,
      description: 'List of 2 to 4 concrete, actionable improvements (Hobetzekoak).',
      items: { type: Type.STRING },
    },
    correccionLinguistica: {
      type: Type.ARRAY,
      description:
        'Detected spelling, morphosyntactic, punctuation, or lexical errors with their proposed correction.',
      items: {
        type: Type.OBJECT,
        properties: {
          original: {
            type: Type.STRING,
            description: 'Original erroneous fragment written by the student.',
          },
          correccion: {
            type: Type.STRING,
            description: 'Corrected fragment.',
          },
          explicacion: {
            type: Type.STRING,
            description: 'Short, clear pedagogical explanation for 6th grade.',
          },
          tipo: {
            type: Type.STRING,
            description: 'One of: orthography, grammar, punctuation, vocabulary.',
          },
        },
        required: ['original', 'correccion', 'explicacion', 'tipo'],
      },
    },
    feedbackAlumno: {
      type: Type.STRING,
      description:
        'Warm, motivating, and constructive feedback message addressed directly to the 6th-grade student in the test language.',
    },
    valoracionPendiente: {
      type: Type.OBJECT,
      description:
        'Include ONLY when the student has a pending subject from 4th (LH4) or 5th (LH5) grade in this evaluated language. Evaluates whether the demonstrated level is sufficient to pass that pending subject.',
      properties: {
        cursoPendiente: {
          type: Type.STRING,
          description: 'Pending grade level: "LH4" or "LH5".',
        },
        suficiente: {
          type: Type.BOOLEAN,
          description:
            'true if the level shown in this exercise meets the minimum curricular criteria to pass the pending 4th or 5th grade subject; false otherwise.',
        },
        justificacion: {
          type: Type.STRING,
          description:
            'Brief pedagogical justification (2-3 sentences in the test language) explaining why the student meets or does not yet meet the minimum criteria of LH4/LH5.',
        },
      },
      required: ['cursoPendiente', 'suficiente', 'justificacion'],
    },
  },
  required: [
    'transcripcion',
    'criterios',
    'notaFinal',
    'puntosFuertes',
    'aspectosMejorar',
    'correccionLinguistica',
    'feedbackAlumno',
  ],
};

interface RawPendingAssessment {
  cursoPendiente?: string;
  suficiente?: boolean;
  justificacion?: string;
}

interface AiEvaluationRawResponse {
  transcripcion: string;
  criterios: Array<{
    criterionId: string;
    criterio: string;
    nivel: number;
    justificacion: string;
  }>;
  notaFinal: number;
  puntosFuertes: string[];
  aspectosMejorar: string[];
  correccionLinguistica: Array<{
    original: string;
    correccion: string;
    explicacion: string;
    tipo?: string;
  }>;
  feedbackAlumno: string;
  valoracionPendiente?: RawPendingAssessment;
}

function normalizePendingAssessment(
  raw: RawPendingAssessment | undefined,
  evalLanguage: Language,
  expectedCourse?: 'LH4' | 'LH5' | null
): PendingSubjectAssessment | undefined {
  if (!expectedCourse && !raw?.justificacion?.trim()) return undefined;
  const rawCourse = (raw?.cursoPendiente || expectedCourse || '').toUpperCase().trim();
  const pendingCourse: 'LH4' | 'LH5' | null =
    rawCourse === 'LH4' || rawCourse.includes('4')
      ? 'LH4'
      : rawCourse === 'LH5' || rawCourse.includes('5')
        ? 'LH5'
        : expectedCourse || null;

  if (!pendingCourse) return undefined;
  const justification = typeof raw?.justificacion === 'string' ? raw.justificacion.trim() : '';
  if (!justification && !expectedCourse) return undefined;

  return {
    subject: evalLanguage === 'es' ? 'castellano' : 'euskera',
    pendingCourse,
    sufficient: Boolean(raw?.suficiente),
    justification,
  };
}

export interface UploadedImageInput {
  mimeType: string;
  base64Data: string;
  fileName: string;
}

export interface EvaluateStudentWorkParams {
  userApiKey: string;
  model: GeminiModelId;
  reasoningLevel: ReasoningEffort;
  evalLanguage: Language;
  skill: SkillMode;
  typologyLabel?: string;
  activityTitle: string;
  exerciseContext?: string;
  referenceImages?: UploadedImageInput[];
  rubric: Rubric;
  studentName: string;
  studentTags?: string[];
  pendingCourse?: 'LH4' | 'LH5' | null;
  studentText?: string;
  images?: UploadedImageInput[];
}

const REFERENCE_TRUTH_DIRECTIVE =
  'Utiliza el texto base y las preguntas adjuntas como fuente de verdad absoluta para verificar si las respuestas del alumno son correctas, precisas y completas según la rúbrica.';

export async function evaluateStudentWorkWithAI(
  params: EvaluateStudentWorkParams
): Promise<AiEvaluationDraft> {
  const ai = createGeminiClient(params.userApiKey);
  const hasImages = Boolean(params.images && params.images.length > 0);
  const hasReferenceImages = Boolean(params.referenceImages && params.referenceImages.length > 0);
  const hasReferenceText = Boolean(params.exerciseContext?.trim());
  const langName =
    params.evalLanguage === 'eu' ? 'Euskara (Batua, hezkuntza-erregistroa)' : 'Castellano';

  const rubricBlock = params.rubric.criteria
    .map(
      (c) =>
        `- criterionId: "${c.id}" | Código: ${c.code} | Nombre: "${c.name}" | Peso: ${c.weight} / 10 pt
   * Nivel 1 (Hasiberria / Iniciado): ${c.levels[1]}
   * Nivel 2 (Garapenean / En desarrollo): ${c.levels[2]}
   * Nivel 3 (Aurreratua / Avanzado): ${c.levels[3]}
   * Nivel 4 (Bikaina / Experto): ${c.levels[4]}`
    )
    .join('\n\n');

  const subjectLabel = params.evalLanguage === 'eu' ? 'Euskara (Euskera)' : 'Lengua Castellana';

  const linguisticFocus =
    params.evalLanguage === 'eu'
      ? `Al ser una prueba de EUSKERA (LH6, Decreto 77/2023), evalúa y señala en "correccionLinguistica" los criterios lingüísticos del euskera: ortografía (h letra, s/z/x, ts/tz/tx, puntuación), deklinabidea (ergatiboa -k y casos), aditza (NOR / NOR-NORI / NOR-NORK / NOR-NORI-NORK), léxico y coherencia/cohesión.`
      : `Al ser una prueba de LENGUA CASTELLANA (6º Primaria, Decreto 77/2023), evalúa y señala en "correccionLinguistica" los criterios lingüísticos del castellano: acentuación/tildes (agudas, llanas, esdrújulas, hiatos, diacríticas), ortografía (b/v, h, g/j, ll/y, puntuación), concordancia verbal y nominal, conectores, léxico y adecuación.`;

  const referenceDirectiveBlock =
    hasReferenceText || hasReferenceImages
      ? `\nFUENTE DE VERDAD DE LA PRUEBA:\n${REFERENCE_TRUTH_DIRECTIVE}\n${
          hasReferenceImages
            ? `Se adjuntan ${params.referenceImages!.length} imagen(es) de la prueba original / lectura / preguntas ANTES del trabajo del alumno.`
            : ''
        }`
      : '';

  const contextSection = hasReferenceText
    ? `\nTEXTO BASE / CONSIGNA / PREGUNTAS DE LA PRUEBA:\n"""\n${params.exerciseContext!.trim()}\n"""\n`
    : '';

  const tagsNote =
    params.studentTags && params.studentTags.length > 0
      ? `\nNota orientativa para el tono del feedback: el alumno cuenta con etiquetas de atención a la diversidad (${params.studentTags.join(', ')}). Aplica los criterios de la rúbrica con rigor pedagógico pero cuida que "feedbackAlumno" sea especialmente claro, cercano y motivador.`
      : '';

  const pendingGradeLabel =
    params.pendingCourse === 'LH4'
      ? '4º de Educación Primaria (LH4)'
      : params.pendingCourse === 'LH5'
        ? '5º de Educación Primaria (LH5)'
        : null;

  const pendingSubjectDirective =
    params.pendingCourse && pendingGradeLabel
      ? `\nASIGNATURA PENDIENTE DE CURSO ANTERIOR (MUY IMPORTANTE):
Este alumno/a tiene pendiente la asignatura de ${subjectLabel} correspondiente a ${pendingGradeLabel}.
Además de corregir la prueba actual de 6º de Primaria según el Decreto 77/2023, DEBES incluir obligatoriamente el objeto "valoracionPendiente" en el JSON con:
- "cursoPendiente": "${params.pendingCourse}"
- "suficiente": true si el nivel demostrado en este ejercicio alcanza los criterios mínimos exigibles para superar/aprobar ${subjectLabel} de ${pendingGradeLabel}, o false si todavía no es suficiente.
- "justificacion": explicación breve y clara (2-3 frases en ${langName}) justificando el motivo según los criterios mínimos de ${pendingGradeLabel} (comprensión básica, estructura, ortografía/gramática mínima de ese curso).`
      : '';

  const inputInstruction = hasImages
    ? `TRABAJO DEL ALUMNO: Se adjuntan ${params.images!.length} imagen(es) del cuaderno manuscrito del alumno (después de las imágenes de la prueba de referencia, si las hubiera).
1. Primero, transcribe fielmente el texto manuscrito del alumno en el campo "transcripcion" (respetando la ortografía y errores reales del alumno sin corregirlos en la transcripción, para que el docente pueda revisar lo que escribió exactamente).
2. Si también se ha escrito texto auxiliar, tenlo en cuenta: ${params.studentText?.trim() ? `\n"""\n${params.studentText.trim()}\n"""` : '(sin texto adicional)'}`
    : `TRABAJO DEL ALUMNO (texto introducido):\n"""\n${params.studentText?.trim() || ''}\n"""\nDevuelve este texto en el campo "transcripcion".`;

  const promptText = `Eres un docente especialista de 6º de Educación Primaria (LH6, 11-12 años) en Euskadi, experto en evaluación competencial según el Decreto 77/2023.

Evalúa el trabajo del alumno siguiendo ESTRICTAMENTE la rúbrica seleccionada.
IDIOMA OBLIGATORIO DE TODA LA RESPUESTA (justificaciones, puntos fuertes, aspectos a mejorar, explicaciones y feedbackAlumno): ${langName}.

DATOS DE LA ACTIVIDAD:
- Asignatura: ${subjectLabel}
- Alumno/a: ${params.studentName}
- Título de la actividad: ${params.activityTitle || 'Actividad de evaluación LH6'}
- Modalidad: ${params.skill === 'writing' ? `Expresión Escrita (Idazmena) - ${params.typologyLabel || ''}` : 'Comprensión Escrita (Irakurmenaren Ulermena)'}
- Rúbrica aplicada: ${params.rubric.title}
${referenceDirectiveBlock}${contextSection}${tagsNote}${pendingSubjectDirective}

RÚBRICA OFICIAL A APLICAR (escala 1 a 4, ponderada sobre 10 puntos):
${rubricBlock}

${inputInstruction}

INSTRUCCIONES DE EVALUACIÓN:
1. Evalúa TODOS y cada uno de los ${params.rubric.criteria.length} criterios de la rúbrica usando su exacto "criterionId" y asigna un nivel entero del 1 al 4.
2. Calcula "notaFinal" sobre 10 (1 decimal) usando la ponderación exacta: suma de ((nivel / 4) * peso) normalizada sobre 10.
3. ${linguisticFocus}
4. En "puntosFuertes" (Indarguneak) y "aspectosMejorar" (Hobetzekoak), aporta entre 2 y 4 puntos concretos y útiles para 6º de Primaria.
5. En "feedbackAlumno", dirígete directamente al alumno/a (en 2.ª persona, tono cercano, constructivo y motivador propio de 6º EP) íntegramente en ${langName}.`;

  const parts: Part[] = [{ text: promptText }];
  if (hasReferenceImages) {
    params.referenceImages!.forEach((refImg, idx) => {
      parts.push({
        text: `--- PRUEBA / LECTURA DE REFERENCIA (IMAGEN ${idx + 1} de ${params.referenceImages!.length}) ---`,
      });
      parts.push({
        inlineData: {
          mimeType: refImg.mimeType,
          data: refImg.base64Data,
        },
      });
    });
  }
  if (hasImages) {
    params.images!.forEach((img, idx) => {
      parts.push({
        text: `--- HOJA / TRABAJO DEL ALUMNO (IMAGEN ${idx + 1} de ${params.images!.length}) ---`,
      });
      parts.push({
        inlineData: {
          mimeType: img.mimeType,
          data: img.base64Data,
        },
      });
    });
  }

  const evalModel = params.model || DEFAULT_GEMINI_MODEL;
  const thinkingLevel = resolveThinkingLevel(params.reasoningLevel || DEFAULT_REASONING_LEVEL);

  const response = await ai.models.generateContent({
    model: evalModel,
    contents: [{ role: 'user', parts }],
    config: {
      responseMimeType: 'application/json',
      responseSchema: EVALUATION_RESPONSE_SCHEMA,
      ...(supportsThinkingLevel(evalModel)
        ? {
            thinkingConfig: {
              thinkingLevel,
            },
          }
        : {}),
      temperature: 0.3,
    },
  });

  const parsed = cleanAndParseJson<AiEvaluationRawResponse>(
    response.text || '',
    'evaluateStudentWorkWithAI'
  );
  if (!parsed || !Array.isArray(parsed.criterios)) {
    throw new Error('Invalid structured evaluation JSON returned by Gemini 4');
  }

  // Align returned criteria cleanly with active rubric criteria order & weights
  const returnedById = new Map(parsed.criterios.map((c) => [c.criterionId, c]));
  const criteria: EvaluatedCriterionResult[] = params.rubric.criteria.map((rubCrit, idx) => {
    const matched = returnedById.get(rubCrit.id) || parsed.criterios[idx];
    const rawLevel = matched?.nivel ?? 2;
    const clampedLevel = Math.min(4, Math.max(1, Math.round(rawLevel))) as 1 | 2 | 3 | 4;
    return {
      criterionId: rubCrit.id,
      code: rubCrit.code,
      name: rubCrit.name,
      weight: rubCrit.weight,
      level: clampedLevel,
      justification: matched?.justificacion?.trim() || '',
    };
  });

  const computedScore = calculateWeightedScore(criteria);

  const linguisticCorrections: LinguisticCorrection[] = (parsed.correccionLinguistica || [])
    .filter((item) => item && (item.original?.trim() || item.correccion?.trim()))
    .map((item, idx) => {
      const cat = item.tipo?.toLowerCase();
      const category: LinguisticCorrection['category'] =
        cat === 'orthography' ||
        cat === 'grammar' ||
        cat === 'punctuation' ||
        cat === 'vocabulary'
          ? cat
          : 'grammar';
      return {
        id: `lc-${Date.now()}-${idx}`,
        original: item.original?.trim() || '',
        correction: item.correccion?.trim() || '',
        explanation: item.explicacion?.trim() || '',
        category,
      };
    });

  const pendingSubjectAssessment = normalizePendingAssessment(
    parsed.valoracionPendiente,
    params.evalLanguage,
    params.pendingCourse
  );

  return {
    transcription: parsed.transcripcion?.trim() || params.studentText?.trim() || '',
    criteria,
    finalScore: computedScore,
    strengths: (parsed.puntosFuertes || []).map((s) => s.trim()).filter(Boolean),
    improvements: (parsed.aspectosMejorar || []).map((s) => s.trim()).filter(Boolean),
    linguisticCorrections,
    studentFeedback: parsed.feedbackAlumno?.trim() || '',
    ...(pendingSubjectAssessment ? { pendingSubjectAssessment } : {}),
  };
}

// ---------------------------------------------------------------------------
// Module 3 Extension: Batch PDF Classroom Evaluation (gemini-4-neon · HIGH)
// ---------------------------------------------------------------------------

const BATCH_PDF_RESPONSE_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    evaluacionesLote: {
      type: Type.ARRAY,
      description:
        'Array con una evaluación completa por cada alumno detectado en el PDF escaneado del aula.',
      items: {
        type: Type.OBJECT,
        properties: {
          paginas: {
            type: Type.STRING,
            description: 'Número o rango de páginas del PDF donde aparece este alumno (ej. "1", "2-3").',
          },
          nombreDetectado: {
            type: Type.STRING,
            description:
              'Nombre manuscrito leído en la cabecera de la hoja (o "Ilegible" si no puede leerse).',
          },
          studentId: {
            type: Type.STRING,
            description:
              'ID exacto del alumno de la lista proporcionada si coincide, o cadena vacía "" si no puede emparejarse con seguridad.',
          },
          confianzaEmparejamiento: {
            type: Type.STRING,
            description: 'Uno de: "high", "medium", "unmatched".',
          },
          continuacionAlumnoAnterior: {
            type: Type.BOOLEAN,
            description:
              'true ÚNICAMENTE si esta página NO tiene un nuevo nombre de alumno en la cabecera y continúa claramente el ejercicio de la página inmediatamente anterior.',
          },
          transcripcion: {
            type: Type.STRING,
            description:
              'Transcripción fiel del texto manuscrito del alumno conservando sus errores originales para diagnóstico.',
          },
          criterios: {
            type: Type.ARRAY,
            description: 'Evaluación exacta de cada criterio de la rúbrica.',
            items: {
              type: Type.OBJECT,
              properties: {
                criterionId: { type: Type.STRING },
                criterio: { type: Type.STRING },
                nivel: { type: Type.INTEGER },
                justificacion: { type: Type.STRING },
              },
              required: ['criterionId', 'criterio', 'nivel', 'justificacion'],
            },
          },
          notaFinal: {
            type: Type.NUMBER,
            description: 'Nota ponderada sobre 10 con 1 decimal.',
          },
          puntosFuertes: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
          },
          aspectosMejorar: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
          },
          correccionLinguistica: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                original: { type: Type.STRING },
                correccion: { type: Type.STRING },
                explicacion: { type: Type.STRING },
                tipo: { type: Type.STRING },
              },
              required: ['original', 'correccion', 'explicacion', 'tipo'],
            },
          },
          feedbackAlumno: {
            type: Type.STRING,
            description: 'Feedback motivador y constructivo dirigido al alumno en el idioma de la prueba.',
          },
          valoracionPendiente: {
            type: Type.OBJECT,
            description:
              'Incluir ÚNICAMENTE si el alumno emparejado tiene pendiente esta asignatura de 4º (LH4) o 5º (LH5) según la lista oficial del grupo.',
            properties: {
              cursoPendiente: { type: Type.STRING },
              suficiente: { type: Type.BOOLEAN },
              justificacion: { type: Type.STRING },
            },
            required: ['cursoPendiente', 'suficiente', 'justificacion'],
          },
        },
        required: [
          'paginas',
          'nombreDetectado',
          'studentId',
          'confianzaEmparejamiento',
          'continuacionAlumnoAnterior',
          'transcripcion',
          'criterios',
          'notaFinal',
          'puntosFuertes',
          'aspectosMejorar',
          'correccionLinguistica',
          'feedbackAlumno',
        ],
      },
    },
  },
  required: ['evaluacionesLote'],
};

interface BatchPdfRawItem extends AiEvaluationRawResponse {
  paginas: string;
  nombreDetectado: string;
  studentId: string;
  confianzaEmparejamiento: string;
  continuacionAlumnoAnterior?: boolean;
}

interface BatchPdfRawResponse {
  evaluacionesLote: BatchPdfRawItem[];
}

export interface EvaluateBatchPhotoParams {
  userApiKey: string;
  photoNumber: number;
  totalPhotos: number;
  base64Data: string;
  mimeType: 'image/jpeg';
  previousStudentHint?: string;
  evalLanguage: Language;
  skill: SkillMode;
  typologyLabel?: string;
  activityTitle: string;
  exerciseContext?: string;
  referenceImages?: UploadedImageInput[];
  rubric: Rubric;
  roster: Student[];
  signal?: AbortSignal;
  onAttemptStatus?: (info: { attempt: number; model: string; retryingAfterError?: string }) => void;
}

export async function evaluateBatchPhotoWithAI(
  params: EvaluateBatchPhotoParams
): Promise<BatchEvaluationItem[]> {
  const ai = createGeminiClient(params.userApiKey);
  const langName =
    params.evalLanguage === 'eu' ? 'Euskara (Batua, hezkuntza-erregistroa)' : 'Castellano';

  const safeRoster = Array.isArray(params.roster) ? params.roster : [];
  const safeRubricCriteria = Array.isArray(params.rubric?.criteria) ? params.rubric.criteria : [];
  const hasReferenceImages = Boolean(params.referenceImages && params.referenceImages.length > 0);
  const hasReferenceText = Boolean(params.exerciseContext?.trim());

  const rosterBlock = safeRoster
    .map((s) => {
      const pendingForSubject =
        params.evalLanguage === 'eu'
          ? s.pendingSubjects?.euskera ?? null
          : s.pendingSubjects?.lengua ?? null;
      return `- studentId: "${s.id}" | Código: ${s.code} | Nombre completo: "${s.fullName}"${
        s.tags.length > 0 ? ` | Etiquetas: ${s.tags.join(', ')}` : ''
      }${
        pendingForSubject
          ? ` | ASIGNATURA PENDIENTE DE CURSO ANTERIOR: ${
              params.evalLanguage === 'eu' ? 'Euskera' : 'Lengua Castellana'
            } ${pendingForSubject}`
          : ''
      }`;
    })
    .join('\n');

  const hasAnyPendingInRoster = safeRoster.some((s) =>
    params.evalLanguage === 'eu'
      ? Boolean(s.pendingSubjects?.euskera)
      : Boolean(s.pendingSubjects?.lengua)
  );

  const rubricBlock = safeRubricCriteria
    .map(
      (c) =>
        `- criterionId: "${c.id}" | Código: ${c.code} | Nombre: "${c.name}" | Peso: ${c.weight} / 10 pt
   * Nivel 1 (Hasiberria / Iniciado): ${c.levels[1]}
   * Nivel 2 (Garapenean / En desarrollo): ${c.levels[2]}
   * Nivel 3 (Aurreratua / Avanzado): ${c.levels[3]}
   * Nivel 4 (Bikaina / Experto): ${c.levels[4]}`
    )
    .join('\n\n');

  const subjectLabel = params.evalLanguage === 'eu' ? 'Euskara (Euskera)' : 'Lengua Castellana';

  const linguisticFocus =
    params.evalLanguage === 'eu'
      ? `Al ser una prueba de EUSKERA (LH6, Decreto 77/2023), identifica en "correccionLinguistica" los 3-5 aspectos más relevantes del euskera: ortografía (h, s/z/x, ts/tz/tx, puntuación), deklinabidea (ergatiboa -k), aditza (NOR / NOR-NORI / NOR-NORK / NOR-NORI-NORK), léxico y coherencia/cohesión.`
      : `Al ser una prueba de LENGUA CASTELLANA (6º Primaria, Decreto 77/2023), identifica en "correccionLinguistica" los 3-5 aspectos más relevantes del castellano: acentuación/tildes, ortografía (b/v, h, g/j, puntuación), concordancia verbal y nominal, conectores, léxico y adecuación.`;

  const referenceDirectiveBlock =
    hasReferenceText || hasReferenceImages
      ? `\nFUENTE DE VERDAD DE LA PRUEBA:\n${REFERENCE_TRUTH_DIRECTIVE}\n${
          hasReferenceImages
            ? `Se adjuntan ${params.referenceImages!.length} imagen(es) de la prueba original / lectura / preguntas ANTES de la hoja del alumno. Evalúa ÚNICAMENTE la hoja del alumno, usando las imágenes de referencia solo para verificar las respuestas.`
            : ''
        }`
      : '';

  const contextSection = hasReferenceText
    ? `\nTEXTO BASE / CONSIGNA / PREGUNTAS DE LA PRUEBA:\n"""\n${params.exerciseContext!.trim()}\n"""\n`
    : '';

  const photoLabel = String(params.photoNumber);

  const prevHintSection = params.previousStudentHint
    ? `\nCONTINUIDAD DE FOTO ANTERIOR: En la foto inmediatamente anterior (${params.photoNumber - 1}) apareció el alumno "${params.previousStudentHint}".
- Si esta foto NO tiene un nuevo nombre de alumno en la cabecera y continúa claramente el ejercicio manuscrito de la foto anterior, marca OBLIGATORIAMENTE "continuacionAlumnoAnterior": true (e indica el nombre/studentId de "${params.previousStudentHint}" si corresponde).
- Si esta foto SÍ tiene un nombre nuevo en la cabecera o empieza un ejercicio nuevo, pon "continuacionAlumnoAnterior": false.`
    : `\nAl ser la primera foto analizada, pon "continuacionAlumnoAnterior": false.`;

  const promptText = `Eres un docente especialista de 6º de Educación Primaria (LH6) en Euskadi (Decreto 77/2023) analizando 1 fotografía JPEG escaneada de un cuaderno/hoja manuscrita de aula.

FOTO ACTUAL: Foto ${photoLabel} de un total de ${params.totalPhotos} fotos del lote.
IDIOMA OBLIGATORIO PARA TODA LA EVALUACIÓN (justificaciones, puntosFuertes, aspectosMejorar, explicaciones lingüísticas y feedbackAlumno): ${langName}.

DATOS DE LA ACTIVIDAD:
- Asignatura: ${subjectLabel}
- Título: ${params.activityTitle || 'Actividad de aula LH6'}
- Modalidad: ${params.skill === 'writing' ? `Expresión Escrita (Idazmena) - ${params.typologyLabel || ''}` : 'Comprensión Escrita (Irakurmenaren Ulermena)'}
- Rúbrica activa: ${params.rubric.title}
${referenceDirectiveBlock}${contextSection}${prevHintSection}
LISTA OFICIAL DEL ALUMNADO DEL GRUPO (Módulo 1):
${rosterBlock || '(Sin alumnos registrados en el grupo)'}

RÚBRICA OFICIAL A APLICAR (escala 1-4, ponderada sobre 10):
${rubricBlock}

INSTRUCCIONES CRÍTICAS PARA ESTA FOTO (${photoLabel}):
1. Devuelve en "evaluacionesLote" EXCLUSIVAMENTE al alumno cuyo ejercicio manuscrito aparece en la HOJA DEL ALUMNO adjunta (normalmente 1 elemento; nunca inventes alumnos ausentes).
2. Si la hoja del alumno está en blanco o no contiene texto manuscrito, devuelve "evaluacionesLote": [].
3. Indica "paginas": "${photoLabel}".
4. Lee el nombre manuscrito en la cabecera ("nombreDetectado") y emparéjalo con el "studentId" exacto de la LISTA OFICIAL DEL ALUMNADO. Si es ilegible o no coincide, devuelve "studentId": "" y "confianzaEmparejamiento": "unmatched".
5. Marca "continuacionAlumnoAnterior": true SOLO si la foto NO tiene un nombre nuevo y es la 2.ª cara/continuación del alumno anterior; en caso contrario, false.
6. En "transcripcion", transcribe fielmente y de forma concisa el texto manuscrito del alumno conservando sus errores reales para el diagnóstico.
7. Evalúa TODOS los ${safeRubricCriteria.length} criterios de la rúbrica usando su "criterionId" exacto (niveles 1 a 4, justificación breve de 1 frase) y calcula "notaFinal" sobre 10 (1 decimal).
8. ${linguisticFocus}
9. Redacta un "feedbackAlumno" breve (2-3 frases), cercano y motivador en ${langName}.${
    hasAnyPendingInRoster
      ? `\n10. VALORACIÓN DE ASIGNATURA PENDIENTE (LH4/LH5): Si el alumno emparejado tiene indicada una ASIGNATURA PENDIENTE DE CURSO ANTERIOR en la lista oficial, incluye OBLIGATORIAMENTE "valoracionPendiente" ({ "cursoPendiente": "LH4"|"LH5", "suficiente": true|false, "justificacion": "..." en ${langName} }) valorando explícitamente si el nivel demostrado en el ejercicio es suficiente para aprobar esa materia pendiente según sus criterios mínimos.\n11. Devuelve ÚNICAMENTE JSON válido con la clave "evaluacionesLote", sin markdown ni texto adicional.`
      : `\n10. Devuelve ÚNICAMENTE JSON válido con la clave "evaluacionesLote", sin markdown ni texto adicional.`
  }`;

  const parts: Part[] = [{ text: promptText }];
  if (hasReferenceImages) {
    params.referenceImages!.forEach((refImg, idx) => {
      parts.push({
        text: `--- PRUEBA / LECTURA DE REFERENCIA (IMAGEN ${idx + 1} de ${params.referenceImages!.length}) ---`,
      });
      parts.push({
        inlineData: {
          mimeType: refImg.mimeType,
          data: refImg.base64Data,
        },
      });
    });
  }
  parts.push({ text: `--- HOJA DEL ALUMNO · FOTO ${photoLabel} DE ${params.totalPhotos} ---` });
  parts.push({
    inlineData: {
      mimeType: params.mimeType,
      data: params.base64Data,
    },
  });

  const { response, modelUsed } = await callGeminiWithResilience({
    ai,
    contents: [{ role: 'user', parts }],
    responseSchema: BATCH_PDF_RESPONSE_SCHEMA,
    maxOutputTokens: 8192,
    temperature: 0.25,
    timeoutMs: 150000,
    label: `evaluateBatchPhoto(${photoLabel})`,
    signal: params.signal,
    onAttemptStatus: params.onAttemptStatus,
  });

  const finishReason = response?.candidates?.[0]?.finishReason;
  const rawText = response?.text ?? '';

  let parsed: BatchPdfRawResponse | BatchPdfRawItem[];
  try {
    parsed = cleanAndParseJson<BatchPdfRawResponse | BatchPdfRawItem[]>(
      rawText,
      `evaluateBatchPhoto(${photoLabel}):${modelUsed}`
    );
  } catch (err) {
    const baseMsg = err instanceof Error ? err.message : String(err);
    const reasonSuffix = finishReason ? ` [finishReason: ${finishReason}]` : '';
    throw new Error(`${baseMsg}${reasonSuffix}`);
  }

  const rawList: BatchPdfRawItem[] = Array.isArray(parsed)
    ? parsed
    : Array.isArray(parsed?.evaluacionesLote)
      ? parsed.evaluacionesLote
      : [];

  if (rawList.length === 0) {
    return [];
  }

  const validRosterIds = new Set(safeRoster.map((s) => s.id));

  return rawList
    .filter((rawItem) => {
      if (!rawItem || typeof rawItem !== 'object') return false;
      const hasText = Boolean(rawItem?.transcripcion?.trim());
      const hasCriteria = Array.isArray(rawItem?.criterios) && rawItem.criterios.length > 0;
      const hasName = Boolean(rawItem?.nombreDetectado?.trim());
      return hasText || hasCriteria || hasName;
    })
    .map((rawItem, itemIdx) => {
      const rawStudentId = typeof rawItem?.studentId === 'string' ? rawItem.studentId.trim() : '';
      const detectedName =
        typeof rawItem?.nombreDetectado === 'string' ? rawItem.nombreDetectado.trim() : '';

      let matchedStudentId: string | null =
        rawStudentId && validRosterIds.has(rawStudentId) ? rawStudentId : null;

      if (!matchedStudentId && detectedName) {
        const normDetected = normalizeNameForFallbackMatch(detectedName);
        if (normDetected.length >= 3) {
          const exactMatch = safeRoster.find(
            (s) => normalizeNameForFallbackMatch(s?.fullName || '') === normDetected
          );
          if (exactMatch) {
            matchedStudentId = exactMatch.id;
          }
        }
      }

      const rawConf =
        typeof rawItem?.confianzaEmparejamiento === 'string'
          ? rawItem.confianzaEmparejamiento.toLowerCase()
          : '';
      const matchConfidence: BatchEvaluationItem['matchConfidence'] = !matchedStudentId
        ? 'unmatched'
        : rawConf === 'high' || rawConf === 'medium'
          ? rawConf
          : 'medium';

      const rawCriterios = Array.isArray(rawItem?.criterios) ? rawItem.criterios : [];
      const returnedById = new Map(
        rawCriterios
          .filter((c) => c && typeof c?.criterionId === 'string')
          .map((c) => [c.criterionId, c])
      );

      const criteria: EvaluatedCriterionResult[] = safeRubricCriteria.map((rubCrit, idx) => {
        const matched = returnedById.get(rubCrit.id) || rawCriterios[idx];
        const rawLevel = typeof matched?.nivel === 'number' ? matched.nivel : 2;
        const clampedLevel = Math.min(4, Math.max(1, Math.round(rawLevel))) as 1 | 2 | 3 | 4;
        return {
          criterionId: rubCrit.id,
          code: rubCrit.code || `C${idx + 1}`,
          name: rubCrit.name || `Criterio ${idx + 1}`,
          weight: typeof rubCrit.weight === 'number' ? rubCrit.weight : 2,
          level: clampedLevel,
          justification:
            typeof matched?.justificacion === 'string' ? matched.justificacion.trim() : '',
        };
      });

      const computedScore = calculateWeightedScore(criteria);

      const rawCorrections = Array.isArray(rawItem?.correccionLinguistica)
        ? rawItem.correccionLinguistica
        : [];
      const linguisticCorrections: LinguisticCorrection[] = rawCorrections
        .filter((item) => item && (item?.original?.trim() || item?.correccion?.trim()))
        .map((item, idx) => {
          const cat = typeof item?.tipo === 'string' ? item.tipo.toLowerCase() : '';
          const category: LinguisticCorrection['category'] =
            cat === 'orthography' ||
            cat === 'grammar' ||
            cat === 'punctuation' ||
            cat === 'vocabulary'
              ? cat
              : 'grammar';
          return {
            id: `lc-photo-${Date.now()}-${params.photoNumber}-${itemIdx}-${idx}`,
            original: typeof item?.original === 'string' ? item.original.trim() : '',
            correction: typeof item?.correccion === 'string' ? item.correccion.trim() : '',
            explanation: typeof item?.explicacion === 'string' ? item.explicacion.trim() : '',
            category,
          };
        });

      const strengths = Array.isArray(rawItem?.puntosFuertes)
        ? rawItem.puntosFuertes
            .filter((s): s is string => typeof s === 'string')
            .map((s) => s.trim())
            .filter(Boolean)
        : [];

      const improvements = Array.isArray(rawItem?.aspectosMejorar)
        ? rawItem.aspectosMejorar
            .filter((s): s is string => typeof s === 'string')
            .map((s) => s.trim())
            .filter(Boolean)
        : [];

      const uniqueBatchId =
        typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? `batch-${crypto.randomUUID()}`
          : `batch-${Date.now()}-${params.photoNumber}-${itemIdx}-${Math.random().toString(36).slice(2, 8)}`;

      const matchedStudentObj = matchedStudentId
        ? safeRoster.find((s) => s.id === matchedStudentId)
        : undefined;
      const expectedPendingCourse = matchedStudentObj
        ? params.evalLanguage === 'eu'
          ? matchedStudentObj.pendingSubjects?.euskera ?? null
          : matchedStudentObj.pendingSubjects?.lengua ?? null
        : null;
      const pendingSubjectAssessment = normalizePendingAssessment(
        rawItem?.valoracionPendiente,
        params.evalLanguage,
        expectedPendingCourse
      );

      return {
        batchItemId: uniqueBatchId,
        pages: photoLabel,
        detectedName,
        matchedStudentId,
        matchConfidence,
        isContinuation: Boolean(rawItem?.continuacionAlumnoAnterior),
        actualModelUsed: modelUsed,
        selected: Boolean(matchedStudentId),
        saved: false,
        draft: {
          transcription:
            typeof rawItem?.transcripcion === 'string' ? rawItem.transcripcion.trim() : '',
          criteria,
          finalScore: computedScore,
          strengths,
          improvements,
          linguisticCorrections,
          studentFeedback:
            typeof rawItem?.feedbackAlumno === 'string' ? rawItem.feedbackAlumno.trim() : '',
          ...(pendingSubjectAssessment ? { pendingSubjectAssessment } : {}),
        },
      };
    });
}

function normalizeNameForFallbackMatch(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// ---------------------------------------------------------------------------
// Module 4: AI Evolutionary Pedagogical Report Generator (gemini-4-hydrogen)
// ---------------------------------------------------------------------------

export interface StudentEvolutionReport {
  title: string;
  temporalEvolution: string;
  modalityAndTypologyAnalysis: string;
  consolidatedStrengths: string;
  improvementObjectives: string;
  generatedAt: string;
  language: Language;
  modelUsed: string;
}

const EVOLUTION_REPORT_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    title: {
      type: Type.STRING,
      description: 'Formal pedagogical report title for the student.',
    },
    temporalEvolution: {
      type: Type.STRING,
      description:
        'Detailed analysis of chronological progress comparing earliest deliveries with the most recent ones.',
    },
    modalityAndTypologyAnalysis: {
      type: Type.STRING,
      description:
        'Differentiated performance analysis between Comprensión Escrita and Expresión Escrita and across worked text typologies.',
    },
    consolidatedStrengths: {
      type: Type.STRING,
      description: 'Consolidated strengths and linguistic achievements demonstrated consistently.',
    },
    improvementObjectives: {
      type: Type.STRING,
      description:
        'Concrete, actionable improvement goals for the next term and practical recommendations for families.',
    },
  },
  required: [
    'title',
    'temporalEvolution',
    'modalityAndTypologyAnalysis',
    'consolidatedStrengths',
    'improvementObjectives',
  ],
};

interface EvolutionReportRaw {
  title: string;
  temporalEvolution: string;
  modalityAndTypologyAnalysis: string;
  consolidatedStrengths: string;
  improvementObjectives: string;
}

export interface GenerateEvolutionReportParams {
  userApiKey: string;
  model?: GeminiModelId;
  reportLanguage: Language;
  subject: SubjectId;
  evaluations: Student['evaluations'];
  student: Student;
  groupName: string;
}

export async function generateStudentEvolutionReportWithAI(
  params: GenerateEvolutionReportParams
): Promise<StudentEvolutionReport> {
  const ai = createGeminiClient(params.userApiKey);
  const langName =
    params.reportLanguage === 'eu'
      ? 'Euskara (Batua, hezkuntza-txosten formal eta hurbila familientzat eta irakasleentzat)'
      : 'Castellano (registro pedagógico formal, claro y constructivo para boletín escolar y familias)';

  const subjectDisplay =
    params.subject === 'euskera'
      ? params.reportLanguage === 'eu'
        ? 'Euskara'
        : 'Euskera'
      : params.reportLanguage === 'eu'
        ? 'Gaztelania'
        : 'Lengua Castellana';

  const sortedEvals = [...params.evaluations].sort((a, b) => a.date.localeCompare(b.date));

  const historySummary = sortedEvals
    .map((ev, idx) => {
      const criteriaText = (ev.criteriaResults || [])
        .map((c) => `${c.code} ${c.name}: ${c.level}/4 (${c.justification})`)
        .join('; ');
      const strengths = (ev.strengths || []).join(' | ');
      const improvements = (ev.improvements || []).join(' | ');
      return `${idx + 1}. Fecha: ${ev.date} | Asignatura: ${subjectDisplay} | Título: "${ev.title}" | Modalidad: ${
        ev.type === 'writing' ? `Expresión Escrita (${ev.typology || 'general'})` : 'Comprensión Escrita'
      } | Nota: ${ev.overallScore.toFixed(1)}/10
   - Criterios: ${criteriaText || 'N/A'}
   - Puntos fuertes: ${strengths || 'N/A'}
   - Aspectos a mejorar: ${improvements || 'N/A'}`;
    })
    .join('\n\n');

  const prompt = `Eres un tutor/a especialista de 6º de Educación Primaria (LH6) en Euskadi (Decreto 77/2023).
Redacta un INFORME EVOLUTIVO PEDAGÓGICO específico para la asignatura de ${subjectDisplay}, formal, riguroso y constructivo, dirigido al seguimiento trimestral y a las familias del alumno/a.

IDIOMA OBLIGATORIO DE TODO EL INFORME: ${langName}.
ASIGNATURA EVALUADA (no mezcles otras lenguas ni áreas): ${subjectDisplay}.

DATOS DEL ALUMNO/A:
- Nombre: ${params.student.fullName}
- Grupo: ${params.groupName}
- Asignatura: ${subjectDisplay}
- Etiquetas de atención a la diversidad: ${params.student.tags.length > 0 ? params.student.tags.join(', ') : 'Ninguna'}
- Notas del docente: ${params.student.notes || 'Ninguna'}
- Total de pruebas evaluadas en ${subjectDisplay}: ${sortedEvals.length}

HISTORIAL CRONOLÓGICO COMPLETO DE ENTREGAS EN ${subjectDisplay.toUpperCase()} (de la más antigua a la más reciente):
${historySummary}

ESTRUCTURA OBLIGATORIA DEL INFORME (en formato JSON estructurado):
1. "title": Título formal del informe pedagógico evolutivo mencionando la asignatura (${subjectDisplay}) y al alumno/a.
2. "temporalEvolution": Analiza la evolución temporal del alumno en ${subjectDisplay} comparando sus primeras entregas con las más recientes (menciona fechas, progresión de notas y cambios observables en su autonomía).
3. "modalityAndTypologyAnalysis": Analiza de forma diferenciada su desempeño en Comprensión Escrita vs Expresión Escrita dentro de ${subjectDisplay}, detallando cómo responde ante las distintas tipologías textuales trabajadas.
4. "consolidatedStrengths": Sintetiza sus fortalezas consolidadas en ${subjectDisplay} en los criterios competenciales propios de esta lengua según el Decreto 77/2023.
5. "improvementObjectives": Propón 3-4 objetivos concretos y alcanzables de mejora en ${subjectDisplay} para el siguiente trimestre junto con orientaciones prácticas y motivadoras para la familia.

Tono: profesional, respetuoso, basado en evidencias reales del historial proporcionado y alineado con el Decreto 77/2023 de Euskadi.`;

  const reportModel = params.model || DEFAULT_GEMINI_MODEL;

  const response = await withRequestTimeout(
    ai.models.generateContent({
      model: reportModel,
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: EVOLUTION_REPORT_SCHEMA,
        ...(supportsThinkingLevel(reportModel)
          ? {
              thinkingConfig: {
                thinkingLevel: ThinkingLevel.MEDIUM,
              },
            }
          : {}),
        temperature: 0.4,
      },
    }),
    120000,
    `generateStudentEvolutionReport:${reportModel}`
  );

  const parsed = cleanAndParseJson<EvolutionReportRaw>(
    response.text || '',
    `generateStudentEvolutionReport:${reportModel}`
  );

  return {
    title: parsed.title?.trim() || params.student.fullName,
    temporalEvolution: parsed.temporalEvolution?.trim() || '',
    modalityAndTypologyAnalysis: parsed.modalityAndTypologyAnalysis?.trim() || '',
    consolidatedStrengths: parsed.consolidatedStrengths?.trim() || '',
    improvementObjectives: parsed.improvementObjectives?.trim() || '',
    generatedAt: new Date().toISOString(),
    language: params.reportLanguage,
    modelUsed: reportModel,
  };
}
