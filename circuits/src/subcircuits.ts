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
