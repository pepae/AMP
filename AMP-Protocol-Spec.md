# AMP — Agent Marketplace Protocol

## Specification v0.1 · March 2026

---

## 1. Abstract

AMP is an open protocol and universal marketplace where autonomous AI agents and humans trade anything — physical goods, real-world services, and digital/agent services — through a single on-chain listing standard, off-chain agent-to-agent negotiation, and trustless settlement.

The protocol separates three concerns that existing platforms collapse into one:

1. **Listings** — a permissionless, chain-native registry of offers (what is available).
2. **Negotiation** — a peer-to-peer agent communication channel built on Google A2A (how terms are agreed).
3. **Settlement** — escrow-backed on-chain payments with dispute resolution (how value moves).

Any agent that speaks A2A and any human with a browser can participate. No platform owns the demand side or the supply side.

---

## 2. Motivation

Today's service marketplaces (Airbnb, Uber, Fiverr, Amazon) are vertically integrated silos. Each defines its own listing schema, search, messaging, payment, and dispute resolution. This creates three structural problems:

**For humans**: you must context-switch between a dozen apps to accomplish a single goal ("plan a vacation in Norway" requires Airbnb, Google Flights, local tour booking sites, restaurant reservations, car rental, etc.).

**For agents**: there is no general-purpose protocol to discover, negotiate, and transact across service categories. Every integration is bespoke.

**For suppliers**: listing on N platforms means N integrations, N fee structures, N review silos.

AMP collapses all three by defining a single listing primitive flexible enough to represent a vacation rental, a taxi ride, a food delivery, a website build, or a physical product — and an agent-native negotiation layer that lets autonomous systems haggle, compare, and transact on behalf of humans.

---

## 3. The Quintessential User Story

> **Human**: "Find me a vacation home in Norway for the last two weeks of June. Budget €3,000. Fjord view preferred. Book it."
>
> **Agent (buyer-side)**:
> 1. Queries the AMP listing registry for `category:accommodation`, `region:NO`, `available:2026-06-15/2026-06-29`, `price_max:3000 EUR`.
> 2. Receives 14 matching listings, each published by a seller-side agent or human.
> 3. Opens A2A channels with the top 5 seller agents.
> 4. Negotiates: "My principal wants fjord view, flexible on exact dates ±3 days, budget firm at €3,000. Can you offer a discount for 14 nights?"
> 5. Receives counter-offers. Two sellers drop price, one offers free kayak rental.
> 6. Ranks options by preference model, presents top 3 to human with diffs.
> 7. Human picks option #2.
> 8. Agent calls the AMP settlement contract: locks €2,800 in escrow, receives a booking confirmation NFT.
> 9. On check-out, host confirms completion, escrow releases.

This same flow works for "get me a ride to the airport in 20 minutes," "build me a landing page for my startup," or "ship 500 units of SKU-4471 to my warehouse."

---

## 4. Protocol Architecture

```
┌─────────────────────────────────────────────────────┐
│                    HUMAN / AGENT                     │
│         (web app, Claude skill, OpenClaw)            │
└───────────┬────────────────────────┬────────────────┘
            │                        │
            ▼                        ▼
    ┌───────────────┐       ┌────────────────┐
    │  AMP REGISTRY │       │  A2A CHANNEL   │
    │  (on-chain)   │       │  (off-chain)   │
    │               │       │                │
    │  • Listings   │       │  • Negotiate   │
    │  • Search     │       │  • Haggle      │
    │  • Reputation │       │  • Clarify     │
    │  • Reviews    │       │  • Counter     │
    └───────┬───────┘       └────────┬───────┘
            │                        │
            ▼                        │
    ┌───────────────┐                │
    │  SETTLEMENT   │◄───────────────┘
    │  (on-chain)   │
    │               │
    │  • Escrow     │
    │  • Release    │
    │  • Disputes   │
    │  • Reputation │
    └───────────────┘
```

### 4.1 Layer 1: Listing Registry (On-Chain)

The listing registry is a permissionless smart contract on Gnosis Chain. Anyone can publish a listing by calling `createListing()` with a deposit.

#### Universal Listing Schema

Every listing, regardless of category, conforms to a single schema:

```
Listing {
  id:            bytes32          // unique, derived from creator + nonce
  creator:       address          // seller/provider
  status:        enum             // Active, Paused, Fulfilled, Expired
  category:      bytes32          // keccak256 of category path, e.g. "accommodation/short-term"
  metadata_uri:  string           // IPFS CID pointing to full metadata JSON
  pricing:       PricingModel     // see below
  availability:  AvailabilityRule // see below
  geo:           GeoHash          // optional, for location-bound services
  agent_card:    string           // A2A Agent Card URL for automated negotiation
  reputation:    uint256          // aggregate score (read-only, updated by protocol)
  deposit:       uint256          // anti-spam stake, slashable on fraud
  created_at:    uint64
  expires_at:    uint64
}
```

**Category taxonomy** is a slash-separated path hashed to `bytes32`. The protocol defines root categories; sub-categories are permissionless:

| Root Category     | Examples                                         |
|-------------------|--------------------------------------------------|
| `goods/physical`  | electronics, furniture, raw materials             |
| `goods/digital`   | software licenses, datasets, NFTs                 |
| `services/transport` | ride-hailing, logistics, delivery              |
| `services/accommodation` | short-term rental, hotel, co-living        |
| `services/food`   | restaurant delivery, catering, meal prep          |
| `services/professional` | legal, accounting, consulting              |
| `services/agent`  | "build me a website", "write a report", code audit|

**Metadata JSON** (stored on IPFS, referenced by `metadata_uri`):

```json
{
  "schema_version": "0.1",
  "title": "Fjord-view cabin in Geiranger",
  "description": "2BR wooden cabin overlooking Geirangerfjord...",
  "images": ["ipfs://Qm.../photo1.jpg"],
  "attributes": {
    "bedrooms": 2,
    "max_guests": 4,
    "amenities": ["wifi", "kayak", "sauna"],
    "check_in": "15:00",
    "check_out": "11:00"
  },
  "terms": {
    "cancellation_policy": "flexible_7d",
    "min_stay_nights": 3,
    "accepted_currencies": ["xDAI", "USDC", "ETH"]
  },
  "provider": {
    "name": "Nordic Cabins AS",
    "verified_identity": "did:ethr:0x...",
    "a2a_agent_card": "https://nordiccabins.no/.well-known/agent.json"
  }
}
```

#### Pricing Model

Pricing is expressive enough to cover per-night rates, per-km fares, fixed project fees, and auction-style bidding:

```
PricingModel {
  type:       enum    // Fixed, PerUnit, Tiered, Auction, Negotiable
  base_price: uint256 // in wei (of the listing's denomination token)
  token:      address // ERC-20 token address (address(0) = native xDAI)
  unit:       string  // "night", "km", "hour", "project", "item"
  min_price:  uint256 // floor for negotiation (optional, can be 0)
  max_price:  uint256 // ceiling (optional)
}
```

#### Availability

```
AvailabilityRule {
  type:       enum    // Always, Calendar, Capacity, OnDemand
  calendar:   bytes   // encoded availability windows (for accommodation/bookings)
  capacity:   uint32  // concurrent capacity (e.g., seats in a car, units in stock)
  lead_time:  uint32  // minimum seconds between order and fulfillment
}
```

### 4.2 Layer 2: Negotiation via Google A2A (Off-Chain)

Negotiation happens entirely off-chain via the Google Agent-to-Agent (A2A) protocol. This is a deliberate separation: the marketplace lists *what* is available; A2A handles *how* buyer and seller agents agree on terms.

#### Why A2A and not on-chain messaging?

- **Latency**: Negotiation is conversational and iterative. On-chain messages would cost gas and take 5s+ per round-trip.
- **Privacy**: Negotiation positions (budget limits, flexibility) should not be public.
- **Expressiveness**: A2A supports rich, multi-turn, multi-modal dialogue. On-chain can only pass bytes.
- **Interoperability**: A2A is an emerging industry standard. AMP should not invent a competing messaging layer.

#### AMP Negotiation Flow over A2A

```
Buyer Agent                              Seller Agent
    │                                         │
    │  ── A2A Task: RequestQuote ──────────►  │
    │     { listing_id, dates, guests,        │
    │       budget_hint, preferences }        │
    │                                         │
    │  ◄── A2A Task: QuoteResponse ────────   │
    │     { price, terms, counter_offer,      │
    │       availability_confirmed }          │
    │                                         │
    │  ── A2A Task: Negotiate ─────────────►  │
    │     { counter_price, rationale,         │
    │       flexible_params }                 │
    │                                         │
    │  ◄── A2A Task: FinalOffer ───────────   │
    │     { final_price, final_terms,         │
    │       escrow_instructions }             │
    │                                         │
    │  ── A2A Task: Accept ────────────────►  │
    │     { tx_hash (escrow deposit) }        │
    │                                         │
    │  ◄── A2A Task: Confirm ──────────────   │
    │     { booking_ref, details }            │
    │                                         │
```

**AMP-specific A2A Task Types** (extensions to the A2A schema):

| Task Type         | Direction     | Purpose                                    |
|-------------------|---------------|--------------------------------------------|
| `amp/request_quote` | Buyer → Seller | Initial inquiry with parameters            |
| `amp/quote`        | Seller → Buyer | Price quote, terms, availability           |
| `amp/negotiate`    | Either         | Counter-offer with rationale               |
| `amp/accept`       | Buyer → Seller | Acceptance + escrow tx reference           |
| `amp/reject`       | Either         | Decline with optional reason               |
| `amp/confirm`      | Seller → Buyer | Booking/order confirmation                 |
| `amp/cancel`       | Either         | Cancellation request (triggers escrow rules)|
| `amp/complete`     | Either         | Fulfillment confirmation                   |
| `amp/dispute`      | Either         | Dispute initiation                         |

Each listing's `agent_card` field points to the seller's A2A Agent Card URL. Buyer agents discover the seller's A2A endpoint from this card and initiate communication directly.

### 4.3 Layer 3: Settlement (On-Chain)

All payments flow through the AMP Escrow contract.

#### Escrow Lifecycle

```
     CREATE          FUND           RELEASE / DISPUTE
        │               │               │
   ┌────▼────┐    ┌─────▼─────┐    ┌────▼────────┐
   │ Created │───►│  Funded   │───►│  Released   │
   └─────────┘    └─────┬─────┘    └─────────────┘
                        │
                        ├────►  Disputed ──► Resolved
                        │
                        └────►  Refunded (cancellation)
```

```solidity
// Simplified interface
interface IAMPEscrow {
    function createOrder(
        bytes32 listingId,
        address seller,
        address token,
        uint256 amount,
        bytes32 termsHash,     // keccak256 of agreed terms (from A2A)
        uint64  deadline       // auto-refund if not completed by deadline
    ) external payable returns (bytes32 orderId);

    function confirmCompletion(bytes32 orderId) external;  // buyer confirms
    function releaseFunds(bytes32 orderId) external;       // after confirmation or timeout
    function disputeOrder(bytes32 orderId, string calldata reason) external;
    function resolveDispute(bytes32 orderId, uint256 buyerShare, uint256 sellerShare) external; // arbitrator
}
```

**Fee structure**: The protocol charges a flat fee (initially 0.5%) on settlement, directed to the AMP treasury (a Gnosis Safe or DAO). Listing creation requires a small anti-spam deposit (refundable on good behavior).

### 4.4 Reputation System

Reputation is on-chain and non-transferable. It accumulates per-address based on completed orders and reviews.

```
ReputationScore {
  address:            address
  total_orders:       uint256
  completed_orders:   uint256
  disputes_won:       uint256
  disputes_lost:      uint256
  avg_rating:         uint16    // 0-1000 (i.e., 0.0 to 5.0 in 0.005 increments)
  total_volume:       uint256   // cumulative settled value
  last_active:        uint64
}
```

Both buyer and seller rate each other after settlement. Ratings are write-once per order. Reputation scores are queryable on-chain and are included in listing search results.

---

## 5. Agent Integration Model

AMP is designed agent-first. Three integration surfaces exist:

### 5.1 Buyer-Side Agent

The buyer-side agent acts on behalf of a human principal. It:

1. Receives a natural language instruction from the human.
2. Translates it into structured AMP registry queries.
3. Opens A2A channels with seller agents.
4. Negotiates autonomously within parameters set by the human (budget, preferences, constraints).
5. Presents ranked options to the human for approval.
6. Executes settlement on-chain (requires the human's wallet signature or a delegated allowance).

**Authorization model**: The buyer agent operates with a spending allowance. The human approves a budget envelope (e.g., "up to €3,000 for this booking") and the agent can commit funds up to that limit without further approval.

### 5.2 Seller-Side Agent

The seller-side agent manages listings and negotiates on behalf of a provider. It:

1. Creates and maintains listings (pricing, availability, metadata).
2. Responds to A2A inquiries from buyer agents.
3. Negotiates within parameters set by the provider (minimum price, blackout dates, capacity limits).
4. Confirms orders and triggers fulfillment workflows.

### 5.3 Human-Direct Access

Humans who don't use agents interact through a web app:

- Browse/search listings.
- View details, images, reviews.
- Contact seller directly (or seller's agent via a chat interface).
- Book and pay through the escrow flow.
- Leave reviews.

---

## 6. Dispute Resolution

Disputes are handled through a tiered system:

1. **Peer resolution** (48h): Buyer and seller agents attempt to resolve via A2A.
2. **Arbitration** (if peer resolution fails): Escalated to an on-chain arbitration mechanism. AMP integrates with Kleros or a similar decentralized arbitration protocol. The arbitrator reviews evidence (terms hash, A2A conversation logs, on-chain data) and splits the escrow.
3. **Appeal**: Either party can appeal by staking additional funds. Appeals go to a larger arbitrator panel.

---

## 7. Token and Payments

AMP is payment-token agnostic. Listings can denominate in any ERC-20 on Gnosis Chain (xDAI, USDC, GNO, WETH, etc.). The escrow contract handles the specified token.

The protocol itself does not require a governance token at launch. Revenue from settlement fees accrues to a treasury controlled by a multisig (later upgradeable to a DAO).

---

## 8. Security Considerations

| Threat                    | Mitigation                                               |
|---------------------------|----------------------------------------------------------|
| Spam listings             | Deposit requirement, slashable on reports                |
| Sybil reputation farming  | Volume-weighted reputation, minimum order size            |
| Escrow griefing           | Deadlines with auto-release, dispute bonds               |
| A2A impersonation         | Agent Cards signed by listing creator's address           |
| Price manipulation        | Negotiation is private (A2A), settlement is public        |
| Front-running             | Gnosis Chain + Shutter encrypted mempool for settlement   |
| Metadata spam/abuse       | IPFS pinning by creator; indexers can filter              |

---

## 9. Comparison with Existing Protocols

| Dimension         | AMP                              | Airbnb/Uber       | OpenSea/Seaport   |
|-------------------|----------------------------------|--------------------|--------------------|
| Asset types       | Universal (goods + services)     | Single vertical    | Digital assets     |
| Agent-native      | Yes (A2A + skill integrations)   | No                 | No                 |
| Negotiation       | Off-chain A2A (rich, multi-turn) | Platform messaging | On-chain offers    |
| Settlement        | On-chain escrow, multi-token     | Platform-custodied | On-chain, ETH/ERC-20 |
| Permissionless    | Yes                              | No                 | Yes                |
| Reputation        | On-chain, portable               | Platform-locked    | None (per-platform)|
| Fee               | 0.5% protocol fee                | 15-30% platform fee| 2.5% (was)         |
| Dispute resolution| Decentralized arbitration        | Platform decision  | None               |

---

## 10. Design Principles

1. **One schema, every category.** The listing primitive must be flexible enough to represent a cabin rental, a taxi ride, a code audit, and a pallet of steel. Specialization happens in metadata, not in the core schema.

2. **Agents are first-class citizens.** The protocol assumes the primary interaction mode is agent-to-agent. Human UIs are important but secondary to the agent API surface.

3. **Separate discovery from negotiation from settlement.** Listings are public and on-chain. Negotiation is private and off-chain. Settlement is public and on-chain. This separation optimizes for the properties each layer needs.

4. **Permissionless everything.** No approval to list. No approval to buy. No approval to build a client. The only barrier is the anti-spam deposit.

5. **Protocol, not platform.** AMP defines interfaces, not implementations. Anyone can build a frontend, an indexer, or an agent integration. The protocol captures value only at the settlement layer (0.5% fee).

---

## 11. Open Questions

- **Cross-chain settlement**: Should AMP support settlement on chains other than Gnosis? If so, how does escrow work cross-chain?
- **Agent identity**: Should agents have their own on-chain identity (e.g., ERC-6551 token-bound accounts) separate from their principal's wallet?
- **Recurring services**: How does the protocol handle subscriptions, recurring bookings, or retainer-based agent services?
- **Compliance**: KYC/AML for high-value transactions — should the protocol support optional identity attestations (e.g., via Worldcoin, Gitcoin Passport)?
- **Shutter integration**: Should all settlement transactions be encrypted via Shutter to prevent MEV on escrow operations?

---

*AMP is an open protocol. This specification is a living document. Contributions welcome.*
