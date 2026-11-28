// @vitest-environment node
import { readFileSync } from 'node:fs';
import { buildAll, packInputs, stepBytes } from '@atropyle/circuits';
import { cpuAbi, getDeployment, OUT_FLAGS, PRESETS, programEngine, STATE_CODES } from '@atropyle/sdk';
import { vectorBytes } from '@atropyle/sdk/verify';
import { bytesToHex, decodeFunctionData, encodeFunctionData, hexToBytes, toFunctionSelector } from 'viem';
import { describe, expect, it } from 'vitest';
import {
  ASK_CALLS_FILE,
  HERO_CIRCUIT_FILE,
  heroAsk,
  renderAskCalls,
  renderHeroCircuit,
} from '../../scripts/lib/hero-ask';
import { netlistGeometry, signalLanes } from '../../scripts/lib/netlist-layout';
import { STEP_EXAMPLE } from '../../src/content/commands';
import { caseOf, HERO_CASES, LETTER } from '../../src/home/hero-cases';
import { CIRCUIT, RELEASE } from '../../src/home/hero-circuit';
import { ANSWER, ASK, ASK_RPC, ASK_TARGET } from '../../src/home/impl/ask-calls';
import { HERO_BASE, HERO_HEIRS, HERO_STATES } from '../../src/home/impl/hero-states';
import { DEPTHS, LATCHES, NANDS } from '../../src/home/netlist-geometry';
import { TOTAL_CASES } from '../../src/proof/paint';

const program = buildAll().program;
const hero = heroAsk(program);
const DAY = 86_400n;
const hex1 = (n: number) => bytesToHex(Uint8Array.of(n));
const popcount = (n: number) => n.toString(2).replaceAll('0', '').length;

describe('the three questions of the hero', () => {
  it('ask a sixMonths vault with k = 1 of two guardians, two heirs and recovery on', () => {
    expect(HERO_BASE.timing).toEqual(PRESETS.sixMonths);
    expect([HERO_BASE.k, HERO_BASE.guardians.length, HERO_BASE.recoveryEnabled]).toEqual([1, 2, true]);
    expect(HERO_HEIRS.map((h) => h.bps)).toEqual([7_000, 3_000]);
    for (const c of HERO_CASES) expect(caseOf(LETTER[c])).toBe(c);
    expect(caseOf('x')).toBeUndefined();
  });

  it('are the cases the spec names (§18.4.3 Task 5′)', () => {
    const { alive, silent, liar } = HERO_STATES;
    expect(alive.state.state).toBe(STATE_CODES.active);
    expect(alive.state.lastAlive).toBe(alive.at - DAY);
    expect(alive.inputs.alive).toBe(true);
    expect(silent.state.state).toBe(STATE_CODES.grace);
    expect(silent.state.alarmAt).toBeGreaterThan(0n);
    expect(silent.inputs.windowDone).toBe(true);
    expect(popcount(silent.inputs.inhVotes)).toBeGreaterThanOrEqual(silent.state.k);
    expect(silent.inputs.alive).toBe(false);
    expect(liar.state.state).toBe(STATE_CODES.active);
    expect(liar.state.lastAlive).toBe(liar.at - DAY);
    expect(liar.inputs.inhVotes).toBe(1);
    expect(liar.inputs.alive).toBe(false);
  });

  it('answer as the policy netlist does: alive and liar keep the gate closed, silent opens it', () => {
    const engine = programEngine(program);
    for (const c of HERO_CASES) {
      const r = engine.step(HERO_STATES[c].state.state, HERO_STATES[c].inputs);
      expect(ANSWER[c], c).toEqual({
        next: hex1(r.next),
        out: hex1(r.out),
        release: (r.out & OUT_FLAGS.release) !== 0,
      });
      expect(RELEASE[c], c).toBe(ANSWER[c].release);
    }
    expect(HERO_CASES.map((c) => RELEASE[c])).toEqual([false, true, false]);
    expect(ANSWER.silent.next).toBe(hex1(STATE_CODES.releasedInherit));
  });

  it('send the bytes P9 sends, as calldata viem encodes now (7C-main-sync)', () => {
    const d = getDeployment('xlayer');
    const selector = toFunctionSelector('step(uint256,bytes,bytes)');
    for (const c of HERO_CASES) {
      const bytes = vectorBytes({ state: HERO_STATES[c].state.state, inputs: packInputs(HERO_STATES[c].inputs) });
      const r = stepBytes(program, hexToBytes(bytes.state), hexToBytes(bytes.inputs));
      expect([ANSWER[c].next, ANSWER[c].out], c).toEqual([bytesToHex(r.next), bytesToHex(r.out)]);
      const data = encodeFunctionData({
        abi: cpuAbi,
        functionName: 'step',
        args: [d.policyId, bytes.state, bytes.inputs],
      });
      expect(ASK[c], c).toBe(data);
      expect(decodeFunctionData({ abi: cpuAbi, data: ASK[c] }).args).toEqual([d.policyId, bytes.state, bytes.inputs]);
      expect(ASK[c].startsWith(selector)).toBe(true);
      expect((ASK[c].length - 2) / 2).toBe(228);
    }
  });

  it('ask the processor and the operators of deployments/xlayer.json, the ones /proof/ prints', () => {
    const d = getDeployment('xlayer');
    expect(ASK_TARGET).toEqual({ chainId: 196, cpu: d.cpu, policyId: d.policyId.toString() });
    expect(ASK_TARGET.cpu).toBe(STEP_EXAMPLE.cpu);
    expect(ASK_TARGET.policyId).toBe(String(STEP_EXAMPLE.circuit));
    expect(ASK_RPC).toEqual({ rpcUrls: d.rpcUrls, quorumRpcUrls: d.quorumRpcUrls });
  });

  it('are generated fresh, and the caption counts the circuit /proof/ runs (npm run geometry -w apps/web)', () => {
    const g = netlistGeometry(program, hero.vectors);
    expect(readFileSync(HERO_CIRCUIT_FILE, 'utf8')).toBe(renderHeroCircuit(g, hero));
    expect(readFileSync(ASK_CALLS_FILE, 'utf8')).toBe(renderAskCalls(hero));
    expect(CIRCUIT).toEqual({ nands: NANDS, latches: LATCHES, depths: DEPTHS, cases: TOTAL_CASES });
  });

  it('light the release output in lane j exactly where question j opens the gate', () => {
    const release = signalLanes(program, hero.vectors)[program.outIdx[2]];
    // for…of, not forEach: an expression-bodied forEach callback trips lint/suspicious/useIterableCallbackReturn.
    for (const [j, c] of HERO_CASES.entries()) expect(((release >> j) & 1) === 1, c).toBe(RELEASE[c]);
  });
});
