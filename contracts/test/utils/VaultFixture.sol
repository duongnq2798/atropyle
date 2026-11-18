// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";
import {AtropyleVault} from "../../src/AtropyleVault.sol";
import {VaultConfig} from "../../src/vault/VaultConfig.sol";
import {MockPolicyCPU} from "../mocks/PolicyModel.sol";
import {MockERC20, MockERC721, MockERC1155} from "../mocks/Tokens.sol";

/// @notice Shared setup. The test contract itself plays the factory (see index()).
abstract contract VaultFixture is Test {
    uint32 internal constant P = 1 days;
    uint8 internal constant T = 3;
    uint32 internal constant W = 3 days;

    MockPolicyCPU internal cpu;
    AtropyleVault internal impl;
    MockERC20 internal usdt;
    MockERC721 internal nft;
    MockERC1155 internal multi;

    address internal owner = makeAddr("owner");
    address internal heirA = makeAddr("heirA");
    address internal heirB = makeAddr("heirB");
    address internal g1 = makeAddr("g1");
    address internal g2 = makeAddr("g2");
    address internal g3 = makeAddr("g3");
    address internal newWallet = makeAddr("newWallet");
    address internal stranger = makeAddr("stranger");

    function setUp() public virtual {
        vm.warp(1_700_000_000);
        cpu = new MockPolicyCPU();
        impl = new AtropyleVault();
        usdt = new MockERC20("Tether", "USDT", 6);
        nft = new MockERC721();
        multi = new MockERC1155();
        usdt.mint(owner, 1000e6);
        nft.mint(owner, 1);
        multi.mint(owner, 7, 5);
    }

    /// @dev Vaults created by this fixture call back here as if this were the factory.
    function index(address) external {}

    function _heirs() internal view returns (VaultConfig.Heir[] memory h) {
        h = new VaultConfig.Heir[](2);
        h[0] = VaultConfig.Heir(heirA, 6000);
        h[1] = VaultConfig.Heir(heirB, 4000);
    }

    function _guardians() internal view returns (address[] memory g) {
        g = new address[](3);
        g[0] = g1;
        g[1] = g2;
        g[2] = g3;
    }

    function _assets() internal view returns (VaultConfig.Asset[] memory a) {
        a = new VaultConfig.Asset[](3);
        a[0] = VaultConfig.Asset(VaultConfig.Kind.ERC20, address(usdt), 0, 0);
        a[1] = VaultConfig.Asset(VaultConfig.Kind.ERC721, address(nft), 1, 0);
        a[2] = VaultConfig.Asset(VaultConfig.Kind.ERC1155, address(multi), 7, 1);
    }

    function _cfg() internal view returns (VaultConfig.Config memory c) {
        c.heirs = _heirs();
        c.guardians = _guardians();
        c.k = 2;
        c.recoveryEnabled = true;
        c.timing = VaultConfig.Timing(P, T, W);
        c.assets = _assets();
    }

    function _drillCfg() internal view returns (VaultConfig.Config memory c) {
        c = _cfg();
        c.guardians = new address[](1);
        c.guardians[0] = g1;
        c.k = 0;
        c.recoveryEnabled = false;
        c.timing = VaultConfig.Timing(60, 2, 120);
    }

    function _deploy(VaultConfig.Config memory c, bool drill) internal returns (AtropyleVault) {
        return _deployOn(address(cpu), c, drill);
    }

    function _deployOn(address cpu_, VaultConfig.Config memory c, bool drill) internal returns (AtropyleVault v) {
        v = AtropyleVault(Clones.clone(address(impl)));
        v.initialize(owner, drill, c, cpu_, 1);
    }

    function _approveAll(AtropyleVault v) internal {
        vm.startPrank(owner);
        usdt.approve(address(v), type(uint256).max);
        nft.approve(address(v), 1);
        multi.setApprovalForAll(address(v), true);
        vm.stopPrank();
    }
}
