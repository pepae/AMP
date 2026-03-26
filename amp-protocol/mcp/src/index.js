#!/usr/bin/env node
/**
 * AMP Protocol MCP Server
 *
 * Exposes AMP marketplace tools via the Model Context Protocol (stdio transport).
 * Add to Claude Desktop / Cursor config:
 *
 *   {
 *     "mcpServers": {
 *       "amp": {
 *         "command": "node",
 *         "args": ["/path/to/amp-protocol/mcp/src/index.js"],
 *         "env": { "AMP_INDEXER": "http://localhost:3001" }
 *       }
 *     }
 *   }
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { AmpClient } from "../../cli/src/lib/amp-client.js";

// ─── Config from env ──────────────────────────────────────────────────────────

const client = new AmpClient({
  indexer:     process.env.AMP_INDEXER     ?? "http://localhost:3001",
  rpc:         process.env.AMP_RPC         ?? "https://rpc.chiadochain.net",
  chainId:     Number(process.env.AMP_CHAIN_ID ?? 10200),
  privateKey:  process.env.AMP_PRIVATE_KEY ?? null,
});

// ─── Tool definitions ─────────────────────────────────────────────────────────

const TOOLS = [
  {
    name: "amp_status",
    description: "Check the AMP indexer health and protocol stats (listing count, order count).",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "amp_search",
    description:
      "Search AMP listings by category, keywords, and price. Returns a list of listings with ID, name, price, and seller address.",
    inputSchema: {
      type: "object",
      properties: {
        category: {
          type: "string",
          description:
            "Category path. Examples: 'services/accommodation', 'services/transport', 'services/food', 'services/professional', 'services/agent', 'goods/physical', 'goods/digital'",
        },
        search: {
          type: "string",
          description: "Free-text keyword search across listing titles and descriptions",
        },
        priceMax: {
          type: "number",
          description: "Maximum base price in xDAI",
        },
        priceMin: {
          type: "number",
          description: "Minimum base price in xDAI",
        },
      },
      required: [],
    },
  },
  {
    name: "amp_listing_detail",
    description:
      "Get full details for a specific AMP listing: title, description, price, seller address, availability, structured metadata fields.",
    inputSchema: {
      type: "object",
      properties: {
        listing_id: {
          type: "string",
          description: "Listing ID (bytes32 hex string starting with 0x)",
        },
      },
      required: ["listing_id"],
    },
  },
  {
    name: "amp_reputation",
    description:
      "Get the on-chain reputation score for an address: completed orders, average rating, total volume, disputes.",
    inputSchema: {
      type: "object",
      properties: {
        address: {
          type: "string",
          description: "Ethereum wallet address (0x...)",
        },
      },
      required: ["address"],
    },
  },
  {
    name: "amp_negotiate_quote",
    description:
      "Request a price quote from a listing's seller agent via A2A protocol. Returns a session ID, quoted price, and notes. Use this before negotiating or booking.",
    inputSchema: {
      type: "object",
      properties: {
        listing_id: {
          type: "string",
          description: "Listing ID",
        },
        params: {
          type: "object",
          description:
            "Negotiation parameters. Common fields: nights (number), hours (number), guests (number), budget_hint (number in xDAI), preferences (string).",
        },
      },
      required: ["listing_id"],
    },
  },
  {
    name: "amp_negotiate_counter",
    description:
      "Send a counter-offer in an active negotiation session. Returns whether the seller accepted and the new price.",
    inputSchema: {
      type: "object",
      properties: {
        session_id: {
          type: "string",
          description: "Session ID returned by amp_negotiate_quote",
        },
        max_price: {
          type: "number",
          description: "Your maximum acceptable price in xDAI",
        },
      },
      required: ["session_id", "max_price"],
    },
  },
  {
    name: "amp_negotiate_accept",
    description:
      "Accept the current offer in a negotiation session. Returns a booking reference. IMPORTANT: This does NOT fund the escrow yet — the user still needs to call amp_order_create to complete payment.",
    inputSchema: {
      type: "object",
      properties: {
        session_id: {
          type: "string",
          description: "Session ID",
        },
      },
      required: ["session_id"],
    },
  },
  {
    name: "amp_order_status",
    description: "Check the on-chain status of an existing escrow order.",
    inputSchema: {
      type: "object",
      properties: {
        order_id: {
          type: "string",
          description: "Order ID (bytes32 hex string)",
        },
      },
      required: ["order_id"],
    },
  },
  {
    name: "amp_order_create",
    description:
      "Create and fund an escrow order on Gnosis Chain. REQUIRES: AMP_PRIVATE_KEY env to be set. IMPORTANT: Only call after explicit user approval of the price and terms.",
    inputSchema: {
      type: "object",
      properties: {
        listing_id: {
          type: "string",
          description: "Listing ID to purchase",
        },
        amount: {
          type: "number",
          description: "Amount to pay in xDAI",
        },
        terms: {
          type: "string",
          description: "Terms JSON string (optional, will be hashed for the escrow)",
        },
        deadline: {
          type: "string",
          description: "Auto-refund deadline as ISO date string (default: 30 days from now)",
        },
      },
      required: ["listing_id", "amount"],
    },
  },
  {
    name: "amp_listing_create",
    description:
      "Create a new listing on-chain. REQUIRES: AMP_PRIVATE_KEY env to be set.",
    inputSchema: {
      type: "object",
      properties: {
        category: {
          type: "string",
          description: "Category path (e.g. 'services/accommodation')",
        },
        price: {
          type: "number",
          description: "Base price in xDAI",
        },
        unit: {
          type: "string",
          description: "Pricing unit: night, hour, item, project, trip",
        },
        title: { type: "string", description: "Listing title" },
        description: { type: "string", description: "Short description" },
        agent_card: { type: "string", description: "A2A agent card URL (optional)" },
        expires_days: { type: "number", description: "Days until expiry (default 365)" },
      },
      required: ["category", "price", "unit"],
    },
  },
];

// ─── Tool handlers ────────────────────────────────────────────────────────────

async function handleTool(name, args) {
  switch (name) {
    case "amp_status": {
      const [health, stats] = await Promise.all([client.health(), client.stats()]);
      return {
        status: health.ok ? "ok" : "degraded",
        network: "Gnosis Chiado (chainId 10200)",
        totalListings: stats.totalListings ?? 0,
        activeListings: stats.activeListings ?? 0,
        totalOrders: stats.totalOrders ?? 0,
        lastSyncBlock: stats.lastSyncBlock ?? 0,
      };
    }

    case "amp_search": {
      const data = await client.search({
        category: args.category,
        search: args.search,
        priceMax: args.priceMax,
        priceMin: args.priceMin,
      });
      return {
        total: data.total,
        listings: (data.listings ?? []).map(l => ({
          id: l.id,
          name: l.metadata?.name ?? "(untitled)",
          description: l.metadata?.description ?? "",
          category: l.categoryName,
          price: `${l.basePriceEther} xDAI / ${l.pricingUnit}`,
          seller: l.creator,
          status: l.statusLabel,
          hasAgentCard: Boolean(l.agentCardURL),
        })),
      };
    }

    case "amp_listing_detail": {
      const l = await client.getListing(args.listing_id);
      return {
        id: l.id,
        name: l.metadata?.name ?? "(untitled)",
        description: l.metadata?.description ?? "",
        category: l.categoryName,
        seller: l.creator,
        price: `${l.basePriceEther} xDAI`,
        pricingUnit: l.pricingUnit,
        status: l.statusLabel,
        agentCardURL: l.agentCardURL || null,
        createdAt: new Date(l.createdAt * 1000).toISOString(),
        expiresAt: new Date(l.expiresAt * 1000).toISOString(),
        metadata: l.metadata ?? {},
      };
    }

    case "amp_reputation": {
      const rep = await client.getReputation(args.address);
      return {
        address: args.address,
        completedOrders: rep.completedOrders ?? 0,
        averageRating: rep.averageRating ? (rep.averageRating / 100).toFixed(2) : null,
        ratingCount: rep.ratingCount ?? 0,
        totalVolumeXDAI: rep.totalVolumeEther ?? "0",
        disputesLost: rep.disputesLost ?? 0,
      };
    }

    case "amp_negotiate_quote": {
      return client.negotiateQuote(args.listing_id, args.params ?? {});
    }

    case "amp_negotiate_counter": {
      return client.negotiateCounter(args.session_id, { max_price: args.max_price });
    }

    case "amp_negotiate_accept": {
      return client.negotiateAccept(args.session_id);
    }

    case "amp_order_status": {
      const o = await client.getOrder(args.order_id);
      return {
        id: o.id,
        listingId: o.listingId,
        buyer: o.buyer,
        seller: o.seller,
        amount: o.amountEther ?? o.amount,
        status: o.statusLabel ?? o.status,
        deadline: new Date(o.deadline * 1000).toISOString(),
      };
    }

    case "amp_order_create": {
      if (!client.privateKey) {
        throw new Error("AMP_PRIVATE_KEY environment variable is required to create orders");
      }
      return client.createOrder({
        listingId: args.listing_id,
        amount: String(args.amount),
        terms: args.terms,
        deadline: args.deadline,
      });
    }

    case "amp_listing_create": {
      if (!client.privateKey) {
        throw new Error("AMP_PRIVATE_KEY environment variable is required to create listings");
      }
      return client.createListing({
        category: args.category,
        price: String(args.price),
        unit: args.unit,
        title: args.title,
        description: args.description,
        agentCard: args.agent_card,
        expiresDays: args.expires_days ?? 365,
      });
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// ─── MCP Server setup ─────────────────────────────────────────────────────────

const server = new Server(
  { name: "amp-marketplace", version: "0.1.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  try {
    const result = await handleTool(name, args ?? {});
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  } catch (err) {
    return {
      content: [{ type: "text", text: `Error: ${err.message}` }],
      isError: true,
    };
  }
});

// ─── Start ────────────────────────────────────────────────────────────────────

const transport = new StdioServerTransport();
await server.connect(transport);
// Server now listens on stdio — ready for MCP clients
