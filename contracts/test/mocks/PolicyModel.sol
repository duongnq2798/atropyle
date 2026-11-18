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
            v |= uint24(uint8(inputs[j])) << uint24(8 * j);
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
