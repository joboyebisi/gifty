// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title GiftEscrow
 * @notice Advanced escrow contract with programmable logic beyond basic transfers
 * @dev Supports conditional releases, time locks, secret codes, and automatic refunds
 */
contract GiftEscrow {
    // ============ Structs ============
    
    struct Gift {
        address sender;
        address recipient;
        uint256 amount;
        uint256 unlockTime; // Timestamp when gift can be claimed
        uint256 expirationTime; // Timestamp when gift expires
        bytes32 secretHash; // Hash of secret code (if required)
        bool claimed;
        bool refunded;
        string message; // Optional gift message
    }
    
    struct Condition {
        ConditionType conditionType;
        uint256 triggerValue; // Timestamp for time-based, milestone ID for milestone-based
        bool satisfied;
    }
    
    enum ConditionType {
        NONE,           // No condition, can claim immediately
        TIME_LOCKED,    // Cannot claim before unlockTime
        BIRTHDAY,       // Triggered on specific date
        SCHEDULED,      // Scheduled release at specific time
        SECRET_REQUIRED // Requires secret code
    }
    
    // ============ State Variables ============
    
    mapping(bytes32 => Gift) public gifts; // claimCode => Gift
    mapping(bytes32 => Condition) public conditions; // claimCode => Condition
    mapping(address => uint256) public balances; // Sender balances for refunds
    
    address public owner;
    uint256 public totalGifts;
    uint256 public totalClaimed;
    uint256 public totalRefunded;
    
    // ============ Events ============
    
    event GiftCreated(
        bytes32 indexed claimCode,
        address indexed sender,
        address indexed recipient,
        uint256 amount,
        uint256 unlockTime,
        uint256 expirationTime
    );
    
    event GiftClaimed(
        bytes32 indexed claimCode,
        address indexed recipient,
        uint256 amount
    );
    
    event GiftRefunded(
        bytes32 indexed claimCode,
        address indexed sender,
        uint256 amount
    );
    
    event ConditionSatisfied(
        bytes32 indexed claimCode,
        ConditionType conditionType
    );
    
    // ============ Modifiers ============
    
    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }
    
    modifier giftExists(bytes32 claimCode) {
        require(gifts[claimCode].sender != address(0), "Gift does not exist");
        _;
    }
    
    // ============ Constructor ============
    
    constructor() {
        owner = msg.sender;
    }
    
    // ============ Core Functions ============
    
    /**
     * @notice Create a gift escrow with programmable conditions
     * @param recipient Address of the gift recipient
     * @param claimCode Unique claim code for the gift
     * @param unlockTime Timestamp when gift can be claimed (0 = immediate)
     * @param expirationTime Timestamp when gift expires (0 = never expires)
     * @param secretHash Hash of secret code (bytes32(0) = no secret required)
     * @param conditionType Type of condition for release
     * @param triggerValue Value for condition (timestamp for time-based, etc.)
     * @param message Optional gift message
     */
    function createGift(
        address recipient,
        bytes32 claimCode,
        uint256 unlockTime,
        uint256 expirationTime,
        bytes32 secretHash,
        ConditionType conditionType,
        uint256 triggerValue,
        string memory message
    ) external payable {
        require(recipient != address(0), "Invalid recipient");
        require(msg.value > 0, "Amount must be greater than 0");
        require(gifts[claimCode].sender == address(0), "Gift already exists");
        require(
            expirationTime == 0 || expirationTime > block.timestamp,
            "Expiration must be in future"
        );
        
        // Create gift
        gifts[claimCode] = Gift({
            sender: msg.sender,
            recipient: recipient,
            amount: msg.value,
            unlockTime: unlockTime,
            expirationTime: expirationTime,
            secretHash: secretHash,
            claimed: false,
            refunded: false,
            message: message
        });
        
        // Create condition
        conditions[claimCode] = Condition({
            conditionType: conditionType,
            triggerValue: triggerValue,
            satisfied: conditionType == ConditionType.NONE
        });
        
        // Update balances for refund tracking
        balances[msg.sender] += msg.value;
        
        totalGifts++;
        
        emit GiftCreated(
            claimCode,
            msg.sender,
            recipient,
            msg.value,
            unlockTime,
            expirationTime
        );
    }
    
    /**
     * @notice Claim a gift (with optional secret code)
     * @param claimCode Unique claim code for the gift
     * @param secret Secret code (empty string if not required)
     */
    function claimGift(bytes32 claimCode, string memory secret) external giftExists(claimCode) {
        Gift storage gift = gifts[claimCode];
        Condition storage condition = conditions[claimCode];
        
        // Check if already claimed
        require(!gift.claimed, "Gift already claimed");
        require(!gift.refunded, "Gift already refunded");
        
        // Check if expired
        if (gift.expirationTime > 0 && block.timestamp > gift.expirationTime) {
            _refundGift(claimCode);
            revert("Gift expired");
        }
        
        // Verify recipient
        require(msg.sender == gift.recipient, "Not the recipient");
        
        // Check unlock time
        require(
            gift.unlockTime == 0 || block.timestamp >= gift.unlockTime,
            "Gift not yet unlocked"
        );
        
        // Check condition
        require(_checkCondition(claimCode), "Condition not satisfied");
        
        // Verify secret if required
        if (condition.conditionType == ConditionType.SECRET_REQUIRED) {
            require(
                gift.secretHash == keccak256(abi.encodePacked(secret)),
                "Invalid secret code"
            );
        }
        
        // Mark as claimed
        gift.claimed = true;
        balances[gift.sender] -= gift.amount;
        totalClaimed++;
        
        // Transfer funds
        (bool success, ) = payable(gift.recipient).call{value: gift.amount}("");
        require(success, "Transfer failed");
        
        emit GiftClaimed(claimCode, gift.recipient, gift.amount);
    }
    
    /**
     * @notice Refund an expired or unclaimed gift
     * @param claimCode Unique claim code for the gift
     */
    function refundGift(bytes32 claimCode) external giftExists(claimCode) {
        Gift storage gift = gifts[claimCode];
        
        require(!gift.claimed, "Gift already claimed");
        require(!gift.refunded, "Gift already refunded");
        require(
            gift.expirationTime > 0 && block.timestamp > gift.expirationTime,
            "Gift not expired"
        );
        
        _refundGift(claimCode);
    }
    
    /**
     * @notice Internal function to refund a gift
     */
    function _refundGift(bytes32 claimCode) internal {
        Gift storage gift = gifts[claimCode];
        
        gift.refunded = true;
        balances[gift.sender] -= gift.amount;
        totalRefunded++;
        
        (bool success, ) = payable(gift.sender).call{value: gift.amount}("");
        require(success, "Refund transfer failed");
        
        emit GiftRefunded(claimCode, gift.sender, gift.amount);
    }
    
    /**
     * @notice Check if condition is satisfied
     */
    function _checkCondition(bytes32 claimCode) internal view returns (bool) {
        Condition memory condition = conditions[claimCode];
        
        if (condition.conditionType == ConditionType.NONE) {
            return true;
        }
        
        if (condition.conditionType == ConditionType.TIME_LOCKED) {
            return block.timestamp >= condition.triggerValue;
        }
        
        if (condition.conditionType == ConditionType.BIRTHDAY) {
            // Check if current date matches trigger date (simplified)
            return block.timestamp >= condition.triggerValue;
        }
        
        if (condition.conditionType == ConditionType.SCHEDULED) {
            return block.timestamp >= condition.triggerValue;
        }
        
        // SECRET_REQUIRED is checked in claimGift function
        return true;
    }
    
    /**
     * @notice Satisfy a condition (for external triggers like birthday)
     * @param claimCode Unique claim code
     */
    function satisfyCondition(bytes32 claimCode) external giftExists(claimCode) {
        Condition storage condition = conditions[claimCode];
        
        require(!condition.satisfied, "Condition already satisfied");
        
        // Only owner or automated system can satisfy conditions
        require(
            msg.sender == owner || msg.sender == address(this),
            "Not authorized"
        );
        
        condition.satisfied = true;
        
        emit ConditionSatisfied(claimCode, condition.conditionType);
    }
    
    /**
     * @notice Get gift details
     */
    function getGift(bytes32 claimCode) external view returns (Gift memory) {
        return gifts[claimCode];
    }
    
    /**
     * @notice Get condition details
     */
    function getCondition(bytes32 claimCode) external view returns (Condition memory) {
        return conditions[claimCode];
    }
    
    /**
     * @notice Check if gift can be claimed
     */
    function canClaim(bytes32 claimCode) external view returns (bool) {
        Gift memory gift = gifts[claimCode];
        
        if (gift.sender == address(0)) return false;
        if (gift.claimed) return false;
        if (gift.refunded) return false;
        if (gift.expirationTime > 0 && block.timestamp > gift.expirationTime) return false;
        if (gift.unlockTime > 0 && block.timestamp < gift.unlockTime) return false;
        
        return _checkCondition(claimCode);
    }
    
    // ============ Admin Functions ============
    
    /**
     * @notice Withdraw contract balance (emergency only)
     */
    function withdraw() external onlyOwner {
        uint256 balance = address(this).balance;
        require(balance > 0, "No balance to withdraw");
        
        (bool success, ) = payable(owner).call{value: balance}("");
        require(success, "Withdraw failed");
    }
}

