# Atropyle — Plan 1: On-chain core (circuit + contracts + mainnet) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dựng bộ công cụ circuit TypeScript (builder, simulator, model tham chiếu, chứng minh exhaustive 2²⁶), hai contract `AtropyleVault`/`AtropyleFactory` có test đầy đủ, rồi tape-out 3 circuit và deploy lên X Layer mainnet (người dùng tự ký).

**Architecture:** `circuits/` (TS) sinh netlist `KofN5`, `Ge4` và `AtropylePolicy` (REF tới hai sub-circuit qua địa chỉ placeholder), chứng minh P1–P8 bằng simulator bitsliced đúng ngữ nghĩa `NetlistVM.run`, rồi xuất JSON vào `contracts/circuits/`. `contracts/` (Foundry) đọc các JSON đó: test vault/factory dùng `MockPolicyCPU` (model Solidity, đối chiếu bằng vector sinh từ circuit), fork test và deploy script tape-out circuit thật, vá địa chỉ REF ngay trong Solidity (không cần FFI). Deploy chia 5 script, mỗi script tự kiểm trạng thái chain trước khi broadcast.

**Tech Stack:** Node 24.12 + npm workspaces, TypeScript 5.9.3, vitest 3.2.7, tsx 4.20.6, @types/node 24.19.2; Foundry 1.9.0, Solidity 0.8.24 (evm `shanghai`, optimizer 200), OpenZeppelin Contracts v5.0.2, forge-std v1.9.7.

**Spec:** `docs/superpowers/specs/2026-11-18-atropyle-design.md` (đọc cùng plan này). Plan 2 (web app + Proof + DeWEB) và Plan 3 (bot Telegram) viết sau khi Plan 1 chốt ABI.

## Global Constraints

- Mọi lệnh chạy từ gốc repo `E:\1Hackathon2026\xlayer-hackathon` trong Git Bash (công cụ Bash). Lệnh Foundry có dạng `cd contracts && forge …`.
- **Không bao giờ** `git add -A`/`git add .` ở gốc: `prompts/`, `reports/`, `research_notes/`, `external_research/` là tài liệu riêng của người dùng, không commit. Chỉ add đúng đường dẫn liệt kê trong từng task.
- Commit: `git commit -m "<type>(<scope>): <mô tả>" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`.
- **Khoá ví:** agent không bao giờ chạm private key, không chạy lệnh có `--broadcast` lên mainnet, không chạy `cast send` lên mainnet. Được phép: đọc chain (`cast call`, `cast storage`, `cast code`), fork test, mô phỏng script không `--broadcast`, diễn tập trên anvil fork.
- Chain: X Layer mainnet, chainId **196**. RPC `https://rpc.xlayer.tech`, fallback `https://xlayerrpc.okx.com`.
- Địa chỉ (checksummed, dùng nguyên văn):

  | Tên | Địa chỉ | Ghi chú |
  |---|---|---|
  | TapeOut Factory | `0x1f09DAeFA827f02CBb40967cc91b259763760761` | `createCPU` kéo `deployFee()` = 1e7 (0.1 BEM) |
  | Beacon circuit đóng băng | `0xf70d1ed4f62CF3780157B0b421b7E2F45bD0991C` | owner `0x0` |
  | Slot beacon EIP-1967 | `0xa3f0ad74e5423aebfd80d3ef4346578335a9a72aeaee59ff6cb3582b35133d50` | |
  | Transistors impl mới | `0x44Ebf3345bcf9aB329e7a28E53fd8EcfAd1a5EFE` | `mint` kéo BEM, protocolFee 1e6 |
  | BEM | `0x60e62Efa9405d6873C5deaBD4E6CC91c25363952` | 8 decimals |
  | USDT0 | `0x779Ded0c9e1022225f8E0630b35a9b54bE713736` | 6 decimals |
  | USDC | `0xB6CEceAB302E2E4948951eE7843FC24E92933061` | 6 decimals |
  | USDG | `0x4ae46a509F6b1D9056937BA4500cb143933D2dc8` | 6 decimals |
  | WOKB | `0xe538905cf8410324e03A5A23C1c177a474D59b2b` | 18 decimals |

- Mã hoá NetlistVM: NAND = `00 a:u24 b:u24`; LATCH = `01 d:u24` (d được trỏ tới tín hiệu phía sau); REF = `02 cpu:20 id:u64 nIns:u8 nOut:u8 ins:u24*`. Số nguyên nhiều byte là big-endian. Tín hiệu 0 = hằng 0, 1 = hằng 1, input ở `2..1+nIn`. Output là `nOut` tín hiệu cuối. Bit pin đóng gói little-endian, byte thiếu đọc là 0. Slot state theo thứ tự khai báo; REF chiếm `nState` của circuit con.
- Bố cục bit policy (spec §3.1–3.2): state bit0 = A, bit1 = R, bit2 = X. Input: `idle` 0–3, `T` 4–7, `inhVotes` 8–12, `recVotes` 13–17, `k` 18–20, `alive` 21, `windowDone` 22. Output: bit0 `alarm`, bit1 `cancel`, bit2 `release`.
- Giới hạn vault (spec §4.1): heirs 1–5, tổng bps = 10000, bps > 0; guardians 0–5; 0 ≤ k ≤ n; `recoveryEnabled` cần k ≥ 1; P ≥ 86 400 s và W ≥ 259 200 s (Drill: P, W ≥ 60 s); 1 ≤ T ≤ 15; assets ≤ 20; Drill sống 7 ngày.
- Phí (spec §5): Drill miễn phí; vault trả phí 1.99 token cho 100 vault đầu, sau đó 9.9 token; token phí USDT0, USDC, USDG; mức phí tính từ `decimals()` ngay trong constructor factory.
- Vault và factory: không admin, pause, upgrade, `delegatecall`, `selfdestruct`.
- Comment trong code viết tiếng Anh; tài liệu (`README`, `docs/`) viết tiếng Việt.

**Quyết định của plan bổ sung cho spec** (người duyệt plan cần biết):
1. `voteRecovery(address(0))` = rút phiếu. Spec cấm `0x0` làm đích; điều đó vẫn đúng vì `candidate = 0` luôn cho bitmap phiếu bằng 0, nên `0x0` không bao giờ thành `recoveryTarget`.
2. Người thừa kế không được là owner; asset trùng `(token, id)` bị từ chối.
3. `createVault(cfg, salt, drill, feeToken)` có thêm tham số `drill`.
4. `status()` trả thêm `pending` (trạng thái mà một lần `poke()` lúc này sẽ tạo ra) và `recVotes[]` (phiếu của từng giám hộ), để UI và bot khỏi phải tự mô phỏng.
5. `voteRecovery` còn từ chối chính địa chỉ vault làm đích, vì tài sản chuyển vào vault sẽ kẹt vĩnh viễn (vault không có hàm rút).
6. Chỉ mục `vaultsOf` của factory chỉ thêm, không xoá: ai từng là heir hay giám hộ vẫn thấy vault đó. UI và bot đọc `heirs()`/`guardians()` hiện tại để lọc.

## Review Focus

Năm điều kiện spec ngụ ý nhưng dễ bị bỏ sót, xếp theo khả năng gây hại cho người dùng thật. Mỗi dòng đã có test trong task sở hữu code:

1. **Chủ ví check-in sau khi cửa sổ đã hết nhưng chưa ai claim** → chủ ví thắng: trạng thái về Active, không tài sản nào di chuyển. Test `test_lateCheckInBeatsUnclaimedRelease` (Task 9).
2. **Chủ ví thay danh sách giám hộ khi đang có phiếu khôi phục**; một giám hộ bị gỡ rồi thêm lại không được mang phiếu cũ. Test `test_replacingGuardiansClearsStaleVotes` (Task 9).
3. **Allowance nhỏ hơn số dư, hoặc bị thu hồi sau khi cấu hình** → chỉ chuyển `min(balance, allowance)`; bằng 0 thì bỏ qua im lặng; lần quét sau nhận allowance mới. Test `test_availableIsMinOfBalanceAndAllowance` (Task 8).
4. **Một người nhận không nhận được** (token blacklist, contract không có ERC721Receiver) → không chặn những người khác. Test `test_blacklistedHeirDoesNotBlockOthers`, `test_contractHeirWithoutReceiver` (Task 8).
5. **Vault Drill quá 7 ngày** → mọi hàm thay đổi trạng thái revert `DrillExpired`, view vẫn chạy. Test `test_drillExpires` (Task 9).

---

## File Structure

```
package.json                      npm workspaces ["circuits"]
circuits/
  package.json, tsconfig.json
  src/bytes.ts                    hex, bit LE, ByteWriter
  src/netlist.ts                  Netlist builder + BuiltCircuit/RefSpec/RefSite
  src/gates.ts                    NOT/AND/OR/XOR/MUX, maj, adders, popcount5, geUnsigned
  src/subcircuits.ts              KofN5, Ge4
  src/sim.ts                      compile (làm phẳng REF), runLanes (32 lane), stepBytes
  src/model.ts                    model tham chiếu §3 (S, OUT, F, packInputs, refStepCode)
  src/properties.ts               P1–P7 dưới dạng bitmask vi phạm
  src/policy.ts                   AtropylePolicy v1, buildAll, patchRefs
  src/verify.ts                   verifyPolicy: duyệt 2^26 tổ hợp
  src/export.ts                   xuất JSON + vectors cho Foundry (CLI)
  src/prove.ts                    CLI in báo cáo chứng minh
  src/index.ts                    re-export phần dùng được trong trình duyệt (Plan 2)
  test/*.test.ts
contracts/
  foundry.toml
  circuits/                       JSON sinh từ circuits/ (commit vào git)
  src/interfaces/ICPU.sol         interface on-chain của TapeOut
  src/interfaces/IVaultIndex.sol  factory.index(account)
  src/PolicyCodec.sol             wire format state/input/output
  src/vault/VaultConfig.sol       cấu hình + kiểm ràng buộc
  src/vault/VaultDistribution.sol phân phối tài sản
  src/AtropyleVault.sol           vault (clone)
  src/AtropyleFactory.sol         factory
  test/mocks/PolicyModel.sol      PolicyModel lib, MockPolicyCPU, BadPolicyCPU
  test/mocks/Tokens.sol           token mock chuẩn và token "khó chịu"
  test/utils/VaultFixture.sol     fixture dùng chung (test contract đóng vai factory)
  test/*.t.sol
  script/lib/ITapeOut.sol         interface Factory/Circuits/Transistors của TapeOut
  script/lib/NetlistPatch.sol     vá cpu/id vào REF của policy template
  script/lib/TapeoutFlow.sol      các bước deploy dùng chung cho script và fork test
  script/01..05_*.s.sol
  README.md
.github/workflows/ci.yml
docs/deployments.md
```

---

### Task 1: Monorepo, bytes và Netlist builder

**Files:**
- Create: `package.json`, `circuits/package.json`, `circuits/tsconfig.json`
- Create: `circuits/src/bytes.ts`, `circuits/src/netlist.ts`
- Test: `circuits/test/netlist.test.ts`

**Interfaces:**
- Consumes: không.
- Produces:
  - `bytes.ts`: `hexToBytes(hex: string): Uint8Array`, `bytesToHex(b: Uint8Array): string` (chữ thường, có `0x`), `getBit(b, i): number`, `setBit(b, i): void`, `u24(b, p): number`, `u64(b, p): bigint`, `addrAt(b, p): string`, `class ByteWriter { length; u8(x); u24(x); set24(pos, x); u64(x: bigint); addr(hex); bytes(): Uint8Array }`.
  - `netlist.ts`: `interface RefSpec { name: string; cpu: string; id: bigint; nIn: number; nOut: number }`, `interface RefSite { offset: number; target: string }` (offset = vị trí byte đầu của trường cpu 20 byte, ngay sau opcode `02`), `interface BuiltCircuit { name; nIn; nOut; bytes: Uint8Array; nand: number; latch: number; refs: RefSite[] }` (`nand`/`latch` là số gate **của tầng này**, đúng số transistor bị đốt), `interface LatchHandle { q: number; setD(d: number): void }`, `class Netlist { constructor(name, nIn); nandCount; signalCount; input(i); inputs(from, count); nand(a, b); latch(); ref(spec, ins): number[]; finish(outputs): BuiltCircuit }`.

- [ ] **Step 1: Tạo workspace**

`package.json` (gốc):

```json
{
  "name": "atropyle",
  "private": true,
  "workspaces": ["circuits"],
  "engines": { "node": ">=24" },
  "scripts": {
    "test": "npm test -w circuits"
  }
}
```

`circuits/package.json`:

```json
{
  "name": "@atropyle/circuits",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc --noEmit",
    "export": "tsx src/export.ts",
    "prove": "tsx src/prove.ts"
  },
  "devDependencies": {
    "@types/node": "24.19.2",
    "tsx": "4.20.6",
    "typescript": "5.9.3",
    "vitest": "3.2.7"
  }
}
```

`circuits/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022"],
    "types": ["node"],
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true
  },
  "include": ["src", "test"]
}
```

Run: `npm install`
Expected: tạo `node_modules/` và `package-lock.json`, không có lỗi.

- [ ] **Step 2: Viết test thất bại**

`circuits/test/netlist.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { bytesToHex, getBit, hexToBytes, setBit } from '../src/bytes';
import { Netlist } from '../src/netlist';

describe('bytes', () => {
  it('round-trips hex', () => {
    expect(bytesToHex(hexToBytes('0x00ff10'))).toBe('0x00ff10');
    expect(() => hexToBytes('0x0')).toThrow('bad hex');
  });

  it('packs bits little-endian and reads missing bytes as 0', () => {
    const b = new Uint8Array(2);
    setBit(b, 0);
    setBit(b, 9);
    expect(Array.from(b)).toEqual([1, 2]);
    expect(getBit(b, 9)).toBe(1);
    expect(getBit(b, 40)).toBe(0);
  });
});

describe('Netlist', () => {
  it('encodes a NAND gate exactly like on-chain circuit #1', () => {
    const n = new Netlist('NAND', 2);
    const o = n.nand(n.input(0), n.input(1));
    const c = n.finish([o]);
    expect(bytesToHex(c.bytes)).toBe('0x000000020000030000000400000400000005000005');
    expect(c).toMatchObject({ nIn: 2, nOut: 1, nand: 3, latch: 0, refs: [] });
  });

  it('rejects future signals and bad inputs', () => {
    const n = new Netlist('x', 2);
    expect(() => n.nand(2, 4)).toThrow('future signal 4');
    expect(() => n.input(2)).toThrow('input 2 out of range');
  });

  it('patches a forward LATCH d at finish', () => {
    const n = new Netlist('toggle', 0);
    const l = n.latch(); // signal 2
    const q = n.nand(l.q, l.q); // signal 3 = NOT q
    l.setD(q);
    const c = n.finish([l.q]);
    expect(bytesToHex(c.bytes.subarray(0, 4))).toBe('0x01000003');
    expect(c.latch).toBe(1);
  });

  it('requires every LATCH to have d', () => {
    const n = new Netlist('x', 0);
    const l = n.latch();
    expect(() => n.finish([l.q])).toThrow('latch without d');
  });

  it('rejects LATCH d outside the signal space', () => {
    const n = new Netlist('x', 0);
    const l = n.latch();
    l.setD(99);
    expect(() => n.finish([l.q])).toThrow('latch d out of range');
  });

  it('encodes REF as 02 cpu:20 id:u64be nIns nOut ins:u24*', () => {
    const n = new Netlist('parent', 2);
    const cpu = '0x' + '11'.repeat(20);
    const [o] = n.ref({ name: 'Sub', cpu, id: 0x0102030405060708n, nIn: 2, nOut: 1 }, [n.input(0), n.input(1)]);
    expect(o).toBe(4);
    const c = n.finish([o]);
    expect(bytesToHex(c.bytes.subarray(0, 37))).toBe(
      '0x02' + '11'.repeat(20) + '0102030405060708' + '0201' + '000002000003',
    );
    expect(c.refs).toEqual([{ offset: 1, target: 'Sub' }]);
  });

  it('puts outputs in the last nOut signals via NOT-NOT buffers', () => {
    const n = new Netlist('two', 2);
    const a = n.nand(n.input(0), n.input(1)); // 4
    const c = n.finish([n.input(0), a]); // NOTs 5, 6; buffers 7, 8
    expect(c.nand).toBe(5);
    expect(n.signalCount).toBe(9);
  });

  it('cannot be modified after finish', () => {
    const n = new Netlist('x', 1);
    n.finish([n.input(0)]);
    expect(() => n.nand(2, 2)).toThrow('netlist finished');
  });
});
```

- [ ] **Step 3: Chạy test, xác nhận thất bại**

Run: `npm test -w circuits -- test/netlist.test.ts`
Expected: FAIL, lỗi không tìm thấy `../src/bytes`.

- [ ] **Step 4: Viết `bytes.ts` và `netlist.ts`**

`circuits/src/bytes.ts`:

```ts
/** Byte helpers shared by the builder and the simulator. Multi-byte integers are big-endian (NetlistVM). */

export function hexToBytes(hex: string): Uint8Array {
  const h = hex.startsWith('0x') ? hex.slice(2) : hex;
  if (h.length % 2 !== 0 || /[^0-9a-fA-F]/.test(h)) throw new Error('bad hex');
  const out = new Uint8Array(h.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(h.slice(2 * i, 2 * i + 2), 16);
  return out;
}

export function bytesToHex(b: Uint8Array): string {
  return '0x' + Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
}

/** Little-endian bit order; bytes past the end read as 0 (NetlistVM._getBit). */
export function getBit(b: Uint8Array, i: number): number {
  const j = i >> 3;
  return j < b.length ? (b[j] >> (i & 7)) & 1 : 0;
}

export function setBit(b: Uint8Array, i: number): void {
  b[i >> 3] |= 1 << (i & 7);
}

export function u24(b: Uint8Array, p: number): number {
  return (b[p] << 16) | (b[p + 1] << 8) | b[p + 2];
}

export function u64(b: Uint8Array, p: number): bigint {
  let v = 0n;
  for (let i = 0; i < 8; i++) v = (v << 8n) | BigInt(b[p + i]);
  return v;
}

export function addrAt(b: Uint8Array, p: number): string {
  return bytesToHex(b.subarray(p, p + 20));
}

export class ByteWriter {
  private readonly buf: number[] = [];

  get length(): number {
    return this.buf.length;
  }

  u8(x: number): void {
    if (!Number.isInteger(x) || x < 0 || x > 0xff) throw new Error(`u8 out of range: ${x}`);
    this.buf.push(x);
  }

  u24(x: number): void {
    checkU24(x);
    this.buf.push((x >>> 16) & 0xff, (x >>> 8) & 0xff, x & 0xff);
  }

  set24(pos: number, x: number): void {
    checkU24(x);
    this.buf[pos] = (x >>> 16) & 0xff;
    this.buf[pos + 1] = (x >>> 8) & 0xff;
    this.buf[pos + 2] = x & 0xff;
  }

  u64(x: bigint): void {
    if (x < 0n || x >= 1n << 64n) throw new Error('u64 out of range');
    for (let i = 7; i >= 0; i--) this.buf.push(Number((x >> BigInt(8 * i)) & 0xffn));
  }

  addr(hex: string): void {
    const b = hexToBytes(hex);
    if (b.length !== 20) throw new Error('address must be 20 bytes');
    for (const x of b) this.buf.push(x);
  }

  bytes(): Uint8Array {
    return Uint8Array.from(this.buf);
  }
}

function checkU24(x: number): void {
  if (!Number.isInteger(x) || x < 0 || x > 0xffffff) throw new Error(`u24 out of range: ${x}`);
}
```

`circuits/src/netlist.ts`:

```ts
import { ByteWriter } from './bytes';

export interface RefSpec {
  name: string;
  cpu: string;
  id: bigint;
  nIn: number;
  nOut: number;
}

/** Where a REF's 20-byte cpu field starts (the u64 id follows it), and which sub-circuit it targets. */
export interface RefSite {
  offset: number;
  target: string;
}

export interface BuiltCircuit {
  name: string;
  nIn: number;
  nOut: number;
  bytes: Uint8Array;
  /** NAND and LATCH counts of this layer only: exactly the transistors tapeout burns. */
  nand: number;
  latch: number;
  refs: RefSite[];
}

export interface LatchHandle {
  q: number;
  setD(d: number): void;
}

/** Builds a NetlistVM byte stream. Signal 0 = const 0, 1 = const 1, inputs at 2..1+nIn. */
export class Netlist {
  private readonly w = new ByteWriter();
  private next: number;
  private nands = 0;
  private readonly latches: Array<{ pos: number; d: number | null }> = [];
  private readonly refs: RefSite[] = [];
  private finished = false;

  constructor(
    readonly name: string,
    readonly nIn: number,
  ) {
    if (!Number.isInteger(nIn) || nIn < 0 || nIn > 65536) throw new Error('bad nIn');
    this.next = 2 + nIn;
  }

  get nandCount(): number {
    return this.nands;
  }

  get signalCount(): number {
    return this.next;
  }

  input(i: number): number {
    if (!Number.isInteger(i) || i < 0 || i >= this.nIn) throw new Error(`input ${i} out of range`);
    return 2 + i;
  }

  inputs(from: number, count: number): number[] {
    return Array.from({ length: count }, (_, k) => this.input(from + k));
  }

  nand(a: number, b: number): number {
    this.open();
    this.check(a);
    this.check(b);
    this.w.u8(0);
    this.w.u24(a);
    this.w.u24(b);
    this.nands++;
    return this.next++;
  }

  /** Declares a LATCH now (its state slot follows declaration order); d may point forward and is set later. */
  latch(): LatchHandle {
    this.open();
    this.w.u8(1);
    const entry = { pos: this.w.length, d: null as number | null };
    this.w.u24(0);
    this.latches.push(entry);
    return {
      q: this.next++,
      setD: (d: number) => {
        if (entry.d !== null) throw new Error('latch d already set');
        entry.d = d;
      },
    };
  }

  ref(spec: RefSpec, ins: number[]): number[] {
    this.open();
    if (ins.length !== spec.nIn) throw new Error(`${spec.name}: expected ${spec.nIn} inputs`);
    if (spec.nIn > 255 || spec.nOut < 1 || spec.nOut > 255) throw new Error(`${spec.name}: bad pin count`);
    ins.forEach((s) => this.check(s));
    this.w.u8(2);
    const offset = this.w.length;
    this.w.addr(spec.cpu);
    this.w.u64(spec.id);
    this.w.u8(spec.nIn);
    this.w.u8(spec.nOut);
    ins.forEach((s) => this.w.u24(s));
    this.refs.push({ offset, target: spec.name });
    const outs = Array.from({ length: spec.nOut }, (_, k) => this.next + k);
    this.next += spec.nOut;
    return outs;
  }

  /** Appends NOT-NOT buffers so `outputs` become the last signals, in order, then patches LATCH d values. */
  finish(outputs: number[]): BuiltCircuit {
    this.open();
    if (outputs.length === 0) throw new Error('no outputs');
    outputs.forEach((s) => this.check(s));
    const nots = outputs.map((o) => this.nand(o, o));
    nots.forEach((x) => this.nand(x, x));
    for (const l of this.latches) {
      if (l.d === null) throw new Error('latch without d');
      if (!Number.isInteger(l.d) || l.d < 0 || l.d >= this.next) throw new Error('latch d out of range');
      this.w.set24(l.pos, l.d);
    }
    this.finished = true;
    return {
      name: this.name,
      nIn: this.nIn,
      nOut: outputs.length,
      bytes: this.w.bytes(),
      nand: this.nands,
      latch: this.latches.length,
      refs: [...this.refs],
    };
  }

  private check(s: number): void {
    if (!Number.isInteger(s) || s < 0 || s >= this.next) throw new Error(`future signal ${s}`);
  }

  private open(): void {
    if (this.finished) throw new Error('netlist finished');
  }
}
```

- [ ] **Step 5: Chạy test và typecheck**

Run: `npm test -w circuits -- test/netlist.test.ts && npm run typecheck -w circuits`
Expected: 10 test PASS; `tsc` không báo lỗi.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json circuits/package.json circuits/tsconfig.json circuits/src/bytes.ts circuits/src/netlist.ts circuits/test/netlist.test.ts
git commit -m "feat(circuits): workspace, byte helpers and netlist builder" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```


### Task 2: Simulator bitsliced (đúng ngữ nghĩa `NetlistVM.run`)

**Files:**
- Create: `circuits/src/sim.ts`
- Test: `circuits/test/sim.test.ts`

**Interfaces:**
- Consumes: `bytes.ts` (`getBit`, `setBit`, `u24`, `u64`, `addrAt`, `hexToBytes`), `netlist.ts` (`Netlist`, `BuiltCircuit`).
- Produces:
  - `interface CircuitSource { bytes: Uint8Array; nIn: number; nOut: number }` (`BuiltCircuit` thoả interface này).
  - `type Resolver = (cpu: string, id: bigint) => CircuitSource` (`cpu` chữ thường, có `0x`).
  - `interface Program { nIn; nOut; nState; nSignals; ops: Int32Array; latchD: Int32Array; outIdx: Int32Array; gateCount: number }`. `ops` có stride 4: `[0, out, a, b]` cho NAND, `[1, out, slot, 0]` cho LATCH. `gateCount` = NAND + LATCH đã làm phẳng, bằng `gateCount` của `circuitInfo` on-chain.
  - `compile(src: CircuitSource, resolve: Resolver): Program`. Lỗi giống NetlistVM: `'bad opcode'`, `'NAND: future signal'`, `'REF: future signal'`, `'REF: pin mismatch'`, `'too few signals for outputs'`, `'LATCH d out of range'`, `'truncated'`.
  - `interface LaneBuffers { v: Int32Array; next: Int32Array; out: Int32Array }`, `lanes(p): LaneBuffers`, `runLanes(p, state: Int32Array, inputs: Int32Array, b: LaneBuffers): void` (mỗi word là 32 lane).
  - `stepBytes(p, state: Uint8Array, inputs: Uint8Array): { next: Uint8Array; out: Uint8Array }`.

- [ ] **Step 1: Viết test thất bại**

`circuits/test/sim.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { hexToBytes } from '../src/bytes';
import { Netlist, type BuiltCircuit } from '../src/netlist';
import { compile, lanes, runLanes, stepBytes, type CircuitSource, type Resolver } from '../src/sim';

const noRefs: Resolver = () => {
  throw new Error('no refs');
};
const CPU = '0x' + 'ab'.repeat(20);
const CIRCUIT_1: CircuitSource = { bytes: hexToBytes('0x000000020000030000000400000400000005000005'), nIn: 2, nOut: 1 };

function resolverOf(map: Record<string, BuiltCircuit>): Resolver {
  return (cpu, id) => {
    const c = map[`${cpu.toLowerCase()}:${id}`];
    if (!c) throw new Error(`missing ${cpu}:${id}`);
    return c;
  };
}

describe('compile + stepBytes', () => {
  it('evaluates on-chain circuit #1 (NAND)', () => {
    const p = compile(CIRCUIT_1, noRefs);
    expect(p).toMatchObject({ nIn: 2, nOut: 1, nState: 0, gateCount: 3 });
    for (let x = 0; x < 4; x++) {
      expect(stepBytes(p, new Uint8Array(0), Uint8Array.of(x)).out[0]).toBe(x === 3 ? 0 : 1);
    }
  });

  it('evaluates 32 lanes at once', () => {
    const p = compile(CIRCUIT_1, noRefs);
    const b = lanes(p);
    runLanes(p, new Int32Array(0), Int32Array.of(0xaaaaaaaa | 0, 0xcccccccc | 0), b);
    expect(b.out[0]).toBe(~(0xaaaaaaaa & 0xcccccccc));
  });

  it('LATCH outputs the previous state and samples d', () => {
    const n = new Netlist('toggle', 0);
    const l = n.latch();
    l.setD(n.nand(l.q, l.q));
    const p = compile(n.finish([l.q]), noRefs);
    expect(stepBytes(p, Uint8Array.of(0), new Uint8Array(0))).toEqual({ next: Uint8Array.of(1), out: Uint8Array.of(0) });
    expect(stepBytes(p, Uint8Array.of(1), new Uint8Array(0))).toEqual({ next: Uint8Array.of(0), out: Uint8Array.of(1) });
  });

  it('orders state slots by declaration, a REF adding the child state', () => {
    const h = new Netlist('Hold', 1);
    const hl = h.latch();
    hl.setD(h.input(0));
    const hold = h.finish([hl.q]);

    const n = new Netlist('parent', 3);
    const l0 = n.latch();
    l0.setD(n.input(0));
    const [r] = n.ref({ name: 'Hold', cpu: CPU, id: 7n, nIn: 1, nOut: 1 }, [n.input(1)]);
    const l2 = n.latch();
    l2.setD(n.input(2));
    const p = compile(n.finish([l0.q, r, l2.q]), resolverOf({ [`${CPU}:7`]: hold }));

    expect(p.nState).toBe(3);
    expect(p.gateCount).toBe(11); // parent: 2 LATCH + 6 NAND; Hold: 1 LATCH + 2 NAND
    const { next, out } = stepBytes(p, Uint8Array.of(0b010), Uint8Array.of(0b101));
    expect(out[0]).toBe(0b010);
    expect(next[0]).toBe(0b101);
  });

  it('matches a direct netlist when composed through REF', () => {
    const a = new Netlist('And', 2);
    const t = a.nand(a.input(0), a.input(1));
    const and = a.finish([a.nand(t, t)]);
    const n = new Netlist('viaRef', 2);
    const [o] = n.ref({ name: 'And', cpu: CPU, id: 1n, nIn: 2, nOut: 1 }, [n.input(0), n.input(1)]);
    const p = compile(n.finish([o]), resolverOf({ [`${CPU}:1`]: and }));
    for (let x = 0; x < 4; x++) {
      expect(stepBytes(p, new Uint8Array(0), Uint8Array.of(x)).out[0]).toBe(x === 3 ? 1 : 0);
    }
  });

  it('rejects malformed netlists like NetlistVM', () => {
    expect(() => compile({ bytes: Uint8Array.of(9), nIn: 0, nOut: 1 }, noRefs)).toThrow('bad opcode');
    expect(() => compile({ bytes: hexToBytes('0x00000002000009'), nIn: 1, nOut: 1 }, noRefs)).toThrow(
      'NAND: future signal',
    );
    expect(() => compile({ bytes: hexToBytes('0x00000000000000'), nIn: 0, nOut: 2 }, noRefs)).toThrow(
      'too few signals for outputs',
    );
    expect(() => compile({ bytes: hexToBytes('0x01000009'), nIn: 0, nOut: 1 }, noRefs)).toThrow(
      'LATCH d out of range',
    );
    expect(() => compile({ bytes: hexToBytes('0x0000'), nIn: 0, nOut: 1 }, noRefs)).toThrow('truncated');

    const sub = new Netlist('S', 1);
    const s = sub.finish([sub.input(0)]);
    const n = new Netlist('p', 2);
    const [o] = n.ref({ name: 'S', cpu: CPU, id: 3n, nIn: 2, nOut: 1 }, [n.input(0), n.input(1)]);
    expect(() => compile(n.finish([o]), resolverOf({ [`${CPU}:3`]: s }))).toThrow('REF: pin mismatch');
  });
});
```

- [ ] **Step 2: Chạy test, xác nhận thất bại**

Run: `npm test -w circuits -- test/sim.test.ts`
Expected: FAIL, không tìm thấy `../src/sim`.

- [ ] **Step 3: Viết `sim.ts`**

`circuits/src/sim.ts`:

```ts
import { addrAt, getBit, setBit, u24, u64 } from './bytes';

export interface CircuitSource {
  bytes: Uint8Array;
  nIn: number;
  nOut: number;
}

export type Resolver = (cpu: string, id: bigint) => CircuitSource;

export interface Program {
  nIn: number;
  nOut: number;
  nState: number;
  nSignals: number;
  /** Stride 4: [0, out, a, b] = NAND, [1, out, slot, 0] = LATCH (out = previous state[slot]). */
  ops: Int32Array;
  /** Flat signal sampled into each state slot after the pass. */
  latchD: Int32Array;
  outIdx: Int32Array;
  /** Flattened NAND + LATCH count, equal to circuitInfo().gateCount on chain. */
  gateCount: number;
}

export interface LaneBuffers {
  v: Int32Array;
  next: Int32Array;
  out: Int32Array;
}

const MAX_REF_DEPTH = 16;

/** Flattens a netlist (recursively through REF) into a single straight-line program. */
export function compile(src: CircuitSource, resolve: Resolver): Program {
  const ops: number[] = [];
  const latchD: number[] = [];
  let nSignals = 2 + src.nIn;
  let gateCount = 0;

  function need(nl: Uint8Array, p: number, len: number): void {
    if (p + len > nl.length) throw new Error('truncated');
  }

  function emit(c: CircuitSource, ins: number[], depth: number): number[] {
    if (depth > MAX_REF_DEPTH) throw new Error('REF nesting too deep');
    const nl = c.bytes;
    const local: number[] = [0, 1, ...ins];
    const pending: Array<[number, number]> = [];
    let p = 0;
    while (p < nl.length) {
      const op = nl[p++];
      if (op === 0) {
        need(nl, p, 6);
        const a = u24(nl, p);
        const b = u24(nl, p + 3);
        p += 6;
        if (a >= local.length || b >= local.length) throw new Error('NAND: future signal');
        ops.push(0, nSignals, local[a], local[b]);
        local.push(nSignals++);
        gateCount++;
      } else if (op === 1) {
        need(nl, p, 3);
        const d = u24(nl, p);
        p += 3;
        const slot = latchD.length;
        latchD.push(-1);
        ops.push(1, nSignals, slot, 0);
        local.push(nSignals++);
        gateCount++;
        pending.push([slot, d]);
      } else if (op === 2) {
        need(nl, p, 30);
        const cpu = addrAt(nl, p);
        const id = u64(nl, p + 20);
        const rIn = nl[p + 28];
        const rOut = nl[p + 29];
        p += 30;
        need(nl, p, rIn * 3);
        const subIns: number[] = [];
        for (let k = 0; k < rIn; k++) {
          const s = u24(nl, p);
          p += 3;
          if (s >= local.length) throw new Error('REF: future signal');
          subIns.push(local[s]);
        }
        const sub = resolve(cpu, id);
        if (sub.nIn !== rIn || sub.nOut !== rOut) throw new Error('REF: pin mismatch');
        local.push(...emit(sub, subIns, depth + 1));
      } else {
        throw new Error('bad opcode');
      }
    }
    if (local.length < 2 + c.nIn + c.nOut) throw new Error('too few signals for outputs');
    for (const [slot, d] of pending) {
      if (d >= local.length) throw new Error('LATCH d out of range');
      latchD[slot] = local[d];
    }
    return local.slice(local.length - c.nOut);
  }

  const inputs = Array.from({ length: src.nIn }, (_, i) => 2 + i);
  const outs = emit(src, inputs, 0);
  return {
    nIn: src.nIn,
    nOut: src.nOut,
    nState: latchD.length,
    nSignals,
    ops: Int32Array.from(ops),
    latchD: Int32Array.from(latchD),
    outIdx: Int32Array.from(outs),
    gateCount,
  };
}

export function lanes(p: Program): LaneBuffers {
  return { v: new Int32Array(p.nSignals), next: new Int32Array(p.nState), out: new Int32Array(p.nOut) };
}

/** One step for 32 independent lanes: bit j of every word belongs to lane j. */
export function runLanes(p: Program, state: Int32Array, inputs: Int32Array, b: LaneBuffers): void {
  const v = b.v;
  const ops = p.ops;
  v[0] = 0;
  v[1] = -1;
  for (let i = 0; i < p.nIn; i++) v[2 + i] = inputs[i];
  for (let j = 0; j < ops.length; j += 4) {
    v[ops[j + 1]] = ops[j] === 0 ? ~(v[ops[j + 2]] & v[ops[j + 3]]) : state[ops[j + 2]];
  }
  for (let i = 0; i < p.nState; i++) b.next[i] = v[p.latchD[i]];
  for (let i = 0; i < p.nOut; i++) b.out[i] = v[p.outIdx[i]];
}

/** Single-lane step with the on-chain byte encoding (little-endian bit packing). */
export function stepBytes(p: Program, state: Uint8Array, inputs: Uint8Array): { next: Uint8Array; out: Uint8Array } {
  const st = new Int32Array(p.nState);
  const inp = new Int32Array(p.nIn);
  for (let i = 0; i < p.nState; i++) st[i] = getBit(state, i) ? -1 : 0;
  for (let i = 0; i < p.nIn; i++) inp[i] = getBit(inputs, i) ? -1 : 0;
  const b = lanes(p);
  runLanes(p, st, inp, b);
  const next = new Uint8Array((p.nState + 7) >> 3);
  const out = new Uint8Array((p.nOut + 7) >> 3);
  for (let i = 0; i < p.nState; i++) if (b.next[i] & 1) setBit(next, i);
  for (let i = 0; i < p.nOut; i++) if (b.out[i] & 1) setBit(out, i);
  return { next, out };
}
```

- [ ] **Step 4: Chạy test và typecheck**

Run: `npm test -w circuits -- test/sim.test.ts && npm run typecheck -w circuits`
Expected: 6 test PASS; `tsc` sạch.

- [ ] **Step 5: Commit**

```bash
git add circuits/src/sim.ts circuits/test/sim.test.ts
git commit -m "feat(circuits): bitsliced NetlistVM simulator with REF flattening" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Cổng logic và sub-circuit `KofN5`, `Ge4`

**Files:**
- Create: `circuits/src/gates.ts`, `circuits/src/subcircuits.ts`
- Test: `circuits/test/subcircuits.test.ts`

**Interfaces:**
- Consumes: `Netlist`, `compile`, `stepBytes`, `getBit`.
- Produces:
  - `gates.ts`: `ZERO = 0`, `ONE = 1`, `not(n, a)` (1 NAND), `and(n, a, b)` (2), `or(n, a, b)` (3), `xor(n, a, b)` (4), `mux(n, sel, whenOne, whenZero)` (4), `andAll(n, xs)`, `orAll(n, xs)`, `maj(n, a, b, c)` (6), `fullAdder(n, a, b, c): { sum; carry }` (9), `halfAdder(n, a, b): { sum; carry }` (5), `popcount5(n, v: number[]): number[]` (23, 3 bit LE), `geUnsigned(n, a: number[], b: number[]): number` (`2 + 7·(w−1)` NAND).
  - `subcircuits.ts`: `buildKofN5(): BuiltCircuit` (nIn 8: v0..v4, k0..k2; nOut 1 = popcount(v) ≥ k; 41 NAND), `buildGe4(): BuiltCircuit` (nIn 8: a0..a3, b0..b3; nOut 1 = a ≥ b; 25 NAND).

- [ ] **Step 1: Viết test thất bại**

`circuits/test/subcircuits.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { getBit } from '../src/bytes';
import * as g from '../src/gates';
import { Netlist } from '../src/netlist';
import { compile, stepBytes, type Resolver } from '../src/sim';
import { buildGe4, buildKofN5 } from '../src/subcircuits';

const noRefs: Resolver = () => {
  throw new Error('no refs');
};

/** Builds a throwaway circuit; returns the gate NAND count and an evaluator over packed inputs. */
function circuit(nIn: number, build: (n: Netlist, ins: number[]) => number[]) {
  const n = new Netlist('t', nIn);
  const outs = build(n, n.inputs(0, nIn));
  const nand = n.nandCount;
  const p = compile(n.finish(outs), noRefs);
  return {
    nand,
    run(x: number): number[] {
      const r = stepBytes(p, new Uint8Array(0), Uint8Array.of(x & 0xff, (x >> 8) & 0xff));
      return outs.map((_, i) => getBit(r.out, i));
    },
  };
}

const bit = (x: number, i: number) => (x >> i) & 1;
const popcount = (x: number) => [0, 1, 2, 3, 4].reduce((c, i) => c + bit(x, i), 0);

describe('gates', () => {
  it('NOT/AND/OR/XOR/MUX truth tables and sizes', () => {
    const cases: Array<[string, number, (n: Netlist, i: number[]) => number, (x: number) => number, number]> = [
      ['not', 1, (n, i) => g.not(n, i[0]), (x) => 1 - bit(x, 0), 1],
      ['and', 2, (n, i) => g.and(n, i[0], i[1]), (x) => bit(x, 0) & bit(x, 1), 2],
      ['or', 2, (n, i) => g.or(n, i[0], i[1]), (x) => bit(x, 0) | bit(x, 1), 3],
      ['xor', 2, (n, i) => g.xor(n, i[0], i[1]), (x) => bit(x, 0) ^ bit(x, 1), 4],
      ['mux', 3, (n, i) => g.mux(n, i[0], i[1], i[2]), (x) => (bit(x, 0) ? bit(x, 1) : bit(x, 2)), 4],
      ['maj', 3, (n, i) => g.maj(n, i[0], i[1], i[2]), (x) => (bit(x, 0) + bit(x, 1) + bit(x, 2) >= 2 ? 1 : 0), 6],
    ];
    for (const [name, nIn, build, want, size] of cases) {
      const c = circuit(nIn, (n, i) => [build(n, i)]);
      expect(c.nand, name).toBe(size);
      for (let x = 0; x < 1 << nIn; x++) expect(c.run(x)[0], `${name}(${x})`).toBe(want(x));
    }
  });

  it('andAll/orAll handle empty and long lists', () => {
    expect(circuit(1, (n) => [g.andAll(n, [])]).run(0)[0]).toBe(1);
    expect(circuit(1, (n) => [g.orAll(n, [])]).run(1)[0]).toBe(0);
    const a4 = circuit(4, (n, i) => [g.andAll(n, i)]);
    const o4 = circuit(4, (n, i) => [g.orAll(n, i)]);
    for (let x = 0; x < 16; x++) {
      expect(a4.run(x)[0]).toBe(x === 15 ? 1 : 0);
      expect(o4.run(x)[0]).toBe(x === 0 ? 0 : 1);
    }
  });

  it('adders', () => {
    const fa = circuit(3, (n, i) => {
      const r = g.fullAdder(n, i[0], i[1], i[2]);
      return [r.sum, r.carry];
    });
    const ha = circuit(2, (n, i) => {
      const r = g.halfAdder(n, i[0], i[1]);
      return [r.sum, r.carry];
    });
    expect(fa.nand).toBe(9);
    expect(ha.nand).toBe(5);
    for (let x = 0; x < 8; x++) {
      const s = bit(x, 0) + bit(x, 1) + bit(x, 2);
      expect(fa.run(x)).toEqual([s & 1, s >> 1]);
    }
    for (let x = 0; x < 4; x++) expect(ha.run(x)).toEqual([bit(x, 0) ^ bit(x, 1), bit(x, 0) & bit(x, 1)]);
  });

  it('popcount5 (23 NAND)', () => {
    const c = circuit(5, (n, i) => g.popcount5(n, i));
    expect(c.nand).toBe(23);
    for (let x = 0; x < 32; x++) {
      const k = popcount(x);
      expect(c.run(x)).toEqual([bit(k, 0), bit(k, 1), bit(k, 2)]);
    }
  });

  it('geUnsigned for 3 and 4 bits', () => {
    const g3 = circuit(6, (n, i) => [g.geUnsigned(n, i.slice(0, 3), i.slice(3, 6))]);
    const g4 = circuit(8, (n, i) => [g.geUnsigned(n, i.slice(0, 4), i.slice(4, 8))]);
    expect(g3.nand).toBe(16);
    expect(g4.nand).toBe(23);
    for (let x = 0; x < 64; x++) expect(g3.run(x)[0]).toBe((x & 7) >= x >> 3 ? 1 : 0);
    for (let x = 0; x < 256; x++) expect(g4.run(x)[0]).toBe((x & 15) >= x >> 4 ? 1 : 0);
  });
});

describe('sub-circuits', () => {
  it('KofN5 = popcount(v0..v4) >= k0..k2, 41 NAND', () => {
    const c = buildKofN5();
    expect(c).toMatchObject({ name: 'KofN5', nIn: 8, nOut: 1, nand: 41, latch: 0, refs: [] });
    const p = compile(c, noRefs);
    for (let x = 0; x < 256; x++) {
      const want = popcount(x & 31) >= x >> 5 ? 1 : 0;
      expect(stepBytes(p, new Uint8Array(0), Uint8Array.of(x)).out[0]).toBe(want);
    }
  });

  it('Ge4 = a0..a3 >= b0..b3, 25 NAND', () => {
    const c = buildGe4();
    expect(c).toMatchObject({ name: 'Ge4', nIn: 8, nOut: 1, nand: 25, latch: 0, refs: [] });
    const p = compile(c, noRefs);
    for (let x = 0; x < 256; x++) {
      expect(stepBytes(p, new Uint8Array(0), Uint8Array.of(x)).out[0]).toBe((x & 15) >= x >> 4 ? 1 : 0);
    }
  });
});
```

- [ ] **Step 2: Chạy test, xác nhận thất bại**

Run: `npm test -w circuits -- test/subcircuits.test.ts`
Expected: FAIL, không tìm thấy `../src/gates`.

- [ ] **Step 3: Viết `gates.ts` và `subcircuits.ts`**

`circuits/src/gates.ts`:

```ts
import type { Netlist } from './netlist';

/** NetlistVM constants: signal 0 is 0, signal 1 is 1. */
export const ZERO = 0;
export const ONE = 1;

export const not = (n: Netlist, a: number): number => n.nand(a, a);
export const and = (n: Netlist, a: number, b: number): number => not(n, n.nand(a, b));
export const or = (n: Netlist, a: number, b: number): number => n.nand(not(n, a), not(n, b));

export function xor(n: Netlist, a: number, b: number): number {
  const t = n.nand(a, b);
  return n.nand(n.nand(a, t), n.nand(b, t));
}

/** sel ? whenOne : whenZero (4 NAND). */
export function mux(n: Netlist, sel: number, whenOne: number, whenZero: number): number {
  return n.nand(n.nand(sel, whenOne), n.nand(not(n, sel), whenZero));
}

export function andAll(n: Netlist, xs: number[]): number {
  if (xs.length === 0) return ONE;
  return xs.slice(1).reduce((acc, x) => and(n, acc, x), xs[0]);
}

export function orAll(n: Netlist, xs: number[]): number {
  if (xs.length === 0) return ZERO;
  return xs.slice(1).reduce((acc, x) => or(n, acc, x), xs[0]);
}

/** Majority of three (6 NAND). */
export function maj(n: Netlist, a: number, b: number, c: number): number {
  return n.nand(n.nand(a, b), n.nand(c, or(n, a, b)));
}

/** Classic 9-NAND full adder. */
export function fullAdder(n: Netlist, a: number, b: number, c: number): { sum: number; carry: number } {
  const t1 = n.nand(a, b);
  const s1 = n.nand(n.nand(a, t1), n.nand(b, t1));
  const t4 = n.nand(s1, c);
  const sum = n.nand(n.nand(s1, t4), n.nand(c, t4));
  return { sum, carry: n.nand(t1, t4) };
}

/** 5-NAND half adder. */
export function halfAdder(n: Netlist, a: number, b: number): { sum: number; carry: number } {
  const t = n.nand(a, b);
  return { sum: n.nand(n.nand(a, t), n.nand(b, t)), carry: not(n, t) };
}

/** Population count of five bits as a little-endian 3-bit number (23 NAND). */
export function popcount5(n: Netlist, v: number[]): number[] {
  if (v.length !== 5) throw new Error('popcount5 needs 5 bits');
  const a = fullAdder(n, v[0], v[1], v[2]);
  const b = fullAdder(n, v[3], v[4], a.sum);
  const c = halfAdder(n, a.carry, b.carry);
  return [b.sum, c.sum, c.carry];
}

/** Unsigned a >= b for equal-width little-endian vectors: the carry out of a + ~b + 1. */
export function geUnsigned(n: Netlist, a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) throw new Error('geUnsigned width');
  let carry = n.nand(not(n, a[0]), b[0]); // maj(a0, ~b0, 1) = a0 | ~b0
  for (let i = 1; i < a.length; i++) carry = maj(n, a[i], not(n, b[i]), carry);
  return carry;
}
```

`circuits/src/subcircuits.ts`:

```ts
import { geUnsigned, popcount5 } from './gates';
import { Netlist, type BuiltCircuit } from './netlist';

/** KofN5: inputs v0..v4, k0..k2; output popcount(v) >= k. Public building block on ATRO. */
export function buildKofN5(): BuiltCircuit {
  const n = new Netlist('KofN5', 8);
  const count = popcount5(n, n.inputs(0, 5));
  return n.finish([geUnsigned(n, count, n.inputs(5, 3))]);
}

/** Ge4: inputs a0..a3, b0..b3; output a >= b (unsigned). */
export function buildGe4(): BuiltCircuit {
  const n = new Netlist('Ge4', 8);
  return n.finish([geUnsigned(n, n.inputs(0, 4), n.inputs(4, 4))]);
}
```

- [ ] **Step 4: Chạy test và typecheck**

Run: `npm test -w circuits -- test/subcircuits.test.ts && npm run typecheck -w circuits`
Expected: 7 test PASS; `tsc` sạch.

- [ ] **Step 5: Commit**

```bash
git add circuits/src/gates.ts circuits/src/subcircuits.ts circuits/test/subcircuits.test.ts
git commit -m "feat(circuits): NAND gate library and KofN5/Ge4 sub-circuits" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```


---

### Task 4: Model tham chiếu và các tính chất P1–P7

**Files:**
- Create: `circuits/src/model.ts`, `circuits/src/properties.ts`
- Test: `circuits/test/model.test.ts`

**Interfaces:**
- Consumes: không.
- Produces:
  - `model.ts`: `S = { ACTIVE: 0, GRACE: 1, RECOVERY: 3, RELEASED_INHERIT: 5, RELEASED_RECOVER: 7 }`, `OUT = { ALARM: 1, CANCEL: 2, RELEASE: 4 }`, `F = { INHQ: 1, RECQ: 2, LATE: 4, MAXED: 8, ALIVE: 16, WD: 32, KPOS: 64 }`, `type Cls = 'active' | 'grace' | 'recovery' | 'released'`, `interface PolicyInputs { idle; threshold; inhVotes; recVotes; k; alive: boolean; windowDone: boolean }`, `packInputs(i): number` (word 23 bit), `unpackInputs(v): PolicyInputs`, `cls(s): Cls`, `popcount(x): number`, `flags(v): number`, `nextState(s, v): number`, `expectedOut(s, next): number`, `refStepCode(s, v): number` (= `next | out << 3`), `refStep(s, i: PolicyInputs): { next; out }`.
  - `properties.ts`: `PROP_NAMES = ['P1', …, 'P7']`, `violations(s, v, next, out): number` (bit j bật ⇔ P(j+1) bị vi phạm).

- [ ] **Step 1: Viết test thất bại**

`circuits/test/model.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { cls, OUT, packInputs, refStep, refStepCode, S, unpackInputs, type PolicyInputs } from '../src/model';
import { violations } from '../src/properties';

const base: PolicyInputs = { idle: 0, threshold: 3, inhVotes: 0, recVotes: 0, k: 2, alive: false, windowDone: false };
const step = (s: number, patch: Partial<PolicyInputs>) => refStep(s, { ...base, ...patch });
const zero: PolicyInputs = { idle: 0, threshold: 0, inhVotes: 0, recVotes: 0, k: 0, alive: false, windowDone: false };

describe('model', () => {
  it('packs inputs at the spec bit positions', () => {
    expect(packInputs({ ...zero, idle: 15 })).toBe(0xf);
    expect(packInputs({ ...zero, threshold: 15 })).toBe(0xf0);
    expect(packInputs({ ...zero, inhVotes: 31 })).toBe(31 << 8);
    expect(packInputs({ ...zero, recVotes: 31 })).toBe(31 << 13);
    expect(packInputs({ ...zero, k: 7 })).toBe(7 << 18);
    expect(packInputs({ ...zero, alive: true })).toBe(1 << 21);
    expect(packInputs({ ...zero, windowDone: true })).toBe(1 << 22);
    expect(() => packInputs({ ...base, idle: 16 })).toThrow('idle out of range');
    for (const v of [0, 1, 0x7fffff, 0x2a5a5a]) expect(packInputs(unpackInputs(v))).toBe(v);
  });

  it('classifies all 8 state codes', () => {
    expect([0, 1, 2, 3, 4, 5, 6, 7].map(cls)).toEqual([
      'active', 'grace', 'active', 'recovery', 'released', 'released', 'released', 'released',
    ]);
  });

  it('follows §3.4 from Active', () => {
    expect(step(S.ACTIVE, {})).toEqual({ next: S.ACTIVE, out: 0 });
    expect(step(S.ACTIVE, { idle: 3 })).toEqual({ next: S.GRACE, out: OUT.ALARM });
    expect(step(S.ACTIVE, { recVotes: 0b11 })).toEqual({ next: S.RECOVERY, out: OUT.ALARM });
    expect(step(S.ACTIVE, { idle: 3, recVotes: 0b11, alive: true })).toEqual({ next: S.ACTIVE, out: 0 });
  });

  it('follows §3.4 from Grace', () => {
    expect(step(S.GRACE, { idle: 3 })).toEqual({ next: S.GRACE, out: 0 });
    expect(step(S.GRACE, { windowDone: true })).toEqual({ next: S.GRACE, out: 0 });
    expect(step(S.GRACE, { windowDone: true, inhVotes: 0b101 })).toEqual({ next: S.RELEASED_INHERIT, out: OUT.RELEASE });
    expect(step(S.GRACE, { windowDone: true, idle: 15 })).toEqual({ next: S.RELEASED_INHERIT, out: OUT.RELEASE });
    expect(step(S.GRACE, { windowDone: true, inhVotes: 0b11, recVotes: 0b11 })).toEqual({ next: S.RECOVERY, out: OUT.ALARM });
    expect(step(S.GRACE, { alive: true })).toEqual({ next: S.ACTIVE, out: OUT.CANCEL });
  });

  it('follows §3.4 from RecoveryPending', () => {
    expect(step(S.RECOVERY, { recVotes: 0b11 })).toEqual({ next: S.RECOVERY, out: 0 });
    expect(step(S.RECOVERY, { recVotes: 0b11, windowDone: true })).toEqual({ next: S.RELEASED_RECOVER, out: OUT.RELEASE });
    expect(step(S.RECOVERY, { recVotes: 0b1, idle: 3 })).toEqual({ next: S.GRACE, out: OUT.ALARM });
    expect(step(S.RECOVERY, { recVotes: 0b1 })).toEqual({ next: S.ACTIVE, out: OUT.CANCEL });
    expect(step(S.RECOVERY, { recVotes: 0b11, alive: true })).toEqual({ next: S.ACTIVE, out: OUT.CANCEL });
  });

  it('treats k = 0 as the Simple template', () => {
    expect(step(S.GRACE, { k: 0, windowDone: true })).toEqual({ next: S.RELEASED_INHERIT, out: OUT.RELEASE });
    expect(step(S.ACTIVE, { k: 0, recVotes: 31 })).toEqual({ next: S.ACTIVE, out: 0 });
  });

  it('holds X=1 codes and treats 010 as Active', () => {
    for (const s of [4, 5, 6, 7]) {
      expect(step(s, { alive: true, idle: 15, windowDone: true })).toEqual({ next: s, out: 0 });
    }
    expect(step(2, { idle: 3 })).toEqual({ next: S.GRACE, out: OUT.ALARM });
    expect(step(2, {})).toEqual({ next: S.ACTIVE, out: 0 });
  });

  it('flags each property violation', () => {
    const late = packInputs({ ...base, idle: 3 });
    expect(violations(S.RELEASED_INHERIT, 0, S.ACTIVE, 0) & 1).toBe(1); // P1
    expect(violations(S.GRACE, packInputs({ ...base, alive: true }), S.GRACE, 0) & 2).toBe(2); // P2
    expect(violations(S.GRACE, 0, S.RELEASED_INHERIT, OUT.RELEASE) & 4).toBe(4); // P3: no window, no quorum
    expect(violations(S.RECOVERY, 0, S.RELEASED_RECOVER, OUT.RELEASE) & 8).toBe(8); // P4
    expect(violations(S.ACTIVE, packInputs(base), S.GRACE, OUT.ALARM) & 16).toBe(16); // P5: idle 0 < T 3
    expect(violations(S.ACTIVE, late, 2, 0) & 32).toBe(32); // P6
    expect(violations(S.ACTIVE, late, S.GRACE, 0) & 64).toBe(64); // P7: alarm missing
  });

  it('the model satisfies P1–P7 over all 2^26 combinations', () => {
    let bad = 0;
    for (let s = 0; s < 8; s++) {
      for (let v = 0; v < 1 << 23; v++) {
        const c = refStepCode(s, v);
        if (violations(s, v, c & 7, c >>> 3) !== 0) bad++;
      }
    }
    expect(bad).toBe(0);
  }, 300_000);
});
```

- [ ] **Step 2: Chạy test, xác nhận thất bại**

Run: `npm test -w circuits -- test/model.test.ts`
Expected: FAIL, không tìm thấy `../src/model`.

- [ ] **Step 3: Viết `model.ts` và `properties.ts`**

`circuits/src/model.ts`:

```ts
/** Reference model of AtropylePolicy v1, spec §3. State bits: bit0 = A, bit1 = R, bit2 = X. */

export const S = { ACTIVE: 0, GRACE: 1, RECOVERY: 3, RELEASED_INHERIT: 5, RELEASED_RECOVER: 7 } as const;
export const OUT = { ALARM: 1, CANCEL: 2, RELEASE: 4 } as const;
export const F = { INHQ: 1, RECQ: 2, LATE: 4, MAXED: 8, ALIVE: 16, WD: 32, KPOS: 64 } as const;

export type Cls = 'active' | 'grace' | 'recovery' | 'released';

export interface PolicyInputs {
  idle: number;
  threshold: number;
  inhVotes: number;
  recVotes: number;
  k: number;
  alive: boolean;
  windowDone: boolean;
}

export function packInputs(i: PolicyInputs): number {
  const fields: Array<[number, number, string]> = [
    [i.idle, 15, 'idle'],
    [i.threshold, 15, 'threshold'],
    [i.inhVotes, 31, 'inhVotes'],
    [i.recVotes, 31, 'recVotes'],
    [i.k, 7, 'k'],
  ];
  for (const [v, max, name] of fields) {
    if (!Number.isInteger(v) || v < 0 || v > max) throw new Error(`${name} out of range`);
  }
  return (
    i.idle |
    (i.threshold << 4) |
    (i.inhVotes << 8) |
    (i.recVotes << 13) |
    (i.k << 18) |
    (i.alive ? 1 << 21 : 0) |
    (i.windowDone ? 1 << 22 : 0)
  );
}

export function unpackInputs(v: number): PolicyInputs {
  return {
    idle: v & 15,
    threshold: (v >>> 4) & 15,
    inhVotes: (v >>> 8) & 31,
    recVotes: (v >>> 13) & 31,
    k: (v >>> 18) & 7,
    alive: ((v >>> 21) & 1) === 1,
    windowDone: ((v >>> 22) & 1) === 1,
  };
}

export function cls(s: number): Cls {
  if (s & 4) return 'released';
  if ((s & 1) === 0) return 'active';
  return s & 2 ? 'recovery' : 'grace';
}

export function popcount(x: number): number {
  let c = 0;
  for (let y = x >>> 0; y !== 0; y >>>= 1) c += y & 1;
  return c;
}

const POP5 = Uint8Array.from({ length: 32 }, (_, x) => popcount(x));

/** Derived signals of spec §3.3 as F-flags. */
export function flags(v: number): number {
  const idle = v & 15;
  const t = (v >>> 4) & 15;
  const k = (v >>> 18) & 7;
  let f = 0;
  if (POP5[(v >>> 8) & 31] >= k) f |= F.INHQ;
  if (k !== 0 && POP5[(v >>> 13) & 31] >= k) f |= F.RECQ;
  if (idle >= t) f |= F.LATE;
  if (idle === 15) f |= F.MAXED;
  if ((v >>> 21) & 1) f |= F.ALIVE;
  if ((v >>> 22) & 1) f |= F.WD;
  if (k !== 0) f |= F.KPOS;
  return f;
}

/** Transition function, spec §3.4, in priority order. */
export function nextState(s: number, v: number): number {
  const c = cls(s);
  if (c === 'released') return s;
  const f = flags(v);
  if (f & F.ALIVE) return S.ACTIVE;
  const recQ = (f & F.RECQ) !== 0;
  const late = (f & F.LATE) !== 0;
  const wd = (f & F.WD) !== 0;
  if (c === 'recovery') {
    if (recQ && wd) return S.RELEASED_RECOVER;
    if (recQ) return S.RECOVERY;
    return late ? S.GRACE : S.ACTIVE;
  }
  if (c === 'grace') {
    if (recQ) return S.RECOVERY;
    return wd && (f & (F.INHQ | F.MAXED)) !== 0 ? S.RELEASED_INHERIT : S.GRACE;
  }
  if (recQ) return S.RECOVERY;
  return late ? S.GRACE : S.ACTIVE;
}

/** Output flags, spec §3.5. */
export function expectedOut(s: number, next: number): number {
  const cs = cls(s);
  const cn = cls(next);
  const alarmCls = (c: Cls) => c === 'grace' || c === 'recovery';
  let o = 0;
  if (alarmCls(cn) && cn !== cs) o |= OUT.ALARM;
  if (alarmCls(cs) && next === S.ACTIVE) o |= OUT.CANCEL;
  if (cs !== 'released' && cn === 'released') o |= OUT.RELEASE;
  return o;
}

export function refStepCode(s: number, v: number): number {
  const n = nextState(s, v);
  return n | (expectedOut(s, n) << 3);
}

export function refStep(s: number, i: PolicyInputs): { next: number; out: number } {
  const c = refStepCode(s, packInputs(i));
  return { next: c & 7, out: c >>> 3 };
}
```

`circuits/src/properties.ts`:

```ts
import { cls, expectedOut, F, flags, S } from './model';

export const PROP_NAMES = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7'] as const;

/** Bits 0, 1, 3, 5, 7: the canonical state codes of spec §3.1. */
const CANONICAL = 0b10101011;

/** Returns a bitmask: bit j set means property P(j+1) of spec §3.6 fails for this (s, v) -> (next, out). */
export function violations(s: number, v: number, next: number, out: number): number {
  const c = cls(s);
  const f = flags(v);
  const released = c === 'released';
  const alive = (f & F.ALIVE) !== 0;
  const wd = (f & F.WD) !== 0;
  const recQ = (f & F.RECQ) !== 0;
  const inhOk = (f & (F.INHQ | F.MAXED)) !== 0;
  const late = (f & F.LATE) !== 0;
  const kPos = (f & F.KPOS) !== 0;
  let bad = 0;
  if (released && (next !== s || out !== 0)) bad |= 1;
  if (!released && alive && next !== S.ACTIVE) bad |= 2;
  if (!released && next === S.RELEASED_INHERIT && !(c === 'grace' && !alive && wd && !recQ && inhOk)) bad |= 4;
  if (!released && next === S.RELEASED_RECOVER && !(c === 'recovery' && !alive && wd && recQ && kPos)) bad |= 8;
  if (c === 'active' && next === S.GRACE && !(late && !alive)) bad |= 16;
  if (c === 'active' && next === S.RECOVERY && !(recQ && !alive)) bad |= 16;
  if (!released && ((CANONICAL >> next) & 1) === 0) bad |= 32;
  if (out !== expectedOut(s, next)) bad |= 64;
  return bad;
}
```

- [ ] **Step 4: Chạy test và typecheck**

Run: `npm test -w circuits -- test/model.test.ts && npm run typecheck -w circuits`
Expected: 9 test PASS (test exhaustive mất khoảng 10–60 s); `tsc` sạch.

- [ ] **Step 5: Commit**

```bash
git add circuits/src/model.ts circuits/src/properties.ts circuits/test/model.test.ts
git commit -m "feat(circuits): reference policy model and P1-P7 property checks" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Circuit `AtropylePolicy v1`, chứng minh exhaustive và xuất JSON

**Files:**
- Create: `circuits/src/policy.ts`, `circuits/src/verify.ts`, `circuits/src/export.ts`, `circuits/src/prove.ts`, `circuits/src/index.ts`
- Create (sinh ra): `contracts/circuits/kofn5.json`, `contracts/circuits/ge4.json`, `contracts/circuits/policy.template.json`, `contracts/circuits/vectors.json`
- Test: `circuits/test/policy.test.ts`, `circuits/test/export.test.ts`

**Interfaces:**
- Consumes: Task 1–4.
- Produces:
  - `policy.ts`: `interface PolicyRefs { kofn: RefSpec; ge4: RefSpec }`, `PLACEHOLDER_REFS` (cpu `0x00…00`, KofN5 id `1n`, Ge4 id `2n`), `REF_TARGET_INDEX: Record<string, number> = { KofN5: 0, Ge4: 1 }`, `buildPolicy(refs = PLACEHOLDER_REFS): BuiltCircuit`, `interface PolicyBuild { kofn; ge4; policy: BuiltCircuit; resolve: Resolver; program: Program }`, `buildAll(): PolicyBuild`, `patchRefs(bytes, sites: RefSite[], cpu: string, ids: readonly [bigint, bigint]): Uint8Array`.
  - `verify.ts`: `interface Failure { state; inputs; next; out; expectNext; expectOut; violations }`, `interface VerifyReport { combos; mismatches; violations: number[]; firstFailures: Failure[]; ms }`, `interface VerifyOptions { maxFailures?; onProgress?(done, total); blocks? }`, `verifyPolicy(p: Program, opts?): VerifyReport`.
  - `export.ts`: `interface CircuitJson { name; netlist (hex); nIn; nOut; nand; latch; gateCount; refOffsets: number[]; refTargets: number[] }`, `interface VectorsJson { states; inputs; next; out: number[] }`, `circuitJson(c, gateCount)`, `xorshift32(seed)`, `makeVectors(p, count = 512)`, `exportAll(dir): { dir; policyGateCount }`.
  - **Hợp đồng JSON với Foundry** (Task 6, 12 đọc nguyên văn): các khoá `netlist` (hex `0x…`), `nIn`, `nOut`, `nand`, `latch`, `gateCount`, `refOffsets`, `refTargets`; `vectors.json` có `states`, `inputs` (word 23 bit), `next`, `out`.

Thiết kế cổng của policy, với `live = ¬X ∧ ¬alive`, `grace = A ∧ ¬R`, `recp = A ∧ R`, `inhOK = inhQ ∨ maxed`. Các biểu thức này tương đương §3.4–3.5, kể cả mã 010 (coi như Active) và mọi mã X=1 (giữ nguyên):
- `A' = X ? A : live ∧ (grace ∨ recQ ∨ late)`
- `R' = X ? R : live ∧ recQ`
- `X' = X ∨ (live ∧ wd ∧ ((recp ∧ recQ) ∨ (grace ∧ ¬recQ ∧ inhOK)))`
- `alarm = ¬X ∧ A' ∧ ¬X' ∧ (¬A ∨ (R' ⊕ R))`, `cancel = ¬X ∧ A ∧ ¬A'`, `release = ¬X ∧ X'`

- [ ] **Step 1: Viết test thất bại**

`circuits/test/policy.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { OUT, packInputs, S, type PolicyInputs } from '../src/model';
import { buildAll, buildPolicy, patchRefs, PLACEHOLDER_REFS } from '../src/policy';
import { stepBytes, type Program } from '../src/sim';
import { verifyPolicy } from '../src/verify';

const base: PolicyInputs = { idle: 0, threshold: 3, inhVotes: 0, recVotes: 0, k: 2, alive: false, windowDone: false };

function run(p: Program, s: number, patch: Partial<PolicyInputs>) {
  const w = packInputs({ ...base, ...patch });
  const r = stepBytes(p, Uint8Array.of(s), Uint8Array.of(w & 0xff, (w >>> 8) & 0xff, (w >>> 16) & 0xff));
  return { next: r.next[0], out: r.out[0] };
}

describe('AtropylePolicy v1', () => {
  const { policy, program } = buildAll();

  it('has the spec shape', () => {
    expect(program).toMatchObject({ nIn: 23, nOut: 3, nState: 3 });
    expect(program.gateCount).toBeLessThanOrEqual(230);
    expect(policy.latch).toBe(3);
    expect(policy.refs.map((r) => r.target)).toEqual(['KofN5', 'KofN5', 'Ge4']);
  });

  it('spot-checks key transitions', () => {
    expect(run(program, S.ACTIVE, { idle: 3 })).toEqual({ next: S.GRACE, out: OUT.ALARM });
    expect(run(program, S.GRACE, { windowDone: true, inhVotes: 0b11 })).toEqual({ next: S.RELEASED_INHERIT, out: OUT.RELEASE });
    expect(run(program, S.RECOVERY, { windowDone: true, recVotes: 0b11 })).toEqual({ next: S.RELEASED_RECOVER, out: OUT.RELEASE });
    expect(run(program, S.GRACE, { alive: true })).toEqual({ next: S.ACTIVE, out: OUT.CANCEL });
    expect(run(program, S.RELEASED_INHERIT, { alive: true })).toEqual({ next: S.RELEASED_INHERIT, out: 0 });
  });

  it('proves P1–P8 over all 2^26 combinations', () => {
    const r = verifyPolicy(program);
    expect(r.combos).toBe(2 ** 26);
    expect(r.firstFailures).toEqual([]);
    expect(r.mismatches).toBe(0);
    expect(r.violations).toEqual([0, 0, 0, 0, 0, 0, 0]);
  }, 300_000);

  it('catches a broken circuit', () => {
    const swapped: Program = {
      ...program,
      outIdx: Int32Array.of(program.outIdx[1], program.outIdx[0], program.outIdx[2]),
    };
    const r = verifyPolicy(swapped, { blocks: 1 << 12 });
    expect(r.mismatches).toBeGreaterThan(0);
    expect(r.violations[6]).toBeGreaterThan(0);
    expect(r.firstFailures.length).toBe(16);
  });

  it('patching placeholder REFs equals building with real REFs', () => {
    const cpu = '0x' + '5a'.repeat(20);
    const real = buildPolicy({
      kofn: { ...PLACEHOLDER_REFS.kofn, cpu, id: 10n },
      ge4: { ...PLACEHOLDER_REFS.ge4, cpu, id: 11n },
    });
    expect(patchRefs(policy.bytes, policy.refs, cpu, [10n, 11n])).toEqual(real.bytes);
  });
});
```

`circuits/test/export.test.ts`:

```ts
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { exportAll } from '../src/export';
import { refStepCode } from '../src/model';

const FILES = ['kofn5.json', 'ge4.json', 'policy.template.json', 'vectors.json'];
const committedDir = fileURLToPath(new URL('../../contracts/circuits/', import.meta.url));

describe('export', () => {
  const dir = mkdtempSync(join(tmpdir(), 'atropyle-'));
  const r = exportAll(dir);
  const read = (f: string) => JSON.parse(readFileSync(join(dir, f), 'utf8'));

  it('writes the three circuits with gate counts', () => {
    expect(read('kofn5.json')).toMatchObject({
      name: 'KofN5', nIn: 8, nOut: 1, nand: 41, latch: 0, gateCount: 41, refOffsets: [], refTargets: [],
    });
    expect(read('ge4.json')).toMatchObject({ name: 'Ge4', nIn: 8, nOut: 1, nand: 25, latch: 0, gateCount: 25 });
    const p = read('policy.template.json');
    expect(p).toMatchObject({ name: 'AtropylePolicy', nIn: 23, nOut: 3, latch: 3, refTargets: [0, 0, 1] });
    expect(p.gateCount).toBe(r.policyGateCount);
    expect(p.netlist).toMatch(/^0x[0-9a-f]+$/);
  });

  it('writes vectors that match the reference model', () => {
    const v = read('vectors.json');
    expect(v.states).toHaveLength(512);
    v.states.forEach((s: number, i: number) => {
      expect(s).toBe(i % 8);
      expect(v.next[i] | (v.out[i] << 3)).toBe(refStepCode(s, v.inputs[i]));
    });
  });

  it('committed contracts/circuits files are up to date', () => {
    for (const f of FILES) {
      expect(readFileSync(join(committedDir, f), 'utf8'), f).toBe(readFileSync(join(dir, f), 'utf8'));
    }
  });
});
```

- [ ] **Step 2: Chạy test, xác nhận thất bại**

Run: `npm test -w circuits -- test/policy.test.ts test/export.test.ts`
Expected: FAIL, không tìm thấy `../src/policy` và `../src/export`.

- [ ] **Step 3: Viết `policy.ts`**

`circuits/src/policy.ts`:

```ts
import { hexToBytes } from './bytes';
import { and, andAll, mux, not, or, orAll, xor } from './gates';
import { Netlist, type BuiltCircuit, type RefSite, type RefSpec } from './netlist';
import { compile, type Program, type Resolver } from './sim';
import { buildGe4, buildKofN5 } from './subcircuits';

const ZERO_ADDR = '0x' + '00'.repeat(20);

export interface PolicyRefs {
  kofn: RefSpec;
  ge4: RefSpec;
}

/** Template REFs; deploy patches the real ATRO address and circuit ids in (NetlistPatch.sol). */
export const PLACEHOLDER_REFS: PolicyRefs = {
  kofn: { name: 'KofN5', cpu: ZERO_ADDR, id: 1n, nIn: 8, nOut: 1 },
  ge4: { name: 'Ge4', cpu: ZERO_ADDR, id: 2n, nIn: 8, nOut: 1 },
};

/** Index into the [kofnId, ge4Id] pair used by refTargets / NetlistPatch. */
export const REF_TARGET_INDEX: Record<string, number> = { KofN5: 0, Ge4: 1 };

/** AtropylePolicy v1, spec §3: LATCHes A, R, X (state bits 0, 1, 2); 23 inputs; outputs alarm, cancel, release. */
export function buildPolicy(refs: PolicyRefs = PLACEHOLDER_REFS): BuiltCircuit {
  const n = new Netlist('AtropylePolicy', 23);
  const A = n.latch();
  const R = n.latch();
  const X = n.latch();
  const idle = n.inputs(0, 4);
  const T = n.inputs(4, 4);
  const inh = n.inputs(8, 5);
  const rec = n.inputs(13, 5);
  const k = n.inputs(18, 3);
  const alive = n.input(21);
  const wd = n.input(22);

  const [inhQ] = n.ref(refs.kofn, [...inh, ...k]);
  const [recRaw] = n.ref(refs.kofn, [...rec, ...k]);
  const [late] = n.ref(refs.ge4, [...idle, ...T]);
  const recQ = and(n, recRaw, orAll(n, k));
  const maxed = andAll(n, idle);

  const notX = not(n, X.q);
  const live = and(n, notX, not(n, alive));
  const grace = and(n, A.q, not(n, R.q));
  const recp = and(n, A.q, R.q);
  const inhOk = or(n, inhQ, maxed);

  const aNext = mux(n, X.q, A.q, and(n, live, orAll(n, [grace, recQ, late])));
  const rNext = mux(n, X.q, R.q, and(n, live, recQ));
  const fire = andAll(n, [live, wd, or(n, and(n, recp, recQ), andAll(n, [grace, not(n, recQ), inhOk]))]);
  const xNext = or(n, X.q, fire);
  A.setD(aNext);
  R.setD(rNext);
  X.setD(xNext);

  const alarm = andAll(n, [notX, aNext, not(n, xNext), or(n, not(n, A.q), xor(n, rNext, R.q))]);
  const cancel = andAll(n, [notX, A.q, not(n, aNext)]);
  const release = and(n, notX, xNext);
  return n.finish([alarm, cancel, release]);
}

export interface PolicyBuild {
  kofn: BuiltCircuit;
  ge4: BuiltCircuit;
  policy: BuiltCircuit;
  resolve: Resolver;
  program: Program;
}

export function buildAll(): PolicyBuild {
  const kofn = buildKofN5();
  const ge4 = buildGe4();
  const policy = buildPolicy();
  const resolve: Resolver = (cpu, id) => {
    if (cpu.toLowerCase() !== ZERO_ADDR) throw new Error(`unknown cpu ${cpu}`);
    if (id === PLACEHOLDER_REFS.kofn.id) return kofn;
    if (id === PLACEHOLDER_REFS.ge4.id) return ge4;
    throw new Error(`unknown circuit ${id}`);
  };
  return { kofn, ge4, policy, resolve, program: compile(policy, resolve) };
}

/** Same operation as contracts/script/lib/NetlistPatch.sol: writes cpu and ids[target] into every REF site. */
export function patchRefs(bytes: Uint8Array, sites: RefSite[], cpu: string, ids: readonly [bigint, bigint]): Uint8Array {
  const addr = hexToBytes(cpu);
  if (addr.length !== 20) throw new Error('address must be 20 bytes');
  const out = bytes.slice();
  for (const s of sites) {
    if (out[s.offset - 1] !== 2) throw new Error('patch: offset');
    const idx = REF_TARGET_INDEX[s.target];
    if (idx === undefined) throw new Error(`patch: unknown target ${s.target}`);
    out.set(addr, s.offset);
    let id = ids[idx];
    for (let b = 7; b >= 0; b--) {
      out[s.offset + 20 + b] = Number(id & 0xffn);
      id >>= 8n;
    }
  }
  return out;
}
```

- [ ] **Step 4: Viết `verify.ts`**

`circuits/src/verify.ts`:

```ts
import { refStepCode } from './model';
import { violations } from './properties';
import { lanes, runLanes, type Program } from './sim';

/** Bit j (0..4) of the lane index, as a 32-lane word. */
const LANE = [0xaaaaaaaa | 0, 0xcccccccc | 0, 0xf0f0f0f0 | 0, 0xff00ff00 | 0, 0xffff0000 | 0];
/** 2^26 combinations / 32 lanes. */
const FULL_BLOCKS = 1 << 21;

export interface Failure {
  state: number;
  inputs: number;
  next: number;
  out: number;
  expectNext: number;
  expectOut: number;
  violations: number;
}

export interface VerifyReport {
  combos: number;
  mismatches: number;
  /** Violation count per property P1..P7. */
  violations: number[];
  firstFailures: Failure[];
  ms: number;
}

export interface VerifyOptions {
  maxFailures?: number;
  onProgress?: (done: number, total: number) => void;
  /** Test hook: enumerate only the first `blocks` blocks of 32 combinations. */
  blocks?: number;
}

/**
 * Checks P1–P7 and P8 (equality with the reference model) for every (state, inputs).
 * combo = state | inputs << 3; block `blk` holds combos (blk << 5) .. (blk << 5) + 31, one per lane.
 */
export function verifyPolicy(p: Program, opts: VerifyOptions = {}): VerifyReport {
  if (p.nIn !== 23 || p.nOut !== 3 || p.nState !== 3) throw new Error('not a policy-shaped program');
  const t0 = performance.now();
  const blocks = opts.blocks ?? FULL_BLOCKS;
  const maxFailures = opts.maxFailures ?? 16;
  const buf = lanes(p);
  const state = Int32Array.of(LANE[0], LANE[1], LANE[2]);
  const inputs = new Int32Array(23);
  inputs[0] = LANE[3];
  inputs[1] = LANE[4];
  const counts = [0, 0, 0, 0, 0, 0, 0];
  const firstFailures: Failure[] = [];
  let mismatches = 0;

  for (let blk = 0; blk < blocks; blk++) {
    for (let i = 2; i < 23; i++) inputs[i] = (blk >>> (i - 2)) & 1 ? -1 : 0;
    runLanes(p, state, inputs, buf);
    const n0 = buf.next[0], n1 = buf.next[1], n2 = buf.next[2];
    const o0 = buf.out[0], o1 = buf.out[1], o2 = buf.out[2];
    for (let lane = 0; lane < 32; lane++) {
      const combo = (blk << 5) | lane;
      const s = combo & 7;
      const v = combo >>> 3;
      const next = ((n0 >>> lane) & 1) | (((n1 >>> lane) & 1) << 1) | (((n2 >>> lane) & 1) << 2);
      const out = ((o0 >>> lane) & 1) | (((o1 >>> lane) & 1) << 1) | (((o2 >>> lane) & 1) << 2);
      const code = refStepCode(s, v);
      const bad = code !== (next | (out << 3));
      const vio = violations(s, v, next, out);
      if (bad) mismatches++;
      for (let j = 0; vio !== 0 && j < 7; j++) if (vio & (1 << j)) counts[j]++;
      if ((bad || vio !== 0) && firstFailures.length < maxFailures) {
        firstFailures.push({ state: s, inputs: v, next, out, expectNext: code & 7, expectOut: code >>> 3, violations: vio });
      }
    }
    if (opts.onProgress && ((blk + 1) & 0xffff) === 0) opts.onProgress(blk + 1, blocks);
  }
  return { combos: blocks * 32, mismatches, violations: counts, firstFailures, ms: performance.now() - t0 };
}
```

- [ ] **Step 5: Viết `export.ts`, `prove.ts`, `index.ts`**

`circuits/src/export.ts`:

```ts
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve as resolvePath } from 'node:path';
import { pathToFileURL } from 'node:url';
import { bytesToHex } from './bytes';
import type { BuiltCircuit } from './netlist';
import { buildAll, REF_TARGET_INDEX } from './policy';
import { compile, stepBytes, type Program } from './sim';

export interface CircuitJson {
  name: string;
  netlist: string;
  nIn: number;
  nOut: number;
  nand: number;
  latch: number;
  gateCount: number;
  refOffsets: number[];
  refTargets: number[];
}

export interface VectorsJson {
  states: number[];
  inputs: number[];
  next: number[];
  out: number[];
}

export function circuitJson(c: BuiltCircuit, gateCount: number): CircuitJson {
  return {
    name: c.name,
    netlist: bytesToHex(c.bytes),
    nIn: c.nIn,
    nOut: c.nOut,
    nand: c.nand,
    latch: c.latch,
    gateCount,
    refOffsets: c.refs.map((r) => r.offset),
    refTargets: c.refs.map((r) => {
      const i = REF_TARGET_INDEX[r.target];
      if (i === undefined) throw new Error(`unknown REF target ${r.target}`);
      return i;
    }),
  };
}

export function xorshift32(seed: number): () => number {
  let x = seed >>> 0 || 1;
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    x >>>= 0;
    return x;
  };
}

/** Deterministic samples from the simulator: state i % 8, random 23-bit inputs. */
export function makeVectors(p: Program, count = 512): VectorsJson {
  const rand = xorshift32(0x9e3779b9);
  const v: VectorsJson = { states: [], inputs: [], next: [], out: [] };
  for (let i = 0; i < count; i++) {
    const s = i % 8;
    const w = rand() & 0x7fffff;
    const r = stepBytes(p, Uint8Array.of(s), Uint8Array.of(w & 0xff, (w >>> 8) & 0xff, (w >>> 16) & 0xff));
    v.states.push(s);
    v.inputs.push(w);
    v.next.push(r.next[0]);
    v.out.push(r.out[0]);
  }
  return v;
}

export function exportAll(dir: string): { dir: string; policyGateCount: number } {
  const b = buildAll();
  mkdirSync(dir, { recursive: true });
  const write = (file: string, data: unknown) => writeFileSync(join(dir, file), JSON.stringify(data, null, 2) + '\n');
  write('kofn5.json', circuitJson(b.kofn, compile(b.kofn, b.resolve).gateCount));
  write('ge4.json', circuitJson(b.ge4, compile(b.ge4, b.resolve).gateCount));
  write('policy.template.json', circuitJson(b.policy, b.program.gateCount));
  write('vectors.json', makeVectors(b.program));
  return { dir, policyGateCount: b.program.gateCount };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolvePath(process.argv[1])).href) {
  const r = exportAll(resolvePath(process.argv[2] ?? '../contracts/circuits'));
  console.log(`wrote ${r.dir} (policy gateCount ${r.policyGateCount})`);
}
```

`circuits/src/prove.ts`:

```ts
import { buildAll } from './policy';
import { PROP_NAMES } from './properties';
import { verifyPolicy } from './verify';

const { program } = buildAll();
const r = verifyPolicy(program, {
  onProgress: (done, total) => process.stdout.write(`\r${((100 * done) / total).toFixed(0)}%`),
});
process.stdout.write('\n');
console.log(`AtropylePolicy v1: ${program.gateCount} gates, ${r.combos} combinations, ${r.ms.toFixed(0)} ms`);
PROP_NAMES.forEach((name, i) => console.log(`${name}: ${r.violations[i] === 0 ? 'PASS' : `FAIL (${r.violations[i]})`}`));
console.log(`P8: ${r.mismatches === 0 ? 'PASS' : `FAIL (${r.mismatches})`}`);
if (r.mismatches !== 0 || r.violations.some((x) => x !== 0)) {
  console.log(JSON.stringify(r.firstFailures, null, 2));
  process.exit(1);
}
```

`circuits/src/index.ts` (chỉ module dùng được trong trình duyệt, không có `node:*`):

```ts
export * from './bytes';
export * from './netlist';
export * from './gates';
export * from './subcircuits';
export * from './sim';
export * from './model';
export * from './properties';
export * from './policy';
export * from './verify';
```

- [ ] **Step 6: Sinh JSON rồi chạy toàn bộ test**

Run: `npm run export -w circuits && npm test -w circuits && npm run typecheck -w circuits`
Expected: in ra `wrote …contracts/circuits (policy gateCount N)` với N ≤ 230; toàn bộ test PASS (gồm `proves P1–P8`); `tsc` sạch.

Run: `npm run prove -w circuits`
Expected: `P1: PASS` … `P7: PASS`, `P8: PASS`, exit code 0. Ghi lại dòng `AtropylePolicy v1: N gates …` để dùng ở Task 13.

- [ ] **Step 7: Commit**

```bash
git add circuits/src/policy.ts circuits/src/verify.ts circuits/src/export.ts circuits/src/prove.ts circuits/src/index.ts circuits/test/policy.test.ts circuits/test/export.test.ts contracts/circuits
git commit -m "feat(circuits): AtropylePolicy v1 with exhaustive P1-P8 proof and JSON export" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```


---

### Task 6: Khung Foundry, `PolicyCodec` và model Solidity

**Files:**
- Create: `contracts/foundry.toml`
- Create (qua `forge install`): `.gitmodules`, `contracts/lib/forge-std`, `contracts/lib/openzeppelin-contracts`
- Create: `contracts/src/interfaces/ICPU.sol`, `contracts/src/PolicyCodec.sol`, `contracts/test/mocks/PolicyModel.sol`
- Test: `contracts/test/PolicyModel.t.sol`

**Interfaces:**
- Consumes: `contracts/circuits/vectors.json` (Task 5).
- Produces:
  - `ICPU` (y hệt interface on-chain): `eval(uint256, bytes) view returns (bytes)`, `step(uint256, bytes state, bytes inputs) view returns (bytes newState, bytes outputs)`, `circuitInfo(uint256) view returns (uint32 nIn, uint32 nOut, uint32 nState, uint32 gateCount)`, `netlist(uint256) view returns (bytes)`, `transistors() view returns (address)`.
  - `library PolicyCodec`: hằng `ACTIVE 0, GRACE 1, RECOVERY 3, RELEASED_INHERIT 5, RELEASED_RECOVER 7, OUT_ALARM 1, OUT_CANCEL 2, OUT_RELEASE 4`; `struct Inputs { uint8 idle; uint8 threshold; uint8 inhVotes; uint8 recVotes; uint8 k; bool alive; bool windowDone; }`; `toWord(Inputs) → uint24`, `fromWord(uint24) → Inputs`, `packWord(uint24) → bytes` (3 byte LE), `pack(Inputs) → bytes`, `encodeState(uint8) → bytes` (1 byte), `firstByte(bytes) → uint8` (rỗng = 0), `isReleased(uint8) → bool`, `isCanonical(uint8) → bool`.
  - `library PolicyModel { function step(uint8 s, uint24 v) internal pure returns (uint8 next, uint8 out); }`, `contract MockPolicyCPU is ICPU` (step = PolicyModel), `contract BadPolicyCPU is ICPU` (step luôn trả state `0x02`).

- [ ] **Step 1: Viết `foundry.toml` và cài thư viện**

`contracts/foundry.toml`:

```toml
[profile.default]
src = "src"
test = "test"
script = "script"
out = "out"
libs = ["lib"]
solc_version = "0.8.24"
evm_version = "shanghai"
optimizer = true
optimizer_runs = 200
fs_permissions = [{ access = "read", path = "./circuits" }]
remappings = [
  "@openzeppelin/contracts/=lib/openzeppelin-contracts/contracts/",
  "forge-std/=lib/forge-std/src/",
]

[fuzz]
runs = 512

[invariant]
runs = 128
depth = 64
fail_on_revert = false

[rpc_endpoints]
xlayer = "https://rpc.xlayer.tech"
```

Run: `cd contracts && forge install foundry-rs/forge-std@v1.9.7 OpenZeppelin/openzeppelin-contracts@v5.0.2`
Expected: tạo `contracts/lib/forge-std`, `contracts/lib/openzeppelin-contracts` dưới dạng git submodule; `.gitmodules` ở gốc repo có hai mục với `path = contracts/lib/...`.

Run: `git status --short`
Expected: thấy `.gitmodules`, `contracts/foundry.toml`, `contracts/lib/forge-std`, `contracts/lib/openzeppelin-contracts` (và `contracts/foundry.lock` nếu Foundry tạo). Nếu `forge install` tự commit thì không sao; Step 6 vẫn commit phần còn lại.

- [ ] **Step 2: Viết test thất bại**

`contracts/test/PolicyModel.t.sol`:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {PolicyCodec} from "../src/PolicyCodec.sol";
import {PolicyModel, MockPolicyCPU, BadPolicyCPU} from "./mocks/PolicyModel.sol";

contract PolicyModelTest is Test {
    function _vectors()
        internal
        view
        returns (uint256[] memory s, uint256[] memory v, uint256[] memory n, uint256[] memory o)
    {
        string memory json = vm.readFile(string.concat(vm.projectRoot(), "/circuits/vectors.json"));
        s = vm.parseJsonUintArray(json, ".states");
        v = vm.parseJsonUintArray(json, ".inputs");
        n = vm.parseJsonUintArray(json, ".next");
        o = vm.parseJsonUintArray(json, ".out");
    }

    function test_modelMatchesCircuitVectors() public view {
        (uint256[] memory s, uint256[] memory v, uint256[] memory n, uint256[] memory o) = _vectors();
        assertEq(s.length, 512);
        for (uint256 i; i < s.length; ++i) {
            (uint8 next, uint8 out) = PolicyModel.step(uint8(s[i]), uint24(v[i]));
            assertEq(next, n[i], "next");
            assertEq(out, o[i], "out");
        }
    }

    function test_mockCpuSpeaksTheWireFormat() public {
        MockPolicyCPU cpu = new MockPolicyCPU();
        (uint256[] memory s, uint256[] memory v, uint256[] memory n, uint256[] memory o) = _vectors();
        for (uint256 i; i < 64; ++i) {
            (bytes memory ns, bytes memory out) =
                cpu.step(1, PolicyCodec.encodeState(uint8(s[i])), PolicyCodec.packWord(uint24(v[i])));
            assertEq(PolicyCodec.firstByte(ns), n[i]);
            assertEq(PolicyCodec.firstByte(out), o[i]);
        }
    }

    function testFuzz_wordRoundTrip(uint24 w) public pure {
        w &= 0x7fffff;
        assertEq(PolicyCodec.toWord(PolicyCodec.fromWord(w)), w);
    }

    function test_packIsLittleEndian() public pure {
        PolicyCodec.Inputs memory i = PolicyCodec.Inputs({
            idle: 15, threshold: 1, inhVotes: 0, recVotes: 0, k: 0, alive: true, windowDone: true
        });
        assertEq(PolicyCodec.pack(i), hex"1f0060");
    }

    function test_canonicalCodes() public pure {
        assertTrue(PolicyCodec.isCanonical(0));
        assertTrue(PolicyCodec.isCanonical(1));
        assertTrue(PolicyCodec.isCanonical(3));
        assertTrue(PolicyCodec.isCanonical(5));
        assertTrue(PolicyCodec.isCanonical(7));
        assertFalse(PolicyCodec.isCanonical(2));
        assertFalse(PolicyCodec.isCanonical(4));
        assertFalse(PolicyCodec.isCanonical(6));
        assertFalse(PolicyCodec.isCanonical(8));
        assertEq(PolicyCodec.firstByte(""), 0);
    }

    function test_badCpuReturnsNonCanonicalState() public {
        BadPolicyCPU bad = new BadPolicyCPU();
        (bytes memory ns,) = bad.step(1, hex"00", hex"000000");
        assertEq(PolicyCodec.firstByte(ns), 2);
    }
}
```

- [ ] **Step 3: Chạy test, xác nhận thất bại**

Run: `cd contracts && forge test --match-contract PolicyModelTest`
Expected: FAIL khi biên dịch, không tìm thấy `../src/PolicyCodec.sol`.

- [ ] **Step 4: Viết `ICPU.sol`, `PolicyCodec.sol`, `PolicyModel.sol`**

`contracts/src/interfaces/ICPU.sol`:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @title ICPU — permanent interface of a TapeOut processor (copied from the verified on-chain source)
/// @notice Pins and state are bit-packed little-endian.
interface ICPU {
    function eval(uint256 circuitId, bytes calldata inputs) external view returns (bytes memory outputs);

    function step(uint256 circuitId, bytes calldata state, bytes calldata inputs)
        external
        view
        returns (bytes memory newState, bytes memory outputs);

    function circuitInfo(uint256 circuitId)
        external
        view
        returns (uint32 nIn, uint32 nOut, uint32 nState, uint32 gateCount);

    function netlist(uint256 circuitId) external view returns (bytes memory);

    function transistors() external view returns (address);
}
```

`contracts/src/PolicyCodec.sol`:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @title PolicyCodec — wire format of AtropylePolicy v1 (spec §3.1–§3.5)
/// @notice State byte: bit0 = A, bit1 = R, bit2 = X. Inputs: 23 bits, little-endian, 3 bytes.
library PolicyCodec {
    uint8 internal constant ACTIVE = 0;
    uint8 internal constant GRACE = 1;
    uint8 internal constant RECOVERY = 3;
    uint8 internal constant RELEASED_INHERIT = 5;
    uint8 internal constant RELEASED_RECOVER = 7;

    uint8 internal constant OUT_ALARM = 1;
    uint8 internal constant OUT_CANCEL = 2;
    uint8 internal constant OUT_RELEASE = 4;

    struct Inputs {
        uint8 idle; // bits 0-3
        uint8 threshold; // bits 4-7
        uint8 inhVotes; // bits 8-12
        uint8 recVotes; // bits 13-17
        uint8 k; // bits 18-20
        bool alive; // bit 21
        bool windowDone; // bit 22
    }

    function toWord(Inputs memory i) internal pure returns (uint24 w) {
        w = uint24(i.idle & 0x0f) | (uint24(i.threshold & 0x0f) << 4) | (uint24(i.inhVotes & 0x1f) << 8)
            | (uint24(i.recVotes & 0x1f) << 13) | (uint24(i.k & 0x07) << 18);
        if (i.alive) w |= uint24(1) << 21;
        if (i.windowDone) w |= uint24(1) << 22;
    }

    function fromWord(uint24 w) internal pure returns (Inputs memory i) {
        i.idle = uint8(w & 0x0f);
        i.threshold = uint8((w >> 4) & 0x0f);
        i.inhVotes = uint8((w >> 8) & 0x1f);
        i.recVotes = uint8((w >> 13) & 0x1f);
        i.k = uint8((w >> 18) & 0x07);
        i.alive = ((w >> 21) & 1) == 1;
        i.windowDone = ((w >> 22) & 1) == 1;
    }

    function packWord(uint24 w) internal pure returns (bytes memory b) {
        b = new bytes(3);
        b[0] = bytes1(uint8(w));
        b[1] = bytes1(uint8(w >> 8));
        b[2] = bytes1(uint8(w >> 16));
    }

    function pack(Inputs memory i) internal pure returns (bytes memory) {
        return packWord(toWord(i));
    }

    function encodeState(uint8 s) internal pure returns (bytes memory b) {
        b = new bytes(1);
        b[0] = bytes1(s);
    }

    function firstByte(bytes memory b) internal pure returns (uint8) {
        return b.length == 0 ? 0 : uint8(b[0]);
    }

    function isReleased(uint8 s) internal pure returns (bool) {
        return (s & 4) != 0;
    }

    function isCanonical(uint8 s) internal pure returns (bool) {
        return s == ACTIVE || s == GRACE || s == RECOVERY || s == RELEASED_INHERIT || s == RELEASED_RECOVER;
    }
}
```

`contracts/test/mocks/PolicyModel.sol`:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ICPU} from "../../src/interfaces/ICPU.sol";
import {PolicyCodec} from "../../src/PolicyCodec.sol";

/// @notice Solidity copy of circuits/src/model.ts (spec §3.4–§3.5). Checked against circuit vectors.
library PolicyModel {
    uint8 internal constant C_ACTIVE = 0;
    uint8 internal constant C_GRACE = 1;
    uint8 internal constant C_RECOVERY = 2;
    uint8 internal constant C_RELEASED = 3;

    function cls(uint8 s) internal pure returns (uint8) {
        if ((s & 4) != 0) return C_RELEASED;
        if ((s & 1) == 0) return C_ACTIVE;
        return (s & 2) == 0 ? C_GRACE : C_RECOVERY;
    }

    function popcount5(uint8 x) internal pure returns (uint8 c) {
        for (uint8 i; i < 5; ++i) {
            c += (x >> i) & 1;
        }
    }

    function step(uint8 s, uint24 v) internal pure returns (uint8 next, uint8 out) {
        s &= 7;
        uint8 c = cls(s);
        if (c == C_RELEASED) return (s, 0);
        PolicyCodec.Inputs memory i = PolicyCodec.fromWord(v);
        bool inhQ = popcount5(i.inhVotes) >= i.k;
        bool recQ = i.k != 0 && popcount5(i.recVotes) >= i.k;
        bool late = i.idle >= i.threshold;
        bool maxed = i.idle == 15;
        if (i.alive) {
            next = PolicyCodec.ACTIVE;
        } else if (c == C_RECOVERY) {
            if (recQ && i.windowDone) next = PolicyCodec.RELEASED_RECOVER;
            else if (recQ) next = PolicyCodec.RECOVERY;
            else next = late ? PolicyCodec.GRACE : PolicyCodec.ACTIVE;
        } else if (c == C_GRACE) {
            if (recQ) next = PolicyCodec.RECOVERY;
            else next = (i.windowDone && (inhQ || maxed)) ? PolicyCodec.RELEASED_INHERIT : PolicyCodec.GRACE;
        } else {
            if (recQ) next = PolicyCodec.RECOVERY;
            else next = late ? PolicyCodec.GRACE : PolicyCodec.ACTIVE;
        }
        uint8 cn = cls(next);
        if ((cn == C_GRACE || cn == C_RECOVERY) && cn != c) out |= PolicyCodec.OUT_ALARM;
        if ((c == C_GRACE || c == C_RECOVERY) && next == PolicyCodec.ACTIVE) out |= PolicyCodec.OUT_CANCEL;
        if (cn == C_RELEASED) out |= PolicyCodec.OUT_RELEASE;
    }
}

abstract contract PolicyCPUBase is ICPU {
    function eval(uint256, bytes calldata) external pure returns (bytes memory) {
        revert("has latch: use step");
    }

    function circuitInfo(uint256) external pure returns (uint32, uint32, uint32, uint32) {
        return (23, 3, 3, 200);
    }

    function netlist(uint256) external pure returns (bytes memory) {
        return "";
    }

    function transistors() external pure returns (address) {
        return address(0);
    }
}

/// @notice Stand-in for the taped-out policy in unit tests.
contract MockPolicyCPU is PolicyCPUBase {
    function step(uint256, bytes calldata state, bytes calldata inputs)
        external
        pure
        returns (bytes memory newState, bytes memory outputs)
    {
        uint8 s = state.length == 0 ? 0 : uint8(state[0]);
        uint24 v;
        for (uint256 j; j < 3 && j < inputs.length; ++j) {
            v |= uint24(uint8(inputs[j])) << (8 * j);
        }
        (uint8 n, uint8 o) = PolicyModel.step(s, v & 0x7fffff);
        newState = PolicyCodec.encodeState(n);
        outputs = PolicyCodec.encodeState(o);
    }
}

/// @notice Returns the non-canonical state 010 so the vault's BadPolicyOutput guard can be tested.
contract BadPolicyCPU is PolicyCPUBase {
    function step(uint256, bytes calldata, bytes calldata) external pure returns (bytes memory, bytes memory) {
        return (hex"02", hex"00");
    }
}
```

- [ ] **Step 5: Chạy test**

Run: `cd contracts && forge test --match-contract PolicyModelTest -vv`
Expected: 6 test PASS.

- [ ] **Step 6: Commit**

```bash
git add .gitmodules contracts
git commit -m "feat(contracts): Foundry scaffold, PolicyCodec wire format and Solidity policy model" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

(`contracts/out`, `contracts/cache`, `contracts/broadcast` đã có trong `.gitignore`.)

---

### Task 7: `VaultConfig` — cấu hình và ràng buộc

**Files:**
- Create: `contracts/src/vault/VaultConfig.sol`, `contracts/test/mocks/Tokens.sol`
- Test: `contracts/test/VaultConfig.t.sol`

**Interfaces:**
- Consumes: OpenZeppelin ERC20/ERC721/ERC1155 (cho mock).
- Produces:
  - `abstract contract VaultConfig`: `enum Kind { ERC20, ERC721, ERC1155 }`; `struct Heir { address account; uint16 bps; }`; `struct Asset { Kind kind; address token; uint256 id; uint8 heir; }`; `struct Timing { uint32 period; uint8 threshold; uint32 window; }`; `struct Config { Heir[] heirs; address[] guardians; uint8 k; bool recoveryEnabled; Timing timing; Asset[] assets; }`.
  - Storage public: `owner`, `drill`, `k`, `recoveryEnabled`; internal `_timing`, `_heirs`, `_guardians`, `_assets`. Hằng `MAX_HEIRS 5`, `MAX_GUARDIANS 5`, `MAX_ASSETS 20`, `BPS 10_000`, `MIN_PERIOD 1 days`, `MIN_WINDOW 3 days`, `DRILL_MIN 60`, `MAX_THRESHOLD 15`.
  - Lỗi: `InvalidHeirs()`, `InvalidGuardians()`, `InvalidTiming()`, `InvalidAssets()`, `NotGuardian()`.
  - View: `heirs()`, `guardians()`, `assets()`, `timing()`.
  - Internal: `_setHeirs(Heir[] memory)`, `_setGuardians(address[] memory, uint8, bool)`, `_setTiming(Timing memory)`, `_setAssets(Asset[] memory)`, `_guardianIndex(address) → (uint256, bool)`, `_isGuardian(address) → bool`.
  - `Tokens.sol`: `MockERC20(name, symbol, decimals)` có `mint(to, amount)`; `MockERC721` có `mint(to, id)`; `MockERC1155` có `mint(to, id, amount)`.

- [ ] **Step 1: Viết mock token chuẩn**

`contracts/test/mocks/Tokens.sol`:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ERC1155} from "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";

contract MockERC20 is ERC20 {
    uint8 private immutable _dec;

    constructor(string memory name_, string memory symbol_, uint8 decimals_) ERC20(name_, symbol_) {
        _dec = decimals_;
    }

    function decimals() public view override returns (uint8) {
        return _dec;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

contract MockERC721 is ERC721 {
    constructor() ERC721("Mock NFT", "MNFT") {}

    function mint(address to, uint256 id) external {
        _mint(to, id);
    }
}

contract MockERC1155 is ERC1155 {
    constructor() ERC1155("") {}

    function mint(address to, uint256 id, uint256 amount) external {
        _mint(to, id, amount, "");
    }
}
```

- [ ] **Step 2: Viết test thất bại**

`contracts/test/VaultConfig.t.sol`:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {VaultConfig} from "../src/vault/VaultConfig.sol";
import {MockERC20, MockERC721, MockERC1155} from "./mocks/Tokens.sol";

contract ConfigHarness is VaultConfig {
    constructor(address owner_, bool drill_) {
        owner = owner_;
        drill = drill_;
    }

    function setHeirs(Heir[] memory h) external {
        _setHeirs(h);
    }

    function setGuardians(address[] memory g, uint8 k_, bool rec) external {
        _setGuardians(g, k_, rec);
    }

    function setTiming(Timing memory t) external {
        _setTiming(t);
    }

    function setAssets(Asset[] memory a) external {
        _setAssets(a);
    }
}

contract VaultConfigTest is Test {
    address internal owner = makeAddr("owner");
    address internal a = makeAddr("a");
    address internal b = makeAddr("b");
    address internal c = makeAddr("c");
    ConfigHarness internal h;
    MockERC20 internal token;
    MockERC721 internal nft;
    MockERC1155 internal multi;

    function setUp() public {
        h = new ConfigHarness(owner, false);
        token = new MockERC20("T", "T", 6);
        nft = new MockERC721();
        multi = new MockERC1155();
    }

    function _heirs2() internal view returns (VaultConfig.Heir[] memory r) {
        r = new VaultConfig.Heir[](2);
        r[0] = VaultConfig.Heir(a, 6000);
        r[1] = VaultConfig.Heir(b, 4000);
    }

    function _one(address x) internal pure returns (VaultConfig.Heir[] memory r) {
        r = new VaultConfig.Heir[](1);
        r[0] = VaultConfig.Heir(x, 10_000);
    }

    function _addrs(address x, address y, address z) internal pure returns (address[] memory r) {
        r = new address[](3);
        r[0] = x;
        r[1] = y;
        r[2] = z;
    }

    function _asset(VaultConfig.Kind kind, address t, uint256 id, uint8 heir)
        internal
        pure
        returns (VaultConfig.Asset[] memory r)
    {
        r = new VaultConfig.Asset[](1);
        r[0] = VaultConfig.Asset(kind, t, id, heir);
    }

    function test_acceptsValidHeirs() public {
        h.setHeirs(_heirs2());
        VaultConfig.Heir[] memory got = h.heirs();
        assertEq(got.length, 2);
        assertEq(got[1].account, b);
        assertEq(got[1].bps, 4000);
    }

    function test_rejectsBadHeirs() public {
        vm.expectRevert(VaultConfig.InvalidHeirs.selector);
        h.setHeirs(new VaultConfig.Heir[](0));

        VaultConfig.Heir[] memory x = _heirs2();
        x[1].bps = 3999;
        vm.expectRevert(VaultConfig.InvalidHeirs.selector);
        h.setHeirs(x);

        x = _heirs2();
        x[0].account = address(0);
        vm.expectRevert(VaultConfig.InvalidHeirs.selector);
        h.setHeirs(x);

        x = _heirs2();
        x[0].account = owner;
        vm.expectRevert(VaultConfig.InvalidHeirs.selector);
        h.setHeirs(x);

        x = _heirs2();
        x[1].account = a;
        vm.expectRevert(VaultConfig.InvalidHeirs.selector);
        h.setHeirs(x);

        x = _heirs2();
        x[0].bps = 0;
        x[1].bps = 10_000;
        vm.expectRevert(VaultConfig.InvalidHeirs.selector);
        h.setHeirs(x);

        x = new VaultConfig.Heir[](6);
        for (uint256 i; i < 6; ++i) {
            x[i] = VaultConfig.Heir(address(uint160(0x1000 + i)), i == 5 ? 5000 : 1000);
        }
        vm.expectRevert(VaultConfig.InvalidHeirs.selector);
        h.setHeirs(x);
    }

    function test_shrinkingHeirsBelowAnAssetIndexReverts() public {
        h.setHeirs(_heirs2());
        h.setAssets(_asset(VaultConfig.Kind.ERC721, address(nft), 1, 1));
        vm.expectRevert(VaultConfig.InvalidHeirs.selector);
        h.setHeirs(_one(a));
    }

    function test_acceptsGuardiansWhoAreAlsoHeirs() public {
        h.setHeirs(_heirs2());
        h.setGuardians(_addrs(a, b, c), 2, true);
        assertEq(h.k(), 2);
        assertTrue(h.recoveryEnabled());
        assertEq(h.guardians().length, 3);
        assertEq(h.guardians()[2], c);
    }

    function test_simpleTemplateAllowsNoGuardians() public {
        h.setGuardians(new address[](0), 0, false);
        assertEq(h.k(), 0);
        assertEq(h.guardians().length, 0);
    }

    function test_rejectsBadGuardians() public {
        address[] memory six = new address[](6);
        for (uint256 i; i < 6; ++i) {
            six[i] = address(uint160(0x2000 + i));
        }
        vm.expectRevert(VaultConfig.InvalidGuardians.selector);
        h.setGuardians(six, 1, false);

        vm.expectRevert(VaultConfig.InvalidGuardians.selector);
        h.setGuardians(_addrs(a, b, c), 4, false);

        vm.expectRevert(VaultConfig.InvalidGuardians.selector);
        h.setGuardians(_addrs(a, b, c), 0, true);

        vm.expectRevert(VaultConfig.InvalidGuardians.selector);
        h.setGuardians(_addrs(a, b, address(0)), 2, false);

        vm.expectRevert(VaultConfig.InvalidGuardians.selector);
        h.setGuardians(_addrs(a, b, owner), 2, false);

        vm.expectRevert(VaultConfig.InvalidGuardians.selector);
        h.setGuardians(_addrs(a, b, a), 2, false);
    }

    function test_timingLimits() public {
        h.setTiming(VaultConfig.Timing(1 days, 1, 3 days));
        h.setTiming(VaultConfig.Timing(1 days, 15, 3 days));
        assertEq(h.timing().threshold, 15);

        vm.expectRevert(VaultConfig.InvalidTiming.selector);
        h.setTiming(VaultConfig.Timing(1 days - 1, 3, 3 days));
        vm.expectRevert(VaultConfig.InvalidTiming.selector);
        h.setTiming(VaultConfig.Timing(1 days, 3, 3 days - 1));
        vm.expectRevert(VaultConfig.InvalidTiming.selector);
        h.setTiming(VaultConfig.Timing(1 days, 0, 3 days));
        vm.expectRevert(VaultConfig.InvalidTiming.selector);
        h.setTiming(VaultConfig.Timing(1 days, 16, 3 days));
    }

    function test_drillTimingLimits() public {
        ConfigHarness d = new ConfigHarness(owner, true);
        d.setTiming(VaultConfig.Timing(60, 2, 60));
        vm.expectRevert(VaultConfig.InvalidTiming.selector);
        d.setTiming(VaultConfig.Timing(59, 2, 60));
        vm.expectRevert(VaultConfig.InvalidTiming.selector);
        d.setTiming(VaultConfig.Timing(60, 2, 59));
    }

    function test_acceptsValidAssets() public {
        h.setHeirs(_heirs2());
        VaultConfig.Asset[] memory x = new VaultConfig.Asset[](3);
        x[0] = VaultConfig.Asset(VaultConfig.Kind.ERC20, address(token), 0, 0);
        x[1] = VaultConfig.Asset(VaultConfig.Kind.ERC721, address(nft), 1, 1);
        x[2] = VaultConfig.Asset(VaultConfig.Kind.ERC1155, address(multi), 7, 0);
        h.setAssets(x);
        assertEq(h.assets().length, 3);
        assertEq(uint8(h.assets()[1].kind), uint8(VaultConfig.Kind.ERC721));
    }

    function test_rejectsBadAssets() public {
        h.setHeirs(_heirs2());

        VaultConfig.Asset[] memory many = new VaultConfig.Asset[](21);
        for (uint256 i; i < 21; ++i) {
            many[i] = VaultConfig.Asset(VaultConfig.Kind.ERC721, address(nft), i, 0);
        }
        vm.expectRevert(VaultConfig.InvalidAssets.selector);
        h.setAssets(many);

        vm.expectRevert(VaultConfig.InvalidAssets.selector);
        h.setAssets(_asset(VaultConfig.Kind.ERC20, makeAddr("eoa"), 0, 0));

        vm.expectRevert(VaultConfig.InvalidAssets.selector);
        h.setAssets(_asset(VaultConfig.Kind.ERC721, address(nft), 1, 2));

        vm.expectRevert(VaultConfig.InvalidAssets.selector);
        h.setAssets(_asset(VaultConfig.Kind.ERC20, address(token), 1, 0));

        VaultConfig.Asset[] memory dup = new VaultConfig.Asset[](2);
        dup[0] = VaultConfig.Asset(VaultConfig.Kind.ERC721, address(nft), 1, 0);
        dup[1] = VaultConfig.Asset(VaultConfig.Kind.ERC721, address(nft), 1, 1);
        vm.expectRevert(VaultConfig.InvalidAssets.selector);
        h.setAssets(dup);
    }
}
```

- [ ] **Step 3: Chạy test, xác nhận thất bại**

Run: `cd contracts && forge test --match-contract VaultConfigTest`
Expected: FAIL khi biên dịch, không tìm thấy `../src/vault/VaultConfig.sol`.

- [ ] **Step 4: Viết `VaultConfig.sol`**

`contracts/src/vault/VaultConfig.sol`:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @title VaultConfig — validated configuration of an Atropyle vault (spec §4.1)
abstract contract VaultConfig {
    enum Kind {
        ERC20,
        ERC721,
        ERC1155
    }

    struct Heir {
        address account;
        uint16 bps;
    }

    /// @dev ERC-20 is split by bps; ERC-721/1155 go to heirs[heir]. ERC-20 entries must use id 0.
    struct Asset {
        Kind kind;
        address token;
        uint256 id;
        uint8 heir;
    }

    /// @dev period P in seconds, threshold T in periods, alarm window W in seconds.
    struct Timing {
        uint32 period;
        uint8 threshold;
        uint32 window;
    }

    struct Config {
        Heir[] heirs;
        address[] guardians;
        uint8 k;
        bool recoveryEnabled;
        Timing timing;
        Asset[] assets;
    }

    uint256 internal constant MAX_HEIRS = 5;
    uint256 internal constant MAX_GUARDIANS = 5;
    uint256 internal constant MAX_ASSETS = 20;
    uint256 internal constant BPS = 10_000;
    uint32 internal constant MIN_PERIOD = 1 days;
    uint32 internal constant MIN_WINDOW = 3 days;
    uint32 internal constant DRILL_MIN = 60;
    uint8 internal constant MAX_THRESHOLD = 15;

    address public owner;
    bool public drill;
    uint8 public k;
    bool public recoveryEnabled;
    Timing internal _timing;
    Heir[] internal _heirs;
    address[] internal _guardians;
    Asset[] internal _assets;

    error InvalidHeirs();
    error InvalidGuardians();
    error InvalidTiming();
    error InvalidAssets();
    error NotGuardian();

    function heirs() external view returns (Heir[] memory) {
        return _heirs;
    }

    function guardians() external view returns (address[] memory) {
        return _guardians;
    }

    function assets() external view returns (Asset[] memory) {
        return _assets;
    }

    function timing() external view returns (Timing memory) {
        return _timing;
    }

    function _setHeirs(Heir[] memory h) internal {
        uint256 n = h.length;
        if (n == 0 || n > MAX_HEIRS) revert InvalidHeirs();
        uint256 sum;
        for (uint256 i; i < n; ++i) {
            address acct = h[i].account;
            if (acct == address(0) || acct == owner || h[i].bps == 0) revert InvalidHeirs();
            for (uint256 j; j < i; ++j) {
                if (h[j].account == acct) revert InvalidHeirs();
            }
            sum += h[i].bps;
        }
        if (sum != BPS) revert InvalidHeirs();
        for (uint256 i; i < _assets.length; ++i) {
            if (_assets[i].heir >= n) revert InvalidHeirs();
        }
        delete _heirs;
        for (uint256 i; i < n; ++i) {
            _heirs.push(h[i]);
        }
    }

    function _setGuardians(address[] memory g, uint8 k_, bool rec) internal {
        uint256 n = g.length;
        if (n > MAX_GUARDIANS || k_ > n || (rec && k_ == 0)) revert InvalidGuardians();
        for (uint256 i; i < n; ++i) {
            if (g[i] == address(0) || g[i] == owner) revert InvalidGuardians();
            for (uint256 j; j < i; ++j) {
                if (g[j] == g[i]) revert InvalidGuardians();
            }
        }
        _guardians = g;
        k = k_;
        recoveryEnabled = rec;
    }

    function _setTiming(Timing memory t) internal {
        uint32 minPeriod = drill ? DRILL_MIN : MIN_PERIOD;
        uint32 minWindow = drill ? DRILL_MIN : MIN_WINDOW;
        if (t.period < minPeriod || t.window < minWindow || t.threshold == 0 || t.threshold > MAX_THRESHOLD) {
            revert InvalidTiming();
        }
        _timing = t;
    }

    function _setAssets(Asset[] memory a) internal {
        uint256 n = a.length;
        if (n > MAX_ASSETS) revert InvalidAssets();
        for (uint256 i; i < n; ++i) {
            Asset memory x = a[i];
            if (x.token.code.length == 0 || x.heir >= _heirs.length) revert InvalidAssets();
            if (x.kind == Kind.ERC20 && x.id != 0) revert InvalidAssets();
            for (uint256 j; j < i; ++j) {
                if (a[j].token == x.token && a[j].id == x.id) revert InvalidAssets();
            }
        }
        delete _assets;
        for (uint256 i; i < n; ++i) {
            _assets.push(a[i]);
        }
    }

    function _guardianIndex(address g) internal view returns (uint256, bool) {
        uint256 n = _guardians.length;
        for (uint256 i; i < n; ++i) {
            if (_guardians[i] == g) return (i, true);
        }
        return (0, false);
    }

    function _isGuardian(address g) internal view returns (bool found) {
        (, found) = _guardianIndex(g);
    }
}
```

- [ ] **Step 5: Chạy test**

Run: `cd contracts && forge test --match-contract VaultConfigTest -vv`
Expected: 10 test PASS.

- [ ] **Step 6: Commit**

```bash
git add contracts/src/vault/VaultConfig.sol contracts/test/mocks/Tokens.sol contracts/test/VaultConfig.t.sol
git commit -m "feat(contracts): VaultConfig with spec 4.1 constraints" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```


---

### Task 8: `VaultDistribution` — phân phối chịu lỗi

**Files:**
- Create: `contracts/src/vault/VaultDistribution.sol`
- Modify: `contracts/test/mocks/Tokens.sol` (thêm token "khó chịu" vào cuối file)
- Test: `contracts/test/VaultDistribution.t.sol`

**Interfaces:**
- Consumes: `VaultConfig` (Task 7), OZ `IERC20`, `IERC721`, `IERC1155`.
- Produces:
  - `abstract contract VaultDistribution is VaultConfig`: events `Distributed(uint256 indexed assetIndex, address indexed to, uint256 amountOrId)`, `TransferFailed(uint256 indexed assetIndex, address indexed to)`; `coverage() public view returns (uint256[] memory)` (ERC-20 = `min(balance, allowance)`, ERC-721 = 1/0, ERC-1155 = số dư đã approve); internal `_distribute(bool recover, address target)`, `_available20(token)`, `_can721(token, id)`, `_available1155(token, id)`.
  - Token mock thêm: `MockBlacklistERC20` (`setBlocked(addr, bool)`), `MockFeeERC20` (đốt 1% mỗi lần chuyển), `MockNoReturnERC20` (`transferFrom` không trả gì), `MockGarbageToken` (view trả 1e18, mọi hàm khác trả 1 byte), `NonReceiver` (contract rỗng), `ReentrantERC20` (`setTarget(addr)`, `attempted()`, `reentered()`; trong `transferFrom` thử gọi lại `distribute()`), `interface IDistribute`.

Quy tắc (spec §4.4): mỗi lần chuyển được bọc riêng; lỗi thì phát `TransferFailed` rồi chạy tiếp. Tài sản không còn ở ví chủ hoặc không được approve thì bỏ qua im lặng. Chia ERC-20 bằng `avail / 10000 * bps + (avail % 10000) * bps / 10000` để không tràn số, người cuối nhận phần dư.

- [ ] **Step 1: Thêm token "khó chịu" vào cuối `contracts/test/mocks/Tokens.sol`**

```solidity

interface IDistribute {
    function distribute() external returns (bool);
}

/// @notice Reverts any transfer from or to a blocked address (USDC/USDT-style blacklist).
contract MockBlacklistERC20 is MockERC20 {
    mapping(address => bool) public blocked;

    constructor() MockERC20("Black", "BLK", 6) {}

    function setBlocked(address account, bool on) external {
        blocked[account] = on;
    }

    function _update(address from, address to, uint256 value) internal override {
        require(!blocked[from] && !blocked[to], "blocked");
        super._update(from, to, value);
    }
}

/// @notice Burns 1% of every transfer.
contract MockFeeERC20 is MockERC20 {
    constructor() MockERC20("Fee", "FEE", 18) {}

    function _update(address from, address to, uint256 value) internal override {
        if (from == address(0) || to == address(0)) {
            super._update(from, to, value);
            return;
        }
        uint256 fee = value / 100;
        super._update(from, address(0), fee);
        super._update(from, to, value - fee);
    }
}

/// @notice Old-USDT style: transferFrom returns nothing.
contract MockNoReturnERC20 {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function approve(address spender, uint256 amount) external {
        allowance[msg.sender][spender] = amount;
    }

    function transferFrom(address from, address to, uint256 amount) external {
        require(balanceOf[from] >= amount && allowance[from][msg.sender] >= amount, "no");
        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
    }
}

/// @notice Views look healthy, every other call returns a single garbage byte.
contract MockGarbageToken {
    function balanceOf(address) external pure returns (uint256) {
        return 1e18;
    }

    function allowance(address, address) external pure returns (uint256) {
        return 1e18;
    }

    fallback() external {
        assembly {
            mstore(0, shl(248, 1))
            return(0, 1)
        }
    }
}

/// @notice A contract heir without onERC721Received.
contract NonReceiver {}

/// @notice Tries to re-enter the vault from inside transferFrom.
contract ReentrantERC20 is MockERC20 {
    address public target;
    bool public attempted;
    bool public reentered;

    constructor() MockERC20("Re", "RE", 18) {}

    function setTarget(address t) external {
        target = t;
    }

    function transferFrom(address from, address to, uint256 value) public override returns (bool) {
        if (target != address(0) && !attempted) {
            attempted = true;
            try IDistribute(target).distribute() {
                reentered = true;
            } catch {}
        }
        return super.transferFrom(from, to, value);
    }
}
```

- [ ] **Step 2: Viết test thất bại**

`contracts/test/VaultDistribution.t.sol`:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test, Vm} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {VaultConfig} from "../src/vault/VaultConfig.sol";
import {VaultDistribution} from "../src/vault/VaultDistribution.sol";
import {
    MockERC20,
    MockERC721,
    MockERC1155,
    MockBlacklistERC20,
    MockFeeERC20,
    MockNoReturnERC20,
    MockGarbageToken,
    NonReceiver
} from "./mocks/Tokens.sol";

contract DistributionHarness is VaultDistribution {
    constructor(address owner_) {
        owner = owner_;
    }

    function setHeirs(Heir[] memory h) external {
        _setHeirs(h);
    }

    function setAssets(Asset[] memory a) external {
        _setAssets(a);
    }

    function run(bool recover, address target) external {
        _distribute(recover, target);
    }
}

contract VaultDistributionTest is Test {
    address internal owner = makeAddr("owner");
    address internal heirA = makeAddr("heirA");
    address internal heirB = makeAddr("heirB");
    address internal target = makeAddr("target");
    DistributionHarness internal h;
    MockERC20 internal usdt;

    function setUp() public {
        h = new DistributionHarness(owner);
        usdt = new MockERC20("USDT", "USDT", 6);
        h.setHeirs(_heirs(heirA, 6000, heirB, 4000));
    }

    function _heirs(address x, uint16 bx, address y, uint16 by) internal pure returns (VaultConfig.Heir[] memory r) {
        r = new VaultConfig.Heir[](2);
        r[0] = VaultConfig.Heir(x, bx);
        r[1] = VaultConfig.Heir(y, by);
    }

    function _erc20(address token) internal pure returns (VaultConfig.Asset memory) {
        return VaultConfig.Asset(VaultConfig.Kind.ERC20, token, 0, 0);
    }

    function _only(VaultConfig.Asset memory a) internal pure returns (VaultConfig.Asset[] memory r) {
        r = new VaultConfig.Asset[](1);
        r[0] = a;
    }

    function _fund(MockERC20 t, uint256 balance, uint256 allowance) internal {
        t.mint(owner, balance);
        vm.prank(owner);
        t.approve(address(h), allowance);
    }

    function _countFailed() internal returns (uint256 n) {
        Vm.Log[] memory logs = vm.getRecordedLogs();
        for (uint256 i; i < logs.length; ++i) {
            if (logs[i].topics[0] == VaultDistribution.TransferFailed.selector) n++;
        }
    }

    function test_splitsByBpsWithRemainderToLastHeir() public {
        VaultConfig.Heir[] memory three = new VaultConfig.Heir[](3);
        three[0] = VaultConfig.Heir(heirA, 3333);
        three[1] = VaultConfig.Heir(heirB, 3333);
        three[2] = VaultConfig.Heir(target, 3334);
        h.setHeirs(three);
        h.setAssets(_only(_erc20(address(usdt))));
        _fund(usdt, 1001, type(uint256).max);
        h.run(false, address(0));
        assertEq(usdt.balanceOf(heirA), 333);
        assertEq(usdt.balanceOf(heirB), 333);
        assertEq(usdt.balanceOf(target), 335);
        assertEq(usdt.balanceOf(owner), 0);
    }

    function test_recoverySendsEverythingToTarget() public {
        MockERC721 nft = new MockERC721();
        MockERC1155 multi = new MockERC1155();
        VaultConfig.Asset[] memory a = new VaultConfig.Asset[](3);
        a[0] = _erc20(address(usdt));
        a[1] = VaultConfig.Asset(VaultConfig.Kind.ERC721, address(nft), 1, 0);
        a[2] = VaultConfig.Asset(VaultConfig.Kind.ERC1155, address(multi), 7, 1);
        h.setAssets(a);
        _fund(usdt, 1000e6, type(uint256).max);
        nft.mint(owner, 1);
        multi.mint(owner, 7, 5);
        vm.startPrank(owner);
        nft.approve(address(h), 1);
        multi.setApprovalForAll(address(h), true);
        vm.stopPrank();
        h.run(true, target);
        assertEq(usdt.balanceOf(target), 1000e6);
        assertEq(nft.ownerOf(1), target);
        assertEq(multi.balanceOf(target, 7), 5);
    }

    /// Review Focus #3
    function test_availableIsMinOfBalanceAndAllowance() public {
        h.setAssets(_only(_erc20(address(usdt))));
        _fund(usdt, 1000e6, 300e6);
        h.run(false, address(0));
        assertEq(usdt.balanceOf(heirA), 180e6);
        assertEq(usdt.balanceOf(heirB), 120e6);

        vm.prank(owner);
        usdt.approve(address(h), 0);
        vm.recordLogs();
        h.run(false, address(0));
        assertEq(vm.getRecordedLogs().length, 0);
        assertEq(usdt.balanceOf(owner), 700e6);

        vm.prank(owner);
        usdt.approve(address(h), 100e6);
        h.run(false, address(0));
        assertEq(usdt.balanceOf(heirA), 240e6);
        assertEq(usdt.balanceOf(heirB), 160e6);
    }

    function test_tokenWithoutReturnValue() public {
        MockNoReturnERC20 t = new MockNoReturnERC20();
        h.setAssets(_only(_erc20(address(t))));
        t.mint(owner, 100);
        vm.prank(owner);
        t.approve(address(h), 100);
        vm.expectEmit(address(h));
        emit VaultDistribution.Distributed(0, heirA, 60);
        h.run(false, address(0));
        assertEq(t.balanceOf(heirA), 60);
        assertEq(t.balanceOf(heirB), 40);
    }

    function test_feeOnTransferToken() public {
        MockFeeERC20 t = new MockFeeERC20();
        h.setAssets(_only(_erc20(address(t))));
        t.mint(owner, 1000);
        vm.prank(owner);
        t.approve(address(h), type(uint256).max);
        h.run(false, address(0));
        assertEq(t.balanceOf(heirA), 594);
        assertEq(t.balanceOf(heirB), 396);
        assertEq(t.balanceOf(owner), 0);
    }

    /// Review Focus #4
    function test_blacklistedHeirDoesNotBlockOthers() public {
        MockBlacklistERC20 t = new MockBlacklistERC20();
        h.setAssets(_only(_erc20(address(t))));
        t.mint(owner, 1000);
        vm.prank(owner);
        t.approve(address(h), type(uint256).max);
        t.setBlocked(heirB, true);

        vm.expectEmit(address(h));
        emit VaultDistribution.Distributed(0, heirA, 600);
        vm.expectEmit(address(h));
        emit VaultDistribution.TransferFailed(0, heirB);
        h.run(false, address(0));
        assertEq(t.balanceOf(heirA), 600);
        assertEq(t.balanceOf(owner), 400);

        h.run(false, address(0)); // the next sweep re-splits what is left
        assertEq(t.balanceOf(heirA), 840);
        assertEq(t.balanceOf(owner), 160);
    }

    /// Review Focus #4
    function test_contractHeirWithoutReceiver() public {
        NonReceiver bad = new NonReceiver();
        h.setHeirs(_heirs(address(bad), 6000, heirB, 4000));
        MockERC721 nft = new MockERC721();
        VaultConfig.Asset[] memory a = new VaultConfig.Asset[](2);
        a[0] = VaultConfig.Asset(VaultConfig.Kind.ERC721, address(nft), 1, 0);
        a[1] = _erc20(address(usdt));
        h.setAssets(a);
        nft.mint(owner, 1);
        vm.prank(owner);
        nft.setApprovalForAll(address(h), true);
        _fund(usdt, 100, 100);

        vm.expectEmit(address(h));
        emit VaultDistribution.TransferFailed(0, address(bad));
        h.run(false, address(0));
        assertEq(nft.ownerOf(1), owner);
        assertEq(usdt.balanceOf(address(bad)), 60);
        assertEq(usdt.balanceOf(heirB), 40);
    }

    function test_nftSoldBeforehandIsSkippedSilently() public {
        MockERC721 nft = new MockERC721();
        h.setAssets(_only(VaultConfig.Asset(VaultConfig.Kind.ERC721, address(nft), 1, 0)));
        nft.mint(owner, 1);
        vm.startPrank(owner);
        nft.setApprovalForAll(address(h), true);
        nft.transferFrom(owner, target, 1);
        vm.stopPrank();
        assertEq(h.coverage()[0], 0);
        vm.recordLogs();
        h.run(false, address(0));
        assertEq(vm.getRecordedLogs().length, 0);
    }

    function test_garbageTokenNeverReverts() public {
        MockGarbageToken g = new MockGarbageToken();
        h.setAssets(_only(_erc20(address(g))));
        vm.recordLogs();
        h.run(false, address(0));
        assertEq(_countFailed(), 2);
    }

    function test_shortViewReturnCountsAsZero() public {
        h.setAssets(_only(_erc20(address(usdt))));
        _fund(usdt, 100, 100);
        vm.mockCall(address(usdt), abi.encodeWithSelector(IERC20.balanceOf.selector), hex"01");
        assertEq(h.coverage()[0], 0);
        vm.recordLogs();
        h.run(false, address(0));
        assertEq(vm.getRecordedLogs().length, 0);
    }

    function test_coverage() public {
        MockERC721 nft = new MockERC721();
        MockERC1155 multi = new MockERC1155();
        VaultConfig.Asset[] memory a = new VaultConfig.Asset[](3);
        a[0] = _erc20(address(usdt));
        a[1] = VaultConfig.Asset(VaultConfig.Kind.ERC721, address(nft), 1, 0);
        a[2] = VaultConfig.Asset(VaultConfig.Kind.ERC1155, address(multi), 7, 1);
        h.setAssets(a);
        _fund(usdt, 500, 200);
        nft.mint(owner, 1);
        multi.mint(owner, 7, 5);

        uint256[] memory c = h.coverage();
        assertEq(c[0], 200);
        assertEq(c[1], 0);
        assertEq(c[2], 0);

        vm.startPrank(owner);
        nft.approve(address(h), 1);
        multi.setApprovalForAll(address(h), true);
        vm.stopPrank();
        c = h.coverage();
        assertEq(c[1], 1);
        assertEq(c[2], 5);
    }

    function test_worstCaseGasUnderSixMillion() public {
        VaultConfig.Heir[] memory five = new VaultConfig.Heir[](5);
        for (uint256 i; i < 5; ++i) {
            five[i] = VaultConfig.Heir(address(uint160(0xA000 + i)), 2000);
        }
        h.setHeirs(five);
        VaultConfig.Asset[] memory a = new VaultConfig.Asset[](20);
        for (uint256 i; i < 20; ++i) {
            MockERC20 t = new MockERC20("T", "T", 18);
            t.mint(owner, 1e24);
            vm.prank(owner);
            t.approve(address(h), type(uint256).max);
            a[i] = _erc20(address(t));
        }
        h.setAssets(a);
        uint256 before = gasleft();
        h.run(false, address(0));
        uint256 used = before - gasleft();
        emit log_named_uint("distribute gas (20 assets x 5 heirs)", used);
        assertLt(used, 6_000_000);
    }
}
```

- [ ] **Step 3: Chạy test, xác nhận thất bại**

Run: `cd contracts && forge test --match-contract VaultDistributionTest`
Expected: FAIL khi biên dịch, không tìm thấy `../src/vault/VaultDistribution.sol`.

- [ ] **Step 4: Viết `VaultDistribution.sol`**

`contracts/src/vault/VaultDistribution.sol`:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {IERC1155} from "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import {VaultConfig} from "./VaultConfig.sol";

/// @title VaultDistribution — pulls released assets from the owner's wallet (spec §4.4)
/// @dev Every transfer is isolated: a failing token or recipient emits TransferFailed and the sweep goes on.
///      Assets no longer held or no longer approved are skipped silently.
abstract contract VaultDistribution is VaultConfig {
    event Distributed(uint256 indexed assetIndex, address indexed to, uint256 amountOrId);
    event TransferFailed(uint256 indexed assetIndex, address indexed to);

    /// @notice What the vault could move right now, per asset: ERC-20 min(balance, allowance),
    ///         ERC-721 1 or 0, ERC-1155 the approved balance.
    function coverage() public view returns (uint256[] memory c) {
        uint256 n = _assets.length;
        c = new uint256[](n);
        for (uint256 i; i < n; ++i) {
            Asset memory a = _assets[i];
            if (a.kind == Kind.ERC20) c[i] = _available20(a.token);
            else if (a.kind == Kind.ERC721) c[i] = _can721(a.token, a.id) ? 1 : 0;
            else c[i] = _available1155(a.token, a.id);
        }
    }

    function _distribute(bool recover, address target) internal {
        uint256 n = _assets.length;
        for (uint256 i; i < n; ++i) {
            Asset memory a = _assets[i];
            if (a.kind == Kind.ERC20) {
                if (recover) _send20(i, a.token, target, _available20(a.token));
                else _split20(i, a.token);
            } else {
                address to = recover ? target : _heirs[a.heir].account;
                if (a.kind == Kind.ERC721) _send721(i, a.token, a.id, to);
                else _send1155(i, a.token, a.id, to);
            }
        }
    }

    function _split20(uint256 i, address token) private {
        uint256 avail = _available20(token);
        if (avail == 0) return;
        uint256 n = _heirs.length;
        uint256 sent;
        for (uint256 h; h < n; ++h) {
            Heir memory heir = _heirs[h];
            uint256 amt = h + 1 == n ? avail - sent : (avail / BPS) * heir.bps + ((avail % BPS) * heir.bps) / BPS;
            sent += amt;
            _send20(i, token, heir.account, amt);
        }
    }

    function _send20(uint256 i, address token, address to, uint256 amt) private {
        if (amt == 0) return;
        if (token.code.length == 0) {
            emit TransferFailed(i, to);
            return;
        }
        (bool ok, bytes memory r) = token.call(abi.encodeCall(IERC20.transferFrom, (owner, to, amt)));
        if (ok && (r.length == 0 || (r.length >= 32 && abi.decode(r, (uint256)) == 1))) {
            emit Distributed(i, to, amt);
        } else {
            emit TransferFailed(i, to);
        }
    }

    function _send721(uint256 i, address token, uint256 id, address to) private {
        if (!_can721(token, id)) return;
        try IERC721(token).safeTransferFrom(owner, to, id) {
            emit Distributed(i, to, id);
        } catch {
            emit TransferFailed(i, to);
        }
    }

    function _send1155(uint256 i, address token, uint256 id, address to) private {
        uint256 bal = _available1155(token, id);
        if (bal == 0) return;
        try IERC1155(token).safeTransferFrom(owner, to, id, bal, "") {
            emit Distributed(i, to, bal);
        } catch {
            emit TransferFailed(i, to);
        }
    }

    function _available20(address token) internal view returns (uint256) {
        uint256 bal = _viewWord(token, abi.encodeCall(IERC20.balanceOf, (owner)));
        uint256 allowed = _viewWord(token, abi.encodeCall(IERC20.allowance, (owner, address(this))));
        return bal < allowed ? bal : allowed;
    }

    function _can721(address token, uint256 id) internal view returns (bool) {
        if (_viewWord(token, abi.encodeCall(IERC721.ownerOf, (id))) != uint256(uint160(owner))) return false;
        return _viewWord(token, abi.encodeCall(IERC721.getApproved, (id))) == uint256(uint160(address(this)))
            || _viewWord(token, abi.encodeCall(IERC721.isApprovedForAll, (owner, address(this)))) == 1;
    }

    function _available1155(address token, uint256 id) internal view returns (uint256) {
        if (_viewWord(token, abi.encodeCall(IERC1155.isApprovedForAll, (owner, address(this)))) != 1) return 0;
        return _viewWord(token, abi.encodeCall(IERC1155.balanceOf, (owner, id)));
    }

    /// @dev First return word of a static call; 0 when the call fails or returns fewer than 32 bytes.
    function _viewWord(address token, bytes memory data) private view returns (uint256 v) {
        (bool ok, bytes memory r) = token.staticcall(data);
        if (ok && r.length >= 32) v = abi.decode(r, (uint256));
    }
}
```

- [ ] **Step 5: Chạy test**

Run: `cd contracts && forge test --match-contract "VaultDistributionTest|VaultConfigTest" -vv`
Expected: 12 test `VaultDistributionTest` PASS, 10 test `VaultConfigTest` vẫn PASS. Ghi lại giá trị `distribute gas (20 assets x 5 heirs)` để dùng ở Task 13.

- [ ] **Step 6: Commit**

```bash
git add contracts/src/vault/VaultDistribution.sol contracts/test/mocks/Tokens.sol contracts/test/VaultDistribution.t.sol
git commit -m "feat(contracts): fault-isolated asset distribution" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```


---

### Task 9: `AtropyleVault` — vòng đời thừa kế và khôi phục

**Files:**
- Create: `contracts/src/interfaces/IVaultIndex.sol`, `contracts/src/AtropyleVault.sol`, `contracts/test/utils/VaultFixture.sol`
- Test: `contracts/test/AtropyleVault.t.sol`

**Interfaces:**
- Consumes: `ICPU`, `PolicyCodec` (Task 6), `VaultConfig` (Task 7), `VaultDistribution` (Task 8), `MockPolicyCPU`/`BadPolicyCPU`, token mock, OZ `Clones`.
- Produces:
  - `interface IVaultIndex { function index(address account) external; }`
  - `contract AtropyleVault is VaultDistribution`:
    - `DRILL_LIFETIME = 7 days`; storage public `factory`, `cpu` (ICPU), `policyId`, `expiresAt`, `state`, `lastAlive`, `alarmAt`, `releasedAt`, `inhVotes`, `recoveryTarget`, `recVote(address) → address`.
    - `initialize(address owner_, bool drill_, Config calldata cfg, address cpu_, uint256 policyId_)` (`factory = msg.sender`; index owner, heirs, guardians).
    - Owner: `checkIn()`, `setHeirs(Heir[])`, `setGuardians(address[], uint8 k_, bool rec)`, `setTiming(Timing)`, `setAssets(Asset[])`.
    - Guardian: `attestDeath(bool on)`, `voteRecovery(address target)` (`address(0)` = rút phiếu).
    - Ai cũng gọi được: `poke()`, `distribute() returns (bool released)`.
    - View: `status() returns (Status)` với `struct Status { uint8 state; uint8 pending; uint8 idle; uint64 lastAlive; uint64 lateAt; uint64 alarmAt; uint64 windowEndsAt; uint64 releasedAt; uint64 expiresAt; uint8 inhVotes; address recoveryTarget; address[] recVotes; uint256[] coverage; }`.
    - Events: `Alive(uint64 at)`, `ConfigUpdated(uint8 what)` (1 heirs, 2 guardians, 3 timing, 4 assets), `Attested(address indexed guardian, bool on)`, `RecoveryVoted(address indexed guardian, address indexed target)`, `AlarmRaised(uint8 state, address target)`, `AlarmCancelled(bool byOwner)`, `Released(uint8 state, address target)`, `StateChanged(uint8 from, uint8 to)`.
    - Errors: `AlreadyInitialized()`, `NotOwner()`, `AlreadyReleased()`, `DrillExpired()`, `Reentrancy()`, `RecoveryDisabled()`, `InvalidTarget()`, `BadPolicyOutput(uint8 state)`.
  - `abstract contract VaultFixture is Test` (dùng lại ở Task 10, 11): biến `cpu` (MockPolicyCPU), `impl`, `usdt` (6 dec, owner có 1000e6), `nft` (owner có id 1), `multi` (owner có id 7 × 5), `owner`, `heirA`, `heirB`, `g1`, `g2`, `g3`, `newWallet`, `stranger`; hằng `P = 1 days`, `T = 3`, `W = 3 days`; hàm `index(address) external {}` (fixture đóng vai factory), `_heirs()`, `_guardians()`, `_assets()`, `_cfg()` (heirs A 6000/B 4000, guardians g1–g3, k 2, recovery bật, assets [usdt → chia, nft#1 → heirA, multi#7 → heirB]), `_drillCfg()` (guardians [g1], k 0, recovery tắt, timing 60/2/120), `_deploy(cfg, drill)`, `_deployOn(cpu_, cfg, drill)`, `_approveAll(vault)`.

Thứ tự trong `_advance` theo spec §4.3: `candidate = (state == RECOVERY) ? recoveryTarget : candidateArg` → `step` → `alarm` (đặt `alarmAt = now`; `recoveryTarget = candidate` nếu `s' = 011`, ngược lại 0) → `cancel` (xoá `alarmAt`, `recoveryTarget`) → `release` (đặt `releasedAt`) → gán `state`. Mọi hàm của owner gọi `_ownerAlive()` **trước** khi đổi cấu hình, nên phiếu của giám hộ cũ bị xoá trước khi danh sách bị thay.

- [ ] **Step 1: Viết `IVaultIndex.sol` và fixture**

`contracts/src/interfaces/IVaultIndex.sol`:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @notice Role index kept by the factory; only vaults it created may call it.
interface IVaultIndex {
    function index(address account) external;
}
```

`contracts/test/utils/VaultFixture.sol`:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";
import {AtropyleVault} from "../../src/AtropyleVault.sol";
import {VaultConfig} from "../../src/vault/VaultConfig.sol";
import {MockPolicyCPU} from "../mocks/PolicyModel.sol";
import {MockERC20, MockERC721, MockERC1155} from "../mocks/Tokens.sol";

/// @notice Shared setup. The test contract itself plays the factory (see index()).
abstract contract VaultFixture is Test {
    uint32 internal constant P = 1 days;
    uint8 internal constant T = 3;
    uint32 internal constant W = 3 days;

    MockPolicyCPU internal cpu;
    AtropyleVault internal impl;
    MockERC20 internal usdt;
    MockERC721 internal nft;
    MockERC1155 internal multi;

    address internal owner = makeAddr("owner");
    address internal heirA = makeAddr("heirA");
    address internal heirB = makeAddr("heirB");
    address internal g1 = makeAddr("g1");
    address internal g2 = makeAddr("g2");
    address internal g3 = makeAddr("g3");
    address internal newWallet = makeAddr("newWallet");
    address internal stranger = makeAddr("stranger");

    function setUp() public virtual {
        vm.warp(1_700_000_000);
        cpu = new MockPolicyCPU();
        impl = new AtropyleVault();
        usdt = new MockERC20("Tether", "USDT", 6);
        nft = new MockERC721();
        multi = new MockERC1155();
        usdt.mint(owner, 1000e6);
        nft.mint(owner, 1);
        multi.mint(owner, 7, 5);
    }

    /// @dev Vaults created by this fixture call back here as if this were the factory.
    function index(address) external {}

    function _heirs() internal view returns (VaultConfig.Heir[] memory h) {
        h = new VaultConfig.Heir[](2);
        h[0] = VaultConfig.Heir(heirA, 6000);
        h[1] = VaultConfig.Heir(heirB, 4000);
    }

    function _guardians() internal view returns (address[] memory g) {
        g = new address[](3);
        g[0] = g1;
        g[1] = g2;
        g[2] = g3;
    }

    function _assets() internal view returns (VaultConfig.Asset[] memory a) {
        a = new VaultConfig.Asset[](3);
        a[0] = VaultConfig.Asset(VaultConfig.Kind.ERC20, address(usdt), 0, 0);
        a[1] = VaultConfig.Asset(VaultConfig.Kind.ERC721, address(nft), 1, 0);
        a[2] = VaultConfig.Asset(VaultConfig.Kind.ERC1155, address(multi), 7, 1);
    }

    function _cfg() internal view returns (VaultConfig.Config memory c) {
        c.heirs = _heirs();
        c.guardians = _guardians();
        c.k = 2;
        c.recoveryEnabled = true;
        c.timing = VaultConfig.Timing(P, T, W);
        c.assets = _assets();
    }

    function _drillCfg() internal view returns (VaultConfig.Config memory c) {
        c = _cfg();
        c.guardians = new address[](1);
        c.guardians[0] = g1;
        c.k = 0;
        c.recoveryEnabled = false;
        c.timing = VaultConfig.Timing(60, 2, 120);
    }

    function _deploy(VaultConfig.Config memory c, bool drill) internal returns (AtropyleVault) {
        return _deployOn(address(cpu), c, drill);
    }

    function _deployOn(address cpu_, VaultConfig.Config memory c, bool drill) internal returns (AtropyleVault v) {
        v = AtropyleVault(Clones.clone(address(impl)));
        v.initialize(owner, drill, c, cpu_, 1);
    }

    function _approveAll(AtropyleVault v) internal {
        vm.startPrank(owner);
        usdt.approve(address(v), type(uint256).max);
        nft.approve(address(v), 1);
        multi.setApprovalForAll(address(v), true);
        vm.stopPrank();
    }
}
```

- [ ] **Step 2: Viết test thất bại**

`contracts/test/AtropyleVault.t.sol`:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {AtropyleVault} from "../src/AtropyleVault.sol";
import {PolicyCodec} from "../src/PolicyCodec.sol";
import {VaultConfig} from "../src/vault/VaultConfig.sol";
import {BadPolicyCPU} from "./mocks/PolicyModel.sol";
import {ReentrantERC20} from "./mocks/Tokens.sol";
import {VaultFixture} from "./utils/VaultFixture.sol";

contract AtropyleVaultTest is VaultFixture {
    AtropyleVault internal v;

    function setUp() public override {
        super.setUp();
        v = _deploy(_cfg(), false);
        _approveAll(v);
    }

    function _toGrace() internal {
        vm.warp(block.timestamp + uint256(T) * P);
        v.poke();
        assertEq(v.state(), PolicyCodec.GRACE);
    }

    function _attestTwo() internal {
        vm.prank(g1);
        v.attestDeath(true);
        vm.prank(g2);
        v.attestDeath(true);
    }

    function _toRecovery() internal {
        vm.prank(g1);
        v.voteRecovery(newWallet);
        vm.prank(g2);
        v.voteRecovery(newWallet);
        assertEq(v.state(), PolicyCodec.RECOVERY);
    }

    function test_initialState() public view {
        assertEq(v.owner(), owner);
        assertEq(v.factory(), address(this));
        assertEq(address(v.cpu()), address(cpu));
        assertEq(v.policyId(), 1);
        assertEq(v.state(), PolicyCodec.ACTIVE);
        assertEq(v.lastAlive(), block.timestamp);
        assertEq(v.heirs().length, 2);
        assertEq(v.guardians().length, 3);
        assertEq(v.k(), 2);
        assertFalse(v.drill());
        assertEq(v.expiresAt(), 0);
    }

    function test_cannotReinitialize() public {
        vm.expectRevert(AtropyleVault.AlreadyInitialized.selector);
        v.initialize(stranger, false, _cfg(), address(cpu), 1);
        vm.expectRevert(AtropyleVault.AlreadyInitialized.selector);
        impl.initialize(stranger, false, _cfg(), address(cpu), 1);
    }

    function test_graceStartsExactlyAtThreshold() public {
        vm.warp(block.timestamp + uint256(T) * P - 1);
        v.poke();
        assertEq(v.state(), PolicyCodec.ACTIVE);
        vm.warp(block.timestamp + 1);
        vm.expectEmit(address(v));
        emit AtropyleVault.AlarmRaised(PolicyCodec.GRACE, address(0));
        v.poke();
        assertEq(v.state(), PolicyCodec.GRACE);
        assertEq(v.alarmAt(), block.timestamp);
    }

    function test_inheritanceWithGuardianQuorum() public {
        _toGrace();
        _attestTwo();
        assertEq(v.inhVotes(), 0b011);
        assertEq(v.state(), PolicyCodec.GRACE);
        vm.warp(block.timestamp + W - 1);
        assertFalse(v.distribute());
        vm.warp(block.timestamp + 1);
        assertTrue(v.distribute());
        assertEq(v.state(), PolicyCodec.RELEASED_INHERIT);
        assertEq(v.releasedAt(), block.timestamp);
        assertEq(usdt.balanceOf(heirA), 600e6);
        assertEq(usdt.balanceOf(heirB), 400e6);
        assertEq(nft.ownerOf(1), heirA);
        assertEq(multi.balanceOf(heirB, 7), 5);
    }

    function test_fallbackAfterFifteenPeriodsWithoutGuardians() public {
        _toGrace();
        vm.warp(block.timestamp + W); // window over, idle 6, nobody attested
        assertFalse(v.distribute());
        assertEq(v.state(), PolicyCodec.GRACE);
        vm.warp(uint256(v.lastAlive()) + 15 * uint256(P)); // idle maxed
        assertTrue(v.distribute());
        assertEq(v.state(), PolicyCodec.RELEASED_INHERIT);
        assertEq(usdt.balanceOf(heirA), 600e6);
    }

    function test_simpleTemplateNeedsNoGuardians() public {
        VaultConfig.Config memory c = _cfg();
        c.guardians = new address[](0);
        c.k = 0;
        c.recoveryEnabled = false;
        AtropyleVault s = _deploy(c, false);
        _approveAll(s);
        vm.warp(block.timestamp + uint256(T) * P);
        s.poke();
        vm.warp(block.timestamp + W);
        assertTrue(s.distribute());
        assertEq(usdt.balanceOf(heirA), 600e6);
    }

    function test_checkInCancelsAlarm() public {
        _toGrace();
        vm.expectEmit(address(v));
        emit AtropyleVault.AlarmCancelled(true);
        vm.prank(owner);
        v.checkIn();
        assertEq(v.state(), PolicyCodec.ACTIVE);
        assertEq(v.alarmAt(), 0);
        assertEq(v.lastAlive(), block.timestamp);
    }

    /// Review Focus #1
    function test_lateCheckInBeatsUnclaimedRelease() public {
        _toGrace();
        _attestTwo();
        vm.warp(block.timestamp + W + 1 days); // release is possible, nobody claimed it yet
        vm.prank(owner);
        v.checkIn();
        assertEq(v.state(), PolicyCodec.ACTIVE);
        assertEq(v.inhVotes(), 0);
        assertFalse(v.distribute());
        assertEq(usdt.balanceOf(owner), 1000e6);
    }

    function test_recoveryHappyPath() public {
        vm.prank(g1);
        v.voteRecovery(newWallet);
        assertEq(v.state(), PolicyCodec.ACTIVE);
        vm.expectEmit(address(v));
        emit AtropyleVault.AlarmRaised(PolicyCodec.RECOVERY, newWallet);
        vm.prank(g2);
        v.voteRecovery(newWallet);
        assertEq(v.state(), PolicyCodec.RECOVERY);
        assertEq(v.recoveryTarget(), newWallet);
        vm.warp(block.timestamp + W);
        assertTrue(v.distribute());
        assertEq(v.state(), PolicyCodec.RELEASED_RECOVER);
        assertEq(usdt.balanceOf(newWallet), 1000e6);
        assertEq(nft.ownerOf(1), newWallet);
        assertEq(multi.balanceOf(newWallet, 7), 5);
    }

    function test_ownerVetoesRecovery() public {
        _toRecovery();
        vm.prank(owner);
        v.checkIn();
        assertEq(v.state(), PolicyCodec.ACTIVE);
        assertEq(v.recoveryTarget(), address(0));
        assertEq(v.recVote(g1), address(0));
        assertEq(v.recVote(g2), address(0));
    }

    function test_splitVotesDoNotReachQuorum() public {
        vm.prank(g1);
        v.voteRecovery(newWallet);
        vm.prank(g2);
        v.voteRecovery(stranger);
        assertEq(v.state(), PolicyCodec.ACTIVE);
    }

    function test_losingQuorumCancels() public {
        _toRecovery();
        vm.expectEmit(address(v));
        emit AtropyleVault.AlarmCancelled(false);
        vm.prank(g2);
        v.voteRecovery(address(0));
        assertEq(v.state(), PolicyCodec.ACTIVE);
        assertEq(v.recoveryTarget(), address(0));
    }

    function test_losingQuorumWhileLateFallsBackToGrace() public {
        vm.warp(block.timestamp + P);
        _toRecovery(); // alarm at +1 day
        vm.warp(block.timestamp + 2 * uint256(P)); // +3 days: late, window still open
        vm.prank(g2);
        v.voteRecovery(address(0));
        assertEq(v.state(), PolicyCodec.GRACE);
        assertEq(v.recoveryTarget(), address(0));
        assertEq(v.alarmAt(), block.timestamp);
    }

    function test_recoveryRules() public {
        VaultConfig.Config memory c = _cfg();
        c.recoveryEnabled = false;
        AtropyleVault off = _deploy(c, false);

        vm.expectRevert(AtropyleVault.RecoveryDisabled.selector);
        vm.prank(g1);
        off.voteRecovery(newWallet);

        vm.expectRevert(VaultConfig.NotGuardian.selector);
        vm.prank(stranger);
        v.voteRecovery(newWallet);

        vm.expectRevert(AtropyleVault.InvalidTarget.selector);
        vm.prank(g1);
        v.voteRecovery(owner);

        vm.expectRevert(AtropyleVault.InvalidTarget.selector);
        vm.prank(g1);
        v.voteRecovery(g3);

        vm.expectRevert(AtropyleVault.InvalidTarget.selector);
        vm.prank(g1);
        v.voteRecovery(address(v));
    }

    /// Review Focus #2
    function test_replacingGuardiansClearsStaleVotes() public {
        vm.prank(g1);
        v.voteRecovery(newWallet);

        address[] memory two = new address[](2);
        two[0] = g2;
        two[1] = g3;
        vm.prank(owner);
        v.setGuardians(two, 2, true);
        assertEq(v.recVote(g1), address(0));

        vm.prank(owner);
        v.setGuardians(_guardians(), 2, true); // g1 is back
        vm.prank(g2);
        v.voteRecovery(newWallet); // g1's old vote must not count
        assertEq(v.state(), PolicyCodec.ACTIVE);
        assertEq(v.recoveryTarget(), address(0));
    }

    function test_onlyRolesCanAct() public {
        vm.expectRevert(AtropyleVault.NotOwner.selector);
        vm.prank(stranger);
        v.checkIn();

        VaultConfig.Heir[] memory h = _heirs();
        vm.expectRevert(AtropyleVault.NotOwner.selector);
        vm.prank(heirA);
        v.setHeirs(h);

        vm.expectRevert(VaultConfig.NotGuardian.selector);
        vm.prank(heirA);
        v.attestDeath(true);
    }

    function test_releasedIsFinalButSweepsAgain() public {
        _toGrace();
        _attestTwo();
        vm.warp(block.timestamp + W);
        assertTrue(v.distribute());

        vm.expectRevert(AtropyleVault.AlreadyReleased.selector);
        vm.prank(owner);
        v.checkIn();

        vm.expectRevert(AtropyleVault.AlreadyReleased.selector);
        vm.prank(owner);
        v.setTiming(VaultConfig.Timing(P, T, W));

        vm.expectRevert(AtropyleVault.AlreadyReleased.selector);
        vm.prank(g3);
        v.attestDeath(true);

        vm.expectRevert(AtropyleVault.AlreadyReleased.selector);
        vm.prank(g3);
        v.voteRecovery(newWallet);

        v.poke();
        assertEq(v.state(), PolicyCodec.RELEASED_INHERIT);

        usdt.mint(owner, 100e6);
        assertTrue(v.distribute());
        assertEq(usdt.balanceOf(heirA), 660e6);
        assertEq(usdt.balanceOf(heirB), 440e6);
    }

    /// Review Focus #5
    function test_drillExpires() public {
        AtropyleVault d = _deploy(_drillCfg(), true);
        assertTrue(d.drill());
        assertEq(d.expiresAt(), block.timestamp + 7 days);
        vm.warp(block.timestamp + 7 days);

        vm.expectRevert(AtropyleVault.DrillExpired.selector);
        vm.prank(owner);
        d.checkIn();

        vm.expectRevert(AtropyleVault.DrillExpired.selector);
        d.poke();

        vm.expectRevert(AtropyleVault.DrillExpired.selector);
        d.distribute();

        vm.expectRevert(AtropyleVault.DrillExpired.selector);
        vm.prank(g1);
        d.attestDeath(true);

        assertEq(d.status().state, PolicyCodec.ACTIVE);
    }

    function test_drillRunsInMinutes() public {
        AtropyleVault d = _deploy(_drillCfg(), true);
        _approveAll(d);
        vm.warp(block.timestamp + 120); // T = 2 periods of 60 s
        d.poke();
        assertEq(d.state(), PolicyCodec.GRACE);
        vm.warp(block.timestamp + 120); // W = 120 s
        assertTrue(d.distribute());
        assertEq(usdt.balanceOf(heirA), 600e6);
    }

    function test_reentrantTokenCannotReenter() public {
        ReentrantERC20 r = new ReentrantERC20();
        VaultConfig.Config memory c = _cfg();
        c.assets = new VaultConfig.Asset[](1);
        c.assets[0] = VaultConfig.Asset(VaultConfig.Kind.ERC20, address(r), 0, 0);
        AtropyleVault x = _deploy(c, false);
        r.mint(owner, 1000);
        vm.prank(owner);
        r.approve(address(x), type(uint256).max);
        r.setTarget(address(x));

        vm.warp(block.timestamp + uint256(T) * P);
        x.poke();
        vm.prank(g1);
        x.attestDeath(true);
        vm.prank(g2);
        x.attestDeath(true);
        vm.warp(block.timestamp + W);
        assertTrue(x.distribute());
        assertTrue(r.attempted());
        assertFalse(r.reentered());
        assertEq(r.balanceOf(heirA), 600);
        assertEq(r.balanceOf(heirB), 400);
    }

    function test_statusReportsDeadlines() public {
        _toGrace();
        vm.prank(g1);
        v.voteRecovery(newWallet);
        AtropyleVault.Status memory st = v.status();
        assertEq(st.state, PolicyCodec.GRACE);
        assertEq(st.pending, PolicyCodec.GRACE);
        assertEq(st.idle, T);
        assertEq(st.lateAt, uint256(v.lastAlive()) + uint256(T) * P);
        assertEq(st.alarmAt, block.timestamp);
        assertEq(st.windowEndsAt, block.timestamp + W);
        assertEq(st.recVotes.length, 3);
        assertEq(st.recVotes[0], newWallet);
        assertEq(st.coverage[0], 1000e6);
        assertEq(st.coverage[1], 1);
        assertEq(st.coverage[2], 5);

        vm.warp(block.timestamp + W);
        assertEq(v.status().pending, PolicyCodec.GRACE); // window over, but no quorum and idle not maxed
        _attestTwo();
        assertEq(v.state(), PolicyCodec.RELEASED_INHERIT); // the second attestation itself released
    }

    function test_badPolicyOutputReverts() public {
        AtropyleVault x = _deployOn(address(new BadPolicyCPU()), _cfg(), false);
        vm.expectRevert(abi.encodeWithSelector(AtropyleVault.BadPolicyOutput.selector, uint8(2)));
        x.poke();
    }

    function test_configChangeCountsAsCheckIn() public {
        _toGrace();
        vm.expectEmit(address(v));
        emit AtropyleVault.ConfigUpdated(3);
        vm.prank(owner);
        v.setTiming(VaultConfig.Timing(2 days, 4, 4 days));
        assertEq(v.state(), PolicyCodec.ACTIVE);
        assertEq(v.lastAlive(), block.timestamp);
        assertEq(v.timing().period, 2 days);
    }
}
```

- [ ] **Step 3: Chạy test, xác nhận thất bại**

Run: `cd contracts && forge test --match-contract AtropyleVaultTest`
Expected: FAIL khi biên dịch, không tìm thấy `../src/AtropyleVault.sol`.

- [ ] **Step 4: Viết `AtropyleVault.sol`**

`contracts/src/AtropyleVault.sol`:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ICPU} from "./interfaces/ICPU.sol";
import {IVaultIndex} from "./interfaces/IVaultIndex.sol";
import {PolicyCodec} from "./PolicyCodec.sol";
import {VaultDistribution} from "./vault/VaultDistribution.sol";

/// @title AtropyleVault — non-custodial inheritance and wallet-recovery vault (spec §4)
/// @notice One EIP-1167 clone per owner. No admin, pause, upgrade, delegatecall or selfdestruct.
///         Every state change is decided by the frozen AtropylePolicy circuit through step().
contract AtropyleVault is VaultDistribution {
    uint256 public constant DRILL_LIFETIME = 7 days;

    struct Status {
        uint8 state;
        uint8 pending; // state a poke() would produce right now
        uint8 idle;
        uint64 lastAlive;
        uint64 lateAt; // lastAlive + T * P
        uint64 alarmAt;
        uint64 windowEndsAt; // alarmAt + W, or 0 without an alarm
        uint64 releasedAt;
        uint64 expiresAt; // Drill only, else 0
        uint8 inhVotes;
        address recoveryTarget;
        address[] recVotes; // recVote of each guardian, in guardians() order
        uint256[] coverage;
    }

    address public factory;
    ICPU public cpu;
    uint256 public policyId;
    uint64 public expiresAt;
    uint8 public state;
    uint64 public lastAlive;
    uint64 public alarmAt;
    uint64 public releasedAt;
    uint8 public inhVotes;
    address public recoveryTarget;
    mapping(address guardian => address target) public recVote;

    bool private _initialized;
    bool private _locked;

    event Alive(uint64 at);
    event ConfigUpdated(uint8 what); // 1 heirs, 2 guardians, 3 timing, 4 assets
    event Attested(address indexed guardian, bool on);
    event RecoveryVoted(address indexed guardian, address indexed target);
    event AlarmRaised(uint8 state, address target);
    event AlarmCancelled(bool byOwner);
    event Released(uint8 state, address target);
    event StateChanged(uint8 from, uint8 to);

    error AlreadyInitialized();
    error NotOwner();
    error AlreadyReleased();
    error DrillExpired();
    error Reentrancy();
    error RecoveryDisabled();
    error InvalidTarget();
    error BadPolicyOutput(uint8 state);

    modifier nonReentrant() {
        if (_locked) revert Reentrancy();
        _locked = true;
        _;
        _locked = false;
    }

    modifier notExpired() {
        if (drill && block.timestamp >= expiresAt) revert DrillExpired();
        _;
    }

    modifier notReleased() {
        if (PolicyCodec.isReleased(state)) revert AlreadyReleased();
        _;
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    /// @dev Locks the implementation; clones start uninitialized.
    constructor() {
        _initialized = true;
    }

    function initialize(address owner_, bool drill_, Config calldata cfg, address cpu_, uint256 policyId_) external {
        if (_initialized) revert AlreadyInitialized();
        _initialized = true;
        factory = msg.sender;
        owner = owner_;
        drill = drill_;
        cpu = ICPU(cpu_);
        policyId = policyId_;
        if (drill_) expiresAt = uint64(block.timestamp + DRILL_LIFETIME);
        lastAlive = uint64(block.timestamp);
        _setHeirs(cfg.heirs);
        _setGuardians(cfg.guardians, cfg.k, cfg.recoveryEnabled);
        _setTiming(cfg.timing);
        _setAssets(cfg.assets);
        _index(owner_);
        _indexHeirs();
        _indexGuardians();
        emit Alive(uint64(block.timestamp));
    }

    // ------------------------------------------------------------------ owner

    function checkIn() external nonReentrant notExpired onlyOwner notReleased {
        _ownerAlive();
        _advance(true, address(0));
    }

    function setHeirs(Heir[] calldata h) external nonReentrant notExpired onlyOwner notReleased {
        _ownerAlive();
        _setHeirs(h);
        _advance(true, address(0));
        _indexHeirs();
        emit ConfigUpdated(1);
    }

    /// @dev _ownerAlive() runs first, so the outgoing guardians' votes are cleared before the list changes.
    function setGuardians(address[] calldata g, uint8 k_, bool rec)
        external
        nonReentrant
        notExpired
        onlyOwner
        notReleased
    {
        _ownerAlive();
        _setGuardians(g, k_, rec);
        _advance(true, address(0));
        _indexGuardians();
        emit ConfigUpdated(2);
    }

    function setTiming(Timing calldata t) external nonReentrant notExpired onlyOwner notReleased {
        _ownerAlive();
        _setTiming(t);
        _advance(true, address(0));
        emit ConfigUpdated(3);
    }

    function setAssets(Asset[] calldata a) external nonReentrant notExpired onlyOwner notReleased {
        _ownerAlive();
        _setAssets(a);
        _advance(true, address(0));
        emit ConfigUpdated(4);
    }

    // ------------------------------------------------------------------ guardians

    function attestDeath(bool on) external nonReentrant notExpired notReleased {
        (uint256 i, bool found) = _guardianIndex(msg.sender);
        if (!found) revert NotGuardian();
        uint8 bit = uint8(1 << i);
        inhVotes = on ? inhVotes | bit : inhVotes & ~bit;
        emit Attested(msg.sender, on);
        _advance(false, address(0));
    }

    /// @param target New wallet for the owner's assets; address(0) withdraws the caller's vote.
    function voteRecovery(address target) external nonReentrant notExpired notReleased {
        if (!recoveryEnabled) revert RecoveryDisabled();
        if (!_isGuardian(msg.sender)) revert NotGuardian();
        if (target == owner || target == address(this) || (target != address(0) && _isGuardian(target))) {
            revert InvalidTarget();
        }
        recVote[msg.sender] = target;
        emit RecoveryVoted(msg.sender, target);
        _advance(false, target);
    }

    // ------------------------------------------------------------------ anyone

    function poke() external nonReentrant notExpired {
        if (PolicyCodec.isReleased(state)) return;
        _advance(false, address(0));
    }

    /// @return released True when a sweep ran; false (no revert) while the policy has not released,
    ///         so alarm transitions triggered by this call are still recorded.
    function distribute() external nonReentrant notExpired returns (bool released) {
        if (!PolicyCodec.isReleased(state)) {
            _advance(false, address(0));
            if (!PolicyCodec.isReleased(state)) return false;
        }
        _distribute(state == PolicyCodec.RELEASED_RECOVER, recoveryTarget);
        return true;
    }

    function status() external view returns (Status memory st) {
        uint8 s = state;
        st.state = s;
        if (PolicyCodec.isReleased(s)) st.pending = s;
        else (st.pending,,) = _evaluate(false, address(0));
        st.idle = _idle();
        st.lastAlive = lastAlive;
        st.lateAt = lastAlive + uint64(_timing.threshold) * _timing.period;
        st.alarmAt = alarmAt;
        st.windowEndsAt = alarmAt == 0 ? 0 : alarmAt + _timing.window;
        st.releasedAt = releasedAt;
        st.expiresAt = expiresAt;
        st.inhVotes = inhVotes;
        st.recoveryTarget = recoveryTarget;
        uint256 n = _guardians.length;
        st.recVotes = new address[](n);
        for (uint256 i; i < n; ++i) {
            st.recVotes[i] = recVote[_guardians[i]];
        }
        st.coverage = coverage();
    }

    // ------------------------------------------------------------------ internals

    function _ownerAlive() internal {
        lastAlive = uint64(block.timestamp);
        inhVotes = 0;
        uint256 n = _guardians.length;
        for (uint256 i; i < n; ++i) {
            delete recVote[_guardians[i]];
        }
        emit Alive(uint64(block.timestamp));
    }

    /// @dev Builds the spec §3.2 inputs and asks the circuit for the next state.
    function _evaluate(bool alive, address candidateArg)
        internal
        view
        returns (uint8 next, uint8 out, address candidate)
    {
        uint8 s = state;
        candidate = s == PolicyCodec.RECOVERY ? recoveryTarget : candidateArg;
        PolicyCodec.Inputs memory inp = PolicyCodec.Inputs({
            idle: _idle(),
            threshold: _timing.threshold,
            inhVotes: inhVotes,
            recVotes: _recBitmap(candidate),
            k: k,
            alive: alive,
            windowDone: alarmAt != 0 && block.timestamp >= uint256(alarmAt) + _timing.window
        });
        (bytes memory ns, bytes memory o) = cpu.step(policyId, PolicyCodec.encodeState(s), PolicyCodec.pack(inp));
        next = PolicyCodec.firstByte(ns);
        out = PolicyCodec.firstByte(o);
        if (!PolicyCodec.isCanonical(next)) revert BadPolicyOutput(next);
    }

    function _advance(bool alive, address candidateArg) internal {
        (uint8 n, uint8 o, address candidate) = _evaluate(alive, candidateArg);
        if ((o & PolicyCodec.OUT_ALARM) != 0) {
            alarmAt = uint64(block.timestamp);
            recoveryTarget = n == PolicyCodec.RECOVERY ? candidate : address(0);
            emit AlarmRaised(n, recoveryTarget);
        }
        if ((o & PolicyCodec.OUT_CANCEL) != 0) {
            alarmAt = 0;
            recoveryTarget = address(0);
            emit AlarmCancelled(alive);
        }
        if ((o & PolicyCodec.OUT_RELEASE) != 0) {
            releasedAt = uint64(block.timestamp);
            emit Released(n, recoveryTarget);
        }
        uint8 s = state;
        if (n != s) {
            state = n;
            emit StateChanged(s, n);
        }
    }

    function _idle() internal view returns (uint8) {
        uint256 periods = (block.timestamp - lastAlive) / _timing.period;
        return periods > 15 ? 15 : uint8(periods);
    }

    function _recBitmap(address candidate) internal view returns (uint8 m) {
        if (candidate == address(0) || !recoveryEnabled) return 0;
        uint256 n = _guardians.length;
        for (uint256 i; i < n; ++i) {
            if (recVote[_guardians[i]] == candidate) m |= uint8(1 << i);
        }
    }

    function _index(address account) private {
        IVaultIndex(factory).index(account);
    }

    function _indexHeirs() private {
        uint256 n = _heirs.length;
        for (uint256 i; i < n; ++i) {
            _index(_heirs[i].account);
        }
    }

    function _indexGuardians() private {
        uint256 n = _guardians.length;
        for (uint256 i; i < n; ++i) {
            _index(_guardians[i]);
        }
    }
}
```

- [ ] **Step 5: Chạy test**

Run: `cd contracts && forge test --match-contract AtropyleVaultTest -vv`
Expected: 23 test PASS.

Run: `cd contracts && forge test`
Expected: mọi test của Task 6–9 PASS.

- [ ] **Step 6: Commit**

```bash
git add contracts/src/interfaces/IVaultIndex.sol contracts/src/AtropyleVault.sol contracts/test/utils/VaultFixture.sol contracts/test/AtropyleVault.t.sol
git commit -m "feat(contracts): AtropyleVault inheritance and recovery lifecycle" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```


---

### Task 10: `AtropyleFactory` — phí, clone xác định trước và chỉ mục vai trò

**Files:**
- Create: `contracts/src/AtropyleFactory.sol`
- Test: `contracts/test/AtropyleFactory.t.sol`

**Interfaces:**
- Consumes: `AtropyleVault.initialize`, `IVaultIndex` (Task 9), `VaultConfig.Config` (Task 7), `VaultFixture` (Task 9), `MockERC20` (Task 7), OZ `Clones`, `SafeERC20`, `IERC20Metadata`.
- Produces:
  - `contract AtropyleFactory is IVaultIndex`:
    - `EARLY_COUNT = 100`; immutable public `vaultImpl`, `cpu`, `policyId`, `treasury`.
    - `earlyFee(address token)`, `fullFee(address token)`, `paidCount()`, `isVault(address)`.
    - `constructor(address vaultImpl_, address cpu_, uint256 policyId_, address treasury_, address[] memory feeTokens)`; phí của mỗi token tính từ `decimals()` d (2 ≤ d ≤ 18): early = `199 * 10**(d-2)`, full = `990 * 10**(d-2)`.
    - `currentFee(address token) view returns (uint256)` (revert `UnsupportedFeeToken` nếu token không nằm trong danh sách).
    - `createVault(VaultConfig.Config calldata cfg, bytes32 salt, bool drill, address feeToken) returns (address vault)`; Drill bỏ qua `feeToken` và không tính vào `paidCount`.
    - `predictVault(address owner, bytes32 salt) view returns (address)`; salt thật = `keccak256(abi.encode(owner, salt))`.
    - `index(address account)` (chỉ vault do factory tạo; không ghi trùng), `vaultsOf(address account) view returns (address[])`.
    - `event VaultCreated(address indexed owner, address indexed vault, bool drill, address feeToken, uint256 fee)`.
    - Errors: `UnsupportedFeeToken()`, `NotVault()`, `BadConstructorArgs()`.

Chỉ mục chỉ thêm, không xoá: ai từng là heir hay giám hộ vẫn thấy vault trong `vaultsOf`. UI và bot đọc `heirs()`/`guardians()` hiện tại để lọc.

- [ ] **Step 1: Viết test thất bại**

`contracts/test/AtropyleFactory.t.sol`:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {stdStorage, StdStorage} from "forge-std/Test.sol";
import {AtropyleFactory} from "../src/AtropyleFactory.sol";
import {AtropyleVault} from "../src/AtropyleVault.sol";
import {PolicyCodec} from "../src/PolicyCodec.sol";
import {VaultConfig} from "../src/vault/VaultConfig.sol";
import {MockERC20} from "./mocks/Tokens.sol";
import {VaultFixture} from "./utils/VaultFixture.sol";

contract AtropyleFactoryTest is VaultFixture {
    using stdStorage for StdStorage;

    AtropyleFactory internal factory;
    MockERC20 internal usdt0;
    MockERC20 internal usdc;
    MockERC20 internal usdg;
    address internal treasury = makeAddr("treasury");

    function setUp() public override {
        super.setUp();
        usdt0 = new MockERC20("USDT0", "USDT0", 6);
        usdc = new MockERC20("USD Coin", "USDC", 6);
        usdg = new MockERC20("Global Dollar", "USDG", 6);
        factory = new AtropyleFactory(address(impl), address(cpu), 1, treasury, _feeTokens());
        usdt0.mint(owner, 100e6);
        vm.prank(owner);
        usdt0.approve(address(factory), type(uint256).max);
    }

    function _feeTokens() internal view returns (address[] memory t) {
        t = new address[](3);
        t[0] = address(usdt0);
        t[1] = address(usdc);
        t[2] = address(usdg);
    }

    function _create(bytes32 salt) internal returns (address) {
        VaultConfig.Config memory c = _cfg();
        vm.prank(owner);
        return factory.createVault(c, salt, false, address(usdt0));
    }

    function test_feesScaleWithDecimals() public {
        assertEq(factory.earlyFee(address(usdt0)), 1_990_000);
        assertEq(factory.fullFee(address(usdc)), 9_900_000);
        assertEq(factory.earlyFee(address(usdg)), 1_990_000);

        MockERC20 wide = new MockERC20("Wide", "W", 18);
        address[] memory t = new address[](1);
        t[0] = address(wide);
        AtropyleFactory f = new AtropyleFactory(address(impl), address(cpu), 1, treasury, t);
        assertEq(f.earlyFee(address(wide)), 1.99e18);
        assertEq(f.fullFee(address(wide)), 9.9e18);
    }

    function test_paidVaultChargesEarlyFee() public {
        address predicted = factory.predictVault(owner, bytes32("a"));
        vm.expectEmit(address(factory));
        emit AtropyleFactory.VaultCreated(owner, predicted, false, address(usdt0), 1_990_000);
        address vault = _create(bytes32("a"));

        assertEq(vault, predicted);
        assertTrue(factory.isVault(vault));
        assertEq(usdt0.balanceOf(treasury), 1_990_000);
        assertEq(factory.paidCount(), 1);
        AtropyleVault v = AtropyleVault(vault);
        assertEq(v.owner(), owner);
        assertEq(v.factory(), address(factory));
        assertEq(address(v.cpu()), address(cpu));
        assertEq(v.policyId(), 1);
        assertFalse(v.drill());
    }

    function test_feeSwitchesAtTheHundredthPaidVault() public {
        stdstore.target(address(factory)).sig("paidCount()").checked_write(uint256(99));
        assertEq(factory.currentFee(address(usdt0)), 1_990_000);
        _create(bytes32("b"));
        assertEq(factory.paidCount(), 100);
        assertEq(factory.currentFee(address(usdt0)), 9_900_000);
        _create(bytes32("c"));
        assertEq(factory.paidCount(), 101);
        assertEq(usdt0.balanceOf(treasury), 1_990_000 + 9_900_000);
    }

    function test_drillIsFree() public {
        VaultConfig.Config memory c = _drillCfg();
        vm.prank(owner);
        address vault = factory.createVault(c, bytes32("d"), true, address(0));
        assertTrue(AtropyleVault(vault).drill());
        assertEq(AtropyleVault(vault).expiresAt(), block.timestamp + 7 days);
        assertEq(usdt0.balanceOf(treasury), 0);
        assertEq(factory.paidCount(), 0);
    }

    function test_rejectsUnsupportedFeeToken() public {
        VaultConfig.Config memory c = _cfg();
        vm.expectRevert(AtropyleFactory.UnsupportedFeeToken.selector);
        vm.prank(owner);
        factory.createVault(c, bytes32("x"), false, address(usdt));

        vm.expectRevert(AtropyleFactory.UnsupportedFeeToken.selector);
        factory.currentFee(address(0));
    }

    function test_saltIsPerOwner() public {
        VaultConfig.Config memory c = _cfg();
        address a = _create(bytes32("s"));

        usdt0.mint(stranger, 10e6);
        vm.startPrank(stranger);
        usdt0.approve(address(factory), type(uint256).max);
        address b = factory.createVault(c, bytes32("s"), false, address(usdt0));
        vm.stopPrank();

        assertTrue(a != b);
        assertEq(b, factory.predictVault(stranger, bytes32("s")));

        vm.expectRevert();
        vm.prank(owner);
        factory.createVault(c, bytes32("s"), false, address(usdt0));
    }

    function test_indexesEveryRole() public {
        address vault = _create(bytes32("i"));
        address[6] memory roles = [owner, heirA, heirB, g1, g2, g3];
        for (uint256 i; i < roles.length; ++i) {
            address[] memory list = factory.vaultsOf(roles[i]);
            assertEq(list.length, 1);
            assertEq(list[0], vault);
        }
        assertEq(factory.vaultsOf(stranger).length, 0);

        address newHeir = makeAddr("newHeir");
        VaultConfig.Heir[] memory h = new VaultConfig.Heir[](2);
        h[0] = VaultConfig.Heir(newHeir, 5000);
        h[1] = VaultConfig.Heir(heirB, 5000);
        vm.prank(owner);
        AtropyleVault(vault).setHeirs(h);
        assertEq(factory.vaultsOf(newHeir).length, 1);
        assertEq(factory.vaultsOf(heirB).length, 1); // indexed once, not twice
    }

    function test_indexOnlyFromVaults() public {
        vm.expectRevert(AtropyleFactory.NotVault.selector);
        vm.prank(stranger);
        factory.index(stranger);
    }

    function test_constructorRejectsBadArgs() public {
        address[] memory ok = _feeTokens();
        address[] memory none = new address[](0);
        address[] memory dup = new address[](2);
        dup[0] = address(usdc);
        dup[1] = address(usdc);
        address[] memory tiny = new address[](1);
        tiny[0] = address(new MockERC20("Tiny", "T", 1));
        address[] memory eoa = new address[](1);
        eoa[0] = stranger;

        vm.expectRevert(AtropyleFactory.BadConstructorArgs.selector);
        new AtropyleFactory(stranger, address(cpu), 1, treasury, ok);
        vm.expectRevert(AtropyleFactory.BadConstructorArgs.selector);
        new AtropyleFactory(address(impl), stranger, 1, treasury, ok);
        vm.expectRevert(AtropyleFactory.BadConstructorArgs.selector);
        new AtropyleFactory(address(impl), address(cpu), 1, address(0), ok);
        vm.expectRevert(AtropyleFactory.BadConstructorArgs.selector);
        new AtropyleFactory(address(impl), address(cpu), 1, treasury, none);
        vm.expectRevert(AtropyleFactory.BadConstructorArgs.selector);
        new AtropyleFactory(address(impl), address(cpu), 1, treasury, dup);
        vm.expectRevert(AtropyleFactory.BadConstructorArgs.selector);
        new AtropyleFactory(address(impl), address(cpu), 1, treasury, tiny);
        vm.expectRevert(AtropyleFactory.BadConstructorArgs.selector);
        new AtropyleFactory(address(impl), address(cpu), 1, treasury, eoa);
    }

    function test_factoryVaultRunsFullLifecycle() public {
        AtropyleVault v = AtropyleVault(_create(bytes32("l")));
        _approveAll(v);
        vm.warp(block.timestamp + uint256(T) * P);
        v.poke();
        vm.prank(g1);
        v.attestDeath(true);
        vm.prank(g2);
        v.attestDeath(true);
        vm.warp(block.timestamp + W);
        assertTrue(v.distribute());
        assertEq(v.state(), PolicyCodec.RELEASED_INHERIT);
        assertEq(usdt.balanceOf(heirA), 600e6);
        assertEq(usdt.balanceOf(heirB), 400e6);
    }
}
```

- [ ] **Step 2: Chạy test, xác nhận thất bại**

Run: `cd contracts && forge test --match-contract AtropyleFactoryTest`
Expected: FAIL khi biên dịch, không tìm thấy `../src/AtropyleFactory.sol`.

- [ ] **Step 3: Viết `AtropyleFactory.sol`**

`contracts/src/AtropyleFactory.sol`:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";
import {AtropyleVault} from "./AtropyleVault.sol";
import {IVaultIndex} from "./interfaces/IVaultIndex.sol";
import {VaultConfig} from "./vault/VaultConfig.sol";

/// @title AtropyleFactory — creates vault clones, collects the creation fee, indexes roles (spec §5)
/// @notice No admin, no pause, no upgrade. Fee levels are fixed at construction from each token's decimals().
contract AtropyleFactory is IVaultIndex {
    using SafeERC20 for IERC20;

    uint256 public constant EARLY_COUNT = 100;

    address public immutable vaultImpl;
    address public immutable cpu;
    uint256 public immutable policyId;
    address public immutable treasury;

    mapping(address token => uint256) public earlyFee;
    mapping(address token => uint256) public fullFee;
    uint256 public paidCount;
    mapping(address vault => bool) public isVault;

    mapping(address account => address[]) private _vaultsOf;
    mapping(address account => mapping(address vault => bool)) private _indexed;

    event VaultCreated(address indexed owner, address indexed vault, bool drill, address feeToken, uint256 fee);

    error UnsupportedFeeToken();
    error NotVault();
    error BadConstructorArgs();

    constructor(address vaultImpl_, address cpu_, uint256 policyId_, address treasury_, address[] memory feeTokens) {
        if (vaultImpl_.code.length == 0 || cpu_.code.length == 0 || treasury_ == address(0) || feeTokens.length == 0)
        {
            revert BadConstructorArgs();
        }
        vaultImpl = vaultImpl_;
        cpu = cpu_;
        policyId = policyId_;
        treasury = treasury_;
        for (uint256 i; i < feeTokens.length; ++i) {
            address t = feeTokens[i];
            if (t.code.length == 0 || fullFee[t] != 0) revert BadConstructorArgs();
            uint8 d = IERC20Metadata(t).decimals();
            if (d < 2 || d > 18) revert BadConstructorArgs();
            uint256 unit = 10 ** (d - 2);
            earlyFee[t] = 199 * unit; // 1.99 tokens
            fullFee[t] = 990 * unit; // 9.90 tokens
        }
    }

    function currentFee(address token) public view returns (uint256 fee) {
        fee = paidCount < EARLY_COUNT ? earlyFee[token] : fullFee[token];
        if (fee == 0) revert UnsupportedFeeToken();
    }

    function createVault(VaultConfig.Config calldata cfg, bytes32 salt, bool drill, address feeToken)
        external
        returns (address vault)
    {
        uint256 fee;
        if (drill) {
            feeToken = address(0);
        } else {
            fee = currentFee(feeToken);
            ++paidCount;
            IERC20(feeToken).safeTransferFrom(msg.sender, treasury, fee);
        }
        vault = Clones.cloneDeterministic(vaultImpl, _salt(msg.sender, salt));
        isVault[vault] = true; // before initialize, which calls index() back
        AtropyleVault(vault).initialize(msg.sender, drill, cfg, cpu, policyId);
        emit VaultCreated(msg.sender, vault, drill, feeToken, fee);
    }

    function predictVault(address owner, bytes32 salt) external view returns (address) {
        return Clones.predictDeterministicAddress(vaultImpl, _salt(owner, salt));
    }

    /// @inheritdoc IVaultIndex
    function index(address account) external {
        if (!isVault[msg.sender]) revert NotVault();
        if (_indexed[account][msg.sender]) return;
        _indexed[account][msg.sender] = true;
        _vaultsOf[account].push(msg.sender);
    }

    function vaultsOf(address account) external view returns (address[] memory) {
        return _vaultsOf[account];
    }

    function _salt(address owner, bytes32 salt) private pure returns (bytes32) {
        return keccak256(abi.encode(owner, salt));
    }
}
```

- [ ] **Step 4: Chạy test**

Run: `cd contracts && forge test --match-contract AtropyleFactoryTest -vv`
Expected: 10 test PASS.

- [ ] **Step 5: Commit**

```bash
git add contracts/src/AtropyleFactory.sol contracts/test/AtropyleFactory.t.sol
git commit -m "feat(contracts): AtropyleFactory with decimals-based fees and role index" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Invariant test I1–I6

**Files:**
- Test: `contracts/test/Invariant.t.sol`

**Interfaces:**
- Consumes: `AtropyleVault` (Task 9), `PolicyCodec` (Task 6), `VaultConfig` (Task 7), `MockERC20` (Task 7), `VaultFixture` (Task 9).
- Produces: `contract VaultHandler` (chỉ dùng trong file này) và `contract VaultInvariantTest`. Không có code sản phẩm mới: task này chỉ thêm test. Nếu invariant hỏng, sửa `AtropyleVault`/`VaultDistribution` ở đúng task gốc rồi chạy lại toàn bộ.

Ánh xạ tới spec §4.5:

| Invariant | Kiểm gì |
|---|---|
| I1 | Chưa Released thì owner vẫn giữ đủ `TOTAL` |
| I2 | Tổng số dư được bảo toàn; Released-thừa-kế thì ví khôi phục không nhận gì; Released-khôi-phục thì heir và ví đích kia không nhận gì |
| I3 | Sau lần đầu thấy Released, `state` và băm cấu hình + vòng đời không đổi |
| I4 | Không ai ngoài owner sửa được cấu hình hay check-in; mọi lần owner sửa cấu hình thành công đều đặt `lastAlive = now` và về Active |
| I5 | Vault không bao giờ giữ token |
| I6 | `state` luôn là mã chuẩn, và sau mỗi lời gọi thành công `status().pending == state` (state đã lưu đúng là kết quả `step` với input hiện tại) |

- [ ] **Step 1: Viết handler và invariant**

`contracts/test/Invariant.t.sol`:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {AtropyleVault} from "../src/AtropyleVault.sol";
import {PolicyCodec} from "../src/PolicyCodec.sol";
import {VaultConfig} from "../src/vault/VaultConfig.sol";
import {MockERC20} from "./mocks/Tokens.sol";
import {VaultFixture} from "./utils/VaultFixture.sol";

/// @notice Drives one vault through random sequences of role actions and time jumps.
contract VaultHandler is Test {
    AtropyleVault public immutable vault;
    address public immutable owner;
    address[3] internal guardians;
    address[2] internal targets;
    address[7] internal outsiders;

    bool public releasedSeen;
    uint8 public releasedState;
    bytes32 public releasedHash;
    bool public fixpointBroken;
    bool public strangerEdited;
    bool public aliveBroken;

    constructor(
        AtropyleVault v,
        address owner_,
        address[3] memory g,
        address[2] memory heirs_,
        address[2] memory targets_,
        address stranger
    ) {
        vault = v;
        owner = owner_;
        guardians = g;
        targets = targets_;
        outsiders = [g[0], g[1], g[2], heirs_[0], heirs_[1], targets_[0], stranger];
    }

    function checkIn() external {
        vm.prank(owner);
        try vault.checkIn() {
            _afterSuccess();
        } catch {}
        _record();
    }

    function ownerConfig(uint256 seed) external {
        VaultConfig.Timing memory t = VaultConfig.Timing(uint32(bound(seed, 1 days, 3 days)), 3, 3 days);
        vm.prank(owner);
        try vault.setTiming(t) {
            if (vault.lastAlive() != block.timestamp || vault.state() != PolicyCodec.ACTIVE) aliveBroken = true;
            _afterSuccess();
        } catch {}
        _record();
    }

    function strangerConfig(uint256 who, uint256 seed) external {
        address actor = outsiders[who % outsiders.length];
        VaultConfig.Timing memory t = VaultConfig.Timing(uint32(bound(seed, 1 days, 3 days)), 3, 3 days);
        vm.prank(actor);
        try vault.setTiming(t) {
            strangerEdited = true;
        } catch {}
        vm.prank(actor);
        try vault.checkIn() {
            strangerEdited = true;
        } catch {}
        _record();
    }

    function attest(uint256 g, bool on) external {
        vm.prank(guardians[g % 3]);
        try vault.attestDeath(on) {
            _afterSuccess();
        } catch {}
        _record();
    }

    /// @dev t % 3 picks newWallet, stranger, or address(0) (withdraw).
    function vote(uint256 g, uint256 t) external {
        address target = t % 3 < 2 ? targets[t % 3] : address(0);
        vm.prank(guardians[g % 3]);
        try vault.voteRecovery(target) {
            _afterSuccess();
        } catch {}
        _record();
    }

    function poke() external {
        try vault.poke() {
            _afterSuccess();
        } catch {}
        _record();
    }

    function distribute() external {
        try vault.distribute() {
            _afterSuccess();
        } catch {}
        _record();
    }

    function elapse(uint256 dt) external {
        vm.warp(block.timestamp + bound(dt, 1 hours, 4 days));
    }

    function snapshotHash() public view returns (bytes32) {
        return keccak256(abi.encode(_configHash(), _lifecycleHash()));
    }

    function _configHash() internal view returns (bytes32) {
        return keccak256(
            abi.encode(
                vault.heirs(), vault.guardians(), vault.timing(), vault.assets(), vault.k(), vault.recoveryEnabled()
            )
        );
    }

    function _lifecycleHash() internal view returns (bytes32) {
        return keccak256(
            abi.encode(
                vault.state(),
                vault.lastAlive(),
                vault.alarmAt(),
                vault.releasedAt(),
                vault.inhVotes(),
                vault.recoveryTarget()
            )
        );
    }

    /// @dev Right after a successful call nothing has elapsed, so re-evaluating must give the stored state.
    function _afterSuccess() internal {
        if (vault.status().pending != vault.state()) fixpointBroken = true;
    }

    function _record() internal {
        uint8 s = vault.state();
        if (!releasedSeen && PolicyCodec.isReleased(s)) {
            releasedSeen = true;
            releasedState = s;
            releasedHash = snapshotHash();
        }
    }
}

contract VaultInvariantTest is VaultFixture {
    uint256 internal constant TOTAL = 1000e6;

    AtropyleVault internal v;
    VaultHandler internal handler;

    function setUp() public override {
        super.setUp();
        VaultConfig.Config memory c = _cfg();
        c.assets = new VaultConfig.Asset[](1);
        c.assets[0] = VaultConfig.Asset(VaultConfig.Kind.ERC20, address(usdt), 0, 0);
        v = _deploy(c, false);
        vm.prank(owner);
        usdt.approve(address(v), type(uint256).max);

        handler = new VaultHandler(v, owner, [g1, g2, g3], [heirA, heirB], [newWallet, stranger], stranger);

        bytes4[] memory sel = new bytes4[](8);
        sel[0] = VaultHandler.checkIn.selector;
        sel[1] = VaultHandler.ownerConfig.selector;
        sel[2] = VaultHandler.strangerConfig.selector;
        sel[3] = VaultHandler.attest.selector;
        sel[4] = VaultHandler.vote.selector;
        sel[5] = VaultHandler.poke.selector;
        sel[6] = VaultHandler.distribute.selector;
        sel[7] = VaultHandler.elapse.selector;
        targetContract(address(handler));
        targetSelector(FuzzSelector({addr: address(handler), selectors: sel}));
    }

    function invariant_I1_tokensStayWithOwnerUntilReleased() public view {
        if (!PolicyCodec.isReleased(v.state())) assertEq(usdt.balanceOf(owner), TOTAL);
    }

    function invariant_I2_recipientsMatchMode() public view {
        uint256 toHeirs = usdt.balanceOf(heirA) + usdt.balanceOf(heirB);
        uint256 toTargets = usdt.balanceOf(newWallet) + usdt.balanceOf(stranger);
        assertEq(usdt.balanceOf(owner) + toHeirs + toTargets, TOTAL);
        uint8 s = v.state();
        if (s == PolicyCodec.RELEASED_INHERIT) assertEq(toTargets, 0);
        if (s == PolicyCodec.RELEASED_RECOVER) {
            assertEq(toHeirs, 0);
            address other = v.recoveryTarget() == newWallet ? stranger : newWallet;
            assertEq(usdt.balanceOf(other), 0);
        }
    }

    function invariant_I3_releasedIsFinal() public view {
        if (!handler.releasedSeen()) return;
        assertEq(v.state(), handler.releasedState());
        assertEq(handler.snapshotHash(), handler.releasedHash());
    }

    function invariant_I4_onlyOwnerConfiguresAndEveryOwnerTxIsAlive() public view {
        assertFalse(handler.strangerEdited());
        assertFalse(handler.aliveBroken());
    }

    function invariant_I5_vaultHoldsNothing() public view {
        assertEq(usdt.balanceOf(address(v)), 0);
    }

    function invariant_I6_stateIsCanonicalAndMatchesStep() public view {
        assertTrue(PolicyCodec.isCanonical(v.state()));
        assertFalse(handler.fixpointBroken());
    }

    /// The handler can reach both release modes, so the invariants above are not vacuous.
    function test_handlerReachesInheritance() public {
        handler.elapse(3 days);
        handler.poke();
        handler.attest(0, true);
        handler.attest(1, true);
        handler.elapse(3 days);
        handler.distribute();
        assertEq(v.state(), PolicyCodec.RELEASED_INHERIT);
        assertEq(usdt.balanceOf(heirA), 600e6);
        assertTrue(handler.releasedSeen());
        assertFalse(handler.fixpointBroken());
    }

    function test_handlerReachesRecovery() public {
        handler.vote(0, 0);
        handler.vote(1, 0);
        handler.elapse(3 days);
        handler.distribute();
        assertEq(v.state(), PolicyCodec.RELEASED_RECOVER);
        assertEq(usdt.balanceOf(newWallet), TOTAL);
        assertTrue(handler.releasedSeen());
        assertFalse(handler.fixpointBroken());
    }
}
```

- [ ] **Step 2: Chạy invariant**

Run: `cd contracts && forge test --match-contract VaultInvariantTest -vv`
Expected: 6 invariant và 2 test PASS (128 run × độ sâu 64 theo `foundry.toml`). Nếu một invariant hỏng, Foundry in chuỗi lời gọi đã thu gọn; sửa code ở Task 8/9, không nới invariant.

Run: `cd contracts && forge test`
Expected: toàn bộ test Task 6–11 PASS.

- [ ] **Step 3: Commit**

```bash
git add contracts/test/Invariant.t.sol
git commit -m "test(contracts): invariants I1-I6 over random role and time sequences" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```


---

### Task 12: Thư viện tape-out, vá REF và fork test với Circuits thật

**Files:**
- Create: `contracts/script/lib/ITapeOut.sol`, `contracts/script/lib/NetlistPatch.sol`, `contracts/script/lib/TapeoutFlow.sol`
- Test: `contracts/test/NetlistPatch.t.sol`, `contracts/test/Fork.t.sol`

**Interfaces:**
- Consumes: `ICPU`, `PolicyCodec` (Task 6), `PolicyModel` (Task 6), `AtropyleVault` (Task 9), `AtropyleFactory` (Task 10), `VaultConfig` (Task 7), JSON trong `contracts/circuits/` (Task 5: khoá `netlist`, `nIn`, `nOut`, `nand`, `latch`, `gateCount`, `refOffsets`, `refTargets`; `vectors.json` có `states`, `inputs`, `next`, `out`).
- Produces (Task 13 dùng nguyên văn):
  - `interface ITapeOutFactory { createCPU(string,string,string,uint256 supplyCap,uint256 mintPrice) returns (address); deployFee(); bem(); cpuCount(); cpuAt(uint256); isCPU(address); }`, `interface ITapeOutCircuits is ICPU { tapeout(bytes,uint32,uint32) payable returns (uint256); TAPEOUT_FEE(); nextId(); name(); symbol(); }`, `interface ITransistors { mint(uint256,uint256); NAND(); LATCH(); mintPrice(); protocolFee(); balanceOf(address,uint256); creator(); circuits(); }`, `interface IBeaconOwner { owner(); }`.
  - `library NetlistPatch { function patch(bytes memory nl, uint256[] memory offsets, uint256[] memory targets, address cpu, uint64[2] memory ids) internal pure returns (bytes memory); error NotARef(uint256 offset); error BadTarget(uint256 index); error LengthMismatch(); }`.
  - `library TapeoutFlow` (mọi hàm `internal`, nên lời gọi đi ra từ chính script hoặc test đang chạy, tức từ ví ký khi `--broadcast`):
    - Hằng: `FACTORY`, `BEM`, `FROZEN_CIRCUIT_BEACON`, `BEACON_SLOT`, `USDT0`, `USDC`, `USDG`, `NAME = "Atropyle"`, `SYMBOL = "ATRO"`, `SUPPLY = 10_000`, `STORY`, `POLICY_IN = 23`, `POLICY_OUT = 3`, `POLICY_STATE = 3`.
    - `struct CircuitFile { bytes netlist; uint32 nIn; uint32 nOut; uint256 nand; uint256 latch; uint32 gateCount; }`, `load(string file) view returns (CircuitFile)`.
    - `feeTokens() pure returns (address[])` = [USDT0, USDC, USDG].
    - `createProcessor() returns (address created)`; `cpuOf(address created) view returns (address cpu)`; `requireAtropyleCpu(address cpu, address creator) view`.
    - `tapeoutSubs(address cpu, address me, uint256 kofnId, uint256 ge4Id) returns (uint256, uint256)` (id khác 0 nghĩa là đã tape-out, bỏ qua).
    - `requireSubs(address cpu, uint256 kofnId, uint256 ge4Id) view`; `policyNetlist(address cpu, uint256 kofnId, uint256 ge4Id) view returns (bytes)`.
    - `tapeoutPolicy(address cpu, address me, uint256 kofnId, uint256 ge4Id) returns (uint256 policyId)`; `requirePolicy(address cpu, uint256 policyId, uint256 kofnId, uint256 ge4Id, uint256 vectorCount) view`.

Biến môi trường dùng chung cho fork test và script (Task 13, 14): `XLAYER_FORK_RPC`, `DEPLOYER`, `ATRO_CPU`, `KOFN_ID`, `GE4_ID`, `POLICY_ID`, `TREASURY`, `VAULT_IMPL`, `ATRO_FACTORY`, `SMOKE_HEIR`, `SMOKE_VAULT`. (`ATRO_FACTORY` là factory của Atropyle; hằng `TapeoutFlow.FACTORY` là factory của TapeOut.) Đều là địa chỉ hoặc số công khai, không bao giờ là khoá.

- [ ] **Step 1: Kiểm hợp đồng TapeOut đang chạy (chỉ đọc)**

Mã nguồn bản Transistors mới chưa verify, nên xác nhận selector trước khi viết interface:

```bash
cd contracts
RPC=https://rpc.xlayer.tech
code=$(cast code 0x44Ebf3345bcf9aB329e7a28E53fd8EcfAd1a5EFE --rpc-url $RPC)
for s in "mint(uint256,uint256)" "protocolFee()" "mintPrice()" "creator()" "circuits()" "NAND()" "LATCH()" "balanceOf(address,uint256)"; do
  sel=$(cast sig "$s"); echo "$s $sel $(echo "$code" | grep -c "${sel#0x}")"
done
cast call 0x1f09DAeFA827f02CBb40967cc91b259763760761 "deployFee()(uint256)" --rpc-url $RPC
cast call 0x1f09DAeFA827f02CBb40967cc91b259763760761 "bem()(address)" --rpc-url $RPC
cast call 0x1f09DAeFA827f02CBb40967cc91b259763760761 "cpuCount()(uint256)" --rpc-url $RPC
CPU0=$(cast call 0x1f09DAeFA827f02CBb40967cc91b259763760761 "cpuAt(uint256)(address)" 0 --rpc-url $RPC)
cast call 0x1f09DAeFA827f02CBb40967cc91b259763760761 "isCPU(address)(bool)" $CPU0 --rpc-url $RPC
T0=$(cast call $CPU0 "transistors()(address)" --rpc-url $RPC); echo "$CPU0 -> $T0"
cast call $CPU0 "TAPEOUT_FEE()(uint256)" --rpc-url $RPC
cast storage $CPU0 0xa3f0ad74e5423aebfd80d3ef4346578335a9a72aeaee59ff6cb3582b35133d50 --rpc-url $RPC
cast call 0xf70d1ed4f62CF3780157B0b421b7E2F45bD0991C "owner()(address)" --rpc-url $RPC
for t in 0x779Ded0c9e1022225f8E0630b35a9b54bE713736 0xB6CEceAB302E2E4948951eE7843FC24E92933061 0x4ae46a509F6b1D9056937BA4500cb143933D2dc8; do
  cast call $t "decimals()(uint8)" --rpc-url $RPC
done
```

Expected: mỗi selector đếm được ≥ 1; `deployFee` = `10000000`; `bem` = `0x60e62Efa9405d6873C5deaBD4E6CC91c25363952`; `isCPU(cpuAt(0))` = `true` (tức `isCPU` nhận địa chỉ Circuits, không phải Transistors); `TAPEOUT_FEE` = `1300000000000000`; beacon owner = `0x0000000000000000000000000000000000000000`; `decimals` của USDT0, USDC, USDG đều là `6` (spec §14). Có giá trị nào khác thì **dừng**, ghi lại đầu ra và báo người dùng trước khi viết tiếp (spec §2).

- [ ] **Step 2: Viết test thất bại cho `NetlistPatch`**

`contracts/test/NetlistPatch.t.sol`:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {NetlistPatch} from "../script/lib/NetlistPatch.sol";

/// @dev External wrapper so vm.expectRevert sees the library revert one call deeper.
contract PatchHarness {
    function patch(bytes memory nl, uint256[] memory offsets, uint256[] memory targets, address cpu, uint64[2] memory ids)
        external
        pure
        returns (bytes memory)
    {
        return NetlistPatch.patch(nl, offsets, targets, cpu, ids);
    }
}

contract NetlistPatchTest is Test {
    address internal constant CPU = 0x1111111111111111111111111111111111111111;
    PatchHarness internal h;

    function setUp() public {
        h = new PatchHarness();
    }

    function _one(uint256 x) internal pure returns (uint256[] memory a) {
        a = new uint256[](1);
        a[0] = x;
    }

    /// NAND(0,1) followed by REF(cpu 0, id 0, nIns 1, nOut 1, ins [2]); the cpu field starts at byte 8.
    function _tiny() internal pure returns (bytes memory) {
        return bytes.concat(hex"00000000000001", hex"02", new bytes(28), hex"0101000002");
    }

    function test_patchesCpuAndIdBigEndian() public view {
        bytes memory nl = _tiny();
        bytes memory out = h.patch(nl, _one(8), _one(1), CPU, [uint64(7), uint64(0x0102030405060708)]);
        bytes memory want = bytes.concat(
            hex"00000000000001", hex"02", bytes20(CPU), bytes8(uint64(0x0102030405060708)), hex"0101000002"
        );
        assertEq(out, want);
        assertEq(nl, _tiny()); // input is copied, not modified
    }

    function test_rejectsBadSites() public {
        bytes memory nl = _tiny();
        uint64[2] memory ids = [uint64(1), uint64(2)];

        vm.expectRevert(abi.encodeWithSelector(NetlistPatch.NotARef.selector, uint256(3)));
        h.patch(nl, _one(3), _one(0), CPU, ids);

        vm.expectRevert(abi.encodeWithSelector(NetlistPatch.NotARef.selector, uint256(0)));
        h.patch(nl, _one(0), _one(0), CPU, ids);

        vm.expectRevert(abi.encodeWithSelector(NetlistPatch.NotARef.selector, nl.length));
        h.patch(nl, _one(nl.length), _one(0), CPU, ids);

        vm.expectRevert(abi.encodeWithSelector(NetlistPatch.BadTarget.selector, uint256(0)));
        h.patch(nl, _one(8), _one(2), CPU, ids);

        vm.expectRevert(NetlistPatch.LengthMismatch.selector);
        h.patch(nl, _one(8), new uint256[](0), CPU, ids);
    }

    /// The template carries placeholder REFs (cpu 0x0, ids 1 and 2): patching them back is the identity.
    function test_realTemplateRoundTrips() public view {
        string memory json = vm.readFile(string.concat(vm.projectRoot(), "/circuits/policy.template.json"));
        bytes memory tpl = vm.parseJsonBytes(json, ".netlist");
        uint256[] memory offsets = vm.parseJsonUintArray(json, ".refOffsets");
        uint256[] memory targets = vm.parseJsonUintArray(json, ".refTargets");
        assertEq(offsets.length, 3);

        uint64[2] memory placeholder = [uint64(1), uint64(2)];
        assertEq(h.patch(tpl, offsets, targets, address(0), placeholder), tpl);

        uint64[2] memory live = [uint64(5), uint64(6)];
        bytes memory out = h.patch(tpl, offsets, targets, CPU, live);
        assertEq(out.length, tpl.length);
        for (uint256 r; r < offsets.length; ++r) {
            uint256 o = offsets[r];
            for (uint256 i; i < 20; ++i) {
                assertEq(uint8(out[o + i]), 0x11);
            }
            assertEq(uint8(out[o + 27]), targets[r] == 0 ? 5 : 6);
        }
        assertEq(h.patch(out, offsets, targets, address(0), placeholder), tpl);
    }
}
```

- [ ] **Step 3: Chạy test, xác nhận thất bại**

Run: `cd contracts && forge test --match-contract NetlistPatchTest`
Expected: FAIL khi biên dịch, không tìm thấy `../script/lib/NetlistPatch.sol`.

- [ ] **Step 4: Viết `ITapeOut.sol` và `NetlistPatch.sol`**

`contracts/script/lib/ITapeOut.sol`:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ICPU} from "../../src/interfaces/ICPU.sol";

/// @notice Live TapeOut contracts on X Layer, only the members the deploy flow needs.
interface ITapeOutFactory {
    function createCPU(
        string calldata name,
        string calldata symbol,
        string calldata story,
        uint256 supplyCap,
        uint256 mintPrice
    ) external returns (address);
    function deployFee() external view returns (uint256);
    function bem() external view returns (address);
    function cpuCount() external view returns (uint256);
    function cpuAt(uint256 index) external view returns (address);
    function isCPU(address cpu) external view returns (bool);
}

interface ITapeOutCircuits is ICPU {
    function tapeout(bytes calldata nl, uint32 nIn, uint32 nOut) external payable returns (uint256 circuitId);
    function TAPEOUT_FEE() external view returns (uint256);
    function nextId() external view returns (uint256);
    function name() external view returns (string memory);
    function symbol() external view returns (string memory);
}

/// @dev New implementation: mint pulls BEM (mintPrice * amount + protocolFee) via transferFrom.
interface ITransistors {
    function mint(uint256 id, uint256 amount) external;
    function NAND() external view returns (uint256);
    function LATCH() external view returns (uint256);
    function mintPrice() external view returns (uint256);
    function protocolFee() external view returns (uint256);
    function balanceOf(address account, uint256 id) external view returns (uint256);
    function creator() external view returns (address);
    function circuits() external view returns (address);
}

interface IBeaconOwner {
    function owner() external view returns (address);
}
```

`contracts/script/lib/NetlistPatch.sol`:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @notice Writes the live processor address and circuit ids into the placeholder REFs of a netlist.
/// @dev REF layout: 0x02 cpu:20 id:u64(big-endian) nIns:u8 nOut:u8 ins:u24*. Offsets point at the cpu field.
library NetlistPatch {
    error NotARef(uint256 offset);
    error BadTarget(uint256 index);
    error LengthMismatch();

    function patch(bytes memory nl, uint256[] memory offsets, uint256[] memory targets, address cpu, uint64[2] memory ids)
        internal
        pure
        returns (bytes memory out)
    {
        if (offsets.length != targets.length) revert LengthMismatch();
        out = bytes.concat(nl); // copy
        bytes20 c = bytes20(cpu);
        for (uint256 r; r < offsets.length; ++r) {
            uint256 o = offsets[r];
            if (o == 0 || o + 28 > out.length || out[o - 1] != bytes1(0x02)) revert NotARef(o);
            if (targets[r] > 1) revert BadTarget(r);
            uint64 id = ids[targets[r]];
            for (uint256 i; i < 20; ++i) {
                out[o + i] = c[i];
            }
            for (uint256 i; i < 8; ++i) {
                out[o + 20 + i] = bytes1(uint8(id >> (8 * (7 - i))));
            }
        }
    }
}
```

- [ ] **Step 5: Chạy test**

Run: `cd contracts && forge test --match-contract NetlistPatchTest -vv`
Expected: 3 test PASS.

- [ ] **Step 6: Viết fork test (thất bại)**

`contracts/test/Fork.t.sol`:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test, console2} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ICPU} from "../src/interfaces/ICPU.sol";
import {PolicyCodec} from "../src/PolicyCodec.sol";
import {AtropyleVault} from "../src/AtropyleVault.sol";
import {AtropyleFactory} from "../src/AtropyleFactory.sol";
import {VaultConfig} from "../src/vault/VaultConfig.sol";
import {PolicyModel} from "./mocks/PolicyModel.sol";
import {TapeoutFlow} from "../script/lib/TapeoutFlow.sol";

/// @notice Runs only with XLAYER_FORK_RPC. Without ATRO_CPU it creates a fresh processor on the fork and
///         tapes out all three circuits; with ATRO_CPU/KOFN_ID/GE4_ID/POLICY_ID/DEPLOYER it checks the live ones.
contract ForkTest is Test {
    using SafeERC20 for IERC20;

    address internal deployer = makeAddr("deployer");
    address internal owner = makeAddr("forkOwner");
    address internal heirA = makeAddr("forkHeirA");
    address internal heirB = makeAddr("forkHeirB");
    address internal g1 = makeAddr("forkG1");
    address internal g2 = makeAddr("forkG2");
    address internal g3 = makeAddr("forkG3");
    address internal newWallet = makeAddr("forkNewWallet");
    address internal treasury = makeAddr("forkTreasury");

    address internal cpu;
    uint256 internal kofnId;
    uint256 internal ge4Id;
    uint256 internal policyId;

    function setUp() public {
        string memory rpc = vm.envOr("XLAYER_FORK_RPC", string(""));
        if (bytes(rpc).length == 0) {
            vm.skip(true);
            return;
        }
        vm.createSelectFork(rpc);

        cpu = vm.envOr("ATRO_CPU", address(0));
        if (cpu != address(0)) {
            TapeoutFlow.requireAtropyleCpu(cpu, vm.envAddress("DEPLOYER"));
            kofnId = vm.envUint("KOFN_ID");
            ge4Id = vm.envUint("GE4_ID");
            policyId = vm.envUint("POLICY_ID");
            TapeoutFlow.requireSubs(cpu, kofnId, ge4Id);
            TapeoutFlow.requirePolicy(cpu, policyId, kofnId, ge4Id, 64);
            return;
        }

        deal(TapeoutFlow.BEM, deployer, 1e8); // 1 BEM
        vm.deal(deployer, 1 ether);
        vm.startPrank(deployer, deployer);
        cpu = TapeoutFlow.cpuOf(TapeoutFlow.createProcessor());
        TapeoutFlow.requireAtropyleCpu(cpu, deployer);
        (kofnId, ge4Id) = TapeoutFlow.tapeoutSubs(cpu, deployer, 0, 0);
        policyId = TapeoutFlow.tapeoutPolicy(cpu, deployer, kofnId, ge4Id);
        vm.stopPrank();
    }

    function test_circuitsHaveSpecShape() public view {
        (uint32 nIn, uint32 nOut, uint32 nState, uint32 gates) = ICPU(cpu).circuitInfo(policyId);
        assertEq(nIn, 23);
        assertEq(nOut, 3);
        assertEq(nState, 3);
        assertLe(gates, 230);
        (nIn, nOut, nState, gates) = ICPU(cpu).circuitInfo(kofnId);
        assertEq(abi.encode(nIn, nOut, nState, gates), abi.encode(uint32(8), uint32(1), uint32(0), uint32(41)));
        (nIn, nOut, nState, gates) = ICPU(cpu).circuitInfo(ge4Id);
        assertEq(abi.encode(nIn, nOut, nState, gates), abi.encode(uint32(8), uint32(1), uint32(0), uint32(25)));
    }

    /// forge-config: default.fuzz.runs = 10000
    function testFuzz_chainMatchesModel(uint8 s, uint24 w) public view {
        _checkStep(s & 7, w & 0x7fffff);
    }

    /// Every state code against every input class that changes a transition (spec §9):
    /// 8 states x idle {0, T, 15} x inh {1, 2 votes} x rec {0, 1, 2 votes} x k {0, 2} x alive x windowDone.
    function test_everyTransitionClassOnChain() public view {
        uint8[3] memory idles = [0, 3, 15];
        uint8[3] memory recs = [0, 1, 3];
        for (uint256 i; i < 8 * 144; ++i) {
            uint256 x = i;
            uint8 s = uint8(x % 8);
            x /= 8;
            uint8 idle = idles[x % 3];
            x /= 3;
            uint8 inh = x % 2 == 0 ? 1 : 3;
            x /= 2;
            uint8 rec = recs[x % 3];
            x /= 3;
            uint8 k = x % 2 == 0 ? 0 : 2;
            x /= 2; // 0..3 remain: alive and windowDone
            PolicyCodec.Inputs memory inp = PolicyCodec.Inputs({
                idle: idle,
                threshold: 3,
                inhVotes: inh,
                recVotes: rec,
                k: k,
                alive: x % 2 == 1,
                windowDone: x / 2 == 1
            });
            _checkStep(s, PolicyCodec.toWord(inp));
        }
    }

    function test_allVectorsOnChain() public view {
        TapeoutFlow.requirePolicy(cpu, policyId, kofnId, ge4Id, 512);
    }

    function test_stepGas() public view {
        bytes memory st = PolicyCodec.encodeState(PolicyCodec.GRACE);
        bytes memory inp = PolicyCodec.packWord(0x5f1234);
        uint256 g0 = gasleft();
        ICPU(cpu).step(policyId, st, inp);
        uint256 used = g0 - gasleft();
        console2.log("AtropylePolicy step gas", used);
        assertLt(used, 1_500_000);
    }

    function test_endToEndInheritanceOnRealCircuit() public {
        AtropyleVault v = _newVault(40e6);
        vm.warp(block.timestamp + 3 days);
        v.poke();
        assertEq(v.state(), PolicyCodec.GRACE);
        vm.prank(g1);
        v.attestDeath(true);
        vm.prank(g2);
        v.attestDeath(true);
        vm.warp(block.timestamp + 3 days);
        assertTrue(v.distribute());
        assertEq(v.state(), PolicyCodec.RELEASED_INHERIT);
        assertEq(IERC20(TapeoutFlow.USDT0).balanceOf(heirA), 24e6);
        assertEq(IERC20(TapeoutFlow.USDT0).balanceOf(heirB), 16e6);
    }

    function test_endToEndRecoveryOnRealCircuit() public {
        AtropyleVault v = _newVault(60e6);
        vm.prank(g1);
        v.voteRecovery(newWallet);
        vm.prank(g2);
        v.voteRecovery(newWallet);
        assertEq(v.state(), PolicyCodec.RECOVERY);
        vm.warp(block.timestamp + 3 days);
        assertTrue(v.distribute());
        assertEq(v.state(), PolicyCodec.RELEASED_RECOVER);
        assertEq(IERC20(TapeoutFlow.USDT0).balanceOf(newWallet), 60e6);
    }

    function _checkStep(uint8 s, uint24 w) internal view {
        (bytes memory ns, bytes memory out) =
            ICPU(cpu).step(policyId, PolicyCodec.encodeState(s), PolicyCodec.packWord(w));
        (uint8 n, uint8 o) = PolicyModel.step(s, w);
        assertEq(ns.length, 1);
        assertEq(out.length, 1);
        assertEq(PolicyCodec.firstByte(ns), n, "next");
        assertEq(PolicyCodec.firstByte(out), o, "out");
    }

    function _cfg(address token) internal view returns (VaultConfig.Config memory c) {
        c.heirs = new VaultConfig.Heir[](2);
        c.heirs[0] = VaultConfig.Heir(heirA, 6000);
        c.heirs[1] = VaultConfig.Heir(heirB, 4000);
        c.guardians = new address[](3);
        c.guardians[0] = g1;
        c.guardians[1] = g2;
        c.guardians[2] = g3;
        c.k = 2;
        c.recoveryEnabled = true;
        c.timing = VaultConfig.Timing(1 days, 3, 3 days);
        c.assets = new VaultConfig.Asset[](1);
        c.assets[0] = VaultConfig.Asset(VaultConfig.Kind.ERC20, token, 0, 0);
    }

    /// Real factory with the real fee tokens; the owner pays the early fee and approves `allowance`.
    function _newVault(uint256 allowance) internal returns (AtropyleVault v) {
        address[] memory fee = TapeoutFlow.feeTokens();
        AtropyleFactory f = new AtropyleFactory(address(new AtropyleVault()), cpu, policyId, treasury, fee);
        for (uint256 i; i < fee.length; ++i) {
            assertEq(f.earlyFee(fee[i]), 1_990_000);
            assertEq(f.fullFee(fee[i]), 9_900_000);
        }
        IERC20 usdt0 = IERC20(TapeoutFlow.USDT0);
        deal(address(usdt0), owner, 100e6);
        VaultConfig.Config memory c = _cfg(address(usdt0));
        vm.startPrank(owner);
        usdt0.forceApprove(address(f), type(uint256).max);
        v = AtropyleVault(f.createVault(c, bytes32("fork"), false, address(usdt0)));
        usdt0.forceApprove(address(v), allowance);
        vm.stopPrank();
        assertEq(usdt0.balanceOf(treasury), 1_990_000);
    }
}
```

Run: `cd contracts && forge test --match-contract ForkTest`
Expected: FAIL khi biên dịch, không tìm thấy `../script/lib/TapeoutFlow.sol`.

- [ ] **Step 7: Viết `TapeoutFlow.sol`**

`contracts/script/lib/TapeoutFlow.sol`:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Vm} from "forge-std/Vm.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ICPU} from "../../src/interfaces/ICPU.sol";
import {ITapeOutFactory, ITapeOutCircuits, ITransistors, IBeaconOwner} from "./ITapeOut.sol";
import {NetlistPatch} from "./NetlistPatch.sol";

/// @notice Deploy steps shared by the scripts and the fork test. All functions are internal, so every call
///         leaves from the running script or test (the signing wallet under --broadcast).
library TapeoutFlow {
    Vm private constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    address internal constant FACTORY = 0x1f09DAeFA827f02CBb40967cc91b259763760761;
    address internal constant BEM = 0x60e62Efa9405d6873C5deaBD4E6CC91c25363952;
    address internal constant FROZEN_CIRCUIT_BEACON = 0xf70d1ed4f62CF3780157B0b421b7E2F45bD0991C;
    bytes32 internal constant BEACON_SLOT = 0xa3f0ad74e5423aebfd80d3ef4346578335a9a72aeaee59ff6cb3582b35133d50;
    address internal constant USDT0 = 0x779Ded0c9e1022225f8E0630b35a9b54bE713736;
    address internal constant USDC = 0xB6CEceAB302E2E4948951eE7843FC24E92933061;
    address internal constant USDG = 0x4ae46a509F6b1D9056937BA4500cb143933D2dc8;

    string internal constant NAME = "Atropyle";
    string internal constant SYMBOL = "ATRO";
    uint256 internal constant SUPPLY = 10_000;
    string internal constant STORY =
        "Atropyle: a frozen state-machine policy for non-custodial inheritance and wallet recovery on X Layer. "
        "KofN5 and Ge4 are public sub-circuits anyone can REF.";

    uint32 internal constant POLICY_IN = 23;
    uint32 internal constant POLICY_OUT = 3;
    uint32 internal constant POLICY_STATE = 3;

    struct CircuitFile {
        bytes netlist;
        uint32 nIn;
        uint32 nOut;
        uint256 nand;
        uint256 latch;
        uint32 gateCount;
    }

    function load(string memory file) internal view returns (CircuitFile memory c) {
        string memory json = _read(file);
        c.netlist = vm.parseJsonBytes(json, ".netlist");
        c.nIn = uint32(vm.parseJsonUint(json, ".nIn"));
        c.nOut = uint32(vm.parseJsonUint(json, ".nOut"));
        c.nand = vm.parseJsonUint(json, ".nand");
        c.latch = vm.parseJsonUint(json, ".latch");
        c.gateCount = uint32(vm.parseJsonUint(json, ".gateCount"));
    }

    function feeTokens() internal pure returns (address[] memory t) {
        t = new address[](3);
        t[0] = USDT0;
        t[1] = USDC;
        t[2] = USDG;
    }

    // ------------------------------------------------------------------ processor

    /// @dev Spec §10 step 1: approve deployFee in BEM, then createCPU(NAME, SYMBOL, STORY, 10000, 0).
    function createProcessor() internal returns (address created) {
        ITapeOutFactory f = ITapeOutFactory(FACTORY);
        require(f.bem() == BEM, "factory BEM changed");
        SafeERC20.forceApprove(IERC20(BEM), FACTORY, f.deployFee());
        created = f.createCPU(NAME, SYMBOL, STORY, SUPPLY, 0);
    }

    /// @notice Accepts whatever createCPU returned (the Circuits or the Transistors) and returns the Circuits.
    function cpuOf(address created) internal view returns (address) {
        ITapeOutFactory f = ITapeOutFactory(FACTORY);
        if (f.isCPU(created)) return created;
        try ITransistors(created).circuits() returns (address c) {
            if (c != address(0) && f.isCPU(c)) return c;
        } catch {}
        uint256 n = f.cpuCount();
        for (uint256 i = n; i > 0 && i + 8 > n; --i) {
            address c = f.cpuAt(i - 1);
            if (ICPU(c).transistors() == created) return c;
        }
        revert("cpu not found");
    }

    /// @dev Spec §2: the processor must be ours and its circuits proxy must use the frozen beacon.
    function requireAtropyleCpu(address cpu, address creator) internal view {
        require(ITapeOutFactory(FACTORY).isCPU(cpu), "not a TapeOut CPU");
        ITapeOutCircuits c = ITapeOutCircuits(cpu);
        require(keccak256(bytes(c.name())) == keccak256(bytes(NAME)), "name");
        require(keccak256(bytes(c.symbol())) == keccak256(bytes(SYMBOL)), "symbol");
        ITransistors t = ITransistors(c.transistors());
        require(t.creator() == creator, "creator");
        require(t.circuits() == cpu, "transistors/circuits pair");
        address beacon = address(uint160(uint256(vm.load(cpu, BEACON_SLOT))));
        require(beacon == FROZEN_CIRCUIT_BEACON, "STOP: circuits beacon is not the frozen one (spec 2)");
        require(IBeaconOwner(beacon).owner() == address(0), "STOP: beacon has an owner (spec 2)");
    }

    // ------------------------------------------------------------------ circuits

    function tapeoutSubs(address cpu, address me, uint256 kofnId, uint256 ge4Id) internal returns (uint256, uint256) {
        if (kofnId == 0) kofnId = _tapeout(cpu, me, load("kofn5.json"));
        if (ge4Id == 0) ge4Id = _tapeout(cpu, me, load("ge4.json"));
        requireSubs(cpu, kofnId, ge4Id);
        return (kofnId, ge4Id);
    }

    function requireSubs(address cpu, uint256 kofnId, uint256 ge4Id) internal view {
        CircuitFile memory k = load("kofn5.json");
        _requireStored(cpu, kofnId, k.netlist, k.nIn, k.nOut, 0, k.gateCount);
        CircuitFile memory g = load("ge4.json");
        _requireStored(cpu, ge4Id, g.netlist, g.nIn, g.nOut, 0, g.gateCount);
    }

    function policyNetlist(address cpu, uint256 kofnId, uint256 ge4Id) internal view returns (bytes memory) {
        string memory json = _read("policy.template.json");
        return NetlistPatch.patch(
            vm.parseJsonBytes(json, ".netlist"),
            vm.parseJsonUintArray(json, ".refOffsets"),
            vm.parseJsonUintArray(json, ".refTargets"),
            cpu,
            [uint64(kofnId), uint64(ge4Id)]
        );
    }

    function tapeoutPolicy(address cpu, address me, uint256 kofnId, uint256 ge4Id)
        internal
        returns (uint256 policyId)
    {
        requireSubs(cpu, kofnId, ge4Id);
        CircuitFile memory p = load("policy.template.json");
        require(p.nIn == POLICY_IN && p.nOut == POLICY_OUT && p.latch == POLICY_STATE, "not policy-shaped");
        p.netlist = policyNetlist(cpu, kofnId, ge4Id);
        policyId = _tapeout(cpu, me, p);
        requirePolicy(cpu, policyId, kofnId, ge4Id, 64);
    }

    /// @notice Stored shape and bytes match the patched template, and the first `vectorCount` vectors replay.
    function requirePolicy(address cpu, uint256 policyId, uint256 kofnId, uint256 ge4Id, uint256 vectorCount)
        internal
        view
    {
        CircuitFile memory p = load("policy.template.json");
        _requireStored(
            cpu, policyId, policyNetlist(cpu, kofnId, ge4Id), POLICY_IN, POLICY_OUT, POLICY_STATE, p.gateCount
        );
        _requireVectors(cpu, policyId, vectorCount);
    }

    // ------------------------------------------------------------------ internals

    function _tapeout(address cpu, address me, CircuitFile memory c) private returns (uint256 id) {
        ITapeOutCircuits circ = ITapeOutCircuits(cpu);
        ITransistors t = ITransistors(circ.transistors());
        _mintDeficit(t, me, t.NAND(), c.nand);
        _mintDeficit(t, me, t.LATCH(), c.latch);
        id = circ.tapeout{value: circ.TAPEOUT_FEE()}(c.netlist, c.nIn, c.nOut);
    }

    /// @dev Mints only what `me` is missing, so a re-run after a partial failure costs nothing extra.
    function _mintDeficit(ITransistors t, address me, uint256 id, uint256 need) private {
        uint256 have = t.balanceOf(me, id);
        if (have >= need) return;
        uint256 amount = need - have;
        SafeERC20.forceApprove(IERC20(BEM), address(t), t.mintPrice() * amount + t.protocolFee());
        t.mint(id, amount);
    }

    function _requireStored(
        address cpu,
        uint256 id,
        bytes memory nl,
        uint32 nIn,
        uint32 nOut,
        uint32 nState,
        uint32 gateCount
    ) private view {
        (uint32 a, uint32 b, uint32 s, uint32 g) = ICPU(cpu).circuitInfo(id);
        require(a == nIn && b == nOut && s == nState && g == gateCount, "circuitInfo mismatch");
        require(keccak256(ICPU(cpu).netlist(id)) == keccak256(nl), "netlist mismatch");
    }

    function _requireVectors(address cpu, uint256 policyId, uint256 count) private view {
        string memory json = _read("vectors.json");
        uint256[] memory s = vm.parseJsonUintArray(json, ".states");
        uint256[] memory v = vm.parseJsonUintArray(json, ".inputs");
        uint256[] memory n = vm.parseJsonUintArray(json, ".next");
        uint256[] memory o = vm.parseJsonUintArray(json, ".out");
        require(count <= s.length, "not enough vectors");
        for (uint256 i; i < count; ++i) {
            (bytes memory ns, bytes memory out) =
                ICPU(cpu).step(policyId, _byte(s[i]), _word(v[i]));
            require(ns.length == 1 && uint8(ns[0]) == n[i], "vector next");
            require(out.length == 1 && uint8(out[0]) == o[i], "vector out");
        }
    }

    function _byte(uint256 x) private pure returns (bytes memory b) {
        b = new bytes(1);
        b[0] = bytes1(uint8(x));
    }

    function _word(uint256 w) private pure returns (bytes memory b) {
        b = new bytes(3);
        b[0] = bytes1(uint8(w));
        b[1] = bytes1(uint8(w >> 8));
        b[2] = bytes1(uint8(w >> 16));
    }

    function _read(string memory file) private view returns (string memory) {
        return vm.readFile(string.concat(vm.projectRoot(), "/circuits/", file));
    }
}
```

`_byte`/`_word` lặp lại `PolicyCodec.encodeState`/`packWord` có chủ ý: thư viện deploy không phụ thuộc code sản phẩm ngoài `ICPU`.

- [ ] **Step 8: Chạy test fork**

Run: `cd contracts && forge test --match-contract ForkTest`
Expected: mọi test hiện `[SKIP]` (không có `XLAYER_FORK_RPC`).

Run: `cd contracts && XLAYER_FORK_RPC=https://rpc.xlayer.tech forge test --match-contract ForkTest -vv`
Expected: 7 test PASS, gồm `testFuzz_chainMatchesModel` với 10000 run; log in `AtropylePolicy step gas N` với N < 1 500 000. Ghi lại N để đưa vào README ở Task 13. Nếu RPC chính lỗi, dùng `https://xlayerrpc.okx.com`.

Nếu `deal` trên BEM hoặc USDT0 báo không tìm được slot số dư, dừng và báo lại; đừng tự đổi sang ví "cá voi" thật.

Run: `cd contracts && forge test`
Expected: toàn bộ test không cần fork PASS, `ForkTest` SKIP.

- [ ] **Step 9: Commit**

```bash
git add contracts/script/lib/ITapeOut.sol contracts/script/lib/NetlistPatch.sol contracts/script/lib/TapeoutFlow.sol contracts/test/NetlistPatch.t.sol contracts/test/Fork.t.sol
git commit -m "feat(contracts): tape-out flow, REF patching and fork tests on real Circuits" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```


---

### Task 13: Script deploy 01–05, README, CI và gas snapshot

**Files:**
- Create: `contracts/script/01_CreateProcessor.s.sol`, `contracts/script/02_TapeOutSubs.s.sol`, `contracts/script/03_TapeOutPolicy.s.sol`, `contracts/script/04_DeployAtropyle.s.sol`, `contracts/script/05_SmokeDrill.s.sol`
- Create: `contracts/README.md`, `.github/workflows/ci.yml`, `docs/deployments.md`, `contracts/.gas-snapshot` (sinh bằng lệnh)

**Interfaces:**
- Consumes: `TapeoutFlow`, `ITapeOutFactory`, `ITapeOutCircuits`, `ITransistors` (Task 12), `AtropyleVault` (Task 9), `AtropyleFactory` (Task 10), `VaultConfig` (Task 7), `PolicyCodec` (Task 6).
- Produces: năm contract script, mỗi cái có `function run() external`, đọc env và in dòng `export KEY=value` cho bước sau:

  | Script | Contract | Env đọc | In ra |
  |---|---|---|---|
  | `01_CreateProcessor.s.sol` | `CreateProcessor` | `DEPLOYER`; `ATRO_CPU` phải chưa đặt | `ATRO_CPU` |
  | `02_TapeOutSubs.s.sol` | `TapeOutSubs` | `DEPLOYER`, `ATRO_CPU`; tuỳ chọn `KOFN_ID`, `GE4_ID` | `KOFN_ID`, `GE4_ID` |
  | `03_TapeOutPolicy.s.sol` | `TapeOutPolicy` | `DEPLOYER`, `ATRO_CPU`, `KOFN_ID`, `GE4_ID`; `POLICY_ID` phải chưa đặt | `POLICY_ID` |
  | `04_DeployAtropyle.s.sol` | `DeployAtropyle` | `DEPLOYER`, `ATRO_CPU`, `KOFN_ID`, `GE4_ID`, `POLICY_ID`, `TREASURY` | `VAULT_IMPL`, `ATRO_FACTORY` |
  | `05_SmokeDrill.s.sol` | `SmokeDrill` | `DEPLOYER`, `ATRO_FACTORY`, `SMOKE_HEIR` | `SMOKE_VAULT` |

Mọi kiểm tra trạng thái nằm trong `run()` trước hoặc sau `vm.startBroadcast`. Vì forge mô phỏng toàn bộ `run()` trước khi gửi, một `require` hỏng ở bất kỳ đâu làm script dừng mà không gửi giao dịch nào.

- [ ] **Step 1: Viết năm script**

`contracts/script/01_CreateProcessor.s.sol`:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ITapeOutFactory} from "./lib/ITapeOut.sol";
import {TapeoutFlow} from "./lib/TapeoutFlow.sol";

/// @notice Spec §10 steps 1-2: create the ATRO processor, then refuse unless its circuits beacon is frozen.
contract CreateProcessor is Script {
    function run() external {
        require(vm.envOr("ATRO_CPU", address(0)) == address(0), "ATRO_CPU is set: the processor already exists");
        address me = vm.envAddress("DEPLOYER");
        uint256 fee = ITapeOutFactory(TapeoutFlow.FACTORY).deployFee();
        require(IERC20(TapeoutFlow.BEM).balanceOf(me) >= fee, "not enough BEM for deployFee");

        vm.startBroadcast(me);
        address created = TapeoutFlow.createProcessor();
        vm.stopBroadcast();

        address cpu = TapeoutFlow.cpuOf(created);
        TapeoutFlow.requireAtropyleCpu(cpu, me);
        console2.log("createCPU returned", created);
        console2.log(string.concat("export ATRO_CPU=", vm.toString(cpu)));
    }
}
```

`contracts/script/02_TapeOutSubs.s.sol`:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ICPU} from "../src/interfaces/ICPU.sol";
import {ITapeOutCircuits, ITransistors} from "./lib/ITapeOut.sol";
import {TapeoutFlow} from "./lib/TapeoutFlow.sol";

/// @notice Spec §10 steps 3-4a: mint the missing transistors and tape out KofN5 and Ge4.
///         Re-runnable: set KOFN_ID or GE4_ID for a circuit that is already on chain.
contract TapeOutSubs is Script {
    function run() external {
        address me = vm.envAddress("DEPLOYER");
        address cpu = vm.envAddress("ATRO_CPU");
        TapeoutFlow.requireAtropyleCpu(cpu, me);
        uint256 kofnId = vm.envOr("KOFN_ID", uint256(0));
        uint256 ge4Id = vm.envOr("GE4_ID", uint256(0));

        uint256 fee = ITapeOutCircuits(cpu).TAPEOUT_FEE();
        uint256 okb = (kofnId == 0 ? fee : 0) + (ge4Id == 0 ? fee : 0);
        require(me.balance >= okb + 0.005 ether, "not enough OKB for tapeout fees and gas");
        ITransistors t = ITransistors(ICPU(cpu).transistors());
        require(
            IERC20(TapeoutFlow.BEM).balanceOf(me) >= 2 * t.protocolFee() + 66 * t.mintPrice(),
            "not enough BEM to mint transistors"
        );

        vm.startBroadcast(me);
        (kofnId, ge4Id) = TapeoutFlow.tapeoutSubs(cpu, me, kofnId, ge4Id);
        vm.stopBroadcast();

        console2.log(string.concat("export KOFN_ID=", vm.toString(kofnId)));
        console2.log(string.concat("export GE4_ID=", vm.toString(ge4Id)));
    }
}
```

`contracts/script/03_TapeOutPolicy.s.sol`:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {ITapeOutCircuits} from "./lib/ITapeOut.sol";
import {TapeoutFlow} from "./lib/TapeoutFlow.sol";

/// @notice Spec §10 step 4b: patch the policy template with the live ids and tape it out.
contract TapeOutPolicy is Script {
    function run() external {
        require(vm.envOr("POLICY_ID", uint256(0)) == 0, "POLICY_ID is set: the policy already exists");
        address me = vm.envAddress("DEPLOYER");
        address cpu = vm.envAddress("ATRO_CPU");
        uint256 kofnId = vm.envUint("KOFN_ID");
        uint256 ge4Id = vm.envUint("GE4_ID");
        TapeoutFlow.requireAtropyleCpu(cpu, me);
        require(me.balance >= ITapeOutCircuits(cpu).TAPEOUT_FEE() + 0.005 ether, "not enough OKB");

        vm.startBroadcast(me);
        uint256 policyId = TapeoutFlow.tapeoutPolicy(cpu, me, kofnId, ge4Id);
        vm.stopBroadcast();

        console2.log(string.concat("export POLICY_ID=", vm.toString(policyId)));
    }
}
```

`contracts/script/04_DeployAtropyle.s.sol`:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {AtropyleVault} from "../src/AtropyleVault.sol";
import {AtropyleFactory} from "../src/AtropyleFactory.sol";
import {TapeoutFlow} from "./lib/TapeoutFlow.sol";

/// @notice Spec §10 step 5: deploy the vault implementation and the factory against the verified policy.
contract DeployAtropyle is Script {
    function run() external {
        address me = vm.envAddress("DEPLOYER");
        address cpu = vm.envAddress("ATRO_CPU");
        uint256 kofnId = vm.envUint("KOFN_ID");
        uint256 ge4Id = vm.envUint("GE4_ID");
        uint256 policyId = vm.envUint("POLICY_ID");
        address treasury = vm.envAddress("TREASURY");
        TapeoutFlow.requireAtropyleCpu(cpu, me);
        TapeoutFlow.requireSubs(cpu, kofnId, ge4Id);
        TapeoutFlow.requirePolicy(cpu, policyId, kofnId, ge4Id, 64);
        address[] memory fee = TapeoutFlow.feeTokens();

        vm.startBroadcast(me);
        AtropyleVault impl = new AtropyleVault();
        AtropyleFactory factory = new AtropyleFactory(address(impl), cpu, policyId, treasury, fee);
        vm.stopBroadcast();

        for (uint256 i; i < fee.length; ++i) {
            require(factory.earlyFee(fee[i]) == 1_990_000, "early fee");
            require(factory.fullFee(fee[i]) == 9_900_000, "full fee");
        }
        console2.log(string.concat("export VAULT_IMPL=", vm.toString(address(impl))));
        console2.log(string.concat("export ATRO_FACTORY=", vm.toString(address(factory))));
    }
}
```

`contracts/script/05_SmokeDrill.s.sol`:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {AtropyleVault} from "../src/AtropyleVault.sol";
import {AtropyleFactory} from "../src/AtropyleFactory.sol";
import {PolicyCodec} from "../src/PolicyCodec.sol";
import {VaultConfig} from "../src/vault/VaultConfig.sol";

/// @notice Free Drill vault with no assets, then one poke(): proves the real circuit answers step() on mainnet.
contract SmokeDrill is Script {
    function run() external {
        address me = vm.envAddress("DEPLOYER");
        AtropyleFactory factory = AtropyleFactory(vm.envAddress("ATRO_FACTORY"));
        address heir = vm.envAddress("SMOKE_HEIR");
        require(heir != me, "SMOKE_HEIR must differ from DEPLOYER");

        VaultConfig.Config memory c;
        c.heirs = new VaultConfig.Heir[](1);
        c.heirs[0] = VaultConfig.Heir(heir, 10_000);
        c.guardians = new address[](0);
        c.timing = VaultConfig.Timing(60, 2, 60);
        c.assets = new VaultConfig.Asset[](0);
        bytes32 salt = keccak256(abi.encode("smoke", block.timestamp));

        vm.startBroadcast(me);
        address vault = factory.createVault(c, salt, true, address(0));
        AtropyleVault(vault).poke();
        vm.stopBroadcast();

        AtropyleVault.Status memory st = AtropyleVault(vault).status();
        require(AtropyleVault(vault).drill() && st.state == PolicyCodec.ACTIVE, "smoke vault state");
        require(st.expiresAt > block.timestamp, "smoke vault expiry");
        console2.log(string.concat("export SMOKE_VAULT=", vm.toString(vault)));
    }
}
```

- [ ] **Step 2: Biên dịch và kiểm kích thước**

Run: `cd contracts && forge build --sizes`
Expected: biên dịch sạch; dòng `AtropyleVault` và `AtropyleFactory` có runtime size dưới 24 576 byte (cột "Runtime Margin" dương).

Run: `cd contracts && forge test`
Expected: toàn bộ PASS, `ForkTest` SKIP.

- [ ] **Step 3: Lấy số đo**

Chạy và ghi lại bốn con số cho README:

```bash
npm run export -w circuits
cd contracts
forge test --match-test test_worstCaseGasUnderSixMillion -vv
XLAYER_FORK_RPC=https://rpc.xlayer.tech forge test --match-test test_stepGas -vv
forge build --sizes
```

Expected: dòng `wrote … (policy gateCount G)`; log `distribute gas (20 assets x 5 heirs): D`; log `AtropylePolicy step gas S`; kích thước runtime của Vault và Factory. `git status` sau `npm run export` phải sạch (nếu không, JSON đã lệch: quay lại Task 5).

- [ ] **Step 4: Viết `contracts/README.md`**

Thay `G`, `S`, `D`, `V`, `F` trong bảng "Số đo" bằng số vừa đo ở Step 3 (số nguyên, không làm tròn):

````markdown
# Atropyle — contracts

Vault thừa kế và khôi phục ví không giữ tài sản, chạy trên X Layer (chainId 196). Mọi chuyển trạng thái do circuit `AtropylePolicy v1` của processor TapeOut `ATRO` quyết định qua `step()`. Vault không có admin, pause, upgrade, `delegatecall` hay `selfdestruct`.

## Cấu trúc

| Đường dẫn | Vai trò |
|---|---|
| `src/AtropyleVault.sol` | Vault (clone EIP-1167), mỗi chủ ví một cái |
| `src/AtropyleFactory.sol` | Tạo vault, thu phí, chỉ mục vai trò |
| `src/vault/VaultConfig.sol` | Cấu hình và ràng buộc |
| `src/vault/VaultDistribution.sol` | Phân phối chịu lỗi (token blacklist, phí chuyển, không trả `bool`) |
| `src/PolicyCodec.sol` | Định dạng bit state/input/output của policy |
| `circuits/*.json` | Netlist sinh từ `../circuits`, không sửa tay |
| `script/` | Script deploy 01–05 và thư viện dùng chung |

## Lệnh

```bash
forge build --sizes
forge test
XLAYER_FORK_RPC=https://rpc.xlayer.tech forge test --match-contract ForkTest -vv
forge snapshot --no-match-test "invariant_|testFuzz_"
```

Sinh lại netlist (chạy ở gốc repo): `npm run export -w circuits`. Test `export.test.ts` báo lỗi nếu file trong `contracts/circuits/` lệch với builder.

## Số đo

| Hạng mục | Giá trị | Cách đo |
|---|---|---|
| Gate của AtropylePolicy v1 (đã làm phẳng) | G | `npm run export -w circuits` |
| Gas một lần `step` (fork X Layer) | S | `ForkTest.test_stepGas` |
| Gas `distribute()` xấu nhất, 20 tài sản × 5 người | D | `test_worstCaseGasUnderSixMillion` |
| Runtime bytecode Vault / Factory | V / F byte | `forge build --sizes` |

## Triển khai mainnet

Bạn tự ký mọi giao dịch bằng keystore Foundry. Không dán private key vào lệnh, file hay chat. Ví deployer cần ít nhất 0.2 BEM và 0.02 OKB.

Chuẩn bị một lần:

```bash
cast wallet import atropyle-deployer --interactive
export DEPLOYER=0x...     # địa chỉ của keystore vừa nhập
export TREASURY=0x...     # ví nhận phí tạo vault
export SMOKE_HEIR=0x...   # một ví khác DEPLOYER, làm heir cho vault Drill thử
```

Chạy lần lượt trong `contracts/`. Mỗi script in dòng `export …`; dán dòng đó vào terminal trước khi chạy script kế tiếp.

| # | Script | Cần env | In ra |
|---|---|---|---|
| 1 | `01_CreateProcessor` | `DEPLOYER` | `ATRO_CPU` |
| 2 | `02_TapeOutSubs` | `DEPLOYER`, `ATRO_CPU` | `KOFN_ID`, `GE4_ID` |
| 3 | `03_TapeOutPolicy` | `DEPLOYER`, `ATRO_CPU`, `KOFN_ID`, `GE4_ID` | `POLICY_ID` |
| 4 | `04_DeployAtropyle` | thêm `POLICY_ID`, `TREASURY` | `VAULT_IMPL`, `ATRO_FACTORY` |
| 5 | `05_SmokeDrill` | `DEPLOYER`, `ATRO_FACTORY`, `SMOKE_HEIR` | `SMOKE_VAULT` |

```bash
forge script script/01_CreateProcessor.s.sol --rpc-url xlayer --account atropyle-deployer --sender $DEPLOYER --broadcast --slow
```

Các bước 2–5 dùng đúng lệnh này, chỉ đổi tên file.

- Chạy trước một lần không có `--broadcast` để xem mô phỏng.
- RPC từ chối giao dịch EIP-1559 thì thêm `--legacy`.
- Script 01 không gửi gì nếu beacon circuits không phải bản đóng băng `0xf70d1ed4f62CF3780157B0b421b7E2F45bD0991C` (spec §2). Gặp lỗi `STOP: …` thì dừng hẳn và đánh giá lại.
- Script 02 chạy lại được: nếu KofN5 đã lên chain, đặt `export KOFN_ID=…` rồi chạy lại. Script chỉ tape-out phần còn thiếu và chỉ mint số transistor còn thiếu.

Kiểm deployment thật (chỉ đọc, chạy sau bước 4):

```bash
XLAYER_FORK_RPC=https://rpc.xlayer.tech forge test --match-contract ForkTest -vv
```

Verify trên OKLink. Để `OKLINK_API_KEY` trong `contracts/.env` (đã bị `.gitignore` chặn):

```bash
forge verify-contract $VAULT_IMPL src/AtropyleVault.sol:AtropyleVault --chain 196 --verifier oklink --verifier-url https://www.oklink.com/api/v5/explorer/contract/verify-source-code-plugin/XLAYER --verifier-api-key $OKLINK_API_KEY --watch
```

```bash
forge verify-contract $ATRO_FACTORY src/AtropyleFactory.sol:AtropyleFactory --chain 196 --verifier oklink --verifier-url https://www.oklink.com/api/v5/explorer/contract/verify-source-code-plugin/XLAYER --verifier-api-key $OKLINK_API_KEY --constructor-args $(cast abi-encode "constructor(address,address,uint256,address,address[])" $VAULT_IMPL $ATRO_CPU $POLICY_ID $TREASURY "[0x779Ded0c9e1022225f8E0630b35a9b54bE713736,0xB6CEceAB302E2E4948951eE7843FC24E92933061,0x4ae46a509F6b1D9056937BA4500cb143933D2dc8]") --watch
```

Địa chỉ đã deploy ghi ở `../docs/deployments.md`.
````

- [ ] **Step 5: Viết CI và mẫu deployments**

`.github/workflows/ci.yml`:

```yaml
name: ci

on:
  push:
  pull_request:

jobs:
  circuits:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: npm
      - run: npm ci
      - run: npm run typecheck -w circuits
      - run: npm test -w circuits

  contracts:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          submodules: recursive
      - uses: foundry-rs/foundry-toolchain@v1
        with:
          version: v1.9.0
      - run: forge build --sizes
        working-directory: contracts
      - run: forge test
        working-directory: contracts
```

`docs/deployments.md`:

```markdown
# Atropyle — địa chỉ trên X Layer mainnet (chainId 196)

Mọi địa chỉ dưới đây do ví deployer của dự án tạo. Kiểm lại bằng `XLAYER_FORK_RPC=https://rpc.xlayer.tech forge test --match-contract ForkTest -vv` với các biến env tương ứng.

| Thành phần | Giá trị | Giao dịch |
|---|---|---|
| Deployer | — | |
| Processor `ATRO` (Circuits) | — | — |
| Transistors của `ATRO` | — | |
| Beacon circuits (đã đóng băng) | `0xf70d1ed4f62CF3780157B0b421b7E2F45bD0991C` | |
| Circuit `KofN5` | id — | — |
| Circuit `Ge4` | id — | — |
| Circuit `AtropylePolicy v1` | id — | — |
| `AtropyleVault` (implementation) | — | — |
| `AtropyleFactory` | — | — |
| Treasury | — | |
| Vault Drill thử | — | — |

Gas `step` đo trên mainnet: —
```

Các ô `—` được điền ở Task 14 Step 7, sau khi giao dịch thật đã có.

- [ ] **Step 6: Gas snapshot**

Run: `cd contracts && forge snapshot --no-match-test "invariant_|testFuzz_"`
Expected: tạo `contracts/.gas-snapshot`, mỗi test một dòng kèm gas; không test nào FAIL.

- [ ] **Step 7: Commit**

```bash
git add contracts/script/01_CreateProcessor.s.sol contracts/script/02_TapeOutSubs.s.sol contracts/script/03_TapeOutPolicy.s.sol contracts/script/04_DeployAtropyle.s.sol contracts/script/05_SmokeDrill.s.sol contracts/README.md contracts/.gas-snapshot .github/workflows/ci.yml docs/deployments.md
git commit -m "feat(contracts): deploy scripts, runbook, CI and gas snapshot" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 14: Deploy mainnet (người dùng ký)

**Files:**
- Modify: `docs/deployments.md` (điền địa chỉ thật), `contracts/README.md` (số gas `step` trên mainnet nếu khác số fork)

**Interfaces:**
- Consumes: năm script của Task 13; `ForkTest` (Task 12, 11 test); runbook trong `contracts/README.md`: các mục "Triển khai mainnet", "Kiểm treasury trước bước 04", "Đọc lại từ chain sau mỗi bước" và "Diễn tập trên anvil fork". `createCPU` của factory TapeOut trả `(address transistors, address circuits)` (`script/lib/ITapeOut.sol`); `ATRO_CPU` mà script 01 in ra là địa chỉ `circuits`.
- Produces: processor `ATRO`, 3 circuit ID, `AtropyleVault` implementation, `AtropyleFactory` trên mainnet. Plan 2 (web app) và Plan 3 (bot) đọc các giá trị này từ `docs/deployments.md`.

Các bước ghi `[USER]` do người dùng tự làm trong terminal của họ. Agent **không** chạy chúng, không đọc keystore, không hỏi private key hay API key. Các bước `[CLAUDE]` chỉ đọc chain hoặc chạy trên anvil local.

**Runbook trong `contracts/README.md` là nguồn chính.** Task này chỉ nêu thứ tự các bước và những con số phải khớp. Lệnh đầy đủ nằm trong README; khi README và task này khác nhau, làm theo README.

- [ ] **Step 1: [USER] Nạp ví deployer**

Ví deployer có ít nhất 0.2 BEM (`0x60e62Efa9405d6873C5deaBD4E6CC91c25363952`) và 0.02 OKB trên X Layer. Ước tính: `deployFee` 0.1 BEM, bốn lần mint × `protocolFee` 0.01 BEM, ba lần tape-out × 0.0013 OKB, cộng gas deploy (README "Số đo": 0,14 BEM + 0,0039 OKB phí tape-out, đo bằng `test_tapeoutBudget`).

Ví deployer phải là EOA không có code, kể cả code EIP-7702 (README "Triển khai mainnet"). Claude kiểm (chỉ đọc), khi người dùng báo đã nạp và đưa địa chỉ:

```bash
cast code $DEPLOYER --rpc-url https://rpc.xlayer.tech
cast balance $DEPLOYER --ether --rpc-url https://rpc.xlayer.tech
cast call 0x60e62Efa9405d6873C5deaBD4E6CC91c25363952 "balanceOf(address)(uint256)" $DEPLOYER --rpc-url https://rpc.xlayer.tech
```

Expected: `cast code` in đúng `0x` (ví đã nâng cấp EIP-7702 in `0xef0100…`: dừng lại, đổi ví khác); OKB ≥ 0.02; BEM ≥ 20000000 (0.2 BEM, 8 decimals). Kiểm lại `cast code` giữa các bước của Step 5, vì ví có thể bị nâng cấp giữa chừng.

- [ ] **Step 2: [USER] Nhập keystore**

Làm theo đoạn "Chuẩn bị một lần" của README: `cast wallet import atropyle-deployer --interactive`, rồi `export DEPLOYER=…`, `export TREASURY=…`, `export SMOKE_HEIR=…` (đều là địa chỉ công khai). Người dùng tự gõ private key và mật khẩu ở prompt của `cast`. Dùng một shell riêng cho mainnet, không dùng lại shell của phần diễn tập.

- [ ] **Step 3: [CLAUDE] Diễn tập trên anvil fork**

Làm đúng mục "Diễn tập trên anvil fork" của README, trong một shell riêng:
- `anvil --chain-id 31337 --fork-url https://rpc.xlayer.tech`. Phải có `--chain-id 31337`: anvil fork mặc định báo chainId 196, khi đó `--broadcast` ghi vào `broadcast/<script>/196/`, đúng chỗ của bản ghi mainnet.
- Chỉ dùng tài khoản anvil mở khoá sẵn có `cast code` = `0x` (vài tài khoản mặc định đã có code EIP-7702 trên mainnet), cấp BEM cho deployer bằng cách mượn một holder, rồi chạy năm script với `--unlocked`.

Sau bước 04, với `DEPLOYER`, `ATRO_CPU`, `KOFN_ID`, `GE4_ID`, `POLICY_ID`, `ATRO_FACTORY`, `VAULT_IMPL` và `TREASURY` của lần diễn tập đã export, chạy:

```bash
XLAYER_FORK_RPC=http://127.0.0.1:8545 forge test --match-contract ForkTest -vv
```

Expected: cả năm script chạy hết, không `require` nào hỏng; gas từng bước gần số trong README "Số đo" (01 / 02 / 03 / 04 / 05: 845 944 / 989 095 / 852 598 / 4 553 395 / 1 104 004). `ForkTest` chạy ở chế độ live (vì `ATRO_CPU` đã đặt) trên chính factory vừa deploy (vì có `ATRO_FACTORY`): 10 test PASS và 1 SKIP (`test_tapeoutBudget`, chỉ đo khi tự tạo processor). Không đặt `ATRO_CPU` thì `ForkTest` tự tạo processor trên fork và chạy đủ 11 test PASS.

Dọn dẹp theo README: tắt anvil, chạy đúng lệnh `unset …` và `rm -rf broadcast/*/31337` ở cuối mục "Diễn tập", rồi đóng shell này. Chỉ xoá thư mục `31337`.

- [ ] **Step 4: [CLAUDE] Kiểm treasury thật trước bước 04 (chỉ đọc)**

Treasury bất biến sau bước 04. Với `TREASURY` thật của người dùng đã export (và `ATRO_CPU`, `ATRO_FACTORY` chưa đặt), chạy lệnh của mục "Kiểm treasury trước bước 04":

```bash
XLAYER_FORK_RPC=https://rpc.xlayer.tech forge test --match-contract ForkTest --match-test test_treasuryReceivesEveryFeeToken -vv
```

Expected: PASS, in ba dòng `fee paid to treasury …` (USDT0, USDC, USDG). Revert nghĩa là một token phí chặn treasury đó: người dùng chọn ví treasury khác, export lại `TREASURY`, chạy lại.

- [ ] **Step 5: [USER] Chạy năm script trên mainnet**

Trong `contracts/`, theo bảng và các ghi chú của mục "Triển khai mainnet" trong README: `forge script script/0N_….s.sol --rpc-url xlayer --account atropyle-deployer --sender $DEPLOYER --broadcast --slow`, lần lượt 01 tới 05, chạy 02 ngay sau 01 và 03 ngay sau 02. Sau mỗi bước, đọc lại từ chain theo mục "Đọc lại từ chain sau mỗi bước" rồi mới `export`. Những điểm README nêu và Claude nhắc lại khi người dùng hỏi:
- `cast code $DEPLOYER --rpc-url xlayer` phải in `0x` trước mỗi bước.
- Script 01 báo `STOP: …` thì dừng toàn bộ và báo Claude. Chỉ dùng `REPLACE_PROCESSOR` trong đúng trường hợp README mô tả (bỏ một processor `Atropyle` cũ không dùng được của cùng ví), và `unset REPLACE_PROCESSOR` ngay sau bước 01 mới.
- Script 02 hỏng giữa chừng thì đặt `KOFN_ID` theo log rồi chạy lại 02.
- Không chạy lại 04 khi chưa cần: nó deploy factory thứ hai và ghi đè `broadcast/04_DeployAtropyle.s.sol/196/run-latest.json`. Xong 04 thì sao lưu thư mục `broadcast/`.

Expected: gas mỗi bước gần số đo trên fork ở Step 3; `SMOKE_VAULT` ở trạng thái `0`. Bước 05 do `DEPLOYER`, chủ vault, ký `poke()`, nên đó là một lần check-in, vẫn gọi `step()` trên circuit thật.

- [ ] **Step 6: [CLAUDE] Kiểm deployment thật (chỉ đọc)**

Người dùng đưa các giá trị `export` (đã đọc lại từ chain) cho Claude. Claude chạy, theo đoạn "Kiểm deployment thật" của README:

```bash
cd contracts
export DEPLOYER=0x... ATRO_CPU=0x... KOFN_ID=... GE4_ID=... POLICY_ID=...
export ATRO_FACTORY=0x... VAULT_IMPL=0x... TREASURY=0x...
XLAYER_FORK_RPC=https://rpc.xlayer.tech forge test --match-contract ForkTest -vv
cast call $SMOKE_VAULT "state()(uint8)" --rpc-url https://rpc.xlayer.tech
cast storage $ATRO_CPU 0xa3f0ad74e5423aebfd80d3ef4346578335a9a72aeaee59ff6cb3582b35133d50 --rpc-url https://rpc.xlayer.tech
```

Expected: 10 test PASS và 1 SKIP (`test_tapeoutBudget`) trên deployment thật. Với `ATRO_FACTORY`, `VAULT_IMPL` và `TREASURY` đã đặt, `ForkTest` tự kiểm `cpu()` = `ATRO_CPU`, `policyId()` = `POLICY_ID`, `treasury()` = `TREASURY`, `vaultImpl()` = `VAULT_IMPL` và hai mức phí của cả ba token phí. `state` của vault Drill = `0`; slot beacon chứa `0xf70d1ed4f62CF3780157B0b421b7E2F45bD0991C` (đệm 0 bên trái).

- [ ] **Step 7: [USER] Verify trên OKLink**

Người dùng chạy hai lệnh `forge verify-contract` trong mục "Triển khai mainnet" của `contracts/README.md`, với `OKLINK_API_KEY` trong `contracts/.env`.

Expected: OKLink hiện "Verified" cho `AtropyleVault` và `AtropyleFactory`. Claude kiểm bằng cách mở trang contract trên OKLink (chỉ đọc).

- [ ] **Step 8: [CLAUDE] Ghi lại và commit**

Điền mọi ô `—` trong `docs/deployments.md` bằng giá trị thật và tx hash (lấy từ `contracts/broadcast/<script>/196/run-latest.json`). Cập nhật bảng "Số đo" trong `contracts/README.md` nếu gas `step` trên mainnet khác số đo trên fork.

```bash
git add docs/deployments.md contracts/README.md
git commit -m "docs: record Atropyle mainnet deployment" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Cập nhật memory dự án: địa chỉ processor, 3 circuit ID, factory, và ngày deploy.

