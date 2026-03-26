// AMP contract ABIs — minimal, only events + view functions needed by indexer
export const LISTING_REGISTRY_ABI = [
  "event ListingCreated(bytes32 indexed id, address indexed creator, bytes32 indexed category, string metadataURI, uint256 basePrice)",
  "event ListingUpdated(bytes32 indexed id, string metadataURI, uint256 basePrice)",
  "event ListingStatusChanged(bytes32 indexed id, uint8 status)",
  "function getListing(bytes32 listingId) view returns (tuple(bytes32 id, address creator, uint8 status, bytes32 category, string metadataURI, address pricingToken, uint256 basePrice, string pricingUnit, string agentCardURL, uint64 createdAt, uint64 expiresAt, uint256 deposit))",
  "function getAllListingIds() view returns (bytes32[])",
  "function getListingsByCreator(address creator) view returns (bytes32[])",
  "function getTotalListings() view returns (uint256)",
];

export const ESCROW_ABI = [
  "event OrderCreated(bytes32 indexed orderId, bytes32 indexed listingId, address indexed buyer, address seller, uint256 amount)",
  "event OrderCompleted(bytes32 indexed orderId, uint256 sellerPayout, uint256 fee)",
  "event OrderDisputed(bytes32 indexed orderId, address initiator)",
  "event OrderRefunded(bytes32 indexed orderId, uint256 amount)",
  "event OrderResolved(bytes32 indexed orderId, uint256 buyerRefund, uint256 sellerPayout)",
  "function getOrder(bytes32 orderId) view returns (tuple(bytes32 id, bytes32 listingId, address buyer, address seller, address token, uint256 amount, uint256 protocolFee, bytes32 termsHash, uint8 status, uint64 createdAt, uint64 deadline, uint64 completedAt))",
  "function getOrdersByBuyer(address buyer) view returns (bytes32[])",
  "function getOrdersBySeller(address seller) view returns (bytes32[])",
];

export const REPUTATION_ABI = [
  "event ReviewSubmitted(bytes32 indexed orderId, address indexed reviewer, address indexed reviewee, uint8 rating)",
  "function getReputation(address account) view returns (tuple(uint256 completedOrders, uint256 totalVolume, uint256 totalRatingSum, uint256 ratingCount, uint256 disputesInitiated, uint256 disputesLost))",
  "function getAverageRating(address account) view returns (uint256)",
  "function getReviewsAbout(address account) view returns (tuple(bytes32 orderId, address reviewer, address reviewee, uint8 rating, string reviewURI, uint64 createdAt)[])",
];
