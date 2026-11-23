/// <reference types="vite/client" />
import { describe, expect, it } from 'vitest';
import { defineMessages, detectLang, format, type Messages, placeholders, translate } from '../../src/i18n/core';

describe('i18n', () => {
  it('fills placeholders and keeps unknown ones', () => {
    expect(format('Vault {vault} has {n} heirs', { vault: '0xA', n: 2 })).toBe('Vault 0xA has 2 heirs');
    expect(format('Missing {x}', {})).toBe('Missing {x}');
    expect(format('Big {v}', { v: 10n ** 20n })).toBe('Big 100000000000000000000');
  });

  it('translates with the chosen language', () => {
    const m = defineMessages({ hi: 'Hello {name}' }, { hi: 'Xin chào {name}' });
    expect(translate(m, 'en', 'hi', { name: 'An' })).toBe('Hello An');
    expect(translate(m, 'vi', 'hi', { name: 'An' })).toBe('Xin chào An');
  });

  it('lists placeholders once, sorted', () => {
    expect(placeholders('{b} {a} {b}')).toEqual(['a', 'b']);
  });

  it('detects the language', () => {
    expect(detectLang('vi', ['en-US'])).toBe('vi');
    expect(detectLang('en', ['vi-VN'])).toBe('en');
    expect(detectLang(null, ['vi-VN', 'en'])).toBe('vi');
    expect(detectLang(null, ['en-US', 'vi'])).toBe('en');
    expect(detectLang('fr', [])).toBe('en');
  });

  it('every messages file has the same keys and placeholders in en and vi', () => {
    const mods = import.meta.glob<{ messages: Messages<string> }>('../../src/**/*.messages.ts', { eager: true });
    const files = Object.keys(mods);
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const { en, vi } = mods[file].messages;
      expect(Object.keys(vi).sort(), file).toEqual(Object.keys(en).sort());
      for (const key of Object.keys(en)) {
        expect(en[key].trim().length, `${file} en.${key}`).toBeGreaterThan(0);
        expect(vi[key].trim().length, `${file} vi.${key}`).toBeGreaterThan(0);
        expect(placeholders(vi[key]), `${file} ${key}`).toEqual(placeholders(en[key]));
      }
    }
  });
});
