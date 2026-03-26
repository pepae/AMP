const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("ListingRegistry", function () {
  let registry;
  let owner, seller, seller2, buyer;
  const MIN_DEPOSIT = ethers.parseEther("0.001");
  const category = ethers.keccak256(ethers.toUtf8Bytes("services/accommodation"));

  beforeEach(async function () {
    [owner, seller, seller2, buyer] = await ethers.getSigners();
    const ListingRegistry = await ethers.getContractFactory("ListingRegistry");
    registry = await ListingRegistry.deploy();
  });

  describe("createListing", function () {
    it("creates a listing with correct values", async function () {
      const tx = await registry.connect(seller).createListing(
        category,
        "ipfs://QmTest123",
        ethers.ZeroAddress,
        ethers.parseEther("200"),
        "night",
        "https://seller.example/.well-known/agent.json",
        0,
        { value: MIN_DEPOSIT }
      );
      const receipt = await tx.wait();

      const event = receipt.logs.find(l => {
        try { return registry.interface.parseLog(l).name === "ListingCreated"; } catch { return false; }
      });
      expect(event).to.not.be.undefined;

      const parsed = registry.interface.parseLog(event);
      const listingId = parsed.args.id;

      const listing = await registry.getListing(listingId);
      expect(listing.creator).to.equal(seller.address);
      expect(listing.category).to.equal(category);
      expect(listing.metadataURI).to.equal("ipfs://QmTest123");
      expect(listing.basePrice).to.equal(ethers.parseEther("200"));
      expect(listing.pricingUnit).to.equal("night");
      expect(listing.deposit).to.equal(MIN_DEPOSIT);
      expect(listing.status).to.equal(0); // Active
    });

    it("reverts if deposit is too low", async function () {
      await expect(
        registry.connect(seller).createListing(
          category, "ipfs://Qm", ethers.ZeroAddress, 100n, "night", "", 0,
          { value: ethers.parseEther("0.0001") }
        )
      ).to.be.revertedWithCustomError(registry, "InsufficientDeposit");
    });

    it("reverts if expiry is in the past", async function () {
      const pastTime = Math.floor(Date.now() / 1000) - 1000;
      await expect(
        registry.connect(seller).createListing(
          category, "ipfs://Qm", ethers.ZeroAddress, 100n, "night", "", pastTime,
          { value: MIN_DEPOSIT }
        )
      ).to.be.revertedWithCustomError(registry, "InvalidExpiry");
    });

    it("tracks listings by creator", async function () {
      // Create 2 listings for seller
      for (let i = 0; i < 2; i++) {
        await registry.connect(seller).createListing(
          category, `ipfs://Qm${i}`, ethers.ZeroAddress, 100n, "night", "", 0,
          { value: MIN_DEPOSIT }
        );
      }
      const ids = await registry.getListingsByCreator(seller.address);
      expect(ids.length).to.equal(2);
    });
  });

  describe("updateListing", function () {
    let listingId;

    beforeEach(async function () {
      const tx = await registry.connect(seller).createListing(
        category, "ipfs://OldURI", ethers.ZeroAddress, 100n, "night", "", 0,
        { value: MIN_DEPOSIT }
      );
      const receipt = await tx.wait();
      const event = receipt.logs.find(l => {
        try { return registry.interface.parseLog(l).name === "ListingCreated"; } catch { return false; }
      });
      listingId = registry.interface.parseLog(event).args.id;
    });

    it("allows creator to update", async function () {
      await registry.connect(seller).updateListing(listingId, "ipfs://NewURI", 200n);
      const listing = await registry.getListing(listingId);
      expect(listing.metadataURI).to.equal("ipfs://NewURI");
      expect(listing.basePrice).to.equal(200n);
    });

    it("reverts if non-creator tries to update", async function () {
      await expect(
        registry.connect(buyer).updateListing(listingId, "ipfs://Hacked", 1n)
      ).to.be.revertedWithCustomError(registry, "NotListingCreator");
    });
  });

  describe("pauseListing / resumeListing", function () {
    let listingId;

    beforeEach(async function () {
      const tx = await registry.connect(seller).createListing(
        category, "ipfs://Qm", ethers.ZeroAddress, 100n, "night", "", 0,
        { value: MIN_DEPOSIT }
      );
      const receipt = await tx.wait();
      const event = receipt.logs.find(l => {
        try { return registry.interface.parseLog(l).name === "ListingCreated"; } catch { return false; }
      });
      listingId = registry.interface.parseLog(event).args.id;
    });

    it("pauses and resumes", async function () {
      await registry.connect(seller).pauseListing(listingId);
      expect((await registry.getListing(listingId)).status).to.equal(1); // Paused

      await registry.connect(seller).resumeListing(listingId);
      expect((await registry.getListing(listingId)).status).to.equal(0); // Active
    });
  });

  describe("removeListing", function () {
    it("removes and refunds deposit", async function () {
      const tx = await registry.connect(seller).createListing(
        category, "ipfs://Qm", ethers.ZeroAddress, 100n, "night", "", 0,
        { value: MIN_DEPOSIT }
      );
      const receipt = await tx.wait();
      const event = receipt.logs.find(l => {
        try { return registry.interface.parseLog(l).name === "ListingCreated"; } catch { return false; }
      });
      const listingId = registry.interface.parseLog(event).args.id;

      const balanceBefore = await ethers.provider.getBalance(seller.address);
      const removeTx = await registry.connect(seller).removeListing(listingId);
      const removeReceipt = await removeTx.wait();
      const gasUsed = removeReceipt.gasUsed * removeReceipt.gasPrice;
      const balanceAfter = await ethers.provider.getBalance(seller.address);

      expect(balanceAfter).to.be.closeTo(balanceBefore + MIN_DEPOSIT - gasUsed, ethers.parseEther("0.0001"));
      expect((await registry.getListing(listingId)).status).to.equal(4); // Removed
    });
  });
});
