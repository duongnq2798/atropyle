// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {DewebCalls} from "./lib/DewebCalls.sol";

/// @notice Sends the DeWEB calls that `npm run deweb:publish -- --emit` wrote (Plan 4, decision 14). DEWEB_CALLS
///         names the file relative to contracts/, under deweb-calls/. The signer is the --account the user passes;
///         it must hold the circuit NFT of the container, which makes it the container's DeWEB editor.
///         Nothing is sent unless the file is the exact output of --emit for this chain and every call is a
///         value-free SiteRegistry write (or DomainBinding bind) for the file's container. forge simulates every
///         call first, so a stale file stops before anything is broadcast: run --emit again.
contract DewebPublish is Script {
    function run() external {
        publish(vm.envString("DEWEB_CALLS"));
    }

    function publish(string memory rel) public {
        DewebCalls.File memory f = DewebCalls.load(rel);
        DewebCalls.check(f, block.chainid);
        console2.log("container", f.container);
        console2.log("calls", f.calls.length);

        vm.startBroadcast();
        for (uint256 i; i < f.calls.length; ++i) {
            (bool ok, bytes memory reason) = f.calls[i].to.call(f.calls[i].data);
            if (!ok) revert DewebCalls.CallFailed(i, reason);
        }
        vm.stopBroadcast();
        console2.log("After the broadcast, run npm run deweb:publish -- --dry-run to see what is left, if anything.");
    }
}
