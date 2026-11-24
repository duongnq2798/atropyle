'use client';

import type { ReactNode } from 'react';
import { ChainProvider } from '@/chain/provider';
import { LangProvider } from '@/i18n/provider';
import { KVProvider } from '@/lib/kv';
import type { KV } from '@/lib/store';
import { MotionProvider } from '@/motion/provider';
import { ThemeProvider } from '@/theme/provider';
import { TooltipProvider } from '@/ui/tooltip';

/** Every page renders inside these, in this order (storage first: language, theme and chain settings read it). */
export function Providers({ children, kv }: { children: ReactNode; kv?: KV }) {
  return (
    <KVProvider kv={kv}>
      <LangProvider>
        <ThemeProvider>
          <ChainProvider>
            <MotionProvider>
              <TooltipProvider>{children}</TooltipProvider>
            </MotionProvider>
          </ChainProvider>
        </ThemeProvider>
      </LangProvider>
    </KVProvider>
  );
}
