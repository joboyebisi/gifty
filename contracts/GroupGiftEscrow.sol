// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title GroupGiftEscrow
 * @notice Multi-contributor gift coordination with threshold-based release
 * @dev Demonstrates programmable logic for group coordination
 */
contract GroupGiftEscrow {
    // ============ Structs ============
    
    struct GroupGift {
        address initiator;
        address recipient;
        uint256 targetAmount;
        uint256 currentAmount;
        uint256 deadline;
        uint256 contributorCount;
        bool active;
        bool distributed;
    }
    
    struct Contribution {
        address contributor;
        uint256 amount;
        uint256 timestamp;
        bool refunded;
    }
    
    // ============ State Variables ============
    
    mapping(bytes32 => GroupGift) public groupGifts;
    mapping(bytes32 => Contribution[]) public contributions; // groupGiftId => Contributions
    mapping(bytes32 => mapping(address => bool)) public hasContributed; // groupGiftId => contributor => contributed
    
    address public owner;
    uint256 public totalGroupGifts;
    
    // ============ Events ============
    
    event GroupGiftCreated(
        bytes32 indexed groupGiftId,
        address indexed initiator,
        address indexed recipient,
        uint256 targetAmount,
        uint256 deadline
    );
    
    event ContributionMade(
        bytes32 indexed groupGiftId,
        address indexed contributor,
        uint256 amount,
        uint256 currentAmount,
        uint256 targetAmount
    );
    
    event ThresholdReached(
        bytes32 indexed groupGiftId,
        address indexed recipient,
        uint256 totalAmount
    );
    
    event GroupGiftDistributed(
        bytes32 indexed groupGiftId,
        address indexed recipient,
        uint256 amount
    );
    
    event GroupGiftRefunded(
        bytes32 indexed groupGiftId,
        address indexed contributor,
        uint256 amount
    );
    
    // ============ Modifiers ============
    
    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }
    
    modifier groupGiftExists(bytes32 groupGiftId) {
        require(groupGifts[groupGiftId].initiator != address(0), "Group gift does not exist");
        _;
    }
    
    // ============ Constructor ============
    
    constructor() {
        owner = msg.sender;
    }
    
    // ============ Core Functions ============
    
    /**
     * @notice Create a group gift campaign
     * @param groupGiftId Unique identifier for the group gift
     * @param recipient Address of the gift recipient
     * @param targetAmount Target amount to reach before distribution
     * @param deadline Timestamp when campaign expires
     */
    function createGroupGift(
        bytes32 groupGiftId,
        address recipient,
        uint256 targetAmount,
        uint256 deadline
    ) external {
        require(recipient != address(0), "Invalid recipient");
        require(targetAmount > 0, "Target amount must be greater than 0");
        require(
            deadline == 0 || deadline > block.timestamp,
            "Deadline must be in future"
        );
        require(
            groupGifts[groupGiftId].initiator == address(0),
            "Group gift already exists"
        );
        
        groupGifts[groupGiftId] = GroupGift({
            initiator: msg.sender,
            recipient: recipient,
            targetAmount: targetAmount,
            currentAmount: 0,
            deadline: deadline,
            contributorCount: 0,
            active: true,
            distributed: false
        });
        
        totalGroupGifts++;
        
        emit GroupGiftCreated(
            groupGiftId,
            msg.sender,
            recipient,
            targetAmount,
            deadline
        );
    }
    
    /**
     * @notice Contribute to a group gift
     * @param groupGiftId Unique identifier for the group gift
     */
    function contribute(bytes32 groupGiftId) 
        external 
        payable 
        groupGiftExists(groupGiftId) 
    {
        GroupGift storage gift = groupGifts[groupGiftId];
        
        require(gift.active, "Group gift not active");
        require(!gift.distributed, "Group gift already distributed");
        require(msg.value > 0, "Contribution must be greater than 0");
        require(
            gift.deadline == 0 || block.timestamp <= gift.deadline,
            "Group gift expired"
        );
        
        // Add contribution
        contributions[groupGiftId].push(Contribution({
            contributor: msg.sender,
            amount: msg.value,
            timestamp: block.timestamp,
            refunded: false
        }));
        
        // Track if new contributor
        if (!hasContributed[groupGiftId][msg.sender]) {
            hasContributed[groupGiftId][msg.sender] = true;
            gift.contributorCount++;
        }
        
        // Update current amount
        gift.currentAmount += msg.value;
        
        emit ContributionMade(
            groupGiftId,
            msg.sender,
            msg.value,
            gift.currentAmount,
            gift.targetAmount
        );
        
        // Check if threshold reached
        if (gift.currentAmount >= gift.targetAmount && !gift.distributed) {
            _distributeGroupGift(groupGiftId);
        }
    }
    
    /**
     * @notice Distribute group gift to recipient when threshold reached
     */
    function _distributeGroupGift(bytes32 groupGiftId) internal {
        GroupGift storage gift = groupGifts[groupGiftId];
        
        gift.distributed = true;
        gift.active = false;
        
        // Transfer to recipient
        (bool success, ) = payable(gift.recipient).call{value: gift.currentAmount}("");
        require(success, "Distribution transfer failed");
        
        emit ThresholdReached(groupGiftId, gift.recipient, gift.currentAmount);
        emit GroupGiftDistributed(groupGiftId, gift.recipient, gift.currentAmount);
    }
    
    /**
     * @notice Refund contributions if deadline passed without reaching threshold
     * @param groupGiftId Unique identifier for the group gift
     */
    function refundGroupGift(bytes32 groupGiftId) 
        external 
        groupGiftExists(groupGiftId) 
    {
        GroupGift storage gift = groupGifts[groupGiftId];
        
        require(gift.active, "Group gift not active");
        require(!gift.distributed, "Group gift already distributed");
        require(
            gift.deadline > 0 && block.timestamp > gift.deadline,
            "Deadline not passed"
        );
        require(
            gift.currentAmount < gift.targetAmount,
            "Threshold reached, cannot refund"
        );
        
        gift.active = false;
        
        // Refund all contributions
        Contribution[] storage contribs = contributions[groupGiftId];
        
        for (uint256 i = 0; i < contribs.length; i++) {
            if (!contribs[i].refunded) {
                contribs[i].refunded = true;
                
                (bool success, ) = payable(contribs[i].contributor).call{
                    value: contribs[i].amount
                }("");
                require(success, "Refund transfer failed");
                
                emit GroupGiftRefunded(
                    groupGiftId,
                    contribs[i].contributor,
                    contribs[i].amount
                );
            }
        }
    }
    
    /**
     * @notice Get group gift details
     */
    function getGroupGift(bytes32 groupGiftId) 
        external 
        view 
        returns (GroupGift memory) 
    {
        return groupGifts[groupGiftId];
    }
    
    /**
     * @notice Get contribution count
     */
    function getContributionCount(bytes32 groupGiftId) 
        external 
        view 
        returns (uint256) 
    {
        return contributions[groupGiftId].length;
    }
    
    /**
     * @notice Get contribution by index
     */
    function getContribution(bytes32 groupGiftId, uint256 index) 
        external 
        view 
        returns (Contribution memory) 
    {
        return contributions[groupGiftId][index];
    }
    
    /**
     * @notice Get progress percentage
     */
    function getProgress(bytes32 groupGiftId) 
        external 
        view 
        returns (uint256 percentage) 
    {
        GroupGift memory gift = groupGifts[groupGiftId];
        if (gift.targetAmount == 0) return 0;
        return (gift.currentAmount * 100) / gift.targetAmount;
    }
}

