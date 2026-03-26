const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("AMPEscrow", function () {
  let escrow;
  let owner, treasury, arbitrator, buyer, seller;
  const category = ethers.keccak256(ethers.toUtf8Bytes("services/accommodation"));
  const termsHash = ethers.keccak256(ethers.toUtf8Bytes('{"price":1000,"nights":5}'));
  const listingId = ethers.keccak256(ethers.toUtf8Bytes("listing-1"));
  const ONE_ETH = ethers.parseEther("1");
  const DEADLINE_OFFSET = 7 * 24 * 3600; // 7 days

  beforeEach(async function () {
    [owner, treasury, arbitrator, buyer, seller] = await ethers.getSigners();
    const AMPEscrow = await ethers.getContractFactory("AMPEscrow");
    escrow = await AMPEscrow.deploy(treasury.address, arbitrator.address);
  });

  async function createFundedOrder(amount = ONE_ETH) {
    const deadline = (await time.latest()) + DEADLINE_OFFSET;
    const tx = await escrow.connect(buyer).createAndFundOrder(
      listingId, seller.address, ethers.ZeroAddress, amount, termsHash, deadline,
      { value: amount }
    );
    const receipt = await tx.wait();
    const event = receipt.logs.find(l => {
      try { return escrow.interface.parseLog(l).name === "OrderCreated"; } catch { return false; }
    });
    return escrow.interface.parseLog(event).args.orderId;
  }

  describe("createAndFundOrder", function () {
    it("creates order with correct fields", async function () {
      const orderId = await createFundedOrder();
      const order = await escrow.getOrder(orderId);

      expect(order.buyer).to.equal(buyer.address);
      expect(order.seller).to.equal(seller.address);
      expect(order.amount).to.equal(ONE_ETH);
      expect(order.token).to.equal(ethers.ZeroAddress);
      expect(order.termsHash).to.equal(termsHash);
      expect(order.status).to.equal(1); // Funded
    });

    it("holds funds in escrow", async function () {
      const balanceBefore = await ethers.provider.getBalance(await escrow.getAddress());
      await createFundedOrder();
      const balanceAfter = await ethers.provider.getBalance(await escrow.getAddress());
      expect(balanceAfter - balanceBefore).to.equal(ONE_ETH);
    });

    it("reverts with wrong native amount", async function () {
      const deadline = (await time.latest()) + DEADLINE_OFFSET;
      await expect(
        escrow.connect(buyer).createAndFundOrder(
          listingId, seller.address, ethers.ZeroAddress, ONE_ETH, termsHash, deadline,
          { value: ethers.parseEther("0.5") }
        )
      ).to.be.revertedWithCustomError(escrow, "WrongNativeAmount");
    });

    it("reverts with past deadline", async function () {
      const pastDeadline = (await time.latest()) - 1;
      await expect(
        escrow.connect(buyer).createAndFundOrder(
          listingId, seller.address, ethers.ZeroAddress, ONE_ETH, termsHash, pastDeadline,
          { value: ONE_ETH }
        )
      ).to.be.revertedWithCustomError(escrow, "InvalidDeadline");
    });
  });

  describe("confirmCompletion + claimFunds", function () {
    it("buyer confirms, seller claims correct amount minus fee", async function () {
      const orderId = await createFundedOrder();

      await escrow.connect(buyer).confirmCompletion(orderId);
      expect((await escrow.getOrder(orderId)).status).to.equal(2); // Completed

      const sellerBalanceBefore = await ethers.provider.getBalance(seller.address);
      const treasuryBalanceBefore = await ethers.provider.getBalance(treasury.address);

      const claimTx = await escrow.connect(seller).claimFunds(orderId);
      const claimReceipt = await claimTx.wait();
      const gasUsed = claimReceipt.gasUsed * claimReceipt.gasPrice;

      const sellerBalanceAfter = await ethers.provider.getBalance(seller.address);
      const treasuryBalanceAfter = await ethers.provider.getBalance(treasury.address);

      const expectedFee = (ONE_ETH * 50n) / 10000n; // 0.5%
      const expectedSeller = ONE_ETH - expectedFee;

      expect(sellerBalanceAfter).to.be.closeTo(
        sellerBalanceBefore + expectedSeller - gasUsed,
        ethers.parseEther("0.0001")
      );
      expect(treasuryBalanceAfter - treasuryBalanceBefore).to.equal(expectedFee);
    });

    it("non-buyer cannot confirm", async function () {
      const orderId = await createFundedOrder();
      await expect(escrow.connect(seller).confirmCompletion(orderId))
        .to.be.revertedWithCustomError(escrow, "NotBuyer");
    });
  });

  describe("requestRefund", function () {
    it("buyer gets refund after deadline", async function () {
      const orderId = await createFundedOrder();

      await time.increase(DEADLINE_OFFSET + 1);

      const balanceBefore = await ethers.provider.getBalance(buyer.address);
      const refundTx = await escrow.connect(buyer).requestRefund(orderId);
      const refundReceipt = await refundTx.wait();
      const gasUsed = refundReceipt.gasUsed * refundReceipt.gasPrice;
      const balanceAfter = await ethers.provider.getBalance(buyer.address);

      expect(balanceAfter).to.be.closeTo(
        balanceBefore + ONE_ETH - gasUsed,
        ethers.parseEther("0.0001")
      );
      expect((await escrow.getOrder(orderId)).status).to.equal(4); // Refunded
    });

    it("reverts before deadline", async function () {
      const orderId = await createFundedOrder();
      await expect(escrow.connect(buyer).requestRefund(orderId))
        .to.be.revertedWithCustomError(escrow, "DeadlineNotPassed");
    });
  });

  describe("disputeOrder + resolveDispute", function () {
    it("arbitrator resolves dispute with split", async function () {
      const orderId = await createFundedOrder();
      await escrow.connect(buyer).disputeOrder(orderId);
      expect((await escrow.getOrder(orderId)).status).to.equal(3); // Disputed

      const buyerRefund = ethers.parseEther("0.4");
      const sellerPayment = ethers.parseEther("0.6");

      const buyerBefore = await ethers.provider.getBalance(buyer.address);
      const sellerBefore = await ethers.provider.getBalance(seller.address);

      await escrow.connect(arbitrator).resolveDispute(orderId, buyerRefund, sellerPayment);

      const buyerAfter = await ethers.provider.getBalance(buyer.address);
      const sellerAfter = await ethers.provider.getBalance(seller.address);

      expect(buyerAfter - buyerBefore).to.equal(buyerRefund);

      const fee = (sellerPayment * 50n) / 10000n;
      expect(sellerAfter - sellerBefore).to.equal(sellerPayment - fee);
    });

    it("reverts if non-arbitrator tries to resolve", async function () {
      const orderId = await createFundedOrder();
      await escrow.connect(buyer).disputeOrder(orderId);
      await expect(
        escrow.connect(buyer).resolveDispute(orderId, ONE_ETH, 0n)
      ).to.be.revertedWithCustomError(escrow, "NotArbitrator");
    });
  });
});
