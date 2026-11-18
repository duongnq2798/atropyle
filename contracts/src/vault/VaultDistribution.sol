// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {IERC1155} from "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import {VaultConfig} from "./VaultConfig.sol";

/// @title VaultDistribution — pulls released assets from the owner's wallet (spec §4.4)
/// @dev Every transfer is isolated: a failing token or recipient emits TransferFailed and the sweep goes on.
///      Assets no longer held or no longer approved are skipped silently.
abstract contract VaultDistribution is VaultConfig {
    event Distributed(uint256 indexed assetIndex, address indexed to, uint256 amountOrId);
    event TransferFailed(uint256 indexed assetIndex, address indexed to);

    // The sweep deliberately makes one isolated external call per recipient inside loops (calls-loop) and emits
    // its event after each call (reentrancy-events: the vault entry point is nonReentrant, so logs cannot be
    // reordered). The ERC-20 share formula divides before multiplying on purpose to avoid overflow
    // (divide-before-multiply); the remainder goes to the last heir.
    // forge-lint: disable-start(calls-loop, reentrancy-events, divide-before-multiply)

    /// @notice What the vault could move right now, per asset: ERC-20 min(balance, allowance),
    ///         ERC-721 1 or 0, ERC-1155 the approved balance.
    function coverage() public view returns (uint256[] memory c) {
        uint256 n = _assets.length;
        c = new uint256[](n);
        for (uint256 i; i < n; ++i) {
            Asset memory a = _assets[i];
            if (a.kind == Kind.ERC20) c[i] = _available20(a.token);
            else if (a.kind == Kind.ERC721) c[i] = _can721(a.token, a.id) ? 1 : 0;
            else c[i] = _available1155(a.token, a.id);
        }
    }

    function _distribute(bool recover, address target) internal {
        uint256 n = _assets.length;
        for (uint256 i; i < n; ++i) {
            Asset memory a = _assets[i];
            if (a.kind == Kind.ERC20) {
                if (recover) _send20(i, a.token, target, _available20(a.token));
                else _split20(i, a.token);
            } else {
                address to = recover ? target : _heirs[a.heir].account;
                if (a.kind == Kind.ERC721) _send721(i, a.token, a.id, to);
                else _send1155(i, a.token, a.id, to);
            }
        }
    }

    function _split20(uint256 i, address token) private {
        uint256 avail = _available20(token);
        if (avail == 0) return;
        uint256 n = _heirs.length;
        uint256 sent = 0;
        for (uint256 h; h < n; ++h) {
            Heir memory heir = _heirs[h];
            uint256 amt = h + 1 == n ? avail - sent : (avail / BPS) * heir.bps + ((avail % BPS) * heir.bps) / BPS;
            sent += amt;
            _send20(i, token, heir.account, amt);
        }
    }

    function _send20(uint256 i, address token, address to, uint256 amt) private {
        if (amt == 0) return;
        if (token.code.length == 0) {
            emit TransferFailed(i, to);
            return;
        }
        // Low-level call on purpose: tokens may return nothing, a bool, or garbage; none may revert the sweep.
        (bool ok, bytes memory r) = token.call(abi.encodeCall(IERC20.transferFrom, (owner, to, amt)));
        if (ok && (r.length == 0 || (r.length >= 32 && abi.decode(r, (uint256)) == 1))) {
            emit Distributed(i, to, amt);
        } else {
            emit TransferFailed(i, to);
        }
    }

    function _send721(uint256 i, address token, uint256 id, address to) private {
        if (!_can721(token, id)) return;
        try IERC721(token).safeTransferFrom(owner, to, id) {
            emit Distributed(i, to, id);
        } catch {
            emit TransferFailed(i, to);
        }
    }

    function _send1155(uint256 i, address token, uint256 id, address to) private {
        uint256 bal = _available1155(token, id);
        if (bal == 0) return;
        try IERC1155(token).safeTransferFrom(owner, to, id, bal, "") {
            emit Distributed(i, to, bal);
        } catch {
            emit TransferFailed(i, to);
        }
    }

    function _available20(address token) internal view returns (uint256) {
        uint256 bal = _viewWord(token, abi.encodeCall(IERC20.balanceOf, (owner)));
        uint256 allowed = _viewWord(token, abi.encodeCall(IERC20.allowance, (owner, address(this))));
        return bal < allowed ? bal : allowed;
    }

    function _can721(address token, uint256 id) internal view returns (bool) {
        if (_viewWord(token, abi.encodeCall(IERC721.ownerOf, (id))) != uint256(uint160(owner))) return false;
        return _viewWord(token, abi.encodeCall(IERC721.getApproved, (id))) == uint256(uint160(address(this)))
            || _viewWord(token, abi.encodeCall(IERC721.isApprovedForAll, (owner, address(this)))) == 1;
    }

    function _available1155(address token, uint256 id) internal view returns (uint256) {
        if (_viewWord(token, abi.encodeCall(IERC1155.isApprovedForAll, (owner, address(this)))) != 1) return 0;
        return _viewWord(token, abi.encodeCall(IERC1155.balanceOf, (owner, id)));
    }

    /// @dev First return word of a static call; 0 when the call fails or returns fewer than 32 bytes.
    function _viewWord(address token, bytes memory data) private view returns (uint256 v) {
        (bool ok, bytes memory r) = token.staticcall(data);
        if (ok && r.length >= 32) v = abi.decode(r, (uint256));
    }

    // forge-lint: disable-end(calls-loop, reentrancy-events, divide-before-multiply)
}
