import type { ClassGroup, Student } from '../types';

export interface ParsedImportCandidate {
  tempId: string;
  fullName: string;
  code: string;
  tags: string[];
  isDuplicate: boolean;
  selected: boolean;
}

const HEADER_KEYWORDS = new Set([
  'nombre',
  'nombres',
  'apellidos',
  'nombre completo',
  'nombre y apellidos',
  'alumno',
  'alumna',
  'alumnado',
  'estudiante',
  'izena',
  'abizena',
  'abizenak',
  'izen-abizenak',
  'izen abizenak',
  'ikaslea',
  'ikasleak',
  'name',
  'full name',
  'student',
  'id',
  'nº',
  'no',
  '#',
]);

const LOWERCASE_PARTICLES = new Set(['de', 'del', 'la', 'las', 'los', 'el', 'y', 'i', 'e', 'eta']);

function normalizeForCompare(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function smartCapitalize(name: string): string {
  const cleaned = name.replace(/\s+/g, ' ').trim();
  if (!cleaned) return '';

  // Only normalize casing if entire string is ALL CAPS or all lowercase
  const isAllUpper = cleaned === cleaned.toUpperCase() && cleaned !== cleaned.toLowerCase();
  const isAllLower = cleaned === cleaned.toLowerCase() && cleaned !== cleaned.toUpperCase();

  if (!isAllUpper && !isAllLower) {
    return cleaned;
  }

  return cleaned
    .toLowerCase()
    .split(' ')
    .map((word, idx) => {
      if (idx > 0 && LOWERCASE_PARTICLES.has(word)) return word;
      if (!word) return '';
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(' ');
}

function detectTagToken(rawToken: string): string | null {
  const norm = normalizeForCompare(rawToken);
  if (!norm) return null;

  if (/\b(nee|hpb|acnee|nea|neae|premia berezi)\b/.test(norm)) return 'nee_hpb';
  if (/\b(refuerzo|indartze|indartzea|apoyo|laguntza)\b/.test(norm)) return 'reinforcement';
  if (/\b(altas capacidades|aacc|gaitasun handi|gaitasun handiak|sobredot)\b/.test(norm))
    return 'high_ability';
  if (/\b(hipi|acogida|harrera)\b/.test(norm)) return 'hipi';

  return null;
}

function isHeaderRow(parts: string[]): boolean {
  if (parts.length === 0) return true;
  const matchedHeaders = parts.filter((p) => HEADER_KEYWORDS.has(normalizeForCompare(p)));
  return matchedHeaders.length >= Math.max(1, Math.ceil(parts.length / 2));
}

function cleanNameToken(raw: string): string {
  return raw
    .replace(/^["'\u201C\u201D]+|["'\u201C\u201D]+$/g, '')
    .replace(/^\s*(?:\d{1,3}\s*[.):\-–]\s*|[-*•·]\s+)/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function buildGroupPrefix(groupName: string): string {
  const cleaned = groupName
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, ' ')
    .trim();

  const tokens = cleaned.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return 'LH6';

  const digits = tokens.find((t) => /^\d+$/.test(t));
  const lastLetter = [...tokens].reverse().find((t) => /^[A-Z]$/.test(t));
  if (digits && lastLetter) {
    return `LH${digits}${lastLetter}`;
  }

  const compact = tokens
    .map((t) => t.slice(0, 3))
    .join('')
    .slice(0, 5);
  return compact || 'LH6';
}

export function generateNextStudentCode(
  group: ClassGroup | undefined,
  existingStudents: Student[],
  offset = 0
): string {
  const prefix = buildGroupPrefix(group?.name || 'LH6');
  const groupStudents = group
    ? existingStudents.filter((s) => s.groupId === group.id)
    : existingStudents;

  let maxNum = 0;
  for (const st of groupStudents) {
    const match = st.code.match(/(\d+)$/);
    if (match) {
      const n = parseInt(match[1], 10);
      if (!Number.isNaN(n) && n > maxNum) maxNum = n;
    }
  }

  const nextNum = maxNum + 1 + offset;
  return `${prefix}-${String(nextNum).padStart(3, '0')}`;
}

export function parseSmartStudentInput(
  rawInput: string,
  group: ClassGroup | undefined,
  existingStudents: Student[],
  defaultTags: string[] = []
): ParsedImportCandidate[] {
  const trimmed = rawInput
    .replace(/^\uFEFF/, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .trim();
  if (!trimmed) return [];

  const rawLines = trimmed
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  const extractedItems: Array<{ fullName: string; tags: string[] }> = [];

  // Single-line comma/semicolon list (e.g., "Ane Agirre, Jon Lasa, Irati Gil")
  if (rawLines.length === 1 && (rawLines[0].includes(',') || rawLines[0].includes(';'))) {
    const sep = rawLines[0].includes(';') ? ';' : ',';
    const pieces = rawLines[0]
      .split(sep)
      .map((p) => p.trim())
      .filter(Boolean);

    for (const piece of pieces) {
      const parsed = extractNameAndInlineTags(piece);
      if (parsed.fullName && !isHeaderRow([parsed.fullName])) {
        extractedItems.push(parsed);
      }
    }
  } else {
    for (let i = 0; i < rawLines.length; i++) {
      const line = rawLines[i];
      const hasTab = line.includes('\t');
      const hasSemi = line.includes(';');
      const hasComma = line.includes(',');

      let cols: string[] = [line];
      if (hasTab) {
        cols = line.split('\t').map((c) => c.trim());
      } else if (hasSemi) {
        cols = line.split(';').map((c) => c.trim());
      } else if (hasComma) {
        cols = line.split(',').map((c) => c.trim());
      }

      // Remove empty trailing columns and leading pure row-index columns (e.g. Excel "1\tAne Agirre")
      cols = cols.map((c) => c.replace(/^["']|["']$/g, '').trim()).filter(Boolean);
      if (cols.length === 0) continue;
      if (cols.length >= 2 && /^\d{1,3}[.)]?$/.test(cols[0])) {
        cols = cols.slice(1);
      }

      if (i === 0 && isHeaderRow(cols)) {
        continue;
      }

      if (cols.length === 1) {
        const parsed = extractNameAndInlineTags(cols[0]);
        if (parsed.fullName && !isHeaderRow([parsed.fullName])) {
          extractedItems.push(parsed);
        }
      } else {
        // Multi-column line: check if trailing columns are tags or surname/name pairs
        const detectedTags: string[] = [];
        const nameParts: string[] = [];

        for (const col of cols) {
          const maybeTag = detectTagToken(col);
          if (maybeTag && nameParts.length > 0) {
            detectedTags.push(maybeTag);
          } else {
            const inline = extractNameAndInlineTags(col);
            if (inline.fullName) nameParts.push(inline.fullName);
            detectedTags.push(...inline.tags);
          }
        }

        if (nameParts.length === 0) continue;

        let combinedName: string;
        // Handle "Apellidos, Nombre" CSV convention when comma-separated with 2 columns and no spaces in second col
        if (
          hasComma &&
          !hasTab &&
          !hasSemi &&
          nameParts.length === 2 &&
          !detectTagToken(nameParts[1]) &&
          nameParts[0].split(/\s+/).length >= 1 &&
          nameParts[1].split(/\s+/).length <= 2
        ) {
          // If first part has 2 words (two surnames) and second has 1 word (given name), reorder to "Nombre Apellidos"
          if (nameParts[0].split(/\s+/).length >= 2 && nameParts[1].split(/\s+/).length === 1) {
            combinedName = `${nameParts[1]} ${nameParts[0]}`;
          } else {
            combinedName = nameParts.join(' ');
          }
        } else {
          combinedName = nameParts.join(' ');
        }

        const finalName = smartCapitalize(cleanNameToken(combinedName));
        if (finalName && !isHeaderRow([finalName])) {
          extractedItems.push({
            fullName: finalName,
            tags: Array.from(new Set(detectedTags)),
          });
        }
      }
    }
  }

  const existingNormalized = new Set(
    existingStudents
      .filter((s) => !group || s.groupId === group.id)
      .map((s) => normalizeForCompare(s.fullName))
  );
  const seenInBatch = new Set<string>();

  let assignedOffset = 0;

  return extractedItems.map((item, idx) => {
    const norm = normalizeForCompare(item.fullName);
    const isDuplicate = existingNormalized.has(norm) || seenInBatch.has(norm);
    seenInBatch.add(norm);

    const code = generateNextStudentCode(group, existingStudents, assignedOffset);
    if (!isDuplicate) {
      assignedOffset += 1;
    }

    return {
      tempId: `cand-${idx}-${Date.now()}`,
      fullName: item.fullName,
      code,
      tags: Array.from(new Set([...defaultTags, ...item.tags])),
      isDuplicate,
      selected: !isDuplicate,
    };
  });
}

function extractNameAndInlineTags(raw: string): { fullName: string; tags: string[] } {
  const tags: string[] = [];
  let working = raw;

  // Detect parenthetical or bracketed tags like "Ane Agirre (HPB)" or "Jon Lasa [Refuerzo]"
  working = working.replace(/[([]([^)\]]+)[)\]]/g, (fullMatch, inside: string) => {
    const tokens = inside.split(/[,;/|]+/).map((t) => t.trim());
    let matchedAny = false;
    for (const token of tokens) {
      const detected = detectTagToken(token);
      if (detected) {
        tags.push(detected);
        matchedAny = true;
      }
    }
    return matchedAny ? '' : fullMatch;
  });

  const cleaned = smartCapitalize(cleanNameToken(working));
  return {
    fullName: cleaned,
    tags: Array.from(new Set(tags)),
  };
}

export function createStudentRecord(params: {
  fullName: string;
  groupId: string;
  code: string;
  tags?: string[];
  notes?: string;
}): Student {
  const now = new Date().toISOString();
  const id =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `stu-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  return {
    id,
    code: params.code,
    fullName: params.fullName.trim(),
    groupId: params.groupId,
    tags: Array.from(new Set(params.tags || [])),
    notes: params.notes?.trim() || '',
    createdAt: now,
    updatedAt: now,
    evaluations: [],
  };
}
