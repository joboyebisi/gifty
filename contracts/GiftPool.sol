// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title GiftPool
 * @dev Manages pooled gifts where multiple users contribute USDC to a target.
 * Settlement happens on Arc.
 */
contract GiftPool is Ownable, ReentrancyGuard {
    IERC20 public usdc;

    struct Pool {
        uint256 id;
        address creator;
        string recipientHandle;
        uint256 targetAmount;
        uint256 currentAmount;
        bool distributed;
        mapping(address => uint256) contributions;
    }

    mapping(uint256 => Pool) public pools;
    uint256 public poolCount;

    event PoolCreated(uint256 indexed poolId, address indexed creator, string recipientHandle, uint256 targetAmount);
    event Contribution(uint256 indexed poolId, address indexed contributor, uint256 amount);
    event Distributed(uint256 indexed poolId, address indexed recipient, uint256 amount);

    constructor(address _usdc) Ownable(msg.sender) {
        usdc = IERC20(_usdc);
    }

    function createPool(string memory _recipientHandle, uint256 _targetAmount) external returns (uint256) {
        poolCount++;
        Pool storage newPool = pools[poolCount];
        newPool.id = poolCount;
        newPool.creator = msg.sender;
        newPool.recipientHandle = _recipientHandle;
        newPool.targetAmount = _targetAmount;
        newPool.currentAmount = 0;
        newPool.distributed = false;

        emit PoolCreated(poolCount, msg.sender, _recipientHandle, _targetAmount);
        return poolCount;
    }

    function contribute(uint256 _poolId, uint256 _amount) external nonReentrant {
        Pool storage pool = pools[_poolId];
        require(pool.id != 0, "Pool does not exist");
        require(!pool.distributed, "Pool already distributed");
        require(_amount > 0, "Amount must be > 0");

        require(usdc.transferFrom(msg.sender, address(this), _amount), "Transfer failed");

        pool.contributions[msg.sender] += _amount;
        pool.currentAmount += _amount;

        emit Contribution(_poolId, msg.sender, _amount);
    }

    function distribute(uint256 _poolId, address _recipient) external onlyOwner nonReentrant {
         Pool storage pool = pools[_poolId];
        require(pool.id != 0, "Pool does not exist");
        require(!pool.distributed, "Pool already distributed");
        
        uint256 amount = pool.currentAmount;
        require(amount > 0, "Nothing to distribute");

        pool.distributed = true;
        require(usdc.transfer(_recipient, amount), "Transfer failed");

        emit Distributed(_poolId, _recipient, amount);
    }
    
    // Emergency withdraw by owner (in case of stuck funds or canceled pools)
    function emergencyWithdraw(uint256 _amount) external onlyOwner {
        require(usdc.transfer(owner(), _amount), "Transfer failed");
    }
}
