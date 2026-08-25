/**
 * Which sections of the plan page are open, and nothing else.
 *
 * A SEPARATE key from the plan on purpose: "start over" clears the plan and must not reset
 * how someone likes to read it, and a corrupt UI blob must never be able to stop a plan from
 * loading. Both reads and writes are wrapped, because a private window and blocked site data
 * are normal, not exceptional.
 */
const KEY = 'wealthplanner.ui.v1';

export interface UiState {
  sections: Record<string, boolean>;
}

export function loadUiState(): UiState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { sections: {} };
    const parsed = JSON.parse(raw) as UiState;
    return { sections: parsed?.sections && typeof parsed.sections === 'object' ? parsed.sections : {} };
  } catch {
    return { sections: {} };
  }
}

export function saveUiState(state: UiState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}
