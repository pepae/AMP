// HTTP client for the AMP indexer REST API
import { getConfig } from "../config.js";

async function request(path) {
  const cfg = getConfig();
  const url = `${cfg.indexer}${path}`;
  const res = await fetch(url);
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`Indexer ${url} → ${res.status}: ${text}`);
  }
  return res.json();
}

export async function searchListings({ category, search, priceMax, priceMin, status } = {}) {
  const params = new URLSearchParams();
  if (category !== undefined) params.set("category", category);
  if (search !== undefined) params.set("search", search);
  if (priceMax !== undefined) params.set("priceMax", priceMax);
  if (priceMin !== undefined) params.set("priceMin", priceMin);
  if (status !== undefined) params.set("status", String(status));
  return request(`/listings?${params}`);
}

export async function getListing(id) {
  return request(`/listings/${id}`);
}

export async function getOrder(id) {
  return request(`/orders/${id}`);
}

export async function getOrdersByAddress(address) {
  return request(`/orders?address=${address}`);
}

export async function getReputation(address) {
  return request(`/reputation/${address}`);
}

export async function getStats() {
  return request("/stats");
}

export async function health() {
  return request("/health");
}
