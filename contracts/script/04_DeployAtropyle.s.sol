// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {AtropyleVault} from "../src/AtropyleVault.sol";
import {AtropyleFactory} from "../src/AtropyleFactory.sol";
import {TapeoutFlow} from "./lib/TapeoutFlow.sol";

/// @notice Spec §10 step 5: deploy the vault implementation and the factory against the verified policy.
///         Stage 4 of 5. Nothing is deployed unless the policy stored under POLICY_ID is byte-for-byte the
///         patched template and replays the first 64 test vectors on chain.
contract DeployAtropyle is Script {
    function run() external {
        address me = vm.envAddress("DEPLOYER");
        address cpu = vm.envAddress("ATRO_CPU");
        uint256 kofnId = vm.envUint("KOFN_ID");
        uint256 ge4Id = vm.envUint("GE4_ID");
        uint256 policyId = vm.envUint("POLICY_ID");
        address treasury = vm.envAddress("TREASURY");
        TapeoutFlow.requireAtropyleCpu(cpu, me);
        TapeoutFlow.requireSubs(cpu, kofnId, ge4Id);
        TapeoutFlow.requirePolicy(cpu, policyId, kofnId, ge4Id, 64);
        address[] memory fee = TapeoutFlow.feeTokens();

        vm.startBroadcast(me);
        AtropyleVault impl = new AtropyleVault();
        AtropyleFactory factory = new AtropyleFactory(address(impl), cpu, policyId, treasury, fee);
        vm.stopBroadcast();

        for (uint256 i; i < fee.length; ++i) {
            require(factory.earlyFee(fee[i]) == 1_990_000, "early fee");
            require(factory.fullFee(fee[i]) == 9_900_000, "full fee");
        }
        console2.log(string.concat("export VAULT_IMPL=", vm.toString(address(impl))));
        console2.log(string.concat("export ATRO_FACTORY=", vm.toString(address(factory))));
    }
}
