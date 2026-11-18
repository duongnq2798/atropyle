// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";
import {AtropyleVault} from "./AtropyleVault.sol";
import {IVaultIndex} from "./interfaces/IVaultIndex.sol";
import {VaultConfig} from "./vault/VaultConfig.sol";

/// @title AtropyleFactory — creates vault clones, collects the creation fee, indexes roles (spec §5)
/// @notice No admin, no pause, no upgrade. Fee levels are fixed at construction from each token's decimals().
contract AtropyleFactory is IVaultIndex {
    using SafeERC20 for IERC20;

    uint256 public constant EARLY_COUNT = 100;

    address public immutable vaultImpl;
    address public immutable cpu;
    uint256 public immutable policyId;
    address public immutable treasury;

    mapping(address token => uint256) public earlyFee;
    mapping(address token => uint256) public fullFee;
    uint256 public paidCount;
    mapping(address vault => bool) public isVault;

    /// @dev Append-only: a role removed from a vault stays listed. Readers filter by the vault's current roles.
    mapping(address account => address[]) private _vaultsOf;
    mapping(address account => mapping(address vault => bool)) private _indexed;

    event VaultCreated(address indexed owner, address indexed vault, bool drill, address feeToken, uint256 fee);

    error UnsupportedFeeToken();
    error NotVault();
    error BadConstructorArgs();

    /// @dev vaultImpl_ and cpu_ are rejected when they have no code, which also rules out address(0).
    ///      The loop runs once per fee token at deployment, so its external call and reverts are bounded by the
    ///      deployer's own list.
    // forge-lint: disable-next-line(missing-zero-check)
    constructor(address vaultImpl_, address cpu_, uint256 policyId_, address treasury_, address[] memory feeTokens) {
        if (vaultImpl_.code.length == 0 || cpu_.code.length == 0 || treasury_ == address(0) || feeTokens.length == 0)
        {
            revert BadConstructorArgs();
        }
        vaultImpl = vaultImpl_;
        cpu = cpu_;
        policyId = policyId_;
        treasury = treasury_;
        // forge-lint: disable-start(calls-loop, require-revert-in-loop)
        for (uint256 i; i < feeTokens.length; ++i) {
            address t = feeTokens[i];
            if (t.code.length == 0 || fullFee[t] != 0) revert BadConstructorArgs();
            uint8 d = IERC20Metadata(t).decimals();
            if (d < 2 || d > 18) revert BadConstructorArgs();
            uint256 unit = 10 ** (d - 2);
            earlyFee[t] = 199 * unit; // 1.99 tokens
            fullFee[t] = 990 * unit; // 9.90 tokens
        }
        // forge-lint: disable-end(calls-loop, require-revert-in-loop)
    }

    /// @notice Fee a paid vault would be charged right now in `token`.
    function currentFee(address token) public view returns (uint256 fee) {
        fee = paidCount < EARLY_COUNT ? earlyFee[token] : fullFee[token];
        if (fee == 0) revert UnsupportedFeeToken();
    }

    /// @notice Creates the caller's vault. A Drill is free, ignores `feeToken` and is not counted in paidCount.
    /// @dev The clone is registered in isVault before initialize(), which calls index() back on this contract.
    ///      Everything runs in one transaction, so a failed initialize() also refunds the fee.
    function createVault(VaultConfig.Config calldata cfg, bytes32 salt, bool drill, address feeToken)
        external
        returns (address vault)
    {
        uint256 fee = 0; // a Drill pays nothing
        if (drill) {
            feeToken = address(0);
        } else {
            fee = currentFee(feeToken);
            ++paidCount;
            IERC20(feeToken).safeTransferFrom(msg.sender, treasury, fee);
        }
        vault = Clones.cloneDeterministic(vaultImpl, _salt(msg.sender, salt));
        isVault[vault] = true; // before initialize, which calls index() back
        AtropyleVault(vault).initialize(msg.sender, drill, cfg, cpu, policyId);
        // The vault is a clone of the trusted implementation and the fee token is whitelisted at construction.
        // forge-lint: disable-next-line(reentrancy-events)
        emit VaultCreated(msg.sender, vault, drill, feeToken, fee);
    }

    /// @notice Address `createVault` will deploy for (`owner`, `salt`); lets a UI show it before the transaction.
    function predictVault(address owner, bytes32 salt) external view returns (address) {
        return Clones.predictDeterministicAddress(vaultImpl, _salt(owner, salt));
    }

    /// @inheritdoc IVaultIndex
    function index(address account) external {
        if (!isVault[msg.sender]) revert NotVault();
        if (_indexed[account][msg.sender]) return;
        _indexed[account][msg.sender] = true;
        _vaultsOf[account].push(msg.sender);
    }

    /// @notice Every vault `account` has ever been owner, heir or guardian of (append-only, no duplicates).
    function vaultsOf(address account) external view returns (address[] memory) {
        return _vaultsOf[account];
    }

    function _salt(address owner, bytes32 salt) private pure returns (bytes32) {
        return keccak256(abi.encode(owner, salt));
    }
}
