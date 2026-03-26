import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAccount, useWriteContract } from "wagmi";
import { parseEther, keccak256, stringToBytes } from "viem";
import { api, type Listing } from "../lib/api";
import { CONTRACTS, CATEGORY_CONFIG } from "../lib/constants";
import { ESCROW_ABI } from "../lib/abis";

function MetaField({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-slate-50 border border-slate-200 p-3">
      <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
        {label}
      </div>
      <div className="text-sm text-slate-700 break-words">{value}</div>
    </div>
  );
}

export default function ListingDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { address } = useAccount();
  const navigate = useNavigate();
  const [listing, setListing] = useState<Listing | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [bookingAmount, setBookingAmount] = useState("");
  const [bookingStatus, setBookingStatus] = useState<"idle" | "pending" | "success" | "error">("idle");
  const [txHash, setTxHash] = useState("");

  const { writeContractAsync } = useWriteContract();

  useEffect(() => {
    if (!id) return;
    api
      .getListing(id)
      .then(setListing)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  async function handleBook() {
    if (!listing || !address) return;
    const amount = parseEther(bookingAmount || listing.basePriceEther);
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 7 * 24 * 3600);
    const termsHash = keccak256(
      stringToBytes(JSON.stringify({ listingId: listing.id, amount: bookingAmount }))
    );
    setBookingStatus("pending");
    try {
      const hash = await writeContractAsync({
        address: CONTRACTS.AMPEscrow,
        abi: ESCROW_ABI,
        functionName: "createAndFundOrder",
        args: [
          listing.id as `0x${string}`,
          listing.creator as `0x${string}`,
          "0x0000000000000000000000000000000000000000",
          amount,
          termsHash,
          deadline,
        ],
        value: amount,
      });
      setTxHash(hash);
      setBookingStatus("success");
    } catch (e: unknown) {
      console.error(e);
      setBookingStatus("error");
    }
  }

  if (loading)
    return (
      <div className="text-center py-24 text-slate-500" data-testid="loading">
        Loading…
      </div>
    );
  if (error || !listing)
    return (
      <div className="text-center py-24 text-red-600" data-testid="not-found">
        {error || "Listing not found"}
      </div>
    );

  const cfg = CATEGORY_CONFIG[listing.categoryName];
  const color = cfg?.stripColor ?? "#6366f1";
  const meta = listing.metadata;
  const title = meta?.name ? String(meta.name) : listing.metadataURI;

  // Structured fields to display (excluding private/already shown keys)
  const SKIP_KEYS = new Set(["_category", "name", "description"]);
  const extraFields = meta
    ? Object.entries(meta).filter(([k, v]) => !SKIP_KEYS.has(k) && v)
    : [];

  return (
    <div className="max-w-2xl mx-auto" data-testid="listing-detail">
      <button
        onClick={() => navigate(-1)}
        className="text-slate-400 hover:text-slate-900 text-sm mb-5 flex items-center gap-1 transition-colors"
      >
        ← Back
      </button>

      <div className="bg-white border border-slate-200 overflow-hidden">
        {/* Colour cap */}
        <div className="h-1" style={{ background: color }} />

        <div className="p-6">
          {/* Header */}
          <div className="flex items-start justify-between gap-4 mb-5">
            <div className="flex-1">
              <span
                className="text-xs font-bold px-2 py-0.5 border uppercase tracking-wide"
                style={{ color, borderColor: color + "55", background: color + "18" }}
              >
                {listing.categoryName.split("/")[1] ?? listing.categoryName}
              </span>
              <h1 className="text-2xl font-bold text-slate-900 mt-2">{title}</h1>
              {meta?.description && (
                <p className="text-slate-600 text-sm mt-2 leading-relaxed">
                  {String(meta.description)}
                </p>
              )}
            </div>
            <span
              className={`text-xs font-semibold px-3 py-1 border whitespace-nowrap ${
                listing.status === 0
                  ? "bg-green-50 text-green-600 border-green-200"
                  : "bg-slate-100 text-slate-500 border-slate-200"
              }`}
            >
              {listing.statusLabel}
            </span>
          </div>

          {/* Core details */}
          <div className="grid grid-cols-2 gap-3 mb-5">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">Seller</div>
              <p className="text-slate-900 font-mono text-sm">
                {listing.creator.slice(0, 8)}…{listing.creator.slice(-6)}
              </p>
            </div>
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">Price</div>
              <p className="font-bold text-lg" style={{ color }}>
                {parseFloat(listing.basePriceEther).toFixed(4)}{" "}
                <span className="text-slate-500 font-normal text-sm">xDAI</span>
                <span className="text-slate-500 font-normal text-sm ml-1">/ {listing.pricingUnit}</span>
              </p>
            </div>
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">Created</div>
              <p className="text-slate-700 text-sm">{new Date(listing.createdAt * 1000).toLocaleDateString()}</p>
            </div>
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">Expires</div>
              <p className="text-slate-700 text-sm">{new Date(listing.expiresAt * 1000).toLocaleDateString()}</p>
            </div>
            {listing.agentCardURL && (
              <div className="col-span-2">
                <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">Agent Card</div>
                <p className="text-blue-600 text-xs break-all">{listing.agentCardURL}</p>
              </div>
            )}
          </div>

          {/* Structured metadata extras */}
          {extraFields.length > 0 && (
            <div className="mb-5">
              <div className="text-xs font-bold uppercase tracking-widest text-slate-600 mb-3">Details</div>
              <div className="grid grid-cols-2 gap-2">
                {extraFields.map(([k, v]) => (
                  <MetaField
                    key={k}
                    label={k.replace(/([A-Z])/g, " $1").trim()}
                    value={String(v)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Raw URI link (if not structured) */}
          {!meta && (
            <div className="mb-5">
              <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">Metadata URI</div>
              <p className="text-blue-600 text-xs break-all">{listing.metadataURI}</p>
            </div>
          )}

          {/* Booking */}
          {listing.status === 0 && (
            <div className="border-t border-slate-200 pt-5">
              <h2 className="font-semibold text-slate-900 mb-3">Book This Listing</h2>
              {!address ? (
                <p className="text-amber-600 text-sm">Connect your wallet to book.</p>
              ) : bookingStatus === "success" ? (
                <div
                  className="border border-green-200 bg-green-50 p-3"
                  data-testid="booking-success"
                >
                  <p className="text-green-600 font-medium">Order created!</p>
                  <p className="text-xs text-slate-500 mt-1 break-all font-mono">Tx: {txHash}</p>
                </div>
              ) : (
                <div className="flex gap-3">
                  <input
                    data-testid="amount-input"
                    type="number"
                    step="0.0001"
                    placeholder={listing.basePriceEther}
                    value={bookingAmount}
                    onChange={(e) => setBookingAmount(e.target.value)}
                    className="input-field flex-1"
                  />
                  <button
                    data-testid="book-button"
                    onClick={handleBook}
                    disabled={bookingStatus === "pending"}
                    className="btn-primary whitespace-nowrap"
                  >
                    {bookingStatus === "pending" ? "Confirming…" : "Book & Pay"}
                  </button>
                </div>
              )}
              {bookingStatus === "error" && (
                <p className="text-red-600 text-sm mt-2" data-testid="booking-error">
                  Transaction failed. Check your wallet and try again.
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
