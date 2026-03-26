import "dotenv/config";
import { ethers } from "ethers";
import { LISTING_REGISTRY_ABI, ESCROW_ABI, REPUTATION_ABI } from "./abis.js";

/**
 * In-memory store. For production replace with SQLite/Postgres.
 * Structure:
 *   listings: Map<bytes32, ListingRecord>
 *   orders:   Map<bytes32, OrderRecord>
 */
const store = {
  listings: new Map(),
  orders: new Map(),
  lastSyncBlock: 0,
};

let provider, registryContract, escrowContract, reputationContract;

const STATUS_LABELS = ["Active", "Paused", "Fulfilled", "Expired", "Removed"];
const ORDER_STATUS_LABELS = ["Created", "Funded", "Completed", "Disputed", "Refunded", "Resolved"];

const CATEGORY_NAMES = {
  [ethers.keccak256(ethers.toUtf8Bytes("services/accommodation"))]: "services/accommodation",
  [ethers.keccak256(ethers.toUtf8Bytes("services/transport"))]: "services/transport",
  [ethers.keccak256(ethers.toUtf8Bytes("services/food"))]: "services/food",
  [ethers.keccak256(ethers.toUtf8Bytes("services/professional"))]: "services/professional",
  [ethers.keccak256(ethers.toUtf8Bytes("services/agent"))]: "services/agent",
  [ethers.keccak256(ethers.toUtf8Bytes("goods/physical"))]: "goods/physical",
  [ethers.keccak256(ethers.toUtf8Bytes("goods/digital"))]: "goods/digital",
};

function parseMetadata(uri) {
  if (!uri) return null;
  if (uri.startsWith("data:application/json,")) {
    try { return JSON.parse(decodeURIComponent(uri.slice("data:application/json,".length))); } catch { return null; }
  }
  if (uri.trimStart().startsWith("{")) {
    try { return JSON.parse(uri); } catch { return null; }
  }
  return null;
}

function decodeListing(raw) {
  const metadata = parseMetadata(raw.metadataURI);
  return {
    id: raw.id,
    creator: raw.creator,
    status: Number(raw.status),
    statusLabel: STATUS_LABELS[Number(raw.status)] ?? "Unknown",
    category: raw.category,
    categoryName: CATEGORY_NAMES[raw.category] ?? raw.category,
    metadataURI: raw.metadataURI,
    metadata,
    pricingToken: raw.pricingToken,
    basePrice: raw.basePrice.toString(),
    basePriceEther: ethers.formatEther(raw.basePrice),
    pricingUnit: raw.pricingUnit,
    agentCardURL: raw.agentCardURL,
    createdAt: Number(raw.createdAt),
    expiresAt: Number(raw.expiresAt),
    deposit: raw.deposit.toString(),
  };
}

function decodeOrder(raw) {
  return {
    id: raw.id,
    listingId: raw.listingId,
    buyer: raw.buyer,
    seller: raw.seller,
    token: raw.token,
    amount: raw.amount.toString(),
    amountEther: ethers.formatEther(raw.amount),
    protocolFee: raw.protocolFee.toString(),
    termsHash: raw.termsHash,
    status: Number(raw.status),
    statusLabel: ORDER_STATUS_LABELS[Number(raw.status)] ?? "Unknown",
    createdAt: Number(raw.createdAt),
    deadline: Number(raw.deadline),
    completedAt: Number(raw.completedAt),
  };
}

export async function initContracts() {
  provider = new ethers.JsonRpcProvider(process.env.CHAIN_RPC || "https://rpc.chiadochain.net");

  registryContract = new ethers.Contract(
    process.env.LISTING_REGISTRY,
    LISTING_REGISTRY_ABI,
    provider
  );
  escrowContract = new ethers.Contract(
    process.env.AMP_ESCROW,
    ESCROW_ABI,
    provider
  );
  reputationContract = new ethers.Contract(
    process.env.REPUTATION_LEDGER,
    REPUTATION_ABI,
    provider
  );

  console.log("[indexer] Contracts initialized on", process.env.CHAIN_RPC);
}

export async function syncListings() {
  try {
    const ids = await registryContract.getAllListingIds();
    for (const id of ids) {
      try {
        const raw = await registryContract.getListing(id);
        store.listings.set(id, decodeListing(raw));
      } catch (_) {
        // listing may have been removed
      }
    }
    store.lastSyncBlock = Number(await provider.getBlockNumber());
    console.log(`[indexer] Synced ${ids.length} listings @ block ${store.lastSyncBlock}`);
  } catch (err) {
    console.error("[indexer] syncListings error:", err.message);
  }
}

export async function syncOrders() {
  try {
    // We listen to OrderCreated events from block 0 (MVP: scan all history)
    const filter = escrowContract.filters.OrderCreated();
    const events = await escrowContract.queryFilter(filter, 0, "latest");
    for (const evt of events) {
      const orderId = evt.args.orderId;
      try {
        const raw = await escrowContract.getOrder(orderId);
        store.orders.set(orderId, decodeOrder(raw));
      } catch (_) {}
    }
    console.log(`[indexer] Synced ${events.length} orders`);
  } catch (err) {
    console.error("[indexer] syncOrders error:", err.message);
  }
}

// ──────────────────────────── Store accessors ────────────────────────────

export function getListings({ category, creator, status, search, priceMax, priceMin } = {}) {
  let items = Array.from(store.listings.values());

  if (category) {
    const hash = ethers.keccak256(ethers.toUtf8Bytes(category));
    items = items.filter(l => l.category === hash || l.categoryName === category);
  }
  if (creator) {
    items = items.filter(l => l.creator.toLowerCase() === creator.toLowerCase());
  }
  if (status !== undefined) {
    items = items.filter(l => l.statusLabel.toLowerCase() === status.toLowerCase());
  } else {
    // Default: only active
    items = items.filter(l => l.status === 0);
  }
  if (priceMax !== undefined) {
    const max = parseFloat(priceMax);
    items = items.filter(l => parseFloat(l.basePriceEther) <= max);
  }
  if (priceMin !== undefined) {
    const min = parseFloat(priceMin);
    items = items.filter(l => parseFloat(l.basePriceEther) >= min);
  }
  if (search) {
    const q = search.toLowerCase();
    items = items.filter(l => {
      const name = l.metadata?.name ?? "";
      const desc = l.metadata?.description ?? "";
      return name.toLowerCase().includes(q) ||
        desc.toLowerCase().includes(q) ||
        l.pricingUnit.toLowerCase().includes(q) ||
        l.categoryName.toLowerCase().includes(q);
    });
  }
  return items;
}

export function getListingById(id) {
  return store.listings.get(id) ?? null;
}

export async function getListingsByCreator(creator) {
  try {
    const ids = await registryContract.getListingsByCreator(creator);
    return ids.map(id => store.listings.get(id)).filter(Boolean);
  } catch {
    return [];
  }
}

export function getOrders({ buyer, seller, listingId, status } = {}) {
  let items = Array.from(store.orders.values());
  if (buyer) items = items.filter(o => o.buyer.toLowerCase() === buyer.toLowerCase());
  if (seller) items = items.filter(o => o.seller.toLowerCase() === seller.toLowerCase());
  if (listingId) items = items.filter(o => o.listingId === listingId);
  if (status) items = items.filter(o => o.statusLabel.toLowerCase() === status.toLowerCase());
  return items;
}

export function getOrderById(id) {
  return store.orders.get(id) ?? null;
}

export async function getReputation(address) {
  try {
    const rep = await reputationContract.getReputation(address);
    const avg = await reputationContract.getAverageRating(address);
    return {
      address,
      completedOrders: rep.completedOrders.toString(),
      totalVolume: rep.totalVolume.toString(),
      totalRatingSum: rep.totalRatingSum.toString(),
      ratingCount: rep.ratingCount.toString(),
      disputesInitiated: rep.disputesInitiated.toString(),
      disputesLost: rep.disputesLost.toString(),
      averageRating: Number(avg) / 100, // back to 0-5 scale
    };
  } catch (err) {
    throw new Error("Failed to fetch reputation: " + err.message);
  }
}

export async function getReviews(address) {
  try {
    const reviews = await reputationContract.getReviewsAbout(address);
    return reviews.map(r => ({
      orderId: r.orderId,
      reviewer: r.reviewer,
      reviewee: r.reviewee,
      rating: Number(r.rating),
      reviewURI: r.reviewURI,
      createdAt: Number(r.createdAt),
    }));
  } catch {
    return [];
  }
}

export function getStats() {
  return {
    totalListings: store.listings.size,
    activeListings: Array.from(store.listings.values()).filter(l => l.status === 0).length,
    totalOrders: store.orders.size,
    lastSyncBlock: store.lastSyncBlock,
  };
}
