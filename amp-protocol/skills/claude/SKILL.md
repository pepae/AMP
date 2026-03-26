---
name: amp-marketplace
description: >
  Use this skill when the user wants to find, compare, negotiate, or book
  goods and services on the AMP (Agent Marketplace Protocol). Triggers include:
  "find me a…", "book a…", "search for…", "compare prices for…",
  "what's available for…", or any request that involves discovering
  real-world or digital services/goods. Also use when the user asks to
  list something for sale, check order status, or manage AMP listings.
applyTo: "**"
---

# AMP Marketplace Skill

## Overview

AMP is a universal marketplace protocol on Gnosis Chain. You can search listings,
negotiate with seller agents via A2A, and execute bookings/purchases on behalf of the user.

The AMP CLI (`@amp-protocol/cli`) is your primary interface. All read operations work
against the indexer REST API. Write operations (create listing, fund order) require the
user to have a funded Gnosis Chain wallet with `AMP_PRIVATE_KEY` set.

## Setup

```bash
# Install the CLI
npm install -g @amp-protocol/cli

# Configure indexer endpoint (default: http://localhost:3001)
amp config set indexer https://your-indexer.example.com

# Configure RPC (default: Chiado testnet)
amp config set rpc https://rpc.chiadochain.net

# Check everything is working
amp status
```

## Available Categories

| Category Path              | Examples                                    |
|----------------------------|---------------------------------------------|
| `services/accommodation`   | Short-term rentals, hotels, co-living       |
| `services/transport`       | Rides, logistics, delivery                  |
| `services/food`            | Restaurant delivery, catering, meal prep    |
| `services/professional`    | Legal, accounting, consulting               |
| `services/agent`           | AI tasks, code, reports, audits             |
| `goods/physical`           | Electronics, furniture, raw materials       |
| `goods/digital`            | Software licenses, datasets, NFTs           |

## Commands

### Search & Discovery

```bash
# Search by category
amp search --category "services/accommodation"

# Search with price filter
amp search --category "services/accommodation" --price-max 0.5

# Full-text keyword search
amp search --keywords "cabin norway fjord"

# Show all fields as JSON
amp search --category "services/accommodation" --json

# Get full listing details
amp listing get <listing-id>

# Check a seller's reputation
amp reputation <address>

# Protocol health + stats
amp status
```

### Negotiation (A2A)

```bash
# Request a quote from a listing's seller agent
amp negotiate quote --listing <listing-id> \
  --params '{"nights":7,"guests":4,"budget_hint":1.5}'

# Send a counter-offer
amp negotiate counter --session <session-id> \
  --params '{"max_price":0.18,"flexible_dates":true}'

# Accept an offer
amp negotiate accept --session <session-id>
```

### Orders & Settlement

```bash
# Create and fund an escrow order
amp order create --listing <listing-id> --amount 0.2

# Check order status
amp order status <order-id>

# Confirm completion (as buyer, after service delivered)
amp order confirm <order-id>

# Request a refund (before deadline)
amp order refund <order-id>
```

### Listing Management (for sellers)

```bash
# Create a listing
amp listing create \
  --category "services/accommodation" \
  --title "Fjord cabin in Geiranger" \
  --price 0.2 --unit night \
  --description "2BR wooden cabin with fjord view" \
  --agent-card "https://myagent.example/.well-known/agent.json" \
  --expires-days 365

# Update price or metadata URI
amp listing update <listing-id> --price 0.18

# Pause a listing temporarily
amp listing pause <listing-id>

# Remove a listing (refunds deposit)
amp listing remove <listing-id>
```

---

## Workflow: Buyer — Find and Book

Follow these steps when a user asks to find or book something:

### Step 1 — Parse the request

Extract:
- **category** (map to AMP category path)
- **keywords** (location, type, features)
- **price_max** (in xDAI; convert from user's currency if needed)
- **preferences** (e.g., "fjord view", "3+ bedrooms")

### Step 2 — Search

```bash
amp search --category "<path>" --keywords "<terms>" --price-max <n>
```

### Step 3 — Inspect top results

For the 3-5 most promising listings:
```bash
amp listing get <id>
amp reputation <seller-address>
```

### Step 4 — Get quotes

```bash
amp negotiate quote --listing <id> --params '{"nights":N,"guests":N,"budget_hint":X}'
```

### Step 5 — Negotiate if needed

If the quoted price exceeds the user's budget:
```bash
amp negotiate counter --session <sid> --params '{"max_price":X}'
```
Start at 85% of asking price, move up in 5% increments. Never go below listing's implied floor.

### Step 6 — Present options

Show the user a comparison table:
- Title, seller reputation, quoted price, key features, any negotiated extras
- Include the session ID so they can proceed

### Step 7 — Book (only with explicit user approval)

After the user says "yes, book it" or equivalent:
```bash
amp negotiate accept --session <sid>
amp order create --listing <id> --amount <final-price>
```

Report the order ID and remind them to confirm completion after the service is delivered.

---

## Workflow: Seller — Create a Listing

When a user wants to list something:

1. Gather: category, title, description, price per unit, unit (night/hour/item), agent card URL (optional)
2. Create the listing:
   ```bash
   amp listing create --category "<path>" --title "<title>" \
     --description "<desc>" --price <n> --unit <unit>
   ```
3. Report the listing ID.

---

## Important Rules

1. **Never spend without explicit approval.** Always present the final price and terms before calling `amp order create`. Get a clear "yes" from the user.
2. **Negotiate assertively but fairly.** Use budget hints that leave room for negotiation. Don't reveal the user's hard maximum.
3. **Present structured comparisons.** Use tables when showing multiple options.
4. **Respect privacy.** Don't share the user's exact budget with seller agents.
5. **Monetary units.** All prices on the protocol are in xDAI (Gnosis Chain native token, ≈ $1 USD). Convert clearly for the user.
6. **Negotiation sessions expire in 24 hours.** Warn the user if they're close to expiry.
7. **Wallet requirement.** Any transaction (create listing, fund order) requires `AMP_PRIVATE_KEY` to be set in the environment.

---

## Error Handling

| Error | Likely cause | Fix |
|-------|-------------|-----|
| `Indexer unreachable` | Indexer not running | Run `amp status` to check; set correct URL with `amp config set indexer <url>` |
| `Wallet key required` | No private key | Set `AMP_PRIVATE_KEY` env variable |
| `InsufficientDeposit` | Deposit too low | Use minimum `--deposit 0.001` (testnet) or `1` (mainnet) |
| `Session not found` | Old/expired session | Re-run `amp negotiate quote` |
| `Listing not active` | Listing paused/removed | Search for alternatives |
