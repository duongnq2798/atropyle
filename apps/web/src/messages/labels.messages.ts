import type { Role, StateName } from '@atropyle/sdk';
import { defineMessages } from '@/i18n/core';

export const messages = defineMessages(
  {
    stateActive: 'Active',
    stateGrace: 'Grace period',
    stateRecovery: 'Recovery pending',
    stateReleasedInherit: 'Released to heirs',
    stateReleasedRecover: 'Released to the recovery wallet',
    stateExpired: 'Drill expired',
    roleOwner: 'Owner',
    roleHeir: 'Heir',
    roleGuardian: 'Guardian',
    roleRecoveryTarget: 'Recovery target',
    drill: 'Drill',
  },
  {
    stateActive: 'Đang hoạt động',
    stateGrace: 'Thời gian ân hạn',
    stateRecovery: 'Đang chờ khôi phục',
    stateReleasedInherit: 'Đã giải phóng cho người thừa kế',
    stateReleasedRecover: 'Đã giải phóng cho ví khôi phục',
    stateExpired: 'Drill đã hết hạn',
    roleOwner: 'Chủ',
    roleHeir: 'Người thừa kế',
    roleGuardian: 'Người giám hộ',
    roleRecoveryTarget: 'Đích khôi phục',
    drill: 'Drill',
  },
);

export type LabelKey = keyof typeof messages.en;

export const STATE_KEY: Record<StateName, LabelKey> = {
  active: 'stateActive',
  grace: 'stateGrace',
  recovery: 'stateRecovery',
  releasedInherit: 'stateReleasedInherit',
  releasedRecover: 'stateReleasedRecover',
};

export const ROLE_KEY: Record<Role, LabelKey> = {
  owner: 'roleOwner',
  heir: 'roleHeir',
  guardian: 'roleGuardian',
  recoveryTarget: 'roleRecoveryTarget',
};

/** The states a Thread or StateBadge can show: the five vault states plus an expired Drill (spec §4.1). */
export const THREAD_STATE_KEY: Record<StateName | 'expired', LabelKey> = { ...STATE_KEY, expired: 'stateExpired' };
