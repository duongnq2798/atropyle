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
