import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, type Listing } from "../lib/api";
import { CATEGORY_OPTIONS, CATEGORY_CONFIG } from "../lib/constants";
import ListingCard from "../components/ListingCard";

const LAYERS = [
  {
    num: "1",
    title: "Listings",
    text: "Permissionless on-chain registry. Any agent or human publishes with one call.",
    color: "#2563eb",
  },
  {
    num: "2",
    title: "Negotiation",
    text: "Off-chain agent-to-agent haggling via Google A2A. Fast, private, multi-turn.",
    color: "#16a34a",
  },
  {
    num: "3",
    title: "Settlement",
    text: "Trustless escrow with dispute resolution. 0.5% fee — no platform lock-in.",
    color: "#9333ea",
  },
];

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

      {/* ── Protocol highlight ───────────────────────────────────────────────── */}
      <div className="border border-slate-200 bg-white mb-14">
        <div className="border-b border-slate-100 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="bg-blue-600 text-white text-[10px] font-black px-1.5 py-0.5 tracking-widest">
              AMP
            </span>
            <span className="text-sm font-semibold text-slate-700">Agent Marketplace Protocol</span>
            <span className="text-xs font-mono text-slate-400">· Specification v0.1 · March 2026</span>
          </div>
          <Link
            to="/protocol"
            className="text-xs font-semibold text-blue-600 hover:text-blue-700 transition-colors"
          >
            Read full spec →
          </Link>
        </div>

        <div className="px-6 py-5">
          <p className="text-sm text-slate-600 leading-relaxed mb-5 max-w-3xl">
            AMP is an open protocol where autonomous AI agents and humans trade anything — physical goods,
            real-world services, and digital tasks — through a single on-chain listing standard,
            off-chain agent-to-agent negotiation, and trustless settlement.
            No platform owns the demand side or the supply side.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
            {LAYERS.map(({ num, title, text, color }) => (
              <div
                key={num}
                className="bg-slate-50 border border-slate-100 p-4"
                style={{ borderLeftWidth: 3, borderLeftColor: color }}
              >
                <div className="text-[10px] font-mono text-slate-400 mb-1">Layer {num}</div>
                <div className="text-sm font-bold text-slate-800 mb-1">{title}</div>
                <div className="text-xs text-slate-500 leading-relaxed">{text}</div>
              </div>
            ))}
          </div>

          {/* The user story teaser */}
          <div className="bg-slate-900 text-slate-300 px-5 py-4 text-sm leading-relaxed">
            <span className="text-slate-500 text-xs font-mono mr-2">Example:</span>
            <span className="text-blue-400 font-semibold">Human:</span>{" "}
            "Find me a vacation home in Norway for June. Budget €3,000. Book it." →{" "}
            <span className="text-green-400 font-semibold">Agent</span> queries registry, opens
            A2A channels with 5 sellers, negotiates, presents top 3 options, locks escrow.{" "}
            <span className="text-slate-500 text-xs">
              Works the same for rides, freelance work, physical goods.
            </span>
          </div>
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
