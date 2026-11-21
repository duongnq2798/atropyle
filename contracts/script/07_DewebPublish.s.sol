// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {DewebCalls} from "./lib/DewebCalls.sol";

/// @notice Sends the DeWEB calls that `npm run deweb:publish -- --emit` wrote (Plan 4, decision 14). DEWEB_CALLS
///         names the file relative to contracts/, under deweb-calls/. The signer is the --account the user passes;
///         it must hold the circuit NFT of the container, which makes it the container's DeWEB editor.
///         Nothing is sent unless the file is the exact output of --emit for this chain and every call is a
///         value-free SiteRegistry write (or DomainBinding bind) for the file's container. forge simulates every
///         call first, so a stale file stops before anything is broadcast: run --emit again. Every run prints the
///         file's keccak256 and one line per call before it broadcasts; `--sig 'show()'` prints them with no key.
///         The broadcast also needs DEWEB_KECCAK, the keccak256 --emit printed, and sends nothing if the file differs.
contract DewebPublish is Script {
    /// @notice The broadcast. DEWEB_KECCAK must be the keccak256 that `--emit` printed: the user compared it in
    ///         the `show()` run, and this run refuses the file if it changed since.
    function run() external {
        publish(vm.envString("DEWEB_CALLS"), expectedHash(vm.envOr("DEWEB_KECCAK", string(""))));
    }

    /// @notice Loads, checks and prints the file, and sends nothing. It needs no key: the user runs it first and
    ///         compares the keccak256 with the one `--emit` printed, because forge asks for the keystore password
    ///         before the broadcast run prints anything.
    function show() external view {
        _show(vm.envString("DEWEB_CALLS"));
    }

    /// @notice DEWEB_KECCAK as the user passed it: required, and a 0x-prefixed 32-byte hex value.
    function expectedHash(string memory text) public pure returns (bytes32) {
        if (bytes(text).length == 0) revert DewebCalls.NoExpectedHash();
        return vm.parseBytes32(text);
    }

    function publish(string memory rel, bytes32 expected) public {
        DewebCalls.File memory f = _show(rel);
        if (f.hash != expected) revert DewebCalls.HashMismatch(expected, f.hash);
        vm.startBroadcast();
        for (uint256 i; i < f.calls.length; ++i) {
            (bool ok, bytes memory reason) = f.calls[i].to.call(f.calls[i].data);
            if (!ok) revert DewebCalls.CallFailed(i, reason);
        }
        vm.stopBroadcast();
        console2.log("After the broadcast, run npm run deweb:publish -- --dry-run to see what is left, if anything.");
    }

    function _show(string memory rel) internal view returns (DewebCalls.File memory f) {
        f = DewebCalls.load(rel);
        DewebCalls.check(f, block.chainid);
        console2.log("file keccak256", vm.toString(f.hash));
        console2.log("container", f.container);
        console2.log("calls", f.calls.length);
        for (uint256 i; i < f.calls.length; ++i) {
            console2.log(DewebCalls.describe(f.calls[i], i));
        }
    }
}
