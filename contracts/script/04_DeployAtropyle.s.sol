// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {AtropyleVault} from "../src/AtropyleVault.sol";
import {AtropyleFactory} from "../src/AtropyleFactory.sol";
import {TapeoutFlow} from "./lib/TapeoutFlow.sol";

/// @notice Spec §10 step 5: deploy the vault implementation and the factory against the verified policy.
///         Stage 4 of 5. Nothing is deployed unless the policy stored under POLICY_ID is byte-for-byte the
///         patched template and replays the first 64 test vectors on chain. The factory's treasury is immutable,
///         so on mainnet neither TREASURY nor DEPLOYER may be one of the public anvil test accounts.
contract DeployAtropyle is Script {
    function run() external {
        require(vm.envOr("ATRO_FACTORY", address(0)) == address(0), "ATRO_FACTORY is set: factory already deployed");
        address me = vm.envAddress("DEPLOYER");
        address cpu = vm.envAddress("ATRO_CPU");
        uint256 kofnId = vm.envUint("KOFN_ID");
        uint256 ge4Id = vm.envUint("GE4_ID");
        uint256 policyId = vm.envUint("POLICY_ID");
        address treasury = vm.envAddress("TREASURY");
        if (block.chainid == 196) {
            require(!_isAnvilDefault(treasury), "TREASURY is a public anvil test account (stale rehearsal env?)");
            require(!_isAnvilDefault(me), "DEPLOYER is a public anvil test account");
        }
        TapeoutFlow.requireAtropyleCpu(cpu, me);
        TapeoutFlow.requireSubs(cpu, kofnId, ge4Id);
        TapeoutFlow.requirePolicy(cpu, policyId, kofnId, ge4Id, 64);
        address[] memory fee = TapeoutFlow.feeTokens();
        // The treasury receives every creation fee and cannot be changed later: show it before anything is sent.
        console2.log("deployer", me);
        console2.log("treasury (immutable)", treasury);

        vm.startBroadcast(me);
        AtropyleVault impl = new AtropyleVault();
        AtropyleFactory factory = new AtropyleFactory(address(impl), cpu, policyId, treasury, fee);
        vm.stopBroadcast();

        for (uint256 i; i < fee.length; ++i) {
            require(factory.earlyFee(fee[i]) == 1_990_000, "early fee");
            require(factory.fullFee(fee[i]) == 9_900_000, "full fee");
        }
        require(factory.treasury() == treasury, "treasury");
        console2.log(string.concat("export VAULT_IMPL=", vm.toString(address(impl))));
        console2.log(string.concat("export ATRO_FACTORY=", vm.toString(address(factory))));
    }

    /// @dev The ten default anvil / hardhat accounts; their private keys are public.
    function _isAnvilDefault(address a) internal pure returns (bool) {
        return a == 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266 || a == 0x70997970C51812dc3A010C7d01b50e0d17dc79C8
            || a == 0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC || a == 0x90F79bf6EB2c4f870365E785982E1f101E93b906
            || a == 0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65 || a == 0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc
            || a == 0x976EA74026E726554dB657fA54763abd0C3a0aa9 || a == 0x14dC79964da2C08b23698B3D3cc7Ca32193d9955
            || a == 0x23618e81E3f5cdF7f54C3d65f7FBc0aBf5B21E8f || a == 0xa0Ee7A142d267C1f36714E4a8F75612F20a79720;
    }
}
