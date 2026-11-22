/** Roles a subscriber can hold (spec §9.6). The SDK's Role also has recoveryTarget, which never subscribes. */
export type Role = 'owner' | 'guardian' | 'heir';
export const ROLES: readonly Role[] = ['owner', 'guardian', 'heir'];

export type Lang = 'en' | 'vi';
export const LANGS: readonly Lang[] = ['en', 'vi'];

export const isRole = (v: unknown): v is Role => typeof v === 'string' && (ROLES as readonly string[]).includes(v);
export const isLang = (v: unknown): v is Lang => typeof v === 'string' && (LANGS as readonly string[]).includes(v);
