const { expect } = require("chai");
const { ethers } = require("hardhat");

/**
 * Integration tests for programmable gift features
 * Tests interactions between multiple contracts and complex scenarios
 */
describe("Programmable Gifts Integration", function () {
  let giftEscrow, bulkGift, groupGiftEscrow, conditionalRelease, recurringGift, multiSigGift;
  let owner, sender, recipient1, recipient2, recipient3, signer1, signer2;
  
  beforeEach(async function () {
    [owner, sender, recipient1, recipient2, recipient3, signer1, signer2] = await ethers.getSigners();
    
    // Deploy all contracts
    const GiftEscrow = await ethers.getContractFactory("GiftEscrow");
    giftEscrow = await GiftEscrow.deploy();
    await giftEscrow.waitForDeployment();
    
    const BulkGift = await ethers.getContractFactory("BulkGift");
    bulkGift = await BulkGift.deploy();
    await bulkGift.waitForDeployment();
    
    const GroupGiftEscrow = await ethers.getContractFactory("GroupGiftEscrow");
    groupGiftEscrow = await GroupGiftEscrow.deploy();
    await groupGiftEscrow.waitForDeployment();
    
    const ConditionalRelease = await ethers.getContractFactory("ConditionalRelease");
    conditionalRelease = await ConditionalRelease.deploy();
    await conditionalRelease.waitForDeployment();
    
    const RecurringGift = await ethers.getContractFactory("RecurringGift");
    recurringGift = await RecurringGift.deploy();
    await recurringGift.waitForDeployment();
    
    const MultiSigGift = await ethers.getContractFactory("MultiSigGift");
    multiSigGift = await MultiSigGift.deploy();
    await multiSigGift.waitForDeployment();
  });
  
  describe("Complex Gift Scenarios", function () {
    it("Should handle birthday gift with secret code", async function () {
      const claimCode = ethers.id("birthday-secret");
      const amount = ethers.parseEther("100.0");
      const secret = "HAPPY_BIRTHDAY_2025";
      const secretHash = ethers.keccak256(ethers.toUtf8Bytes(secret));
      const birthdayTimestamp = Math.floor(Date.now() / 1000) + 86400; // Tomorrow
      
      // Create birthday gift
      await giftEscrow.createGift(
        recipient1.address,
        claimCode,
        birthdayTimestamp,
        0,
        secretHash,
        1, // TIME_LOCKED
        birthdayTimestamp,
        "Happy Birthday!",
        { value: amount }
      );
      
      // Verify gift exists
      const gift = await giftEscrow.getGift(claimCode);
      expect(gift.amount).to.equal(amount);
      expect(gift.secretHash).to.equal(secretHash);
      
      // Verify cannot claim before birthday
      const canClaim = await giftEscrow.canClaim(claimCode);
      expect(canClaim).to.be.false;
    });
    
    it("Should handle bulk gift with threshold release", async function () {
      const bulkGiftCode = ethers.id("bulk-threshold");
      const recipients = [recipient1.address, recipient2.address, recipient3.address];
      const amounts = [
        ethers.parseEther("10.0"),
        ethers.parseEther("20.0"),
        ethers.parseEther("30.0")
      ];
      const claimCodes = [
        ethers.id("claim1"),
        ethers.id("claim2"),
        ethers.id("claim3")
      ];
      const threshold = 80; // Release when 80% claimed
      const totalAmount = amounts.reduce((a, b) => a + b, ethers.parseEther("0"));
      
      // Create bulk gift
      await bulkGift.createBulkGift(
        bulkGiftCode,
        recipients,
        amounts,
        claimCodes,
        threshold,
        0,
        { value: totalAmount }
      );
      
      // Claim first two (66% - below threshold)
      await bulkGift.connect(recipient1).claimBulkGift(bulkGiftCode, claimCodes[0]);
      await bulkGift.connect(recipient2).claimBulkGift(bulkGiftCode, claimCodes[1]);
      
      // Claim third (100% - threshold reached)
      await expect(
        bulkGift.connect(recipient3).claimBulkGift(bulkGiftCode, claimCodes[2])
      ).to.emit(bulkGift, "ThresholdReached");
    });
    
    it("Should handle group gift coordination", async function () {
      const groupGiftId = ethers.id("group-coordination");
      const targetAmount = ethers.parseEther("100.0");
      const contribution1 = ethers.parseEther("40.0");
      const contribution2 = ethers.parseEther("60.0");
      
      // Create group gift
      await groupGiftEscrow.createGroupGift(
        groupGiftId,
        recipient1.address,
        targetAmount,
        0
      );
      
      // First contribution
      await groupGiftEscrow.connect(signer1).contribute(groupGiftId, { value: contribution1 });
      
      // Second contribution (reaches threshold)
      await expect(
        groupGiftEscrow.connect(signer2).contribute(groupGiftId, { value: contribution2 })
      ).to.emit(groupGiftEscrow, "ThresholdReached");
      
      const gift = await groupGiftEscrow.getGroupGift(groupGiftId);
      expect(gift.distributed).to.be.true;
    });
    
    it("Should handle recurring gift with max payments", async function () {
      const scheduleId = ethers.id("recurring-max");
      const amount = ethers.parseEther("10.0");
      const interval = 86400; // Daily
      const startTime = Math.floor(Date.now() / 1000) - 86400; // Started yesterday
      const maxPayments = 3;
      
      // Create recurring gift
      await recurringGift.createRecurringGift(
        scheduleId,
        recipient1.address,
        amount,
        interval,
        startTime,
        0,
        maxPayments,
        "Daily allowance",
        { value: ethers.parseEther("50.0") } // Fund for multiple payments
      );
      
      const schedule = await recurringGift.getSchedule(scheduleId);
      expect(schedule.maxPayments).to.equal(maxPayments);
      expect(schedule.active).to.be.true;
    });
    
    it("Should handle multi-sig gift with auto-execution", async function () {
      const proposalId = ethers.id("multisig-auto");
      const amount = ethers.parseEther("50.0");
      const requiredSignatures = 2;
      const signers = [signer1.address, signer2.address];
      
      // Create multi-sig proposal
      await multiSigGift.createMultiSigGift(
        proposalId,
        recipient1.address,
        amount,
        requiredSignatures,
        signers,
        0,
        "Team gift",
        { value: amount }
      );
      
      // First signature
      await multiSigGift.connect(signer1).signProposal(proposalId);
      
      // Second signature (auto-executes)
      await expect(
        multiSigGift.connect(signer2).signProposal(proposalId)
      ).to.emit(multiSigGift, "MultiSigGiftExecuted");
      
      const proposal = await multiSigGift.getProposal(proposalId);
      expect(proposal.executed).to.be.true;
    });
  });
  
  describe("Gas Optimization", function () {
    it("Should batch process multiple gifts efficiently", async function () {
      // Create multiple gifts in sequence
      const giftCount = 5;
      const amount = ethers.parseEther("1.0");
      
      for (let i = 0; i < giftCount; i++) {
        const claimCode = ethers.id(`batch-gift-${i}`);
        await giftEscrow.createGift(
          recipient1.address,
          claimCode,
          0,
          0,
          ethers.ZeroHash,
          0,
          0,
          `Gift ${i}`,
          { value: amount }
        );
      }
      
      const totalGifts = await giftEscrow.totalGifts();
      expect(totalGifts).to.equal(giftCount);
    });
  });
  
  describe("Error Handling", function () {
    it("Should prevent double claiming", async function () {
      const claimCode = ethers.id("double-claim");
      const amount = ethers.parseEther("10.0");
      
      await giftEscrow.createGift(
        recipient1.address,
        claimCode,
        0,
        0,
        ethers.ZeroHash,
        0,
        0,
        "Test",
        { value: amount }
      );
      
      // First claim should succeed
      await giftEscrow.connect(recipient1).claimGift(claimCode, "");
      
      // Second claim should fail
      await expect(
        giftEscrow.connect(recipient1).claimGift(claimCode, "")
      ).to.be.revertedWith("Gift already claimed");
    });
    
    it("Should prevent unauthorized access", async function () {
      const claimCode = ethers.id("unauthorized");
      const amount = ethers.parseEther("10.0");
      
      await giftEscrow.createGift(
        recipient1.address,
        claimCode,
        0,
        0,
        ethers.ZeroHash,
        0,
        0,
        "Test",
        { value: amount }
      );
      
      // Wrong recipient should fail
      await expect(
        giftEscrow.connect(recipient2).claimGift(claimCode, "")
      ).to.be.revertedWith("Not the recipient");
    });
  });
});

