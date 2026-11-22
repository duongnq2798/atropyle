import { describe, expect, it } from 'vitest';
import { formatDeadline, groupAddress, shortHex, transferLines, transfersHtml } from '../../src/email/format';

const TOKEN = '0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0';
const HEIR = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC';

describe('email formatting', () => {
  it('prints a deadline in UTC, and in UTC plus Vietnam time for VI (plan ruling 9)', () => {
    expect(formatDeadline(1795442700n, 'en')).toBe('Mon 23 Nov 2026, 14:05 UTC');
    expect(formatDeadline(1795442700n, 'vi')).toBe('14:05 UTC, 23/11/2026 (21:05, 23/11/2026 giờ Việt Nam)');
    // 20:30 UTC is already the next day in Vietnam.
    expect(formatDeadline(1795638600n, 'vi')).toBe('20:30 UTC, 25/11/2026 (03:30, 26/11/2026 giờ Việt Nam)');
  });

  it('shortens hashes and groups an address for comparison by eye', () => {
    expect(shortHex(HEIR)).toBe('0x3C44…93BC');
    expect(shortHex(`0x${'ab12'.repeat(16)}`, 10, 6)).toBe('0xab12ab12…12ab12');
    expect(groupAddress(HEIR)).toBe('0x 3C44 CdDd B6a9 00fa 2b58 5dd2 99e0 3d12 FA42 93BC');
  });

  it('writes one payout line per transfer, with the token address and never its name', () => {
    const lines = transferLines(
      [
        { kind: 'erc20', token: TOKEN, to: HEIR, amount: '10000', id: null },
        { kind: 'erc721', token: TOKEN, to: HEIR, amount: null, id: '42' },
        { kind: 'erc1155', token: TOKEN, to: HEIR, amount: '3', id: '7' },
        { kind: 'unknown', token: null, to: HEIR, amount: '5', id: '2' },
      ],
      'en',
    );
    expect(lines).toEqual([
      `10000 of token ${TOKEN} to ${HEIR}`,
      `Token #42 of ${TOKEN} to ${HEIR}`,
      `3 of token #7 of ${TOKEN} to ${HEIR}`,
      `Asset #2 (5) to ${HEIR}`,
    ]);
    expect(transferLines([{ kind: 'erc20', token: TOKEN, to: HEIR, amount: '1.5', id: null }], 'vi')).toEqual([
      `1.5 token ${TOKEN} cho ${HEIR}`,
    ]);
  });

  it('builds the payout HTML from escaped lines only', () => {
    const html = transfersHtml(['1 of token <b>x</b>']);
    expect(html).toContain('1 of token &lt;b&gt;x&lt;/b&gt;');
    expect(html.startsWith('<p class="at-ink" style="')).toBe(true);
    expect(html).not.toContain('<b>');
  });
});
