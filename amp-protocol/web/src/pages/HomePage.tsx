import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, type Listing } from "../lib/api";
import { CATEGORY_OPTIONS, CATEGORY_CONFIG } from "../lib/constants";
import ListingCard from "../components/ListingCard";

export default function HomePage() {
  const [stats, setStats] = useState({ totalListings: 0, activeListings: 0, totalOrders: 0, lastSyncBlock: 0 });
  const [featured, setFeatured] = useState<Listing[]>([]);

  useEffect(() => {
    api.getStats().then(setStats).catch(() => {});
    api.getListings().then((r) => setFeatured(r.listings.slice(0, 6))).catch(() => {});
  }, []);

  return (
    <div>
      {/* ── Hero ─────────────────────────────────────────────────────────────── */}
      <div className="py-20 text-center border-b border-slate-200 mb-14">
        <div className="inline-flex items-center gap-2 bg-blue-50 border border-blue-200 px-3 py-1 text-xs font-bold text-blue-700 uppercase tracking-widest mb-6">
          Live on Gnosis Chain
        </div>
        <h1 data-testid="hero-heading" className="text-5xl font-black text-slate-900 mb-5 leading-tight tracking-tight">
          The{" "}
          <span className="text-blue-600">Agent Marketplace</span>
          <br />Protocol
        </h1>
        <p className="text-lg text-slate-500 mb-9 max-w-xl mx-auto leading-relaxed">
          A single on-chain listing standard for accommodation, transport, services, goods, and more.
          Agents negotiate. Humans approve.
        </p>
        <div className="flex justify-center gap-3">
          <Link to="/browse" data-testid="hero-browse-btn" className="btn-primary">
            Browse Listings
          </Link>
          <Link to="/create" data-testid="hero-create-btn" className="btn-outline">
            Create Listing
          </Link>
        </div>
      </div>

      {/* ── Stats ────────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-4 mb-14" data-testid="stats-grid">
        {[
          { label: "Active Listings", value: stats.activeListings },
          { label: "Orders Placed",   value: stats.totalOrders },
          { label: "Protocol Fee",    value: "0.5%" },
        ].map(({ label, value }) => (
          <div key={label} className="bg-white border border-slate-200 p-6 text-center">
            <div className="text-3xl font-black text-blue-600 mb-1.5 tabular-nums">{value}</div>
            <div className="text-xs text-slate-400 uppercase tracking-widest font-semibold">{label}</div>
          </div>
        ))}
      </div>

      {/* ── Categories ───────────────────────────────────────────────────────── */}
      <div className="mb-14">
        <p className="section-header">Categories</p>
        <div className="grid grid-cols-4 gap-3">
          {CATEGORY_OPTIONS.map((cat) => {
            const cfg = CATEGORY_CONFIG[cat.value];
            const color = cfg?.stripColor ?? "#6366f1";
            return (
              <Link
                key={cat.value}
                to={`/browse?category=${cat.value}`}
                data-testid={`category-${cat.value.replace("/", "-")}`}
                className="bg-white border border-slate-200 hover:border-slate-300 transition-colors p-4 group"
                style={{ borderTopWidth: 2, borderTopColor: color }}
              >
                <div
                  className="text-xs font-bold uppercase tracking-wider mb-1"
                  style={{ color }}
                >
                  {cat.value.split("/")[0]}
                </div>
                <div className="text-sm font-semibold text-slate-700 group-hover:text-slate-900 transition-colors">
                  {cat.label}
                </div>
              </Link>
            );
          })}
        </div>
      </div>

      {/* ── Featured listings ────────────────────────────────────────────────── */}
      {featured.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-5">
            <p className="section-header mb-0">Latest Listings</p>
            <Link
              to="/browse"
              className="text-xs text-blue-600 hover:text-blue-700 font-semibold transition-colors"
            >
              View all
            </Link>
          </div>
          <div className="grid grid-cols-3 gap-4">
            {featured.map((l) => (
              <ListingCard key={l.id} listing={l} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
