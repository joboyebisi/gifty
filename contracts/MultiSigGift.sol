// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title MultiSigGift
 * @notice Multi-signature gift approval for corporate/team gifts
 * @dev Demonstrates advanced access control and approval logic
 */
contract MultiSigGift {
    // ============ Structs ============
    
    struct MultiSigGiftProposal {
        address initiator;
        address recipient;
        uint256 amount;
        uint256 requiredSignatures; // Number of signatures required
        uint256 signatureCount;
        bool executed;
        bool cancelled;
        string message;
        uint256 deadline;
    }
    
    struct Signature {
        address signer;
        uint256 timestamp;
    }
    
    // ============ State Variables ============
    
    mapping(bytes32 => MultiSigGiftProposal) public proposals;
    mapping(bytes32 => mapping(address => bool)) public hasSigned; // proposalId => signer => signed
    mapping(bytes32 => Signature[]) public signatures; // proposalId => signatures
    
    address public owner;
    uint256 public totalProposals;
    
    // ============ Events ============
    
    event MultiSigGiftProposed(
        bytes32 indexed proposalId,
        address indexed initiator,
        address indexed recipient,
        uint256 amount,
        uint256 requiredSignatures
    );
    
    event SignatureAdded(
        bytes32 indexed proposalId,
        address indexed signer,
        uint256 signatureCount,
        uint256 requiredSignatures
    );
    
    event MultiSigGiftExecuted(
        bytes32 indexed proposalId,
        address indexed recipient,
        uint256 amount
    );
    
    event MultiSigGiftCancelled(
        bytes32 indexed proposalId,
        address indexed initiator
    );
    
    // ============ Modifiers ============
    
    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }
    
    modifier proposalExists(bytes32 proposalId) {
        require(proposals[proposalId].initiator != address(0), "Proposal does not exist");
        _;
    }
    
    // ============ Constructor ============
    
    constructor() {
        owner = msg.sender;
    }
    
    // ============ Core Functions ============
    
    /**
     * @notice Create a multi-signature gift proposal
     * @param proposalId Unique identifier for the proposal
     * @param recipient Address of the recipient
     * @param amount Amount to send
     * @param requiredSignatures Number of signatures required (e.g., 2 of 3)
     * @param signers Array of addresses that can sign
     * @param deadline Timestamp when proposal expires (0 = no deadline)
     * @param message Optional message
     */
    function createMultiSigGift(
        bytes32 proposalId,
        address recipient,
        uint256 amount,
        uint256 requiredSignatures,
        address[] memory signers,
        uint256 deadline,
        string memory message
    ) external payable {
        require(recipient != address(0), "Invalid recipient");
        require(amount > 0, "Amount must be greater than 0");
        require(msg.value >= amount, "Insufficient funds");
        require(requiredSignatures > 0, "Must require at least 1 signature");
        require(signers.length >= requiredSignatures, "Not enough signers");
        require(
            proposals[proposalId].initiator == address(0),
            "Proposal already exists"
        );
        require(
            deadline == 0 || deadline > block.timestamp,
            "Deadline must be in future"
        );
        
        proposals[proposalId] = MultiSigGiftProposal({
            initiator: msg.sender,
            recipient: recipient,
            amount: amount,
            requiredSignatures: requiredSignatures,
            signatureCount: 0,
            executed: false,
            cancelled: false,
            message: message,
            deadline: deadline
        });
        
        // Auto-sign by initiator if they're in signers list
        bool isInitiatorSigner = false;
        for (uint256 i = 0; i < signers.length; i++) {
            if (signers[i] == msg.sender) {
                isInitiatorSigner = true;
                break;
            }
        }
        
        if (isInitiatorSigner) {
            _addSignature(proposalId, msg.sender);
        }
        
        totalProposals++;
        
        emit MultiSigGiftProposed(
            proposalId,
            msg.sender,
            recipient,
            amount,
            requiredSignatures
        );
    }
    
    /**
     * @notice Sign a multi-signature gift proposal
     * @param proposalId Unique identifier for the proposal
     */
    function signProposal(bytes32 proposalId) 
        external 
        proposalExists(proposalId) 
    {
        MultiSigGiftProposal storage proposal = proposals[proposalId];
        
        require(!proposal.executed, "Proposal already executed");
        require(!proposal.cancelled, "Proposal cancelled");
        require(!hasSigned[proposalId][msg.sender], "Already signed");
        require(
            proposal.deadline == 0 || block.timestamp <= proposal.deadline,
            "Proposal expired"
        );
        
        _addSignature(proposalId, msg.sender);
        
        // Auto-execute if threshold reached
        if (proposal.signatureCount >= proposal.requiredSignatures && !proposal.executed) {
            _executeProposal(proposalId);
        }
    }
    
    /**
     * @notice Internal function to add signature
     */
    function _addSignature(bytes32 proposalId, address signer) internal {
        MultiSigGiftProposal storage proposal = proposals[proposalId];
        
        hasSigned[proposalId][signer] = true;
        proposal.signatureCount++;
        
        signatures[proposalId].push(Signature({
            signer: signer,
            timestamp: block.timestamp
        }));
        
        emit SignatureAdded(
            proposalId,
            signer,
            proposal.signatureCount,
            proposal.requiredSignatures
        );
    }
    
    /**
     * @notice Execute multi-signature gift when threshold reached
     * @param proposalId Unique identifier for the proposal
     */
    function executeProposal(bytes32 proposalId) 
        external 
        proposalExists(proposalId) 
    {
        MultiSigGiftProposal storage proposal = proposals[proposalId];
        
        require(!proposal.executed, "Proposal already executed");
        require(!proposal.cancelled, "Proposal cancelled");
        require(
            proposal.signatureCount >= proposal.requiredSignatures,
            "Not enough signatures"
        );
        
        _executeProposal(proposalId);
    }
    
    /**
     * @notice Internal function to execute proposal
     */
    function _executeProposal(bytes32 proposalId) internal {
        MultiSigGiftProposal storage proposal = proposals[proposalId];
        
        proposal.executed = true;
        
        // Transfer funds
        (bool success, ) = payable(proposal.recipient).call{value: proposal.amount}("");
        require(success, "Transfer failed");
        
        emit MultiSigGiftExecuted(
            proposalId,
            proposal.recipient,
            proposal.amount
        );
    }
    
    /**
     * @notice Cancel a multi-signature gift proposal
     * @param proposalId Unique identifier for the proposal
     */
    function cancelProposal(bytes32 proposalId) 
        external 
        proposalExists(proposalId) 
    {
        MultiSigGiftProposal storage proposal = proposals[proposalId];
        
        require(
            msg.sender == proposal.initiator || msg.sender == owner,
            "Not authorized"
        );
        require(!proposal.executed, "Proposal already executed");
        require(!proposal.cancelled, "Proposal already cancelled");
        
        proposal.cancelled = true;
        
        // Refund to initiator
        (bool success, ) = payable(proposal.initiator).call{value: proposal.amount}("");
        require(success, "Refund failed");
        
        emit MultiSigGiftCancelled(proposalId, proposal.initiator);
    }
    
    /**
     * @notice Get proposal details
     */
    function getProposal(bytes32 proposalId) 
        external 
        view 
        returns (MultiSigGiftProposal memory) 
    {
        return proposals[proposalId];
    }
    
    /**
     * @notice Get signature count
     */
    function getSignatureCount(bytes32 proposalId) 
        external 
        view 
        returns (uint256) 
    {
        return proposals[proposalId].signatureCount;
    }
    
    /**
     * @notice Check if address has signed
     */
    function hasAddressSigned(bytes32 proposalId, address signer) 
        external 
        view 
        returns (bool) 
    {
        return hasSigned[proposalId][signer];
    }
    
    /**
     * @notice Get all signatures for a proposal
     */
    function getSignatures(bytes32 proposalId) 
        external 
        view 
        returns (Signature[] memory) 
    {
        return signatures[proposalId];
    }
}

