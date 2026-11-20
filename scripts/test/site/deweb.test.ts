import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  type Abi,
  type Address,
  decodeAbiParameters,
  decodeFunctionData,
  getAddress,
  type Hex,
  hexToBytes,
  keccak256,
  toFunctionSelector,
} from 'viem';
import { describe, expect, expectTypeOf, test } from 'vitest';
import {
  bindingAbi,
  callsParams,
  checkCommand,
  DEWEB,
  describeOp,
  EMIT_MAX_BYTES,
  emitBatch,
  emitCalls,
  emitJson,
  encodeOp,
  estimate,
  executePlan,
  fileKeccak,
  HIDDEN_HEX,
  keyFlagOf,
  type Op,
  parsePublishArgs,
  planPublish,
  publishCommand,
  type RegistryReader,
  redactHex,
  registryAbi,
  type TxSender,
  tapeoutCpuListAbi,
  unlockedChainProblem,
  uploadOrder,
  walletSender,
} from '../../lib/deweb';
import { makeSiteFile, sha256Hex } from '../../lib/site-files';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const CONTAINER = getAddress('0x97abe83c61003674451c35441c02cc3d7ad2c1e3');
const ANVIL0: Address = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';
const opts = { prune: false, fallback: 'index.html' };
const NO_KEY =
  'there is no key mode. Run --emit contracts/deweb-calls/<name>.json, then broadcast it with forge script (see docs/deployments.md)';
/** A made-up 64-hex value shaped like a private key (not a real or anvil key). */
const FAKE_KEY_HEX = 'ab'.repeat(32);
const FAKE_KEY = `0x${FAKE_KEY_HEX}`;

interface Stored {
  contentType: string;
  sha256: Hex;
  data: Uint8Array;
  chunks: number;
}

function messageOf(f: () => unknown): string {
  try {
    f();
  } catch (e) {
    return (e as Error).message;
  }
  throw new Error('expected a throw');
}

const join2 = (a: Uint8Array, b: Uint8Array) => {
  const out = new Uint8Array(a.length + b.length);
  out.set(a);
  out.set(b, a.length);
  return out;
};

/** In-memory SiteRegistry with the write rules of TapeKit SPEC appendix B. */
class FakeRegistry implements RegistryReader {
  files = new Map<string, Stored>();
  fallback = '';

  async fileInfo(path: string) {
    const f = this.files.get(path);
    return f ? { size: f.data.length, contentType: f.contentType, sha256: f.sha256, chunkCount: f.chunks } : null;
  }
  async readRange(path: string, offset: number, length: number) {
    return (this.files.get(path)?.data ?? new Uint8Array(0)).slice(offset, offset + length);
  }
  async paths() {
    return [...this.files.keys()];
  }
  async fallbackPath() {
    return this.fallback;
  }
  apply(data: Hex): void {
    const call = decodeFunctionData({ abi: registryAbi, data });
    switch (call.functionName) {
      case 'putFile': {
        const [, path, contentType, sha256, first] = call.args;
        this.files.set(path, { contentType, sha256, data: hexToBytes(first), chunks: 1 });
        return;
      }
      case 'appendChunk': {
        const [, path, index, chunk] = call.args;
        const f = this.files.get(path);
        if (!f || BigInt(f.chunks) !== index) throw new Error(`appendChunk ${path}: expectIndex ${index}`);
        f.data = join2(f.data, hexToBytes(chunk));
        f.chunks += 1;
        return;
      }
      case 'removeFile':
        this.files.delete(call.args[1]);
        return;
      case 'setFallback':
        this.fallback = call.args[1];
        return;
      default:
        throw new Error(`unexpected call ${call.functionName}`);
    }
  }
}

function senderFor(reg: FakeRegistry, revertAt = -1): TxSender & { sent: Hex[] } {
  const sent: Hex[] = [];
  return {
    sent,
    async send(tx) {
      expect(tx.to).toBe(DEWEB.registry);
      sent.push(tx.data);
      return `0x${sent.length.toString(16).padStart(64, '0')}`;
    },
    async wait() {
      const i = sent.length - 1;
      if (i === revertAt) return 'reverted';
      reg.apply(sent[i]);
      return 'success';
    },
  };
}

const enc = new TextEncoder();
const bytes = (n: number, seed: number) => Uint8Array.from({ length: n }, (_, i) => (i * 31 + seed) % 251);
const site = () => [
  makeSiteFile('index.html', enc.encode('<!doctype html><script type="module" src="./assets/app.js"></script>')),
  makeSiteFile('assets/app.js', bytes(60_000, 1)),
  makeSiteFile('assets/app.css', bytes(100, 2)),
  makeSiteFile('docs/guide.html', enc.encode('<h1>Guide</h1>')),
];

/** The ops behind contracts/deweb-calls/test/good.json, which DewebPublish.t.sol sends to a mock registry. */
function fixtureOps(): Op[] {
  const head = enc.encode('<!doctype html><title>Atropyle</title>');
  const tail = enc.encode('<p>tail</p>');
  return [
    {
      kind: 'putFile',
      path: 'index.html',
      contentType: 'text/html; charset=utf-8',
      sha256: sha256Hex(join2(head, tail)),
      data: head,
      replace: true,
      total: 2,
    },
    { kind: 'appendChunk', path: 'index.html', index: 1, data: tail, total: 2 },
    { kind: 'removeFile', path: 'old.js' },
    { kind: 'setFallback', path: 'index.html' },
  ];
}

test('the DeWEB ABI matches the selectors read on-chain', () => {
  const selectors = (abi: Abi) =>
    Object.fromEntries(abi.flatMap((x) => (x.type === 'function' ? [[x.name, toFunctionSelector(x)]] : [])));
  expect(selectors(registryAbi)).toEqual({
    putFile: '0xfab2ed82',
    appendChunk: '0xe2b51347',
    removeFile: '0x0a9c1871',
    setFallback: '0x4dc21ad0',
    fileInfo: '0x6c609107',
    read: '0xccaa7afb',
    readRange: '0x15a4cae2',
    pathCount: '0xb554782b',
    pathsRange: '0xb056072c',
    fallbackPath: '0xa76c7713',
    isOpenedContainer: '0x8951bab2',
    CHUNK_MAX: '0x9a8a305f',
  });
  expect(selectors(bindingAbi)).toEqual({
    bind: '0x69e292ce',
    monthlyFee: '0x8cfd3e40',
    isLive: '0xd6b062cd',
    isContainerLive: '0xdcca979e',
    containerPaidUntil: '0x9ebfd859',
  });
  expect(selectors(tapeoutCpuListAbi)).toEqual({ cpuCount: '0xa94da8a7', cpuAt: '0x4bc7cbbd' });
  for (const a of [DEWEB.registry, DEWEB.binding, DEWEB.opener, DEWEB.tapeoutFactory]) {
    expect(getAddress(a.toLowerCase())).toBe(a);
  }
});

test('the forge guard pins the same DeWEB addresses and selectors', () => {
  const sol = readFileSync(join(ROOT, 'contracts/script/lib/DewebCalls.sol'), 'utf8');
  expect(sol).toContain(`address internal constant REGISTRY = ${DEWEB.registry};`);
  expect(sol).toContain(`address internal constant BINDING = ${DEWEB.binding};`);
  for (const fn of ['putFile', 'appendChunk', 'removeFile', 'setFallback'] as const) {
    const item = registryAbi.find((x) => x.type === 'function' && x.name === fn);
    expect(sol).toContain(`bytes4 internal constant ${fn.toUpperCase()} = ${toFunctionSelector(item as never)};`);
  }
  const bind = bindingAbi.find((x) => x.type === 'function' && x.name === 'bind');
  expect(sol).toContain(`bytes4 internal constant BIND = ${toFunctionSelector(bind as never)};`);
});

test('uploadOrder puts assets first, then HTML, then index.html', () => {
  expect(uploadOrder(site()).map((f) => f.path)).toEqual([
    'assets/app.css',
    'assets/app.js',
    'docs/guide.html',
    'index.html',
  ]);
});

test('planPublish on an empty container writes every file and sets the fallback', async () => {
  const files = site();
  const plan = await planPublish(files, null, opts);
  expect(plan.files.map((f) => f.status)).toEqual(['new', 'new', 'new', 'new']);
  expect(plan.ops.map(describeOp)).toEqual([
    'putFile assets/app.css chunk 1/1 (100 B)',
    'putFile assets/app.js chunk 1/3 (24000 B)',
    'appendChunk assets/app.js chunk 2/3 (24000 B)',
    'appendChunk assets/app.js chunk 3/3 (12000 B)',
    'putFile docs/guide.html chunk 1/1 (14 B)',
    `putFile index.html chunk 1/1 (${files[0].bytes.length} B)`,
    'setFallback index.html',
  ]);
});

test('planPublish resumes a partial file and skips unchanged ones', async () => {
  const reg = new FakeRegistry();
  const files = site();
  const first = await planPublish(files, reg, opts);
  // The run dies on the third chunk of assets/app.js: two chunks are on chain.
  const failAt = first.ops.findIndex((op) => op.kind === 'appendChunk' && op.index === 2);
  await expect(executePlan(first.ops, CONTAINER, senderFor(reg, failAt))).rejects.toThrow(
    'reverted: appendChunk assets/app.js chunk 3/3',
  );

  const second = await planPublish(files, reg, opts);
  expect(second.files.map((f) => [f.path, f.status])).toEqual([
    ['assets/app.css', 'unchanged'],
    ['assets/app.js', 'resume'],
    ['docs/guide.html', 'new'],
    ['index.html', 'new'],
  ]);
  expect(second.ops.map(describeOp)).toEqual([
    'appendChunk assets/app.js chunk 3/3 (12000 B)',
    'putFile docs/guide.html chunk 1/1 (14 B)',
    `putFile index.html chunk 1/1 (${files[0].bytes.length} B)`,
    'setFallback index.html',
  ]);

  await executePlan(second.ops, CONTAINER, senderFor(reg));
  for (const f of files) expect(await reg.readRange(f.path, 0, f.bytes.length)).toEqual(f.bytes);
  expect((await planPublish(files, reg, opts)).ops).toEqual([]);
});

test('planPublish replaces a changed file and prunes removed paths', async () => {
  const reg = new FakeRegistry();
  await executePlan((await planPublish(site(), reg, opts)).ops, CONTAINER, senderFor(reg));
  const one = new Uint8Array(1);
  reg.files.set('old.js', {
    contentType: 'text/javascript; charset=utf-8',
    sha256: sha256Hex(one),
    data: one,
    chunks: 1,
  });
  const next = site();
  next[2] = makeSiteFile('assets/app.css', bytes(100, 3));

  const kept = await planPublish(next, reg, opts);
  expect(kept.removals).toEqual([]);
  expect(kept.ops.map(describeOp)).toEqual(['putFile assets/app.css chunk 1/1 (100 B, replaces the file)']);

  const pruned = await planPublish(next, reg, { ...opts, prune: true });
  expect(pruned.ops.map(describeOp)).toEqual([
    'putFile assets/app.css chunk 1/1 (100 B, replaces the file)',
    'removeFile old.js',
  ]);
});

test('a partial file whose stored bytes differ is rewritten from the start', async () => {
  const reg = new FakeRegistry();
  const files = site();
  const js = files[1];
  reg.files.set(js.path, { contentType: js.contentType, sha256: js.sha256, data: new Uint8Array(24_000), chunks: 1 });
  const plan = await planPublish(files, reg, opts);
  const p = plan.files.find((f) => f.path === js.path);
  expect(p?.status).toBe('changed');
  expect(p?.ops.map(describeOp)).toEqual([
    'putFile assets/app.js chunk 1/3 (24000 B, replaces the file)',
    'appendChunk assets/app.js chunk 2/3 (24000 B)',
    'appendChunk assets/app.js chunk 3/3 (12000 B)',
  ]);
});

test('planPublish refuses a fallback that is not in the site', async () => {
  await expect(planPublish(site(), null, { prune: false, fallback: '404.html' })).rejects.toThrow(
    'fallback 404.html is not part of the site',
  );
});

test('estimate follows the gas model', async () => {
  const files = site();
  const plan = await planPublish(files, null, opts);
  const written = 100 + 24_000 + 24_000 + 12_000 + 14 + files[0].bytes.length;
  const gas = 300_000n * 4n + 90_000n * 2n + 60_000n + 222n * BigInt(written);
  expect(estimate(plan.ops, 20_000_000n)).toEqual({ txs: 7, bytes: written, gas, fee: gas * 20_000_000n });

  // Research note: about 0.005 OKB per MB at 0.02 gwei.
  const mb = await planPublish([makeSiteFile('index.html', new Uint8Array(1_000_000))], null, opts);
  const fee = Number(estimate(mb.ops, 20_000_000n).fee) / 1e18;
  expect(fee).toBeGreaterThan(0.004);
  expect(fee).toBeLessThan(0.006);
});

describe('parsePublishArgs', () => {
  test('defaults to a dry run', () => {
    expect(parsePublishArgs([])).toEqual({
      mode: { kind: 'dry-run' },
      dir: 'site-dist/deweb',
      rpcUrl: 'https://rpc.xlayer.tech',
      site: 'deployments/deweb.json',
      container: null,
      prune: false,
      fallback: 'index.html',
    });
    expect(parsePublishArgs(['--dry-run', '--prune', '--container', CONTAINER.toLowerCase()])).toMatchObject({
      mode: { kind: 'dry-run' },
      prune: true,
      container: CONTAINER,
    });
  });

  test('there is no key mode', () => {
    for (const flag of ['--yes', '--key', '--private-key']) {
      expect(() => parsePublishArgs([flag])).toThrow(`${flag}: ${NO_KEY}`);
    }
    expect(() => parsePublishArgs(['--dry-run', '--yes'])).toThrow(NO_KEY);
    expect(() => parsePublishArgs(['--unlocked', ANVIL0, '--rpc', 'http://127.0.0.1:8545', '--yes'])).toThrow(NO_KEY);
    // --flag=value too, and the message names the flag only.
    for (const arg of [
      '--yes=true',
      `--key=${FAKE_KEY}`,
      `--private-key=${FAKE_KEY}`,
      `--private-key=${FAKE_KEY_HEX}`,
    ]) {
      const flag = arg.slice(0, arg.indexOf('='));
      expect(() => parsePublishArgs([arg]), arg).toThrow(`${flag}: ${NO_KEY}`);
      expect(messageOf(() => parsePublishArgs([arg]))).not.toContain(FAKE_KEY_HEX);
    }
    expect(keyFlagOf('--keys')).toBeNull();
    expect(keyFlagOf('--key')).toBe('--key');
    expect(keyFlagOf('--private-key=')).toBe('--private-key');
  });

  test('no message echoes a 64-hex value', () => {
    for (const argv of [
      [FAKE_KEY],
      [FAKE_KEY_HEX],
      [`--${FAKE_KEY_HEX}`],
      ['--container', FAKE_KEY],
      ['--container', FAKE_KEY_HEX],
      ['--unlocked', FAKE_KEY, '--rpc', 'http://127.0.0.1:8545'],
      ['--rpc', FAKE_KEY],
      ['--rpc', `${FAKE_KEY_HEX.toUpperCase()}`],
    ]) {
      const message = messageOf(() => parsePublishArgs(argv));
      expect(message, argv.join(' ')).toContain(HIDDEN_HEX);
      expect(message, argv.join(' ')).not.toMatch(/[0-9a-fA-F]{64}/);
    }
    expect(redactHex(`a ${FAKE_KEY}, b ${FAKE_KEY_HEX}0, c 0X${FAKE_KEY_HEX}`)).toBe(
      `a ${HIDDEN_HEX}, b ${HIDDEN_HEX}, c ${HIDDEN_HEX}`,
    );
    // Addresses and short hex stay readable.
    expect(redactHex(`${CONTAINER} 0x${'ab'.repeat(31)}`)).toBe(`${CONTAINER} 0x${'ab'.repeat(31)}`);
  });

  test('--unlocked takes a loopback RPC only', () => {
    expect(() => parsePublishArgs(['--unlocked', ANVIL0])).toThrow(
      '--unlocked only sends to a local anvil: --rpc must be http://127.0.0.1, http://localhost or http://[::1]',
    );
    for (const url of [
      'https://rpc.xlayer.tech',
      'http://127.0.0.1@rpc.xlayer.tech',
      'http://user:pw@127.0.0.1:8545',
      'http://127.0.0.1.nip.io:8545',
      'http://localhost.example:8545',
      'http://10.0.0.1:8545',
      'ws://127.0.0.1:8545',
    ]) {
      expect(() => parsePublishArgs(['--unlocked', ANVIL0, '--rpc', url]), url).toThrow('--unlocked only sends to');
    }
    for (const url of ['http://127.0.0.1:8547', 'http://localhost:8545', 'http://[::1]:8545', 'https://127.0.0.1']) {
      expect(parsePublishArgs(['--unlocked', ANVIL0.toLowerCase(), '--rpc', url]).mode, url).toEqual({
        kind: 'unlocked',
        from: ANVIL0,
      });
    }
    expect(() => parsePublishArgs(['--unlocked', 'nope', '--rpc', 'http://127.0.0.1:1'])).toThrow(
      '--unlocked is not an address: nope',
    );
  });

  test('--emit writes under contracts/deweb-calls/ only', () => {
    expect(parsePublishArgs(['--emit', 'contracts/deweb-calls/site.json']).mode).toEqual({
      kind: 'emit',
      file: 'contracts/deweb-calls/site.json',
    });
    expect(parsePublishArgs(['--emit', '.\\contracts\\deweb-calls\\site-2.v1.json']).mode).toEqual({
      kind: 'emit',
      file: 'contracts/deweb-calls/site-2.v1.json',
    });
    for (const bad of [
      'site.json',
      'deweb-calls/site.json',
      'contracts/site.json',
      'contracts/deweb-calls/../site.json',
      'contracts/deweb-calls/test/site.json',
      'contracts/deweb-calls/site.txt',
      'contracts/deweb-calls/.json',
      'contracts/deweb-calls/a b.json',
      '/tmp/contracts/deweb-calls/site.json',
      'C:/x/contracts/deweb-calls/site.json',
      'contracts/deweb-calls/site.json\u{0000}',
    ]) {
      expect(() => parsePublishArgs(['--emit', bad]), bad).toThrow(
        '--emit must be contracts/deweb-calls/<name>.json (a git-ignored folder that forge may read)',
      );
    }
  });

  test('one mode at a time and well-formed values', () => {
    expect(() => parsePublishArgs(['--dry-run', '--emit', 'contracts/deweb-calls/a.json'])).toThrow(
      'choose one of --dry-run, --unlocked, --emit',
    );
    expect(() =>
      parsePublishArgs(['--unlocked', ANVIL0, '--rpc', 'http://127.0.0.1:1', '--emit', 'contracts/deweb-calls/a.json']),
    ).toThrow('choose one of --dry-run, --unlocked, --emit');
    expect(() => parsePublishArgs(['--container', 'nope'])).toThrow('--container is not an address: nope');
    expect(() => parsePublishArgs(['--rpc'])).toThrow('--rpc needs a value');
    expect(() => parsePublishArgs(['--rpc', 'rpc.xlayer.tech'])).toThrow('--rpc is not a URL: rpc.xlayer.tech');
    expect(() => parsePublishArgs(['--broadcast'])).toThrow('unknown argument: --broadcast');
  });
});

test('--unlocked sends to chain 31337 only', () => {
  expect(unlockedChainProblem('http://127.0.0.1:8545', 31337)).toBeNull();
  for (const id of [196, 1, 1952]) {
    expect(unlockedChainProblem('http://127.0.0.1:8545', id)).toBe(
      `refusing --unlocked: http://127.0.0.1:8545 is chain ${id}; --unlocked sends only to a local anvil on chain 31337. To rehearse, run anvil with MockSiteRegistry at the registry address (see scripts/test/site/deweb-local.test.ts), or on a chain-196 fork run --emit and a forge script simulation without --broadcast`,
    );
  }
});

test('emitCalls writes the remaining ops in the format 07_DewebPublish.s.sol reads', () => {
  const ops = fixtureOps();
  const file = emitCalls(ops, CONTAINER, 196);
  expect(file).toMatchObject({ chainId: 196, registry: DEWEB.registry, binding: DEWEB.binding, container: CONTAINER });
  const [calls] = decodeAbiParameters(callsParams, file.calls);
  expect(calls).toEqual(ops.map((op) => ({ to: DEWEB.registry, value: 0n, data: encodeOp(CONTAINER, op) })));
  // DewebPublish.t.sol sends the very same bytes, so the two sides cannot drift apart.
  expect(emitJson(file)).toBe(readFileSync(join(ROOT, 'contracts/deweb-calls/test/good.json'), 'utf8'));
  expect(() => emitCalls([], CONTAINER, 196)).toThrow('nothing to emit');
});

test('the keccak256 --emit prints is the one 07_DewebPublish.s.sol prints for the same file', () => {
  const text = emitJson(emitCalls(fixtureOps(), CONTAINER, 196));
  const good = readFileSync(join(ROOT, 'contracts/deweb-calls/test/good.json'));
  const sol = readFileSync(join(ROOT, 'contracts/test/DewebPublish.t.sol'), 'utf8');
  // DewebPublish.t.sol asserts that DewebCalls.load(good.json).hash, the value the script logs, is this constant.
  const pinned = /bytes32 internal constant GOOD_KECCAK = (0x[0-9a-f]{64});/.exec(sol)?.[1];
  expect(pinned).toBe('0xb0c45f5a22a902215f7be420110cb5849975b0d7fdce4521115e52fbee4e816f');
  expect(fileKeccak(text)).toBe(pinned);
  expect(keccak256(good)).toBe(pinned);
});

test('emitBatch keeps one forge run under 1 MB of data, and the next --emit resumes where it stopped', async () => {
  expect(EMIT_MAX_BYTES).toBe(1_000_000);
  const reg = new FakeRegistry();
  const files = [makeSiteFile('assets/big.js', bytes(2_500_000, 4)), makeSiteFile('index.html', enc.encode('<p>'))];
  const parts: string[][] = [];
  for (;;) {
    const plan = await planPublish(files, reg, opts);
    if (plan.ops.length === 0) break;
    const batch = emitBatch(plan.ops);
    const data = batch.reduce((n, op) => n + ('data' in op ? op.data.length : 0), 0);
    expect(data).toBeLessThanOrEqual(EMIT_MAX_BYTES);
    parts.push([describeOp(batch[0]), describeOp(batch.at(-1) as Op)]);
    await executePlan(batch, CONTAINER, senderFor(reg));
  }
  expect(parts).toEqual([
    ['putFile assets/big.js chunk 1/105 (24000 B)', 'appendChunk assets/big.js chunk 41/105 (24000 B)'],
    ['appendChunk assets/big.js chunk 42/105 (24000 B)', 'appendChunk assets/big.js chunk 82/105 (24000 B)'],
    ['appendChunk assets/big.js chunk 83/105 (24000 B)', 'setFallback index.html'],
  ]);
  expect(await reg.readRange('assets/big.js', 0, 2_500_000)).toEqual(files[0].bytes);
  // An op larger than the budget still goes out alone, so a batch is never empty.
  const one = (await planPublish([makeSiteFile('index.html', bytes(24_000, 5))], null, opts)).ops;
  expect(emitBatch(one, 100).map(describeOp)).toEqual(['putFile index.html chunk 1/1 (24000 B)']);
  expect(emitBatch([], 100)).toEqual([]);
});

test('walletSender takes an address, never an account that would sign here', () => {
  // npm run typecheck enforces this: with an Account, viem would sign locally and send eth_sendRawTransaction.
  expectTypeOf(walletSender).parameter(1).toEqualTypeOf<Address>();
});

test('checkCommand and publishCommand are the forge script lines the user runs from contracts/', () => {
  expect(checkCommand('contracts/deweb-calls/site.json', 'https://rpc.xlayer.tech')).toBe(
    "DEWEB_CALLS=deweb-calls/site.json forge script script/07_DewebPublish.s.sol --sig 'show()' --rpc-url 'https://rpc.xlayer.tech'",
  );
  expect(publishCommand('contracts/deweb-calls/site.json', 'https://rpc.xlayer.tech')).toBe(
    "DEWEB_CALLS=deweb-calls/site.json forge script script/07_DewebPublish.s.sol --rpc-url 'https://rpc.xlayer.tech' --account atropyle-deployer --broadcast --slow",
  );
  // The RPC URL is one quoted argument in Git Bash, whatever it holds.
  expect(publishCommand('contracts/deweb-calls/a.json', "https://x.test/?a=1&b=it's;rm")).toContain(
    "--rpc-url 'https://x.test/?a=1&b=it'\\''s;rm' --account",
  );
});
