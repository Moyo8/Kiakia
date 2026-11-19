import { ENTITY_TYPES } from '../privacy/types';

export type DocKind = 'medical' | 'insurance' | 'legal' | 'other';

export const DOC_KINDS: Array<{ id: DocKind; label: string }> = [
  { id: 'medical', label: 'Medical' },
  { id: 'insurance', label: 'Insurance & bills' },
  { id: 'legal', label: 'Legal & government' },
  { id: 'other', label: 'Something else' },
];

/* ---------------- Shield (on-device only) ---------------- */

export function shieldPrompt(chunk: string): string {
  return `You are a privacy filter. List every piece of personally identifying information in the TEXT.

Include: names of people; street addresses, towns and postcodes; names of hospitals, clinics, companies, landlords or agencies that could reveal where the person lives or is treated; dates tied to a person (birth, visit, notice); ID, record, account, policy, claim or case numbers; phone numbers; emails; card or bank numbers; links.
Do not include: test names, measurements, diagnoses, medications, money amounts, legal terms, or generic roles like "the patient" or "the tenant".
Copy each item exactly as written in the TEXT. If there are none, return an empty list.

TEXT:
"""
${chunk}
"""`;
}

/** JSON Schema passed to Chrome's Prompt API as a response constraint. */
export const SHIELD_SCHEMA = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          text: { type: 'string' },
          type: { type: 'string', enum: ENTITY_TYPES },
        },
        required: ['text', 'type'],
      },
    },
  },
  required: ['items'],
};

/* ---------------- Analysis (routed) ---------------- */

const TOKEN_RULES = `Privacy note: this document was de-identified on the user's device. Tokens like [PERSON_1], [DATE_2] or [ID_1] stand in for private details. When you refer to them, copy the token exactly (for example "[PERSON_1]"). Never guess what a token stands for.`;

const TASKS: Record<DocKind, string> = {
  medical: `You help a patient or caregiver understand a medical document. Write in plain, warm language a 12-year-old could follow. Use these sections:
## What this is
## What stands out
(Explain each result outside its reference range and what it can mean, without diagnosing.)
## Questions to ask your care team
## What to do next
End with one line reminding them this is not medical advice.`,
  insurance: `You help someone understand an insurance letter, bill or claim decision. Use plain language. Use these sections:
## What this is
## What they decided and why
## What you might owe
## Your options
(Include appeals, deadlines and who to contact, using tokens where the document has them.)
## Deadlines
End with one line saying this is general information, not financial or legal advice.`,
  legal: `You help someone understand a legal or government letter. Use plain language and be calm and practical. Use these sections:
## What this is
## What they are asking you to do
## Deadlines
## Your options
## Where to get free help
(Name types of help such as legal aid, tenant unions or advice bureaus; do not invent phone numbers or links.)
End with one line saying this is general information, not legal advice.`,
  other: `You help someone understand a document that may contain private information. Use plain language. Use these sections:
## What this is
## Key points
## What to do next`,
};

export function analysisPrompt(kind: DocKind, redactedDoc: string): string {
  return `${TASKS[kind]}

${TOKEN_RULES}

DOCUMENT:
"""
${redactedDoc}
"""`;
}

export interface Turn {
  question: string; // redacted
  answer: string; // redacted (tokens intact)
}

export function followUpPrompt(
  kind: DocKind,
  redactedDoc: string,
  history: Turn[],
  question: string,
): string {
  const past = history
    .slice(-3)
    .map((t) => `User: ${t.question}\nAssistant: ${t.answer}`)
    .join('\n\n');
  const role = DOC_KINDS.find((k) => k.id === kind)?.label.toLowerCase() ?? 'private';
  return `You are answering follow-up questions about a ${role} document. Answer the user's question briefly and in plain language, using only the document and conversation below. If the document doesn't say, say so.

${TOKEN_RULES}

DOCUMENT:
"""
${redactedDoc}
"""
${past ? `\nCONVERSATION SO FAR:\n${past}\n` : ''}
User: ${question}
Assistant:`;
}
