import type { Relevance } from './types';

const HIGH_RELEVANCE_KEYWORDS = new Set(
  [
    'interlocking',
    'electronic interlocking',
    'relay interlocking',
    'panel interlocking',
    'msdac',
    'level crossing',
    'level crossing gates',
    'level crossing gate',
    'axle counter',
    'track circuit',
    'block instrument',
    'data logger',
    'signalling and telecommunication',
    's & t',
    's&t',
    'train protection',
    'atp',
    'tpws',
    'ctc',
    'centralized traffic control',
    'led signal',
  ].map((k) => k.toLowerCase())
);

const RAILWAY_ORG_TOKENS = [
  'ircon',
  'rites',
  'metro',
  'rail',
  'railway',
  'k-ride',
  'kride',
  'central electronics',
  'rvnl',
  'dfccil',
  'ncrtc',
  'nhsrcl',
];

/**
 * Case-insensitive substring match of each keyword against the combined searchable
 * fields of a tender. Returns the matched keywords in their original casing.
 */
export function matchKeywords(
  fields: {
    title?: string | null;
    referenceNo?: string | null;
    tenderId?: string | null;
    orgChain?: string | null;
    department?: string | null;
    organisation?: string | null;
  },
  keywords: string[]
): string[] {
  const haystack = [
    fields.title,
    fields.referenceNo,
    fields.tenderId,
    fields.orgChain,
    fields.department,
    fields.organisation,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  if (!haystack) return [];

  const out: string[] = [];
  for (const kw of keywords) {
    if (!kw) continue;
    if (haystack.includes(kw.toLowerCase())) out.push(kw);
  }
  return out;
}

export function classifyRelevance(
  organisation: string | null | undefined,
  matched: string[]
): Relevance {
  const hasHigh = matched.some((k) => HIGH_RELEVANCE_KEYWORDS.has(k.toLowerCase()));
  if (hasHigh) return 'HIGH';

  const orgLower = (organisation ?? '').toLowerCase();
  if (RAILWAY_ORG_TOKENS.some((t) => orgLower.includes(t))) return 'MEDIUM';

  return matched.length > 0 ? 'LOW' : 'LOW';
}
