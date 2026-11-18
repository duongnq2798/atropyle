// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {AtropyleVault} from "../src/AtropyleVault.sol";
import {AtropyleFactory} from "../src/AtropyleFactory.sol";
import {PolicyCodec} from "../src/PolicyCodec.sol";
import {VaultConfig} from "../src/vault/VaultConfig.sol";

/// @notice Free Drill vault with no assets, then one poke() signed by DEPLOYER, the vault's owner. An owner-signed
///         poke() is a check-in (spec §3.2 bit 21): it still runs step() on the real circuit, with alive = 1, so it
///         proves the circuit answers step() on mainnet. The vault must also be wired to the factory's processor and
///         policy, the pair the SDK reads.
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

        AtropyleVault v = AtropyleVault(vault);
        require(address(v.cpu()) == factory.cpu(), "smoke vault cpu != factory cpu");
        require(v.policyId() == factory.policyId(), "smoke vault policyId != factory policyId");
        require(v.owner() == me && v.factory() == address(factory), "smoke vault owner/factory");
        AtropyleVault.Status memory st = v.status();
        require(v.drill() && st.state == PolicyCodec.ACTIVE, "smoke vault state");
        require(st.lastAlive == block.timestamp, "owner poke was not a check-in");
        require(st.expiresAt > block.timestamp, "smoke vault expiry");
        console2.log(string.concat("export SMOKE_VAULT=", vm.toString(address(v))));
    }
}
