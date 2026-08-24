import { describe, expect, it } from 'vitest';
import { simulate } from '@wealthplanner/engine';
import { decodeScenario, encodeScenario } from '../src/lib/share';
import { demoScenario } from '../src/lib/defaults';

const START = { year: 2026, month: 8 };

/**
 * A shared link has to survive being pasted into a chat window, and it has to produce exactly
 * the same projection on the other side — otherwise two people looking at "the same plan" are
 * looking at different numbers.
 */
describe('share links', () => {
  it('round-trips a plan and reproduces the identical projection', async () => {
    const original = demoScenario('CZ', START);
    const fragment = await encodeScenario(original);
    const restored = await decodeScenario(fragment);

    expect(restored).not.toBeNull();
    expect(restored?.leaveRegime.jurisdiction).toBe('CZ');
    const a = simulate(original);
    const b = simulate(restored!);
    expect(b.minReserve).toBeCloseTo(a.minReserve, 6);
    expect(b.minReserveAt).toEqual(a.minReserveAt);
    expect(b.finalNetWorth).toBeCloseTo(a.finalNetWorth, 6);
  });

  it('reattaches the Slovak regime, which cannot survive JSON on its own', async () => {
    const original = demoScenario('SK', START);
    const restored = await decodeScenario(await encodeScenario(original));
    expect(restored?.currency).toBe('EUR');
    /* The regime is behaviour, not data: it must be the real object, callable. */
    expect(typeof restored?.leaveRegime.maternityMonths).toBe('function');
    expect(restored?.leaveRegime.maternityMonths({ parentalMonths: 24, returnToWorkPct: 100 })).toBe(
      8,
    );
  });

  it('stays short enough to paste into a chat', async () => {
    const fragment = await encodeScenario(demoScenario('CZ', START));
    expect(fragment.length).toBeLessThan(1400);
    /* URL-safe alphabet only, or the link breaks the moment something escapes it. */
    expect(fragment.slice(3)).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('returns null rather than throwing on a truncated or hand-edited link', async () => {
    expect(await decodeScenario('#p=notbase64!!')).toBeNull();
    expect(await decodeScenario('#nope')).toBeNull();
    const good = await encodeScenario(demoScenario('CZ', START));
    expect(await decodeScenario(good.slice(0, good.length - 20))).toBeNull();
  });
});
