// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";
import {AtropyleVault} from "../src/AtropyleVault.sol";
import {PolicyCodec} from "../src/PolicyCodec.sol";
import {VaultConfig} from "../src/vault/VaultConfig.sol";
import {BadPolicyCPU} from "./mocks/PolicyModel.sol";
import {ReentrantERC20} from "./mocks/Tokens.sol";
import {VaultFixture} from "./utils/VaultFixture.sol";

contract AtropyleVaultTest is VaultFixture {
    AtropyleVault internal v;

    function setUp() public override {
        super.setUp();
        v = _deploy(_cfg(), false);
        _approveAll(v);
    }

    function _toGrace() internal {
        vm.warp(vm.getBlockTimestamp() + uint256(T) * P);
        v.poke();
        assertEq(v.state(), PolicyCodec.GRACE);
    }

    function _attestTwo() internal {
        vm.prank(g1);
        v.attestDeath(true);
        vm.prank(g2);
        v.attestDeath(true);
    }

    function _toRecovery() internal {
        vm.prank(g1);
        v.voteRecovery(newWallet);
        vm.prank(g2);
        v.voteRecovery(newWallet);
        assertEq(v.state(), PolicyCodec.RECOVERY);
    }

    function test_initialState() public view {
        assertEq(v.owner(), owner);
        assertEq(v.factory(), address(this));
        assertEq(address(v.cpu()), address(cpu));
        assertEq(v.policyId(), 1);
        assertEq(v.state(), PolicyCodec.ACTIVE);
        assertEq(v.lastAlive(), block.timestamp);
        assertEq(v.heirs().length, 2);
        assertEq(v.guardians().length, 3);
        assertEq(v.k(), 2);
        assertFalse(v.drill());
        assertEq(v.expiresAt(), 0);
    }

    function test_cannotReinitialize() public {
        vm.expectRevert(AtropyleVault.AlreadyInitialized.selector);
        v.initialize(stranger, false, _cfg(), address(cpu), 1);
        vm.expectRevert(AtropyleVault.AlreadyInitialized.selector);
        impl.initialize(stranger, false, _cfg(), address(cpu), 1);
    }

    function test_graceStartsExactlyAtThreshold() public {
        vm.warp(vm.getBlockTimestamp() + uint256(T) * P - 1);
        v.poke();
        assertEq(v.state(), PolicyCodec.ACTIVE);
        vm.warp(vm.getBlockTimestamp() + 1);
        vm.expectEmit(address(v));
        emit AtropyleVault.AlarmRaised(PolicyCodec.GRACE, address(0));
        v.poke();
        assertEq(v.state(), PolicyCodec.GRACE);
        assertEq(v.alarmAt(), block.timestamp);
    }

    function test_inheritanceWithGuardianQuorum() public {
        _toGrace();
        _attestTwo();
        assertEq(v.inhVotes(), 3); // guardians 0 and 1
        assertEq(v.state(), PolicyCodec.GRACE);
        vm.warp(vm.getBlockTimestamp() + W - 1);
        assertFalse(v.distribute());
        vm.warp(vm.getBlockTimestamp() + 1);
        assertTrue(v.distribute());
        assertEq(v.state(), PolicyCodec.RELEASED_INHERIT);
        assertEq(v.releasedAt(), block.timestamp);
        assertEq(usdt.balanceOf(heirA), 600e6);
        assertEq(usdt.balanceOf(heirB), 400e6);
        assertEq(nft.ownerOf(1), heirA);
        assertEq(multi.balanceOf(heirB, 7), 5);
    }

    function test_fallbackAfterFifteenPeriodsWithoutGuardians() public {
        _toGrace();
        vm.warp(block.timestamp + W); // window over, idle 6, nobody attested
        assertFalse(v.distribute());
        assertEq(v.state(), PolicyCodec.GRACE);
        vm.warp(uint256(v.lastAlive()) + 15 * uint256(P)); // idle maxed
        assertTrue(v.distribute());
        assertEq(v.state(), PolicyCodec.RELEASED_INHERIT);
        assertEq(usdt.balanceOf(heirA), 600e6);
    }

    function test_simpleTemplateNeedsNoGuardians() public {
        VaultConfig.Config memory c = _cfg();
        c.guardians = new address[](0);
        c.k = 0;
        c.recoveryEnabled = false;
        AtropyleVault s = _deploy(c, false);
        _approveAll(s);
        vm.warp(block.timestamp + uint256(T) * P);
        s.poke();
        vm.warp(block.timestamp + W);
        assertTrue(s.distribute());
        assertEq(usdt.balanceOf(heirA), 600e6);
    }

    function test_checkInCancelsAlarm() public {
        _toGrace();
        vm.expectEmit(address(v));
        emit AtropyleVault.AlarmCancelled(true);
        vm.prank(owner);
        v.checkIn();
        assertEq(v.state(), PolicyCodec.ACTIVE);
        assertEq(v.alarmAt(), 0);
        assertEq(v.lastAlive(), block.timestamp);
    }

    // ---- spec §3.2 bit 21 / §4.5 I4: every owner-signed poke() or distribute() before release is a check-in ----

    function test_ownerPokeAfterThresholdIsProofOfLife() public {
        vm.warp(vm.getBlockTimestamp() + uint256(T) * P);
        vm.expectEmit(address(v));
        emit AtropyleVault.Alive(uint64(vm.getBlockTimestamp()));
        vm.prank(owner);
        v.poke();
        assertEq(v.state(), PolicyCodec.ACTIVE);
        assertEq(v.lastAlive(), vm.getBlockTimestamp());
        assertEq(v.alarmAt(), 0);
    }

    function test_ownerPokeInGraceCancelsTheAlarm() public {
        _toGrace();
        _attestTwo();
        vm.expectEmit(address(v));
        emit AtropyleVault.AlarmCancelled(true);
        vm.prank(owner);
        v.poke();
        assertEq(v.state(), PolicyCodec.ACTIVE);
        assertEq(v.alarmAt(), 0);
        assertEq(v.inhVotes(), 0);
        assertEq(v.lastAlive(), vm.getBlockTimestamp());
    }

    /// The window is over and two guardians attested: a sweep by anyone else would release now.
    function test_ownerDistributeInGraceCancelsInsteadOfReleasing() public {
        _toGrace();
        _attestTwo();
        vm.warp(vm.getBlockTimestamp() + W);
        assertEq(v.status().pending, PolicyCodec.RELEASED_INHERIT);
        vm.expectEmit(address(v));
        emit AtropyleVault.AlarmCancelled(true);
        vm.prank(owner);
        assertFalse(v.distribute());
        assertEq(v.state(), PolicyCodec.ACTIVE);
        assertEq(v.releasedAt(), 0);
        assertEq(v.inhVotes(), 0);
        assertEq(v.lastAlive(), vm.getBlockTimestamp());
        assertEq(usdt.balanceOf(owner), 1000e6);
        assertEq(nft.ownerOf(1), owner);
    }

    function test_ownerPokeInRecoveryCancelsAndClearsVotes() public {
        _toRecovery();
        vm.expectEmit(address(v));
        emit AtropyleVault.AlarmCancelled(true);
        vm.prank(owner);
        v.poke();
        assertEq(v.state(), PolicyCodec.ACTIVE);
        assertEq(v.recoveryTarget(), address(0));
        assertEq(v.recVote(g1), address(0));
        assertEq(v.recVote(g2), address(0));
        assertEq(v.alarmAt(), 0);
    }

    function test_ownerDistributeInRecoveryAfterWindowCancels() public {
        _toRecovery();
        vm.warp(vm.getBlockTimestamp() + W);
        vm.prank(owner);
        assertFalse(v.distribute());
        assertEq(v.state(), PolicyCodec.ACTIVE);
        assertEq(v.recVote(g1), address(0));
        assertEq(usdt.balanceOf(newWallet), 0);
    }

    function test_ownerDistributeOnReleasedVaultStillSweeps() public {
        _toGrace();
        _attestTwo();
        vm.warp(vm.getBlockTimestamp() + W);
        assertTrue(v.distribute());
        uint64 alive = v.lastAlive();

        usdt.mint(owner, 100e6);
        vm.prank(owner);
        assertTrue(v.distribute());
        assertEq(v.state(), PolicyCodec.RELEASED_INHERIT);
        assertEq(v.lastAlive(), alive);
        assertEq(usdt.balanceOf(heirA), 660e6);
        assertEq(usdt.balanceOf(heirB), 440e6);

        vm.prank(owner);
        v.poke(); // a no-op once released
        assertEq(v.state(), PolicyCodec.RELEASED_INHERIT);
        assertEq(v.lastAlive(), alive);
    }

    function test_nonOwnerPokeAndDistributeAreNotProofOfLife() public {
        uint64 alive = v.lastAlive();
        vm.warp(vm.getBlockTimestamp() + uint256(T) * P);
        vm.prank(stranger);
        v.poke();
        assertEq(v.state(), PolicyCodec.GRACE);
        assertEq(v.lastAlive(), alive);
        _attestTwo();
        vm.warp(vm.getBlockTimestamp() + W);
        vm.prank(heirA);
        assertTrue(v.distribute());
        assertEq(v.state(), PolicyCodec.RELEASED_INHERIT);
        assertEq(v.lastAlive(), alive);
    }

    function test_ownerPokeOnExpiredDrillReverts() public {
        AtropyleVault d = _deploy(_drillCfg(), true);
        vm.warp(vm.getBlockTimestamp() + 7 days);
        vm.expectRevert(AtropyleVault.DrillExpired.selector);
        vm.prank(owner);
        d.poke();
        vm.expectRevert(AtropyleVault.DrillExpired.selector);
        vm.prank(owner);
        d.distribute();
    }

    /// Review Focus #1
    function test_lateCheckInBeatsUnclaimedRelease() public {
        _toGrace();
        _attestTwo();
        vm.warp(block.timestamp + W + 1 days); // release is possible, nobody claimed it yet
        vm.prank(owner);
        v.checkIn();
        assertEq(v.state(), PolicyCodec.ACTIVE);
        assertEq(v.inhVotes(), 0);
        assertFalse(v.distribute());
        assertEq(usdt.balanceOf(owner), 1000e6);
    }

    function test_recoveryHappyPath() public {
        vm.prank(g1);
        v.voteRecovery(newWallet);
        assertEq(v.state(), PolicyCodec.ACTIVE);
        vm.expectEmit(address(v));
        emit AtropyleVault.AlarmRaised(PolicyCodec.RECOVERY, newWallet);
        vm.prank(g2);
        v.voteRecovery(newWallet);
        assertEq(v.state(), PolicyCodec.RECOVERY);
        assertEq(v.recoveryTarget(), newWallet);
        vm.warp(block.timestamp + W);
        assertTrue(v.distribute());
        assertEq(v.state(), PolicyCodec.RELEASED_RECOVER);
        assertEq(usdt.balanceOf(newWallet), 1000e6);
        assertEq(nft.ownerOf(1), newWallet);
        assertEq(multi.balanceOf(newWallet, 7), 5);
    }

    function test_ownerVetoesRecovery() public {
        _toRecovery();
        vm.prank(owner);
        v.checkIn();
        assertEq(v.state(), PolicyCodec.ACTIVE);
        assertEq(v.recoveryTarget(), address(0));
        assertEq(v.recVote(g1), address(0));
        assertEq(v.recVote(g2), address(0));
    }

    function test_splitVotesDoNotReachQuorum() public {
        vm.prank(g1);
        v.voteRecovery(newWallet);
        vm.prank(g2);
        v.voteRecovery(stranger);
        assertEq(v.state(), PolicyCodec.ACTIVE);
    }

    function test_losingQuorumCancels() public {
        _toRecovery();
        vm.expectEmit(address(v));
        emit AtropyleVault.AlarmCancelled(false);
        vm.prank(g2);
        v.voteRecovery(address(0));
        assertEq(v.state(), PolicyCodec.ACTIVE);
        assertEq(v.recoveryTarget(), address(0));
    }

    function test_losingQuorumWhileLateFallsBackToGrace() public {
        vm.warp(vm.getBlockTimestamp() + P);
        _toRecovery(); // alarm at +1 day
        vm.warp(vm.getBlockTimestamp() + 2 * uint256(P)); // +3 days: late, window still open
        vm.prank(g2);
        v.voteRecovery(address(0));
        assertEq(v.state(), PolicyCodec.GRACE);
        assertEq(v.recoveryTarget(), address(0));
        assertEq(v.alarmAt(), block.timestamp);
    }

    function test_recoveryRules() public {
        VaultConfig.Config memory c = _cfg();
        c.recoveryEnabled = false;
        AtropyleVault off = _deploy(c, false);

        vm.expectRevert(AtropyleVault.RecoveryDisabled.selector);
        vm.prank(g1);
        off.voteRecovery(newWallet);

        vm.expectRevert(VaultConfig.NotGuardian.selector);
        vm.prank(stranger);
        v.voteRecovery(newWallet);

        vm.expectRevert(AtropyleVault.InvalidTarget.selector);
        vm.prank(g1);
        v.voteRecovery(owner);

        vm.expectRevert(AtropyleVault.InvalidTarget.selector);
        vm.prank(g1);
        v.voteRecovery(g3);

        vm.expectRevert(AtropyleVault.InvalidTarget.selector);
        vm.prank(g1);
        v.voteRecovery(address(v));
    }

    /// Review Focus #2
    function test_replacingGuardiansClearsStaleVotes() public {
        vm.prank(g1);
        v.voteRecovery(newWallet);

        address[] memory two = new address[](2);
        two[0] = g2;
        two[1] = g3;
        vm.prank(owner);
        v.setGuardians(two, 2, true);
        assertEq(v.recVote(g1), address(0));

        vm.prank(owner);
        v.setGuardians(_guardians(), 2, true); // g1 is back
        vm.prank(g2);
        v.voteRecovery(newWallet); // g1's old vote must not count
        assertEq(v.state(), PolicyCodec.ACTIVE);
        assertEq(v.recoveryTarget(), address(0));
    }

    function test_onlyRolesCanAct() public {
        vm.expectRevert(AtropyleVault.NotOwner.selector);
        vm.prank(stranger);
        v.checkIn();

        VaultConfig.Heir[] memory h = _heirs();
        vm.expectRevert(AtropyleVault.NotOwner.selector);
        vm.prank(heirA);
        v.setHeirs(h);

        vm.expectRevert(VaultConfig.NotGuardian.selector);
        vm.prank(heirA);
        v.attestDeath(true);
    }

    function test_releasedIsFinalButSweepsAgain() public {
        _toGrace();
        _attestTwo();
        vm.warp(block.timestamp + W);
        assertTrue(v.distribute());

        vm.expectRevert(AtropyleVault.AlreadyReleased.selector);
        vm.prank(owner);
        v.checkIn();

        vm.expectRevert(AtropyleVault.AlreadyReleased.selector);
        vm.prank(owner);
        v.setTiming(VaultConfig.Timing(P, T, W));

        vm.expectRevert(AtropyleVault.AlreadyReleased.selector);
        vm.prank(g3);
        v.attestDeath(true);

        vm.expectRevert(AtropyleVault.AlreadyReleased.selector);
        vm.prank(g3);
        v.voteRecovery(newWallet);

        v.poke();
        assertEq(v.state(), PolicyCodec.RELEASED_INHERIT);

        usdt.mint(owner, 100e6);
        assertTrue(v.distribute());
        assertEq(usdt.balanceOf(heirA), 660e6);
        assertEq(usdt.balanceOf(heirB), 440e6);
    }

    /// Review Focus #5
    function test_drillExpires() public {
        AtropyleVault d = _deploy(_drillCfg(), true);
        assertTrue(d.drill());
        assertEq(d.expiresAt(), block.timestamp + 7 days);
        vm.warp(block.timestamp + 7 days);

        vm.expectRevert(AtropyleVault.DrillExpired.selector);
        vm.prank(owner);
        d.checkIn();

        vm.expectRevert(AtropyleVault.DrillExpired.selector);
        d.poke();

        vm.expectRevert(AtropyleVault.DrillExpired.selector);
        d.distribute();

        vm.expectRevert(AtropyleVault.DrillExpired.selector);
        vm.prank(g1);
        d.attestDeath(true);

        assertEq(d.status().state, PolicyCodec.ACTIVE);
    }

    /// An expired Drill can never transition again (every mutator reverts DrillExpired), so status() must not
    /// report a pending transition that no poke() could make.
    function test_expiredDrillHasNothingPending() public {
        AtropyleVault d = _deploy(_drillCfg(), true);
        vm.warp(vm.getBlockTimestamp() + 7 days - 1);
        assertEq(d.status().pending, PolicyCodec.GRACE); // still alive: a poke would raise the alarm
        vm.warp(vm.getBlockTimestamp() + 1); // block.timestamp == expiresAt: notExpired starts reverting here
        AtropyleVault.Status memory st = d.status();
        assertEq(st.state, PolicyCodec.ACTIVE);
        assertEq(st.pending, PolicyCodec.ACTIVE);
        assertEq(st.idle, 15);
        vm.expectRevert(AtropyleVault.DrillExpired.selector);
        d.poke();

        // A regular vault has no expiry: the same silence leaves its alarm pending.
        vm.warp(vm.getBlockTimestamp() + 365 days);
        assertEq(v.status().pending, PolicyCodec.GRACE);
    }

    function test_vaultCannotBeItsOwnGuardian() public {
        address[] memory g = new address[](3);
        g[0] = g1;
        g[1] = g2;
        g[2] = address(v);
        vm.expectRevert(VaultConfig.InvalidGuardians.selector);
        vm.prank(owner);
        v.setGuardians(g, 3, true);
        assertEq(v.guardians().length, 3);
        assertEq(v.guardians()[2], g3);
    }

    function test_drillRunsInMinutes() public {
        AtropyleVault d = _deploy(_drillCfg(), true);
        _approveAll(d);
        vm.warp(block.timestamp + 120); // T = 2 periods of 60 s
        d.poke();
        assertEq(d.state(), PolicyCodec.GRACE);
        vm.warp(block.timestamp + 120); // W = 120 s
        assertTrue(d.distribute());
        assertEq(usdt.balanceOf(heirA), 600e6);
    }

    function test_reentrantTokenCannotReenter() public {
        ReentrantERC20 r = new ReentrantERC20();
        VaultConfig.Config memory c = _cfg();
        c.assets = new VaultConfig.Asset[](1);
        c.assets[0] = VaultConfig.Asset(VaultConfig.Kind.ERC20, address(r), 0, 0);
        AtropyleVault x = _deploy(c, false);
        r.mint(owner, 1000);
        vm.prank(owner);
        r.approve(address(x), type(uint256).max);
        r.setTarget(address(x));

        vm.warp(block.timestamp + uint256(T) * P);
        x.poke();
        vm.prank(g1);
        x.attestDeath(true);
        vm.prank(g2);
        x.attestDeath(true);
        vm.warp(block.timestamp + W);
        assertTrue(x.distribute());
        assertTrue(r.attempted());
        assertFalse(r.reentered());
        assertEq(r.balanceOf(heirA), 600);
        assertEq(r.balanceOf(heirB), 400);
    }

    function test_statusReportsDeadlines() public {
        _toGrace();
        vm.prank(g1);
        v.voteRecovery(newWallet);
        AtropyleVault.Status memory st = v.status();
        assertEq(st.state, PolicyCodec.GRACE);
        assertEq(st.pending, PolicyCodec.GRACE);
        assertEq(st.idle, T);
        assertEq(st.lateAt, uint256(v.lastAlive()) + uint256(T) * P);
        assertEq(st.alarmAt, block.timestamp);
        assertEq(st.windowEndsAt, block.timestamp + W);
        assertEq(st.recVotes.length, 3);
        assertEq(st.recVotes[0], newWallet);
        assertEq(st.coverage[0], 1000e6);
        assertEq(st.coverage[1], 1);
        assertEq(st.coverage[2], 5);

        vm.warp(block.timestamp + W);
        assertEq(v.status().pending, PolicyCodec.GRACE); // window over, but no quorum and idle not maxed
        _attestTwo();
        assertEq(v.state(), PolicyCodec.RELEASED_INHERIT); // the second attestation itself released
    }

    function test_badPolicyOutputReverts() public {
        AtropyleVault x = _deployOn(address(new BadPolicyCPU()), _cfg(), false);
        vm.expectRevert(abi.encodeWithSelector(AtropyleVault.BadPolicyOutput.selector, uint8(2)));
        x.poke();
    }

    function test_configChangeCountsAsCheckIn() public {
        _toGrace();
        vm.expectEmit(address(v));
        emit AtropyleVault.ConfigUpdated(3);
        vm.prank(owner);
        v.setTiming(VaultConfig.Timing(2 days, 4, 4 days));
        assertEq(v.state(), PolicyCodec.ACTIVE);
        assertEq(v.lastAlive(), block.timestamp);
        assertEq(v.timing().period, 2 days);
    }

    // ---- Additions beyond the brief: factory role indexing and the setHeirs/setAssets success paths ----

    function test_rolesAreIndexedAtInitAndOnChange() public {
        IndexRecorder rec = new IndexRecorder();
        VaultConfig.Config memory c = _cfg();
        AtropyleVault x = AtropyleVault(Clones.clone(address(impl)));
        vm.prank(address(rec));
        x.initialize(owner, false, c, address(cpu), 1);
        assertEq(x.factory(), address(rec));
        assertTrue(rec.has(owner));
        assertTrue(rec.has(heirA));
        assertTrue(rec.has(heirB));
        assertTrue(rec.has(g1));
        assertTrue(rec.has(g2));
        assertTrue(rec.has(g3));
        assertFalse(rec.has(newWallet));

        // Assets first: the third one points at heir index 1, which the single new heir would not have.
        VaultConfig.Asset[] memory one = new VaultConfig.Asset[](1);
        one[0] = VaultConfig.Asset(VaultConfig.Kind.ERC20, address(usdt), 0, 0);
        vm.prank(owner);
        x.setAssets(one);

        VaultConfig.Heir[] memory h = new VaultConfig.Heir[](1);
        h[0] = VaultConfig.Heir(newWallet, 10_000);
        vm.prank(owner);
        x.setHeirs(h);
        assertTrue(rec.has(newWallet));

        address[] memory g = new address[](1);
        g[0] = stranger;
        vm.prank(owner);
        x.setGuardians(g, 1, false);
        assertTrue(rec.has(stranger));
    }

    function test_setHeirsAndSetAssetsEmitAndValidate() public {
        _toGrace();

        // The multi#7 asset points at heir 1, so a single heir is rejected and nothing changes.
        VaultConfig.Heir[] memory single = new VaultConfig.Heir[](1);
        single[0] = VaultConfig.Heir(newWallet, 10_000);
        vm.expectRevert(VaultConfig.InvalidHeirs.selector);
        vm.prank(owner);
        v.setHeirs(single);
        assertEq(v.state(), PolicyCodec.GRACE);
        assertEq(v.heirs().length, 2);

        VaultConfig.Asset[] memory bad = new VaultConfig.Asset[](1);
        bad[0] = VaultConfig.Asset(VaultConfig.Kind.ERC20, address(usdt), 0, 2);
        vm.expectRevert(VaultConfig.InvalidAssets.selector);
        vm.prank(owner);
        v.setAssets(bad);

        VaultConfig.Asset[] memory one = new VaultConfig.Asset[](1);
        one[0] = VaultConfig.Asset(VaultConfig.Kind.ERC20, address(usdt), 0, 0);
        vm.expectEmit(address(v));
        emit AtropyleVault.ConfigUpdated(4);
        vm.prank(owner);
        v.setAssets(one);
        assertEq(v.assets().length, 1);
        assertEq(v.state(), PolicyCodec.ACTIVE); // a config change is proof of life

        vm.expectEmit(address(v));
        emit AtropyleVault.ConfigUpdated(1);
        vm.prank(owner);
        v.setHeirs(single);
        assertEq(v.heirs().length, 1);
        assertEq(v.heirs()[0].account, newWallet);
    }
}

/// @dev Plays the factory and records every index() call.
contract IndexRecorder {
    address[] internal _seen;

    function index(address account) external {
        _seen.push(account);
    }

    function has(address account) external view returns (bool) {
        for (uint256 i; i < _seen.length; ++i) {
            if (_seen[i] == account) return true;
        }
        return false;
    }
}
