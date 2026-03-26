import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api, type Listing } from "../lib/api";
import { CATEGORY_OPTIONS } from "../lib/constants";
import ListingCard from "../components/ListingCard";

export default function BrowsePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const category = searchParams.get("category") ?? "";
  const search = searchParams.get("search") ?? "";

  useEffect(() => {
    setLoading(true);
    const params: Record<string, string> = {};
    if (category) params.category = category;
    if (search) params.search = search;
    api
      .getListings(params)
      .then((r) => setListings(r.listings))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [category, search]);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Browse Listings</h1>
        {!loading && (
          <span className="text-sm text-slate-400">{listings.length} listing{listings.length !== 1 ? "s" : ""}</span>
        )}
      </div>

      {/* Filters */}
      <div className="bg-white border border-slate-200 p-4 flex gap-3 mb-8 flex-wrap items-center">
        <span className="text-xs font-bold text-slate-400 uppercase tracking-widest hidden sm:block">Filter</span>
        <div className="w-px h-4 bg-slate-200 hidden sm:block" />
        <select
          data-testid="category-filter"
          value={category}
          onChange={(e) => {
            const p = new URLSearchParams(searchParams);
            if (e.target.value) p.set("category", e.target.value);
            else p.delete("category");
            setSearchParams(p);
          }}
          className="select-field max-w-[200px]"
        >
          <option value="">All Categories</option>
          {CATEGORY_OPTIONS.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
        <input
          data-testid="search-input"
          type="text"
          placeholder="Search listings…"
          value={search}
          onChange={(e) => {
            const p = new URLSearchParams(searchParams);
            if (e.target.value) p.set("search", e.target.value);
            else p.delete("search");
            setSearchParams(p);
          }}
          className="input-field flex-1 max-w-xs"
        />
      </div>

      {loading && (
        <div className="text-center py-24 text-slate-400" data-testid="loading">
          Loading listings…
        </div>
      )}
      {error && (
        <div
          className="border border-red-200 bg-red-50 text-red-600 p-4"
          data-testid="error-message"
        >
          {error} — Is the indexer running?
        </div>
      )}
      {!loading && !error && listings.length === 0 && (
        <div className="text-center py-24" data-testid="empty-state">
          <div className="w-10 h-10 border-2 border-slate-200 mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-slate-900 mb-2">No listings found</h2>
          <p className="text-slate-500 text-sm mb-6">
            {category || search ? "Try adjusting your filters." : "Be the first to list something."}
          </p>
          <a href="/create" className="btn-primary inline-block">
            Create Listing
          </a>
        </div>
      )}
      {!loading && listings.length > 0 && (
        <div
          data-testid="listings-grid"
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
        >
          {listings.map((l) => (
            <ListingCard key={l.id} listing={l} />
          ))}
        </div>
      )}
    </div>
  );
}
