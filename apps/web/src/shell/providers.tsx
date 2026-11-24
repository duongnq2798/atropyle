'use client';

import type { ReactNode } from 'react';
import { LangProvider } from '@/i18n/provider';
import { KVProvider } from '@/lib/kv';
import type { KV } from '@/lib/store';
import { MotionProvider } from '@/motion/provider';
import { ThemeProvider } from '@/theme/provider';
import { TooltipProvider } from '@/ui/tooltip';

/** Every page renders inside these, in this order (storage first: language and theme read it). */
export function Providers({ children, kv }: { children: ReactNode; kv?: KV }) {
  return (
    <KVProvider kv={kv}>
      <LangProvider>
        <ThemeProvider>
          <MotionProvider>
            <TooltipProvider>{children}</TooltipProvider>
          </MotionProvider>
        </ThemeProvider>
      </LangProvider>
    </KVProvider>
  );
}
