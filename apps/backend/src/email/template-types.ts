import type { Lang } from '../types';
import type { EmailKind } from './kinds';

/** One rendered template with {{placeholders}} (see kinds.ts PLACEHOLDERS). */
export interface Template {
  subject: string;
  html: string;
  text: string;
}

export type TemplateSet = Record<EmailKind, Record<Lang, Template>>;
