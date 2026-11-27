import type { Role, StateName } from '@atropyle/sdk';
import { defineMessages } from '@/i18n/core';

export const messages = defineMessages(
  {
    stateActive: 'Active',
    stateGrace: 'Alarm window',
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
    stateActive: 'Đang hoạt\u00a0động',
    stateGrace: 'Thời\u00a0gian báo\u00a0động',
    stateRecovery: 'Đang chờ khôi\u00a0phục',
    stateReleasedInherit: 'Thuộc\u00a0về người\u00a0thừa\u00a0kế',
    stateReleasedRecover: 'Thuộc\u00a0về ví khôi\u00a0phục',
    stateExpired: 'Drill đã hết\u00a0hạn',
    roleOwner: 'Chủ\u00a0vault',
    roleHeir: 'Người\u00a0thừa\u00a0kế',
    roleGuardian: 'Người\u00a0giám\u00a0hộ',
    roleRecoveryTarget: 'Đích khôi\u00a0phục',
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
