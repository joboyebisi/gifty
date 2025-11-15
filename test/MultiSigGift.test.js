const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("MultiSigGift", function () {
  let multiSigGift;
  let owner, initiator, recipient, signer1, signer2, signer3;
  
  beforeEach(async function () {
    [owner, initiator, recipient, signer1, signer2, signer3] = await ethers.getSigners();
    
    const MultiSigGift = await ethers.getContractFactory("MultiSigGift");
    multiSigGift = await MultiSigGift.deploy();
    await multiSigGift.waitForDeployment();
  });
  
  describe("Multi-Sig Gift Proposal Creation", function () {
    it("Should create a multi-sig gift proposal", async function () {
      const proposalId = ethers.id("test-proposal");
      const amount = ethers.parseEther("10.0");
      const requiredSignatures = 2;
      const signers = [signer1.address, signer2.address, signer3.address];
      
      await expect(
        multiSigGift.createMultiSigGift(
          proposalId,
          recipient.address,
          amount,
          requiredSignatures,
          signers,
          0, // no deadline
          "Team gift"
        )
      ).to.emit(multiSigGift, "MultiSigGiftProposed");
      
      const proposal = await multiSigGift.getProposal(proposalId);
      expect(proposal.initiator).to.equal(initiator.address);
      expect(proposal.recipient).to.equal(recipient.address);
      expect(proposal.amount).to.equal(amount);
      expect(proposal.requiredSignatures).to.equal(requiredSignatures);
      expect(proposal.executed).to.be.false;
    });
    
    it("Should auto-sign if initiator is in signers list", async function () {
      const proposalId = ethers.id("auto-sign");
      const amount = ethers.parseEther("10.0");
      const requiredSignatures = 2;
      const signers = [initiator.address, signer1.address, signer2.address];
      
      await multiSigGift.createMultiSigGift(
        proposalId,
        recipient.address,
        amount,
        requiredSignatures,
        signers,
        0,
        "Test",
        { value: amount }
      );
      
      const signatureCount = await multiSigGift.getSignatureCount(proposalId);
      expect(signatureCount).to.equal(1); // Initiator auto-signed
      
      const hasSigned = await multiSigGift.hasAddressSigned(proposalId, initiator.address);
      expect(hasSigned).to.be.true;
    });
  });
  
  describe("Signing Proposals", function () {
    it("Should allow signers to sign proposal", async function () {
      const proposalId = ethers.id("sign-test");
      const amount = ethers.parseEther("10.0");
      const requiredSignatures = 2;
      const signers = [signer1.address, signer2.address];
      
      await multiSigGift.createMultiSigGift(
        proposalId,
        recipient.address,
        amount,
        requiredSignatures,
        signers,
        0,
        "Test",
        { value: amount }
      );
      
      await expect(
        multiSigGift.connect(signer1).signProposal(proposalId)
      ).to.emit(multiSigGift, "SignatureAdded");
      
      const signatureCount = await multiSigGift.getSignatureCount(proposalId);
      expect(signatureCount).to.equal(1);
    });
    
    it("Should auto-execute when threshold reached", async function () {
      const proposalId = ethers.id("auto-execute");
      const amount = ethers.parseEther("10.0");
      const requiredSignatures = 2;
      const signers = [signer1.address, signer2.address];
      
      await multiSigGift.createMultiSigGift(
        proposalId,
        recipient.address,
        amount,
        requiredSignatures,
        signers,
        0,
        "Test",
        { value: amount }
      );
      
      // Sign by both signers
      await multiSigGift.connect(signer1).signProposal(proposalId);
      await expect(
        multiSigGift.connect(signer2).signProposal(proposalId)
      ).to.emit(multiSigGift, "MultiSigGiftExecuted");
      
      const proposal = await multiSigGift.getProposal(proposalId);
      expect(proposal.executed).to.be.true;
    });
  });
  
  describe("Cancellation", function () {
    it("Should allow initiator to cancel proposal", async function () {
      const proposalId = ethers.id("cancel-test");
      const amount = ethers.parseEther("10.0");
      const requiredSignatures = 2;
      const signers = [signer1.address, signer2.address];
      
      await multiSigGift.createMultiSigGift(
        proposalId,
        recipient.address,
        amount,
        requiredSignatures,
        signers,
        0,
        "Test",
        { value: amount }
      );
      
      await expect(
        multiSigGift.cancelProposal(proposalId)
      ).to.emit(multiSigGift, "MultiSigGiftCancelled");
      
      const proposal = await multiSigGift.getProposal(proposalId);
      expect(proposal.cancelled).to.be.true;
    });
  });
});

