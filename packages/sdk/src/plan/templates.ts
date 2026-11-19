import type { AssetInput, HeirInput, PlanInput, TimingInput } from './types';

export type TemplateName = 'simple' | 'guarded';

export interface TemplateOptions {
  heirs: HeirInput[];
  guardians?: string[];
  k?: number;
  recoveryEnabled?: boolean;
  timing?: TimingInput;
  assets?: AssetInput[];
  drill?: boolean;
}

/** Spec core §6: Simple needs no guardian; Guarded asks a majority of guardians and enables recovery. */
export function planTemplate(name: TemplateName, o: TemplateOptions): PlanInput {
  const drill = o.drill ?? false;
  if (name === 'simple') {
    return {
      version: 1,
      drill,
      heirs: o.heirs,
      guardians: [],
      k: 0,
      recoveryEnabled: false,
      timing: o.timing ?? (drill ? 'drill' : 'twelveMonths'),
      assets: o.assets ?? [],
    };
  }
  const guardians = o.guardians ?? [];
  return {
    version: 1,
    drill,
    heirs: o.heirs,
    guardians,
    k: o.k ?? Math.floor(guardians.length / 2) + 1,
    recoveryEnabled: o.recoveryEnabled ?? true,
    timing: o.timing ?? (drill ? 'drill' : 'sixMonths'),
    assets: o.assets ?? [],
  };
}
