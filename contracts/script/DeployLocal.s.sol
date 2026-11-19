// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script} from "forge-std/Script.sol";
import {AtropyleVault} from "../src/AtropyleVault.sol";
import {AtropyleFactory} from "../src/AtropyleFactory.sol";
import {MockPolicyCPU} from "../test/mocks/PolicyModel.sol";
import {MockERC20, MockERC721, MockERC1155} from "../test/mocks/Tokens.sol";

/// @notice Local devnet only (anvil, chain 31337). The CPU is the Solidity policy model, so there is no netlist.
/// @dev Run with `--unlocked --sender <anvil 0>`: no private key is ever passed. Deployment order is fixed so
///      scripts/lib/anvil.ts can read addresses from the broadcast file by position.
contract DeployLocal is Script {
    address internal constant TREASURY = 0xa0Ee7A142d267C1f36714E4a8F75612F20a79720; // anvil 9
    uint256 internal constant POLICY_ID = 1;

    function run() external {
        require(block.chainid == 31337, "DeployLocal: anvil only");
        address[6] memory users = [
            0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266,
            0x70997970C51812dc3A010C7d01b50e0d17dc79C8,
            0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC,
            0x90F79bf6EB2c4f870365E785982E1f101E93b906,
            0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65,
            0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc
        ];

        vm.startBroadcast();
        MockERC20 usdt0 = new MockERC20("Local USDT0", "USDT0", 6);
        MockERC20 usdc = new MockERC20("Local USDC", "USDC", 6);
        MockERC20 usdg = new MockERC20("Local USDG", "USDG", 6);
        MockERC721 nft = new MockERC721();
        MockERC1155 multi = new MockERC1155();
        MockPolicyCPU cpu = new MockPolicyCPU();
        AtropyleVault impl = new AtropyleVault();
        address[] memory fees = new address[](3);
        fees[0] = address(usdt0);
        fees[1] = address(usdc);
        fees[2] = address(usdg);
        new AtropyleFactory(address(impl), address(cpu), POLICY_ID, TREASURY, fees);

        for (uint256 i; i < users.length; ++i) {
            usdt0.mint(users[i], 10_000e6);
            usdc.mint(users[i], 10_000e6);
            usdg.mint(users[i], 10_000e6);
            nft.mint(users[i], i + 1);
            multi.mint(users[i], 7, 5);
        }
        vm.stopBroadcast();
    }
}
