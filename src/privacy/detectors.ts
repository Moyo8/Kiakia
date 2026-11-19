import type { EntityType, Span } from './types';

/**
 * Deterministic pattern detectors. They run instantly, offline, in every browser,
 * and are the safety net when the on-device model is unavailable. Gemini Nano adds
 * what patterns can't see (unlabeled names, addresses, facilities).
 */
interface Detector {
  type: EntityType;
  re: RegExp; // must have the g and d flags
  group?: number; // capture group holding the identifier (default: whole match)
  validate?: (value: string) => boolean;
}

const digits = (s: string) => s.replace(/\D/g, '');

function luhn(num: string): boolean {
  const d = digits(num);
  if (d.length < 13 || d.length > 19) return false;
  let sum = 0;
  let dbl = false;
  for (let i = d.length - 1; i >= 0; i--) {
    let n = d.charCodeAt(i) - 48;
    if (dbl) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    dbl = !dbl;
  }
  return sum % 10 === 0;
}

const MONTH =
  '(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|June?|July?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)';

/** Words that follow a label like "Member" or "Name" but are not names. */
const NOT_A_NAME = new Set([
  'id', 'no', 'number', 'name', 'date', 'services', 'service', 'department', 'plan',
  'center', 'centre', 'hospital', 'clinic', 'portal', 'information', 'details',
  'signature', 'the', 'of', 'and', 'your', 'our', 'this', 'that', 'is', 'was',
  'sir', 'madam', 'patient', 'member', 'customer', 'applicant', 'team',
]);

const TITLES = '(?:Mr|Mrs|Ms|Mx|Miss|Dr|Prof)\\.?';
// Capitalized word with a lowercase second letter, so acronyms like DOB or MRN never count.
const NAME_WORD = "[A-Z][a-z'’-][a-zA-Z'’-]*";
// Name words are joined by single spaces only: never across columns or line breaks.
const NAME = `(?!${TITLES}\\s)(${NAME_WORD}(?: [A-Z]\\.)?(?: ${NAME_WORD}){0,3})`;

const DETECTORS: Detector[] = [
  { type: 'EMAIL', re: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/dg },
  { type: 'URL', re: /\bhttps?:\/\/[^\s<>"')\]]+|\bwww\.[^\s<>"')\]]+/dgi },
  {
    type: 'URL',
    re: /\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)\b/dg,
  },
  // US SSN-style
  { type: 'ID', re: /\b\d{3}-\d{2}-\d{4}\b/dg },
  // Payment cards (Luhn-validated so lab values and phone numbers don't match)
  { type: 'FINANCIAL', re: /\b(?:\d[ -]?){12,18}\d\b/dg, validate: luhn },
  // IBAN
  {
    type: 'FINANCIAL',
    re: /\b[A-Z]{2}\d{2}(?:\s?[A-Z0-9]{4}){2,7}(?:\s?[A-Z0-9]{1,4})?\b/dg,
    validate: (v) => {
      const n = v.replace(/\s/g, '').length;
      return n >= 15 && n <= 34;
    },
  },
  // Phone numbers with separators: +1 (555) 010-2345, 0803 123 4567, 555.010.2345
  {
    type: 'PHONE',
    re: /(?<![\w.\/-])(?:\+\d{1,3}[\s.-]?|\b1[\s.-])?(?:\(\d{1,4}\)[\s.-]?)?\d{2,4}(?:[\s.-]\d{2,4}){1,4}(?![\w\/-])/dg,
    validate: (v) => {
      const n = digits(v).length;
      // dates and short codes have fewer digits; refuse decimals like 13.5 7.2
      return n >= 9 && n <= 15 && !/^\d{1,3}\.\d{1,3}$/.test(v);
    },
  },
  // Phone numbers without separators: +2348031234567, 07700900123
  { type: 'PHONE', re: /(?<![\w.])(?:\+\d{10,14}|0\d{10})\b/dg },
  // Numeric dates: 03/14/1985, 14.03.1985, 1985-03-14
  {
    type: 'DATE',
    re: /\b(?:\d{1,2}[\/.-]\d{1,2}[\/.-](?:\d{4}|\d{2})|\d{4}-\d{2}-\d{2})\b/dg,
  },
  // Written dates: March 14, 1985 · 14 March 1985 · 14th Mar 1985 · March 1985
  {
    type: 'DATE',
    re: new RegExp(
      // Day and month stay on one line, and never start inside a number like $1,950.00.
      `(?<![\\d.,])\\b(?:\\d{1,2}(?:st|nd|rd|th)?[ \\t]+)?${MONTH}\\.?(?:[ \\t]+\\d{1,2}(?:st|nd|rd|th)?)?,?[ \\t]+\\d{4}\\b`,
      'dg',
    ),
  },
  // Labeled record numbers: MRN: 00482913, Policy No. AB-4471, Claim # 99812-C
  {
    type: 'ID',
    re: /\b(?:MRN|Medical\s+Record(?:\s+(?:No\.?|Number|#))?|Patient\s+(?:ID|No\.?|Number)|Member\s+(?:ID|No\.?|Number)|Subscriber\s+ID|Policy\s+(?:ID|No\.?|Number|#)|Claim\s+(?:ID|No\.?|Number|#)|Account\s+(?:No\.?|Number|#)|Acct\.?\s*(?:No\.?|#)?|Case\s+(?:No\.?|Number|#)|Reference\s+(?:No\.?|Number|#)|Ref\.?\s*(?:No\.?|#)|Passport\s+(?:No\.?|Number|#)|NHS\s+(?:No\.?|Number)|NIN|BVN|SSN|Licen[cs]e\s+(?:No\.?|Number|#)|Invoice\s+(?:No\.?|Number|#)|Group\s+(?:No\.?|Number|#)|Visa\s+(?:No\.?|Number)|Receipt\s+(?:No\.?|Number|#)|A-?Number)\s*[:#]?\s*([A-Z0-9][A-Z0-9-]{3,})/dgi,
    group: 1,
    validate: (v) => /\d/.test(v),
  },
  // Labeled names: Patient: Jordan A. Rivera · Dear Ms. Okafor · Dr. Chen
  {
    type: 'PERSON',
    re: new RegExp(
      `\\b(?:To:|From:|Signed:|Occupant:|Witness:|Prepared\\s+for:|Patient(?:\\s+Name)?|Name|Full\\s+Name|Dear|Insured|Member|Subscriber|Applicant|Tenant|Landlord|Beneficiary|Policyholder|Guarantor|Attn\\.?|Mr\\.?|Mrs\\.?|Ms\\.?|Mx\\.?|Miss|Dr\\.?|Prof\\.?)\\s*:?[ \\t]+${NAME}`,
      'dg',
    ),
    group: 1,
    validate: (v) => {
      const first = v.split(/\s+/)[0].toLowerCase();
      return !NOT_A_NAME.has(first) && !/^[A-Z]{1,3}$/.test(v);
    },
  },
  // Labeled addresses: Address: 41 Elm Street, Springfield
  {
    type: 'ADDRESS',
    re: /\b(?:Address|Addr\.?|Home\s+Address|Mailing\s+Address|Residence)\s*:\s*([^\n]{6,120})/dgi,
    group: 1,
  },
  // Street addresses: 41 Elm Street · 7B Adeola Odeku Road, Apt 4
  {
    type: 'ADDRESS',
    re: /\b\d{1,5}[A-Z]?\s+(?:[A-Z][a-zA-Z0-9'.-]+\s){1,4}(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Lane|Ln|Drive|Court|Ct|Close|Crescent|Way|Place|Pl|Terrace|Parkway|Pkwy|Highway|Hwy)\b\.?(?:,?\s*(?:Apt|Apartment|Suite|Unit|Flat|#)\.?\s*[\w-]+)?/dg,
  },
  // PO boxes
  { type: 'ADDRESS', re: /\bP\.?\s?O\.?\s+Box\s+\d+/dgi },
  // City, ST 12345
  {
    type: 'ADDRESS',
    re: /\b[A-Z][a-zA-Z]+(?:\s[A-Z][a-zA-Z]+)?,\s*[A-Z]{2}\s+\d{5}(?:-\d{4})?\b/dg,
  },
  // UK postcodes
  { type: 'ADDRESS', re: /\b[A-Z]{1,2}\d[A-Z\d]?\s+\d[A-Z]{2}\b/dg },
];

/** Run every pattern detector over the text. Spans may overlap; see mergeSpans. */
export function findPatternSpans(text: string): Span[] {
  const spans: Span[] = [];
  for (const det of DETECTORS) {
    det.re.lastIndex = 0;
    for (const m of text.matchAll(det.re)) {
      const g = det.group ?? 0;
      const value = m[g];
      const idx = m.indices?.[g];
      if (!value || !idx) continue;
      // Trim trailing punctuation the patterns may have swallowed.
      const trimmed = value.replace(/[\s.,;:]+$/, '');
      if (trimmed.length < 2) continue;
      if (det.validate && !det.validate(trimmed)) continue;
      spans.push({
        start: idx[0],
        end: idx[0] + trimmed.length,
        text: trimmed,
        type: det.type,
        source: 'pattern',
      });
    }
  }
  return spans;
}
