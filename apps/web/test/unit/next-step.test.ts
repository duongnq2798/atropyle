import type { TimelineEvent } from '@atropyle/sdk';
import { describe, expect, it } from 'vitest';
import { nextStep } from '../../src/app/vault/next-step';
import { translate } from '../../src/i18n/core';
import { messages } from '../../src/messages/vault.messages';

const NOW = 1_000n;
/** A Drill's timeline: the alarm, the release, then the Drill's expiry a week out. */
const EVENTS = [
  { kind: 'alarm', at: 900n },
  { kind: 'release', at: 960n },
  { kind: 'drillExpiry', at: 605_800n },
] as TimelineEvent[];

const status = (over: Record<string, unknown>) =>
  ({
    state: 'active',
    pending: 'active',
    expired: false,
    blockTimestamp: NOW,
    windowEndsAt: null,
    releasedAt: null,
    ...over,
  }) as never;

describe('the next step under the header thread', () => {
  it('names the next moment still ahead while nothing is due', () => {
    const ahead = [{ kind: 'alarm', at: 1_200n }, ...EVENTS.slice(2)] as TimelineEvent[];
    expect(nextStep(status({}), ahead)).toEqual({ kind: 'alarm', at: 1_200n, key: 'nextAlarm' });
  });

  it('once the release is due, speaks of the release, never of the Drill expiry (7B-P1)', () => {
    const due = nextStep(status({ state: 'grace', pending: 'releasedInherit', windowEndsAt: 960n }), EVENTS);
    expect(due).toEqual({ kind: 'releaseDue', at: 960n, key: 'nextReleaseDue' });
    const recovery = nextStep(status({ state: 'recovery', pending: 'releasedRecover', windowEndsAt: 960n }), EVENTS);
    expect(recovery).toEqual({ kind: 'releaseDue', at: 960n, key: 'nextReleaseDueRecover' });
  });

  it('once released, says when and to whom', () => {
    const inherit = nextStep(
      status({ state: 'releasedInherit', pending: 'releasedInherit', releasedAt: 980n }),
      EVENTS,
    );
    expect(inherit).toEqual({ kind: 'released', at: 980n, key: 'nextReleased' });
    const recover = nextStep(
      status({ state: 'releasedRecover', pending: 'releasedRecover', releasedAt: 980n }),
      EVENTS,
    );
    expect(recover).toEqual({ kind: 'released', at: 980n, key: 'nextReleasedRecover' });
  });

  it('an expired Drill keeps the timeline as it is', () => {
    const expired = nextStep(
      status({ state: 'releasedInherit', pending: 'releasedInherit', releasedAt: 980n, expired: true }),
      EVENTS,
    );
    expect(expired?.kind).toBe('drillExpiry');
  });

  it('reads in both languages, with the Vietnamese compounds kept whole', () => {
    const NBSP = String.fromCharCode(0xa0);
    for (const key of ['nextReleaseDue', 'nextReleaseDueRecover', 'nextReleased', 'nextReleasedRecover'] as const) {
      expect(translate(messages, 'en', key, {}).length).toBeGreaterThan(0);
      const vi = translate(messages, 'vi', key, {});
      expect(vi).not.toMatch(/thừa kế|khôi phục/);
      expect(vi.includes(NBSP)).toBe(true);
    }
  });
});
