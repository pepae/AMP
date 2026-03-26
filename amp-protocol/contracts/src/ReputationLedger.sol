// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";

/// @title ReputationLedger
/// @notice On-chain, non-transferable reputation system for AMP protocol
contract ReputationLedger is Ownable {
    // ──────────────────────────── Types ────────────────────────────

    struct Reputation {
        uint256 completedOrders;
        uint256 totalVolume;        // cumulative settled value (in smallest unit of the token)
        uint256 totalRatingSum;     // sum of 1-5 ratings
        uint256 ratingCount;
        uint256 disputesInitiated;
        uint256 disputesLost;
    }

    struct Review {
        bytes32 orderId;
        address reviewer;
        address reviewee;
        uint8 rating;           // 1-5
        string reviewURI;       // ipfs:// pointing to review text
        uint64 createdAt;
    }

    // ──────────────────────────── Storage ────────────────────────────

    address public escrowContract;

    mapping(address => Reputation) public reputations;
    mapping(bytes32 => mapping(address => bool)) private _hasReviewed; // orderId => reviewer => reviewed
    mapping(bytes32 => Review[]) public orderReviews;
    mapping(address => Review[]) public reviewsAbout;

    // ──────────────────────────── Events ────────────────────────────

    event ReviewSubmitted(
        bytes32 indexed orderId,
        address indexed reviewer,
        address indexed reviewee,
        uint8 rating
    );
    event EscrowContractSet(address escrowContract);

    // ──────────────────────────── Errors ────────────────────────────

    error AlreadyReviewed(bytes32 orderId, address reviewer);
    error InvalidRating(uint8 rating);
    error NotEscrowContract();
    error Unauthorized();

    // ──────────────────────────── Constructor ────────────────────────────

    constructor() Ownable(msg.sender) {}

    // ──────────────────────────── External ────────────────────────────

    /// @notice Submit a review for a completed order. One review per party per order.
    function submitReview(
        bytes32 orderId,
        address reviewee,
        uint8 rating,
        string calldata reviewURI
    ) external {
        if (rating < 1 || rating > 5) revert InvalidRating(rating);
        if (_hasReviewed[orderId][msg.sender]) revert AlreadyReviewed(orderId, msg.sender);

        _hasReviewed[orderId][msg.sender] = true;

        Review memory review = Review({
            orderId: orderId,
            reviewer: msg.sender,
            reviewee: reviewee,
            rating: rating,
            reviewURI: reviewURI,
            createdAt: uint64(block.timestamp)
        });

        orderReviews[orderId].push(review);
        reviewsAbout[reviewee].push(review);

        Reputation storage rep = reputations[reviewee];
        rep.totalRatingSum += rating;
        rep.ratingCount += 1;

        emit ReviewSubmitted(orderId, msg.sender, reviewee, rating);
    }

    /// @notice Called by the escrow contract on order completion to update stats.
    function recordCompletedOrder(
        address party,
        uint256 volume
    ) external {
        if (msg.sender != escrowContract && msg.sender != owner()) revert NotEscrowContract();
        Reputation storage rep = reputations[party];
        rep.completedOrders += 1;
        rep.totalVolume += volume;
    }

    /// @notice Called by arbitrator to record a lost dispute.
    function recordDisputeLost(address party) external {
        if (msg.sender != escrowContract && msg.sender != owner()) revert NotEscrowContract();
        reputations[party].disputesLost += 1;
    }

    /// @notice Called by escrow on dispute initiation.
    function recordDisputeInitiated(address party) external {
        if (msg.sender != escrowContract && msg.sender != owner()) revert NotEscrowContract();
        reputations[party].disputesInitiated += 1;
    }

    // ──────────────────────────── Admin ────────────────────────────

    function setEscrowContract(address _escrow) external onlyOwner {
        escrowContract = _escrow;
        emit EscrowContractSet(_escrow);
    }

    // ──────────────────────────── View ────────────────────────────

    function getReputation(address account) external view returns (Reputation memory) {
        return reputations[account];
    }

    /// @notice Returns average rating * 100 (e.g., 450 = 4.5 stars).
    function getAverageRating(address account) external view returns (uint256) {
        Reputation storage rep = reputations[account];
        if (rep.ratingCount == 0) return 0;
        return (rep.totalRatingSum * 100) / rep.ratingCount;
    }

    function getReviewsAbout(address account) external view returns (Review[] memory) {
        return reviewsAbout[account];
    }

    function getOrderReviews(bytes32 orderId) external view returns (Review[] memory) {
        return orderReviews[orderId];
    }
}
