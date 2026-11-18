// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @title ICPU — permanent interface of a TapeOut processor (copied from the verified on-chain source)
/// @notice Pins and state are bit-packed little-endian.
interface ICPU {
    function eval(uint256 circuitId, bytes calldata inputs) external view returns (bytes memory outputs);

    function step(uint256 circuitId, bytes calldata state, bytes calldata inputs)
        external
        view
        returns (bytes memory newState, bytes memory outputs);

    function circuitInfo(uint256 circuitId)
        external
        view
        returns (uint32 nIn, uint32 nOut, uint32 nState, uint32 gateCount);

    function netlist(uint256 circuitId) external view returns (bytes memory);

    function transistors() external view returns (address);
}
