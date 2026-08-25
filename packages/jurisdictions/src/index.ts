export * from './types';
export { czechia, czLeaveRegime } from './cz';
export { slovakia, skLeaveRegime } from './sk';

import type { Jurisdiction, JurisdictionCode } from './types';
import { czechia } from './cz';
import { slovakia } from './sk';

export const JURISDICTIONS: Record<JurisdictionCode, Jurisdiction> = {
  CZ: czechia,
  SK: slovakia,
};

export function jurisdictionFor(code: JurisdictionCode): Jurisdiction {
  return JURISDICTIONS[code];
}

/**
 * Every statutory value in the package, flattened for the public /parametre page.
 * Anything with `unverified: true` must be confirmed against a primary source
 * before launch and re-checked every 1 January and 1 July.
 *
 * `sources` is a list, not a single string, because the leave regime rests on more than one
 * page — maternity at one authority, the parental allowance at another — and this function
 * used to emit `sources[0]` and drop the rest. That silently hid the source for the parental
 * allowance, which is the constant in this package most likely to be out of date.
 */
export function allParameters() {
  const rows: Array<{
    jurisdiction: JurisdictionCode;
    key: string;
    value: unknown;
    verifiedAt: string;
    sources: string[];
    unverified: boolean;
    note?: string;
  }> = [];
  for (const j of Object.values(JURISDICTIONS)) {
    const entries: Array<[string, { value: unknown; verifiedAt: string; source: string; unverified?: boolean; note?: string } | null]> = [
      ['mortgage.ltvMaxPct', j.mortgageLimits.ltvMaxPct],
      ['mortgage.ltvMaxPctUnder36', j.mortgageLimits.ltvMaxPctUnder36],
      ['mortgage.dstiMaxPct', j.mortgageLimits.dstiMaxPct],
      ['mortgage.dstiMaxPctUnder36', j.mortgageLimits.dstiMaxPctUnder36],
      ['mortgage.dtiMaxMultiple', j.mortgageLimits.dtiMaxMultiple],
      ['securities.exemptionMonths', j.securitiesExemptionMonths],
      ['savings.typicalTopRatePct', j.typicalTopSavingsRatePct],
      ['mortgage.typicalRatePct', j.typicalMortgageRatePct],
      ['retirement.statutoryAgeYears', j.statutoryRetirementAgeYears],
      ['credit.typicalConsumerLoanRatePct', j.typicalConsumerLoanRatePct],
      ['credit.typicalCreditCardRatePct', j.typicalCreditCardRatePct],
    ];
    for (const [key, v] of entries) {
      if (!v) continue;
      rows.push({
        jurisdiction: j.code,
        key,
        value: v.value,
        verifiedAt: v.verifiedAt,
        sources: v.source ? [v.source] : [],
        unverified: v.unverified === true,
        ...(v.note ? { note: v.note } : {}),
      });
    }
    rows.push({
      jurisdiction: j.code,
      key: 'leave.regime',
      value: `${j.leave.id} v${j.leave.version}`,
      verifiedAt: j.leave.verifiedAt,
      sources: [...j.leave.sources],
      unverified: false,
    });
  }
  return rows;
}
