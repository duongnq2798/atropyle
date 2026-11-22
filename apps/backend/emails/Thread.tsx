import { Column, Row, Section } from '@react-email/components';
import type { ThreadShape } from '../src/email/kinds';
import { LIGHT, type Tone } from '../src/email/theme';

export interface Segment {
  id: string;
  /** Percent of the card width. */
  width: number;
  kind: 'tone' | 'gap' | 'track';
}

/** Cells of one strand: steady (done, then the track), or frayed into four short pieces before its end. */
export function segments(progress: number, shape: ThreadShape): Segment[] {
  const p = Math.max(0, Math.min(100, Math.round(progress)));
  if (shape === 'split') return [{ id: 'whole', width: 100, kind: 'tone' }];
  const out: Segment[] = [];
  if (shape === 'steady') {
    if (p > 0) out.push({ id: 'done', width: p, kind: 'tone' });
    if (p < 100) out.push({ id: 'rest', width: 100 - p, kind: 'track' });
    return out;
  }
  if (p > 16) out.push({ id: 'done', width: p - 16, kind: 'tone' });
  for (const i of [1, 2, 3, 4]) {
    out.push({ id: `fray-${i}`, width: 3, kind: 'tone' }, { id: `gap-${i}`, width: 1, kind: 'gap' });
  }
  if (p < 100) out.push({ id: 'rest', width: 100 - Math.max(p, 16), kind: 'track' });
  return out;
}

/** The second strand of a split thread starts a little to the right, like a thread parting in two. */
export const SECOND_STRAND: readonly Segment[] = [
  { id: 'lead', width: 14, kind: 'gap' },
  { id: 'tail', width: 86, kind: 'tone' },
];

function classOf(kind: Segment['kind'], tone: Tone): string {
  if (kind === 'tone') return `at-fill-${tone}`;
  return kind === 'gap' ? 'at-gap' : 'at-track';
}

function colorOf(kind: Segment['kind'], tone: Tone): string {
  if (kind === 'tone') return LIGHT[tone];
  return kind === 'gap' ? LIGHT.surface1 : LIGHT.surface3;
}

function Strand({ tone, cells }: { tone: Tone; cells: readonly Segment[] }) {
  return (
    <Row>
      {cells.map((s) => (
        <Column
          key={s.id}
          className={classOf(s.kind, tone)}
          style={{
            width: `${s.width}%`,
            height: '4px',
            fontSize: '0',
            lineHeight: '0',
            backgroundColor: colorOf(s.kind, tone),
          }}
        >
          {' '}
        </Column>
      ))}
    </Row>
  );
}

/** The thread motif (spec §4.1) as table cells: no images, so every mail client draws it. */
export function Thread({ tone, progress, shape }: { tone: Tone; progress: number; shape: ThreadShape }) {
  return (
    <Section>
      <Strand tone={tone} cells={segments(progress, shape)} />
      {shape === 'split' ? (
        <>
          <Row>
            <Column style={{ height: '3px', fontSize: '0', lineHeight: '0' }}> </Column>
          </Row>
          <Strand tone={tone} cells={SECOND_STRAND} />
        </>
      ) : null}
    </Section>
  );
}
