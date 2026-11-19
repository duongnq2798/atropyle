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

    error InsufficientGas();

    /// @dev Per-call gas caps. Config is frozen once released, so one hostile token or contract heir must never be
    ///      able to burn the whole sweep: it can waste at most its cap (a 20 x 5 sweep stays under ~35M gas).
    uint256 internal constant VIEW_GAS = 100_000; // balanceOf, allowance, ownerOf, getApproved, isApprovedForAll
    uint256 internal constant TRANSFER_GAS = 300_000; // ERC-20 transferFrom
    uint256 internal constant NFT_GAS = 500_000; // ERC-721 / ERC-1155 safeTransferFrom (incl. receiver hook)
    /// @dev Gas spent between the guard and the CALL opcode (ABI encoding, cold account access, memory growth).
    ///      Measured about 500 for a warm ERC-20 transfer, plus 2,600 when the token account is still cold.
    uint256 internal constant GAS_MARGIN = 10_000;

    // The sweep deliberately makes one isolated external call per recipient inside loops (calls-loop) and emits
    // its event after each call (reentrancy-events: the vault entry point is nonReentrant, so logs cannot be
    // reordered). The ERC-20 share formula divides before multiplying on purpose to avoid overflow
    // (divide-before-multiply); the remainder goes to the last heir. The InsufficientGas guard runs before every
    // capped call and must abort the whole sweep (require-revert-in-loop).
    // forge-lint: disable-start(calls-loop, reentrancy-events, divide-before-multiply, require-revert-in-loop)

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
        _requireGas(TRANSFER_GAS);
        bytes memory data = abi.encodeCall(IERC20.transferFrom, (owner, to, amt));
        bool ok;
        uint256 size;
        uint256 word;
        // Low-level call on purpose: tokens may return nothing, a bool, or garbage; none may revert the sweep.
        // At most 32 bytes of returndata are copied (into scratch space), so a returndata bomb costs nothing extra.
        assembly ("memory-safe") {
            ok := call(TRANSFER_GAS, token, 0, add(data, 0x20), mload(data), 0x00, 0x20)
            size := returndatasize()
            word := mload(0x00)
        }
        // Success: no return data (the token has code, checked above), or a first word equal to 1.
        if (ok && (size == 0 || (size >= 32 && word == 1))) {
            emit Distributed(i, to, amt);
        } else {
            emit TransferFailed(i, to);
        }
    }

    function _send721(uint256 i, address token, uint256 id, address to) private {
        if (!_can721(token, id)) return;
        _requireGas(NFT_GAS);
        try IERC721(token).safeTransferFrom{gas: NFT_GAS}(owner, to, id) {
            emit Distributed(i, to, id);
        } catch {
            emit TransferFailed(i, to);
        }
    }

    function _send1155(uint256 i, address token, uint256 id, address to) private {
        uint256 bal = _available1155(token, id);
        if (bal == 0) return;
        _requireGas(NFT_GAS);
        try IERC1155(token).safeTransferFrom{gas: NFT_GAS}(owner, to, id, bal, "") {
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

    /// @dev First return word of a gas-capped static call; 0 when the call fails or returns fewer than 32 bytes.
    ///      Only the first 32 bytes of returndata are copied, so a returndata bomb cannot drain the caller.
    function _viewWord(address token, bytes memory data) private view returns (uint256 v) {
        _requireGas(VIEW_GAS);
        assembly ("memory-safe") {
            if staticcall(VIEW_GAS, token, add(data, 0x20), mload(data), 0x00, 0x20) {
                if gt(returndatasize(), 0x1f) { v := mload(0x00) }
            }
        }
    }

    /// @dev A callee gets at most 63/64 of the gas left (EIP-150). Revert unless the full `cap` can be handed over,
    ///      so a failure inside the cap is the callee's own doing. Without this a caller could tune the tx gas so
    ///      that one heir's transfer runs out of gas (TransferFailed) while the sweep goes on, and the next sweep
    ///      would re-split that heir's share among the others (including the caller). It also stops eth_estimateGas
    ///      from settling on a gas amount that silently turns transfers into TransferFailed.
    function _requireGas(uint256 cap) private view {
        if (gasleft() < (cap * 64) / 63 + GAS_MARGIN) revert InsufficientGas();
    }

    // forge-lint: disable-end(calls-loop, reentrancy-events, divide-before-multiply, require-revert-in-loop)
}
