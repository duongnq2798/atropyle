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
