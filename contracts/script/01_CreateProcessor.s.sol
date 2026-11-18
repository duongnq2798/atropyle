// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ITapeOutFactory} from "./lib/ITapeOut.sol";
import {TapeoutFlow} from "./lib/TapeoutFlow.sol";

/// @notice Spec §10 steps 1-2: create the ATRO processor, then refuse unless its circuits beacon is frozen.
///         Stage 1 of 5. Own broadcast: the printed ATRO_CPU comes from the simulation, so read it back from
///         the receipt (the Circuits address) before running stage 2.
contract CreateProcessor is Script {
    function run() external {
        require(vm.envOr("ATRO_CPU", address(0)) == address(0), "ATRO_CPU is set: the processor already exists");
        address me = vm.envAddress("DEPLOYER");
        uint256 fee = ITapeOutFactory(TapeoutFlow.FACTORY).deployFee();
        require(IERC20(TapeoutFlow.BEM).balanceOf(me) >= fee, "not enough BEM for deployFee");

        vm.startBroadcast(me);
        address created = TapeoutFlow.createProcessor();
        vm.stopBroadcast();

        // Forge simulates the whole run() before it sends anything, so a failed check here sends nothing.
        address cpu = TapeoutFlow.cpuOf(created);
        TapeoutFlow.requireAtropyleCpu(cpu, me);
        console2.log("createCPU returned", created);
        console2.log(string.concat("export ATRO_CPU=", vm.toString(cpu)));
    }
}
