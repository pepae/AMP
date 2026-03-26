import express from "express";
import cors from "cors";
import {
  getListings, getListingById, getListingsByCreator,
  getOrders, getOrderById,
  getReputation, getReviews,
  getStats,
} from "./store.js";

export function createApp() {
  const app = express();
  app.use(cors());
  app.use(express.json());

  // ─── Health ───────────────────────────────────────────────────────────────
  app.get("/health", (_req, res) => res.json({ ok: true }));

  app.get("/stats", (_req, res) => res.json(getStats()));

  // ─── Listings ─────────────────────────────────────────────────────────────
  app.get("/listings", (req, res) => {
    const { category, creator, status, search, priceMax, priceMin } = req.query;
    const items = getListings({ category, creator, status, search, priceMax, priceMin });
    res.json({ listings: items, total: items.length });
  });

  app.get("/listings/:id", async (req, res) => {
    const listing = getListingById(req.params.id);
    if (!listing) return res.status(404).json({ error: "Listing not found" });
    res.json(listing);
  });

  app.get("/creators/:address/listings", async (req, res) => {
    const items = await getListingsByCreator(req.params.address);
    res.json({ listings: items, total: items.length });
  });

  // ─── Orders ───────────────────────────────────────────────────────────────
  app.get("/orders", (req, res) => {
    const { buyer, seller, listingId, status } = req.query;
    const items = getOrders({ buyer, seller, listingId, status });
    res.json({ orders: items, total: items.length });
  });

  app.get("/orders/:id", (req, res) => {
    const order = getOrderById(req.params.id);
    if (!order) return res.status(404).json({ error: "Order not found" });
    res.json(order);
  });

  // ─── Reputation ───────────────────────────────────────────────────────────
  app.get("/reputation/:address", async (req, res) => {
    try {
      const rep = await getReputation(req.params.address);
      res.json(rep);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/reviews/:address", async (req, res) => {
    const reviews = await getReviews(req.params.address);
    res.json({ reviews, total: reviews.length });
  });

  return app;
}
