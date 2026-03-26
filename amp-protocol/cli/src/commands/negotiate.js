import chalk from "chalk";
import { getListing } from "../lib/api.js";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

// A2A negotiation sessions are stored locally for now.
// In production these would be live A2A connections to seller agents.
const SESSIONS_FILE = join(homedir(), ".amp", "negotiate-sessions.json");

function loadSessions() {
  try { return JSON.parse(readFileSync(SESSIONS_FILE, "utf8")); } catch { return {}; }
}
function saveSessions(s) {
  mkdirSync(join(homedir(), ".amp"), { recursive: true });
  writeFileSync(SESSIONS_FILE, JSON.stringify(s, null, 2));
}

// Very minimal A2A stub: real implementation would speak HTTP A2A to seller agent
async function a2aRequest(listing, taskType, payload) {
  if (!listing.agentCardURL) {
    // No agent card — simulate seller response
    return simulateSellerResponse(taskType, payload, listing);
  }
  // In a real impl: POST to listing.agentCardURL with JSON-RPC A2A envelope
  throw new Error(`Live A2A not yet implemented. Listing ${listing.id.slice(0, 12)} has agent card: ${listing.agentCardURL}`);
}

function simulateSellerResponse(taskType, payload, listing) {
  const basePrice = Number(listing.basePriceEther);
  if (taskType === "amp/request_quote") {
    const nights = payload.nights ?? 1;
    const subtotal = basePrice * nights;
    const discount = nights >= 7 ? 0.05 : 0;
    const quoted = +(subtotal * (1 - discount)).toFixed(4);
    return {
      task_type: "amp/quote",
      session_id: randomUUID(),
      price: quoted,
      unit: listing.pricingUnit,
      token: "xDAI",
      notes: discount > 0 ? `${(discount * 100).toFixed(0)}% long-stay discount applied` : "Standard rate",
      availability_confirmed: true,
      terms: { listing_id: listing.id, seller: listing.creator },
    };
  }
  if (taskType === "amp/negotiate") {
    const offerPrice = Number(payload.max_price ?? payload.price);
    const minAccept = basePrice * 0.9;
    if (offerPrice >= minAccept) {
      return { task_type: "amp/final_offer", price: offerPrice, accepted: true, notes: "Counter-offer accepted." };
    }
    return {
      task_type: "amp/negotiate",
      price: +(basePrice * 0.95).toFixed(4),
      notes: `Best I can do is ${(basePrice * 0.95).toFixed(4)} xDAI.`,
    };
  }
  if (taskType === "amp/accept") {
    return { task_type: "amp/confirm", booking_ref: randomUUID().slice(0, 8).toUpperCase(), status: "confirmed" };
  }
  return { task_type: "amp/error", message: "Unknown task type" };
}

export function registerNegotiateCommand(program) {
  const neg = program.command("negotiate").description("Negotiate via A2A with a seller agent");

  // amp negotiate quote --listing <id> --params '{...}'
  neg
    .command("quote")
    .description("Request a quote from a listing's seller agent")
    .requiredOption("--listing <id>", "Listing ID")
    .option("--params <json>", "JSON parameters (nights, budget, guests, etc.)", "{}")
    .option("--json", "Output raw JSON")
    .action(async (opts) => {
      try {
        const listing = await getListing(opts.listing);
        const params = JSON.parse(opts.params);
        const response = await a2aRequest(listing, "amp/request_quote", params);

        if (opts.json) { console.log(JSON.stringify(response, null, 2)); return; }

        // Save session
        const sessions = loadSessions();
        const sessionId = response.session_id ?? randomUUID();
        sessions[sessionId] = { listingId: opts.listing, seller: listing.creator, latest: response };
        saveSessions(sessions);

        console.log(chalk.bold("\n  Quote received"));
        console.log(`  ${chalk.dim("Session:")}  ${sessionId}`);
        console.log(`  ${chalk.dim("Price:")}    ${chalk.green(response.price + " " + (response.token ?? "xDAI"))} / ${response.unit ?? listing.pricingUnit}`);
        if (response.notes) console.log(`  ${chalk.dim("Notes:")}    ${response.notes}`);
        console.log(`\n  ${chalk.dim("To counter:")}  amp negotiate counter --session ${sessionId} --params '{"max_price":X}'`);
        console.log(`  ${chalk.dim("To accept:")}   amp negotiate accept --session ${sessionId}`);
        console.log();
      } catch (err) {
        console.error(chalk.red("Error: " + err.message));
        process.exit(1);
      }
    });

  // amp negotiate counter --session <id> --params '{...}'
  neg
    .command("counter")
    .description("Send a counter-offer in an active negotiation session")
    .requiredOption("--session <id>", "Session ID from the quote step")
    .option("--params <json>", "JSON counter parameters (max_price, flexible_dates, etc.)", "{}")
    .option("--json", "Output raw JSON")
    .action(async (opts) => {
      try {
        const sessions = loadSessions();
        const session = sessions[opts.session];
        if (!session) throw new Error(`Session ${opts.session} not found. Run 'amp negotiate quote' first.`);

        const listing = await getListing(session.listingId);
        const params = JSON.parse(opts.params);
        const response = await a2aRequest(listing, "amp/negotiate", params);

        if (opts.json) { console.log(JSON.stringify(response, null, 2)); return; }

        sessions[opts.session].latest = response;
        saveSessions(sessions);

        if (response.accepted) {
          console.log(chalk.green(`\n  ✓ Offer accepted at ${response.price} xDAI`));
          console.log(`  ${chalk.dim("Now run:")}  amp negotiate accept --session ${opts.session}`);
        } else {
          console.log(chalk.bold("\n  Counter-offer received"));
          console.log(`  ${chalk.dim("Seller price:")} ${chalk.yellow(response.price + " xDAI")}`);
          if (response.notes) console.log(`  ${chalk.dim("Notes:")}       ${response.notes}`);
        }
        console.log();
      } catch (err) {
        console.error(chalk.red("Error: " + err.message));
        process.exit(1);
      }
    });

  // amp negotiate accept --session <id>
  neg
    .command("accept")
    .description("Accept the current offer and get booking confirmation")
    .requiredOption("--session <id>", "Session ID")
    .option("--json", "Output raw JSON")
    .action(async (opts) => {
      try {
        const sessions = loadSessions();
        const session = sessions[opts.session];
        if (!session) throw new Error(`Session ${opts.session} not found.`);

        const listing = await getListing(session.listingId);
        const response = await a2aRequest(listing, "amp/accept", { session_id: opts.session });

        if (opts.json) { console.log(JSON.stringify(response, null, 2)); return; }

        console.log(chalk.green(`\n  ✓ Booking confirmed!`));
        if (response.booking_ref) console.log(`  ${chalk.dim("Ref:")}     ${response.booking_ref}`);
        console.log(`  ${chalk.dim("Listing:")} ${session.listingId.slice(0, 16)}…`);
        const price = session.latest?.price ?? session.latest?.price;
        if (price) console.log(`  ${chalk.dim("Price:")}   ${chalk.green(price + " xDAI")}\n`);
        console.log(`  ${chalk.dim("Next step:")} fund escrow with:`);
        console.log(`    amp order create --listing ${session.listingId} --amount ${price ?? "X"}`);
        console.log();
      } catch (err) {
        console.error(chalk.red("Error: " + err.message));
        process.exit(1);
      }
    });
}
