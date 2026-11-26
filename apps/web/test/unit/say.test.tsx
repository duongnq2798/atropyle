// @vitest-environment node
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { defineMessages } from '../../src/i18n/core';
import { ByLang, Say } from '../../src/i18n/say';
import { formatCount } from '../../src/lib/count';

const m = defineMessages({ n: '{n} cases' }, { n: '{n} trường hợp' });

describe('Say: a message of a server component in both languages', () => {
  it('writes English, then Vietnamese, each in a span with its lang, each with numbers of its own language', () => {
    expect(renderToStaticMarkup(<Say m={m} k="n" params={(lang) => ({ n: formatCount(67_108_864, lang) })} />)).toBe(
      '<span lang="en" class="say-en">67,108,864 cases</span><span lang="vi" class="say-vi">67.108.864 trường hợp</span>',
    );
  });

  it('writes any text the same way with ByLang', () => {
    expect(renderToStaticMarkup(<ByLang text={(lang) => lang.toUpperCase()} />)).toBe(
      '<span lang="en" class="say-en">EN</span><span lang="vi" class="say-vi">VI</span>',
    );
  });
});
