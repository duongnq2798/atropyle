// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {AtropyleVault} from "../src/AtropyleVault.sol";
import {PolicyCodec} from "../src/PolicyCodec.sol";
import {VaultConfig} from "../src/vault/VaultConfig.sol";
import {VaultFixture} from "./utils/VaultFixture.sol";

/// @notice Drives one vault through random sequences of role actions and time jumps.
contract VaultHandler is Test {
    AtropyleVault public immutable vault;
    address public immutable owner;
    address[3] internal guardians;
    address[2] internal targets;
    address[7] internal outsiders;

    bool public releasedSeen;
    uint8 public releasedState;
    bytes32 public releasedHash;
    bool public fixpointBroken;
    bool public strangerEdited;
    bool public aliveBroken;

    /// @dev Configuration as last written by the owner; any other drift is an unauthorised edit.
    bytes32 internal cfgHash;

    constructor(
        AtropyleVault v,
        address owner_,
        address[3] memory g,
        address[2] memory heirs_,
        address[2] memory targets_,
        address stranger
    ) {
        vault = v;
        owner = owner_;
        guardians = g;
        targets = targets_;
        outsiders = [g[0], g[1], g[2], heirs_[0], heirs_[1], targets_[0], stranger];
        cfgHash = _configHash();
    }

    function checkIn() external {
        vm.prank(owner);
        try vault.checkIn() {
            _assertOwnerTxIsAlive();
            _afterSuccess();
        } catch {}
        _record();
    }

    function ownerConfig(uint256 seed) external {
        VaultConfig.Timing memory t = VaultConfig.Timing(uint32(bound(seed, 1 days, 3 days)), 3, 3 days);
        vm.prank(owner);
        try vault.setTiming(t) {
            _assertOwnerTxIsAlive();
            cfgHash = _configHash();
            _afterSuccess();
        } catch {}
        _record();
    }

    /// @dev Every owner-only entry point, called by a non-owner with payloads that are valid for the current
    ///      configuration, so a revert can only come from the access check. Any success is a violation.
    function strangerConfig(uint256 who, uint256 seed) external {
        address actor = outsiders[who % outsiders.length];
        VaultConfig.Timing memory t = VaultConfig.Timing(uint32(bound(seed, 1 days, 3 days)), 3, 3 days);
        VaultConfig.Heir[] memory h = vault.heirs();
        address[] memory g = vault.guardians();
        uint8 k = vault.k();
        bool rec = vault.recoveryEnabled();
        VaultConfig.Asset[] memory a = vault.assets();

        vm.startPrank(actor);
        try vault.setTiming(t) {
            strangerEdited = true;
        } catch {}
        try vault.setHeirs(h) {
            strangerEdited = true;
        } catch {}
        try vault.setGuardians(g, k, rec) {
            strangerEdited = true;
        } catch {}
        try vault.setAssets(a) {
            strangerEdited = true;
        } catch {}
        try vault.checkIn() {
            strangerEdited = true;
        } catch {}
        vm.stopPrank();
        _record();
    }

    function attest(uint256 g, bool on) external {
        vm.prank(guardians[g % 3]);
        try vault.attestDeath(on) {
            _afterSuccess();
        } catch {}
        _record();
    }

    /// @dev t % 3 picks newWallet, stranger, or address(0) (withdraw).
    function vote(uint256 g, uint256 t) external {
        address target = t % 3 < 2 ? targets[t % 3] : address(0);
        vm.prank(guardians[g % 3]);
        try vault.voteRecovery(target) {
            _afterSuccess();
        } catch {}
        _record();
    }

    function poke() external {
        try vault.poke() {
            _afterSuccess();
        } catch {}
        _record();
    }

    function distribute() external {
        try vault.distribute() {
            _afterSuccess();
        } catch {}
        _record();
    }

    function elapse(uint256 dt) external {
        vm.warp(block.timestamp + bound(dt, 1 hours, 4 days));
    }

    function snapshotHash() public view returns (bytes32) {
        return keccak256(abi.encode(_configHash(), _lifecycleHash()));
    }

    function _configHash() internal view returns (bytes32) {
        return keccak256(
            abi.encode(
                vault.heirs(), vault.guardians(), vault.timing(), vault.assets(), vault.k(), vault.recoveryEnabled()
            )
        );
    }

    function _lifecycleHash() internal view returns (bytes32) {
        address[] memory g = vault.guardians();
        address[] memory recVotes = new address[](g.length);
        for (uint256 i; i < g.length; ++i) {
            recVotes[i] = vault.recVote(g[i]);
        }
        return keccak256(
            abi.encode(
                vault.state(),
                vault.lastAlive(),
                vault.alarmAt(),
                vault.releasedAt(),
                vault.inhVotes(),
                vault.recoveryTarget(),
                recVotes
            )
        );
    }

    /// @dev I4: a successful owner transaction is proof of life, so it stamps lastAlive and returns to Active.
    function _assertOwnerTxIsAlive() internal {
        if (vault.lastAlive() != block.timestamp || vault.state() != PolicyCodec.ACTIVE) aliveBroken = true;
    }

    /// @dev Right after a successful call nothing has elapsed, so re-evaluating must give the stored state.
    function _afterSuccess() internal {
        if (vault.status().pending != vault.state()) fixpointBroken = true;
    }

    function _record() internal {
        if (_configHash() != cfgHash) strangerEdited = true;
        uint8 s = vault.state();
        if (!releasedSeen && PolicyCodec.isReleased(s)) {
            releasedSeen = true;
            releasedState = s;
            releasedHash = snapshotHash();
        }
    }
}

contract VaultInvariantTest is VaultFixture {
    uint256 internal constant TOTAL = 1000e6;

    AtropyleVault internal v;
    VaultHandler internal handler;

    function setUp() public override {
        super.setUp();
        VaultConfig.Config memory c = _cfg();
        c.assets = new VaultConfig.Asset[](1);
        c.assets[0] = VaultConfig.Asset(VaultConfig.Kind.ERC20, address(usdt), 0, 0);
        v = _deploy(c, false);
        vm.prank(owner);
        usdt.approve(address(v), type(uint256).max);

        handler = new VaultHandler(v, owner, [g1, g2, g3], [heirA, heirB], [newWallet, stranger], stranger);

        bytes4[] memory sel = new bytes4[](8);
        sel[0] = VaultHandler.checkIn.selector;
        sel[1] = VaultHandler.ownerConfig.selector;
        sel[2] = VaultHandler.strangerConfig.selector;
        sel[3] = VaultHandler.attest.selector;
        sel[4] = VaultHandler.vote.selector;
        sel[5] = VaultHandler.poke.selector;
        sel[6] = VaultHandler.distribute.selector;
        sel[7] = VaultHandler.elapse.selector;
        targetContract(address(handler));
        targetSelector(FuzzSelector({addr: address(handler), selectors: sel}));
    }

    function invariant_I1_tokensStayWithOwnerUntilReleased() public view {
        if (!PolicyCodec.isReleased(v.state())) assertEq(usdt.balanceOf(owner), TOTAL);
    }

    function invariant_I2_recipientsMatchMode() public view {
        uint256 toHeirs = usdt.balanceOf(heirA) + usdt.balanceOf(heirB);
        uint256 toTargets = usdt.balanceOf(newWallet) + usdt.balanceOf(stranger);
        assertEq(usdt.balanceOf(owner) + toHeirs + toTargets, TOTAL);
        uint8 s = v.state();
        if (s == PolicyCodec.RELEASED_INHERIT) assertEq(toTargets, 0);
        if (s == PolicyCodec.RELEASED_RECOVER) {
            assertEq(toHeirs, 0);
            address other = v.recoveryTarget() == newWallet ? stranger : newWallet;
            assertEq(usdt.balanceOf(other), 0);
        }
    }

    function invariant_I3_releasedIsFinal() public view {
        if (!handler.releasedSeen()) return;
        assertEq(v.state(), handler.releasedState());
        assertEq(handler.snapshotHash(), handler.releasedHash());
    }

    function invariant_I4_onlyOwnerConfiguresAndEveryOwnerTxIsAlive() public view {
        assertFalse(handler.strangerEdited());
        assertFalse(handler.aliveBroken());
    }

    function invariant_I5_vaultHoldsNothing() public view {
        assertEq(usdt.balanceOf(address(v)), 0);
    }

    function invariant_I6_stateIsCanonicalAndMatchesStep() public view {
        assertTrue(PolicyCodec.isCanonical(v.state()));
        assertFalse(handler.fixpointBroken());
    }

    /// The handler can reach both release modes, so the invariants above are not vacuous.
    function test_handlerReachesInheritance() public {
        handler.elapse(3 days);
        handler.poke();
        handler.attest(0, true);
        handler.attest(1, true);
        handler.elapse(3 days);
        handler.distribute();
        assertEq(v.state(), PolicyCodec.RELEASED_INHERIT);
        assertEq(usdt.balanceOf(heirA), 600e6);
        assertTrue(handler.releasedSeen());
        assertFalse(handler.fixpointBroken());
    }

    function test_handlerReachesRecovery() public {
        handler.vote(0, 0);
        handler.vote(1, 0);
        handler.elapse(3 days);
        handler.distribute();
        assertEq(v.state(), PolicyCodec.RELEASED_RECOVER);
        assertEq(usdt.balanceOf(newWallet), TOTAL);
        assertTrue(handler.releasedSeen());
        assertFalse(handler.fixpointBroken());
    }
}
