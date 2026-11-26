'use client';

import { type UseQueryResult, useQuery } from '@tanstack/react-query';
import { sdkQuery } from './hooks';
import { useChainSettings } from './provider';
import type { Sdk } from './types';

/**
 * The SDK client of this build's deployment, created once per cross-check setting. It has a module of its own: the
 * shell loads hooks.ts on every page (the wallet asks it for sdkQuery), and from there the first route to call this
 * hook brought TanStack's query observer into the first load of / and of every other page (R23).
 */
export function useSdk(): UseQueryResult<Sdk> {
  const { crossCheck } = useChainSettings();
  return useQuery(sdkQuery(crossCheck));
}
