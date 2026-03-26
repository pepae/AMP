# AMP — Agent Marketplace Protocol

A decentralized marketplace protocol for accommodation, transport, food, professional services, AI agent tasks, and digital/physical goods — built on Gnosis Chain.

---

## Architecture

```
┌────────────────────────────────────────────────────┐
│                   Gnosis Chiado                     │
│  ListingRegistry · AMPEscrow · ReputationLedger     │
└───────────────────────┬────────────────────────────┘
                        │  events / RPC
             ┌──────────▼──────────┐
             │   Indexer (Express)  │  :3001
             │   REST API + SQLite  │
             └──────────┬──────────┘
          ┌─────────────┴─────────────┐
          │                           │
   ┌──────▼──────┐            ┌───────▼──────┐
   │  Web App    │  :5173     │   CLI  /MCP   │
   │  React+Viem │            │   amp · stdio │
   └─────────────┘            └──────────────┘
```

## Contract Addresses (Chiado Testnet — chain ID 10200)

| Contract | Address |
|---|---|
| ListingRegistry | `0x01517B12805AdeC6dCb978FDB139c3bD0A92879E` |
| AMPEscrow | `0xADaA2Eb39eCDfbb457D36d34951daEd08179e3c8` |
| ReputationLedger | `0x79145D065c713596e1c2a1715c5c655dC3641CB5` |

Chiado RPC: `https://rpc.chiadochain.net`  
Explorer: `https://gnosis-chiado.blockscout.com`

---

## Quick Start

### 1. Contracts

```bash
cd contracts
npm install
cp .env.example .env   # add PRIVATE_KEY and CHIADO_RPC_URL
npx hardhat compile
npx hardhat run scripts/deploy.ts --network chiado
```

### 2. Indexer

```bash
cd indexer
npm install
cp .env.example .env   # set RPC_URL and contract addresses
npm start              # http://localhost:3001
```

### 3. Web App

```bash
cd web
npm install
cp .env.example .env.local   # set VITE_INDEXER_URL if not using default proxy
npm run dev                  # http://localhost:5173
```

### 4. CLI

```bash
cd cli
npm install
npm run build
npm link   # makes `amp` available globally

export AMP_PRIVATE_KEY=0x...
amp help
```

---

## CLI Usage

```bash
# Browse listings
amp list
amp list --category services/transport --price-max 0.1

# View a listing
amp get <listing-id>

# Create a listing
amp create --name "Airport Pickup" --category services/transport \
  --price 0.05 --unit trip --duration 30

# Negotiate
amp negotiate <listing-id> --offer 0.045 --message "Available Friday?"
amp accept <negotiation-id>

# Orders
amp orders
amp approve <order-id>
amp release <order-id>
```

---

## MCP Server

Exposes the AMP protocol as [Model Context Protocol](https://modelcontextprotocol.io) tools for LLM agents.

```bash
cd mcp
npm install
node src/index.js   # stdio transport
```

Add to your MCP client config:

```json
{
  "mcpServers": {
    "amp": {
      "command": "node",
      "args": ["/path/to/amp-protocol/mcp/src/index.js"]
    }
  }
}
```

Available tools: `listListings`, `getListing`, `createListing`, `negotiate`, `acceptNegotiation`, `getOrders`, `approveOrder`, `releaseOrder`, `getReputation`, `cancelListing`

---

## Development

### Run all tests

```bash
# Unit / integration (contracts)
cd contracts && npx hardhat test

# E2E (requires indexer + web app running)
cd e2e && npx playwright test
```

### Ports

| Service | Port |
|---|---|
| Web app (Vite) | 5173 |
| Indexer API | 3001 |

### Category paths

| Path | Description |
|---|---|
| `services/accommodation` | Hotels, rentals, homestays |
| `services/transport` | Rides, transfers, logistics |
| `services/food` | Catering, delivery, meal prep |
| `services/professional` | Legal, medical, consulting |
| `services/agent` | AI agent tasks |
| `goods/physical` | Tangible goods |
| `goods/digital` | Software, licenses, data |

---

## License

MIT
