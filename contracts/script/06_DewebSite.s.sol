// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ICPU} from "../src/interfaces/ICPU.sol";
import {ITapeOutCircuits, ITransistors} from "./lib/ITapeOut.sol";
import {TapeoutFlow} from "./lib/TapeoutFlow.sol";

/// @notice CircuitAccountOpener on X Layer (verified source): anyone can open, extra OKB is refunded.
interface ICircuitAccountOpener {
    function open(address circuits, uint256 tokenId) external payable returns (address);
    function accountOf(address circuits, uint256 tokenId) external view returns (address);
    function isOpened(address circuits, uint256 tokenId) external view returns (bool);
    function FEE() external view returns (uint256);
}

interface ISiteRegistry {
    function isOpenedContainer(address container) external view returns (bool);
}

/// @dev The circuits contract is an ERC-721; only the owner lookup is needed here.
interface IERC721Owner {
    function ownerOf(uint256 tokenId) external view returns (address);
}

/// @notice Ecosystem spec §11.2: the web app lives on the Atropyle processor itself. Tapes out a one-gate anchor
///         circuit and opens its DeWEB container, in two runs (the simulated id of a tapeout can be front-run, and
///         `open` costs 0.08 OKB, so the second run opens only a circuit that DEPLOYER owns and that has the anchor
///         netlist):
///         1. Without DEWEB_TOKEN_ID: tapes out the anchor and prints `export DEWEB_TOKEN_ID=<n>`.
///            Check the id on chain (the script prints the command), then run the script again.
///         2. With DEWEB_TOKEN_ID: checks owner, netlist and circuit info, opens the container (skipped when it is
///            already open) and prints `export DEWEB_CONTAINER=<addr>`.
///         The signer is the --account keystore, as in scripts 01-05; no key is read here.
contract DewebSite is Script {
    address constant OPENER = 0x536adD8F30f03b69f6fbF29d425A816A0dC50106;
    address constant REGISTRY = 0xd6EFb7adCc9c83dC4924Ad56f6a8E4e969b9ADB6;
    /// @dev NAND(signal 2, signal 2), signal 2 = input 0 (NetlistVM encoding of Plan 1): 1 gate, nIn 1, nOut 1.
    bytes constant ANCHOR = hex"00000002000002";

    function run() external {
        address me = vm.envAddress("DEPLOYER");
        address cpu = vm.envAddress("ATRO_CPU");
        // The NFT and the transistors go to this wallet; an EIP-7702 delegation could make the receive hooks run code.
        require(me.code.length == 0, "DEPLOYER has code (EIP-7702 delegation?): use a plain EOA");
        TapeoutFlow.requireAtropyleCpu(cpu, me);
        uint256 tokenId = vm.envOr("DEWEB_TOKEN_ID", uint256(0));
        if (tokenId == 0) _tapeout(cpu, me);
        else _open(cpu, me, tokenId);
    }

    /// @dev Phase 1. Mints one NAND if DEPLOYER has none, tapes out the anchor and prints the id.
    function _tapeout(address cpu, address me) private {
        ITapeOutCircuits circ = ITapeOutCircuits(cpu);
        ITransistors t = ITransistors(ICPU(cpu).transistors());
        bool mintNand = t.balanceOf(me, t.NAND()) == 0;
        require(me.balance >= circ.TAPEOUT_FEE() + 0.005 ether, "not enough OKB for the tapeout fee and gas");
        if (mintNand) {
            require(
                IERC20(TapeoutFlow.BEM).balanceOf(me) >= t.mintPrice() + t.protocolFee(),
                "not enough BEM to mint one NAND"
            );
        }

        vm.startBroadcast(me);
        if (mintNand) {
            SafeERC20.forceApprove(IERC20(TapeoutFlow.BEM), address(t), t.mintPrice() + t.protocolFee());
            t.mint(t.NAND(), 1);
        }
        uint256 tokenId = circ.tapeout{value: circ.TAPEOUT_FEE()}(ANCHOR, 1, 1);
        vm.stopBroadcast();

        _requireAnchor(cpu, me, tokenId);
        console2.log(string.concat("export DEWEB_TOKEN_ID=", vm.toString(tokenId)));
        console2.log("The id above comes from the simulation. Check it on chain, then run this script again:");
        console2.log(
            string.concat("  cast call ", vm.toString(cpu), " 'ownerOf(uint256)(address)' <id> --rpc-url <rpc>")
        );
        console2.log("The owner must be DEPLOYER. A different id can only come from a front-running tapeout.");
    }

    /// @dev Phase 2. Opens the container of a circuit that DEPLOYER owns and that is exactly the anchor.
    function _open(address cpu, address me, uint256 tokenId) private {
        _requireAnchor(cpu, me, tokenId);
        ICircuitAccountOpener opener = ICircuitAccountOpener(OPENER);
        if (!opener.isOpened(cpu, tokenId)) {
            uint256 fee = opener.FEE();
            require(me.balance >= fee + 0.005 ether, "not enough OKB for the opener fee and gas");
            vm.startBroadcast(me);
            opener.open{value: fee}(cpu, tokenId);
            vm.stopBroadcast();
        } else {
            console2.log("The container is already open: nothing to send.");
        }

        address container = opener.accountOf(cpu, tokenId);
        require(ISiteRegistry(REGISTRY).isOpenedContainer(container), "the container is not opened");
        console2.log(string.concat("export DEWEB_CONTAINER=", vm.toString(container)));
    }

    /// @dev `me` owns the circuit, its netlist is the anchor and its shape is 1 in, 1 out, no state, 1 gate.
    function _requireAnchor(address cpu, address me, uint256 tokenId) private view {
        require(IERC721Owner(cpu).ownerOf(tokenId) == me, "DEWEB_TOKEN_ID is not owned by DEPLOYER");
        require(keccak256(ICPU(cpu).netlist(tokenId)) == keccak256(ANCHOR), "DEWEB_TOKEN_ID is not the anchor netlist");
        (uint32 nIn, uint32 nOut, uint32 nState, uint32 gates) = ICPU(cpu).circuitInfo(tokenId);
        require(nIn == 1 && nOut == 1 && nState == 0 && gates == 1, "DEWEB_TOKEN_ID: circuitInfo is not the anchor");
    }
}
