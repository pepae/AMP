// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title ListingRegistry
/// @notice Permissionless registry for AMP marketplace listings
contract ListingRegistry is Ownable, ReentrancyGuard {
    // ──────────────────────────── Types ────────────────────────────

    enum ListingStatus { Active, Paused, Fulfilled, Expired, Removed }

    struct Listing {
        bytes32 id;
        address creator;
        ListingStatus status;
        bytes32 category;       // keccak256 of category path e.g. "services/accommodation"
        string metadataURI;     // ipfs://Qm... or https://
        address pricingToken;   // address(0) = native xDAI
        uint256 basePrice;      // in token's smallest unit
        string pricingUnit;     // "night", "hour", "project", "item"
        string agentCardURL;    // A2A agent card endpoint
        uint64 createdAt;
        uint64 expiresAt;
        uint256 deposit;        // anti-spam deposit in wei
    }

    // ──────────────────────────── Storage ────────────────────────────

    uint256 public constant MIN_DEPOSIT = 0.001 ether; // 0.001 xDAI on testnet (1 xDAI on mainnet)
    uint256 public nonce;

    mapping(bytes32 => Listing) public listings;
    mapping(address => bytes32[]) private _listingsByCreator;
    bytes32[] private _allListingIds;

    // ──────────────────────────── Events ────────────────────────────

    event ListingCreated(
        bytes32 indexed id,
        address indexed creator,
        bytes32 indexed category,
        string metadataURI,
        uint256 basePrice
    );
    event ListingUpdated(bytes32 indexed id, string metadataURI, uint256 basePrice);
    event ListingStatusChanged(bytes32 indexed id, ListingStatus status);

    // ──────────────────────────── Errors ────────────────────────────

    error InsufficientDeposit(uint256 required, uint256 provided);
    error NotListingCreator(bytes32 listingId, address caller);
    error ListingNotActive(bytes32 listingId);
    error ListingNotFound(bytes32 listingId);
    error InvalidExpiry();
    error RefundFailed();

    // ──────────────────────────── Constructor ────────────────────────────

    constructor() Ownable(msg.sender) {}

    // ──────────────────────────── External Functions ────────────────────────────

    /// @notice Create a new listing. msg.value must be >= MIN_DEPOSIT.
    function createListing(
        bytes32 category,
        string calldata metadataURI,
        address pricingToken,
        uint256 basePrice,
        string calldata pricingUnit,
        string calldata agentCardURL,
        uint64 expiresAt
    ) external payable nonReentrant returns (bytes32 listingId) {
        if (msg.value < MIN_DEPOSIT) {
            revert InsufficientDeposit(MIN_DEPOSIT, msg.value);
        }
        if (expiresAt != 0 && expiresAt <= uint64(block.timestamp)) {
            revert InvalidExpiry();
        }

        listingId = keccak256(abi.encodePacked(msg.sender, nonce, block.timestamp));
        nonce++;

        listings[listingId] = Listing({
            id: listingId,
            creator: msg.sender,
            status: ListingStatus.Active,
            category: category,
            metadataURI: metadataURI,
            pricingToken: pricingToken,
            basePrice: basePrice,
            pricingUnit: pricingUnit,
            agentCardURL: agentCardURL,
            createdAt: uint64(block.timestamp),
            expiresAt: expiresAt == 0 ? uint64(block.timestamp + 365 days) : expiresAt,
            deposit: msg.value
        });

        _listingsByCreator[msg.sender].push(listingId);
        _allListingIds.push(listingId);

        emit ListingCreated(listingId, msg.sender, category, metadataURI, basePrice);
    }

    /// @notice Update listing metadata and/or price.
    function updateListing(
        bytes32 listingId,
        string calldata metadataURI,
        uint256 basePrice
    ) external {
        _requireCreator(listingId);
        Listing storage listing = listings[listingId];
        if (listing.status != ListingStatus.Active && listing.status != ListingStatus.Paused) {
            revert ListingNotActive(listingId);
        }

        listing.metadataURI = metadataURI;
        listing.basePrice = basePrice;

        emit ListingUpdated(listingId, metadataURI, basePrice);
    }

    /// @notice Pause a listing (temporarily unavailable).
    function pauseListing(bytes32 listingId) external {
        _requireCreator(listingId);
        listings[listingId].status = ListingStatus.Paused;
        emit ListingStatusChanged(listingId, ListingStatus.Paused);
    }

    /// @notice Resume a paused listing.
    function resumeListing(bytes32 listingId) external {
        _requireCreator(listingId);
        listings[listingId].status = ListingStatus.Active;
        emit ListingStatusChanged(listingId, ListingStatus.Active);
    }

    /// @notice Remove a listing and reclaim deposit (if no active orders).
    function removeListing(bytes32 listingId) external nonReentrant {
        _requireCreator(listingId);
        Listing storage listing = listings[listingId];
        uint256 refundAmount = listing.deposit;
        listing.status = ListingStatus.Removed;
        listing.deposit = 0;

        emit ListingStatusChanged(listingId, ListingStatus.Removed);

        if (refundAmount > 0) {
            (bool ok,) = payable(msg.sender).call{value: refundAmount}("");
            if (!ok) revert RefundFailed();
        }
    }

    /// @notice Mark a listing as fulfilled (by escrow contract or creator).
    function markFulfilled(bytes32 listingId) external {
        Listing storage listing = listings[listingId];
        if (listing.id == bytes32(0)) revert ListingNotFound(listingId);
        // Allow creator or any external contract (escrow calls this)
        if (msg.sender != listing.creator && msg.sender != owner()) {
            revert NotListingCreator(listingId, msg.sender);
        }
        listing.status = ListingStatus.Fulfilled;
        emit ListingStatusChanged(listingId, ListingStatus.Fulfilled);
    }

    // ──────────────────────────── View Functions ────────────────────────────

    function getListing(bytes32 listingId) external view returns (Listing memory) {
        Listing memory l = listings[listingId];
        if (l.id == bytes32(0)) revert ListingNotFound(listingId);
        return l;
    }

    function getListingsByCreator(address creator) external view returns (bytes32[] memory) {
        return _listingsByCreator[creator];
    }

    function getAllListingIds() external view returns (bytes32[] memory) {
        return _allListingIds;
    }

    function getTotalListings() external view returns (uint256) {
        return _allListingIds.length;
    }

    // ──────────────────────────── Internal ────────────────────────────

    function _requireCreator(bytes32 listingId) internal view {
        Listing storage listing = listings[listingId];
        if (listing.id == bytes32(0)) revert ListingNotFound(listingId);
        if (listing.creator != msg.sender) revert NotListingCreator(listingId, msg.sender);
    }
}
