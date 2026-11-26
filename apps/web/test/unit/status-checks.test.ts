// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CHECK_KEYS, checkKey } from '../../src/app/status/checks';
import { messages as status } from '../../src/messages/status.messages';

const INTEGRITY = readFileSync(new URL('../../../../packages/sdk/src/verify/integrity.ts', import.meta.url), 'utf8');

describe('integrity check labels', () => {
  it('label every check name the SDK can report', () => {
    // A quoted name or the start of a template (`factory.feeToken ${…}`). If this catches a literal that is not a
    // check name, narrow the regex; never add a dead key to the map.
    const names = [
      ...new Set(
        [...INTEGRITY.matchAll(/['`]((?:factory|vaultImpl|cpuImpl|cpu|beacon|deployment|netlist)\.[A-Za-z]+)/g)].map(
          (m) => m[1],
        ),
      ),
    ];
    // 17 on integrity.ts today: the regex cannot read the three netlist names, built from `netlist.${role}`.
    expect(names.length).toBeGreaterThanOrEqual(17);
    for (const n of names) expect(checkKey(n) ?? checkKey(`${n} 0x0`), n).not.toBeNull();
  });

  it('label the netlist checks, whose names the SDK builds from a template', () => {
    // A regex, not a string: biome's noTemplateCurlyInString warns on '${role}' inside a quoted string.
    expect(INTEGRITY).toMatch(/eqCheck\(`netlist\.\$\{role\}`/);
    for (const tuple of ["['policy', d.policyId]", "['kofn5', d.circuits.kofn5]", "['ge4', d.circuits.ge4]"])
      expect(INTEGRITY).toContain(tuple);
    for (const r of ['policy', 'kofn5', 'ge4']) expect(checkKey(`netlist.${r}`), r).not.toBeNull();
    // Any other name built from a template would escape the regex above: there is exactly one, the netlist line.
    // (`factory.feeToken ${token}` puts a space before `${`, so it is not counted here; its prefix is tested below.)
    const templates = INTEGRITY.match(/`(?:factory|vaultImpl|cpuImpl|cpu|beacon|deployment|netlist)\.\$\{/g) ?? [];
    expect(templates).toEqual(['`netlist.${']);
  });

  it('read the fee token check by its prefix and give nothing for an unknown name', () => {
    expect(checkKey('factory.feeToken 0x779Ded0c9e1022225f8E0630b35a9b54bE713736')).toBe('chkFactoryFeeToken');
    expect(checkKey('factory.somethingNew')).toBeNull();
    expect(checkKey('__proto__')).toBeNull();
  });

  it('have a label in both languages for every key', () => {
    for (const k of CHECK_KEYS) {
      expect(status.en[k]).toBeTruthy();
      expect(status.vi[k]).toBeTruthy();
    }
  });
});
