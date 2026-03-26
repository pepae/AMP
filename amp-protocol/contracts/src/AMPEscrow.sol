// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title AMPEscrow
/// @notice Trustless escrow for AMP marketplace orders with dispute resolution
contract AMPEscrow is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ──────────────────────────── Types ────────────────────────────

    enum OrderStatus { Created, Funded, Completed, Disputed, Refunded, Resolved }

    struct Order {
        bytes32 id;
        bytes32 listingId;
        address buyer;
        address seller;
        address token;          // address(0) = native xDAI
        uint256 amount;         // total amount in escrow
        uint256 protocolFee;    // pre-computed fee (0.5%)
        bytes32 termsHash;      // keccak256 of negotiated terms JSON
        OrderStatus status;
        uint64 createdAt;
        uint64 deadline;        // if deadline passes, buyer can refund
        uint64 completedAt;
    }

    // ──────────────────────────── Storage ────────────────────────────

    uint256 public constant FEE_BPS = 50; // 0.5% = 50 basis points
    uint256 public constant FEE_DENOMINATOR = 10000;

    address public treasury;
    address public arbitrator;

    mapping(bytes32 => Order) public orders;
    mapping(address => bytes32[]) private _ordersByBuyer;
    mapping(address => bytes32[]) private _ordersBySeller;
    bytes32[] private _allOrderIds;

    // ──────────────────────────── Events ────────────────────────────

    event OrderCreated(
        bytes32 indexed orderId,
        bytes32 indexed listingId,
        address indexed buyer,
        address seller,
        uint256 amount
    );
    event OrderCompleted(bytes32 indexed orderId, uint256 sellerPayout, uint256 fee);
    event OrderDisputed(bytes32 indexed orderId, address initiator);
    event OrderRefunded(bytes32 indexed orderId, uint256 amount);
    event OrderResolved(bytes32 indexed orderId, uint256 buyerRefund, uint256 sellerPayout);
    event TreasuryUpdated(address newTreasury);
    event ArbitratorUpdated(address newArbitrator);

    // ──────────────────────────── Errors ────────────────────────────

    error InvalidAmount();
    error InvalidDeadline();
    error OrderNotFound(bytes32 orderId);
    error OrderNotFunded(bytes32 orderId);
    error OrderNotCompleted(bytes32 orderId);
    error OrderNotDisputed(bytes32 orderId);
    error NotBuyer(bytes32 orderId);
    error NotSeller(bytes32 orderId);
    error NotParty(bytes32 orderId);
    error NotArbitrator();
    error DeadlineNotPassed(bytes32 orderId);
    error DeadlinePassed(bytes32 orderId);
    error WrongNativeAmount(uint256 expected, uint256 provided);
    error TransferFailed();
    error InvalidSplit();

    // ──────────────────────────── Constructor ────────────────────────────

    constructor(address _treasury, address _arbitrator) Ownable(msg.sender) {
        treasury = _treasury;
        arbitrator = _arbitrator;
    }

    // ──────────────────────────── External (Buyer) ────────────────────────────

    /// @notice Create and fund an order in one transaction.
    /// @dev For native token: msg.value == amount. For ERC-20: msg.value == 0, approve first.
    function createAndFundOrder(
        bytes32 listingId,
        address seller,
        address token,
        uint256 amount,
        bytes32 termsHash,
        uint64 deadline
    ) external payable nonReentrant returns (bytes32 orderId) {
        if (amount == 0) revert InvalidAmount();
        if (deadline <= uint64(block.timestamp)) revert InvalidDeadline();

        orderId = keccak256(abi.encodePacked(listingId, msg.sender, seller, block.timestamp, _allOrderIds.length));

        uint256 fee = (amount * FEE_BPS) / FEE_DENOMINATOR;

        if (token == address(0)) {
            // Native xDAI
            if (msg.value != amount) revert WrongNativeAmount(amount, msg.value);
        } else {
            // ERC-20 (USDC etc.)
            if (msg.value != 0) revert WrongNativeAmount(0, msg.value);
            IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        }

        orders[orderId] = Order({
            id: orderId,
            listingId: listingId,
            buyer: msg.sender,
            seller: seller,
            token: token,
            amount: amount,
            protocolFee: fee,
            termsHash: termsHash,
            status: OrderStatus.Funded,
            createdAt: uint64(block.timestamp),
            deadline: deadline,
            completedAt: 0
        });

        _ordersByBuyer[msg.sender].push(orderId);
        _ordersBySeller[seller].push(orderId);
        _allOrderIds.push(orderId);

        emit OrderCreated(orderId, listingId, msg.sender, seller, amount);
    }

    /// @notice Buyer confirms the service was delivered. Seller must then call claimFunds().
    function confirmCompletion(bytes32 orderId) external {
        Order storage order = orders[orderId];
        if (order.id == bytes32(0)) revert OrderNotFound(orderId);
        if (order.buyer != msg.sender) revert NotBuyer(orderId);
        if (order.status != OrderStatus.Funded) revert OrderNotFunded(orderId);

        order.status = OrderStatus.Completed;
        order.completedAt = uint64(block.timestamp);

        emit OrderCompleted(orderId, order.amount - order.protocolFee, order.protocolFee);
    }

    /// @notice Buyer requests refund (only after deadline has passed OR seller hasn't responded).
    function requestRefund(bytes32 orderId) external nonReentrant {
        Order storage order = orders[orderId];
        if (order.id == bytes32(0)) revert OrderNotFound(orderId);
        if (order.buyer != msg.sender) revert NotBuyer(orderId);
        if (order.status != OrderStatus.Funded) revert OrderNotFunded(orderId);
        if (uint64(block.timestamp) < order.deadline) revert DeadlineNotPassed(orderId);

        order.status = OrderStatus.Refunded;
        emit OrderRefunded(orderId, order.amount);

        _sendFunds(order.token, payable(order.buyer), order.amount);
    }

    /// @notice Either party can initiate a dispute.
    function disputeOrder(bytes32 orderId) external {
        Order storage order = orders[orderId];
        if (order.id == bytes32(0)) revert OrderNotFound(orderId);
        if (order.buyer != msg.sender && order.seller != msg.sender) revert NotParty(orderId);
        if (order.status != OrderStatus.Funded) revert OrderNotFunded(orderId);

        order.status = OrderStatus.Disputed;
        emit OrderDisputed(orderId, msg.sender);
    }

    // ──────────────────────────── External (Seller) ────────────────────────────

    /// @notice Seller can claim funds after buyer confirms OR after deadline with auto-release.
    function claimFunds(bytes32 orderId) external nonReentrant {
        Order storage order = orders[orderId];
        if (order.id == bytes32(0)) revert OrderNotFound(orderId);
        if (order.seller != msg.sender) revert NotSeller(orderId);
        if (order.status != OrderStatus.Completed) revert OrderNotCompleted(orderId);

        _releaseFunds(order);
    }

    // ──────────────────────────── External (Arbitrator) ────────────────────────────

    /// @notice Arbitrator resolves a dispute, splitting funds between buyer and seller.
    function resolveDispute(
        bytes32 orderId,
        uint256 buyerRefund,
        uint256 sellerPayment
    ) external nonReentrant {
        if (msg.sender != arbitrator) revert NotArbitrator();

        Order storage order = orders[orderId];
        if (order.id == bytes32(0)) revert OrderNotFound(orderId);
        if (order.status != OrderStatus.Disputed) revert OrderNotDisputed(orderId);

        uint256 fee = (sellerPayment * FEE_BPS) / FEE_DENOMINATOR;
        if (buyerRefund + sellerPayment > order.amount) revert InvalidSplit();

        order.status = OrderStatus.Resolved;

        emit OrderResolved(orderId, buyerRefund, sellerPayment - fee);

        if (buyerRefund > 0) {
            _sendFunds(order.token, payable(order.buyer), buyerRefund);
        }
        if (sellerPayment > fee) {
            _sendFunds(order.token, payable(order.seller), sellerPayment - fee);
        }
        if (fee > 0) {
            _sendFunds(order.token, payable(treasury), fee);
        }
        // Any remainder to treasury
        uint256 remainder = order.amount - buyerRefund - sellerPayment;
        if (remainder > 0) {
            _sendFunds(order.token, payable(treasury), remainder);
        }
    }

    // ──────────────────────────── Admin ────────────────────────────

    function setTreasury(address _treasury) external onlyOwner {
        treasury = _treasury;
        emit TreasuryUpdated(_treasury);
    }

    function setArbitrator(address _arbitrator) external onlyOwner {
        arbitrator = _arbitrator;
        emit ArbitratorUpdated(_arbitrator);
    }

    // ──────────────────────────── View ────────────────────────────

    function getOrder(bytes32 orderId) external view returns (Order memory) {
        Order memory o = orders[orderId];
        if (o.id == bytes32(0)) revert OrderNotFound(orderId);
        return o;
    }

    function getOrdersByBuyer(address buyer) external view returns (bytes32[] memory) {
        return _ordersByBuyer[buyer];
    }

    function getOrdersBySeller(address seller) external view returns (bytes32[] memory) {
        return _ordersBySeller[seller];
    }

    function getAllOrderIds() external view returns (bytes32[] memory) {
        return _allOrderIds;
    }

    // ──────────────────────────── Internal ────────────────────────────

    function _releaseFunds(Order storage order) internal {
        uint256 fee = order.protocolFee;
        uint256 sellerAmount = order.amount - fee;

        _sendFunds(order.token, payable(order.seller), sellerAmount);
        if (fee > 0) {
            _sendFunds(order.token, payable(treasury), fee);
        }
    }

    function _sendFunds(address token, address payable recipient, uint256 amount) internal {
        if (amount == 0) return;
        if (token == address(0)) {
            (bool ok,) = recipient.call{value: amount}("");
            if (!ok) revert TransferFailed();
        } else {
            IERC20(token).safeTransfer(recipient, amount);
        }
    }

    receive() external payable {}
}
