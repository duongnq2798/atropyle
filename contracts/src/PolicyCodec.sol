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
