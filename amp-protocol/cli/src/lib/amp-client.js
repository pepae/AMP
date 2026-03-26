/**
 * AMP Protocol — Programmatic JavaScript client
 * Can be used directly in Node.js code without spawning the CLI binary.
 *
 * Usage:
 *   import { AmpClient } from "@amp-protocol/cli/amp-client";
 *   const amp = new AmpClient({ indexer: "http://localhost:3001" });
 *   const { listings } = await amp.search({ category: "services/accommodation" });
 */

import { ethers } from "ethers";
import { getConfig } from "../config.js";
import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

// ─── Core category / metadata helpers ────────────────────────────────────────

export function categoryHash(name) {
  return ethers.keccak256(ethers.toUtf8Bytes(name));
}

export function encodeMetadata(obj) {
  return "data:application/json," + encodeURIComponent(JSON.stringify(obj));
}

export function parseMetadata(uri) {
  if (!uri) return null;
  if (uri.startsWith("data:application/json,")) {
    try { return JSON.parse(decodeURIComponent(uri.slice("data:application/json,".length))); } catch { return null; }
  }
  if (uri.trimStart().startsWith("{")) {
    try { return JSON.parse(uri); } catch { return null; }
  }
  return null;
}

// ─── Session store (for A2A negotiation sessions) ────────────────────────────

const SESSIONS_FILE = join(homedir(), ".amp", "negotiate-sessions.json");

function loadSessions() {
  try { return JSON.parse(readFileSync(SESSIONS_FILE, "utf8")); } catch { return {}; }
}
function saveSessions(s) {
  mkdirSync(join(homedir(), ".amp"), { recursive: true });
  writeFileSync(SESSIONS_FILE, JSON.stringify(s, null, 2));
}

// ─── Simulate A2A seller response (no live agent card) ───────────────────────

function simulateSellerResponse(taskType, payload, listing) {
  const basePrice = Number(listing.basePriceEther);
  const unit = listing.pricingUnit;

  if (taskType === "amp/request_quote") {
    const qty = payload.nights ?? payload.hours ?? payload.units ?? 1;
    const subtotal = basePrice * qty;
    const discount = qty >= 7 ? 0.05 : 0;
    const quoted = +(subtotal * (1 - discount)).toFixed(6);
    return {
      task_type: "amp/quote",
      session_id: randomUUID(),
      price: quoted,
      unit,
      token: "xDAI",
      notes: discount > 0 ? `${(discount * 100).toFixed(0)}% long-stay discount applied` : "Standard rate",
      availability_confirmed: true,
    };
  }
  if (taskType === "amp/negotiate") {
    const offerPrice = Number(payload.max_price ?? payload.price);
    const floor = basePrice * 0.9;
    if (offerPrice >= floor) {
      return { task_type: "amp/final_offer", price: offerPrice, accepted: true };
    }
    const counter = +(basePrice * 0.95).toFixed(6);
    return { task_type: "amp/counter", price: counter, notes: `Best I can do is ${counter} xDAI.` };
  }
  if (taskType === "amp/accept") {
    return {
      task_type: "amp/confirm",
      booking_ref: randomUUID().slice(0, 8).toUpperCase(),
      status: "confirmed",
    };
  }
  return { task_type: "amp/error", message: `Unknown task: ${taskType}` };
}

// ─── AmpClient class ─────────────────────────────────────────────────────────

export class AmpClient {
  /**
   * @param {object} [options]
   * @param {string} [options.indexer]       Indexer base URL
   * @param {string} [options.rpc]           Chain RPC URL
   * @param {number} [options.chainId]       Chain ID
   * @param {string} [options.privateKey]    Wallet private key (for write ops)
   */
  constructor(options = {}) {
    const cfg = getConfig();
    this.indexer = options.indexer ?? cfg.indexer;
    this.rpc = options.rpc ?? cfg.rpc;
    this.chainId = options.chainId ?? Number(cfg.chainId);
    this.privateKey = options.privateKey ?? process.env.AMP_PRIVATE_KEY ?? null;
    this._registryAddress = options.listingRegistry ?? cfg.listingRegistry;
    this._escrowAddress = options.ampEscrow ?? cfg.ampEscrow;
  }

  // ── Internal HTTP helper ────────────────────────────────────────────────────

  async _get(path) {
    const res = await fetch(`${this.indexer}${path}`);
    if (!res.ok) throw new Error(`Indexer ${path} → ${res.status}`);
    return res.json();
  }

  // ── Read API ────────────────────────────────────────────────────────────────

  /** Check indexer health */
  async health() {
    return this._get("/health");
  }

  /** Get protocol stats */
  async stats() {
    return this._get("/stats");
  }

  /**
   * Search listings
   * @param {object} [params]
   * @param {string} [params.category]   Category path (e.g. "services/accommodation")
   * @param {string} [params.search]     Free-text search
   * @param {number} [params.priceMax]   Max base price in xDAI
   * @param {number} [params.priceMin]   Min base price in xDAI
   * @param {string} [params.creator]    Filter by creator address
   * @returns {Promise<{listings: object[], total: number}>}
   */
  async search(params = {}) {
    const q = new URLSearchParams();
    if (params.category) q.set("category", params.category);
    if (params.search)   q.set("search",   params.search);
    if (params.priceMax !== undefined) q.set("priceMax", String(params.priceMax));
    if (params.priceMin !== undefined) q.set("priceMin", String(params.priceMin));
    if (params.creator)  q.set("creator",  params.creator);
    return this._get(`/listings?${q}`);
  }

  /**
   * Get a single listing by ID
   * @param {string} id  Listing bytes32 ID
   */
  async getListing(id) {
    return this._get(`/listings/${id}`);
  }

  /**
   * Get listings by creator address
   * @param {string} address
   */
  async getListingsByCreator(address) {
    return this._get(`/creators/${address}/listings`);
  }

  /**
   * Get reputation for an address
   * @param {string} address
   */
  async getReputation(address) {
    return this._get(`/reputation/${address}`);
  }

  /**
   * Get an order by ID
   * @param {string} id  Order bytes32 ID
   */
  async getOrder(id) {
    return this._get(`/orders/${id}`);
  }

  /**
   * Get orders for an address (as buyer or seller)
   * @param {string} address
   */
  async getOrders(address) {
    return this._get(`/orders?address=${address}`);
  }

  // ── A2A Negotiation ─────────────────────────────────────────────────────────

  /**
   * Request a quote from a listing's seller agent
   * @param {string} listingId
   * @param {object} [params]  e.g. { nights: 7, guests: 2, budget_hint: 1.5 }
   * @returns {Promise<{sessionId: string, price: number, unit: string, token: string, notes: string}>}
   */
  async negotiateQuote(listingId, params = {}) {
    const listing = await this.getListing(listingId);
    const response = listing.agentCardURL
      ? await this._a2aLive(listing, "amp/request_quote", params)
      : simulateSellerResponse("amp/request_quote", params, listing);

    const sessionId = response.session_id ?? randomUUID();
    const sessions = loadSessions();
    sessions[sessionId] = { listingId, seller: listing.creator, latest: response };
    saveSessions(sessions);

    return {
      sessionId,
      price: response.price,
      unit: response.unit ?? listing.pricingUnit,
      token: response.token ?? "xDAI",
      notes: response.notes ?? "",
      availabilityConfirmed: response.availability_confirmed ?? true,
    };
  }

  /**
   * Send a counter-offer in an active negotiation session
   * @param {string} sessionId
   * @param {object} params  e.g. { max_price: 0.9, flexible_dates: true }
   */
  async negotiateCounter(sessionId, params = {}) {
    const sessions = loadSessions();
    const session = sessions[sessionId];
    if (!session) throw new Error(`Session ${sessionId} not found`);

    const listing = await this.getListing(session.listingId);
    const response = listing.agentCardURL
      ? await this._a2aLive(listing, "amp/negotiate", params)
      : simulateSellerResponse("amp/negotiate", params, listing);

    sessions[sessionId].latest = response;
    saveSessions(sessions);

    return {
      accepted: response.accepted ?? false,
      price: response.price,
      notes: response.notes ?? "",
      taskType: response.task_type,
    };
  }

  /**
   * Accept the current offer in a negotiation session
   * @param {string} sessionId
   */
  async negotiateAccept(sessionId) {
    const sessions = loadSessions();
    const session = sessions[sessionId];
    if (!session) throw new Error(`Session ${sessionId} not found`);

    const listing = await this.getListing(session.listingId);
    const response = listing.agentCardURL
      ? await this._a2aLive(listing, "amp/accept", { session_id: sessionId })
      : simulateSellerResponse("amp/accept", {}, listing);

    return {
      bookingRef: response.booking_ref,
      status: response.status ?? "confirmed",
      listingId: session.listingId,
      price: session.latest?.price,
    };
  }

  /** Stub for live A2A HTTP calls (future) */
  async _a2aLive(listing, taskType, payload) {
    throw new Error(`Live A2A not yet implemented. Agent card: ${listing.agentCardURL}`);
  }

  // ── Write (on-chain) ────────────────────────────────────────────────────────

  _getSigner() {
    if (!this.privateKey) throw new Error("privateKey required for on-chain writes");
    const provider = new ethers.JsonRpcProvider(this.rpc, this.chainId);
    return new ethers.Wallet(this.privateKey, provider);
  }

  static REGISTRY_ABI = [
    "function createListing(bytes32 category, string metadataURI, address pricingToken, uint256 basePrice, string pricingUnit, string agentCardURL, uint64 expiresAt) payable returns (bytes32)",
    "function updateListing(bytes32 listingId, string metadataURI, uint256 basePrice)",
    "function pauseListing(bytes32 listingId)",
    "function removeListing(bytes32 listingId)",
    "function getListing(bytes32 listingId) view returns (tuple(bytes32 id, address creator, uint8 status, bytes32 category, string metadataURI, address pricingToken, uint256 basePrice, string pricingUnit, string agentCardURL, uint64 createdAt, uint64 expiresAt, uint256 deposit))",
  ];

  static ESCROW_ABI = [
    "function createAndFundOrder(bytes32 listingId, address seller, address token, uint256 amount, bytes32 termsHash, uint64 deadline) payable returns (bytes32)",
    "function confirmCompletion(bytes32 orderId)",
    "function requestRefund(bytes32 orderId)",
  ];

  /**
   * Create a new listing on-chain
   * @param {object} params
   * @param {string} params.category     Category path (e.g. "services/accommodation")
   * @param {string} params.price        Base price in xDAI (e.g. "0.01")
   * @param {string} params.unit         Pricing unit (night, hour, item, project)
   * @param {string} [params.title]      Listing title
   * @param {string} [params.description]
   * @param {string} [params.metadataUri] Override with a pre-formed URI
   * @param {string} [params.agentCard]  A2A agent card URL
   * @param {number} [params.expiresDays] Days until expiry (default 365)
   * @param {string} [params.deposit]    Anti-spam deposit in xDAI (default "0.001")
   * @returns {Promise<{listingId: string|null, txHash: string, block: number}>}
   */
  async createListing(params) {
    const signer = this._getSigner();
    const registry = new ethers.Contract(this._registryAddress, AmpClient.REGISTRY_ABI, signer);

    const catHash = categoryHash(params.category);
    const metaURI = params.metadataUri ?? encodeMetadata({
      _category: params.category,
      ...(params.title ? { name: params.title } : {}),
      ...(params.description ? { description: params.description } : {}),
    });

    const basePrice = ethers.parseEther(String(params.price));
    const deposit = ethers.parseEther(String(params.deposit ?? "0.001"));
    const expiresAt = Math.floor(Date.now() / 1000) + (params.expiresDays ?? 365) * 86400;

    const tx = await registry.createListing(
      catHash, metaURI, ethers.ZeroAddress, basePrice,
      params.unit, params.agentCard ?? "", expiresAt,
      { value: deposit }
    );
    const receipt = await tx.wait();

    let listingId = null;
    for (const log of receipt.logs) {
      try {
        const parsed = registry.interface.parseLog(log);
        if (parsed?.name === "ListingCreated") { listingId = parsed.args[0]; break; }
      } catch { /* skip */ }
    }

    return { listingId, txHash: tx.hash, block: receipt.blockNumber };
  }

  /**
   * Create and fund an escrow order
   * @param {object} params
   * @param {string} params.listingId
   * @param {string} params.amount     Amount in xDAI
   * @param {string} [params.terms]    Terms JSON string (will be hashed)
   * @param {string} [params.deadline] ISO date string
   * @returns {Promise<{orderId: string|null, txHash: string, block: number}>}
   */
  async createOrder(params) {
    const signer = this._getSigner();
    const escrow = new ethers.Contract(this._escrowAddress, AmpClient.ESCROW_ABI, signer);
    const listing = await this.getListing(params.listingId);

    const termsHash = ethers.keccak256(ethers.toUtf8Bytes(params.terms ?? "{}"));
    const amount = ethers.parseEther(String(params.amount));
    const deadline = params.deadline
      ? Math.floor(new Date(params.deadline).getTime() / 1000)
      : Math.floor(Date.now() / 1000) + 30 * 86400;

    const tx = await escrow.createAndFundOrder(
      params.listingId, listing.creator, ethers.ZeroAddress,
      amount, termsHash, deadline, { value: amount }
    );
    const receipt = await tx.wait();

    let orderId = null;
    for (const log of receipt.logs) {
      try {
        const parsed = escrow.interface.parseLog(log);
        if (parsed?.name === "OrderCreated") { orderId = parsed.args[0]; break; }
      } catch { /* skip */ }
    }

    return { orderId, txHash: tx.hash, block: receipt.blockNumber };
  }

  /**
   * Confirm order completion (buyer)
   * @param {string} orderId
   */
  async confirmOrder(orderId) {
    const signer = this._getSigner();
    const escrow = new ethers.Contract(this._escrowAddress, AmpClient.ESCROW_ABI, signer);
    const tx = await escrow.confirmCompletion(orderId);
    const receipt = await tx.wait();
    return { txHash: tx.hash, block: receipt.blockNumber };
  }
}

export default AmpClient;
