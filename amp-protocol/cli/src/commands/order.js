import chalk from "chalk";
import { getListing } from "../lib/api.js";
import { getSigner, getEscrow, resolveKey } from "../lib/chain.js";
import { ethers } from "ethers";
import { getOrder } from "../lib/api.js";

const ORDER_STATUS = ["Created", "Funded", "Completed", "Disputed", "Refunded", "Resolved"];

export function registerOrderCommand(program) {
  const order = program.command("order").description("Manage AMP escrow orders");

  // amp order status <id>
  order
    .command("status <id>")
    .description("Show status of an order")
    .option("--json", "Output raw JSON")
    .action(async (id, opts) => {
      try {
        const o = await getOrder(id);
        if (opts.json) { console.log(JSON.stringify(o, null, 2)); return; }

        console.log(chalk.bold(`\n  Order ${id.slice(0, 12)}…`));
        console.log(`  ${chalk.dim("Status:")}    ${chalk.yellow(ORDER_STATUS[o.status] ?? o.status)}`);
        console.log(`  ${chalk.dim("Listing:")}   ${o.listingId?.slice(0, 12)}…`);
        console.log(`  ${chalk.dim("Buyer:")}     ${o.buyer}`);
        console.log(`  ${chalk.dim("Seller:")}    ${o.seller}`);
        console.log(`  ${chalk.dim("Amount:")}    ${o.amountEther ?? o.amount} xDAI`);
        console.log(`  ${chalk.dim("Deadline:")}  ${new Date(o.deadline * 1000).toLocaleDateString()}`);
        console.log();
      } catch (err) {
        console.error(chalk.red("Error: " + err.message));
        process.exit(1);
      }
    });

  // amp order create
  order
    .command("create")
    .description("Create and fund an escrow order")
    .requiredOption("--listing <id>", "Listing ID")
    .requiredOption("--amount <xDAI>", "Amount to pay in xDAI")
    .option("--token <address>", "ERC-20 token address (omit for xDAI)", "0x0000000000000000000000000000000000000000")
    .option("--terms <json>", "Terms JSON string (hashed for termsHash)", "{}")
    .option("--deadline <date>", "Deadline ISO date (default: 30 days)", "")
    .option("--key <privateKey>", "Wallet private key")
    .action(async (opts) => {
      try {
        const key = resolveKey(opts.key);
        const signer = getSigner(key);
        console.log(chalk.dim(`Wallet: ${signer.address}`));

        // Fetch listing to get seller
        const listing = await getListing(opts.listing);

        const termsHash = ethers.keccak256(ethers.toUtf8Bytes(opts.terms));
        const amount = ethers.parseEther(opts.amount);

        const deadlineTs = opts.deadline
          ? Math.floor(new Date(opts.deadline).getTime() / 1000)
          : Math.floor(Date.now() / 1000) + 30 * 86400;

        const escrow = getEscrow(signer);
        console.log(chalk.dim("Sending transaction…"));
        const tx = await escrow.createAndFundOrder(
          opts.listing,
          listing.creator,
          opts.token,
          amount,
          termsHash,
          deadlineTs,
          { value: amount }
        );
        console.log(chalk.dim(`TX: ${tx.hash}`));
        const receipt = await tx.wait();

        // Find OrderCreated event
        let orderId = null;
        const iface = escrow.interface;
        for (const log of receipt.logs) {
          try {
            const parsed = iface.parseLog(log);
            if (parsed?.name === "OrderCreated") {
              orderId = parsed.args[0];
              break;
            }
          } catch { /* skip */ }
        }

        console.log(chalk.green(`\n✓ Order created and funded`));
        if (orderId) console.log(`  Order ID: ${orderId}`);
        console.log(`  Block: ${receipt.blockNumber}`);
      } catch (err) {
        console.error(chalk.red("Error: " + err.message));
        process.exit(1);
      }
    });

  // amp order confirm <id>
  order
    .command("confirm <id>")
    .description("Confirm order completion (buyer)")
    .option("--key <privateKey>", "Wallet private key")
    .action(async (id, opts) => {
      try {
        const signer = getSigner(resolveKey(opts.key));
        const escrow = getEscrow(signer);
        const tx = await escrow.confirmCompletion(id);
        await tx.wait();
        console.log(chalk.green(`✓ Order ${id.slice(0, 12)}… confirmed`));
      } catch (err) {
        console.error(chalk.red("Error: " + err.message));
        process.exit(1);
      }
    });

  // amp order refund <id>
  order
    .command("refund <id>")
    .description("Request a refund (buyer, before deadline)")
    .option("--key <privateKey>", "Wallet private key")
    .action(async (id, opts) => {
      try {
        const signer = getSigner(resolveKey(opts.key));
        const escrow = getEscrow(signer);
        const tx = await escrow.requestRefund(id);
        await tx.wait();
        console.log(chalk.green(`✓ Refund requested for order ${id.slice(0, 12)}…`));
      } catch (err) {
        console.error(chalk.red("Error: " + err.message));
        process.exit(1);
      }
    });
}
