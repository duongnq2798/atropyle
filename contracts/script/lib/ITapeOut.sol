// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ICPU} from "../../src/interfaces/ICPU.sol";

/// @notice Live TapeOut contracts on X Layer, only the members the deploy flow needs.
interface ITapeOutFactory {
    /// @dev Returns two words on chain: replaying tx 0x47771e11...b3fe3 (block 76240393) with `cast call` returns
    ///      (transistors, circuits), matching the official client ABI.
    function createCPU(
        string calldata name,
        string calldata symbol,
        string calldata story,
        uint256 supplyCap,
        uint256 mintPrice
    ) external returns (address transistors, address circuits);
    function deployFee() external view returns (uint256);
    function bem() external view returns (address);
    function cpuCount() external view returns (uint256);
    function cpuAt(uint256 index) external view returns (address);
    function isCPU(address cpu) external view returns (bool);
}

interface ITapeOutCircuits is ICPU {
    function tapeout(bytes calldata nl, uint32 nIn, uint32 nOut) external payable returns (uint256 circuitId);
    function TAPEOUT_FEE() external view returns (uint256);
    function nextId() external view returns (uint256);
    function name() external view returns (string memory);
    function symbol() external view returns (string memory);
}

/// @dev New implementation: mint pulls BEM (mintPrice * amount + protocolFee) via transferFrom.
interface ITransistors {
    function mint(uint256 id, uint256 amount) external;
    function NAND() external view returns (uint256);
    function LATCH() external view returns (uint256);
    function mintPrice() external view returns (uint256);
    function protocolFee() external view returns (uint256);
    function balanceOf(address account, uint256 id) external view returns (uint256);
    function creator() external view returns (address);
    function circuits() external view returns (address);
}

interface IBeaconOwner {
    function owner() external view returns (address);
}
