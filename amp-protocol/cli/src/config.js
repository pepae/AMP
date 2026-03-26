// AMP CLI config — reads/writes ~/.amp/config.json
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const CONFIG_DIR = join(homedir(), ".amp");
const CONFIG_FILE = join(CONFIG_DIR, "config.json");

const DEFAULTS = {
  rpc: "https://rpc.chiadochain.net",
  chainId: 10200,
  indexer: "http://localhost:3001",
  listingRegistry: "0x01517B12805AdeC6dCb978FDB139c3bD0A92879E",
  ampEscrow: "0xADaA2Eb39eCDfbb457D36d34951daEd08179e3c8",
  reputationLedger: "0x79145D065c713596e1c2a1715c5c655dC3641CB5",
};

export function getConfig() {
  if (!existsSync(CONFIG_FILE)) return { ...DEFAULTS };
  try {
    return { ...DEFAULTS, ...JSON.parse(readFileSync(CONFIG_FILE, "utf8")) };
  } catch {
    return { ...DEFAULTS };
  }
}

export function setConfig(key, value) {
  mkdirSync(CONFIG_DIR, { recursive: true });
  const current = getConfig();
  current[key] = value;
  writeFileSync(CONFIG_FILE, JSON.stringify(current, null, 2));
}

export function getAllConfig() {
  return getConfig();
}
