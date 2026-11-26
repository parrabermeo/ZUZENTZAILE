/**
 * Initial student email directory imported from the teacher's Excel roster.
 * Matching ignores accents, casing, extra spaces, and handles both
 * "Apellidos, Nombre" and "Nombre Apellidos" conventions cleanly.
 */
export interface StudentEmailDirectoryEntry {
  rawName: string;
  email: string;
  aliases?: string[];
}

export const INITIAL_STUDENT_EMAIL_DIRECTORY: StudentEmailDirectoryEntry[] = [
  { rawName: 'Bejarano Perez, Aimar', email: 'aimarbejarano@ignacioaldekoa.net' },
  { rawName: 'Benitez Cuevas, Ander', email: 'anderbenitez@ignacioaldekoa.net' },
  { rawName: 'Bustamante Arauz, Anita', email: 'anitabustamante@ignacioaldekoa.net' },
  { rawName: 'Callejo Lopez, Paulina', email: 'paulinacallejo@ignacioaldekoa.net' },
  { rawName: 'Casares Lopez, Markel', email: 'markelcasares@ignacioaldekoa.net' },
  { rawName: 'Chirilla Ochoa, Cristian', email: 'cristianchirilla@ignacioaldekoa.net' },
  { rawName: 'Fernandez Barcena, Oihan', email: 'oihanfernandez@ignacioaldekoa.net' },
  { rawName: 'Garcia Lopez, Leia', email: 'leiagarcia@ignacioaldekoa.net' },
  { rawName: 'Gonzalez Lopez, Unai', email: 'unaigonzalez@ignacioaldekoa.net' },
  { rawName: 'Laburu Casal, Carlota', email: 'carlotalaburu@ignacioaldekoa.net' },
  {
    rawName: 'Maestro Bascope, Hector',
    email: 'hectordanielmaestro@ignacioaldekoa.net',
    aliases: ['Hector Daniel Maestro Bascope'],
  },
  { rawName: 'Mardaras Rodriguez, Araien', email: 'araienmardaras@ignacioaldekoa.net' },
  {
    rawName: 'Marin Vega, Melany',
    email: 'melanyariannemarin@ignacioaldekoa.net',
    aliases: ['Melany Arianne Marin Vega'],
  },
  { rawName: 'Merino Doblas, Oier', email: 'oiermerino@ignacioaldekoa.net' },
  {
    rawName: 'Mihai, Alexi',
    email: 'alexia-mariamihai@ignacioaldekoa.net',
    aliases: ['Alexia Mihai', 'Alexia Maria Mihai', 'Alexia-Maria Mihai'],
  },
  { rawName: 'Molano Angulo, Lucia', email: 'luciamolano@ignacioaldekoa.net' },
  { rawName: 'Palamidessi Ortega, Izei', email: 'izeipalamidessi@ignacioaldekoa.net' },
  { rawName: 'Viña Perez, Nerea', email: 'nereavina@ignacioaldekoa.net' },
  { rawName: 'Yarvi Casso, Julen', email: 'julenyarvi@ignacioaldekoa.net' },
  { rawName: 'Zehimi Baali, Adam', email: 'adamzehimi@ignacioaldekoa.net' },
  { rawName: 'Abad Montes, Mikel', email: 'mikelabad@ignacioaldekoa.net' },
  {
    rawName: 'Aguilar Valencia, Marin',
    email: 'martinaguilar@ignacioaldekoa.net',
    aliases: ['Martin Aguilar Valencia', 'Aguilar Valencia, Martin'],
  },
  { rawName: 'Atucha Peña, Oihan', email: 'oihanatucha@ignacioaldekoa.net' },
  { rawName: 'Bilbao Garcia, Maialen', email: 'maialenbibao@ignacioaldekoa.net' },
  { rawName: 'Calderin Luengas, Guillermo', email: 'guillermocalderin@ignacioaldekoa.net' },
  { rawName: 'de Cos Bernal, Pablo', email: 'pablodecos@ignacioaldekoa.net' },
  { rawName: 'Figueira Sousa, Markel', email: 'markelfigueira@ignacioaldekoa.net' },
  { rawName: 'Gonçalves, Nicolas', email: 'nicolasgoncalves@ignacioaldekoa.net' },
  { rawName: 'Güingla Vera, Yaiza', email: 'yaizaguingla@ignacioaldekoa.net' },
  {
    rawName: 'Ilie, David',
    email: 'davidalbertoilie@ignacioaldekoa.net',
    aliases: ['David Alberto Ilie'],
  },
  {
    rawName: 'Iza Toctaguano, Angela',
    email: 'angelacamilaiza@ignacioaldekoa.net',
    aliases: ['Angela Camila Iza Toctaguano'],
  },
  { rawName: 'Jimenez García, Daniel', email: 'danieljimenez@ignacioaldekoa.net' },
  { rawName: 'Lopez Rodriguez, Enara', email: 'enaralopez@ignacioaldekoa.net' },
  {
    rawName: 'Mamani Tejerina, Ana',
    email: 'analorenamamani@ignacioaldekoa.net',
    aliases: ['Ana Lorena Mamani Tejerina'],
  },
  {
    rawName: 'Molina Bonilla, Emely',
    email: 'emelyantonellamolina@ignacioaldekoa.net',
    aliases: ['Emely Antonella Molina Bonilla'],
  },
  { rawName: 'Osorio Tovar, Ian', email: 'ianosorio@ignacioaldekoa.net' },
  { rawName: 'Piriz Martinez, Luka', email: 'lukapiriz@ignacioaldekoa.net' },
  {
    rawName: 'Ramos Lecca, Luisana',
    email: 'luisanaleyreramos@ignacioaldekoa.net',
    aliases: ['Luisana Leyre Ramos Lecca'],
  },
  { rawName: 'Temprano Lopez, Laia', email: 'laiatemprano@ignacioaldekoa.net' },
  { rawName: 'Zugadi Carbayo, Josu', email: 'josuzugadi@ignacioaldekoa.net' },
];

export function normalizePersonName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[,.;:()\-_/]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function toCanonicalVariants(name: string): string[] {
  const variants = new Set<string>();
  const trimmed = name.trim();
  if (!trimmed) return [];

  variants.add(normalizePersonName(trimmed));

  // If "Apellidos, Nombre", also add "Nombre Apellidos"
  if (trimmed.includes(',')) {
    const [left, right] = trimmed.split(',').map((s) => s.trim());
    if (left && right) {
      variants.add(normalizePersonName(`${right} ${left}`));
    }
  }

  return Array.from(variants).filter(Boolean);
}

function getTokens(normalized: string): string[] {
  return normalized.split(' ').filter((t) => t.length > 0);
}

interface IndexedDirectoryItem {
  email: string;
  exactVariants: Set<string>;
  tokenSets: Set<string>[];
  sortedTokenStrings: Set<string>;
}

const INDEXED_DIRECTORY: IndexedDirectoryItem[] = INITIAL_STUDENT_EMAIL_DIRECTORY.map((entry) => {
  const allNames = [entry.rawName, ...(entry.aliases || [])];
  const exactVariants = new Set<string>();
  const tokenSets: Set<string>[] = [];
  const sortedTokenStrings = new Set<string>();

  for (const n of allNames) {
    for (const v of toCanonicalVariants(n)) {
      exactVariants.add(v);
      const toks = getTokens(v);
      if (toks.length > 0) {
        tokenSets.push(new Set(toks));
        sortedTokenStrings.add([...toks].sort().join(' '));
      }
    }
  }

  return {
    email: entry.email,
    exactVariants,
    tokenSets,
    sortedTokenStrings,
  };
});

/**
 * Finds the matching email for a student name using accent-insensitive, case-insensitive,
 * order-independent matching ("Apellidos, Nombre" <-> "Nombre Apellidos", plus subset
 * matching when e.g. only first name + first surname is stored in the database).
 */
export function findMatchingStudentEmail(fullName: string): string | undefined {
  const inputVariants = toCanonicalVariants(fullName);
  if (inputVariants.length === 0) return undefined;

  // Pass 1: exact normalized match or exact token-set match (order-independent)
  for (const variant of inputVariants) {
    const sorted = getTokens(variant).sort().join(' ');
    for (const item of INDEXED_DIRECTORY) {
      if (item.exactVariants.has(variant) || item.sortedTokenStrings.has(sorted)) {
        return item.email;
      }
    }
  }

  // Pass 2: unambiguous subset match (requires >= 2 matching tokens so e.g. two "Oihan"s never collide)
  const inputTokens = getTokens(inputVariants[0]);
  if (inputTokens.length >= 2) {
    const matches: string[] = [];
    for (const item of INDEXED_DIRECTORY) {
      const matched = item.tokenSets.some((set) => {
        const overlap = inputTokens.filter((t) => set.has(t)).length;
        return overlap >= 2 && (overlap === inputTokens.length || overlap === set.size);
      });
      if (matched) matches.push(item.email);
    }
    if (matches.length === 1) {
      return matches[0];
    }
  }

  return undefined;
}
