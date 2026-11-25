export type ClassValue = string | false | null | undefined;

/** Joins the truthy class names. Tailwind classes are written so that no two in one call conflict. */
export function cn(...v: ClassValue[]): string {
  return v.filter(Boolean).join(' ');
}
