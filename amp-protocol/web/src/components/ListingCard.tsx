import { Link } from "react-router-dom";
import type { Listing } from "../lib/api";
import { CATEGORY_CONFIG } from "../lib/constants";

interface Props {
  listing: Listing;
}

export default function ListingCard({ listing }: Props) {
  const cfg = CATEGORY_CONFIG[listing.categoryName];
  const color = cfg?.stripColor ?? "#6366f1";
  const catLabel = (listing.categoryName.split("/")[1] ?? listing.categoryName).toUpperCase();

  const displayName = listing.metadata?.name
    ? String(listing.metadata.name)
    : listing.metadataURI.startsWith("ipfs://")
    ? "IPFS: " + listing.metadataURI.slice(7, 22) + "…"
    : listing.metadataURI.length > 42
    ? listing.metadataURI.slice(0, 42) + "…"
    : listing.metadataURI;

  const description = listing.metadata?.description
    ? String(listing.metadata.description).slice(0, 90) +
      (String(listing.metadata.description).length > 90 ? "…" : "")
    : null;

  return (
    <Link
      to={`/listing/${listing.id}`}
      data-testid="listing-card"
      className="block bg-white border border-slate-200 hover:border-slate-300 overflow-hidden transition-colors"
      style={{ borderLeftWidth: 3, borderLeftColor: color }}
    >
      <div className="p-5">
        <div className="flex items-start justify-between mb-3 gap-2">
          <span
            className="text-[10px] font-bold px-2 py-0.5 uppercase tracking-wider flex-shrink-0"
            style={{ color, background: color + "15" }}
          >
            {catLabel}
          </span>
          <span
            className={`text-[10px] px-2 py-0.5 font-semibold uppercase tracking-wide flex-shrink-0 ${
              listing.status === 0
                ? "bg-green-50 text-green-700 border border-green-200"
                : "bg-slate-100 text-slate-500 border border-slate-200"
            }`}
          >
            {listing.statusLabel}
          </span>
        </div>

        <h3 className="font-semibold text-slate-900 mb-1.5 line-clamp-1 text-sm" title={displayName}>
          {displayName}
        </h3>

        {description && (
          <p className="text-xs text-slate-500 mb-3 line-clamp-2 leading-relaxed">{description}</p>
        )}

        <p className="text-[11px] text-slate-400 font-mono mb-4">
          {listing.creator.slice(0, 6)}…{listing.creator.slice(-4)}
        </p>

        <div className="pt-3 border-t border-slate-100">
          <span className="font-bold text-slate-900 text-base tabular-nums">
            {parseFloat(listing.basePriceEther).toFixed(4)}
          </span>
          <span className="text-slate-500 text-xs ml-1">xDAI</span>
          <span className="text-slate-400 text-xs ml-1">/ {listing.pricingUnit}</span>
        </div>
      </div>
    </Link>
  );
}
