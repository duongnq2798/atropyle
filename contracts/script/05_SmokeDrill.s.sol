// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {AtropyleVault} from "../src/AtropyleVault.sol";
import {AtropyleFactory} from "../src/AtropyleFactory.sol";
import {PolicyCodec} from "../src/PolicyCodec.sol";
import {VaultConfig} from "../src/vault/VaultConfig.sol";

/// @notice Free Drill vault with no assets, then one poke(): proves the real circuit answers step() on mainnet.
contract SmokeDrill is Script {
    function run() external {
        address me = vm.envAddress("DEPLOYER");
        AtropyleFactory factory = AtropyleFactory(vm.envAddress("ATRO_FACTORY"));
        address heir = vm.envAddress("SMOKE_HEIR");
        require(heir != me, "SMOKE_HEIR must differ from DEPLOYER");

        VaultConfig.Config memory c;
        c.heirs = new VaultConfig.Heir[](1);
        c.heirs[0] = VaultConfig.Heir(heir, 10_000);
        c.guardians = new address[](0);
        c.timing = VaultConfig.Timing(60, 2, 60);
        c.assets = new VaultConfig.Asset[](0);
        bytes32 salt = keccak256(abi.encode("smoke", block.timestamp));

        vm.startBroadcast(me);
        address vault = factory.createVault(c, salt, true, address(0));
        AtropyleVault(vault).poke();
        vm.stopBroadcast();

        AtropyleVault.Status memory st = AtropyleVault(vault).status();
        require(AtropyleVault(vault).drill() && st.state == PolicyCodec.ACTIVE, "smoke vault state");
        require(st.expiresAt > block.timestamp, "smoke vault expiry");
        console2.log(string.concat("export SMOKE_VAULT=", vm.toString(vault)));
    }
}
