import { addrAt, u64 } from './bytes';

export interface RefTarget {
  /** Lowercase 0x-prefixed hex of the 20-byte cpu address. */
  cpu: string;
  id: bigint;
  nIn: number;
  nOut: number;
  /** Byte offset of the 20-byte cpu field (right after the 0x02 opcode). */
  offset: number;
}

/** Lists the REFs of one netlist layer, in order, without resolving them. */
export function listRefs(bytes: Uint8Array): RefTarget[] {
  const out: RefTarget[] = [];
  let p = 0;
  const need = (len: number) => {
    if (p + len > bytes.length) throw new Error('truncated');
  };
  while (p < bytes.length) {
    const op = bytes[p++];
    if (op === 0) {
      need(6);
      p += 6;
    } else if (op === 1) {
      need(3);
      p += 3;
    } else if (op === 2) {
      need(30);
      const offset = p;
      const cpu = addrAt(bytes, p);
      const id = u64(bytes, p + 20);
      const nIn = bytes[p + 28];
      const nOut = bytes[p + 29];
      p += 30;
      need(nIn * 3);
      p += nIn * 3;
      out.push({ cpu, id, nIn, nOut, offset });
    } else {
      throw new Error('bad opcode');
    }
  }
  return out;
}
