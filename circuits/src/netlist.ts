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
