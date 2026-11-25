# TAP-02 test vectors (vendored)

`vectors.json` is copied byte for byte from the TapeOut Protocol Proposals repository. `test/tap02.test.ts` runs every
vector against this package's simulator (`compile`, `stepBytes`) in CI.

| Field   | Value                                                                                                                                         |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Source  | https://github.com/TapeOutProtocol/TAPs/blob/527477ecb7cf68ee9e86d8292669d57fe1680572/assets/tap-02/vectors.json                              |
| Spec    | TAP-02 "Circuit Netlist Format and Evaluation Semantics", status Draft, updated 2026-10-04: https://github.com/TapeOutProtocol/TAPs/blob/527477ecb7cf68ee9e86d8292669d57fe1680572/TAPs/TAP-02.md |
| Version | format `tap-netlist-vectors/1`; repository commit `527477ecb7cf68ee9e86d8292669d57fe1680572` (2026-11-10); the file was last changed in commit `fca5034fa5287a6565a94951193b923bcb443585` (2026-10-04) |
| SHA-256 | `1a02f5cf991c130a22dc6cc6ee93d0f8fe0720afed081665fa8b8018aefd203b`, the value TAP-02 publishes; the test checks it                         |
| License | CC0 1.0 Universal. The repository's LICENSE dedicates the text of every TAP, test vectors included, to the public domain                      |
| Fetched | 2026-11-25                                                                                                                                    |

What the vectors cover, according to TAP-02 (Test Cases):

- five well-formed netlists with full truth tables or beat sequences, among them the on-chain bytes of circuit #3151 of
  a BNB Smart Chain processor and a REF to a circuit with state;
- eight ill-formed netlists that every implementation must reject;
- the packing edge cases of TAP-02 §5 on the one-NAND circuit.

Limits, as TAP-02 states them: the file's `chainVerified` flag is `false` (the vectors are constructed, and were not
sent to `eval` or `step` themselves), and the TAP's on-chain comparison was made on BNB Smart Chain. TAP-02 lists the
X Layer contracts (beacon `0xf70d1ed4f62CF3780157B0b421b7E2F45bD0991C`, implementation
`0x977f217887E085D298Cb3819cDAD5A0ee35F29B2`) but has not compared them with its text. The check of our simulator
against the X Layer processor itself is P9 of `atropyle verify`.

Do not edit `vectors.json`. To update it, copy the new file from the repository, update this table and the hash in the
test.
