// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title RecurringGift
 * @notice Programmable recurring gifts (monthly allowances, weekly payments, etc.)
 * @dev Demonstrates advanced automation logic impossible with traditional systems
 */
contract RecurringGift {
    // ============ Structs ============
    
    struct RecurringGiftSchedule {
        address sender;
        address recipient;
        uint256 amount;
        uint256 interval; // Seconds between payments (e.g., 2592000 = 30 days)
        uint256 startTime; // When first payment should be made
        uint256 endTime; // When recurring should stop (0 = indefinite)
        uint256 totalPayments; // Total number of payments made
        uint256 maxPayments; // Maximum number of payments (0 = unlimited)
        bool active;
        string message;
    }
    
    // ============ State Variables ============
    
    mapping(bytes32 => RecurringGiftSchedule) public schedules;
    mapping(bytes32 => uint256) public lastPaymentTime; // scheduleId => last payment timestamp
    
    address public owner;
    uint256 public totalSchedules;
    uint256 public totalPaymentsMade;
    
    // ============ Events ============
    
    event RecurringGiftCreated(
        bytes32 indexed scheduleId,
        address indexed sender,
        address indexed recipient,
        uint256 amount,
        uint256 interval,
        uint256 startTime
    );
    
    event PaymentExecuted(
        bytes32 indexed scheduleId,
        address indexed recipient,
        uint256 amount,
        uint256 paymentNumber
    );
    
    event RecurringGiftCancelled(
        bytes32 indexed scheduleId,
        address indexed sender
    );
    
    // ============ Modifiers ============
    
    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }
    
    modifier scheduleExists(bytes32 scheduleId) {
        require(schedules[scheduleId].sender != address(0), "Schedule does not exist");
        _;
    }
    
    // ============ Constructor ============
    
    constructor() {
        owner = msg.sender;
    }
    
    // ============ Core Functions ============
    
    /**
     * @notice Create a recurring gift schedule
     * @param scheduleId Unique identifier for the schedule
     * @param recipient Address of the recipient
     * @param amount Amount to send per interval
     * @param interval Seconds between payments (e.g., 2592000 = 30 days)
     * @param startTime When first payment should be made
     * @param endTime When recurring should stop (0 = indefinite)
     * @param maxPayments Maximum number of payments (0 = unlimited)
     * @param message Optional message
     */
    function createRecurringGift(
        bytes32 scheduleId,
        address recipient,
        uint256 amount,
        uint256 interval,
        uint256 startTime,
        uint256 endTime,
        uint256 maxPayments,
        string memory message
    ) external payable {
        require(recipient != address(0), "Invalid recipient");
        require(amount > 0, "Amount must be greater than 0");
        require(interval > 0, "Interval must be greater than 0");
        require(msg.value >= amount, "Insufficient funds for first payment");
        require(
            schedules[scheduleId].sender == address(0),
            "Schedule already exists"
        );
        require(
            endTime == 0 || endTime > startTime,
            "End time must be after start time"
        );
        
        schedules[scheduleId] = RecurringGiftSchedule({
            sender: msg.sender,
            recipient: recipient,
            amount: amount,
            interval: interval,
            startTime: startTime,
            endTime: endTime,
            totalPayments: 0,
            maxPayments: maxPayments,
            active: true,
            message: message
        });
        
        lastPaymentTime[scheduleId] = 0;
        totalSchedules++;
        
        emit RecurringGiftCreated(
            scheduleId,
            msg.sender,
            recipient,
            amount,
            interval,
            startTime
        );
        
        // Execute first payment if start time has passed
        if (startTime <= block.timestamp) {
            _executePayment(scheduleId);
        }
    }
    
    /**
     * @notice Execute payment for a recurring gift (can be called by anyone)
     * @param scheduleId Unique identifier for the schedule
     */
    function executePayment(bytes32 scheduleId) 
        external 
        scheduleExists(scheduleId) 
    {
        RecurringGiftSchedule storage schedule = schedules[scheduleId];
        
        require(schedule.active, "Schedule not active");
        require(_canExecutePayment(scheduleId), "Payment not due yet");
        
        _executePayment(scheduleId);
    }
    
    /**
     * @notice Internal function to execute payment
     */
    function _executePayment(bytes32 scheduleId) internal {
        RecurringGiftSchedule storage schedule = schedules[scheduleId];
        
        // Check if we've reached max payments
        if (schedule.maxPayments > 0 && schedule.totalPayments >= schedule.maxPayments) {
            schedule.active = false;
            return;
        }
        
        // Check if end time has passed
        if (schedule.endTime > 0 && block.timestamp > schedule.endTime) {
            schedule.active = false;
            return;
        }
        
        // Check if enough time has passed since last payment
        uint256 lastPayment = lastPaymentTime[scheduleId];
        if (lastPayment > 0 && block.timestamp < lastPayment + schedule.interval) {
            return; // Not time yet
        }
        
        // Check if start time has passed
        if (block.timestamp < schedule.startTime) {
            return; // Not started yet
        }
        
        // Transfer funds
        (bool success, ) = payable(schedule.recipient).call{value: schedule.amount}("");
        require(success, "Payment transfer failed");
        
        schedule.totalPayments++;
        lastPaymentTime[scheduleId] = block.timestamp;
        totalPaymentsMade++;
        
        emit PaymentExecuted(
            scheduleId,
            schedule.recipient,
            schedule.amount,
            schedule.totalPayments
        );
        
        // Check if we need to deactivate
        if (schedule.maxPayments > 0 && schedule.totalPayments >= schedule.maxPayments) {
            schedule.active = false;
        }
        if (schedule.endTime > 0 && block.timestamp >= schedule.endTime) {
            schedule.active = false;
        }
    }
    
    /**
     * @notice Batch execute multiple payments (gas optimization)
     * @param scheduleIds Array of schedule IDs to execute
     */
    function batchExecutePayments(bytes32[] memory scheduleIds) external {
        for (uint256 i = 0; i < scheduleIds.length; i++) {
            RecurringGiftSchedule storage schedule = schedules[scheduleIds[i]];
            if (schedule.active && _canExecutePayment(scheduleIds[i])) {
                _executePayment(scheduleIds[i]);
            }
        }
    }
    
    /**
     * @notice Cancel a recurring gift schedule
     * @param scheduleId Unique identifier for the schedule
     */
    function cancelRecurringGift(bytes32 scheduleId) 
        external 
        scheduleExists(scheduleId) 
    {
        RecurringGiftSchedule storage schedule = schedules[scheduleId];
        
        require(msg.sender == schedule.sender || msg.sender == owner, "Not authorized");
        require(schedule.active, "Schedule already cancelled");
        
        schedule.active = false;
        
        // Refund remaining balance to sender
        uint256 contractBalance = address(this).balance;
        if (contractBalance > 0) {
            // Calculate remaining payments
            uint256 remainingPayments = 0;
            if (schedule.maxPayments > 0) {
                remainingPayments = schedule.maxPayments - schedule.totalPayments;
            } else if (schedule.endTime > 0) {
                uint256 remainingTime = schedule.endTime - block.timestamp;
                remainingPayments = remainingTime / schedule.interval;
            }
            
            uint256 refundAmount = remainingPayments * schedule.amount;
            if (refundAmount > contractBalance) {
                refundAmount = contractBalance;
            }
            
            if (refundAmount > 0) {
                (bool success, ) = payable(schedule.sender).call{value: refundAmount}("");
                require(success, "Refund failed");
            }
        }
        
        emit RecurringGiftCancelled(scheduleId, schedule.sender);
    }
    
    /**
     * @notice Check if payment can be executed
     */
    function _canExecutePayment(bytes32 scheduleId) internal view returns (bool) {
        RecurringGiftSchedule memory schedule = schedules[scheduleId];
        
        if (!schedule.active) return false;
        if (block.timestamp < schedule.startTime) return false;
        if (schedule.endTime > 0 && block.timestamp > schedule.endTime) return false;
        if (schedule.maxPayments > 0 && schedule.totalPayments >= schedule.maxPayments) return false;
        
        uint256 lastPayment = lastPaymentTime[scheduleId];
        if (lastPayment == 0) {
            // First payment
            return block.timestamp >= schedule.startTime;
        } else {
            // Subsequent payments
            return block.timestamp >= lastPayment + schedule.interval;
        }
    }
    
    /**
     * @notice Get schedule details
     */
    function getSchedule(bytes32 scheduleId) 
        external 
        view 
        returns (RecurringGiftSchedule memory) 
    {
        return schedules[scheduleId];
    }
    
    /**
     * @notice Get next payment time
     */
    function getNextPaymentTime(bytes32 scheduleId) 
        external 
        view 
        returns (uint256) 
    {
        RecurringGiftSchedule memory schedule = schedules[scheduleId];
        
        if (!schedule.active) return 0;
        
        uint256 lastPayment = lastPaymentTime[scheduleId];
        if (lastPayment == 0) {
            return schedule.startTime;
        } else {
            return lastPayment + schedule.interval;
        }
    }
    
    /**
     * @notice Check if payment is due
     */
    function isPaymentDue(bytes32 scheduleId) external view returns (bool) {
        return _canExecutePayment(scheduleId);
    }
    
    /**
     * @notice Fund a recurring gift schedule (add more funds for future payments)
     * @param scheduleId Unique identifier for the schedule
     */
    function fundSchedule(bytes32 scheduleId) 
        external 
        payable 
        scheduleExists(scheduleId) 
    {
        RecurringGiftSchedule storage schedule = schedules[scheduleId];
        require(msg.sender == schedule.sender, "Not the schedule sender");
        require(schedule.active, "Schedule not active");
        require(msg.value > 0, "Must send funds");
        
        // Funds are stored in contract balance, will be used for future payments
    }
}

