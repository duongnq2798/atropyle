// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @title VaultConfig — validated configuration of an Atropyle vault (spec §4.1)
abstract contract VaultConfig {
    enum Kind {
        ERC20,
        ERC721,
        ERC1155
    }

    struct Heir {
        address account;
        uint16 bps;
    }

    /// @dev ERC-20 is split by bps; ERC-721/1155 go to heirs[heir]. ERC-20 entries must use id 0.
    struct Asset {
        Kind kind;
        address token;
        uint256 id;
        uint8 heir;
    }

    /// @dev period P in seconds, threshold T in periods, alarm window W in seconds.
    struct Timing {
        uint32 period;
        uint8 threshold;
        uint32 window;
    }

    struct Config {
        Heir[] heirs;
        address[] guardians;
        uint8 k;
        bool recoveryEnabled;
        Timing timing;
        Asset[] assets;
    }

    uint256 internal constant MAX_HEIRS = 5;
    uint256 internal constant MAX_GUARDIANS = 5;
    uint256 internal constant MAX_ASSETS = 20;
    uint256 internal constant BPS = 10_000;
    uint32 internal constant MIN_PERIOD = 1 days;
    uint32 internal constant MIN_WINDOW = 3 days;
    uint32 internal constant DRILL_MIN = 60;
    uint8 internal constant MAX_THRESHOLD = 15;

    address public owner;
    bool public drill;
    uint8 public k;
    bool public recoveryEnabled;
    Timing internal _timing;
    Heir[] internal _heirs;
    address[] internal _guardians;
    Asset[] internal _assets;

    error InvalidHeirs();
    error InvalidGuardians();
    error InvalidTiming();
    error InvalidAssets();
    error NotGuardian();

    function heirs() external view returns (Heir[] memory) {
        return _heirs;
    }

    function guardians() external view returns (address[] memory) {
        return _guardians;
    }

    function assets() external view returns (Asset[] memory) {
        return _assets;
    }

    function timing() external view returns (Timing memory) {
        return _timing;
    }

    // The setters below validate entry by entry and revert on the first invalid one;
    // that is intentional, so the revert-in-loop lint does not apply to them.
    // forge-lint: disable-start(require-revert-in-loop)

    function _setHeirs(Heir[] memory h) internal {
        uint256 n = h.length;
        if (n == 0 || n > MAX_HEIRS) revert InvalidHeirs();
        uint256 sum = 0;
        for (uint256 i; i < n; ++i) {
            address acct = h[i].account;
            // The vault itself is rejected too: a share sent to it could never be withdrawn.
            if (acct == address(0) || acct == owner || acct == address(this) || h[i].bps == 0) revert InvalidHeirs();
            for (uint256 j; j < i; ++j) {
                if (h[j].account == acct) revert InvalidHeirs();
            }
            sum += h[i].bps;
        }
        if (sum != BPS) revert InvalidHeirs();
        for (uint256 i; i < _assets.length; ++i) {
            if (_assets[i].heir >= n) revert InvalidHeirs();
        }
        delete _heirs;
        for (uint256 i; i < n; ++i) {
            _heirs.push(h[i]);
        }
    }

    function _setGuardians(address[] memory g, uint8 k_, bool rec) internal {
        uint256 n = g.length;
        if (n > MAX_GUARDIANS || k_ > n || (rec && k_ == 0)) revert InvalidGuardians();
        for (uint256 i; i < n; ++i) {
            if (g[i] == address(0) || g[i] == owner) revert InvalidGuardians();
            for (uint256 j; j < i; ++j) {
                if (g[j] == g[i]) revert InvalidGuardians();
            }
        }
        _guardians = g;
        k = k_;
        recoveryEnabled = rec;
    }

    function _setTiming(Timing memory t) internal {
        uint32 minPeriod = drill ? DRILL_MIN : MIN_PERIOD;
        uint32 minWindow = drill ? DRILL_MIN : MIN_WINDOW;
        if (t.period < minPeriod || t.window < minWindow || t.threshold == 0 || t.threshold > MAX_THRESHOLD) {
            revert InvalidTiming();
        }
        _timing = t;
    }

    function _setAssets(Asset[] memory a) internal {
        uint256 n = a.length;
        if (n > MAX_ASSETS) revert InvalidAssets();
        for (uint256 i; i < n; ++i) {
            Asset memory x = a[i];
            if (x.token.code.length == 0 || x.heir >= _heirs.length) revert InvalidAssets();
            if (x.kind == Kind.ERC20 && x.id != 0) revert InvalidAssets();
            for (uint256 j; j < i; ++j) {
                if (a[j].token == x.token && a[j].id == x.id) revert InvalidAssets();
            }
        }
        delete _assets;
        for (uint256 i; i < n; ++i) {
            _assets.push(a[i]);
        }
    }

    // forge-lint: disable-end(require-revert-in-loop)

    function _guardianIndex(address g) internal view returns (uint256, bool) {
        uint256 n = _guardians.length;
        for (uint256 i; i < n; ++i) {
            if (_guardians[i] == g) return (i, true);
        }
        return (0, false);
    }

    function _isGuardian(address g) internal view returns (bool found) {
        (, found) = _guardianIndex(g);
    }
}
