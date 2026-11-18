// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {stdStorage, StdStorage} from "forge-std/Test.sol";
import {IERC20Errors} from "@openzeppelin/contracts/interfaces/draft-IERC6093.sol";
import {AtropyleFactory} from "../src/AtropyleFactory.sol";
import {AtropyleVault} from "../src/AtropyleVault.sol";
import {PolicyCodec} from "../src/PolicyCodec.sol";
import {VaultConfig} from "../src/vault/VaultConfig.sol";
import {MockERC20} from "./mocks/Tokens.sol";
import {VaultFixture} from "./utils/VaultFixture.sol";

contract AtropyleFactoryTest is VaultFixture {
    using stdStorage for StdStorage;

    AtropyleFactory internal factory;
    MockERC20 internal usdt0;
    MockERC20 internal usdc;
    MockERC20 internal usdg;
    address internal treasury = makeAddr("treasury");

    function setUp() public override {
        super.setUp();
        usdt0 = new MockERC20("USDT0", "USDT0", 6);
        usdc = new MockERC20("USD Coin", "USDC", 6);
        usdg = new MockERC20("Global Dollar", "USDG", 6);
        factory = new AtropyleFactory(address(impl), address(cpu), 1, treasury, _feeTokens());
        usdt0.mint(owner, 100e6);
        vm.prank(owner);
        usdt0.approve(address(factory), type(uint256).max);
    }

    function _feeTokens() internal view returns (address[] memory t) {
        t = new address[](3);
        t[0] = address(usdt0);
        t[1] = address(usdc);
        t[2] = address(usdg);
    }

    function _create(bytes32 salt) internal returns (address) {
        VaultConfig.Config memory c = _cfg();
        vm.prank(owner);
        return factory.createVault(c, salt, false, address(usdt0));
    }

    function test_feesScaleWithDecimals() public {
        assertEq(factory.earlyFee(address(usdt0)), 1_990_000);
        assertEq(factory.fullFee(address(usdc)), 9_900_000);
        assertEq(factory.earlyFee(address(usdg)), 1_990_000);

        MockERC20 wide = new MockERC20("Wide", "W", 18);
        address[] memory t = new address[](1);
        t[0] = address(wide);
        AtropyleFactory f = new AtropyleFactory(address(impl), address(cpu), 1, treasury, t);
        assertEq(f.earlyFee(address(wide)), 1.99e18);
        assertEq(f.fullFee(address(wide)), 9.9e18);
    }

    function test_paidVaultChargesEarlyFee() public {
        address predicted = factory.predictVault(owner, bytes32("a"));
        vm.expectEmit(address(factory));
        emit AtropyleFactory.VaultCreated(owner, predicted, false, address(usdt0), 1_990_000);
        address vault = _create(bytes32("a"));

        assertEq(vault, predicted);
        assertTrue(factory.isVault(vault));
        assertEq(usdt0.balanceOf(treasury), 1_990_000);
        assertEq(factory.paidCount(), 1);
        AtropyleVault v = AtropyleVault(vault);
        assertEq(v.owner(), owner);
        assertEq(v.factory(), address(factory));
        assertEq(address(v.cpu()), address(cpu));
        assertEq(v.policyId(), 1);
        assertFalse(v.drill());
    }

    function test_feeSwitchesAtTheHundredthPaidVault() public {
        stdstore.target(address(factory)).sig("paidCount()").checked_write(uint256(99));
        assertEq(factory.currentFee(address(usdt0)), 1_990_000);
        _create(bytes32("b"));
        assertEq(factory.paidCount(), 100);
        assertEq(factory.currentFee(address(usdt0)), 9_900_000);
        _create(bytes32("c"));
        assertEq(factory.paidCount(), 101);
        assertEq(usdt0.balanceOf(treasury), 1_990_000 + 9_900_000);
    }

    function test_drillIsFree() public {
        VaultConfig.Config memory c = _drillCfg();
        vm.prank(owner);
        address vault = factory.createVault(c, bytes32("d"), true, address(0));
        assertTrue(AtropyleVault(vault).drill());
        assertEq(AtropyleVault(vault).expiresAt(), block.timestamp + 7 days);
        assertEq(usdt0.balanceOf(treasury), 0);
        assertEq(factory.paidCount(), 0);
    }

    function test_rejectsUnsupportedFeeToken() public {
        VaultConfig.Config memory c = _cfg();
        vm.expectRevert(AtropyleFactory.UnsupportedFeeToken.selector);
        vm.prank(owner);
        factory.createVault(c, bytes32("x"), false, address(usdt));

        vm.expectRevert(AtropyleFactory.UnsupportedFeeToken.selector);
        factory.currentFee(address(0));
    }

    function test_saltIsPerOwner() public {
        VaultConfig.Config memory c = _cfg();
        address a = _create(bytes32("s"));

        usdt0.mint(stranger, 10e6);
        vm.startPrank(stranger);
        usdt0.approve(address(factory), type(uint256).max);
        address b = factory.createVault(c, bytes32("s"), false, address(usdt0));
        vm.stopPrank();

        assertTrue(a != b);
        assertEq(b, factory.predictVault(stranger, bytes32("s")));

        vm.expectRevert();
        vm.prank(owner);
        factory.createVault(c, bytes32("s"), false, address(usdt0));
    }

    function test_indexesEveryRole() public {
        address vault = _create(bytes32("i"));
        address[6] memory roles = [owner, heirA, heirB, g1, g2, g3];
        for (uint256 i; i < roles.length; ++i) {
            address[] memory list = factory.vaultsOf(roles[i]);
            assertEq(list.length, 1);
            assertEq(list[0], vault);
        }
        assertEq(factory.vaultsOf(stranger).length, 0);

        address newHeir = makeAddr("newHeir");
        VaultConfig.Heir[] memory h = new VaultConfig.Heir[](2);
        h[0] = VaultConfig.Heir(newHeir, 5000);
        h[1] = VaultConfig.Heir(heirB, 5000);
        vm.prank(owner);
        AtropyleVault(vault).setHeirs(h);
        assertEq(factory.vaultsOf(newHeir).length, 1);
        assertEq(factory.vaultsOf(heirB).length, 1); // indexed once, not twice
    }

    function test_indexOnlyFromVaults() public {
        vm.expectRevert(AtropyleFactory.NotVault.selector);
        vm.prank(stranger);
        factory.index(stranger);
    }

    function test_constructorRejectsBadArgs() public {
        address[] memory ok = _feeTokens();
        address[] memory none = new address[](0);
        address[] memory dup = new address[](2);
        dup[0] = address(usdc);
        dup[1] = address(usdc);
        address[] memory tiny = new address[](1);
        tiny[0] = address(new MockERC20("Tiny", "T", 1));
        address[] memory eoa = new address[](1);
        eoa[0] = stranger;

        vm.expectRevert(AtropyleFactory.BadConstructorArgs.selector);
        new AtropyleFactory(stranger, address(cpu), 1, treasury, ok);
        vm.expectRevert(AtropyleFactory.BadConstructorArgs.selector);
        new AtropyleFactory(address(impl), stranger, 1, treasury, ok);
        vm.expectRevert(AtropyleFactory.BadConstructorArgs.selector);
        new AtropyleFactory(address(impl), address(cpu), 1, address(0), ok);
        vm.expectRevert(AtropyleFactory.BadConstructorArgs.selector);
        new AtropyleFactory(address(impl), address(cpu), 1, treasury, none);
        vm.expectRevert(AtropyleFactory.BadConstructorArgs.selector);
        new AtropyleFactory(address(impl), address(cpu), 1, treasury, dup);
        vm.expectRevert(AtropyleFactory.BadConstructorArgs.selector);
        new AtropyleFactory(address(impl), address(cpu), 1, treasury, tiny);
        vm.expectRevert(AtropyleFactory.BadConstructorArgs.selector);
        new AtropyleFactory(address(impl), address(cpu), 1, treasury, eoa);
    }

    function test_factoryVaultRunsFullLifecycle() public {
        AtropyleVault v = AtropyleVault(_create(bytes32("l")));
        _approveAll(v);
        vm.warp(vm.getBlockTimestamp() + uint256(T) * P);
        v.poke();
        vm.prank(g1);
        v.attestDeath(true);
        vm.prank(g2);
        v.attestDeath(true);
        vm.warp(vm.getBlockTimestamp() + W);
        assertTrue(v.distribute());
        assertEq(v.state(), PolicyCodec.RELEASED_INHERIT);
        assertEq(usdt.balanceOf(heirA), 600e6);
        assertEq(usdt.balanceOf(heirB), 400e6);
    }

    // ---- beyond the brief's ten: edge cases of the factory/vault hand-off

    function test_drillIgnoresFeeToken() public {
        VaultConfig.Config memory c = _drillCfg();
        address predicted = factory.predictVault(owner, bytes32("f"));
        vm.expectEmit(address(factory));
        emit AtropyleFactory.VaultCreated(owner, predicted, true, address(0), 0);
        vm.prank(owner);
        // usdt is not a supported fee token; a Drill must not care.
        assertEq(factory.createVault(c, bytes32("f"), true, address(usdt)), predicted);
        assertEq(factory.paidCount(), 0);
    }

    function test_paysInTheChosenFeeToken() public {
        usdc.mint(owner, 20e6);
        vm.prank(owner);
        usdc.approve(address(factory), type(uint256).max);
        VaultConfig.Config memory c = _cfg();
        vm.prank(owner);
        factory.createVault(c, bytes32("u"), false, address(usdc));
        assertEq(usdc.balanceOf(treasury), 1_990_000);
        assertEq(usdt0.balanceOf(treasury), 0);
        assertEq(factory.paidCount(), 1);
    }

    function test_creationIsAtomicWithTheFee() public {
        // Invalid config: initialize() reverts after the fee transfer, so the fee must not stick.
        VaultConfig.Config memory bad = _cfg();
        bad.heirs = new VaultConfig.Heir[](0);
        address predicted = factory.predictVault(owner, bytes32("z"));
        vm.expectRevert(VaultConfig.InvalidHeirs.selector);
        vm.prank(owner);
        factory.createVault(bad, bytes32("z"), false, address(usdt0));
        assertEq(usdt0.balanceOf(treasury), 0);
        assertEq(usdt0.balanceOf(owner), 100e6);
        assertEq(factory.paidCount(), 0);
        assertFalse(factory.isVault(predicted));
        assertEq(predicted.code.length, 0);

        // Allowance short by one unit: the fee transfer itself reverts.
        vm.prank(owner);
        usdt0.approve(address(factory), 1_989_999);
        VaultConfig.Config memory c = _cfg();
        vm.expectRevert(
            abi.encodeWithSelector(
                IERC20Errors.ERC20InsufficientAllowance.selector, address(factory), 1_989_999, 1_990_000
            )
        );
        vm.prank(owner);
        factory.createVault(c, bytes32("z"), false, address(usdt0));
        assertEq(factory.paidCount(), 0);
    }

    function test_reindexingNeverDuplicates() public {
        address vault = _create(bytes32("r"));
        address[] memory g = new address[](2);
        g[0] = g1;
        g[1] = makeAddr("g4");
        vm.prank(owner);
        AtropyleVault(vault).setGuardians(g, 1, true);
        vm.prank(owner);
        AtropyleVault(vault).setHeirs(_heirs());

        assertEq(factory.vaultsOf(g1).length, 1);
        assertEq(factory.vaultsOf(g[1]).length, 1);
        assertEq(factory.vaultsOf(owner).length, 1);
        // Append-only: a removed guardian still sees the vault.
        assertEq(factory.vaultsOf(g3).length, 1);
        assertEq(factory.vaultsOf(g3)[0], vault);
    }

    function test_oneAccountCollectsEveryVaultItBelongsTo() public {
        address a = _create(bytes32("1"));
        address b = _create(bytes32("2"));
        address[] memory list = factory.vaultsOf(owner);
        assertEq(list.length, 2);
        assertEq(list[0], a);
        assertEq(list[1], b);
        assertEq(factory.vaultsOf(heirA).length, 2);
    }

    function test_implementationAndCloneCannotBeReinitialized() public {
        AtropyleVault v = AtropyleVault(_create(bytes32("n")));
        VaultConfig.Config memory c = _cfg();

        // A factory clone is initialized inside createVault; nobody can front-run or redo it.
        vm.expectRevert(AtropyleVault.AlreadyInitialized.selector);
        vm.prank(stranger);
        v.initialize(stranger, false, c, address(cpu), 1);

        // The implementation is locked and was never registered as a factory vault.
        vm.expectRevert(AtropyleVault.AlreadyInitialized.selector);
        impl.initialize(stranger, false, c, address(cpu), 1);
        assertFalse(factory.isVault(address(impl)));
        vm.expectRevert(AtropyleFactory.NotVault.selector);
        vm.prank(address(impl));
        factory.index(stranger);
    }

    function testFuzz_predictVaultMatchesCreateVault(address who, bytes32 salt) public {
        vm.assume(who != address(0) && who != heirA && who != heirB && who != g1);
        address predicted = factory.predictVault(who, salt);
        VaultConfig.Config memory c = _drillCfg();
        vm.prank(who);
        address vault = factory.createVault(c, salt, true, address(0));
        assertEq(vault, predicted);
        assertEq(AtropyleVault(vault).owner(), who);
        assertEq(factory.vaultsOf(who)[0], vault);
    }
}
