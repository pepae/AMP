import chalk from "chalk";
import { getListing } from "../lib/api.js";
import { getSigner, getListingRegistry, categoryHash, encodeMetadata, resolveKey } from "../lib/chain.js";
import { ethers } from "ethers";

const STATUS_LABEL = ["Active", "Paused", "Fulfilled", "Expired", "Removed"];

function printListing(l) {
  const meta = l.metadata ?? {};
  const name = meta.name ?? "(no title)";
  console.log(chalk.bold(`\n  ${name}`));
  console.log(`  ${chalk.dim("ID:")}          ${l.id}`);
  console.log(`  ${chalk.dim("Status:")}      ${chalk.yellow(STATUS_LABEL[l.status] ?? l.status)}`);
  console.log(`  ${chalk.dim("Category:")}    ${l.categoryName ?? l.category}`);
  console.log(`  ${chalk.dim("Seller:")}      ${l.creator}`);
  console.log(`  ${chalk.dim("Price:")}       ${chalk.green(l.basePriceEther + " xDAI")} / ${l.pricingUnit}`);
  if (meta.description) console.log(`  ${chalk.dim("Description:")} ${meta.description}`);
  if (l.agentCardURL) console.log(`  ${chalk.dim("Agent Card:")}  ${l.agentCardURL}`);
  console.log(`  ${chalk.dim("Created:")}     ${new Date(l.createdAt * 1000).toLocaleDateString()}`);
  console.log(`  ${chalk.dim("Expires:")}     ${new Date(l.expiresAt * 1000).toLocaleDateString()}`);

  const extras = Object.entries(meta).filter(([k]) => !["name", "description", "_category"].includes(k));
  if (extras.length) {
    console.log(chalk.bold("\n  Details"));
    for (const [k, v] of extras) {
      const val = Array.isArray(v) ? v.join(", ") : String(v);
      console.log(`    ${chalk.dim(k.padEnd(16))} ${val}`);
    }
  }
  console.log();
}

export function registerListingCommand(program) {
  const listing = program.command("listing").description("Manage AMP listings");

  // amp listing <id>
  listing
    .command("get <id>")
    .alias("show")
    .description("Show details for a listing")
    .option("--json", "Output raw JSON")
    .action(async (id, opts) => {
      try {
        const l = await getListing(id);
        if (opts.json) { console.log(JSON.stringify(l, null, 2)); return; }
        printListing(l);
      } catch (err) {
        console.error(chalk.red("Error: " + err.message));
        process.exit(1);
      }
    });

  // amp listing create
  listing
    .command("create")
    .description("Create a new listing on-chain")
    .requiredOption("--category <path>", "Category e.g. services/accommodation")
    .requiredOption("--price <amount>", "Base price in xDAI (e.g. 0.01)")
    .requiredOption("--unit <unit>", "Pricing unit (night, hour, item, project)")
    .option("--title <title>", "Listing title")
    .option("--description <desc>", "Short description")
    .option("--metadata-uri <uri>", "Pre-formed metadata URI (overrides structured fields)")
    .option("--agent-card <url>", "A2A agent card URL", "")
    .option("--expires-days <n>", "Days until expiry (default 365)", "365")
    .option("--deposit <xDAI>", "Anti-spam deposit in xDAI (default 0.001)", "0.001")
    .option("--key <privateKey>", "Wallet private key (or set AMP_PRIVATE_KEY env)")
    .action(async (opts) => {
      try {
        const key = resolveKey(opts.key);
        const signer = getSigner(key);
        console.log(chalk.dim(`Wallet: ${signer.address}`));

        const catHash = categoryHash(opts.category);

        let metaURI = opts.metadataUri;
        if (!metaURI) {
          const payload = {
            _category: opts.category,
            ...(opts.title ? { name: opts.title } : {}),
            ...(opts.description ? { description: opts.description } : {}),
          };
          metaURI = encodeMetadata(payload);
        }

        const basePrice = ethers.parseEther(opts.price);
        const deposit = ethers.parseEther(opts.deposit);
        const expiresAt = Math.floor(Date.now() / 1000) + Number(opts.expiresDays) * 86400;

        const registry = getListingRegistry(signer);
        console.log(chalk.dim("Sending transaction…"));
        const tx = await registry.createListing(
          catHash,
          metaURI,
          ethers.ZeroAddress, // xDAI
          basePrice,
          opts.unit,
          opts.agentCard ?? "",
          expiresAt,
          { value: deposit }
        );
        console.log(chalk.dim(`TX: ${tx.hash}`));
        const receipt = await tx.wait();

        // Find ListingCreated event
        const iface = registry.interface;
        let listingId = null;
        for (const log of receipt.logs) {
          try {
            const parsed = iface.parseLog(log);
            if (parsed?.name === "ListingCreated") {
              listingId = parsed.args[0];
              break;
            }
          } catch { /* skip */ }
        }

        console.log(chalk.green(`\n✓ Listing created`));
        if (listingId) console.log(`  ID: ${listingId}`);
        console.log(`  Block: ${receipt.blockNumber}`);
      } catch (err) {
        console.error(chalk.red("Error: " + err.message));
        process.exit(1);
      }
    });

  // amp listing pause <id>
  listing
    .command("pause <id>")
    .description("Pause a listing")
    .option("--key <privateKey>", "Wallet private key")
    .action(async (id, opts) => {
      try {
        const signer = getSigner(resolveKey(opts.key));
        const registry = getListingRegistry(signer);
        const tx = await registry.pauseListing(id);
        await tx.wait();
        console.log(chalk.green(`✓ Listing ${id.slice(0, 12)}… paused`));
      } catch (err) {
        console.error(chalk.red("Error: " + err.message));
        process.exit(1);
      }
    });

  // amp listing remove <id>
  listing
    .command("remove <id>")
    .description("Remove a listing (refunds deposit)")
    .option("--key <privateKey>", "Wallet private key")
    .action(async (id, opts) => {
      try {
        const signer = getSigner(resolveKey(opts.key));
        const registry = getListingRegistry(signer);
        const tx = await registry.removeListing(id);
        await tx.wait();
        console.log(chalk.green(`✓ Listing ${id.slice(0, 12)}… removed`));
      } catch (err) {
        console.error(chalk.red("Error: " + err.message));
        process.exit(1);
      }
    });

  // amp listing update <id>
  listing
    .command("update <id>")
    .description("Update listing price or metadata URI")
    .option("--price <amount>", "New base price in xDAI")
    .option("--metadata-uri <uri>", "New metadata URI")
    .option("--key <privateKey>", "Wallet private key")
    .action(async (id, opts) => {
      try {
        const signer = getSigner(resolveKey(opts.key));
        const registry = getListingRegistry(signer);
        // Fetch current to fill in unchanged fields
        const current = await registry.getListing(id);
        const newURI = opts.metadataUri ?? current.metadataURI;
        const newPrice = opts.price ? ethers.parseEther(opts.price) : current.basePrice;
        const tx = await registry.updateListing(id, newURI, newPrice);
        await tx.wait();
        console.log(chalk.green(`✓ Listing updated`));
      } catch (err) {
        console.error(chalk.red("Error: " + err.message));
        process.exit(1);
      }
    });
}
