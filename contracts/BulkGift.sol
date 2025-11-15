// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title BulkGift
 * @notice Batch processing contract for bulk gifts (team gifts, hackathon winners, etc.)
 * @dev Demonstrates advanced programmable logic for batch operations
 */
contract BulkGift {
    // ============ Structs ============
    
    struct BulkGiftCampaign {
        address sender;
        bytes32 bulkGiftCode;
        uint256 totalAmount;
        uint256 totalRecipients;
        uint256 claimedCount;
        uint256 threshold; // Percentage (e.g., 80 = 80%)
        uint256 deadline;
        bool active;
        bool thresholdReached;
    }
    
    struct Recipient {
        address recipient;
        uint256 amount;
        bytes32 claimCode;
        bool claimed;
    }
    
    // ============ State Variables ============
    
    mapping(bytes32 => BulkGiftCampaign) public campaigns;
    mapping(bytes32 => Recipient[]) public recipients; // bulkGiftCode => Recipients
    mapping(bytes32 => mapping(bytes32 => bool)) public claimCodeExists; // bulkGiftCode => claimCode => exists
    
    address public owner;
    uint256 public totalCampaigns;
    
    // ============ Events ============
    
    event BulkGiftCreated(
        bytes32 indexed bulkGiftCode,
        address indexed sender,
        uint256 totalAmount,
        uint256 recipientCount,
        uint256 threshold
    );
    
    event BulkGiftClaimed(
        bytes32 indexed bulkGiftCode,
        bytes32 indexed claimCode,
        address indexed recipient,
        uint256 amount
    );
    
    event ThresholdReached(
        bytes32 indexed bulkGiftCode,
        uint256 claimedCount,
        uint256 totalRecipients
    );
    
    event BulkGiftRefunded(
        bytes32 indexed bulkGiftCode,
        address indexed sender,
        uint256 refundedAmount
    );
    
    // ============ Modifiers ============
    
    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }
    
    modifier campaignExists(bytes32 bulkGiftCode) {
        require(campaigns[bulkGiftCode].sender != address(0), "Campaign does not exist");
        _;
    }
    
    // ============ Constructor ============
    
    constructor() {
        owner = msg.sender;
    }
    
    // ============ Core Functions ============
    
    /**
     * @notice Create a bulk gift campaign with batch escrow
     * @param bulkGiftCode Unique code for the bulk gift campaign
     * @param recipientAddresses Array of recipient addresses
     * @param amounts Array of amounts (must match recipients length)
     * @param claimCodes Array of unique claim codes for each recipient
     * @param threshold Percentage threshold for auto-release (0-100, 0 = no threshold)
     * @param deadline Timestamp when campaign expires (0 = never expires)
     */
    function createBulkGift(
        bytes32 bulkGiftCode,
        address[] memory recipientAddresses,
        uint256[] memory amounts,
        bytes32[] memory claimCodes,
        uint256 threshold,
        uint256 deadline
    ) external payable {
        require(recipientAddresses.length > 0, "No recipients");
        require(
            recipientAddresses.length == amounts.length,
            "Recipients and amounts length mismatch"
        );
        require(
            recipientAddresses.length == claimCodes.length,
            "Recipients and claim codes length mismatch"
        );
        require(campaigns[bulkGiftCode].sender == address(0), "Campaign already exists");
        require(threshold <= 100, "Threshold must be <= 100");
        
        // Calculate total amount
        uint256 totalAmount = 0;
        for (uint256 i = 0; i < amounts.length; i++) {
            totalAmount += amounts[i];
        }
        
        require(msg.value >= totalAmount, "Insufficient funds");
        
        // Create campaign
        campaigns[bulkGiftCode] = BulkGiftCampaign({
            sender: msg.sender,
            bulkGiftCode: bulkGiftCode,
            totalAmount: totalAmount,
            totalRecipients: recipientAddresses.length,
            claimedCount: 0,
            threshold: threshold,
            deadline: deadline,
            active: true,
            thresholdReached: false
        });
        
        // Create recipients
        for (uint256 i = 0; i < recipientAddresses.length; i++) {
            require(recipientAddresses[i] != address(0), "Invalid recipient");
            require(amounts[i] > 0, "Amount must be greater than 0");
            require(!claimCodeExists[bulkGiftCode][claimCodes[i]], "Duplicate claim code");
            
            recipients[bulkGiftCode].push(Recipient({
                recipient: recipientAddresses[i],
                amount: amounts[i],
                claimCode: claimCodes[i],
                claimed: false
            }));
            
            claimCodeExists[bulkGiftCode][claimCodes[i]] = true;
        }
        
        totalCampaigns++;
        
        emit BulkGiftCreated(
            bulkGiftCode,
            msg.sender,
            totalAmount,
            recipientAddresses.length,
            threshold
        );
    }
    
    /**
     * @notice Claim individual gift from bulk campaign
     * @param bulkGiftCode Bulk gift campaign code
     * @param claimCode Individual claim code
     */
    function claimBulkGift(bytes32 bulkGiftCode, bytes32 claimCode) 
        external 
        campaignExists(bulkGiftCode) 
    {
        BulkGiftCampaign storage campaign = campaigns[bulkGiftCode];
        
        require(campaign.active, "Campaign not active");
        require(
            campaign.deadline == 0 || block.timestamp <= campaign.deadline,
            "Campaign expired"
        );
        
        // Find recipient
        Recipient[] storage recipientList = recipients[bulkGiftCode];
        uint256 recipientIndex = type(uint256).max;
        
        for (uint256 i = 0; i < recipientList.length; i++) {
            if (recipientList[i].claimCode == claimCode) {
                recipientIndex = i;
                break;
            }
        }
        
        require(recipientIndex != type(uint256).max, "Claim code not found");
        require(!recipientList[recipientIndex].claimed, "Already claimed");
        require(
            msg.sender == recipientList[recipientIndex].recipient,
            "Not the recipient"
        );
        
        // Mark as claimed
        recipientList[recipientIndex].claimed = true;
        campaign.claimedCount++;
        
        // Transfer funds
        uint256 amount = recipientList[recipientIndex].amount;
        (bool success, ) = payable(msg.sender).call{value: amount}("");
        require(success, "Transfer failed");
        
        emit BulkGiftClaimed(
            bulkGiftCode,
            claimCode,
            msg.sender,
            amount
        );
        
        // Check threshold
        if (campaign.threshold > 0 && !campaign.thresholdReached) {
            uint256 claimedPercentage = (campaign.claimedCount * 100) / campaign.totalRecipients;
            
            if (claimedPercentage >= campaign.threshold) {
                campaign.thresholdReached = true;
                _releaseRemaining(bulkGiftCode);
                
                emit ThresholdReached(
                    bulkGiftCode,
                    campaign.claimedCount,
                    campaign.totalRecipients
                );
            }
        }
    }
    
    /**
     * @notice Release remaining unclaimed gifts when threshold reached
     */
    function _releaseRemaining(bytes32 bulkGiftCode) internal {
        BulkGiftCampaign storage campaign = campaigns[bulkGiftCode];
        Recipient[] storage recipientList = recipients[bulkGiftCode];
        
        // Release all remaining unclaimed gifts
        for (uint256 i = 0; i < recipientList.length; i++) {
            if (!recipientList[i].claimed) {
                recipientList[i].claimed = true;
                campaign.claimedCount++;
                
                (bool success, ) = payable(recipientList[i].recipient).call{
                    value: recipientList[i].amount
                }("");
                require(success, "Release transfer failed");
            }
        }
    }
    
    /**
     * @notice Refund unclaimed gifts after deadline
     * @param bulkGiftCode Bulk gift campaign code
     */
    function refundBulkGift(bytes32 bulkGiftCode) 
        external 
        campaignExists(bulkGiftCode) 
    {
        BulkGiftCampaign storage campaign = campaigns[bulkGiftCode];
        
        require(campaign.active, "Campaign not active");
        require(
            campaign.deadline > 0 && block.timestamp > campaign.deadline,
            "Campaign not expired"
        );
        
        campaign.active = false;
        
        // Calculate unclaimed amount
        uint256 unclaimedAmount = 0;
        Recipient[] storage recipientList = recipients[bulkGiftCode];
        
        for (uint256 i = 0; i < recipientList.length; i++) {
            if (!recipientList[i].claimed) {
                unclaimedAmount += recipientList[i].amount;
            }
        }
        
        // Refund to sender
        if (unclaimedAmount > 0) {
            (bool success, ) = payable(campaign.sender).call{value: unclaimedAmount}("");
            require(success, "Refund transfer failed");
        }
        
        emit BulkGiftRefunded(bulkGiftCode, campaign.sender, unclaimedAmount);
    }
    
    /**
     * @notice Get campaign details
     */
    function getCampaign(bytes32 bulkGiftCode) 
        external 
        view 
        returns (BulkGiftCampaign memory) 
    {
        return campaigns[bulkGiftCode];
    }
    
    /**
     * @notice Get recipient count for campaign
     */
    function getRecipientCount(bytes32 bulkGiftCode) external view returns (uint256) {
        return recipients[bulkGiftCode].length;
    }
    
    /**
     * @notice Get recipient by index
     */
    function getRecipient(bytes32 bulkGiftCode, uint256 index) 
        external 
        view 
        returns (Recipient memory) 
    {
        return recipients[bulkGiftCode][index];
    }
    
    /**
     * @notice Get claim status
     */
    function getClaimStatus(bytes32 bulkGiftCode) 
        external 
        view 
        returns (
            uint256 claimedCount,
            uint256 totalRecipients,
            uint256 claimedPercentage,
            bool thresholdReached
        ) 
    {
        BulkGiftCampaign memory campaign = campaigns[bulkGiftCode];
        claimedCount = campaign.claimedCount;
        totalRecipients = campaign.totalRecipients;
        claimedPercentage = (claimedCount * 100) / totalRecipients;
        thresholdReached = campaign.thresholdReached;
    }
}

