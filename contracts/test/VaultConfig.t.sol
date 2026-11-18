// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {VaultConfig} from "../src/vault/VaultConfig.sol";
import {MockERC20, MockERC721, MockERC1155} from "./mocks/Tokens.sol";

contract ConfigHarness is VaultConfig {
    constructor(address owner_, bool drill_) {
        owner = owner_;
        drill = drill_;
    }

    function setHeirs(Heir[] memory h) external {
        _setHeirs(h);
    }

    function setGuardians(address[] memory g, uint8 k_, bool rec) external {
        _setGuardians(g, k_, rec);
    }

    function setTiming(Timing memory t) external {
        _setTiming(t);
    }

    function setAssets(Asset[] memory a) external {
        _setAssets(a);
    }
}

contract VaultConfigTest is Test {
    address internal owner = makeAddr("owner");
    address internal a = makeAddr("a");
    address internal b = makeAddr("b");
    address internal c = makeAddr("c");
    ConfigHarness internal h;
    MockERC20 internal token;
    MockERC721 internal nft;
    MockERC1155 internal multi;

    function setUp() public {
        h = new ConfigHarness(owner, false);
        token = new MockERC20("T", "T", 6);
        nft = new MockERC721();
        multi = new MockERC1155();
    }

    function _heirs2() internal view returns (VaultConfig.Heir[] memory r) {
        r = new VaultConfig.Heir[](2);
        r[0] = VaultConfig.Heir(a, 6000);
        r[1] = VaultConfig.Heir(b, 4000);
    }

    function _one(address x) internal pure returns (VaultConfig.Heir[] memory r) {
        r = new VaultConfig.Heir[](1);
        r[0] = VaultConfig.Heir(x, 10_000);
    }

    function _addrs(address x, address y, address z) internal pure returns (address[] memory r) {
        r = new address[](3);
        r[0] = x;
        r[1] = y;
        r[2] = z;
    }

    function _asset(VaultConfig.Kind kind, address t, uint256 id, uint8 heir)
        internal
        pure
        returns (VaultConfig.Asset[] memory r)
    {
        r = new VaultConfig.Asset[](1);
        r[0] = VaultConfig.Asset(kind, t, id, heir);
    }

    function test_acceptsValidHeirs() public {
        h.setHeirs(_heirs2());
        VaultConfig.Heir[] memory got = h.heirs();
        assertEq(got.length, 2);
        assertEq(got[1].account, b);
        assertEq(got[1].bps, 4000);
    }

    function test_rejectsBadHeirs() public {
        vm.expectRevert(VaultConfig.InvalidHeirs.selector);
        h.setHeirs(new VaultConfig.Heir[](0));

        VaultConfig.Heir[] memory x = _heirs2();
        x[1].bps = 3999;
        vm.expectRevert(VaultConfig.InvalidHeirs.selector);
        h.setHeirs(x);

        x = _heirs2();
        x[0].account = address(0);
        vm.expectRevert(VaultConfig.InvalidHeirs.selector);
        h.setHeirs(x);

        x = _heirs2();
        x[0].account = owner;
        vm.expectRevert(VaultConfig.InvalidHeirs.selector);
        h.setHeirs(x);

        x = _heirs2();
        x[1].account = a;
        vm.expectRevert(VaultConfig.InvalidHeirs.selector);
        h.setHeirs(x);

        x = _heirs2();
        x[0].bps = 0;
        x[1].bps = 10_000;
        vm.expectRevert(VaultConfig.InvalidHeirs.selector);
        h.setHeirs(x);

        x = new VaultConfig.Heir[](6);
        for (uint256 i; i < 6; ++i) {
            x[i] = VaultConfig.Heir(address(uint160(0x1000 + i)), i == 5 ? 5000 : 1000);
        }
        vm.expectRevert(VaultConfig.InvalidHeirs.selector);
        h.setHeirs(x);
    }

    function test_rejectsVaultAddressAsHeir() public {
        VaultConfig.Heir[] memory x = _heirs2();
        x[0].account = address(h);
        vm.expectRevert(VaultConfig.InvalidHeirs.selector);
        h.setHeirs(x);

        x = _heirs2();
        x[1].account = address(h);
        vm.expectRevert(VaultConfig.InvalidHeirs.selector);
        h.setHeirs(x);

        vm.expectRevert(VaultConfig.InvalidHeirs.selector);
        h.setHeirs(_one(address(h)));
    }

    function test_shrinkingHeirsBelowAnAssetIndexReverts() public {
        h.setHeirs(_heirs2());
        h.setAssets(_asset(VaultConfig.Kind.ERC721, address(nft), 1, 1));
        vm.expectRevert(VaultConfig.InvalidHeirs.selector);
        h.setHeirs(_one(a));
    }

    function test_acceptsGuardiansWhoAreAlsoHeirs() public {
        h.setHeirs(_heirs2());
        h.setGuardians(_addrs(a, b, c), 2, true);
        assertEq(h.k(), 2);
        assertTrue(h.recoveryEnabled());
        assertEq(h.guardians().length, 3);
        assertEq(h.guardians()[2], c);
    }

    function test_simpleTemplateAllowsNoGuardians() public {
        h.setGuardians(new address[](0), 0, false);
        assertEq(h.k(), 0);
        assertEq(h.guardians().length, 0);
    }

    function test_rejectsBadGuardians() public {
        address[] memory six = new address[](6);
        for (uint256 i; i < 6; ++i) {
            six[i] = address(uint160(0x2000 + i));
        }
        vm.expectRevert(VaultConfig.InvalidGuardians.selector);
        h.setGuardians(six, 1, false);

        vm.expectRevert(VaultConfig.InvalidGuardians.selector);
        h.setGuardians(_addrs(a, b, c), 4, false);

        vm.expectRevert(VaultConfig.InvalidGuardians.selector);
        h.setGuardians(_addrs(a, b, c), 0, true);

        vm.expectRevert(VaultConfig.InvalidGuardians.selector);
        h.setGuardians(_addrs(a, b, address(0)), 2, false);

        vm.expectRevert(VaultConfig.InvalidGuardians.selector);
        h.setGuardians(_addrs(a, b, owner), 2, false);

        vm.expectRevert(VaultConfig.InvalidGuardians.selector);
        h.setGuardians(_addrs(a, b, a), 2, false);
    }

    /// The vault cannot sign, so as a guardian it would be an inert seat counted in n (k = n would lock quorum).
    function test_rejectsVaultAddressAsGuardian() public {
        vm.expectRevert(VaultConfig.InvalidGuardians.selector);
        h.setGuardians(_addrs(a, b, address(h)), 2, false);

        vm.expectRevert(VaultConfig.InvalidGuardians.selector);
        h.setGuardians(_addrs(address(h), b, c), 1, true);

        address[] memory only = new address[](1);
        only[0] = address(h);
        vm.expectRevert(VaultConfig.InvalidGuardians.selector);
        h.setGuardians(only, 0, false);
    }

    function test_timingLimits() public {
        h.setTiming(VaultConfig.Timing(1 days, 1, 3 days));
        h.setTiming(VaultConfig.Timing(1 days, 15, 3 days));
        assertEq(h.timing().threshold, 15);

        vm.expectRevert(VaultConfig.InvalidTiming.selector);
        h.setTiming(VaultConfig.Timing(1 days - 1, 3, 3 days));
        vm.expectRevert(VaultConfig.InvalidTiming.selector);
        h.setTiming(VaultConfig.Timing(1 days, 3, 3 days - 1));
        vm.expectRevert(VaultConfig.InvalidTiming.selector);
        h.setTiming(VaultConfig.Timing(1 days, 0, 3 days));
        vm.expectRevert(VaultConfig.InvalidTiming.selector);
        h.setTiming(VaultConfig.Timing(1 days, 16, 3 days));
    }

    function test_drillTimingLimits() public {
        ConfigHarness d = new ConfigHarness(owner, true);
        d.setTiming(VaultConfig.Timing(60, 2, 60));
        vm.expectRevert(VaultConfig.InvalidTiming.selector);
        d.setTiming(VaultConfig.Timing(59, 2, 60));
        vm.expectRevert(VaultConfig.InvalidTiming.selector);
        d.setTiming(VaultConfig.Timing(60, 2, 59));
    }

    function test_acceptsValidAssets() public {
        h.setHeirs(_heirs2());
        VaultConfig.Asset[] memory x = new VaultConfig.Asset[](3);
        x[0] = VaultConfig.Asset(VaultConfig.Kind.ERC20, address(token), 0, 0);
        x[1] = VaultConfig.Asset(VaultConfig.Kind.ERC721, address(nft), 1, 1);
        x[2] = VaultConfig.Asset(VaultConfig.Kind.ERC1155, address(multi), 7, 0);
        h.setAssets(x);
        assertEq(h.assets().length, 3);
        assertEq(uint8(h.assets()[1].kind), uint8(VaultConfig.Kind.ERC721));
    }

    function test_rejectsBadAssets() public {
        h.setHeirs(_heirs2());

        VaultConfig.Asset[] memory many = new VaultConfig.Asset[](21);
        for (uint256 i; i < 21; ++i) {
            many[i] = VaultConfig.Asset(VaultConfig.Kind.ERC721, address(nft), i, 0);
        }
        vm.expectRevert(VaultConfig.InvalidAssets.selector);
        h.setAssets(many);

        vm.expectRevert(VaultConfig.InvalidAssets.selector);
        h.setAssets(_asset(VaultConfig.Kind.ERC20, makeAddr("eoa"), 0, 0));

        vm.expectRevert(VaultConfig.InvalidAssets.selector);
        h.setAssets(_asset(VaultConfig.Kind.ERC721, address(nft), 1, 2));

        vm.expectRevert(VaultConfig.InvalidAssets.selector);
        h.setAssets(_asset(VaultConfig.Kind.ERC20, address(token), 1, 0));

        VaultConfig.Asset[] memory dup = new VaultConfig.Asset[](2);
        dup[0] = VaultConfig.Asset(VaultConfig.Kind.ERC721, address(nft), 1, 0);
        dup[1] = VaultConfig.Asset(VaultConfig.Kind.ERC721, address(nft), 1, 1);
        vm.expectRevert(VaultConfig.InvalidAssets.selector);
        h.setAssets(dup);
    }
}
