import { describe, expect, it } from 'vitest';
import { escapeHtml, fill, placeholdersOf } from '../../src/email/fill';

describe('fill', () => {
  it('escapes every value in HTML and leaves text as it is', () => {
    const t = '<p>{{vault}}</p>';
    expect(fill(t, { vault: '<script>alert("x")</script>' }, 'html')).toBe(
      '<p>&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;</p>',
    );
    expect(fill('{{vault}}', { vault: '<b>&</b>' }, 'text')).toBe('<b>&</b>');
    expect(escapeHtml(`&<>"'`)).toBe('&amp;&lt;&gt;&quot;&#39;');
  });

  it('inserts a triple-brace value raw, in HTML only', () => {
    expect(fill('<div>{{{transfersHtml}}}</div>', { transfersHtml: '<p>x</p>' }, 'html')).toBe('<div><p>x</p></div>');
    expect(() => fill('{{{transfersHtml}}}', { transfersHtml: '<p>x</p>' }, 'text')).toThrow(/HTML-only/);
  });

  it('never re-reads a filled value, so a value cannot inject a placeholder', () => {
    expect(fill('{{a}} {{b}}', { a: '{{b}}', b: 'B' }, 'text')).toBe('{{b}} B');
  });

  it('throws on a missing value instead of sending an email with a hole in it', () => {
    expect(() => fill('Hello {{deadline}}', {}, 'html')).toThrow('missing email value {{deadline}}');
  });

  it('lists the placeholders of a template', () => {
    expect(placeholdersOf('{{a}} {{{b}}} {{a}}')).toEqual(['a', 'b']);
  });
});
