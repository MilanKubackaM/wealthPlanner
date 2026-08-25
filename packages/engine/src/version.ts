/**
 * Bump on ANY change to a formula, a default assumption, or a recommendation search
 * bound — never on a refactor. Saved scenarios store the version they were computed
 * with, and are never silently re-simulated with newer logic.
 */
/*
 * 4 — rent as an alternative to a mortgage, and non-mortgage liabilities. Both change
 *     produced numbers: rent enters fixed expenses and therefore the reserve floor, and a
 *     debt payment enters spending, the floor, and net worth. Shipped as ONE bump so a
 *     stored plan raises the "computed by another version" banner once, not twice.
 */
export const ENGINE_VERSION = 4;
