// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {AtropyleVault} from "../src/AtropyleVault.sol";
import {PolicyCodec} from "../src/PolicyCodec.sol";
import {VaultConfig} from "../src/vault/VaultConfig.sol";
import {VaultFixture} from "./utils/VaultFixture.sol";

/// @notice Drives one vault through random sequences of role actions and time jumps.
contract VaultHandler is Test {
    uint256 internal constant OWNER_GATE = 64;

    AtropyleVault public immutable vault;
    address public immutable owner;
    IERC20 internal immutable token;
    address[3] internal guardians;
    address[2] internal targets;
    address[7] internal outsiders;
    /// @dev Every account whose token balance could change if tokens moved: owner, vault, heirs, targets, guardians.
    address[9] internal watched;

    bool public releasedSeen;
    uint8 public releasedState;
    bytes32 public releasedHash;
    bool public fixpointBroken;
    bool public strangerEdited;
    bool public aliveBroken;
    /// @dev Sticky: a balance changed in an action other than distribute(), or in an owner distribute() made
    ///      before release (I1).
    bool public movedOutsideDistribute;
    /// @dev Sticky: lastAlive moved without a successful owner call (I4).
    bool public lastAliveMovedByNonOwner;

    /// @dev Configuration as last written by the owner; any other drift is an unauthorised edit.
    bytes32 internal cfgHash;
    /// @dev lastAlive as last written by a successful owner call; any other movement is a forged proof of life.
    uint64 internal lastAliveGhost;
    /// @dev Balances as left by the last distribute(): nothing else may change them. Because every handler action
    ///      ends in _record(), comparing against this is the same as snapshotting around each non-distribute action.
    bytes32 internal balanceHash;

    constructor(
        AtropyleVault v,
        address owner_,
        address[3] memory g,
        address[2] memory heirs_,
        address[2] memory targets_,
        address stranger,
        IERC20 token_
    ) {
        vault = v;
        owner = owner_;
        token = token_;
        guardians = g;
        targets = targets_;
        outsiders = [g[0], g[1], g[2], heirs_[0], heirs_[1], targets_[0], stranger];
        watched = [owner_, address(v), heirs_[0], heirs_[1], targets_[0], targets_[1], g[0], g[1], g[2]];
        cfgHash = _configHash();
        lastAliveGhost = v.lastAlive();
        balanceHash = _balanceHash();
    }

    /// @dev The owner's idle-resetting actions (checkIn, ownerConfig, ownerPoke, ownerDistribute) act only when
    ///      seed % OWNER_GATE == 0. Inheritance needs T periods of owner silence plus the alarm window, two
    ///      attestations and a sweep; ungated, the owner resets the clock so often that Released-inherit is reached in
    ///      only 0-4 of 128 runs. The fuzzer draws small seeds such as 0 far more often than 1 in OWNER_GATE, so each
    ///      gated action still fires often: with four of them a gate of 16 reached Released-inherit in only 4-13 of
    ///      128 runs (seeds 1-8). At 64 it is reached in 13-26 of 128 runs, and Released-recover in 14-29, on every
    ///      seed tried (1-16). The gate only changes how often owner actions are drawn: every sequence stays
    ///      possible, and no fuzz seed is pinned.
    function checkIn(uint256 seed) external {
        if (seed % OWNER_GATE != 0) return;
        vm.prank(owner);
        try vault.checkIn() {
            _ownerTxSucceeded();
            _afterSuccess();
        } catch {}
        _record();
    }

    function ownerConfig(uint256 seed) external {
        if (seed % OWNER_GATE != 0) return;
        VaultConfig.Timing memory t = VaultConfig.Timing(uint32(bound(seed, 1 days, 3 days)), 3, 3 days);
        vm.prank(owner);
        try vault.setTiming(t) {
            _ownerTxSucceeded();
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

    /// @dev Spec §3.2 bit 21: before release an owner-signed poke() is a check-in. Once released it is a no-op,
    ///      so it is not proof of life there (and must not move lastAlive).
    function ownerPoke(uint256 seed) external {
        if (seed % OWNER_GATE != 0) return;
        bool wasReleased = PolicyCodec.isReleased(vault.state());
        vm.prank(owner);
        try vault.poke() {
            if (!wasReleased) _ownerTxSucceeded();
            _afterSuccess();
        } catch {}
        _record();
    }

    /// @dev Before release an owner-signed distribute() is a check-in and must never sweep; once released it
    ///      sweeps like anyone else's, so only then may balances change.
    function ownerDistribute(uint256 seed) external {
        if (seed % OWNER_GATE != 0) return;
        bool wasReleased = PolicyCodec.isReleased(vault.state());
        vm.prank(owner);
        try vault.distribute() returns (bool swept) {
            if (!wasReleased) {
                if (swept) aliveBroken = true;
                _ownerTxSucceeded();
            }
            _afterSuccess();
        } catch {}
        if (wasReleased) balanceHash = _balanceHash();
        _record();
    }

    function distribute() external {
        try vault.distribute() {
            _afterSuccess();
        } catch {}
        balanceHash = _balanceHash(); // the one action that may move tokens
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

    function _balanceHash() internal view returns (bytes32) {
        uint256[9] memory b;
        for (uint256 i; i < b.length; ++i) {
            b[i] = token.balanceOf(watched[i]);
        }
        return keccak256(abi.encode(b));
    }

    /// @dev I4: a successful owner transaction is proof of life, so it stamps lastAlive and returns to Active.
    ///      It is also the only thing allowed to move lastAlive, so the ghost follows it.
    function _ownerTxSucceeded() internal {
        if (vault.lastAlive() != block.timestamp || vault.state() != PolicyCodec.ACTIVE) aliveBroken = true;
        lastAliveGhost = vault.lastAlive();
    }

    /// @dev Right after a successful call nothing has elapsed, so re-evaluating must give the stored state.
    function _afterSuccess() internal {
        if (vault.status().pending != vault.state()) fixpointBroken = true;
    }

    function _record() internal {
        if (_configHash() != cfgHash) strangerEdited = true;
        if (vault.lastAlive() != lastAliveGhost) lastAliveMovedByNonOwner = true;
        if (_balanceHash() != balanceHash) movedOutsideDistribute = true;
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

        handler = new VaultHandler(v, owner, [g1, g2, g3], [heirA, heirB], [newWallet, stranger], stranger, usdt);

        bytes4[] memory sel = new bytes4[](10);
        sel[0] = VaultHandler.checkIn.selector;
        sel[1] = VaultHandler.ownerConfig.selector;
        sel[2] = VaultHandler.strangerConfig.selector;
        sel[3] = VaultHandler.attest.selector;
        sel[4] = VaultHandler.vote.selector;
        sel[5] = VaultHandler.poke.selector;
        sel[6] = VaultHandler.distribute.selector;
        sel[7] = VaultHandler.elapse.selector;
        sel[8] = VaultHandler.ownerPoke.selector;
        sel[9] = VaultHandler.ownerDistribute.selector;
        targetContract(address(handler));
        targetSelector(FuzzSelector({addr: address(handler), selectors: sel}));
    }

    function invariant_I1_tokensMoveOnlyInDistributeAndOnlyWhenReleased() public view {
        assertFalse(handler.movedOutsideDistribute());
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
        assertFalse(handler.lastAliveMovedByNonOwner());
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

    /// The owner's poke and distribute handlers really act: each one cancels an alarm the policy would have
    /// released, and the owner's sweep after release goes through without counting as proof of life.
    function test_handlerOwnerPokeAndDistributeAreCheckIns() public {
        handler.elapse(3 days);
        handler.poke();
        assertEq(v.state(), PolicyCodec.GRACE);
        handler.ownerPoke(0);
        assertEq(v.state(), PolicyCodec.ACTIVE);
        assertEq(v.lastAlive(), block.timestamp);

        handler.elapse(3 days);
        handler.poke();
        handler.attest(0, true);
        handler.attest(1, true);
        handler.elapse(3 days);
        assertEq(v.status().pending, PolicyCodec.RELEASED_INHERIT);
        handler.ownerDistribute(0);
        assertEq(v.state(), PolicyCodec.ACTIVE);
        assertEq(usdt.balanceOf(owner), TOTAL);

        handler.elapse(3 days);
        handler.poke();
        handler.attest(0, true);
        handler.attest(1, true);
        handler.elapse(3 days);
        handler.distribute();
        assertEq(v.state(), PolicyCodec.RELEASED_INHERIT);
        usdt.mint(owner, 100e6);
        handler.ownerDistribute(0);
        assertEq(usdt.balanceOf(heirA), 660e6);
        assertFalse(handler.aliveBroken());
        assertFalse(handler.lastAliveMovedByNonOwner());
        assertFalse(handler.movedOutsideDistribute());
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
