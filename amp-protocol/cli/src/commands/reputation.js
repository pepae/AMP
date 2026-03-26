import chalk from "chalk";
import { getReputation } from "../lib/api.js";

export function registerReputationCommand(program) {
  program
    .command("reputation <address>")
    .alias("rep")
    .description("Show on-chain reputation for an address")
    .option("--json", "Output raw JSON")
    .action(async (address, opts) => {
      try {
        const rep = await getReputation(address);
        if (opts.json) { console.log(JSON.stringify(rep, null, 2)); return; }

        const rating = rep.averageRating ? (rep.averageRating / 100).toFixed(2) : "—";
        const stars = rep.averageRating
          ? "★".repeat(Math.round(rep.averageRating / 100 / 1)) + "☆".repeat(5 - Math.round(rep.averageRating / 100))
          : "—";

        console.log(chalk.bold(`\n  Reputation: ${address}`));
        console.log(`  ${chalk.dim("Rating:")}         ${chalk.yellow(rating)} / 5.0  ${stars}`);
        console.log(`  ${chalk.dim("Completed orders:")} ${chalk.green(rep.completedOrders ?? 0)}`);
        console.log(`  ${chalk.dim("Total volume:")}    ${rep.totalVolumeEther ?? "0"} xDAI`);
        console.log(`  ${chalk.dim("Reviews:")}         ${rep.ratingCount ?? 0}`);
        console.log(`  ${chalk.dim("Disputes lost:")}   ${rep.disputesLost ?? 0}`);
        console.log();
      } catch (err) {
        console.error(chalk.red("Error: " + err.message));
        process.exit(1);
      }
    });
}
