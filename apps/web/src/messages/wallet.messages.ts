import { defineMessages } from '@/i18n/core';

/**
 * The wallet's buttons in the header, part of every page's first load. The sheet, the menu and the banner keep their
 * strings in wallet-overlays.messages.ts, which only their own chunks import (ruling R23).
 */
export const messages = defineMessages(
  {
    connect: 'Connect wallet',
    connectShort: 'Connect',
    connecting: 'Connecting…',
    restoring: 'Reconnecting your wallet…',
    accountButton: 'Wallet {account}',
    accountButtonWrong: 'Wallet {account}, wrong network',
  },
  {
    connect: 'Kết nối ví',
    connectShort: 'Kết nối',
    connecting: 'Đang kết nối…',
    restoring: 'Đang kết nối lại ví…',
    accountButton: 'Ví {account}',
    accountButtonWrong: 'Ví {account}, sai mạng',
  },
);
