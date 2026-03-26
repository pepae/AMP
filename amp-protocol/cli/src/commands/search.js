import chalk from "chalk";
import { searchListings } from "../lib/api.js";

const STATUS_LABEL = ["Active", "Paused", "Fulfilled", "Expired", "Removed"];

export function registerSearchCommand(program) {
  program
    .command("search")
    .description("Search AMP listings")
    .option("--category <path>", "Category path or hash (e.g. services/accommodation)")
    .option("--keywords <words>", "Free-text keyword search")
    .option("--price-max <num>", "Maximum base price (in ether units)")
    .option("--price-min <num>", "Minimum base price (in ether units)")
    .option("--all", "Include non-active listings")
    .option("--json", "Output raw JSON")
    .action(async (opts) => {
      try {
        const params = {};
        if (opts.category) params.category = opts.category;
        if (opts.keywords) params.search = opts.keywords;
        if (opts.priceMax) params.priceMax = opts.priceMax;
        if (opts.priceMin) params.priceMin = opts.priceMin;
        // Don't send status param for default (indexer already filters to Active by default)
        // --all sends status=all to bypass the default active-only filter
        if (opts.all) params.status = "all";

        const data = await searchListings(params);
        const listings = data.listings ?? data;

        if (opts.json) {
          console.log(JSON.stringify(listings, null, 2));
          return;
        }

        if (!listings.length) {
          console.log(chalk.yellow("No listings found."));
          return;
        }

        console.log(chalk.bold(`\nFound ${listings.length} listing(s)\n`));
        for (const l of listings) {
          const name = l.metadata?.name ?? l.metadataURI?.slice(0, 60) ?? "(no title)";
          const price = `${l.basePriceEther} xDAI/${l.pricingUnit}`;
          const cat = l.categoryName ?? l.category?.slice(0, 16);
          const status = STATUS_LABEL[l.status] ?? l.status;
          console.log(
            chalk.cyan(`  ${l.id.slice(0, 10)}…`) +
            `  ${chalk.white(name.slice(0, 40).padEnd(42))}` +
            chalk.green(price.padEnd(22)) +
            chalk.dim(cat.padEnd(28)) +
            chalk.yellow(status)
          );
        }
        console.log();
      } catch (err) {
        console.error(chalk.red("Error: " + err.message));
        process.exit(1);
      }
    });
}
