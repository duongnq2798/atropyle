/**
 * The product's own checkbox and radio marks. A native input stays the control (`peer sr-only`: the keyboard, the
 * form and a screen reader use it) and the mark after it is drawn from its state, aria-hidden. Chromium draws an
 * unticked native box or radio in night as a filled grey shape that reads as disabled, so no editor shows one.
 */

/**
 * A checkbox drawn as a switch: the track follows the input (peer), the knob slides. The label around them carries
 * `group`, so hovering anywhere on it lights the track's edge.
 *
 *     <label className="group …"><input type="checkbox" className="peer sr-only" />
 *       <span aria-hidden="true" data-part="switch" className={SWITCH}><span className={KNOB} /></span>…</label>
 */
export const SWITCH =
  'relative inline-flex h-6 w-10 shrink-0 items-center rounded-full border border-line-strong bg-surface-3 ' +
  'transition-colors duration-150 peer-checked:border-thread peer-checked:bg-thread ' +
  'peer-focus-visible:outline-2 peer-focus-visible:outline-thread peer-focus-visible:outline-offset-2 ' +
  'group-hover:border-ink-muted peer-checked:[&>span]:translate-x-4 peer-checked:[&>span]:bg-on-thread';
export const KNOB =
  'ml-0.5 block size-4.5 rounded-full bg-ink-muted shadow-sm motion-safe:transition-transform motion-safe:duration-150';

/**
 * A radio: an empty ring, and a dot that grows in it when the input is picked. The keyboard focus shows on whatever
 * holds the radio (a card's `has-focus-visible`), since the ring is small.
 *
 *     <input type="radio" className="peer sr-only" />
 *     <span aria-hidden="true" data-part="radio" className={RADIO}><span className={RADIO_DOT} /></span>
 */
export const RADIO =
  'grid size-5 shrink-0 place-items-center rounded-full border-2 border-line-strong transition-colors duration-150 ' +
  'peer-checked:border-thread peer-checked:[&>span]:scale-100';
export const RADIO_DOT =
  'size-2.5 scale-0 rounded-full bg-thread motion-safe:transition-transform motion-safe:duration-150';
