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
    NonReceiver,
    GasBurner,
    MockReturnBombToken,
    MockGasProbeERC20
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

    function viewGas() external pure returns (uint256) {
        return VIEW_GAS;
    }

    function transferGas() external pure returns (uint256) {
        return TRANSFER_GAS;
    }

    function nftGas() external pure returns (uint256) {
        return NFT_GAS;
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

    // ---- hostile tokens and heirs: one bad actor must not block the sweep (fix round 1) ----

    /// A token whose transferFrom answers with 3.5 MB of returndata (about 26M gas to produce), placed after a
    /// healthy token. An uncapped, unbounded copy cannot survive it within 30M gas; the capped callee just fails.
    function test_returndataBombTokenDoesNotBlockOthers() public {
        MockReturnBombToken bomb = new MockReturnBombToken();
        bomb.setSizes(0x20, 0x380000);
        VaultConfig.Asset[] memory a = new VaultConfig.Asset[](2);
        a[0] = _erc20(address(usdt));
        a[1] = _erc20(address(bomb));
        h.setAssets(a);
        _fund(usdt, 1000e6, type(uint256).max);

        vm.recordLogs();
        h.run{gas: 30_000_000}(false, address(0));
        assertEq(usdt.balanceOf(heirA), 600e6);
        assertEq(usdt.balanceOf(heirB), 400e6);
        assertEq(_countFailed(), 2); // the bomb fails once per heir, and nothing else fails
    }

    /// Returndata the gas caps still pay for (128 KB per view, 320 KB per transfer): only 32 bytes are copied, so
    /// the sweep costs no more than the callee's own gas caps.
    function test_returndataBombCostsNoMoreThanTheGasCaps() public {
        MockReturnBombToken bomb = new MockReturnBombToken();
        bomb.setSizes(0x20000, 0x50000);
        h.setAssets(_only(_erc20(address(bomb))));
        uint256 before = gasleft();
        h.run(false, address(0));
        uint256 used = before - gasleft();
        emit log_named_uint("returndata bomb, 1 asset x 2 heirs", used);
        assertLt(used, 2 * h.viewGas() + 2 * h.transferGas());
    }

    /// balanceOf / allowance burn all forwarded gas: the asset is skipped and the others still move.
    function test_gasBurningTokenIsSkippedAndOthersStillMove() public {
        GasBurner burner = new GasBurner();
        VaultConfig.Asset[] memory a = new VaultConfig.Asset[](2);
        a[0] = _erc20(address(burner));
        a[1] = _erc20(address(usdt));
        h.setAssets(a);
        _fund(usdt, 1000e6, type(uint256).max);

        vm.recordLogs();
        h.run{gas: 30_000_000}(false, address(0));
        assertEq(usdt.balanceOf(heirA), 600e6);
        assertEq(usdt.balanceOf(heirB), 400e6);
        assertEq(_countFailed(), 0); // unreadable balance counts as zero: skipped silently
    }

    /// A contract heir whose onERC721Received burns all gas, at index 0 followed by 19 ERC-20s and 5 heirs.
    function test_gasBurningContractHeirCannotBlockTheSweep() public {
        GasBurner burnHeir = new GasBurner();
        MockERC721 nft = new MockERC721();
        VaultConfig.Heir[] memory five = new VaultConfig.Heir[](5);
        five[0] = VaultConfig.Heir(address(burnHeir), 2000);
        for (uint256 i = 1; i < 5; ++i) {
            five[i] = VaultConfig.Heir(address(uint160(0xA000 + i)), 2000);
        }
        h.setHeirs(five);

        VaultConfig.Asset[] memory a = new VaultConfig.Asset[](20);
        a[0] = VaultConfig.Asset(VaultConfig.Kind.ERC721, address(nft), 1, 0);
        MockERC20[] memory tokens = new MockERC20[](19);
        for (uint256 i; i < 19; ++i) {
            tokens[i] = new MockERC20("T", "T", 18);
            tokens[i].mint(owner, 1e24);
            vm.prank(owner);
            tokens[i].approve(address(h), type(uint256).max);
            a[i + 1] = _erc20(address(tokens[i]));
        }
        h.setAssets(a);
        nft.mint(owner, 1);
        vm.prank(owner);
        nft.setApprovalForAll(address(h), true);

        vm.expectEmit(address(h));
        emit VaultDistribution.TransferFailed(0, address(burnHeir));
        h.run{gas: 30_000_000}(false, address(0));

        assertEq(nft.ownerOf(1), owner);
        for (uint256 i; i < 19; ++i) {
            assertEq(tokens[i].balanceOf(owner), 0);
            assertEq(tokens[i].balanceOf(address(burnHeir)), 2e23);
            for (uint256 j = 1; j < 5; ++j) {
                assertEq(tokens[i].balanceOf(address(uint160(0xA000 + j))), 2e23);
            }
        }
    }

    /// coverage() (hence status()) must stay callable whatever a token's views return or burn.
    function test_coverageSurvivesBombAndGasBurner() public {
        MockReturnBombToken bomb = new MockReturnBombToken();
        GasBurner burner = new GasBurner();
        VaultConfig.Asset[] memory a = new VaultConfig.Asset[](3);
        a[0] = _erc20(address(bomb));
        a[1] = _erc20(address(burner));
        a[2] = _erc20(address(usdt));
        h.setAssets(a);
        _fund(usdt, 500, 200);

        // Views that return 128 KB (affordable): the first word is read, the rest is never copied.
        bomb.setSizes(0x20000, 0x20);
        uint256[] memory c = h.coverage{gas: 30_000_000}();
        assertEq(c[0], 1e18);
        assertEq(c[1], 0); // the gas burner's views fail within their cap: unreadable counts as zero
        assertEq(c[2], 200);

        // Views that return 3.5 MB (unaffordable within the cap): the bomb reads as zero, coverage() still works.
        bomb.setSizes(0x380000, 0x20);
        c = h.coverage{gas: 30_000_000}();
        assertEq(c[0], 0);
        assertEq(c[1], 0);
        assertEq(c[2], 200);
    }

    function test_tooLittleGasForAViewRevertsInsteadOfSkipping() public {
        h.setAssets(_only(_erc20(address(usdt))));
        _fund(usdt, 1000, type(uint256).max);
        vm.expectRevert(VaultDistribution.InsufficientGas.selector);
        h.run{gas: 60_000}(false, address(0));
        vm.expectRevert(VaultDistribution.InsufficientGas.selector);
        h.coverage{gas: 60_000}();
    }

    /// Enough for both views, not for the 300k transfer cap: revert, never a TransferFailed caused by starvation.
    function test_tooLittleGasForAnErc20TransferReverts() public {
        h.setAssets(_only(_erc20(address(usdt))));
        _fund(usdt, 1000, type(uint256).max);
        vm.expectRevert(VaultDistribution.InsufficientGas.selector);
        h.run{gas: 200_000}(false, address(0));
        assertEq(usdt.balanceOf(owner), 1000);
    }

    function test_tooLittleGasForAnNftTransferReverts() public {
        MockERC721 nft = new MockERC721();
        MockERC1155 multi = new MockERC1155();
        VaultConfig.Asset[] memory a = new VaultConfig.Asset[](2);
        a[0] = VaultConfig.Asset(VaultConfig.Kind.ERC721, address(nft), 1, 0);
        a[1] = VaultConfig.Asset(VaultConfig.Kind.ERC1155, address(multi), 7, 1);
        h.setAssets(a);
        nft.mint(owner, 1);
        multi.mint(owner, 7, 5);
        vm.startPrank(owner);
        nft.setApprovalForAll(address(h), true);
        multi.setApprovalForAll(address(h), true);
        vm.stopPrank();

        // Both views pass, but the 500k NFT cap cannot be handed over.
        uint256 low = h.nftGas() - 100_000;
        vm.expectRevert(VaultDistribution.InsufficientGas.selector);
        h.run{gas: low}(false, address(0));

        // With ERC-721 gone from the list the same holds for ERC-1155.
        h.setAssets(_only(a[1]));
        vm.expectRevert(VaultDistribution.InsufficientGas.selector);
        h.run{gas: low}(false, address(0));
    }

    /// Whenever the sweep goes through, the token was handed its whole 300k cap, even right at the guard threshold:
    /// the margin covers everything spent between the check and the CALL. Every sample starts from the same state.
    function test_calleeAlwaysGetsItsFullGasCap() public {
        MockGasProbeERC20 t = new MockGasProbeERC20();
        h.setAssets(_only(_erc20(address(t))));
        vm.prank(owner);
        t.approve(address(h), type(uint256).max);
        t.mint(owner, 1e18);

        // Reference: what the callee sees when gas is plentiful (cap minus its own dispatch overhead).
        uint256 snap = vm.snapshotState();
        h.run{gas: 5_000_000}(false, address(0));
        uint256 full = t.gasAtEntry();
        vm.revertToState(snap);
        assertGt(full, h.transferGas() - 1_000);
        assertLe(full, h.transferGas());

        // Smallest tx gas for which the sweep goes through (it fails by InsufficientGas below that).
        uint256 lo = 150_000;
        uint256 hi = 600_000;
        while (hi - lo > 1) {
            uint256 mid = (lo + hi) / 2;
            snap = vm.snapshotState();
            try h.run{gas: mid}(false, address(0)) {
                hi = mid;
            } catch {
                lo = mid;
            }
            vm.revertToState(snap);
        }
        assertGt(hi, h.transferGas());

        // From the threshold up, the callee gets exactly the same gas as with plenty of gas.
        for (uint256 g = hi; g < hi + 1_000; g += 10) {
            snap = vm.snapshotState();
            h.run{gas: g}(false, address(0));
            assertEq(t.gasAtEntry(), full);
            vm.revertToState(snap);
        }
    }
}
