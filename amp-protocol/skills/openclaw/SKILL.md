---
name: amp_marketplace
description: Search, negotiate, and transact on the AMP Agent Marketplace Protocol — accommodation, transport, food, professional services, AI agent tasks, and digital/physical goods on Gnosis Chain.
metadata: {"openclaw":{"requires":{"bins":["amp"],"env":[]},"primaryEnv":"AMP_PRIVATE_KEY","install":[{"id":"node","kind":"node","package":"@amp-protocol/cli","bins":["amp"],"label":"Install AMP CLI (npm)"}]}}
---

# AMP Marketplace Skill

## What this skill does

AMP is a universal on-chain marketplace on Gnosis Chain (Chiado testnet). Use this skill when the user wants to:
- Search for or compare listings (accommodation, transport, food, services, goods, AI agents)
- Get price quotes and negotiate with seller agents via the A2A protocol
- Create escrow-backed orders
- Publish their own listings
- Check on order status or seller reputation

Trigger phrases: "find me a…", "book a…", "search for…", "how much is…", "compare prices for…", "what's available near…", "list something for sale", "check my orders".

## Setup

```bash
npm install -g @amp-protocol/cli
amp config set indexer http://localhost:3001
amp status
```

For write operations (create order, create listing) the user needs a funded Gnosis Chain wallet:
```bash
export AMP_PRIVATE_KEY=0x...
```

## Categories

| Path | Examples |
|---|---|
| `services/accommodation` | Short-term rentals, hotels, co-living |
| `services/transport` | Rides, airport pickups, logistics |
| `services/food` | Restaurant delivery, catering, meal prep |
| `services/professional` | Legal, accounting, auditing, consulting |
| `services/agent` | AI tasks, code, reports, research |
| `goods/physical` | Electronics, furniture, raw materials |
| `goods/digital` | Software, datasets, licenses |

## Commands

### Discovery

```bash
# Check protocol health
amp status

# Search by category (returns JSON with listing IDs, prices, seller addresses)
amp search --category "services/accommodation"
amp search --category "services/transport" --price-max 0.05
amp search --keywords "studio porto river view"
amp search --category "services/agent" --all   # include inactive listings

# Full listing detail
amp listing get <listing-id>

# Seller reputation (completed orders, avg rating, dispute count)
amp reputation <wallet-address>
```

### Negotiation (A2A)

Negotiation happens in three steps: quote → (optional) counter → accept.

```bash
# Step 1: request a quote (handles A2A or simulates if no agent card)
amp negotiate quote --listing <id> --params '{"nights":3,"guests":2}'
# Returns: sessionId, price, unit, token, notes

# Step 2: counter if price is too high
amp negotiate counter --session <sessionId> --params '{"max_price":0.018}'
# Returns: accepted (bool), new price, seller notes

# Step 3: accept the final offer
amp negotiate accept --session <sessionId>
# Returns: bookingRef, status

# View active negotiation sessions
amp negotiate list
```

### Orders (on-chain)

```bash
# Create and fund an escrow order (requires AMP_PRIVATE_KEY)
amp order create --listing <id> --amount <xDAI>

# Check order status
amp order status <order-id>

# Confirm completion as buyer (releases funds to seller)
amp order confirm <order-id>
```

### Listings (sellers)

```bash
# Create a listing (requires AMP_PRIVATE_KEY)
amp listing create \
  --category "services/accommodation" \
  --price 0.015 \
  --unit night \
  --title "Studio near Ribeira, Porto" \
  --description "Modern studio, 2 min walk to the river, fast wifi"

# Pause or remove a listing you own
amp listing pause <id>
amp listing remove <id>
```

## Workflow guidelines

**Before recommending a listing:**
- Always check `amp reputation <seller-address>` if the user is about to spend money.
- Show prices in xDAI with an approximate USD equivalent (1 xDAI ≈ $1).
- Present multiple options as a comparison when available: name, price/unit, seller rating.

**During negotiation:**
- Start counter-offers at 85–90% of the asking price.
- Move in 5% increments; stop when within 5% of asking or seller holds firm.
- Never reveal the user's actual maximum budget to the seller agent. Use `budget_hint` = 90% of real max.
- Negotiation sessions expire after 24 hours — flag time-sensitive ones.

**Before creating an order:**
- Always confirm the final price and seller address with the user in plain language.
- Do not call `amp order create` without the user explicitly saying "yes, proceed" or equivalent.
- Show the escrow deadline and explain that it acts as an automatic refund timer.

**Prices and tokens:**
- Native currency is xDAI on Gnosis Chain. 1 xDAI ≈ $1 USD.
- `pricingToken: 0x000...000` means native xDAI (no ERC-20 needed).
- The `basePrice` in API responses is in wei; use `basePriceEther` for human-readable form.
