// @vitest-environment node
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { applyCompileHints, CHUNKS_DIR, COMPILE_HINT, noModuleScripts } from '../../scripts/lib/compile-hints';

describe('noModuleScripts', () => {
  it('lists the src of every noModule script, in either spelling of the attribute', () => {
    const html =
      '<script src="/_next/static/chunks/a.js" async=""></script>' +
      '<script src="/_next/static/chunks/poly.js" noModule=""></script>' +
      '<script nomodule src="/x.js"></script><script>self.__next_f=[]</script>';
    expect(noModuleScripts(html)).toEqual(['/_next/static/chunks/poly.js', '/x.js']);
  });

  it('does not take an attribute that only starts with the word', () => {
    expect(noModuleScripts('<script data-nomodule-x="1" src="/a.js"></script>')).toEqual([]);
  });
});

describe('applyCompileHints', () => {
  function site(): string {
    const out = mkdtempSync(join(tmpdir(), 'atropyle-hints-'));
    const chunks = join(out, CHUNKS_DIR);
    mkdirSync(join(chunks, 'nested'), { recursive: true });
    writeFileSync(join(chunks, 'app.js'), '(globalThis.TURBOPACK=[]).push(1);');
    writeFileSync(join(chunks, 'nested', 'route.js'), 'console.log(2);');
    writeFileSync(join(chunks, 'poly.js'), 'polyfills();');
    writeFileSync(join(chunks, 'style.css'), 'a{}');
    writeFileSync(
      join(out, 'index.html'),
      '<script src="/_next/static/chunks/app.js"></script><script src="/_next/static/chunks/poly.js?v=1" noModule=""></script>',
    );
    return out;
  }
  const read = (out: string, ...p: string[]) => readFileSync(join(out, CHUNKS_DIR, ...p), 'utf8');

  it('hints every chunk but the noModule polyfills, and leaves other files alone', () => {
    const out = site();
    expect(applyCompileHints(out)).toBe(2);
    expect(read(out, 'app.js')).toBe(`${COMPILE_HINT}(globalThis.TURBOPACK=[]).push(1);`);
    expect(read(out, 'nested', 'route.js')).toBe(`${COMPILE_HINT}console.log(2);`);
    expect(read(out, 'poly.js')).toBe('polyfills();');
    expect(read(out, 'style.css')).toBe('a{}');
  });

  it('changes nothing on a second run', () => {
    const out = site();
    applyCompileHints(out);
    expect(applyCompileHints(out)).toBe(2);
    expect(read(out, 'app.js').split(COMPILE_HINT)).toHaveLength(2);
  });

  it('is the V8 magic comment, alone on the first line', () => {
    expect(COMPILE_HINT).toBe('//# allFunctionsCalledOnLoad\n');
  });

  it('does nothing when there are no chunks', () => {
    expect(applyCompileHints(mkdtempSync(join(tmpdir(), 'atropyle-hints-')))).toBe(0);
  });
});
