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
 */
export function allParameters() {
  const rows: Array<{
    jurisdiction: JurisdictionCode;
    key: string;
    value: unknown;
    verifiedAt: string;
    source: string;
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
    ];
    for (const [key, v] of entries) {
      if (!v) continue;
      rows.push({
        jurisdiction: j.code,
        key,
        value: v.value,
        verifiedAt: v.verifiedAt,
        source: v.source,
        unverified: v.unverified === true,
        ...(v.note ? { note: v.note } : {}),
      });
    }
    rows.push({
      jurisdiction: j.code,
      key: 'leave.regime',
      value: `${j.leave.id} v${j.leave.version}`,
      verifiedAt: j.leave.verifiedAt,
      source: j.leave.sources[0] ?? '',
      unverified: false,
    });
  }
  return rows;
}
