// On-chain writer — ethers.js client for AMP contracts
import { ethers } from "ethers";
import { getConfig } from "../config.js";

export const LISTING_REGISTRY_ABI = [
  "function createListing(bytes32 category, string metadataURI, address pricingToken, uint256 basePrice, string pricingUnit, string agentCardURL, uint64 expiresAt) payable returns (bytes32)",
  "function updateListing(bytes32 listingId, string metadataURI, uint256 basePrice)",
  "function pauseListing(bytes32 listingId)",
  "function removeListing(bytes32 listingId)",
  "function getListing(bytes32 listingId) view returns (tuple(bytes32 id, address creator, uint8 status, bytes32 category, string metadataURI, address pricingToken, uint256 basePrice, string pricingUnit, string agentCardURL, uint64 createdAt, uint64 expiresAt, uint256 deposit))",
  "function MIN_DEPOSIT() view returns (uint256)",
];

export const ESCROW_ABI = [
  "function createAndFundOrder(bytes32 listingId, address seller, address token, uint256 amount, bytes32 termsHash, uint64 deadline) payable returns (bytes32)",
  "function confirmCompletion(bytes32 orderId)",
  "function requestRefund(bytes32 orderId)",
  "function getOrder(bytes32 orderId) view returns (tuple(bytes32 id, bytes32 listingId, address buyer, address seller, address token, uint256 amount, uint256 protocolFee, bytes32 termsHash, uint8 status, uint64 createdAt, uint64 deadline, uint64 completedAt))",
];

export function getProvider() {
  const cfg = getConfig();
  return new ethers.JsonRpcProvider(cfg.rpc, Number(cfg.chainId));
}

export function getSigner(privateKey) {
  return new ethers.Wallet(privateKey, getProvider());
}

export function getListingRegistry(signerOrProvider) {
  const cfg = getConfig();
  return new ethers.Contract(cfg.listingRegistry, LISTING_REGISTRY_ABI, signerOrProvider);
}

export function getEscrow(signerOrProvider) {
  const cfg = getConfig();
  return new ethers.Contract(cfg.ampEscrow, ESCROW_ABI, signerOrProvider);
}

// Resolve a private key — from env or --key flag
export function resolveKey(keyOption) {
  const key = keyOption || process.env.AMP_PRIVATE_KEY;
  if (!key) throw new Error("Wallet key required: set AMP_PRIVATE_KEY env or pass --key <privateKey>");
  return key;
}

// Encode category name to bytes32 hash
export function categoryHash(name) {
  return ethers.keccak256(ethers.toUtf8Bytes(name));
}

// Encode structured metadata as data URI
export function encodeMetadata(obj) {
  return "data:application/json," + encodeURIComponent(JSON.stringify(obj));
}
