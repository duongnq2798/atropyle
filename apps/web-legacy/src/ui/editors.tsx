import {
  type AssetKind,
  formatDuration,
  LIMITS,
  type PlanIssue,
  PRESETS,
  type PresetName,
  planTemplate,
} from '@atropyle/sdk';
import { useState } from 'preact/hooks';
import {
  type AssetRow,
  customFrom,
  type HeirRow,
  presetsFor,
  type TimingForm,
  type TokenChoice,
} from '../lib/create-form';
import { useT } from './app-context';
import { messages } from './editors.messages';

type EditorKey = keyof typeof messages.en;

const inputValue = (e: Event) => (e.target as HTMLInputElement).value;
const invalid = (issues: readonly PlanIssue[], path: string): 'true' | undefined =>
  issues.some((i) => i.path === path) ? 'true' : undefined;

/** Issue messages come from the SDK's validatePlan / checkPlan, in English like every SDK message. */
export function IssueList({ issues, testid }: { issues: readonly PlanIssue[]; testid: string }) {
  if (issues.length === 0) return null;
  return (
    <ul class="banner banner-error" role="alert" data-testid={testid}>
      {issues.map((i) => (
        <li key={`${i.path}|${i.code}`} data-path={i.path} data-code={i.code}>
          {i.message}
        </li>
      ))}
    </ul>
  );
}

export function HeirsEditor(props: {
  rows: readonly HeirRow[];
  issues: readonly PlanIssue[];
  testid: string;
  onChange: (rows: HeirRow[]) => void;
  onRemove: (index: number) => void;
}) {
  const { rows, issues, testid, onChange, onRemove } = props;
  const t = useT(messages);
  const set = (i: number, patch: Partial<HeirRow>) => onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const many = rows.length > 1;
  return (
    <fieldset class="stack">
      <legend>{t('heirsTitle')}</legend>
      <p class="muted">{t('heirsHelp')}</p>
      {rows.map((r, i) => (
        <div class="row" key={i}>
          <label class="field">
            <span>{t('heirAccount', { n: i + 1 })}</span>
            <input
              data-testid={`${testid}-heir-${i}-account`}
              value={r.account}
              placeholder={'0x\u{2026}'}
              spellcheck={false}
              autocomplete="off"
              aria-invalid={invalid(issues, `heirs[${i}].account`)}
              onInput={(e) => set(i, { account: inputValue(e) })}
            />
          </label>
          {many ? (
            <>
              <label class="field">
                <span>{t('heirPercent')}</span>
                <input
                  data-testid={`${testid}-heir-${i}-percent`}
                  value={r.percent}
                  inputMode="decimal"
                  autocomplete="off"
                  aria-invalid={invalid(issues, `heirs[${i}].percent`)}
                  onInput={(e) => set(i, { percent: inputValue(e) })}
                />
              </label>
              <button type="button" class="btn" data-testid={`${testid}-remove-heir-${i}`} onClick={() => onRemove(i)}>
                {t('remove')}
              </button>
            </>
          ) : null}
        </div>
      ))}
      {rows.length < LIMITS.maxHeirs ? (
        <button
          type="button"
          class="btn"
          data-testid={`${testid}-add-heir`}
          onClick={() => onChange([...rows, { account: '', percent: '' }])}
        >
          {t('addHeir')}
        </button>
      ) : null}
    </fieldset>
  );
}

export interface GuardianFields {
  guardians: string[];
  k: string;
  recoveryEnabled: boolean;
}

/** `min`: rows that cannot be removed (1 in the wizard; 0 when an owner edits a vault to drop every guardian). */
export function GuardiansEditor(props: {
  value: GuardianFields;
  issues: readonly PlanIssue[];
  testid: string;
  min?: number;
  onChange: (v: GuardianFields) => void;
}) {
  const { value: v, issues, testid, onChange } = props;
  const min = props.min ?? 1;
  const t = useT(messages);
  const set = (patch: Partial<GuardianFields>) => onChange({ ...v, ...patch });
  const setAt = (i: number, a: string) => set({ guardians: v.guardians.map((g, j) => (j === i ? a : g)) });
  const n = v.guardians.length;
  // The SDK's own default for an empty k, so the hint never disagrees with the plan.
  const majority = planTemplate('guarded', { heirs: [], guardians: v.guardians }).k ?? 0;
  // The k the plan will use: the typed one, else the majority.
  const typedK = Number(v.k.trim());
  const kShown = v.k.trim() === '' ? majority : Number.isInteger(typedK) && typedK > 0 ? typedK : 'k';
  return (
    <fieldset class="stack">
      <legend>{t('guardiansTitle')}</legend>
      <p class="muted">{t('guardiansHelp')}</p>
      {v.guardians.map((g, i) => (
        <div class="row" key={i}>
          <label class="field">
            <span>{t('guardianAccount', { n: i + 1 })}</span>
            <input
              data-testid={`${testid}-guardian-${i}`}
              value={g}
              placeholder={'0x\u{2026}'}
              spellcheck={false}
              autocomplete="off"
              aria-invalid={invalid(issues, `guardians[${i}]`)}
              onInput={(e) => setAt(i, inputValue(e))}
            />
          </label>
          {n > min ? (
            <button
              type="button"
              class="btn"
              data-testid={`${testid}-remove-guardian-${i}`}
              onClick={() => set({ guardians: v.guardians.filter((_, j) => j !== i) })}
            >
              {t('remove')}
            </button>
          ) : null}
        </div>
      ))}
      {n < LIMITS.maxGuardians ? (
        <button
          type="button"
          class="btn"
          data-testid={`${testid}-add-guardian`}
          onClick={() => set({ guardians: [...v.guardians, ''] })}
        >
          {t('addGuardian')}
        </button>
      ) : null}
      {n > 0 ? (
        <>
          <label class="field">
            <span>{t('kLabel')}</span>
            <input
              data-testid={`${testid}-k`}
              value={v.k}
              inputMode="numeric"
              placeholder={String(majority)}
              autocomplete="off"
              aria-invalid={invalid(issues, 'k')}
              onInput={(e) => set({ k: inputValue(e) })}
            />
            <span class="muted">{t('kHelp', { majority, n })}</span>
          </label>
          <label class="field">
            <span class="row">
              <input
                type="checkbox"
                data-testid={`${testid}-recovery`}
                checked={v.recoveryEnabled}
                onChange={(e) => set({ recoveryEnabled: (e.target as HTMLInputElement).checked })}
              />
              <strong>{t('recovery')}</strong>
            </span>
            <span class="muted">{t('recoveryPower', { k: kShown })}</span>
          </label>
        </>
      ) : null}
    </fieldset>
  );
}

const PRESET_KEY = {
  drill: 'presetDrill',
  sixMonths: 'presetSixMonths',
  twelveMonths: 'presetTwelveMonths',
} as const satisfies Record<PresetName, EditorKey>;

export function TimingEditor(props: {
  value: TimingForm;
  drill: boolean;
  issues: readonly PlanIssue[];
  testid: string;
  onChange: (v: TimingForm) => void;
}) {
  const { value: v, drill, issues, testid, onChange } = props;
  const t = useT(messages);
  const line = (p: PresetName) =>
    t('presetLine', {
      period: formatDuration(PRESETS[p].period),
      threshold: PRESETS[p].threshold,
      window: formatDuration(PRESETS[p].window),
    });
  const toCustom = () => {
    const p = v.preset;
    onChange(p === 'custom' ? v : customFrom(p));
  };
  const field = (key: 'period' | 'threshold' | 'window', label: EditorKey) => (
    <label class="field">
      <span>{t(label)}</span>
      <input
        data-testid={`${testid}-${key}`}
        value={v[key]}
        inputMode={key === 'threshold' ? 'numeric' : 'text'}
        autocomplete="off"
        aria-invalid={invalid(issues, `timing.${key}`)}
        onInput={(e) => onChange({ ...v, [key]: inputValue(e) })}
      />
    </label>
  );
  return (
    <fieldset class="stack">
      <legend>{t('timingTitle')}</legend>
      {presetsFor(drill).map((p) => (
        <label class="field" key={p}>
          <span class="row">
            <input
              type="radio"
              name={`${testid}-timing`}
              data-testid={`${testid}-preset-${p}`}
              checked={v.preset === p}
              onChange={() => onChange({ ...v, preset: p })}
            />
            <strong>{t(PRESET_KEY[p])}</strong>
          </span>
          <span class="muted">{line(p)}</span>
        </label>
      ))}
      <label class="field">
        <span class="row">
          <input
            type="radio"
            name={`${testid}-timing`}
            data-testid={`${testid}-preset-custom`}
            checked={v.preset === 'custom'}
            onChange={toCustom}
          />
          <strong>{t('presetCustom')}</strong>
        </span>
      </label>
      {v.preset === 'custom' ? (
        <div class="stack">
          {field('period', 'periodLabel')}
          {field('threshold', 'thresholdLabel')}
          {field('window', 'windowLabel')}
          <p class="muted">{t('durationHelp')}</p>
        </div>
      ) : null}
    </fieldset>
  );
}

const KIND_KEY = {
  erc20: 'kindErc20',
  erc721: 'kindErc721',
  erc1155: 'kindErc1155',
} as const satisfies Record<AssetKind, EditorKey>;
const KINDS = Object.keys(KIND_KEY) as AssetKind[];

export function AssetsEditor(props: {
  rows: readonly AssetRow[];
  heirs: number;
  choices: readonly TokenChoice[];
  circuit: AssetRow;
  issues: readonly PlanIssue[];
  testid: string;
  onChange: (rows: AssetRow[]) => void;
}) {
  const { rows, heirs, choices, circuit, issues, testid, onChange } = props;
  const t = useT(messages);
  const [pick, setPick] = useState(0);
  const set = (i: number, patch: Partial<AssetRow>) => onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const add = (row: AssetRow) => onChange([...rows, row]);
  const full = rows.length >= LIMITS.maxAssets;
  const label = (c: TokenChoice, i: number) => c.symbol ?? t('testToken', { n: i + 1 });
  const known = (token: string): string | null => {
    const i = choices.findIndex((c) => c.address.toLowerCase() === token.trim().toLowerCase());
    return i < 0 ? null : label(choices[i], i);
  };
  const chosen = choices[pick] ?? choices[0];
  const listed =
    !!chosen && rows.some((r) => r.kind === 'erc20' && r.token.trim().toLowerCase() === chosen.address.toLowerCase());
  const heirOptions = Array.from({ length: heirs }, (_, h) => String(h));
  return (
    <fieldset class="stack">
      <legend>{t('assetsTitle')}</legend>
      <p class="muted">{t('assetsHelp')}</p>
      {rows.map((r, i) => (
        <div class="stack" key={i} data-testid={`${testid}-asset-${i}`}>
          <div class="row">
            <label class="field">
              <span>{t('kind')}</span>
              <select
                data-testid={`${testid}-asset-${i}-kind`}
                value={r.kind}
                onChange={(e) => set(i, { kind: inputValue(e) as AssetKind })}
              >
                {KINDS.map((k) => (
                  <option key={k} value={k}>
                    {t(KIND_KEY[k])}
                  </option>
                ))}
              </select>
            </label>
            <label class="field">
              <span>{t('tokenAddress')}</span>
              <input
                data-testid={`${testid}-asset-${i}-token`}
                value={r.token}
                placeholder={'0x\u{2026}'}
                spellcheck={false}
                autocomplete="off"
                aria-invalid={invalid(issues, `assets[${i}].token`)}
                onInput={(e) => set(i, { token: inputValue(e) })}
              />
            </label>
            {r.kind !== 'erc20' ? (
              <label class="field">
                <span>{t('tokenId')}</span>
                <input
                  data-testid={`${testid}-asset-${i}-id`}
                  value={r.id}
                  inputMode="numeric"
                  autocomplete="off"
                  aria-invalid={invalid(issues, `assets[${i}].id`)}
                  onInput={(e) => set(i, { id: inputValue(e) })}
                />
              </label>
            ) : null}
            {r.kind !== 'erc20' && heirs > 1 ? (
              <label class="field">
                <span>{t('assetHeir')}</span>
                <select
                  data-testid={`${testid}-asset-${i}-heir`}
                  value={r.heir}
                  onChange={(e) => set(i, { heir: inputValue(e) })}
                >
                  {heirOptions.map((h) => (
                    <option key={h} value={h}>
                      {t('heirN', { n: Number(h) + 1 })}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <button
              type="button"
              class="btn"
              data-testid={`${testid}-remove-asset-${i}`}
              onClick={() => onChange(rows.filter((_, j) => j !== i))}
            >
              {t('remove')}
            </button>
          </div>
          {known(r.token) ? <span class="muted">{known(r.token)}</span> : null}
        </div>
      ))}
      {chosen ? (
        <div class="row">
          <label class="field">
            <span>{t('pickToken')}</span>
            <select
              data-testid={`${testid}-token-pick`}
              value={String(pick)}
              onChange={(e) => setPick(Number(inputValue(e)))}
            >
              {choices.map((c, i) => (
                <option key={c.address} value={String(i)}>
                  {label(c, i)}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            class="btn"
            data-testid={`${testid}-add-token`}
            disabled={full || listed}
            onClick={() => add({ kind: 'erc20', token: chosen.address, id: '', heir: '0' })}
          >
            {t('addToken')}
          </button>
        </div>
      ) : null}
      <div class="row">
        <button
          type="button"
          class="btn"
          data-testid={`${testid}-add-nft`}
          disabled={full}
          onClick={() => add({ kind: 'erc721', token: '', id: '', heir: '0' })}
        >
          {t('addNft')}
        </button>
        <button
          type="button"
          class="btn"
          data-testid={`${testid}-add-circuit`}
          disabled={full}
          onClick={() => add({ ...circuit })}
        >
          {t('addCircuit')}
        </button>
      </div>
    </fieldset>
  );
}
