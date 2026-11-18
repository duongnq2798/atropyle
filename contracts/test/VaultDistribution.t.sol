// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test, Vm} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {VaultConfig} from "../src/vault/VaultConfig.sol";
import {VaultDistribution} from "../src/vault/VaultDistribution.sol";
import {
    MockERC20,
    MockERC721,
    MockERC1155,
    MockBlacklistERC20,
    MockFeeERC20,
    MockNoReturnERC20,
    MockGarbageToken,
    NonReceiver
} from "./mocks/Tokens.sol";

contract DistributionHarness is VaultDistribution {
    constructor(address owner_) {
        owner = owner_;
        drill = false; // the real vault constructor sets it; an explicit write keeps the uninitialized-state lint quiet
    }

    function setHeirs(Heir[] memory h) external {
        _setHeirs(h);
    }

    function setAssets(Asset[] memory a) external {
        _setAssets(a);
    }

    function run(bool recover, address target) external {
        _distribute(recover, target);
    }
}

contract VaultDistributionTest is Test {
    address internal owner = makeAddr("owner");
    address internal heirA = makeAddr("heirA");
    address internal heirB = makeAddr("heirB");
    address internal target = makeAddr("target");
    DistributionHarness internal h;
    MockERC20 internal usdt;

    function setUp() public {
        h = new DistributionHarness(owner);
        usdt = new MockERC20("USDT", "USDT", 6);
        h.setHeirs(_heirs(heirA, 6000, heirB, 4000));
    }

    function _heirs(address x, uint16 bx, address y, uint16 by) internal pure returns (VaultConfig.Heir[] memory r) {
        r = new VaultConfig.Heir[](2);
        r[0] = VaultConfig.Heir(x, bx);
        r[1] = VaultConfig.Heir(y, by);
    }

    function _erc20(address token) internal pure returns (VaultConfig.Asset memory) {
        return VaultConfig.Asset(VaultConfig.Kind.ERC20, token, 0, 0);
    }

    function _only(VaultConfig.Asset memory a) internal pure returns (VaultConfig.Asset[] memory r) {
        r = new VaultConfig.Asset[](1);
        r[0] = a;
    }

    function _fund(MockERC20 t, uint256 balance, uint256 allowance) internal {
        t.mint(owner, balance);
        vm.prank(owner);
        t.approve(address(h), allowance);
    }

    function _countFailed() internal returns (uint256 n) {
        Vm.Log[] memory logs = vm.getRecordedLogs();
        for (uint256 i; i < logs.length; ++i) {
            if (logs[i].topics[0] == VaultDistribution.TransferFailed.selector) n++;
        }
    }

    function test_splitsByBpsWithRemainderToLastHeir() public {
        VaultConfig.Heir[] memory three = new VaultConfig.Heir[](3);
        three[0] = VaultConfig.Heir(heirA, 3333);
        three[1] = VaultConfig.Heir(heirB, 3333);
        three[2] = VaultConfig.Heir(target, 3334);
        h.setHeirs(three);
        h.setAssets(_only(_erc20(address(usdt))));
        _fund(usdt, 1001, type(uint256).max);
        h.run(false, address(0));
        assertEq(usdt.balanceOf(heirA), 333);
        assertEq(usdt.balanceOf(heirB), 333);
        assertEq(usdt.balanceOf(target), 335);
        assertEq(usdt.balanceOf(owner), 0);
    }

    function test_recoverySendsEverythingToTarget() public {
        MockERC721 nft = new MockERC721();
        MockERC1155 multi = new MockERC1155();
        VaultConfig.Asset[] memory a = new VaultConfig.Asset[](3);
        a[0] = _erc20(address(usdt));
        a[1] = VaultConfig.Asset(VaultConfig.Kind.ERC721, address(nft), 1, 0);
        a[2] = VaultConfig.Asset(VaultConfig.Kind.ERC1155, address(multi), 7, 1);
        h.setAssets(a);
        _fund(usdt, 1000e6, type(uint256).max);
        nft.mint(owner, 1);
        multi.mint(owner, 7, 5);
        vm.startPrank(owner);
        nft.approve(address(h), 1);
        multi.setApprovalForAll(address(h), true);
        vm.stopPrank();
        h.run(true, target);
        assertEq(usdt.balanceOf(target), 1000e6);
        assertEq(nft.ownerOf(1), target);
        assertEq(multi.balanceOf(target, 7), 5);
    }

    /// Review Focus #3
    function test_availableIsMinOfBalanceAndAllowance() public {
        h.setAssets(_only(_erc20(address(usdt))));
        _fund(usdt, 1000e6, 300e6);
        h.run(false, address(0));
        assertEq(usdt.balanceOf(heirA), 180e6);
        assertEq(usdt.balanceOf(heirB), 120e6);

        vm.prank(owner);
        usdt.approve(address(h), 0);
        vm.recordLogs();
        h.run(false, address(0));
        assertEq(vm.getRecordedLogs().length, 0);
        assertEq(usdt.balanceOf(owner), 700e6);

        vm.prank(owner);
        usdt.approve(address(h), 100e6);
        h.run(false, address(0));
        assertEq(usdt.balanceOf(heirA), 240e6);
        assertEq(usdt.balanceOf(heirB), 160e6);
    }

    function test_tokenWithoutReturnValue() public {
        MockNoReturnERC20 t = new MockNoReturnERC20();
        h.setAssets(_only(_erc20(address(t))));
        t.mint(owner, 100);
        vm.prank(owner);
        t.approve(address(h), 100);
        vm.expectEmit(address(h));
        emit VaultDistribution.Distributed(0, heirA, 60);
        h.run(false, address(0));
        assertEq(t.balanceOf(heirA), 60);
        assertEq(t.balanceOf(heirB), 40);
    }

    function test_feeOnTransferToken() public {
        MockFeeERC20 t = new MockFeeERC20();
        h.setAssets(_only(_erc20(address(t))));
        t.mint(owner, 1000);
        vm.prank(owner);
        t.approve(address(h), type(uint256).max);
        h.run(false, address(0));
        assertEq(t.balanceOf(heirA), 594);
        assertEq(t.balanceOf(heirB), 396);
        assertEq(t.balanceOf(owner), 0);
    }

    /// Review Focus #4
    function test_blacklistedHeirDoesNotBlockOthers() public {
        MockBlacklistERC20 t = new MockBlacklistERC20();
        h.setAssets(_only(_erc20(address(t))));
        t.mint(owner, 1000);
        vm.prank(owner);
        t.approve(address(h), type(uint256).max);
        t.setBlocked(heirB, true);

        vm.expectEmit(address(h));
        emit VaultDistribution.Distributed(0, heirA, 600);
        vm.expectEmit(address(h));
        emit VaultDistribution.TransferFailed(0, heirB);
        h.run(false, address(0));
        assertEq(t.balanceOf(heirA), 600);
        assertEq(t.balanceOf(owner), 400);

        h.run(false, address(0)); // the next sweep re-splits what is left
        assertEq(t.balanceOf(heirA), 840);
        assertEq(t.balanceOf(owner), 160);
    }

    /// Review Focus #4
    function test_contractHeirWithoutReceiver() public {
        NonReceiver bad = new NonReceiver();
        h.setHeirs(_heirs(address(bad), 6000, heirB, 4000));
        MockERC721 nft = new MockERC721();
        VaultConfig.Asset[] memory a = new VaultConfig.Asset[](2);
        a[0] = VaultConfig.Asset(VaultConfig.Kind.ERC721, address(nft), 1, 0);
        a[1] = _erc20(address(usdt));
        h.setAssets(a);
        nft.mint(owner, 1);
        vm.prank(owner);
        nft.setApprovalForAll(address(h), true);
        _fund(usdt, 100, 100);

        vm.expectEmit(address(h));
        emit VaultDistribution.TransferFailed(0, address(bad));
        h.run(false, address(0));
        assertEq(nft.ownerOf(1), owner);
        assertEq(usdt.balanceOf(address(bad)), 60);
        assertEq(usdt.balanceOf(heirB), 40);
    }

    function test_nftSoldBeforehandIsSkippedSilently() public {
        MockERC721 nft = new MockERC721();
        h.setAssets(_only(VaultConfig.Asset(VaultConfig.Kind.ERC721, address(nft), 1, 0)));
        nft.mint(owner, 1);
        vm.startPrank(owner);
        nft.setApprovalForAll(address(h), true);
        nft.transferFrom(owner, target, 1);
        vm.stopPrank();
        assertEq(h.coverage()[0], 0);
        vm.recordLogs();
        h.run(false, address(0));
        assertEq(vm.getRecordedLogs().length, 0);
    }

    function test_garbageTokenNeverReverts() public {
        MockGarbageToken g = new MockGarbageToken();
        h.setAssets(_only(_erc20(address(g))));
        vm.recordLogs();
        h.run(false, address(0));
        assertEq(_countFailed(), 2);
    }

    function test_shortViewReturnCountsAsZero() public {
        h.setAssets(_only(_erc20(address(usdt))));
        _fund(usdt, 100, 100);
        vm.mockCall(address(usdt), abi.encodeWithSelector(IERC20.balanceOf.selector), hex"01");
        assertEq(h.coverage()[0], 0);
        vm.recordLogs();
        h.run(false, address(0));
        assertEq(vm.getRecordedLogs().length, 0);
    }

    function test_coverage() public {
        MockERC721 nft = new MockERC721();
        MockERC1155 multi = new MockERC1155();
        VaultConfig.Asset[] memory a = new VaultConfig.Asset[](3);
        a[0] = _erc20(address(usdt));
        a[1] = VaultConfig.Asset(VaultConfig.Kind.ERC721, address(nft), 1, 0);
        a[2] = VaultConfig.Asset(VaultConfig.Kind.ERC1155, address(multi), 7, 1);
        h.setAssets(a);
        _fund(usdt, 500, 200);
        nft.mint(owner, 1);
        multi.mint(owner, 7, 5);

        uint256[] memory c = h.coverage();
        assertEq(c[0], 200);
        assertEq(c[1], 0);
        assertEq(c[2], 0);

        vm.startPrank(owner);
        nft.approve(address(h), 1);
        multi.setApprovalForAll(address(h), true);
        vm.stopPrank();
        c = h.coverage();
        assertEq(c[1], 1);
        assertEq(c[2], 5);
    }

    function test_worstCaseGasUnderSixMillion() public {
        VaultConfig.Heir[] memory five = new VaultConfig.Heir[](5);
        for (uint256 i; i < 5; ++i) {
            five[i] = VaultConfig.Heir(address(uint160(0xA000 + i)), 2000);
        }
        h.setHeirs(five);
        VaultConfig.Asset[] memory a = new VaultConfig.Asset[](20);
        for (uint256 i; i < 20; ++i) {
            MockERC20 t = new MockERC20("T", "T", 18);
            t.mint(owner, 1e24);
            vm.prank(owner);
            t.approve(address(h), type(uint256).max);
            a[i] = _erc20(address(t));
        }
        h.setAssets(a);
        uint256 before = gasleft();
        h.run(false, address(0));
        uint256 used = before - gasleft();
        emit log_named_uint("distribute gas (20 assets x 5 heirs)", used);
        assertLt(used, 6_000_000);
    }
}
