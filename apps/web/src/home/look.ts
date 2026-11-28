/** Inline link look of the footer and ExternalLink, in the body ink: the door for heirs and the caption's link. */
export const DOOR =
  'text-ink underline decoration-line-strong decoration-1 underline-offset-4 transition-colors duration-150 ' +
  'hover:decoration-thread';

/** An arrow icon that sits on the text's baseline, as the proof line draws it (src/shell/proof-line.tsx). */
export const ARROW = 'ml-[0.5ch] inline-block size-[1em] align-[-0.125em]';

/**
 * A chip's face, the span after its radio, on the hero (ask-circuit.tsx) and on the stage (stage.tsx): its states (the
 * ring, checked, hover, focus) are in home.css under `.ask-chip` and `.stage-chip`, written once there (R-T5p-12).
 * The ring's width comes out of the padding (pl-3 pr-3.5): the three English chips of the hero still share one row
 * of the 644 px text column (634.8 px).
 */
export const CHIP_FACE =
  'inline-flex min-h-10 cursor-pointer select-none items-center text-balance rounded-full border border-line-strong ' +
  'py-2 pr-3.5 pl-3 text-ink-muted text-small transition-colors duration-150';
