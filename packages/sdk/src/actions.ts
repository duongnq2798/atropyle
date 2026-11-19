import type { AssetInput, HeirInput, TimingInput } from './plan/types';

export type VaultAction =
  | { type: 'checkIn' }
  | { type: 'setHeirs'; heirs: HeirInput[] }
  | { type: 'setGuardians'; guardians: string[]; k: number; recoveryEnabled: boolean }
  | { type: 'setTiming'; timing: TimingInput }
  | { type: 'setAssets'; assets: AssetInput[] }
  | { type: 'attestDeath'; on: boolean }
  | { type: 'voteRecovery'; target: string | null }
  | { type: 'poke' }
  | { type: 'distribute' }
  | { type: 'revokeAll' };

export type VaultActionType = VaultAction['type'];

export const VAULT_ACTIONS: readonly VaultActionType[] = [
  'checkIn',
  'setHeirs',
  'setGuardians',
  'setTiming',
  'setAssets',
  'attestDeath',
  'voteRecovery',
  'poke',
  'distribute',
  'revokeAll',
];

export const OWNER_ACTIONS: ReadonlySet<VaultActionType> = new Set([
  'checkIn',
  'setHeirs',
  'setGuardians',
  'setTiming',
  'setAssets',
  'revokeAll',
]);

export const GUARDIAN_ACTIONS: ReadonlySet<VaultActionType> = new Set(['attestDeath', 'voteRecovery']);
