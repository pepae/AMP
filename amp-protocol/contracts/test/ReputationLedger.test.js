const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("ReputationLedger", function () {
  let reputation;
  let owner, escrow, reviewer, reviewee;

  beforeEach(async function () {
    [owner, escrow, reviewer, reviewee] = await ethers.getSigners();
    const ReputationLedger = await ethers.getContractFactory("ReputationLedger");
    reputation = await ReputationLedger.deploy();
    await reputation.setEscrowContract(escrow.address);
  });

  describe("submitReview", function () {
    const orderId = ethers.keccak256(ethers.toUtf8Bytes("order-1"));

    it("stores a review and updates rating", async function () {
      await reputation.connect(reviewer).submitReview(orderId, reviewee.address, 5, "ipfs://review1");

      const rep = await reputation.getReputation(reviewee.address);
      expect(rep.totalRatingSum).to.equal(5n);
      expect(rep.ratingCount).to.equal(1n);

      const avg = await reputation.getAverageRating(reviewee.address);
      expect(avg).to.equal(500n); // 5.0 * 100
    });

    it("allows both parties to review the same order", async function () {
      await reputation.connect(reviewer).submitReview(orderId, reviewee.address, 4, "ipfs://r1");
      await reputation.connect(reviewee).submitReview(orderId, reviewer.address, 3, "ipfs://r2");

      const rep1 = await reputation.getReputation(reviewee.address);
      expect(rep1.ratingCount).to.equal(1n);
      const rep2 = await reputation.getReputation(reviewer.address);
      expect(rep2.ratingCount).to.equal(1n);
    });

    it("prevents double review by same party", async function () {
      await reputation.connect(reviewer).submitReview(orderId, reviewee.address, 5, "");
      await expect(
        reputation.connect(reviewer).submitReview(orderId, reviewee.address, 4, "")
      ).to.be.revertedWithCustomError(reputation, "AlreadyReviewed");
    });

    it("rejects invalid rating", async function () {
      await expect(
        reputation.connect(reviewer).submitReview(orderId, reviewee.address, 6, "")
      ).to.be.revertedWithCustomError(reputation, "InvalidRating");

      await expect(
        reputation.connect(reviewer).submitReview(orderId, reviewee.address, 0, "")
      ).to.be.revertedWithCustomError(reputation, "InvalidRating");
    });
  });

  describe("recordCompletedOrder", function () {
    it("increments from escrow contract", async function () {
      await reputation.connect(escrow).recordCompletedOrder(reviewee.address, ethers.parseEther("100"));
      const rep = await reputation.getReputation(reviewee.address);
      expect(rep.completedOrders).to.equal(1n);
      expect(rep.totalVolume).to.equal(ethers.parseEther("100"));
    });

    it("reverts from non-escrow", async function () {
      await expect(
        reputation.connect(reviewer).recordCompletedOrder(reviewee.address, 100n)
      ).to.be.revertedWithCustomError(reputation, "NotEscrowContract");
    });
  });

  describe("getAverageRating", function () {
    it("returns 0 for accounts with no reviews", async function () {
      expect(await reputation.getAverageRating(reviewee.address)).to.equal(0n);
    });

    it("calculates average across multiple reviews", async function () {
      const orderId1 = ethers.keccak256(ethers.toUtf8Bytes("order-1"));
      const orderId2 = ethers.keccak256(ethers.toUtf8Bytes("order-2"));
      await reputation.connect(reviewer).submitReview(orderId1, reviewee.address, 4, "");
      await reputation.connect(reviewer).submitReview(orderId2, reviewee.address, 2, "");
      // avg = (4+2)/2 = 3.0 => 300
      expect(await reputation.getAverageRating(reviewee.address)).to.equal(300n);
    });
  });
});
