// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ERC1155} from "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";

contract MockERC20 is ERC20 {
    uint8 private immutable _dec;

    constructor(string memory name_, string memory symbol_, uint8 decimals_) ERC20(name_, symbol_) {
        _dec = decimals_;
    }

    function decimals() public view override returns (uint8) {
        return _dec;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

contract MockERC721 is ERC721 {
    constructor() ERC721("Mock NFT", "MNFT") {}

    function mint(address to, uint256 id) external {
        _mint(to, id);
    }
}

contract MockERC1155 is ERC1155 {
    constructor() ERC1155("") {}

    function mint(address to, uint256 id, uint256 amount) external {
        _mint(to, id, amount, "");
    }
}

interface IDistribute {
    function distribute() external returns (bool);
}

/// @notice Reverts any transfer from or to a blocked address (USDC/USDT-style blacklist).
contract MockBlacklistERC20 is MockERC20 {
    mapping(address => bool) public blocked;

    constructor() MockERC20("Black", "BLK", 6) {}

    function setBlocked(address account, bool on) external {
        blocked[account] = on;
    }

    function _update(address from, address to, uint256 value) internal override {
        require(!blocked[from] && !blocked[to], "blocked");
        super._update(from, to, value);
    }
}

/// @notice Burns 1% of every transfer.
contract MockFeeERC20 is MockERC20 {
    constructor() MockERC20("Fee", "FEE", 18) {}

    function _update(address from, address to, uint256 value) internal override {
        if (from == address(0) || to == address(0)) {
            super._update(from, to, value);
            return;
        }
        uint256 fee = value / 100;
        super._update(from, address(0), fee);
        super._update(from, to, value - fee);
    }
}

/// @notice Old-USDT style: transferFrom returns nothing.
contract MockNoReturnERC20 {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function approve(address spender, uint256 amount) external {
        allowance[msg.sender][spender] = amount;
    }

    function transferFrom(address from, address to, uint256 amount) external {
        require(balanceOf[from] >= amount && allowance[from][msg.sender] >= amount, "no");
        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
    }
}

/// @notice Views look healthy, every other call returns a single garbage byte.
contract MockGarbageToken {
    function balanceOf(address) external pure returns (uint256) {
        return 1e18;
    }

    function allowance(address, address) external pure returns (uint256) {
        return 1e18;
    }

    fallback() external {
        assembly {
            mstore(0, shl(248, 1))
            return(0, 1)
        }
    }
}

/// @notice A contract heir without onERC721Received.
contract NonReceiver {}

/// @notice Tries to re-enter the vault from inside transferFrom.
contract ReentrantERC20 is MockERC20 {
    address public target;
    bool public attempted;
    bool public reentered;

    constructor() MockERC20("Re", "RE", 18) {}

    function setTarget(address t) external {
        target = t;
    }

    function transferFrom(address from, address to, uint256 value) public override returns (bool) {
        if (target != address(0) && !attempted) {
            attempted = true;
            try IDistribute(target).distribute() {
                reentered = true;
            } catch {}
        }
        return super.transferFrom(from, to, value);
    }
}
