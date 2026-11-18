// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ICPU} from "./interfaces/ICPU.sol";
import {IVaultIndex} from "./interfaces/IVaultIndex.sol";
import {PolicyCodec} from "./PolicyCodec.sol";
import {VaultDistribution} from "./vault/VaultDistribution.sol";

/// @title AtropyleVault — non-custodial inheritance and wallet-recovery vault (spec §4)
/// @notice One EIP-1167 clone per owner. No admin, pause, upgrade, delegatecall or selfdestruct.
///         Every state change is decided by the frozen AtropylePolicy circuit through step().
contract AtropyleVault is VaultDistribution {
    uint256 public constant DRILL_LIFETIME = 7 days;

    struct Status {
        uint8 state;
        uint8 pending; // state a non-owner poke() would produce right now; = state if released or expired
        uint8 idle;
        uint64 lastAlive;
        uint64 lateAt; // lastAlive + T * P
        uint64 alarmAt;
        uint64 windowEndsAt; // alarmAt + W, or 0 without an alarm
        uint64 releasedAt;
        uint64 expiresAt; // Drill only, else 0
        uint8 inhVotes;
        address recoveryTarget;
        address[] recVotes; // recVote of each guardian, in guardians() order
        uint256[] coverage;
    }

    address public factory;
    ICPU public cpu;
    uint256 public policyId;
    uint64 public expiresAt;
    uint8 public state;
    uint64 public lastAlive;
    uint64 public alarmAt;
    uint64 public releasedAt;
    uint8 public inhVotes;
    address public recoveryTarget;
    mapping(address guardian => address target) public recVote;

    bool private _initialized;
    bool private _locked;

    event Alive(uint64 at);
    event ConfigUpdated(uint8 what); // 1 heirs, 2 guardians, 3 timing, 4 assets
    event Attested(address indexed guardian, bool on);
    event RecoveryVoted(address indexed guardian, address indexed target);
    event AlarmRaised(uint8 state, address target);
    event AlarmCancelled(bool byOwner);
    event Released(uint8 state, address target);
    event StateChanged(uint8 from, uint8 to);

    error AlreadyInitialized();
    error NotOwner();
    error AlreadyReleased();
    error DrillExpired();
    error Reentrancy();
    error RecoveryDisabled();
    error InvalidTarget();
    error BadPolicyOutput(uint8 state);

    modifier nonReentrant() {
        if (_locked) revert Reentrancy();
        _locked = true;
        _;
        _locked = false;
    }

    modifier notExpired() {
        if (_expired()) revert DrillExpired();
        _;
    }

    modifier notReleased() {
        if (PolicyCodec.isReleased(state)) revert AlreadyReleased();
        _;
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    /// @dev Locks the implementation; clones start uninitialized.
    constructor() {
        _initialized = true;
    }

    /// @dev owner and drill are assigned before the _set* calls: the validators read them.
    ///      k and recoveryEnabled are written only by _setGuardians.
    ///      The factory is the caller and the only contract this function ever calls back (index()), so the events
    ///      emitted after those calls cannot be reordered by a third party. owner_ comes from the factory, which
    ///      passes the creating account; a zero owner would only produce an unusable vault.
    // forge-lint: disable-next-line(missing-zero-check)
    function initialize(address owner_, bool drill_, Config calldata cfg, address cpu_, uint256 policyId_) external {
        if (_initialized) revert AlreadyInitialized();
        _initialized = true;
        factory = msg.sender;
        owner = owner_;
        drill = drill_;
        cpu = ICPU(cpu_);
        policyId = policyId_;
        if (drill_) expiresAt = uint64(block.timestamp + DRILL_LIFETIME);
        lastAlive = uint64(block.timestamp);
        _setHeirs(cfg.heirs);
        _setGuardians(cfg.guardians, cfg.k, cfg.recoveryEnabled);
        _setTiming(cfg.timing);
        _setAssets(cfg.assets);
        _index(owner_);
        _indexHeirs();
        _indexGuardians();
        // forge-lint: disable-next-line(reentrancy-events)
        emit Alive(uint64(block.timestamp));
    }

    // ------------------------------------------------------------------ owner

    function checkIn() external nonReentrant notExpired onlyOwner notReleased {
        _ownerAlive();
        _advance(true, address(0));
    }

    function setHeirs(Heir[] calldata h) external nonReentrant notExpired onlyOwner notReleased {
        _ownerAlive();
        _setHeirs(h);
        _advance(true, address(0));
        _indexHeirs();
        // The only external calls go to the factory and the entry point is nonReentrant.
        // forge-lint: disable-next-line(reentrancy-events)
        emit ConfigUpdated(1);
    }

    /// @dev _ownerAlive() runs first, so the outgoing guardians' votes are cleared before the list changes.
    function setGuardians(address[] calldata g, uint8 k_, bool rec)
        external
        nonReentrant
        notExpired
        onlyOwner
        notReleased
    {
        _ownerAlive();
        _setGuardians(g, k_, rec);
        _advance(true, address(0));
        _indexGuardians();
        // The only external calls go to the factory and the entry point is nonReentrant.
        // forge-lint: disable-next-line(reentrancy-events)
        emit ConfigUpdated(2);
    }

    function setTiming(Timing calldata t) external nonReentrant notExpired onlyOwner notReleased {
        _ownerAlive();
        _setTiming(t);
        _advance(true, address(0));
        emit ConfigUpdated(3);
    }

    function setAssets(Asset[] calldata a) external nonReentrant notExpired onlyOwner notReleased {
        _ownerAlive();
        _setAssets(a);
        _advance(true, address(0));
        emit ConfigUpdated(4);
    }

    // ------------------------------------------------------------------ guardians

    function attestDeath(bool on) external nonReentrant notExpired notReleased {
        (uint256 i, bool found) = _guardianIndex(msg.sender);
        if (!found) revert NotGuardian();
        uint8 bit = uint8(1 << i);
        inhVotes = on ? inhVotes | bit : inhVotes & ~bit;
        emit Attested(msg.sender, on);
        _advance(false, address(0));
    }

    /// @param target New wallet for the owner's assets; address(0) withdraws the caller's vote.
    function voteRecovery(address target) external nonReentrant notExpired notReleased {
        if (!recoveryEnabled) revert RecoveryDisabled();
        if (!_isGuardian(msg.sender)) revert NotGuardian();
        if (target == owner || target == address(this) || (target != address(0) && _isGuardian(target))) {
            revert InvalidTarget();
        }
        recVote[msg.sender] = target;
        emit RecoveryVoted(msg.sender, target);
        _advance(false, target);
    }

    // ------------------------------------------------------------------ anyone

    /// @notice Re-evaluates the policy now. Signed by the owner it is a check-in (spec §3.2 bit 21 "signed by the
    ///         owner", §4.5 I4): proof of life that clears every vote and cancels any alarm. A no-op once released.
    function poke() external nonReentrant notExpired {
        if (PolicyCodec.isReleased(state)) return;
        if (msg.sender == owner) {
            _ownerAlive();
            _advance(true, address(0));
        } else {
            _advance(false, address(0));
        }
    }

    /// @notice Sweeps the assets once the policy has released; anyone may call it, the owner included.
    ///         Before release an owner-signed call is a check-in, exactly like poke(), and never releases.
    /// @return released True when a sweep ran; false (no revert) while the policy has not released,
    ///         so alarm transitions triggered by this call are still recorded.
    function distribute() external nonReentrant notExpired returns (bool released) {
        if (!PolicyCodec.isReleased(state)) {
            if (msg.sender == owner) {
                _ownerAlive();
                _advance(true, address(0));
                return false;
            }
            _advance(false, address(0));
            if (!PolicyCodec.isReleased(state)) return false;
        }
        _distribute(state == PolicyCodec.RELEASED_RECOVER, recoveryTarget);
        return true;
    }

    function status() external view returns (Status memory st) {
        uint8 s = state;
        st.state = s;
        // Released is final and an expired Drill reverts every transition, so neither has anything pending.
        if (PolicyCodec.isReleased(s) || _expired()) st.pending = s;
        else (st.pending,,) = _evaluate(false, address(0));
        st.idle = _idle();
        st.lastAlive = lastAlive;
        st.lateAt = lastAlive + uint64(_timing.threshold) * _timing.period;
        st.alarmAt = alarmAt;
        st.windowEndsAt = alarmAt == 0 ? 0 : alarmAt + _timing.window;
        st.releasedAt = releasedAt;
        st.expiresAt = expiresAt;
        st.inhVotes = inhVotes;
        st.recoveryTarget = recoveryTarget;
        uint256 n = _guardians.length;
        st.recVotes = new address[](n);
        for (uint256 i; i < n; ++i) {
            st.recVotes[i] = recVote[_guardians[i]];
        }
        st.coverage = coverage();
    }

    // ------------------------------------------------------------------ internals

    /// @dev The one expiry condition, shared by notExpired and status().
    function _expired() internal view returns (bool) {
        // A Drill lives for days; validator timestamp drift is irrelevant at that scale.
        // forge-lint: disable-next-line(block-timestamp)
        return drill && block.timestamp >= expiresAt;
    }

    function _ownerAlive() internal {
        lastAlive = uint64(block.timestamp);
        inhVotes = 0;
        uint256 n = _guardians.length;
        for (uint256 i; i < n; ++i) {
            delete recVote[_guardians[i]];
        }
        emit Alive(uint64(block.timestamp));
    }

    /// @dev Builds the spec §3.2 inputs and asks the circuit for the next state.
    function _evaluate(bool alive, address candidateArg)
        internal
        view
        returns (uint8 next, uint8 out, address candidate)
    {
        uint8 s = state;
        candidate = s == PolicyCodec.RECOVERY ? recoveryTarget : candidateArg;
        PolicyCodec.Inputs memory inp = PolicyCodec.Inputs({
            idle: _idle(),
            threshold: _timing.threshold,
            inhVotes: inhVotes,
            recVotes: _recBitmap(candidate),
            k: k,
            alive: alive,
            // Deadlines are days long; validator timestamp drift is irrelevant at that scale.
            // forge-lint: disable-next-line(block-timestamp)
            windowDone: alarmAt != 0 && block.timestamp >= uint256(alarmAt) + _timing.window
        });
        (bytes memory ns, bytes memory o) = cpu.step(policyId, PolicyCodec.encodeState(s), PolicyCodec.pack(inp));
        next = PolicyCodec.firstByte(ns);
        out = PolicyCodec.firstByte(o);
        if (!PolicyCodec.isCanonical(next)) revert BadPolicyOutput(next);
    }

    function _advance(bool alive, address candidateArg) internal {
        (uint8 n, uint8 o, address candidate) = _evaluate(alive, candidateArg);
        if ((o & PolicyCodec.OUT_ALARM) != 0) {
            alarmAt = uint64(block.timestamp);
            recoveryTarget = n == PolicyCodec.RECOVERY ? candidate : address(0);
            emit AlarmRaised(n, recoveryTarget);
        }
        if ((o & PolicyCodec.OUT_CANCEL) != 0) {
            alarmAt = 0;
            recoveryTarget = address(0);
            emit AlarmCancelled(alive);
        }
        if ((o & PolicyCodec.OUT_RELEASE) != 0) {
            releasedAt = uint64(block.timestamp);
            emit Released(n, recoveryTarget);
        }
        uint8 s = state;
        if (n != s) {
            state = n;
            emit StateChanged(s, n);
        }
    }

    function _idle() internal view returns (uint8) {
        uint256 periods = (block.timestamp - lastAlive) / _timing.period;
        // idle is a 4-bit policy input, so it saturates at 15 periods (spec §3.2).
        // forge-lint: disable-next-line(block-timestamp)
        return periods > 15 ? 15 : uint8(periods);
    }

    function _recBitmap(address candidate) internal view returns (uint8 m) {
        if (candidate == address(0) || !recoveryEnabled) return 0;
        uint256 n = _guardians.length;
        for (uint256 i; i < n; ++i) {
            if (recVote[_guardians[i]] == candidate) m |= uint8(1 << i);
        }
    }

    /// @dev Callee is the factory that created this clone (trusted, fixed at initialize). Callers are initialize()
    ///      (guarded by _initialized) and nonReentrant setters; the loops are bounded by 5 heirs / 5 guardians.
    function _index(address account) private {
        // forge-lint: disable-next-line(calls-loop, reentrancy-no-eth)
        IVaultIndex(factory).index(account);
    }

    function _indexHeirs() private {
        uint256 n = _heirs.length;
        for (uint256 i; i < n; ++i) {
            _index(_heirs[i].account);
        }
    }

    function _indexGuardians() private {
        uint256 n = _guardians.length;
        for (uint256 i; i < n; ++i) {
            _index(_guardians[i]);
        }
    }
}
