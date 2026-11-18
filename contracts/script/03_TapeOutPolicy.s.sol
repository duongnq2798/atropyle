// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {ITapeOutCircuits} from "./lib/ITapeOut.sol";
import {TapeoutFlow} from "./lib/TapeoutFlow.sol";

/// @notice Spec §10 step 4b: patch the policy template with the live ids and tape it out.
///         Stage 3 of 5. requireSubs inside tapeoutPolicy runs before anything is minted, so ids that do not
///         point at the real KofN5 / Ge4 stop the script without a transaction. Own broadcast: read the printed
///         POLICY_ID back from chain before running stage 4.
contract TapeOutPolicy is Script {
    function run() external {
        require(vm.envOr("POLICY_ID", uint256(0)) == 0, "POLICY_ID is set: the policy already exists");
        address me = vm.envAddress("DEPLOYER");
        address cpu = vm.envAddress("ATRO_CPU");
        uint256 kofnId = vm.envUint("KOFN_ID");
        uint256 ge4Id = vm.envUint("GE4_ID");
        TapeoutFlow.requireAtropyleCpu(cpu, me);
        require(me.balance >= ITapeOutCircuits(cpu).TAPEOUT_FEE() + 0.005 ether, "not enough OKB");

        vm.startBroadcast(me);
        uint256 policyId = TapeoutFlow.tapeoutPolicy(cpu, me, kofnId, ge4Id);
        vm.stopBroadcast();

        console2.log(string.concat("export POLICY_ID=", vm.toString(policyId)));
    }
}
