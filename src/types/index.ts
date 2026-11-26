export type Language = 'eu' | 'es';

export type SubjectId = 'euskera' | 'castellano';

export type ModalityEs = 'comprension' | 'expresion';

export type NavTab = 'students' | 'rubrics' | 'evaluate' | 'history' | 'reports';

export type GeminiModelId = 'gemini-4-hydrogen' | 'gemini-4-neon' | 'gemini-3.8-flash';

export type ReasoningEffort = 'low' | 'medium' | 'high';

export type PresetTagId = 'nee_hpb' | 'reinforcement' | 'high_ability' | 'hipi';

export type StorageMode = 'firestore' | 'indexeddb' | 'local-fallback' | 'local-only';

export type GroupColor = 'teal' | 'indigo' | 'amber' | 'rose' | 'emerald' | 'sky';

export type SkillMode = 'reading' | 'writing';

export type TextTypologyId =
  | 'narrative'
  | 'descriptive'
  | 'expository'
  | 'argumentative'
  | 'instructive'
  | 'epistolary'
  | 'journalistic';

export interface RubricLevelDescriptors {
  1: string; // Hasiberria / Iniciado
  2: string; // Garapenean / En desarrollo
  3: string; // Aurreratua / Avanzado
  4: string; // Bikaina / Experto
}

export interface RubricCriterion {
  id: string;
  code: string; // e.g. CE5.1, CE4.2 (Decreto 77/2023)
  name: string;
  weight: number; // Points out of 10 (total across criteria = 10)
  levels: RubricLevelDescriptors;
}

export interface Rubric {
  id: string;
  title: string;
  topic?: string;
  asignatura?: SubjectId;
  skill: SkillMode;
  typology?: TextTypologyId; // Only when skill === 'writing'
  language: Language;
  criteria: RubricCriterion[];
  isBase?: boolean;
  generatedByAI?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface EvaluatedCriterionResult {
  criterionId: string;
  code: string;
  name: string;
  weight: number;
  level: 1 | 2 | 3 | 4;
  justification: string;
}

export interface LinguisticCorrection {
  id: string;
  original: string;
  correction: string;
  explanation: string;
  category?: 'orthography' | 'grammar' | 'punctuation' | 'vocabulary';
}

export type PendingCourseLevel = 'LH4' | 'LH5' | null;

export interface PendingSubjects {
  euskera?: PendingCourseLevel;
  lengua?: PendingCourseLevel;
}

export interface PendingSubjectAssessment {
  subject: SubjectId;
  pendingCourse: 'LH4' | 'LH5';
  sufficient: boolean;
  justification: string;
}

export interface AiEvaluationDraft {
  transcription: string;
  criteria: EvaluatedCriterionResult[];
  finalScore: number; // Over 10 (1 decimal)
  strengths: string[];
  improvements: string[];
  linguisticCorrections: LinguisticCorrection[];
  studentFeedback: string;
  pendingSubjectAssessment?: PendingSubjectAssessment;
  emailSentAt?: string;
}

export interface StoredImageAsset {
  id: string;
  name: string;
  dataUrl: string; // Compact archival JPEG data URL kept locally in IndexedDB (never sent to Firestore)
  sizeKb?: number;
  driveUrl?: string; // Optional Google Drive shared URL (lightweight string synced to Firestore)
}

export interface BatchEvaluationItem {
  batchItemId: string;
  pages: string; // e.g. "1-2" or "3" (photo index/range)
  detectedName: string;
  matchedStudentId: string | null; // null => "Alumno no identificado - Asignar manualmente"
  matchConfidence: 'high' | 'medium' | 'unmatched';
  isContinuation?: boolean;
  actualModelUsed?: string;
  studentImages?: StoredImageAsset[];
  selected: boolean;
  saved: boolean;
  draft: AiEvaluationDraft;
}

export interface FailedBatchPhoto {
  photoId: string;
  photoNumber: number;
  fileName: string;
  error: string;
}

export interface ClassGroup {
  id: string;
  name: string;
  academicYear: string;
  color: GroupColor;
  createdAt: string;
}

export interface SavedTestDefinition {
  id: string;
  groupId: string;
  date: string; // YYYY-MM-DD delivery date
  asignatura: SubjectId;
  modalidad: ModalityEs;
  type: SkillMode;
  typology?: TextTypologyId;
  language: Language;
  title: string;
  rubricId?: string;
  rubricTitle?: string;
  context?: string;
  pruebaImagenes?: StoredImageAsset[];
  hasLocalImage?: boolean;
  localReferenceImageCount?: number;
  driveImageUrls?: string[];
  createdAt: string;
  updatedAt: string;
}

export interface EvaluationRecord {
  id: string;
  studentId: string;
  groupId?: string;
  date: string; // YYYY-MM-DD delivery date
  asignatura?: SubjectId; // 'euskera' | 'castellano'
  modalidad?: ModalityEs; // 'comprension' | 'expresion'
  type: SkillMode;
  typology?: TextTypologyId;
  rubricId?: string;
  rubricTitle?: string;
  language: Language;
  title: string;
  context?: string;
  pruebaImagenes?: StoredImageAsset[]; // Compressed images of the reference test/reading prompt (IndexedDB local)
  studentImages?: StoredImageAsset[]; // Compressed images of the student's handwritten sheet (IndexedDB local)
  hasLocalImage?: boolean; // Lightweight Firestore indicator (true when local Base64 images exist in IndexedDB)
  localReferenceImageCount?: number;
  localStudentImageCount?: number;
  driveImageUrls?: string[]; // Optional lightweight Google Drive links synced to Firestore
  inputMode?: 'text' | 'image' | 'photo_batch' | 'pdf_batch';
  photoNumbers?: string;
  transcription?: string;
  overallScore: number; // Over 10 (1 decimal)
  criteriaScores: Record<string, number>; // criterionId -> level (1..4)
  criteriaResults?: EvaluatedCriterionResult[];
  strengths?: string[];
  improvements?: string[];
  linguisticCorrections?: LinguisticCorrection[];
  feedbackSummary: string;
  pendingSubjectAssessment?: PendingSubjectAssessment;
  emailSentAt?: string;
  modelUsed: GeminiModelId;
  reasoningLevel?: ReasoningEffort;
  createdAt?: string;
}

export interface Student {
  id: string;
  code: string;
  fullName: string;
  email?: string;
  pendingSubjects?: PendingSubjects;
  groupId: string;
  tags: string[];
  notes: string;
  createdAt: string;
  updatedAt: string;
  evaluations: EvaluationRecord[];
}

export interface FirebaseRuntimeConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
}

export interface AppSettings {
  language: Language;
  geminiModel: GeminiModelId;
  geminiApiKey: string;
  firebaseConfig?: FirebaseRuntimeConfig;
}

export interface BackupPayload {
  app: 'idazlan-irakurketa-ebaluatzailea-lh6';
  version: number;
  exportedAt: string;
  groups: ClassGroup[];
  students: Student[];
  rubrics?: Rubric[];
  savedTests?: SavedTestDefinition[];
  settings: {
    language: Language;
    geminiModel: GeminiModelId;
  };
}

export interface ToastMessage {
  id: string;
  type: 'success' | 'info' | 'warning' | 'error';
  message: string;
}
