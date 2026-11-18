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
