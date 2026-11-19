import type { DocKind } from './ai/prompts';

/** Fictional sample documents. All names, numbers and addresses are invented. */
export interface Sample {
  id: string;
  label: string;
  kind: DocKind;
  text: string;
}

export const SAMPLES: Sample[] = [
  {
    id: 'lab',
    label: 'Lab results',
    kind: 'medical',
    text: `RIVERSIDE COMMUNITY HOSPITAL — LABORATORY REPORT
Patient Name: Jordan A. Rivera          DOB: 03/14/1985
MRN: 00482913                           Collected: October 28, 2026
Ordering Physician: Dr. Amaka Eze
Address: 41 Elm Street, Springfield, IL 62704
Phone: (217) 555-0142

COMPLETE BLOOD COUNT
  Hemoglobin            10.9 g/dL     (ref 13.5–17.5)   LOW
  Hematocrit            33 %          (ref 41–53)       LOW
  MCV                   72 fL         (ref 80–100)      LOW
  WBC                   6.8 x10^9/L   (ref 4.5–11.0)
  Platelets             410 x10^9/L   (ref 150–400)     HIGH

IRON STUDIES
  Ferritin              8 ng/mL       (ref 24–336)      LOW
  Transferrin sat.      9 %           (ref 20–50)       LOW

COMMENTS: Microcytic anemia pattern consistent with iron deficiency.
Recommend follow-up with primary care. Mr. Rivera to schedule a visit within 2 weeks.
Questions: lab-results@riverside-health.example or call (217) 555-0100.`,
  },
  {
    id: 'denial',
    label: 'Insurance denial',
    kind: 'insurance',
    text: `Brightline Health Insurance
Claims Department, PO Box 7731, Hartford, CT 06103

November 3, 2026

Dear Ms. Adaeze Okafor,

Member ID: BHL-55821-907     Claim No. 2026-118842-C     Group No. 44107

We reviewed the claim submitted by Lakeview Imaging Center for an MRI of the
lumbar spine performed on September 19, 2026. This claim has been DENIED.

Reason: The service required prior authorization under your plan (Section 4.2,
"Advanced Imaging"). No prior authorization was on file at the time of service.

Amount billed: $2,840.00     Plan paid: $0.00     You may owe: $2,840.00

You have the right to appeal this decision within 180 days of the date of this
letter. To appeal, send a written request with supporting medical records to the
address above, or call Member Services at 1-800-555-0199. You may also request an
external review once internal appeals are exhausted.

Sincerely,
Claims Review Unit`,
  },
  {
    id: 'tenancy',
    label: 'Eviction notice',
    kind: 'legal',
    text: `NOTICE TO PAY RENT OR QUIT

To: Tunde Bakare and all other occupants
Premises: 7B Harbor View Road, Apt 12, Oakland, CA 94607

Date of notice: November 10, 2026

YOU ARE HEREBY NOTIFIED that rent is now due and payable for the premises above,
which you currently hold and occupy. The rent due is itemized as follows:

  October 2026 rent ............ $1,950.00
  November 2026 rent ........... $1,950.00
  TOTAL DUE .................... $3,900.00

WITHIN THREE (3) DAYS after service of this notice, excluding Saturdays, Sundays
and judicial holidays, you are required to pay the amount due in full or deliver
up possession of the premises. Payment may be made to Landlord Grace Whitfield at
the address below or by bank transfer to account no. 0047712290.

If you fail to do so, legal proceedings will be instituted against you to recover
possession, declare the lease forfeited, and recover rents and damages.

Grace Whitfield, 1200 Lake Shore Drive, Oakland, CA 94612 · (510) 555-0187`,
  },
];
