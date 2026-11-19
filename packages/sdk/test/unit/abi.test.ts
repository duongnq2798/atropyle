import { describe, expect, it } from 'vitest';
import { cpuAbi, factoryAbi, revertAbi, vaultAbi } from '../../src/abi/index';

const names = (abi: readonly { type: string; name?: string }[], type: string) =>
  abi.filter((x) => x.type === type).map((x) => x.name);

describe('generated ABIs', () => {
  it('vault exposes the lifecycle, config views and events the SDK relies on', () => {
    const fns = names(vaultAbi, 'function');
    for (const f of [
      'checkIn',
      'setHeirs',
      'setGuardians',
      'setTiming',
      'setAssets',
      'attestDeath',
      'voteRecovery',
      'poke',
      'distribute',
      'status',
      'heirs',
      'guardians',
      'assets',
      'timing',
      'coverage',
      'owner',
      'drill',
      'k',
      'recoveryEnabled',
      'factory',
      'cpu',
      'policyId',
      'recVote',
      'expiresAt',
      'state',
    ]) {
      expect(fns).toContain(f);
    }
    const events = names(vaultAbi, 'event');
    for (const e of [
      'Alive',
      'ConfigUpdated',
      'Attested',
      'RecoveryVoted',
      'AlarmRaised',
      'AlarmCancelled',
      'Released',
      'StateChanged',
      'Distributed',
      'TransferFailed',
    ]) {
      expect(events).toContain(e);
    }
  });

  it('factory exposes fees, creation, prediction and the role index', () => {
    const fns = names(factoryAbi, 'function');
    for (const f of [
      'createVault',
      'predictVault',
      'currentFee',
      'earlyFee',
      'fullFee',
      'paidCount',
      'isVault',
      'vaultsOf',
      'vaultsOfLength',
      'vaultsOfPage',
      'vaultImpl',
      'cpu',
      'policyId',
      'treasury',
      'EARLY_COUNT',
    ]) {
      expect(fns).toContain(f);
    }
    expect(names(factoryAbi, 'event')).toContain('VaultCreated');
  });

  it('cpu exposes netlist and circuitInfo', () => {
    expect(names(cpuAbi, 'function')).toEqual(expect.arrayContaining(['netlist', 'circuitInfo', 'step']));
  });

  it('revertAbi knows every custom error of vault, factory and OZ ERC-20', () => {
    const errors = names(revertAbi, 'error');
    for (const e of [
      'NotOwner',
      'NotGuardian',
      'AlreadyReleased',
      'DrillExpired',
      'InvalidHeirs',
      'InvalidGuardians',
      'InvalidTiming',
      'InvalidAssets',
      'InvalidTarget',
      'RecoveryDisabled',
      'BadPolicyOutput',
      'Reentrancy',
      'AlreadyInitialized',
      'InsufficientGas',
      'UnsupportedFeeToken',
      'NotVault',
      'ERC20InsufficientAllowance',
      'ERC20InsufficientBalance',
    ]) {
      expect(errors).toContain(e);
    }
  });
});
