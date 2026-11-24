'use client';

import type { ReactNode } from 'react';
import { ChainProvider } from '@/chain/provider';
import { LangProvider } from '@/i18n/provider';
import { KVProvider } from '@/lib/kv';
import type { KV } from '@/lib/store';
import { MotionProvider } from '@/motion/provider';
import { ThemeProvider } from '@/theme/provider';
import { WalletProvider } from '@/wallet/provider';

/**
 * Every page renders inside these, in this order (storage first: language, theme, chain and wallet read it). No
 * tooltip provider: each Tooltip brings its own, so `/` loads no Radix tooltip (ruling R23).
 */
export function Providers({ children, kv }: { children: ReactNode; kv?: KV }) {
  return (
    <KVProvider kv={kv}>
      <LangProvider>
        <ThemeProvider>
          <ChainProvider>
            <WalletProvider>
              <MotionProvider>{children}</MotionProvider>
            </WalletProvider>
          </ChainProvider>
        </ThemeProvider>
      </LangProvider>
    </KVProvider>
  );
}
