// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test, console2} from "forge-std/Test.sol";
import {Vm} from "forge-std/Vm.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ICPU} from "../src/interfaces/ICPU.sol";
import {PolicyCodec} from "../src/PolicyCodec.sol";
import {AtropyleVault} from "../src/AtropyleVault.sol";
import {AtropyleFactory} from "../src/AtropyleFactory.sol";
import {VaultConfig} from "../src/vault/VaultConfig.sol";
import {PolicyModel} from "./mocks/PolicyModel.sol";
import {TapeoutFlow} from "../script/lib/TapeoutFlow.sol";

/// @dev forge 1.9 deprecates lastCallGas in favour of lastFrameGas, which forge-std v1.9.7 does not declare yet.
interface IVmFrameGas {
    function lastFrameGas() external view returns (Vm.Gas memory gas);
}

/// @notice Runs only with XLAYER_FORK_RPC. Without ATRO_CPU it creates a fresh processor on the fork and
///         tapes out all three circuits; with ATRO_CPU/KOFN_ID/GE4_ID/POLICY_ID/DEPLOYER it checks the live ones.
///         With ATRO_FACTORY too, every test runs on the deployed factory instead of a new one, and checks it
///         against VAULT_IMPL and TREASURY when those are set. Without ATRO_FACTORY a new factory is deployed on the
///         fork, paying fees to TREASURY when it is set.
contract ForkTest is Test {
    using SafeERC20 for IERC20;

    uint256 internal constant DEPLOYER_BEM = 1e8; // 1 BEM
    uint256 internal constant DEPLOYER_OKB = 1 ether;

    address internal deployer = makeAddr("deployer");
    address internal owner = makeAddr("forkOwner");
    address internal heirA = makeAddr("forkHeirA");
    address internal heirB = makeAddr("forkHeirB");
    address internal g1 = makeAddr("forkG1");
    address internal g2 = makeAddr("forkG2");
    address internal g3 = makeAddr("forkG3");
    address internal newWallet = makeAddr("forkNewWallet");
    address internal treasury = makeAddr("forkTreasury");

    address internal cpu;
    uint256 internal kofnId;
    uint256 internal ge4Id;
    uint256 internal policyId;
    bool internal fresh; // true when setUp created the processor on the fork
    address internal liveFactory; // ATRO_FACTORY, or 0 to deploy a new factory on the fork
    address internal liveImpl; // VAULT_IMPL, or 0
    address internal liveTreasury; // TREASURY, or 0

    function setUp() public {
        string memory rpc = vm.envOr("XLAYER_FORK_RPC", string(""));
        if (bytes(rpc).length == 0) {
            vm.skip(true);
            return;
        }
        vm.createSelectFork(rpc);

        liveFactory = vm.envOr("ATRO_FACTORY", address(0));
        liveImpl = vm.envOr("VAULT_IMPL", address(0));
        liveTreasury = vm.envOr("TREASURY", address(0));
        if (liveTreasury != address(0)) treasury = liveTreasury;

        cpu = vm.envOr("ATRO_CPU", address(0));
        if (cpu != address(0)) {
            TapeoutFlow.requireAtropyleCpu(cpu, vm.envAddress("DEPLOYER"));
            kofnId = vm.envUint("KOFN_ID");
            ge4Id = vm.envUint("GE4_ID");
            policyId = vm.envUint("POLICY_ID");
            TapeoutFlow.requireSubs(cpu, kofnId, ge4Id);
            TapeoutFlow.requirePolicy(cpu, policyId, kofnId, ge4Id, 64);
            return;
        }

        // A deployed factory is wired to the real processor, never to one this setUp creates.
        require(liveFactory == address(0), "ATRO_FACTORY needs ATRO_CPU, KOFN_ID, GE4_ID, POLICY_ID and DEPLOYER");
        fresh = true;
        deal(TapeoutFlow.BEM, deployer, DEPLOYER_BEM);
        vm.deal(deployer, DEPLOYER_OKB);
        vm.startPrank(deployer, deployer);
        cpu = TapeoutFlow.cpuOf(TapeoutFlow.createProcessor());
        TapeoutFlow.requireAtropyleCpu(cpu, deployer); // frozen-beacon check before any tape-out
        (kofnId, ge4Id) = TapeoutFlow.tapeoutSubs(cpu, deployer, 0, 0);
        policyId = TapeoutFlow.tapeoutPolicy(cpu, deployer, kofnId, ge4Id);
        vm.stopPrank();
    }

    function test_circuitsHaveSpecShape() public view {
        (uint32 nIn, uint32 nOut, uint32 nState, uint32 gates) = ICPU(cpu).circuitInfo(policyId);
        console2.log("AtropylePolicy gateCount", gates);
        assertEq(nIn, 23);
        assertEq(nOut, 3);
        assertEq(nState, 3);
        assertLe(gates, 230);
        (nIn, nOut, nState, gates) = ICPU(cpu).circuitInfo(kofnId);
        assertEq(abi.encode(nIn, nOut, nState, gates), abi.encode(uint32(8), uint32(1), uint32(0), uint32(41)));
        (nIn, nOut, nState, gates) = ICPU(cpu).circuitInfo(ge4Id);
        assertEq(abi.encode(nIn, nOut, nState, gates), abi.encode(uint32(8), uint32(1), uint32(0), uint32(25)));
    }

    /// forge-config: default.fuzz.runs = 10000
    function testFuzz_chainMatchesModel(uint8 s, uint24 w) public view {
        _checkStep(s & 7, w & 0x7fffff);
    }

    /// Every state code against every input class that changes a transition (spec §9):
    /// 8 states x idle {0, T, 15} x inh {1, 2 votes} x rec {0, 1, 2 votes} x k {0, 2} x alive x windowDone.
    function test_everyTransitionClassOnChain() public view {
        uint8[3] memory idles = [0, 3, 15];
        uint8[3] memory recs = [0, 1, 3];
        for (uint256 i; i < 8 * 144; ++i) {
            uint256 x = i;
            uint8 s = uint8(x % 8);
            x /= 8;
            uint8 idle = idles[x % 3];
            x /= 3;
            uint8 inh = x % 2 == 0 ? 1 : 3;
            x /= 2;
            uint8 rec = recs[x % 3];
            x /= 3;
            uint8 k = x % 2 == 0 ? 0 : 2;
            x /= 2; // 0..3 remain: alive and windowDone
            PolicyCodec.Inputs memory inp = PolicyCodec.Inputs({
                idle: idle,
                threshold: 3,
                inhVotes: inh,
                recVotes: rec,
                k: k,
                alive: x % 2 == 1,
                windowDone: x / 2 == 1
            });
            _checkStep(s, PolicyCodec.toWord(inp));
        }
    }

    function test_allVectorsOnChain() public view {
        TapeoutFlow.requirePolicy(cpu, policyId, kofnId, ge4Id, 512);
    }

    function test_stepGas() public view {
        bytes memory st = PolicyCodec.encodeState(PolicyCodec.GRACE);
        bytes memory inp = PolicyCodec.packWord(0x5f1234);
        uint256 g0 = gasleft();
        ICPU(cpu).step(policyId, st, inp);
        uint256 used = g0 - gasleft();
        console2.log("AtropylePolicy step gas", used);
        assertLt(used, 1_500_000);
    }

    function test_endToEndInheritanceOnRealCircuit() public {
        AtropyleVault v = _newVault(40e6);
        vm.warp(vm.getBlockTimestamp() + 3 days);
        v.poke();
        assertEq(v.state(), PolicyCodec.GRACE);
        vm.prank(g1);
        v.attestDeath(true);
        vm.prank(g2);
        v.attestDeath(true);
        vm.warp(vm.getBlockTimestamp() + 3 days);
        assertTrue(v.distribute());
        assertEq(v.state(), PolicyCodec.RELEASED_INHERIT);
        assertEq(IERC20(TapeoutFlow.USDT0).balanceOf(heirA), 24e6);
        assertEq(IERC20(TapeoutFlow.USDT0).balanceOf(heirB), 16e6);
    }

    function test_endToEndRecoveryOnRealCircuit() public {
        AtropyleVault v = _newVault(60e6);
        vm.prank(g1);
        v.voteRecovery(newWallet);
        vm.prank(g2);
        v.voteRecovery(newWallet);
        assertEq(v.state(), PolicyCodec.RECOVERY);
        vm.warp(vm.getBlockTimestamp() + 3 days);
        assertTrue(v.distribute());
        assertEq(v.state(), PolicyCodec.RELEASED_RECOVER);
        assertEq(IERC20(TapeoutFlow.USDT0).balanceOf(newWallet), 60e6);
    }

    /// The implementation behind every clone was locked by its constructor. With VAULT_IMPL set this checks the
    /// deployed implementation itself.
    function test_vaultImplementationIsLocked() public {
        AtropyleVault impl = AtropyleVault(liveImpl != address(0) ? liveImpl : _factory().vaultImpl());
        assertGt(address(impl).code.length, 0, "VAULT_IMPL has no code");
        assertEq(impl.owner(), address(0));
        assertEq(impl.factory(), address(0));
        VaultConfig.Config memory c = _cfg(TapeoutFlow.USDT0);
        vm.expectRevert(AtropyleVault.AlreadyInitialized.selector);
        impl.initialize(owner, false, c, cpu, policyId);
    }

    /// Spec §5 fee path on the real tokens: one paid vault per fee token, and the fee lands in the treasury.
    /// Run it with the real TREASURY before stage 04: a revert means that token refuses the treasury (blacklisted,
    /// frozen or paused), and the immutable factory could never collect fees in it.
    function test_treasuryReceivesEveryFeeToken() public {
        AtropyleFactory f = _factory();
        address t = f.treasury();
        address[] memory fee = TapeoutFlow.feeTokens();
        for (uint256 i; i < fee.length; ++i) {
            IERC20 token = IERC20(fee[i]);
            address payer = makeAddr(string.concat("forkFeePayer", vm.toString(i)));
            uint256 price = f.currentFee(fee[i]);
            deal(fee[i], payer, price); // forge-std finds the balance slot behind each token's proxy
            assertEq(token.balanceOf(payer), price, "deal");
            uint256 before = token.balanceOf(t);

            vm.startPrank(payer);
            token.forceApprove(address(f), price);
            address v = f.createVault(_cfg(fee[i]), bytes32("fee"), false, fee[i]);
            vm.stopPrank();

            console2.log("fee paid to treasury", IERC20Metadata(fee[i]).symbol(), price);
            assertEq(token.balanceOf(t) - before, price, "treasury did not receive the fee");
            assertEq(token.balanceOf(payer), 0);
            assertTrue(f.isVault(v));
        }
    }

    /// Spec §10 budget, read off the deployer's balances after setUp. Forge runs at gas price 0, so the OKB
    /// figure is the tape-out fees alone; gas comes on top.
    function test_tapeoutBudget() public {
        if (!fresh) vm.skip(true);
        uint256 bem = DEPLOYER_BEM - IERC20(TapeoutFlow.BEM).balanceOf(deployer);
        uint256 okb = DEPLOYER_OKB - deployer.balance;
        console2.log("BEM spent (8 decimals)", bem);
        console2.log("OKB spent on tape-out fees (wei)", okb);
        assertLt(bem, 0.5e8);
        assertLt(okb, 0.05 ether);
    }

    /// One free Drill from creation to release. Isolation (forge 1.9's default, pinned here because the figures
    /// rely on it) runs each top-level call as its own transaction, so each figure includes the 21000 base cost.
    /// forge-config: default.isolate = true
    function test_drillLifecycleGas() public {
        AtropyleFactory f = _factory();
        IERC20 usdt0 = IERC20(TapeoutFlow.USDT0);
        deal(address(usdt0), owner, 10e6);
        VaultConfig.Config memory c = _cfg(address(usdt0));
        c.timing = VaultConfig.Timing(60, 1, 60);
        uint256 total;

        vm.prank(owner);
        AtropyleVault v = AtropyleVault(f.createVault(c, bytes32("drill"), true, address(0)));
        total += _logGas("drill createVault");
        assertEq(address(v.cpu()), cpu);
        assertEq(v.policyId(), policyId);
        vm.prank(owner);
        usdt0.forceApprove(address(v), 5e6);
        total += _logGas("drill owner approve");

        vm.warp(vm.getBlockTimestamp() + 60);
        v.poke();
        total += _logGas("drill poke -> GRACE");
        assertEq(v.state(), PolicyCodec.GRACE);
        vm.prank(g1);
        v.attestDeath(true);
        total += _logGas("drill attestDeath #1");
        vm.prank(g2);
        v.attestDeath(true);
        total += _logGas("drill attestDeath #2");
        vm.warp(vm.getBlockTimestamp() + 60);
        assertTrue(v.distribute());
        total += _logGas("drill distribute (release + sweep)");
        assertEq(v.state(), PolicyCodec.RELEASED_INHERIT);
        assertEq(usdt0.balanceOf(heirA), 3e6);
        assertEq(usdt0.balanceOf(heirB), 2e6);
        console2.log("drill lifecycle total gas", total);
    }

    function _logGas(string memory what) internal view returns (uint256 used) {
        used = IVmFrameGas(address(vm)).lastFrameGas().gasTotalUsed;
        console2.log(what, used);
    }

    function _checkStep(uint8 s, uint24 w) internal view {
        (bytes memory ns, bytes memory out) =
            ICPU(cpu).step(policyId, PolicyCodec.encodeState(s), PolicyCodec.packWord(w));
        (uint8 n, uint8 o) = PolicyModel.step(s, w);
        assertEq(ns.length, 1);
        assertEq(out.length, 1);
        assertEq(PolicyCodec.firstByte(ns), n, "next");
        assertEq(PolicyCodec.firstByte(out), o, "out");
    }

    function _cfg(address token) internal view returns (VaultConfig.Config memory c) {
        c.heirs = new VaultConfig.Heir[](2);
        c.heirs[0] = VaultConfig.Heir(heirA, 6000);
        c.heirs[1] = VaultConfig.Heir(heirB, 4000);
        c.guardians = new address[](3);
        c.guardians[0] = g1;
        c.guardians[1] = g2;
        c.guardians[2] = g3;
        c.k = 2;
        c.recoveryEnabled = true;
        c.timing = VaultConfig.Timing(1 days, 3, 3 days);
        c.assets = new VaultConfig.Asset[](1);
        c.assets[0] = VaultConfig.Asset(VaultConfig.Kind.ERC20, token, 0, 0);
    }

    /// The deployed factory (ATRO_FACTORY), or a new one with the real fee tokens on the fork. Either way it must
    /// be wired to the circuit under test and charge the spec §5 fees (1.99 / 9.9 tokens at each token's decimals).
    function _factory() internal returns (AtropyleFactory f) {
        address[] memory fee = TapeoutFlow.feeTokens();
        if (liveFactory != address(0)) {
            f = AtropyleFactory(liveFactory);
            if (liveImpl != address(0)) assertEq(f.vaultImpl(), liveImpl, "vaultImpl != VAULT_IMPL");
            if (liveTreasury != address(0)) assertEq(f.treasury(), liveTreasury, "treasury != TREASURY");
        } else {
            f = new AtropyleFactory(address(new AtropyleVault()), cpu, policyId, treasury, fee);
            assertEq(f.treasury(), treasury);
        }
        assertEq(f.cpu(), cpu, "cpu != ATRO_CPU");
        assertEq(f.policyId(), policyId, "policyId != POLICY_ID");
        for (uint256 i; i < fee.length; ++i) {
            uint256 unit = 10 ** (IERC20Metadata(fee[i]).decimals() - 2);
            assertEq(f.earlyFee(fee[i]), 199 * unit, "early fee");
            assertEq(f.fullFee(fee[i]), 990 * unit, "full fee");
        }
    }

    /// The owner pays the current fee and approves `allowance` to the new vault.
    function _newVault(uint256 allowance) internal returns (AtropyleVault v) {
        AtropyleFactory f = _factory();
        IERC20 usdt0 = IERC20(TapeoutFlow.USDT0);
        uint256 price = f.currentFee(address(usdt0));
        uint256 before = usdt0.balanceOf(f.treasury());
        deal(address(usdt0), owner, 100e6);
        VaultConfig.Config memory c = _cfg(address(usdt0));
        vm.startPrank(owner);
        usdt0.forceApprove(address(f), type(uint256).max);
        v = AtropyleVault(f.createVault(c, bytes32("fork"), false, address(usdt0)));
        usdt0.forceApprove(address(v), allowance);
        vm.stopPrank();
        assertEq(usdt0.balanceOf(f.treasury()) - before, price);
        // The clone is wired to the taped-out policy, so every transition below runs the real circuit.
        assertEq(address(v.cpu()), cpu);
        assertEq(v.policyId(), policyId);
    }
}
