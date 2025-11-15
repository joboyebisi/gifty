/**
 * Smart Contract API Endpoints
 * Integrates with deployed contracts on Arc Testnet
 */

import express from "express";
import { ContractClient } from "./blockchain/contracts";
import { createHash } from "node:crypto";
import { createGift, getGiftByClaimCode } from "./gifts/gifts";
import { getSupabase } from "./db/supabase";

const router = express.Router();
const contractClient = new ContractClient();

/**
 * Create gift escrow on-chain
 * POST /api/smart-contracts/gift/create
 */
router.post("/gift/create", async (req: any, res: any) => {
  try {
    const {
      recipientAddress,
      claimCode,
      amountUsdc,
      unlockTime,
      expirationTime,
      secret,
      conditionType,
      triggerValue,
      message,
    } = req.body;

    if (!recipientAddress || !claimCode || !amountUsdc) {
      return res.status(400).json({ error: "recipientAddress, claimCode, and amountUsdc required" });
    }

    // Generate secret hash if secret provided
    const secretHash = secret 
      ? createHash("sha256").update(secret).digest("hex")
      : undefined;

    // Create gift in database first
    const gift = await createGift({
      recipientHandle: undefined,
      recipientEmail: undefined,
      amountUsdc: (parseFloat(amountUsdc) * 1000000).toString(), // Convert to smallest unit
      srcChain: "arc-testnet",
      dstChain: "arc-testnet",
      message,
      expiresInDays: expirationTime ? Math.ceil((expirationTime - Date.now()) / (1000 * 60 * 60 * 24)) : 90,
      senderWalletAddress: req.body.senderWalletAddress,
    });

    // Generate transaction data for on-chain escrow creation
    const txData = await contractClient.createGiftEscrow({
      recipient: recipientAddress as `0x${string}`,
      claimCode: gift.claimCode,
      amount: amountUsdc,
      unlockTime: unlockTime ? Math.floor(unlockTime / 1000) : undefined,
      expirationTime: expirationTime ? Math.floor(expirationTime / 1000) : undefined,
      secretHash,
      conditionType: conditionType || 0, // 0 = NONE
      triggerValue: triggerValue ? Math.floor(triggerValue / 1000) : undefined,
      message,
    });

    // Update gift with on-chain status
    const sb = getSupabase();
    if (sb) {
      await sb.from("gifts").update({
        on_chain_escrow: true,
        contract_address: contractClient.getContractAddresses().giftEscrow,
      }).eq("id", gift.id);
    }

    res.json({
      success: true,
      gift,
      transactionData: txData,
      contractAddress: contractClient.getContractAddresses().giftEscrow,
      message: "Gift created. Sign transaction to create escrow on-chain.",
    });
  } catch (err: any) {
    console.error("Error creating on-chain gift:", err);
    res.status(500).json({ error: err?.message || "Failed to create on-chain gift" });
  }
});

/**
 * Claim gift on-chain
 * POST /api/smart-contracts/gift/claim
 */
router.post("/gift/claim", async (req: any, res: any) => {
  try {
    const { claimCode, secret, walletAddress } = req.body;

    if (!claimCode || !walletAddress) {
      return res.status(400).json({ error: "claimCode and walletAddress required" });
    }

    // Verify gift exists in database
    const gift = await getGiftByClaimCode(claimCode, secret);
    if (!gift) {
      return res.status(404).json({ error: "Gift not found or invalid secret" });
    }

    // Check if can claim on-chain
    const canClaim = await contractClient.canClaimGift(claimCode);
    if (!canClaim) {
      return res.status(400).json({ error: "Gift cannot be claimed yet (condition not satisfied or expired)" });
    }

    // Generate transaction data for claiming
    const txData = await contractClient.claimGift(claimCode, secret);

    res.json({
      success: true,
      transactionData: txData,
      contractAddress: contractClient.getContractAddresses().giftEscrow,
      message: "Sign transaction to claim gift on-chain.",
    });
  } catch (err: any) {
    console.error("Error claiming on-chain gift:", err);
    res.status(500).json({ error: err?.message || "Failed to claim gift" });
  }
});

/**
 * Get gift status from on-chain contract
 * GET /api/smart-contracts/gift/status/:claimCode
 */
router.get("/gift/status/:claimCode", async (req: any, res: any) => {
  try {
    const { claimCode } = req.params;

    const giftDetails = await contractClient.getGiftDetails(claimCode);
    const canClaim = await contractClient.canClaimGift(claimCode);

    res.json({
      success: true,
      giftDetails,
      canClaim,
      contractAddress: contractClient.getContractAddresses().giftEscrow,
    });
  } catch (err: any) {
    console.error("Error getting gift status:", err);
    res.status(500).json({ error: err?.message || "Failed to get gift status" });
  }
});

/**
 * Create bulk gift on-chain
 * POST /api/smart-contracts/bulk-gift/create
 */
router.post("/bulk-gift/create", async (req: any, res: any) => {
  try {
    const {
      bulkGiftCode,
      recipients,
      amounts,
      claimCodes,
      threshold,
      deadline,
    } = req.body;

    if (!bulkGiftCode || !recipients || !amounts || !claimCodes) {
      return res.status(400).json({ 
        error: "bulkGiftCode, recipients, amounts, and claimCodes required" 
      });
    }

    if (recipients.length !== amounts.length || recipients.length !== claimCodes.length) {
      return res.status(400).json({ 
        error: "recipients, amounts, and claimCodes arrays must have same length" 
      });
    }

    const txData = await contractClient.createBulkGift({
      bulkGiftCode,
      recipients: recipients.map((r: string) => r as `0x${string}`),
      amounts,
      claimCodes,
      threshold: threshold || 0,
      deadline: deadline ? Math.floor(deadline / 1000) : undefined,
    });

    res.json({
      success: true,
      transactionData: txData,
      contractAddress: contractClient.getContractAddresses().bulkGift,
      message: "Sign transaction to create bulk gift escrow on-chain.",
    });
  } catch (err: any) {
    console.error("Error creating bulk gift:", err);
    res.status(500).json({ error: err?.message || "Failed to create bulk gift" });
  }
});

/**
 * Contribute to group gift
 * POST /api/smart-contracts/group-gift/contribute
 */
router.post("/group-gift/contribute", async (req: any, res: any) => {
  try {
    const { groupGiftId, amount } = req.body;

    if (!groupGiftId || !amount) {
      return res.status(400).json({ error: "groupGiftId and amount required" });
    }

    const txData = await contractClient.contributeToGroupGift(groupGiftId, amount);

    res.json({
      success: true,
      transactionData: txData,
      contractAddress: contractClient.getContractAddresses().groupGiftEscrow,
      message: "Sign transaction to contribute to group gift.",
    });
  } catch (err: any) {
    console.error("Error contributing to group gift:", err);
    res.status(500).json({ error: err?.message || "Failed to contribute" });
  }
});

/**
 * Create recurring gift
 * POST /api/smart-contracts/recurring-gift/create
 */
router.post("/recurring-gift/create", async (req: any, res: any) => {
  try {
    const {
      scheduleId,
      recipientAddress,
      amountUsdc,
      interval, // Seconds between payments
      startTime,
      endTime,
      maxPayments,
      message,
    } = req.body;

    if (!scheduleId || !recipientAddress || !amountUsdc || !interval || !startTime) {
      return res.status(400).json({ 
        error: "scheduleId, recipientAddress, amountUsdc, interval, and startTime required" 
      });
    }

    const txData = await contractClient.createRecurringGift({
      scheduleId,
      recipient: recipientAddress as `0x${string}`,
      amount: amountUsdc,
      interval,
      startTime: Math.floor(startTime / 1000), // Convert to Unix timestamp
      endTime: endTime ? Math.floor(endTime / 1000) : undefined,
      maxPayments,
      message,
    });

    res.json({
      success: true,
      transactionData: txData,
      contractAddress: contractClient.getContractAddresses().recurringGift,
      message: "Sign transaction to create recurring gift schedule.",
    });
  } catch (err: any) {
    console.error("Error creating recurring gift:", err);
    res.status(500).json({ error: err?.message || "Failed to create recurring gift" });
  }
});

/**
 * Create multi-signature gift proposal
 * POST /api/smart-contracts/multisig-gift/create
 */
router.post("/multisig-gift/create", async (req: any, res: any) => {
  try {
    const {
      proposalId,
      recipientAddress,
      amountUsdc,
      requiredSignatures,
      signers,
      deadline,
      message,
    } = req.body;

    if (!proposalId || !recipientAddress || !amountUsdc || !requiredSignatures || !signers) {
      return res.status(400).json({ 
        error: "proposalId, recipientAddress, amountUsdc, requiredSignatures, and signers required" 
      });
    }

    if (!Array.isArray(signers) || signers.length < requiredSignatures) {
      return res.status(400).json({ 
        error: "signers must be an array with at least requiredSignatures addresses" 
      });
    }

    const txData = await contractClient.createMultiSigGift({
      proposalId,
      recipient: recipientAddress as `0x${string}`,
      amount: amountUsdc,
      requiredSignatures,
      signers: signers.map((s: string) => s as `0x${string}`),
      deadline: deadline ? Math.floor(deadline / 1000) : undefined,
      message,
    });

    res.json({
      success: true,
      transactionData: txData,
      contractAddress: contractClient.getContractAddresses().multiSigGift,
      message: "Sign transaction to create multi-signature gift proposal.",
    });
  } catch (err: any) {
    console.error("Error creating multi-sig gift:", err);
    res.status(500).json({ error: err?.message || "Failed to create multi-sig gift" });
  }
});

/**
 * Get contract addresses
 * GET /api/smart-contracts/addresses
 */
router.get("/addresses", async (req: any, res: any) => {
  try {
    const addresses = contractClient.getContractAddresses();
    res.json({
      success: true,
      addresses,
      network: "Arc Testnet",
      chainId: 5042002,
    });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Failed to get addresses" });
  }
});

export default router;

