const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("GiftEscrow", function () {
  let giftEscrow;
  let owner, sender, recipient;
  
  beforeEach(async function () {
    [owner, sender, recipient] = await ethers.getSigners();
    
    const GiftEscrow = await ethers.getContractFactory("GiftEscrow");
    giftEscrow = await GiftEscrow.deploy();
    await giftEscrow.waitForDeployment();
  });
  
  describe("Gift Creation", function () {
    it("Should create a gift with no conditions", async function () {
      const claimCode = ethers.id("test-claim-code");
      const amount = ethers.parseEther("1.0");
      
      await expect(
        giftEscrow.createGift(
          recipient.address,
          claimCode,
          0, // unlockTime (immediate)
          0, // expirationTime (never)
          ethers.ZeroHash, // no secret
          0, // ConditionType.NONE
          0, // triggerValue
          "Happy Birthday!"
        )
      ).to.emit(giftEscrow, "GiftCreated");
      
      const gift = await giftEscrow.getGift(claimCode);
      expect(gift.sender).to.equal(sender.address);
      expect(gift.recipient).to.equal(recipient.address);
      expect(gift.amount).to.equal(amount);
    });
    
    it("Should create a time-locked gift", async function () {
      const claimCode = ethers.id("time-locked");
      const amount = ethers.parseEther("1.0");
      const unlockTime = Math.floor(Date.now() / 1000) + 86400; // 24 hours from now
      
      await expect(
        giftEscrow.createGift(
          recipient.address,
          claimCode,
          unlockTime,
          0,
          ethers.ZeroHash,
          1, // ConditionType.TIME_LOCKED
          unlockTime,
          "Time-locked gift"
        )
      ).to.emit(giftEscrow, "GiftCreated");
      
      const canClaim = await giftEscrow.canClaim(claimCode);
      expect(canClaim).to.be.false; // Cannot claim yet
    });
    
    it("Should create a secret-protected gift", async function () {
      const claimCode = ethers.id("secret-gift");
      const amount = ethers.parseEther("1.0");
      const secret = "BIRTHDAY2025";
      const secretHash = ethers.keccak256(ethers.toUtf8Bytes(secret));
      
      await expect(
        giftEscrow.createGift(
          recipient.address,
          claimCode,
          0,
          0,
          secretHash,
          4, // ConditionType.SECRET_REQUIRED
          0,
          "Secret gift"
        )
      ).to.emit(giftEscrow, "GiftCreated");
    });
  });
  
  describe("Gift Claiming", function () {
    it("Should allow claiming a gift with no conditions", async function () {
      const claimCode = ethers.id("claim-test");
      const amount = ethers.parseEther("1.0");
      
      await giftEscrow.createGift(
        recipient.address,
        claimCode,
        0,
        0,
        ethers.ZeroHash,
        0,
        0,
        "Test gift",
        { value: amount }
      );
      
      await expect(
        giftEscrow.connect(recipient).claimGift(claimCode, "")
      ).to.emit(giftEscrow, "GiftClaimed");
      
      const gift = await giftEscrow.getGift(claimCode);
      expect(gift.claimed).to.be.true;
    });
    
    it("Should require secret code for secret-protected gifts", async function () {
      const claimCode = ethers.id("secret-claim");
      const amount = ethers.parseEther("1.0");
      const secret = "BIRTHDAY2025";
      const secretHash = ethers.keccak256(ethers.toUtf8Bytes(secret));
      
      await giftEscrow.createGift(
        recipient.address,
        claimCode,
        0,
        0,
        secretHash,
        4, // SECRET_REQUIRED
        0,
        "Secret gift",
        { value: amount }
      );
      
      // Should fail without secret
      await expect(
        giftEscrow.connect(recipient).claimGift(claimCode, "")
      ).to.be.revertedWith("Invalid secret code");
      
      // Should succeed with correct secret
      await expect(
        giftEscrow.connect(recipient).claimGift(claimCode, secret)
      ).to.emit(giftEscrow, "GiftClaimed");
    });
  });
  
  describe("Expiration and Refunds", function () {
    it("Should auto-refund expired gifts", async function () {
      const claimCode = ethers.id("expired-gift");
      const amount = ethers.parseEther("1.0");
      const expirationTime = Math.floor(Date.now() / 1000) - 3600; // 1 hour ago
      
      await giftEscrow.createGift(
        recipient.address,
        claimCode,
        0,
        expirationTime,
        ethers.ZeroHash,
        0,
        0,
        "Expired gift",
        { value: amount }
      );
      
      // Should fail to claim expired gift
      await expect(
        giftEscrow.connect(recipient).claimGift(claimCode, "")
      ).to.be.revertedWith("Gift expired");
      
      // Should allow refund
      await expect(
        giftEscrow.refundGift(claimCode)
      ).to.emit(giftEscrow, "GiftRefunded");
    });
  });
});

