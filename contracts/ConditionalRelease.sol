// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title ConditionalRelease
 * @notice Advanced conditional release logic (birthday triggers, scheduled, milestone-based)
 * @dev Demonstrates programmable logic for conditional releases
 */
contract ConditionalRelease {
    // ============ Structs ============
    
    struct ConditionalGift {
        address sender;
        address recipient;
        uint256 amount;
        ReleaseCondition condition;
        uint256 triggerValue; // Timestamp or milestone ID
        bool released;
        string message;
    }
    
    enum ReleaseCondition {
        NONE,           // No condition
        BIRTHDAY,       // Release on specific date
        SCHEDULED,      // Release at specific timestamp
        MILESTONE,      // Release when milestone reached
        EVENT_TRIGGERED // Release when event occurs
    }
    
    // ============ State Variables ============
    
    mapping(bytes32 => ConditionalGift) public conditionalGifts;
    mapping(bytes32 => bool) public milestones; // milestoneId => reached
    mapping(bytes32 => bool) public events; // eventId => occurred
    
    address public owner;
    uint256 public totalConditionalGifts;
    uint256 public totalReleased;
    
    // ============ Events ============
    
    event ConditionalGiftCreated(
        bytes32 indexed giftId,
        address indexed sender,
        address indexed recipient,
        uint256 amount,
        ReleaseCondition condition,
        uint256 triggerValue
    );
    
    event GiftReleased(
        bytes32 indexed giftId,
        address indexed recipient,
        uint256 amount,
        ReleaseCondition condition
    );
    
    event MilestoneReached(bytes32 indexed milestoneId);
    
    event EventTriggered(bytes32 indexed eventId);
    
    // ============ Modifiers ============
    
    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }
    
    modifier giftExists(bytes32 giftId) {
        require(conditionalGifts[giftId].sender != address(0), "Gift does not exist");
        _;
    }
    
    // ============ Constructor ============
    
    constructor() {
        owner = msg.sender;
    }
    
    // ============ Core Functions ============
    
    /**
     * @notice Create a conditional gift
     * @param giftId Unique identifier for the gift
     * @param recipient Address of the recipient
     * @param condition Type of release condition
     * @param triggerValue Value for condition (timestamp for time-based, milestone ID for milestone-based)
     * @param message Optional gift message
     */
    function createConditionalGift(
        bytes32 giftId,
        address recipient,
        ReleaseCondition condition,
        uint256 triggerValue,
        string memory message
    ) external payable {
        require(recipient != address(0), "Invalid recipient");
        require(msg.value > 0, "Amount must be greater than 0");
        require(
            conditionalGifts[giftId].sender == address(0),
            "Gift already exists"
        );
        
        // Validate trigger value based on condition
        if (condition == ReleaseCondition.SCHEDULED || 
            condition == ReleaseCondition.BIRTHDAY) {
            require(triggerValue > block.timestamp, "Trigger must be in future");
        }
        
        conditionalGifts[giftId] = ConditionalGift({
            sender: msg.sender,
            recipient: recipient,
            amount: msg.value,
            condition: condition,
            triggerValue: triggerValue,
            released: false,
            message: message
        });
        
        totalConditionalGifts++;
        
        emit ConditionalGiftCreated(
            giftId,
            msg.sender,
            recipient,
            msg.value,
            condition,
            triggerValue
        );
    }
    
    /**
     * @notice Release gift when condition is satisfied
     * @param giftId Unique identifier for the gift
     */
    function releaseGift(bytes32 giftId) external giftExists(giftId) {
        ConditionalGift storage gift = conditionalGifts[giftId];
        
        require(!gift.released, "Gift already released");
        require(_checkCondition(gift), "Condition not satisfied");
        
        gift.released = true;
        totalReleased++;
        
        // Transfer funds
        (bool success, ) = payable(gift.recipient).call{value: gift.amount}("");
        require(success, "Transfer failed");
        
        emit GiftReleased(
            giftId,
            gift.recipient,
            gift.amount,
            gift.condition
        );
    }
    
    /**
     * @notice Check if condition is satisfied
     */
    function _checkCondition(ConditionalGift memory gift) internal view returns (bool) {
        if (gift.condition == ReleaseCondition.NONE) {
            return true;
        }
        
        if (gift.condition == ReleaseCondition.SCHEDULED) {
            return block.timestamp >= gift.triggerValue;
        }
        
        if (gift.condition == ReleaseCondition.BIRTHDAY) {
            // Check if current date matches trigger date (simplified - checks timestamp)
            return block.timestamp >= gift.triggerValue;
        }
        
        if (gift.condition == ReleaseCondition.MILESTONE) {
            bytes32 milestoneId = bytes32(gift.triggerValue);
            return milestones[milestoneId];
        }
        
        if (gift.condition == ReleaseCondition.EVENT_TRIGGERED) {
            bytes32 eventId = bytes32(gift.triggerValue);
            return events[eventId];
        }
        
        return false;
    }
    
    /**
     * @notice Mark milestone as reached (for milestone-based releases)
     * @param milestoneId Unique milestone identifier
     */
    function reachMilestone(bytes32 milestoneId) external onlyOwner {
        require(!milestones[milestoneId], "Milestone already reached");
        
        milestones[milestoneId] = true;
        
        emit MilestoneReached(milestoneId);
    }
    
    /**
     * @notice Trigger event (for event-triggered releases)
     * @param eventId Unique event identifier
     */
    function triggerEvent(bytes32 eventId) external onlyOwner {
        require(!events[eventId], "Event already triggered");
        
        events[eventId] = true;
        
        emit EventTriggered(eventId);
    }
    
    /**
     * @notice Batch release multiple gifts (for scheduled releases)
     * @param giftIds Array of gift IDs to release
     */
    function batchRelease(bytes32[] memory giftIds) external {
        for (uint256 i = 0; i < giftIds.length; i++) {
            ConditionalGift storage gift = conditionalGifts[giftIds[i]];
            
            if (!gift.released && _checkCondition(gift)) {
                gift.released = true;
                totalReleased++;
                
                (bool success, ) = payable(gift.recipient).call{value: gift.amount}("");
                require(success, "Batch release transfer failed");
                
                emit GiftReleased(
                    giftIds[i],
                    gift.recipient,
                    gift.amount,
                    gift.condition
                );
            }
        }
    }
    
    /**
     * @notice Get gift details
     */
    function getGift(bytes32 giftId) external view returns (ConditionalGift memory) {
        return conditionalGifts[giftId];
    }
    
    /**
     * @notice Check if gift can be released
     */
    function canRelease(bytes32 giftId) external view returns (bool) {
        ConditionalGift memory gift = conditionalGifts[giftId];
        
        if (gift.sender == address(0)) return false;
        if (gift.released) return false;
        
        return _checkCondition(gift);
    }
}

