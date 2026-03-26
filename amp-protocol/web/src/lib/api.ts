import { createPublicClient, http, formatEther, keccak256, stringToBytes } from "viem";
import { chiado } from "./wagmi";
import { CONTRACTS, CATEGORY_OPTIONS } from "./constants";
import { LISTING_REGISTRY_ABI, ESCROW_ABI } from "./abis";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ListingMetadata {
  name?: string;
  description?: string;
  [key: string]: unknown;
}

export interface Listing {
  id: string;
  creator: string;
  status: number;
  statusLabel: string;
  category: string;
  categoryName: string;
  metadataURI: string;
  metadata?: ListingMetadata | null;
  pricingToken: string;
  basePrice: string;
  basePriceEther: string;
  pricingUnit: string;
  agentCardURL: string;
  createdAt: number;
  expiresAt: number;
  deposit: string;
}

export interface Order {
  id: string;
  listingId: string;
  buyer: string;
  seller: string;
  token: string;
  amount: string;
  amountEther: string;
  status: number;
  statusLabel: string;
  createdAt: number;
  deadline: number;
  completedAt: number;
}

export interface Reputation {
  address: string;
  completedOrders: string;
  totalVolume: string;
  ratingCount: string;
  averageRating: number;
  disputesInitiated: string;
  disputesLost: string;
}

// ── Internal constants ────────────────────────────────────────────────────────

const LISTING_STATUS = ["Active", "Paused", "Fulfilled", "Expired", "Removed"];
const ORDER_STATUS   = ["Created", "Funded", "Completed", "Disputed", "Refunded", "Resolved"];

// keccak256(categoryPath) → categoryPath  (for decoding on-chain bytes32 back to string)
const CATEGORY_BY_HASH = new Map<string, string>(
  CATEGORY_OPTIONS.map((c) => [keccak256(stringToBytes(c.value)), c.value])
);

// ── Public client (read-only, no wallet needed) ───────────────────────────────

const publicClient = createPublicClient({
  chain: chiado,
  transport: http("https://rpc.chiadochain.net"),
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseMetadata(uri: string): ListingMetadata | null {
  try {
    if (uri.startsWith("data:application/json,")) {
      return JSON.parse(decodeURIComponent(uri.slice("data:application/json,".length)));
    }
    if (uri.startsWith("data:application/json;base64,")) {
      return JSON.parse(atob(uri.slice("data:application/json;base64,".length)));
    }
  } catch {
    // malformed data URI — fall through
  }
  return null;
}

type RawListing = {
  id: `0x${string}`;
  creator: `0x${string}`;
  status: number;
  category: `0x${string}`;
  metadataURI: string;
  pricingToken: `0x${string}`;
  basePrice: bigint;
  pricingUnit: string;
  agentCardURL: string;
  createdAt: bigint;
  expiresAt: bigint;
  deposit: bigint;
};

type RawOrder = {
  id: `0x${string}`;
  listingId: `0x${string}`;
  buyer: `0x${string}`;
  seller: `0x${string}`;
  token: `0x${string}`;
  amount: bigint;
  protocolFee: bigint;
  termsHash: `0x${string}`;
  status: number;
  createdAt: bigint;
  deadline: bigint;
  completedAt: bigint;
};

function transformListing(raw: RawListing): Listing {
  return {
    id: raw.id,
    creator: raw.creator,
    status: raw.status,
    statusLabel: LISTING_STATUS[raw.status] ?? "Unknown",
    category: raw.category,
    categoryName: CATEGORY_BY_HASH.get(raw.category) ?? raw.category,
    metadataURI: raw.metadataURI,
    metadata: parseMetadata(raw.metadataURI),
    pricingToken: raw.pricingToken,
    basePrice: raw.basePrice.toString(),
    basePriceEther: formatEther(raw.basePrice),
    pricingUnit: raw.pricingUnit,
    agentCardURL: raw.agentCardURL,
    createdAt: Number(raw.createdAt),
    expiresAt: Number(raw.expiresAt),
    deposit: raw.deposit.toString(),
  };
}

function transformOrder(raw: RawOrder): Order {
  return {
    id: raw.id,
    listingId: raw.listingId,
    buyer: raw.buyer,
    seller: raw.seller,
    token: raw.token,
    amount: raw.amount.toString(),
    amountEther: formatEther(raw.amount),
    status: raw.status,
    statusLabel: ORDER_STATUS[raw.status] ?? "Unknown",
    createdAt: Number(raw.createdAt),
    deadline: Number(raw.deadline),
    completedAt: Number(raw.completedAt),
  };
}

async function fetchListingsByIds(ids: readonly `0x${string}`[]): Promise<Listing[]> {
  if (ids.length === 0) return [];
  const results = await Promise.all(
    ids.map((id) =>
      publicClient
        .readContract({
          address: CONTRACTS.ListingRegistry,
          abi: LISTING_REGISTRY_ABI,
          functionName: "getListing",
          args: [id],
        })
        .then((r) => transformListing(r as unknown as RawListing))
        .catch(() => null)
    )
  );
  return results.filter((r): r is Listing => r !== null);
}

async function fetchOrdersByIds(ids: readonly `0x${string}`[]): Promise<Order[]> {
  if (ids.length === 0) return [];
  const results = await Promise.all(
    ids.map((id) =>
      publicClient
        .readContract({
          address: CONTRACTS.AMPEscrow,
          abi: ESCROW_ABI,
          functionName: "getOrder",
          args: [id],
        })
        .then((r) => transformOrder(r as unknown as RawOrder))
        .catch(() => null)
    )
  );
  return results.filter((r): r is Order => r !== null);
}

// ── Public API (same interface as the old indexer-based api) ──────────────────

export const api = {
  async getListings(params?: Record<string, string>): Promise<{ listings: Listing[]; total: number }> {
    let ids: readonly `0x${string}`[];

    // Use the creator-specific index when possible (much faster)
    if (params?.creator) {
      ids = await publicClient.readContract({
        address: CONTRACTS.ListingRegistry,
        abi: LISTING_REGISTRY_ABI,
        functionName: "getListingsByCreator",
        args: [params.creator as `0x${string}`],
      });
    } else {
      ids = await publicClient.readContract({
        address: CONTRACTS.ListingRegistry,
        abi: LISTING_REGISTRY_ABI,
        functionName: "getAllListingIds",
      });
    }

    let listings = await fetchListingsByIds(ids);

    if (params?.category) {
      listings = listings.filter((l) => l.categoryName === params.category);
    }
    if (params?.search) {
      const q = params.search.toLowerCase();
      listings = listings.filter((l) => {
        const name = String(l.metadata?.name ?? "").toLowerCase();
        const desc = String(l.metadata?.description ?? "").toLowerCase();
        return name.includes(q) || desc.includes(q) || l.metadataURI.toLowerCase().includes(q);
      });
    }
    if (params?.priceMax) {
      const max = parseFloat(params.priceMax);
      listings = listings.filter((l) => parseFloat(l.basePriceEther) <= max);
    }
    if (params?.priceMin) {
      const min = parseFloat(params.priceMin);
      listings = listings.filter((l) => parseFloat(l.basePriceEther) >= min);
    }

    return { listings, total: listings.length };
  },

  async getListing(id: string): Promise<Listing> {
    const raw = await publicClient.readContract({
      address: CONTRACTS.ListingRegistry,
      abi: LISTING_REGISTRY_ABI,
      functionName: "getListing",
      args: [id as `0x${string}`],
    });
    return transformListing(raw as unknown as RawListing);
  },

  async getOrders(params?: Record<string, string>): Promise<{ orders: Order[]; total: number }> {
    let ids: readonly `0x${string}`[] = [];

    if (params?.buyer) {
      ids = await publicClient.readContract({
        address: CONTRACTS.AMPEscrow,
        abi: ESCROW_ABI,
        functionName: "getOrdersByBuyer",
        args: [params.buyer as `0x${string}`],
      });
    } else if (params?.seller) {
      ids = await publicClient.readContract({
        address: CONTRACTS.AMPEscrow,
        abi: ESCROW_ABI,
        functionName: "getOrdersBySeller",
        args: [params.seller as `0x${string}`],
      });
    }

    const orders = await fetchOrdersByIds(ids);
    return { orders, total: orders.length };
  },

  async getOrder(id: string): Promise<Order> {
    const raw = await publicClient.readContract({
      address: CONTRACTS.AMPEscrow,
      abi: ESCROW_ABI,
      functionName: "getOrder",
      args: [id as `0x${string}`],
    });
    return transformOrder(raw as unknown as RawOrder);
  },

  async getStats(): Promise<{ totalListings: number; activeListings: number; totalOrders: number; lastSyncBlock: number }> {
    const [ids, orderLogs] = await Promise.all([
      publicClient.readContract({
        address: CONTRACTS.ListingRegistry,
        abi: LISTING_REGISTRY_ABI,
        functionName: "getAllListingIds",
      }),
      publicClient.getLogs({
        address: CONTRACTS.AMPEscrow,
        event: {
          type: "event",
          name: "OrderCreated",
          inputs: [
            { name: "orderId",   type: "bytes32", indexed: true },
            { name: "listingId", type: "bytes32", indexed: true },
            { name: "buyer",     type: "address", indexed: true },
            { name: "seller",    type: "address", indexed: false },
            { name: "amount",    type: "uint256", indexed: false },
          ],
        } as const,
        fromBlock: 0n,
      }).catch(() => [] as unknown[]),
    ]);

    const allIds = ids as readonly `0x${string}`[];
    let activeListings = 0;
    if (allIds.length > 0) {
      const results = await Promise.all(
        allIds.map((id) =>
          publicClient
            .readContract({
              address: CONTRACTS.ListingRegistry,
              abi: LISTING_REGISTRY_ABI,
              functionName: "getListing",
              args: [id],
            })
            .then((r) => (r as RawListing).status)
            .catch(() => -1)
        )
      );
      activeListings = results.filter((s) => s === 0).length;
    }

    return {
      totalListings: allIds.length,
      activeListings,
      totalOrders: (orderLogs as unknown[]).length,
      lastSyncBlock: 0,
    };
  },

  getReputation: async (address: string): Promise<Reputation> => ({
    address,
    completedOrders: "0",
    totalVolume: "0",
    ratingCount: "0",
    averageRating: 0,
    disputesInitiated: "0",
    disputesLost: "0",
  }),

  getReviews: async (_address: string): Promise<{ reviews: unknown[]; total: number }> => ({
    reviews: [],
    total: 0,
  }),
};
