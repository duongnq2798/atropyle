// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {NetlistPatch} from "../script/lib/NetlistPatch.sol";

/// @dev External wrapper so vm.expectRevert sees the library revert one call deeper.
contract PatchHarness {
    function patch(bytes memory nl, uint256[] memory offsets, uint256[] memory targets, address cpu, uint64[2] memory ids)
        external
        pure
        returns (bytes memory)
    {
        return NetlistPatch.patch(nl, offsets, targets, cpu, ids);
    }
}

contract NetlistPatchTest is Test {
    address internal constant CPU = 0x1111111111111111111111111111111111111111;
    PatchHarness internal h;

    function setUp() public {
        h = new PatchHarness();
    }

    function _one(uint256 x) internal pure returns (uint256[] memory a) {
        a = new uint256[](1);
        a[0] = x;
    }

    /// NAND(0,1) followed by REF(cpu 0, id 0, nIns 1, nOut 1, ins [2]); the cpu field starts at byte 8.
    function _tiny() internal pure returns (bytes memory) {
        return bytes.concat(hex"00000000000001", hex"02", new bytes(28), hex"0101000002");
    }

    function test_patchesCpuAndIdBigEndian() public view {
        bytes memory nl = _tiny();
        bytes memory out = h.patch(nl, _one(8), _one(1), CPU, [uint64(7), uint64(0x0102030405060708)]);
        bytes memory want = bytes.concat(
            hex"00000000000001", hex"02", bytes20(CPU), bytes8(uint64(0x0102030405060708)), hex"0101000002"
        );
        assertEq(out, want);
        assertEq(nl, _tiny()); // input is copied, not modified
    }

    function test_rejectsBadSites() public {
        bytes memory nl = _tiny();
        uint64[2] memory ids = [uint64(1), uint64(2)];

        vm.expectRevert(abi.encodeWithSelector(NetlistPatch.NotARef.selector, uint256(3)));
        h.patch(nl, _one(3), _one(0), CPU, ids);

        vm.expectRevert(abi.encodeWithSelector(NetlistPatch.NotARef.selector, uint256(0)));
        h.patch(nl, _one(0), _one(0), CPU, ids);

        vm.expectRevert(abi.encodeWithSelector(NetlistPatch.NotARef.selector, nl.length));
        h.patch(nl, _one(nl.length), _one(0), CPU, ids);

        vm.expectRevert(abi.encodeWithSelector(NetlistPatch.BadTarget.selector, uint256(0)));
        h.patch(nl, _one(8), _one(2), CPU, ids);

        vm.expectRevert(NetlistPatch.LengthMismatch.selector);
        h.patch(nl, _one(8), new uint256[](0), CPU, ids);
    }

    /// The template carries placeholder REFs (cpu 0x0, ids 1 and 2): patching them back is the identity.
    function test_realTemplateRoundTrips() public view {
        string memory json = vm.readFile(string.concat(vm.projectRoot(), "/circuits/policy.template.json"));
        bytes memory tpl = vm.parseJsonBytes(json, ".netlist");
        uint256[] memory offsets = vm.parseJsonUintArray(json, ".refOffsets");
        uint256[] memory targets = vm.parseJsonUintArray(json, ".refTargets");
        assertEq(offsets.length, 3);

        uint64[2] memory placeholder = [uint64(1), uint64(2)];
        assertEq(h.patch(tpl, offsets, targets, address(0), placeholder), tpl);

        uint64[2] memory live = [uint64(5), uint64(6)];
        bytes memory out = h.patch(tpl, offsets, targets, CPU, live);
        assertEq(out.length, tpl.length);
        for (uint256 r; r < offsets.length; ++r) {
            uint256 o = offsets[r];
            for (uint256 i; i < 20; ++i) {
                assertEq(uint8(out[o + i]), 0x11);
            }
            assertEq(uint8(out[o + 27]), targets[r] == 0 ? 5 : 6);
        }
        assertEq(h.patch(out, offsets, targets, address(0), placeholder), tpl);
    }
}
