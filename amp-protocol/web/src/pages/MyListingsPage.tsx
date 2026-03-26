import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAccount } from "wagmi";
import { api, type Listing } from "../lib/api";
import { CATEGORY_CONFIG } from "../lib/constants";

export default function MyListingsPage() {
  const { address } = useAccount();
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!address) return;
    api
      .getListings({ creator: address })
      .then((r) => setListings(r.listings))
      .finally(() => setLoading(false));
  }, [address]);

  if (!address)
    return (
      <div className="text-center py-20 text-slate-500">
        Connect your wallet to view your listings.
      </div>
    );

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-900">My Listings</h1>
        <Link to="/create" className="btn-primary">
          + New Listing
        </Link>
      </div>

      {loading && <p className="text-slate-400">Loading…</p>}
      {!loading && listings.length === 0 && (
        <div className="text-center py-24" data-testid="no-listings">
          <p className="text-slate-500 mb-4">No listings yet.</p>
          <Link to="/create" className="btn-primary inline-block">
            Create one
          </Link>
        </div>
      )}
      <div className="space-y-2" data-testid="my-listings-list">
        {listings.map((l) => {
          const cfg = CATEGORY_CONFIG[l.categoryName];
          const title = l.metadata?.name ? String(l.metadata.name) : l.metadataURI;
          return (
            <div key={l.id} className="bg-white border border-slate-200 flex items-center p-4 gap-3"
              style={{ borderLeftWidth: 3, borderLeftColor: cfg?.stripColor ?? "#6366f1" }}
            >
              <div className="flex-1 min-w-0">
                <p className="text-slate-900 font-medium truncate">{title}</p>
                <p className="text-sm text-slate-500">
                  {parseFloat(l.basePriceEther).toFixed(4)} xDAI / {l.pricingUnit}
                  {" · "}
                  <span className={l.status === 0 ? "text-green-600" : "text-slate-400"}>
                    {l.statusLabel}
                  </span>
                </p>
              </div>
              <Link
                to={`/listing/${l.id}`}
                className="text-blue-600 hover:text-blue-700 text-sm flex-shrink-0"
              >
                View →
              </Link>
            </div>
          );
        })}
      </div>
    </div>
  );
}
