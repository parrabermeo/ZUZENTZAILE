import type { ClassGroup, Language, Student } from '../types';
import { createStudentRecord } from '../utils/studentImporter';

export function createDefaultGroups(): ClassGroup[] {
  return [
    {
      id: 'group-6a',
      name: '6. Maila A',
      academicYear: '2026-2027',
      color: 'teal',
      createdAt: new Date().toISOString(),
    },
  ];
}

export function createSampleClassroom(existingGroups: ClassGroup[]): {
  groups: ClassGroup[];
  students: Student[];
} {
  const groupA: ClassGroup = existingGroups[0] || {
    id: 'group-6a',
    name: '6. Maila A',
    academicYear: '2026-2027',
    color: 'teal',
    createdAt: new Date().toISOString(),
  };

  const hasSecond = existingGroups.length > 1;
  const groupB: ClassGroup = hasSecond
    ? existingGroups[1]
    : {
        id: 'group-6b',
        name: '6. Maila B',
        academicYear: '2026-2027',
        color: 'indigo',
        createdAt: new Date().toISOString(),
      };

  const sampleA = [
    { name: 'Ane Agirre Etxebarria', tags: [] as string[], notes: '' },
    {
      name: 'Jon Mendizabal Urrutia',
      tags: ['reinforcement'],
      notes: 'Landu paragrafoen antolaketa eta puntuazio-markak.',
    },
    {
      name: 'Irati Zubizarreta Olano',
      tags: ['high_ability'],
      notes: 'Hiztegi aberatsa; irakurketa kritiko sakonerako erronkak proposatu.',
    },
    {
      name: 'Markel Goikoetxea Lasa',
      tags: ['nee_hpb'],
      notes: 'Irakurketa ozeneko denbora gehigarria eta jarraibide bisualak.',
    },
    {
      name: 'Nahia Etxeberria Sarasola',
      tags: [] as string[],
      notes: '',
    },
    {
      name: 'Youssef Benali El Idrissi',
      tags: ['hipi', 'reinforcement'],
      notes: 'HIPI laguntza ahozko ulermenean eta euskarazko oinarrizko lexikoan.',
    },
    {
      name: 'Oier Alberdi Aranzabal',
      tags: [] as string[],
      notes: '',
    },
    {
      name: 'June Zabala Kortazar',
      tags: [] as string[],
      notes: '',
    },
  ];

  const sampleB = [
    { name: 'Unai Larrañaga Bengoa', tags: [] as string[], notes: '' },
    {
      name: 'Maialen Ibarra Azkue',
      tags: ['high_ability'],
      notes: 'Testu narratibo eta argumentatiboetan sormen handia.',
    },
    {
      name: 'Aitor Uriarte Bilbao',
      tags: ['reinforcement'],
      notes: 'Ortografia arauak (h, s/z/x) finkatzen ari da.',
    },
  ];

  const studentsA = sampleA.map((s, idx) =>
    createStudentRecord({
      fullName: s.name,
      groupId: groupA.id,
      code: `LH6A-${String(idx + 1).padStart(3, '0')}`,
      tags: s.tags,
      notes: s.notes,
    })
  );

  const studentsB = sampleB.map((s, idx) =>
    createStudentRecord({
      fullName: s.name,
      groupId: groupB.id,
      code: `LH6B-${String(idx + 1).padStart(3, '0')}`,
      tags: s.tags,
      notes: s.notes,
    })
  );

  const groups = hasSecond ? existingGroups : [groupA, groupB];
  return {
    groups,
    students: [...studentsA, ...studentsB],
  };
}

export interface DecretoCriterionSkeleton {
  code: string;
  competency: string;
  area: 'writing' | 'reading';
  title: Record<Language, string>;
  description: Record<Language, string>;
  weight: string;
}

export const DECRETO_77_2023_CRITERIA: DecretoCriterionSkeleton[] = [
  {
    code: 'CE5.1',
    competency: 'CE5',
    area: 'writing',
    title: {
      eu: 'Egokitasuna eta Testu-egitura',
      es: 'Adecuación y Estructura Textual',
    },
    description: {
      eu: 'Testu koherente eta egokiak sortzea generoaren arabera (narrazioa, deskribapena, argudioa), hasiera, garapena eta amaiera bereiziz.',
      es: 'Producir textos coherentes y adecuados al género y propósito comunicativo, estructurando introducción, desarrollo y cierre.',
    },
    weight: '30%',
  },
  {
    code: 'CE5.2',
    competency: 'CE5',
    area: 'writing',
    title: {
      eu: 'Kohesioa, Hiztegia eta Jariotasuna',
      es: 'Cohesión, Léxico y Fluidez Expresiva',
    },
    description: {
      eu: 'Lokailuak, erreferenteak eta LH6ko mailari dagokion hiztegi zehatza eta aberatsa erabiltzea errepikapenak saihestuz.',
      es: 'Emplear conectores, referentes y un vocabulario preciso y variado acorde a 6º de Primaria evitando repeticiones.',
    },
    weight: '25%',
  },
  {
    code: 'CE5.3',
    competency: 'CE5',
    area: 'writing',
    title: {
      eu: 'Zuzentasun Gramatikala eta Ortografia',
      es: 'Corrección Gramatical y Ortografía',
    },
    description: {
      eu: 'Oinarrizko arau ortografikoak, puntuazio-markak eta komunztadura gramatikalak zuzen aplikatzea berrikuspen-prozesuan.',
      es: 'Aplicar con corrección las normas ortográficas básicas, signos de puntuación y concordancias en la revisión del texto.',
    },
    weight: '25%',
  },
  {
    code: 'CE6.1',
    competency: 'CE6',
    area: 'writing',
    title: {
      eu: 'Aurkezpena, Plangintza eta Berrikuspena',
      es: 'Presentación, Planificación y Revisión',
    },
    description: {
      eu: 'Idazlanaren aurkezpen txukuna, paragrafoen bereizketa eta zirriborroa hobetzeko autozuzenketa estrategiak.',
      es: 'Cuidado formal y legibilidad, organización en párrafos y aplicación de estrategias de planificación y autorrevisión.',
    },
    weight: '20%',
  },
  {
    code: 'CE4.1',
    competency: 'CE4',
    area: 'reading',
    title: {
      eu: 'Irakurketa Jarioa, Intonazioa eta Abiadura',
      es: 'Fluidez Lectora, Entonación y Ritmo',
    },
    description: {
      eu: 'Ozenki irakurtzea erritmo egokiarekin, puntuazio-markak errespetatuz eta testuaren zentzuari egokitutako intonazioarekin.',
      es: 'Leer en voz alta con ritmo adecuado, respetando signos de puntuación y aplicando una entonación expresiva acorde al sentido.',
    },
    weight: '30%',
  },
  {
    code: 'CE4.2',
    competency: 'CE4',
    area: 'reading',
    title: {
      eu: 'Ulermen Literala eta Ideia Nagusiak',
      es: 'Comprensión Literal e Ideas Principales',
    },
    description: {
      eu: 'Testuko informazio esplizitua identifikatzea, ideia nagusiak laburtzea eta bigarren mailako datuetatik bereiztea.',
      es: 'Identificar información explícita, sintetizar ideas principales y diferenciarlas de detalles secundarios.',
    },
    weight: '35%',
  },
  {
    code: 'CE4.3',
    competency: 'CE4',
    area: 'reading',
    title: {
      eu: 'Ulermen Inferentziala eta Balorazio Kritikoa',
      es: 'Comprensión Inferencial y Valoración Crítica',
    },
    description: {
      eu: 'Informazio inplizitua ondorioztatzea, autorearen asmoa interpretatzea eta iritzi arrazoitua ematea.',
      es: 'Deducir información implícita, interpretar la intención del texto y formular valoraciones personales argumentadas.',
    },
    weight: '35%',
  },
];

export const PREVIEW_EVOLUTION_DATA = [
  { termEu: 'Hasierakoa', termEs: 'Inicial', writing: 2.3, reading: 2.6 },
  { termEu: '1. Hiruhilekoa', termEs: '1º Trimestre', writing: 2.7, reading: 2.9 },
  { termEu: '2. Hiruhilekoa', termEs: '2º Trimestre', writing: 3.1, reading: 3.3 },
  { termEu: '3. Hiruhilekoa', termEs: '3º Trimestre', writing: 3.4, reading: 3.6 },
];
