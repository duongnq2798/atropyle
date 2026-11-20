import { type AtropyleClient, createAtropyle, parseDeployment } from '@atropyle/sdk';
import type { Address } from 'viem';
import { inject } from 'vitest';
import type { DevnetInfo } from '../../../../scripts/lib/devnet-env';

export const devnet = (): DevnetInfo => inject('devnet');
export const account = (i: number): Address => devnet().accounts[i];
export const atropyle = (): AtropyleClient =>
  createAtropyle({ chain: parseDeployment(devnet().deployment), builderCode: null });
