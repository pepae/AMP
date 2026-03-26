import chalk from "chalk";
import { getAllConfig, setConfig } from "../config.js";

export function registerConfigCommand(program) {
  const cfg = program.command("config").description("Read or write CLI configuration");

  cfg
    .command("get [key]")
    .description("Show all config, or a single key")
    .action((key) => {
      const all = getAllConfig();
      if (key) {
        if (!(key in all)) {
          console.error(chalk.red(`Unknown config key: ${key}`));
          process.exit(1);
        }
        console.log(all[key]);
      } else {
        console.log(chalk.bold("AMP CLI Configuration"));
        for (const [k, v] of Object.entries(all)) {
          console.log(`  ${chalk.cyan(k.padEnd(20))} ${v}`);
        }
      }
    });

  cfg
    .command("set <key> <value>")
    .description("Set a config value")
    .action((key, value) => {
      setConfig(key, value);
      console.log(chalk.green(`✓ Set ${key} = ${value}`));
    });
}
