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
