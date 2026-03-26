#!/usr/bin/env node
import { Command } from "commander";
import chalk from "chalk";
import { registerConfigCommand } from "./commands/config.js";
import { registerSearchCommand } from "./commands/search.js";
import { registerListingCommand } from "./commands/listing.js";
import { registerReputationCommand } from "./commands/reputation.js";
import { registerNegotiateCommand } from "./commands/negotiate.js";
import { registerOrderCommand } from "./commands/order.js";
import { health, getStats } from "./lib/api.js";

const program = new Command();

program
  .name("amp")
  .description(chalk.bold("AMP Protocol CLI") + " — Agent Marketplace Protocol on Gnosis Chain")
  .version("0.1.0");

// Register all sub-commands
registerConfigCommand(program);
registerSearchCommand(program);
registerListingCommand(program);
registerReputationCommand(program);
registerNegotiateCommand(program);
registerOrderCommand(program);

// amp status — quick health check
program
  .command("status")
  .description("Check indexer health and protocol stats")
  .action(async () => {
    try {
      const [h, stats] = await Promise.all([health(), getStats()]);
      console.log(chalk.bold("\n  AMP Protocol Status"));
      console.log(`  ${chalk.dim("Indexer:")}  ${chalk.green(h.status ?? "ok")}`);
      console.log(`  ${chalk.dim("Network:")}  Gnosis Chiado (10200)`);
      if (stats) {
        console.log(`  ${chalk.dim("Listings:")} ${chalk.cyan(stats.totalListings ?? 0)}`);
        console.log(`  ${chalk.dim("Orders:")}   ${chalk.cyan(stats.totalOrders ?? 0)}`);
      }
      console.log();
    } catch (err) {
      console.error(chalk.red("Indexer unreachable: " + err.message));
      process.exit(1);
    }
  });

program.parse(process.argv);
