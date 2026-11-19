// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @notice Role index kept by the factory; only vaults it created may call it.
interface IVaultIndex {
    function index(address account) external;
}
