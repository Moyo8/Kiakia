/**
 * Categories of identifying information. Modeled on the HIPAA Safe Harbor list of
 * 18 identifiers, grouped into categories a non-expert can review at a glance.
 */
export type EntityType =
  | 'PERSON'
  | 'ADDRESS'
  | 'ORG'
  | 'DATE'
  | 'ID'
  | 'PHONE'
  | 'EMAIL'
  | 'FINANCIAL'
  | 'URL';

export const ENTITY_TYPES: EntityType[] = [
  'PERSON',
  'ADDRESS',
  'ORG',
  'DATE',
  'ID',
  'PHONE',
  'EMAIL',
  'FINANCIAL',
  'URL',
];

export const ENTITY_LABELS: Record<EntityType, string> = {
  PERSON: 'Names',
  ADDRESS: 'Addresses & places',
  ORG: 'Organizations & facilities',
  DATE: 'Dates',
  ID: 'ID & record numbers',
  PHONE: 'Phone numbers',
  EMAIL: 'Emails',
  FINANCIAL: 'Card & bank numbers',
  URL: 'Links & IPs',
};

/** Where a detection came from. */
export type SpanSource = 'pattern' | 'on-device' | 'you';

export interface Span {
  start: number;
  end: number;
  text: string;
  type: EntityType;
  source: SpanSource;
}
