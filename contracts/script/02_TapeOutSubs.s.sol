// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ICPU} from "../src/interfaces/ICPU.sol";
import {ITapeOutCircuits, ITransistors} from "./lib/ITapeOut.sol";
import {TapeoutFlow} from "./lib/TapeoutFlow.sol";

/// @notice Spec §10 steps 3-4a: mint the missing transistors and tape out KofN5 and Ge4.
///         Stage 2 of 5. Re-runnable: set KOFN_ID or GE4_ID for a circuit that is already on chain.
///         Own broadcast: the printed ids come from the simulation, so read them back from chain
///         (circuitInfo) before running stage 3.
contract TapeOutSubs is Script {
    function run() external {
        address me = vm.envAddress("DEPLOYER");
        address cpu = vm.envAddress("ATRO_CPU");
        TapeoutFlow.requireAtropyleCpu(cpu, me);
        uint256 kofnId = vm.envOr("KOFN_ID", uint256(0));
        uint256 ge4Id = vm.envOr("GE4_ID", uint256(0));

        uint256 fee = ITapeOutCircuits(cpu).TAPEOUT_FEE();
        uint256 okb = (kofnId == 0 ? fee : 0) + (ge4Id == 0 ? fee : 0);
        require(me.balance >= okb + 0.005 ether, "not enough OKB for tapeout fees and gas");
        ITransistors t = ITransistors(ICPU(cpu).transistors());
        require(
            IERC20(TapeoutFlow.BEM).balanceOf(me) >= 2 * t.protocolFee() + 66 * t.mintPrice(),
            "not enough BEM to mint transistors"
        );

        vm.startBroadcast(me);
        (kofnId, ge4Id) = TapeoutFlow.tapeoutSubs(cpu, me, kofnId, ge4Id);
        vm.stopBroadcast();

        console2.log(string.concat("export KOFN_ID=", vm.toString(kofnId)));
        console2.log(string.concat("export GE4_ID=", vm.toString(ge4Id)));
    }
}
