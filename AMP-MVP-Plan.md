# AMP MVP — Implementation Plan

## Gnosis Chain · Web App · Claude Skill · OpenClaw Skill

---

## 1. MVP Scope

The MVP proves the core loop: **a human or agent creates a listing → another agent discovers it → agents negotiate via A2A → settlement happens on-chain**.

### In Scope

| Component                | Deliverable                                              |
|--------------------------|----------------------------------------------------------|
| Smart Contracts          | ListingRegistry, AMPEscrow, ReputationLedger on Gnosis   |
| Indexer                  | Subgraph (The Graph) or Ponder indexer for listing search |
| Web App                  | React app for humans: create/browse/book listings         |
| Claude Skill (`SKILL.md`)| Buyer-side agent skill for discovering and booking via AMP|
| OpenClaw Skill           | Helper client + skill for programmatic AMP interaction    |
| A2A Agent (seller demo)  | Minimal A2A agent that auto-responds to quote requests    |
| A2A Agent (buyer demo)   | Minimal A2A agent that negotiates on behalf of user       |

### Out of Scope (v1+)

- Cross-chain settlement
- Full dispute resolution (Kleros integration)
- Agent identity (ERC-6551)
- Governance / DAO
- Mobile app
- Shutter-encrypted settlement

---

## 2. Smart Contracts

All contracts deploy to **Gnosis Chain** (chainId 100). Payment token for MVP: **xDAI** (native) and **USDC on Gnosis**.

### 2.1 ListingRegistry.sol

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

struct Listing {
    bytes32 id;
    address creator;
    ListingStatus status;
    bytes32 category;          // keccak256("services/accommodation")
    string metadataURI;        // ipfs://Qm.../metadata.json
    address pricingToken;      // address(0) = xDAI
    uint256 basePrice;         // in token's smallest unit
    string pricingUnit;        // "night", "hour", "project"
    string agentCardURL;       // A2A agent card URL
    uint64 createdAt;
    uint64 expiresAt;
    uint256 deposit;           // anti-spam deposit in xDAI
}

enum ListingStatus { Active, Paused, Fulfilled, Expired, Removed }

interface IListingRegistry {
    event ListingCreated(bytes32 indexed id, address indexed creator, bytes32 category);
    event ListingUpdated(bytes32 indexed id);
    event ListingRemoved(bytes32 indexed id);

    function createListing(
        bytes32 category,
        string calldata metadataURI,
        address pricingToken,
        uint256 basePrice,
        string calldata pricingUnit,
        string calldata agentCardURL,
        uint64 expiresAt
    ) external payable returns (bytes32 listingId);
    // msg.value = anti-spam deposit (minimum 1 xDAI for MVP)

    function updateListing(bytes32 listingId, string calldata metadataURI, uint256 basePrice) external;
    function pauseListing(bytes32 listingId) external;
    function removeListing(bytes32 listingId) external; // refunds deposit
    function getListing(bytes32 listingId) external view returns (Listing memory);
    function getListingsByCreator(address creator) external view returns (bytes32[] memory);
}
```

**Key decisions for MVP:**

- `category` is a `bytes32` hash. The web app and skills maintain a human-readable category tree client-side. On-chain, categories are just hashes for efficient filtering.
- `metadataURI` points to IPFS. For MVP, we can also accept `https://` URIs and pin to IPFS later.
- Anti-spam deposit is 1 xDAI minimum. Refunded on voluntary removal if no disputes.
- Listings expire automatically. No on-chain cron — indexer marks expired listings.

### 2.2 AMPEscrow.sol

```solidity
struct Order {
    bytes32 id;
    bytes32 listingId;
    address buyer;
    address seller;
    address token;
    uint256 amount;
    bytes32 termsHash;         // keccak256 of agreed terms JSON
    OrderStatus status;
    uint64 createdAt;
    uint64 deadline;           // auto-refund after this
    uint64 completedAt;
}

enum OrderStatus { Created, Funded, Completed, Disputed, Refunded, Resolved }

interface IAMPEscrow {
    event OrderCreated(bytes32 indexed orderId, bytes32 indexed listingId, address buyer, address seller);
    event OrderFunded(bytes32 indexed orderId, uint256 amount);
    event OrderCompleted(bytes32 indexed orderId);
    event OrderDisputed(bytes32 indexed orderId);
    event OrderRefunded(bytes32 indexed orderId);

    function createAndFundOrder(
        bytes32 listingId,
        address seller,
        address token,
        uint256 amount,
        bytes32 termsHash,
        uint64 deadline
    ) external payable returns (bytes32 orderId);

    function confirmCompletion(bytes32 orderId) external;   // buyer confirms service delivered
    function claimFunds(bytes32 orderId) external;          // seller claims after confirmation
    function requestRefund(bytes32 orderId) external;       // buyer requests before completion
    function disputeOrder(bytes32 orderId) external;        // either party

    // MVP: disputes resolved by a trusted arbitrator address (multisig)
    function resolveDispute(
        bytes32 orderId,
        uint256 buyerRefund,
        uint256 sellerPayment
    ) external;  // onlyArbitrator
}
```

**MVP simplifications:**

- Dispute resolution by a trusted multisig (not Kleros). Upgradeable later.
- Protocol fee: 0.5% deducted on `claimFunds()`, sent to treasury.
- Auto-refund: if deadline passes and seller hasn't claimed, buyer can call `requestRefund()`.
- Supports both xDAI (native) and ERC-20 (USDC) payments.

### 2.3 ReputationLedger.sol

```solidity
struct Reputation {
    uint256 completedOrders;
    uint256 totalVolume;
    uint256 totalRatingSum;     // sum of all ratings (1-5 scale, stored as 1-5)
    uint256 ratingCount;
    uint256 disputesInitiated;
    uint256 disputesLost;
}

interface IReputationLedger {
    event ReviewSubmitted(bytes32 indexed orderId, address indexed reviewer, address indexed reviewee, uint8 rating);

    function submitReview(bytes32 orderId, uint8 rating, string calldata reviewURI) external;
    // Can only be called once per order per party (buyer reviews seller, seller reviews buyer)

    function getReputation(address account) external view returns (Reputation memory);
    function getAverageRating(address account) external view returns (uint256); // returns rating * 100
}
```

### 2.4 Deployment

```
Network:        Gnosis Chain (100)
Compiler:       Solidity 0.8.24
Framework:      Foundry
Verification:   Gnosisscan
Treasury:       Gnosis Safe multisig
Arbitrator:     Same multisig (MVP)
```

---

## 3. Indexer

For MVP, use **Ponder** (TypeScript, faster dev cycle than The Graph subgraphs).

Indexed entities:

```typescript
// ponder.schema.ts
export const Listing = createTable({
  id:           "bytes32",
  creator:      "address",
  status:       "int",
  category:     "bytes32",
  categoryName: "string",      // resolved client-side, stored for search
  metadataURI:  "string",
  pricingToken: "address",
  basePrice:    "bigint",
  pricingUnit:  "string",
  agentCardURL: "string",
  deposit:      "bigint",
  createdAt:    "bigint",
  expiresAt:    "bigint",
  // Denormalized from metadata (fetched on indexing)
  title:        "string",
  description:  "string",
  imageURL:     "string",
  geoLat:       "float",
  geoLng:       "float",
  region:       "string",
});

export const Order = createTable({
  id:           "bytes32",
  listingId:    "bytes32",
  buyer:        "address",
  seller:       "address",
  token:        "address",
  amount:       "bigint",
  status:       "int",
  createdAt:    "bigint",
  deadline:     "bigint",
});

export const Review = createTable({
  id:           "string",    // orderId-reviewer
  orderId:      "bytes32",
  reviewer:     "address",
  reviewee:     "address",
  rating:       "int",
  reviewURI:    "string",
  createdAt:    "bigint",
});
```

**API endpoints** exposed by Ponder:

| Endpoint                       | Purpose                              |
|--------------------------------|--------------------------------------|
| `GET /listings`                | Search/filter listings                |
| `GET /listings/:id`           | Single listing with metadata          |
| `GET /listings?category=...`  | Filter by category                    |
| `GET /listings?region=...`    | Filter by region                      |
| `GET /listings?priceMax=...`  | Filter by price                       |
| `GET /orders/:id`             | Order status                          |
| `GET /reputation/:address`    | Reputation for an address             |
| `GET /reviews?listing=...`    | Reviews for a listing's creator       |

---

## 4. Web Application

React + Vite + wagmi/viem + RainbowKit. Deployed to Vercel/Netlify.

### 4.1 Pages

| Page                  | Route                 | Description                                    |
|-----------------------|-----------------------|------------------------------------------------|
| Home                  | `/`                   | Category grid, featured listings, search bar    |
| Browse                | `/browse`             | Filterable listing grid (category, price, region, rating) |
| Listing Detail        | `/listing/:id`        | Full metadata, images, reviews, book/negotiate button |
| Create Listing        | `/create`             | Multi-step form: category → details → pricing → agent card → deposit & publish |
| My Listings           | `/my/listings`        | Seller dashboard: manage own listings           |
| My Orders             | `/my/orders`          | Buyer/seller order history, confirm/dispute actions |
| Profile               | `/profile/:address`   | Reputation, reviews, listing history            |

### 4.2 Key Flows

**Create Listing Flow:**

```
[Select Category] → [Title, Description, Images] → [Pricing: token, price, unit]
    → [Availability: dates/always] → [Agent Card URL (optional)]
    → [Review & Confirm] → [Wallet: pay deposit + sign tx] → [Listed ✓]
```

**Book / Order Flow (human, no agent):**

```
[Browse] → [View Listing] → [Select dates/quantity]
    → [Review terms] → [Wallet: fund escrow]
    → [Order confirmed] → [After fulfillment: confirm completion]
    → [Rate & Review]
```

### 4.3 Tech Stack

```
Frontend:       React 18, Vite, TypeScript
Wallet:         RainbowKit + wagmi v2 + viem
Styling:        Tailwind CSS
IPFS:           Pinata SDK (for metadata upload)
State:          Zustand (lightweight)
Forms:          React Hook Form
Indexer API:    Ponder (REST/GraphQL)
Deploy:         Vercel
```

---

## 5. Claude Skill (`SKILL.md`)

The Claude skill enables any Claude instance to act as a buyer-side AMP agent.

### 5.1 Skill File

```markdown
---
name: amp-marketplace
description: >
  Use this skill when the user wants to find, compare, negotiate, or book
  goods and services on the AMP (Agent Marketplace Protocol). Triggers include:
  "find me a...", "book a...", "search for...", "compare prices for...",
  "what's available for...", or any request that involves discovering
  real-world or digital services/goods. Also use when the user asks to
  list something for sale, check order status, or manage AMP listings.
---

# AMP Marketplace Skill

## Overview

AMP is a universal marketplace protocol on Gnosis Chain. You can search listings,
negotiate with seller agents, and execute bookings/purchases on behalf of the user.

## Setup

The AMP CLI client must be installed:

```bash
npm install -g @amp-protocol/cli
```

The CLI provides these commands:

### Search & Discovery

```bash
# Search listings
amp search --category "services/accommodation" --region "NO" --price-max 3000 --currency EUR

# Get listing details
amp listing <listing-id>

# Get seller reputation
amp reputation <address>
```

### Negotiation (A2A)

```bash
# Request a quote from a listing's seller agent
amp negotiate quote --listing <listing-id> \
  --params '{"dates":"2026-06-15/2026-06-29","guests":4,"budget":3000,"currency":"EUR"}'

# Send a counter-offer
amp negotiate counter --session <session-id> \
  --params '{"max_price":2800,"flexible_dates":true}'

# Accept an offer
amp negotiate accept --session <session-id>
```

### Orders & Settlement

```bash
# Create and fund an order (requires wallet key or hardware wallet)
amp order create --listing <listing-id> \
  --amount 2800 --token xDAI \
  --terms-hash <hash> --deadline 2026-07-01

# Confirm completion
amp order confirm <order-id>

# Check order status
amp order status <order-id>
```

### Listing Management (for sellers)

```bash
# Create a listing
amp listing create \
  --category "services/accommodation" \
  --title "Fjord cabin in Geiranger" \
  --price 200 --unit night --token xDAI \
  --metadata ./metadata.json \
  --agent-card "https://myagent.example/.well-known/agent.json" \
  --deposit 1

# Update a listing
amp listing update <listing-id> --price 180

# Pause/remove
amp listing pause <listing-id>
amp listing remove <listing-id>
```

## Workflow: Finding and Booking (Buyer Agent)

1. Parse the user's request into search parameters (category, region, dates, budget, preferences).
2. Run `amp search` with those parameters.
3. For the top results, run `amp listing <id>` to get full details.
4. For promising listings, check `amp reputation <address>`.
5. Use `amp negotiate quote` to request quotes from top 3-5 listings.
6. Compare responses. If prices are above budget, use `amp negotiate counter`.
7. Present the best 2-3 options to the user with price, terms, and reputation data.
8. On user approval, run `amp negotiate accept` then `amp order create`.
9. Report the order ID and status to the user.

## Workflow: Listing Something (Seller)

1. Help the user define: category, title, description, pricing, availability.
2. Generate the metadata JSON.
3. Upload metadata to IPFS via `amp metadata upload ./metadata.json`.
4. Create the listing via `amp listing create`.
5. Report the listing ID and URL.

## Important Notes

- All monetary amounts are in the listing's denomination token (usually xDAI or USDC).
- The user must have a funded wallet on Gnosis Chain for any transaction.
- Negotiation sessions expire after 24 hours.
- Always show the user the final price and terms before executing an order.
- Never commit funds without explicit user approval.
```

### 5.2 Skill Behavior Guidelines

The Claude skill acts as a buyer-side agent with these constraints:

1. **Never spend without approval.** Always present options and get explicit "yes, book it" before calling `amp order create`.
2. **Negotiate assertively but fairly.** Counter-offer if the price is above the user's budget. Don't lowball below the listing's `min_price`.
3. **Present structured comparisons.** When showing options, include: price, rating, key differentiators, and any negotiated extras.
4. **Respect privacy.** Don't share the user's exact budget with seller agents. Use "budget hints" that leave negotiation room.

---

## 6. OpenClaw Skill

OpenClaw skills are for agents running on open agent frameworks (AutoGPT, CrewAI, LangChain, etc.). The OpenClaw skill wraps the same CLI but with a structured tool interface.

### 6.1 Skill Definition

```yaml
# openclaw-amp-skill.yaml
name: amp-marketplace
version: 0.1.0
description: |
  Universal marketplace interaction — search, negotiate, and transact
  on the AMP protocol (Gnosis Chain).
  
install:
  - npm install -g @amp-protocol/cli
  - amp config set rpc https://rpc.gnosischain.com
  - amp config set indexer https://amp-indexer.example.com

tools:
  - name: amp_search
    description: Search AMP listings by category, region, price, and keywords
    parameters:
      category:
        type: string
        description: "Category path (e.g., 'services/accommodation')"
      region:
        type: string
        description: "ISO country code or region name"
      price_max:
        type: number
        description: "Maximum price per unit"
      price_min:
        type: number
        description: "Minimum price per unit"
      currency:
        type: string
        description: "Price currency (EUR, USD, xDAI)"
      keywords:
        type: string
        description: "Free-text search keywords"
    command: |
      amp search \
        {{#if category}}--category "{{category}}"{{/if}} \
        {{#if region}}--region "{{region}}"{{/if}} \
        {{#if price_max}}--price-max {{price_max}}{{/if}} \
        {{#if currency}}--currency {{currency}}{{/if}} \
        {{#if keywords}}--keywords "{{keywords}}"{{/if}} \
        --format json

  - name: amp_listing_detail
    description: Get full details for a specific AMP listing
    parameters:
      listing_id:
        type: string
        required: true
    command: amp listing {{listing_id}} --format json

  - name: amp_negotiate_quote
    description: Request a price quote from a listing's seller agent via A2A
    parameters:
      listing_id:
        type: string
        required: true
      params:
        type: object
        description: "Negotiation parameters (dates, guests, budget_hint, preferences)"
    command: amp negotiate quote --listing {{listing_id}} --params '{{params | json}}'

  - name: amp_negotiate_counter
    description: Send a counter-offer in an active negotiation session
    parameters:
      session_id:
        type: string
        required: true
      params:
        type: object
    command: amp negotiate counter --session {{session_id}} --params '{{params | json}}'

  - name: amp_negotiate_accept
    description: Accept the current offer in a negotiation session
    parameters:
      session_id:
        type: string
        required: true
    command: amp negotiate accept --session {{session_id}}

  - name: amp_order_create
    description: Create and fund an escrow order on Gnosis Chain
    parameters:
      listing_id:
        type: string
        required: true
      amount:
        type: number
        required: true
      token:
        type: string
        default: xDAI
      terms_hash:
        type: string
        required: true
      deadline:
        type: string
        description: "ISO date for auto-refund deadline"
    command: |
      amp order create --listing {{listing_id}} \
        --amount {{amount}} --token {{token}} \
        --terms-hash {{terms_hash}} --deadline {{deadline}}

  - name: amp_order_status
    description: Check the status of an existing order
    parameters:
      order_id:
        type: string
        required: true
    command: amp order status {{order_id}} --format json

  - name: amp_reputation
    description: Get the on-chain reputation score for an address
    parameters:
      address:
        type: string
        required: true
    command: amp reputation {{address}} --format json
```

---

## 7. A2A Demo Agents

### 7.1 Seller Agent (demo)

A minimal A2A-compatible agent that responds to `amp/request_quote` tasks:

```
Runtime:        Node.js + Express
A2A SDK:        @anthropic/a2a-sdk (or google's reference impl)
Behavior:       
  - Receives quote requests
  - Checks listing availability (from a local calendar)
  - Returns a quote (base_price * nights - 5% if >7 nights)
  - Accepts counter-offers if >= 90% of base_price
  - Confirms on accept
Agent Card:     Served at /.well-known/agent.json
```

### 7.2 Buyer Agent (demo)

A Claude-powered agent that:

```
Runtime:        Node.js + Anthropic SDK
Behavior:
  - Takes natural language input
  - Queries AMP indexer
  - Opens A2A sessions with seller agents
  - Negotiates (starts at 85% of asking, moves up)
  - Presents options ranked by (price * 0.4 + rating * 0.3 + match * 0.3)
  - Executes order on user approval
```

---

## 8. Implementation Timeline

### Phase 1: Contracts + Indexer (Weeks 1-3)

| Week | Deliverable                                                   |
|------|---------------------------------------------------------------|
| 1    | ListingRegistry.sol — implement, test, deploy to Chiado testnet |
| 1    | AMPEscrow.sol — implement, test, deploy to Chiado              |
| 2    | ReputationLedger.sol — implement, test, deploy to Chiado       |
| 2    | Ponder indexer — schema, event handlers, local dev             |
| 3    | Deploy all contracts to Gnosis mainnet                         |
| 3    | Deploy Ponder indexer (Railway/Render)                         |
| 3    | Seed 10-20 test listings across categories                     |

### Phase 2: Web App (Weeks 3-5)

| Week | Deliverable                                                   |
|------|---------------------------------------------------------------|
| 3-4  | Project scaffold: Vite + React + wagmi + RainbowKit            |
| 4    | Browse page: listing grid with filters, connected to indexer   |
| 4    | Listing detail page: metadata display, reviews, book button    |
| 4-5  | Create listing flow: multi-step form, IPFS upload, tx signing  |
| 5    | Order flow: fund escrow, confirm completion, rate/review       |
| 5    | My Listings / My Orders dashboards                             |
| 5    | Deploy to Vercel, connect to mainnet contracts                 |

### Phase 3: CLI + Skills (Weeks 5-7)

| Week | Deliverable                                                   |
|------|---------------------------------------------------------------|
| 5-6  | `@amp-protocol/cli` — search, listing CRUD, order management  |
| 6    | CLI negotiation commands (A2A client built-in)                 |
| 6    | Claude SKILL.md — write, test with Claude                      |
| 7    | OpenClaw skill YAML — write, test with reference agent         |
| 7    | Demo seller A2A agent (Node.js)                                |
| 7    | Demo buyer A2A agent (Claude-powered)                          |

### Phase 4: Integration + Launch (Weeks 7-8)

| Week | Deliverable                                                   |
|------|---------------------------------------------------------------|
| 7-8  | End-to-end test: human creates listing → agent discovers → negotiates → books |
| 8    | Documentation: protocol spec, API docs, agent integration guide |
| 8    | Landing page                                                    |
| 8    | Launch on Gnosis mainnet with seed listings                     |

---

## 9. Infrastructure

| Component       | Service                | Cost (est./month) |
|-----------------|------------------------|--------------------|
| Smart Contracts | Gnosis Chain           | Gas only (~$5)     |
| Indexer         | Railway / Render       | $20-50             |
| Web App         | Vercel (free tier)     | $0-20              |
| IPFS            | Pinata (free tier)     | $0-20              |
| Demo agents     | Railway / Fly.io       | $10-20             |
| Domain          | amp-protocol.xyz       | $15/year           |
| **Total**       |                        | **~$50-100/month** |

---

## 10. Repository Structure

```
amp-protocol/
├── contracts/                    # Foundry project
│   ├── src/
│   │   ├── ListingRegistry.sol
│   │   ├── AMPEscrow.sol
│   │   └── ReputationLedger.sol
│   ├── test/
│   ├── script/                   # Deploy scripts
│   └── foundry.toml
├── indexer/                      # Ponder project
│   ├── ponder.config.ts
│   ├── ponder.schema.ts
│   └── src/
├── web/                          # React web app
│   ├── src/
│   │   ├── pages/
│   │   ├── components/
│   │   ├── hooks/
│   │   └── lib/
│   └── vite.config.ts
├── cli/                          # @amp-protocol/cli
│   ├── src/
│   │   ├── commands/
│   │   ├── a2a/                  # A2A client
│   │   └── index.ts
│   └── package.json
├── agents/                       # Demo agents
│   ├── seller/                   # A2A seller agent
│   └── buyer/                    # Claude-powered buyer agent
├── skills/
│   ├── claude/
│   │   └── SKILL.md
│   └── openclaw/
│       └── openclaw-amp-skill.yaml
├── docs/
│   ├── protocol-spec.md
│   ├── api-reference.md
│   └── agent-integration.md
└── README.md
```

---

## 11. Success Criteria for MVP

The MVP is successful if the following scenario works end-to-end:

1. **Alice** (human) opens the web app, connects her wallet, and creates a listing for her cabin in Norway — sets price at 200 xDAI/night, uploads photos, provides her seller agent's A2A card URL. She pays 1 xDAI deposit.

2. **Bob** (human using Claude) says: "Find me a cabin in Norway for 2 weeks in June, budget 3000 xDAI."

3. **Claude** (using the AMP skill) searches the AMP indexer, finds Alice's listing, requests a quote from Alice's seller agent via A2A, negotiates a 10% discount for a 14-night stay, and presents the option to Bob.

4. **Bob** approves. Claude executes the order: 2,520 xDAI locked in escrow.

5. After the stay, Bob confirms completion in the web app. Alice claims her funds (minus 0.5% protocol fee = 2,507.4 xDAI). Both leave reviews.

6. Alice's and Bob's reputation scores update on-chain.

If this works, AMP is real.

---

*Built for agents. Accessible to humans. Owned by no one.*
