/**
 * Smart Contract Integration
 * Interfaces for interacting with deployed contracts on Arc Testnet
 */

import { createPublicClient, http, createWalletClient, custom, parseEther, encodeFunctionData, Address } from "viem";
import { arcTestnet } from "viem/chains";
import { loadEnv } from "../config/env";
import { ARC_TESTNET } from "../config/arc";

// Contract ABIs (simplified - full ABIs would be generated from compilation)
const GIFT_ESCROW_ABI = [
  {
    inputs: [
      { name: "recipient", type: "address" },
      { name: "claimCode", type: "bytes32" },
      { name: "unlockTime", type: "uint256" },
      { name: "expirationTime", type: "uint256" },
      { name: "secretHash", type: "bytes32" },
      { name: "conditionType", type: "uint8" },
      { name: "triggerValue", type: "uint256" },
      { name: "message", type: "string" },
    ],
    name: "createGift",
    outputs: [],
    stateMutability: "payable",
    type: "function",
  },
  {
    inputs: [
      { name: "claimCode", type: "bytes32" },
      { name: "secret", type: "string" },
    ],
    name: "claimGift",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ name: "claimCode", type: "bytes32" }],
    name: "getGift",
    outputs: [
      {
        components: [
          { name: "sender", type: "address" },
          { name: "recipient", type: "address" },
          { name: "amount", type: "uint256" },
          { name: "unlockTime", type: "uint256" },
          { name: "expirationTime", type: "uint256" },
          { name: "secretHash", type: "bytes32" },
          { name: "claimed", type: "bool" },
          { name: "refunded", type: "bool" },
          { name: "message", type: "string" },
        ],
        name: "",
        type: "tuple",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ name: "claimCode", type: "bytes32" }],
    name: "canClaim",
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

const BULK_GIFT_ABI = [
  {
    inputs: [
      { name: "bulkGiftCode", type: "bytes32" },
      { name: "recipientAddresses", type: "address[]" },
      { name: "amounts", type: "uint256[]" },
      { name: "claimCodes", type: "bytes32[]" },
      { name: "threshold", type: "uint256" },
      { name: "deadline", type: "uint256" },
    ],
    name: "createBulkGift",
    outputs: [],
    stateMutability: "payable",
    type: "function",
  },
  {
    inputs: [
      { name: "bulkGiftCode", type: "bytes32" },
      { name: "claimCode", type: "bytes32" },
    ],
    name: "claimBulkGift",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;

const GROUP_GIFT_ABI = [
  {
    inputs: [
      { name: "groupGiftId", type: "bytes32" },
      { name: "recipient", type: "address" },
      { name: "targetAmount", type: "uint256" },
      { name: "deadline", type: "uint256" },
    ],
    name: "createGroupGift",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ name: "groupGiftId", type: "bytes32" }],
    name: "contribute",
    outputs: [],
    stateMutability: "payable",
    type: "function",
  },
] as const;

const CONDITIONAL_RELEASE_ABI = [
  {
    inputs: [
      { name: "giftId", type: "bytes32" },
      { name: "recipient", type: "address" },
      { name: "condition", type: "uint8" },
      { name: "triggerValue", type: "uint256" },
      { name: "message", type: "string" },
    ],
    name: "createConditionalGift",
    outputs: [],
    stateMutability: "payable",
    type: "function",
  },
  {
    inputs: [{ name: "giftId", type: "bytes32" }],
    name: "releaseGift",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;

export interface ContractAddresses {
  giftEscrow: Address;
  bulkGift: Address;
  groupGiftEscrow: Address;
  conditionalRelease: Address;
  recurringGift: Address;
  multiSigGift: Address;
}

export class ContractClient {
  private publicClient: any;
  private contractAddresses: ContractAddresses;

  constructor() {
    const env = loadEnv();
    const rpcUrl = env.ARC_TESTNET_RPC_URL || ARC_TESTNET.rpcUrl;

    this.publicClient = createPublicClient({
      chain: {
        ...arcTestnet,
        rpcUrls: {
          default: { http: [rpcUrl] },
        },
      },
      transport: http(rpcUrl),
    });

    // Contract addresses (will be set after deployment)
    this.contractAddresses = {
      giftEscrow: (env.GIFT_ESCROW_ADDRESS as Address) || "0x0000000000000000000000000000000000000000",
      bulkGift: (env.BULK_GIFT_ADDRESS as Address) || "0x0000000000000000000000000000000000000000",
      groupGiftEscrow: (env.GROUP_GIFT_ESCROW_ADDRESS as Address) || "0x0000000000000000000000000000000000000000",
      conditionalRelease: (env.CONDITIONAL_RELEASE_ADDRESS as Address) || "0x0000000000000000000000000000000000000000",
      recurringGift: (env.RECURRING_GIFT_ADDRESS as Address) || "0x0000000000000000000000000000000000000000",
      multiSigGift: (env.MULTISIG_GIFT_ADDRESS as Address) || "0x0000000000000000000000000000000000000000",
    };
  }

  /**
   * Create a gift escrow on-chain
   */
  async createGiftEscrow(params: {
    recipient: Address;
    claimCode: string;
    amount: string; // Amount in USDC (will be converted to wei)
    unlockTime?: number;
    expirationTime?: number;
    secretHash?: string;
    conditionType?: number;
    triggerValue?: number;
    message?: string;
  }): Promise<string> {
    const claimCodeBytes = this.stringToBytes32(params.claimCode);
    const amountWei = parseEther(params.amount);
    const secretHash = params.secretHash 
      ? (params.secretHash as Address)
      : "0x0000000000000000000000000000000000000000000000000000000000000000" as Address;

    const data = encodeFunctionData({
      abi: GIFT_ESCROW_ABI,
      functionName: "createGift",
      args: [
        params.recipient,
        claimCodeBytes,
        BigInt(params.unlockTime || 0),
        BigInt(params.expirationTime || 0),
        secretHash,
        params.conditionType || 0,
        BigInt(params.triggerValue || 0),
        params.message || "",
      ],
    });

    return data;
  }

  /**
   * Claim a gift on-chain
   */
  async claimGift(claimCode: string, secret?: string): Promise<string> {
    const claimCodeBytes = this.stringToBytes32(claimCode);
    
    const data = encodeFunctionData({
      abi: GIFT_ESCROW_ABI,
      functionName: "claimGift",
      args: [claimCodeBytes, secret || ""],
    });

    return data;
  }

  /**
   * Check if gift can be claimed
   */
  async canClaimGift(claimCode: string): Promise<boolean> {
    const claimCodeBytes = this.stringToBytes32(claimCode);
    
    try {
      const result = await this.publicClient.readContract({
        address: this.contractAddresses.giftEscrow,
        abi: GIFT_ESCROW_ABI,
        functionName: "canClaim",
        args: [claimCodeBytes],
      });
      
      return result as boolean;
    } catch (error) {
      console.error("Error checking claim status:", error);
      return false;
    }
  }

  /**
   * Get gift details from contract
   */
  async getGiftDetails(claimCode: string): Promise<any> {
    const claimCodeBytes = this.stringToBytes32(claimCode);
    
    try {
      const result = await this.publicClient.readContract({
        address: this.contractAddresses.giftEscrow,
        abi: GIFT_ESCROW_ABI,
        functionName: "getGift",
        args: [claimCodeBytes],
      });
      
      return result;
    } catch (error) {
      console.error("Error getting gift details:", error);
      return null;
    }
  }

  /**
   * Create bulk gift on-chain
   */
  async createBulkGift(params: {
    bulkGiftCode: string;
    recipients: Address[];
    amounts: string[];
    claimCodes: string[];
    threshold: number;
    deadline?: number;
  }): Promise<string> {
    const bulkGiftCodeBytes = this.stringToBytes32(params.bulkGiftCode);
    const claimCodesBytes = params.claimCodes.map(code => this.stringToBytes32(code));
    const amountsWei = params.amounts.map(amount => parseEther(amount));

    const data = encodeFunctionData({
      abi: BULK_GIFT_ABI,
      functionName: "createBulkGift",
      args: [
        bulkGiftCodeBytes,
        params.recipients,
        amountsWei,
        claimCodesBytes,
        BigInt(params.threshold),
        BigInt(params.deadline || 0),
      ],
    });

    return data;
  }

  /**
   * Contribute to group gift
   */
  async contributeToGroupGift(groupGiftId: string, amount: string): Promise<string> {
    const groupGiftIdBytes = this.stringToBytes32(groupGiftId);
    const amountWei = parseEther(amount);

    const data = encodeFunctionData({
      abi: GROUP_GIFT_ABI,
      functionName: "contribute",
      args: [groupGiftIdBytes],
    });

    return data;
  }

  /**
   * Helper: Convert string to bytes32
   */
  private stringToBytes32(str: string): `0x${string}` {
    // Pad or hash string to bytes32
    const hash = require("crypto").createHash("sha256").update(str).digest("hex");
    return `0x${hash}` as `0x${string}`;
  }

  /**
   * Create recurring gift schedule
   */
  async createRecurringGift(params: {
    scheduleId: string;
    recipient: Address;
    amount: string;
    interval: number;
    startTime: number;
    endTime?: number;
    maxPayments?: number;
    message?: string;
  }): Promise<string> {
    const scheduleIdBytes = this.stringToBytes32(params.scheduleId);
    const amountWei = parseEther(params.amount);

    const data = encodeFunctionData({
      abi: [
        {
          inputs: [
            { name: "scheduleId", type: "bytes32" },
            { name: "recipient", type: "address" },
            { name: "amount", type: "uint256" },
            { name: "interval", type: "uint256" },
            { name: "startTime", type: "uint256" },
            { name: "endTime", type: "uint256" },
            { name: "maxPayments", type: "uint256" },
            { name: "message", type: "string" },
          ],
          name: "createSchedule",
          outputs: [],
          stateMutability: "payable",
          type: "function",
        },
      ],
      functionName: "createSchedule",
      args: [
        scheduleIdBytes,
        params.recipient,
        amountWei,
        BigInt(params.interval),
        BigInt(params.startTime),
        BigInt(params.endTime || 0),
        BigInt(params.maxPayments || 0),
        params.message || "",
      ],
    });

    return data;
  }

  /**
   * Create multi-signature gift proposal
   */
  async createMultiSigGift(params: {
    proposalId: string;
    recipient: Address;
    amount: string;
    requiredSignatures: number;
    signers: Address[];
    deadline?: number;
    message?: string;
  }): Promise<string> {
    const proposalIdBytes = this.stringToBytes32(params.proposalId);
    const amountWei = parseEther(params.amount);

    const data = encodeFunctionData({
      abi: [
        {
          inputs: [
            { name: "proposalId", type: "bytes32" },
            { name: "recipient", type: "address" },
            { name: "amount", type: "uint256" },
            { name: "requiredSignatures", type: "uint256" },
            { name: "_signers", type: "address[]" },
            { name: "deadline", type: "uint256" },
            { name: "message", type: "string" },
          ],
          name: "createProposal",
          outputs: [],
          stateMutability: "payable",
          type: "function",
        },
      ],
      functionName: "createProposal",
      args: [
        proposalIdBytes,
        params.recipient,
        amountWei,
        BigInt(params.requiredSignatures),
        params.signers,
        BigInt(params.deadline || 0),
        params.message || "",
      ],
    });

    return data;
  }

  /**
   * Get contract addresses
   */
  getContractAddresses(): ContractAddresses {
    return this.contractAddresses;
  }
}

