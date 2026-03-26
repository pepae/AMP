import "dotenv/config";
import { initContracts, syncListings, syncOrders } from "./store.js";
import { createApp } from "./routes.js";

const PORT = Number(process.env.PORT ?? 3001);
const POLL_INTERVAL = Number(process.env.POLL_INTERVAL ?? 30000);

async function main() {
  await initContracts();

  // Initial sync
  await syncListings();
  await syncOrders();

  // Periodic re-sync
  setInterval(async () => {
    await syncListings();
    await syncOrders();
  }, POLL_INTERVAL);

  const app = createApp();
  app.listen(PORT, () => {
    console.log(`[indexer] REST API listening on http://localhost:${PORT}`);
  });
}

main().catch(err => {
  console.error("[indexer] Fatal:", err);
  process.exit(1);
});
