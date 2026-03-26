import { useEffect, useState } from "react";
import { useAccount } from "wagmi";
import { api, type Order } from "../lib/api";

const STATUS_CONFIG: Record<string, { color: string; bg: string; border: string }> = {
  Funded:    { color: "#92400e", bg: "#fffbeb", border: "#fde68a" },
  Completed: { color: "#15803d", bg: "#f0fdf4", border: "#bbf7d0" },
  Disputed:  { color: "#b91c1c", bg: "#fef2f2", border: "#fecaca" },
  Refunded:  { color: "#475569", bg: "#f8fafc", border: "#e2e8f0" },
  Resolved:  { color: "#1d4ed8", bg: "#eff6ff", border: "#bfdbfe" },
};

export default function MyOrdersPage() {
  const { address } = useAccount();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!address) return;
    Promise.all([
      api.getOrders({ buyer: address }),
      api.getOrders({ seller: address }),
    ])
      .then(([buyerRes, sellerRes]) => {
        const seen = new Set<string>();
        const combined = [...buyerRes.orders, ...sellerRes.orders].filter((o) => {
          if (seen.has(o.id)) return false;
          seen.add(o.id);
          return true;
        });
        setOrders(combined);
      })
      .finally(() => setLoading(false));
  }, [address]);

  if (!address)
    return (
      <div className="text-center py-20 text-slate-500">
        Connect your wallet to view your orders.
      </div>
    );

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900 mb-6">My Orders</h1>
      {loading && <p className="text-slate-400">Loading…</p>}
      {!loading && orders.length === 0 && (
        <div className="text-center py-24" data-testid="no-orders">
          <p className="text-slate-500">No orders yet.</p>
        </div>
      )}
      <div className="space-y-2" data-testid="my-orders-list">
        {orders.map((o) => {
          const sc = STATUS_CONFIG[o.statusLabel];
          const isbuyer = address && o.buyer.toLowerCase() === address.toLowerCase();
          return (
            <div key={o.id} className="bg-white border border-slate-200 p-4 text-sm">
              <div className="flex items-center justify-between mb-3">
                <span className="font-mono text-xs text-slate-400">
                  {o.id.slice(0, 10)}…{o.id.slice(-6)}
                </span>
                <span
                  className="text-xs font-semibold px-2 py-0.5 border"
                  style={sc ? { color: sc.color, background: sc.bg, borderColor: sc.border } : {}}
                >
                  {o.statusLabel}
                </span>
              </div>
              <div className="grid grid-cols-4 gap-3 text-slate-700">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">Amount</div>
                  <p>{parseFloat(o.amountEther).toFixed(4)} xDAI</p>
                </div>
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">Role</div>
                  <p>{isbuyer ? "Buyer" : "Seller"}</p>
                </div>
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">Created</div>
                  <p>{new Date(o.createdAt * 1000).toLocaleDateString()}</p>
                </div>
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">Deadline</div>
                  <p>{new Date(o.deadline * 1000).toLocaleDateString()}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
