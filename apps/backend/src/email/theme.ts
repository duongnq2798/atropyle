export const TONES = ['thread', 'alive', 'grace', 'recovery', 'release', 'danger'] as const;
export type Tone = (typeof TONES)[number];

export interface Palette extends Record<Tone, string> {
  bg: string;
  surface1: string;
  surface2: string;
  surface3: string;
  ink: string;
  muted: string;
}

/** Spec §4.3, dark column. */
export const DARK: Palette = {
  bg: '#0B0D12',
  surface1: '#12151C',
  surface2: '#181C25',
  surface3: '#20252F',
  ink: '#ECE7DD',
  muted: '#A59F94',
  thread: '#E8B65A',
  alive: '#5CC8B0',
  grace: '#F0A23B',
  recovery: '#7FA8FF',
  release: '#B7A6FF',
  danger: '#FF6B5E',
};

/** Spec §4.3, light column: the inline default of every email (clients without dark-mode CSS show this). */
export const LIGHT: Palette = {
  bg: '#F6F1E7',
  surface1: '#FFFDF8',
  surface2: '#F0EADF',
  surface3: '#E7DFD1',
  ink: '#16130F',
  muted: '#5E574C',
  thread: '#A86F12',
  alive: '#127A63',
  grace: '#A35A00',
  recovery: '#2E5BC7',
  release: '#5B44C9',
  danger: '#B42318',
};

/** The one button: dark-theme thread gold with ink text reads the same in both themes (9.9:1). */
export const BUTTON = { background: '#E8B65A', text: '#16130F' } as const;

/**
 * Spec §4.2 faces with system fallbacks: mail clients load no web font (no third-party fetch, spec §8).
 * No quotes in the stacks, so they can sit inside a style attribute and inside <style> unescaped.
 */
export const FONTS = {
  serif: 'Fraunces, Georgia, Times New Roman, serif',
  sans: 'Inter, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica, Arial, sans-serif',
  mono: 'JetBrains Mono, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
} as const;

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5]
    .map((i) => Number.parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 2.2 contrast ratio of two #RRGGBB colours. */
export function contrast(a: string, b: string): number {
  const x = luminance(a);
  const y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
