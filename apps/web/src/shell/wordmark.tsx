import { cn } from '@/lib/cn';
import { StateGlyph } from '@/thread/glyphs';

/** The mark (the thread rises into the gate's arch and goes on beyond it), then the name. */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2 font-display text-ink text-title tracking-tight', className)}>
      <StateGlyph name="mark" size={28} className="text-thread" />
      <span>Atropyle</span>
    </span>
  );
}
