import type { messages } from '@/messages/editors.messages';

type EditorKey = keyof (typeof messages)['en'];

/** The editors.messages keys that name a field of the plan; a key missing there makes a return below a type error. */
export type FieldKey = Extract<
  EditorKey,
  | 'fieldPlan'
  | 'fieldHeirs'
  | 'heirAccount'
  | 'fieldHeirShare'
  | 'guardiansTitle'
  | 'guardianAccount'
  | 'kLabel'
  | 'fieldRecovery'
  | 'fieldTiming'
  | 'periodLabel'
  | 'thresholdLabel'
  | 'windowLabel'
  | 'fieldAssets'
  | 'fieldAsset'
>;

/** `head`, an optional `[index]`, an optional `.leaf`: every path validatePlan writes. */
const PATH = /^([A-Za-z]+)(?:\[(\d+)\])?(?:\.([A-Za-z]+))?$/;
const TIMING = new Map<string, FieldKey>([
  ['period', 'periodLabel'],
  ['threshold', 'thresholdLabel'],
  ['window', 'windowLabel'],
]);

/** The field a plan check path names, as an editors.messages key and the 1-based row it is in. */
export function issueField(path: string): { key: FieldKey; n?: number } {
  const m = PATH.exec(path);
  if (!m) return { key: 'fieldPlan' };
  const [, head, index, leaf] = m;
  const n = index === undefined ? undefined : Number(index) + 1;
  if (head === 'heirs') {
    if (n === undefined) return { key: 'fieldHeirs' };
    return leaf === 'bps' || leaf === 'percent' ? { key: 'fieldHeirShare', n } : { key: 'heirAccount', n };
  }
  if (head === 'guardians') return n === undefined ? { key: 'guardiansTitle' } : { key: 'guardianAccount', n };
  if (head === 'k' && n === undefined) return { key: 'kLabel' };
  if (head === 'recoveryEnabled') return { key: 'fieldRecovery' };
  if (head === 'timing') return { key: (leaf === undefined ? undefined : TIMING.get(leaf)) ?? 'fieldTiming' };
  if (head === 'assets') return n === undefined ? { key: 'fieldAssets' } : { key: 'fieldAsset', n };
  return { key: 'fieldPlan' };
}
