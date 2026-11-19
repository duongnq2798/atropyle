// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ICPU} from "../src/interfaces/ICPU.sol";
import {ITapeOutFactory, ITapeOutCircuits, ITransistors} from "./lib/ITapeOut.sol";
import {TapeoutFlow} from "./lib/TapeoutFlow.sol";

/// @notice Spec §10 steps 1-2: create the ATRO processor, then refuse unless its circuits beacon is frozen.
///         Stage 1 of 5. Own broadcast: the printed ATRO_CPU comes from the simulation, so read it back from
///         the receipt (the Circuits address) before running stage 2.
///         Re-run guard: if an Atropyle processor by DEPLOYER already exists, nothing is created unless
///         REPLACE_PROCESSOR names that exact processor. The override abandons it for good and spends another
///         createCPU fee (0.1 BEM); use it only when the existing processor cannot be used (for example its shared
///         transistor supply cap was exhausted before stages 02/03 could mint).
contract CreateProcessor is Script {
    /// @dev How many of the newest TapeOut processors the re-run guard inspects. The factory held 430 when this
    ///      was written and a processor we created sits at the tail, so 100 covers it unless 100 others were
    ///      created in between. Each processor costs about 0.5 s of cold RPC reads in the simulation, which is
    ///      why the window is not the whole list (a full scan took 3 min 26 s).
    uint256 internal constant SCAN_WINDOW = 100;

    function run() external {
        require(vm.envOr("ATRO_CPU", address(0)) == address(0), "ATRO_CPU is set: the processor already exists");
        address me = vm.envAddress("DEPLOYER");
        // A wallet with code (EIP-7702 delegation) cannot receive the ERC-1155 transistors in stage 2, and the
        // processor's creator is fixed forever, so stop before the 0.1 BEM createCPU fee is spent.
        require(me.code.length == 0, "DEPLOYER has code (EIP-7702 delegation?): use a plain EOA");
        // Lost env after a successful run: the chain still knows the processor, so refuse to create a second one
        // unless REPLACE_PROCESSOR names exactly the processor being abandoned.
        address existing = _processorBy(me);
        address replace = vm.envOr("REPLACE_PROCESSOR", address(0));
        if (existing == address(0)) {
            require(
                replace == address(0),
                "REPLACE_PROCESSOR is set but no Atropyle processor by DEPLOYER was found: unset it"
            );
        } else {
            require(
                existing == replace,
                string.concat(
                    "an Atropyle processor by DEPLOYER already exists: ",
                    vm.toString(existing),
                    " (export ATRO_CPU=",
                    vm.toString(existing),
                    " and continue with stage 2; only if it is unusable, export REPLACE_PROCESSOR=",
                    vm.toString(existing),
                    " to abandon it and create a new one)"
                )
            );
            console2.log("REPLACE_PROCESSOR: ABANDONING the existing Atropyle processor", existing);
            console2.log("REPLACE_PROCESSOR: creating a NEW processor; this pays another createCPU fee (0.1 BEM)");
        }
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

    /// @dev Newest-first scan of the TapeOut factory (cpuCount / cpuAt) for a processor named "Atropyle" whose
    ///      transistors were created by `me`. Returns address(0) when there is none. Each processor read is wrapped
    ///      in try/catch, so a processor whose call reverts is skipped. A call that succeeds but returns data that
    ///      cannot be ABI-decoded still reverts here in the caller and stops the script: that fails closed, since
    ///      nothing has been sent yet.
    // forge-lint: disable-next-line(calls-loop)
    function _processorBy(address me) internal view returns (address found) {
        ITapeOutFactory f = ITapeOutFactory(TapeoutFlow.FACTORY);
        uint256 n = f.cpuCount();
        uint256 stop = n > SCAN_WINDOW ? n - SCAN_WINDOW : 0;
        for (uint256 i = n; i > stop && found == address(0); --i) {
            address c = f.cpuAt(i - 1);
            if (_createdBy(c, me)) found = c;
        }
    }

    function _createdBy(address cpu, address me) private view returns (bool) {
        try ICPU(cpu).transistors() returns (address t) {
            try ITransistors(t).creator() returns (address creator) {
                if (creator != me) return false;
            } catch {
                return false;
            }
        } catch {
            return false;
        }
        try ITapeOutCircuits(cpu).name() returns (string memory n) {
            return keccak256(bytes(n)) == keccak256(bytes(TapeoutFlow.NAME));
        } catch {
            return false;
        }
    }
}
