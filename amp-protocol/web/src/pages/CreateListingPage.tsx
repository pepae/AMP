import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { parseEther, keccak256, stringToBytes } from "viem";
import { useNavigate } from "react-router-dom";
import {
  CONTRACTS,
  CATEGORY_OPTIONS,
  CATEGORY_CONFIG,
  CATEGORY_FIELDS,
  type CategoryField,
} from "../lib/constants";
import { LISTING_REGISTRY_ABI } from "../lib/abis";

interface FormValues {
  category: string;
  pricingToken: string;
  basePrice: string;
  pricingUnit: string;
  agentCardURL: string;
  expiresInDays: number;
}

const MIN_DEPOSIT = parseEther("0.001");

export default function CreateListingPage() {
  const { address } = useAccount();
  const navigate = useNavigate();
  const [step, setStep] = useState<"form" | "pending" | "success">("form");
  const [txHash, setTxHash] = useState<`0x${string}` | undefined>();
  const [bodyMode, setBodyMode] = useState<"structured" | "uri">("structured");
  const [uriValue, setUriValue] = useState("");
  const [structuredValues, setStructuredValues] = useState<Record<string, string>>({});

  const { register, handleSubmit, watch, setValue, formState: { errors } } = useForm<FormValues>({
    defaultValues: {
      category: "services/accommodation",
      pricingToken: "0x0000000000000000000000000000000000000000",
      pricingUnit: "night",
      expiresInDays: 365,
    },
  });

  const category = watch("category");

  // Sync default pricing unit when category changes
  useEffect(() => {
    const cfg = CATEGORY_CONFIG[category];
    if (cfg) setValue("pricingUnit", cfg.defaultPricingUnit);
  }, [category, setValue]);

  const { writeContractAsync } = useWriteContract();
  const { isSuccess } = useWaitForTransactionReceipt({ hash: txHash });

  function setField(key: string, value: string) {
    setStructuredValues((prev) => ({ ...prev, [key]: value }));
  }

  async function onSubmit(values: FormValues) {
    if (!address) return;

    let metadataURI: string;
    if (bodyMode === "uri") {
      if (!uriValue.trim()) { alert("Please enter a URI"); return; }
      metadataURI = uriValue.trim();
    } else {
      const fields = CATEGORY_FIELDS[values.category] ?? [];
      for (const f of fields) {
        if (f.required && !structuredValues[f.key]?.trim()) {
          alert(`"${f.label}" is required`);
          return;
        }
      }
      const payload = { _category: values.category, ...structuredValues };
      metadataURI = "data:application/json," + encodeURIComponent(JSON.stringify(payload));
    }

    const categoryHash = keccak256(stringToBytes(values.category));
    const expiresAt = BigInt(Math.floor(Date.now() / 1000) + values.expiresInDays * 86400);
    setStep("pending");
    try {
      const hash = await writeContractAsync({
        address: CONTRACTS.ListingRegistry,
        abi: LISTING_REGISTRY_ABI,
        functionName: "createListing",
        args: [
          categoryHash,
          metadataURI,
          values.pricingToken as `0x${string}`,
          parseEther(values.basePrice),
          values.pricingUnit,
          values.agentCardURL,
          expiresAt,
        ],
        value: MIN_DEPOSIT,
      });
      setTxHash(hash);
      setStep("success");
    } catch (e) {
      console.error(e);
      setStep("form");
    }
  }

  if (!address) {
    return (
      <div className="max-w-lg mx-auto text-center py-20">
        <p className="text-amber-400 text-lg font-medium">Connect your wallet to create a listing.</p>
      </div>
    );
  }

  const catCfg = CATEGORY_CONFIG[category];
  const structFields = CATEGORY_FIELDS[category] ?? [];

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-7">
        <h1 className="text-2xl font-bold text-slate-900">Create a Listing</h1>
        <p className="text-slate-400 text-sm mt-1">Publish a new offer on the AMP protocol</p>
      </div>

      {step === "success" ? (
        <div className="bg-white border border-green-200 p-6" data-testid="create-success">
          <div className="flex items-center gap-3 mb-3">
            <h2 className="text-green-700 font-bold text-xl">Listing Created!</h2>
          </div>
          <p className="text-slate-700 text-sm mb-4">
            Your listing has been published on Gnosis Chiado.
            {isSuccess ? " Transaction confirmed." : " Waiting for confirmation…"}
          </p>
          <p className="text-xs text-slate-500 break-all mb-5 font-mono">Tx: {txHash}</p>
          <div className="flex gap-3">
            <button onClick={() => navigate("/my/listings")} className="btn-primary">
              View My Listings
            </button>
            <button onClick={() => setStep("form")} className="btn-outline">
              Create Another
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" data-testid="create-listing-form">

          {/* ─── 1. Category ─────────────────────────────────── */}
          <div className="card p-5">
            <p className="section-header">1 — Category</p>
            <select
              {...register("category", { required: true })}
              data-testid="field-category"
              className="select-field"
            >
              {CATEGORY_OPTIONS.map((c) => (
                <option key={c.value} value={c.value}>
                  {CATEGORY_CONFIG[c.value]?.icon} {c.label}
                </option>
              ))}
            </select>
          </div>

          {/* ─── 2. Offer Content ────────────────────────────── */}
          <div className="card p-5">
            <p className="section-header">2 — Offer Content</p>

            {/* Mode toggle */}
            <div className="flex gap-1 mb-5 bg-slate-100 rounded p-1 w-fit">
              {(["structured", "uri"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setBodyMode(mode)}
                  className={`px-4 py-1.5 rounded text-sm font-medium transition-colors ${
                    bodyMode === mode
                      ? "bg-white text-slate-900"
                      : "text-slate-500 hover:text-slate-900"
                  }`}
                >
                  {mode === "structured" ? "Fill Details" : "Metadata URI"}
                </button>
              ))}
            </div>

            {bodyMode === "uri" ? (
              <div>
                <label className="label">IPFS or HTTPS URI</label>
                <input
                  type="text"
                  value={uriValue}
                  onChange={(e) => setUriValue(e.target.value)}
                  data-testid="field-metadataURI"
                  placeholder="ipfs://Qm… or https://…"
                  className="input-field"
                />
                <p className="text-xs text-slate-500 mt-1.5">
                  Link to a JSON metadata file following the AMP listing schema.
                </p>
              </div>
            ) : (
              <div>
                {catCfg && (
                  <div
                    className="flex items-center gap-2 text-sm font-semibold mb-4"
                    style={{ color: catCfg.stripColor }}
                  >
                    <span className="text-lg">{catCfg.icon}</span>
                    <span>{catCfg.label} details</span>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-4">
                  {structFields.map((field: CategoryField) => (
                    <div key={field.key} className={field.span === "full" ? "col-span-2" : ""}>
                      <label className="label">
                        {field.label}
                        {field.required && <span className="text-red-400 ml-1">*</span>}
                        {field.type === "tags" && (
                          <span className="text-slate-600 ml-1 normal-case font-normal tracking-normal">
                            (comma-separated)
                          </span>
                        )}
                      </label>

                      {field.type === "textarea" ? (
                        <textarea
                          value={structuredValues[field.key] ?? ""}
                          onChange={(e) => setField(field.key, e.target.value)}
                          placeholder={field.placeholder}
                          rows={3}
                          className="input-field resize-none"
                        />
                      ) : field.type === "select" ? (
                        <select
                          value={structuredValues[field.key] ?? ""}
                          onChange={(e) => setField(field.key, e.target.value)}
                          className="select-field"
                        >
                          <option value="">Select…</option>
                          {field.options?.map((opt) => (
                            <option key={opt} value={opt}>{opt}</option>
                          ))}
                        </select>
                      ) : (
                        <input
                          type={field.type === "number" ? "number" : "text"}
                          value={structuredValues[field.key] ?? ""}
                          onChange={(e) => setField(field.key, e.target.value)}
                          placeholder={field.placeholder}
                          step={field.type === "number" ? "any" : undefined}
                          className="input-field"
                        />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* ─── 3. Pricing ──────────────────────────────────── */}
          <div className="card p-5">
            <p className="section-header">3 — Pricing</p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">Base Price (xDAI) <span className="text-red-400">*</span></label>
                <input
                  {...register("basePrice", { required: "Required", min: { value: 0.0001, message: "Too low" } })}
                  data-testid="field-basePrice"
                  type="number"
                  step="0.0001"
                  placeholder="0.01"
                  className="input-field"
                />
                {errors.basePrice && (
                  <p className="text-red-400 text-xs mt-1">{errors.basePrice.message}</p>
                )}
              </div>
              <div>
                <label className="label">Pricing Unit <span className="text-red-400">*</span></label>
                <input
                  {...register("pricingUnit", { required: "Required" })}
                  data-testid="field-pricingUnit"
                  placeholder="night, hour, project…"
                  className="input-field"
                />
              </div>
            </div>
          </div>

          {/* ─── 4. Agent Card & Expiry ───────────────────────── */}
          <div className="card p-5">
            <p className="section-header">4 — Agent Card &amp; Expiry</p>
            <div className="space-y-4">
              <div>
                <label className="label">
                  Agent Card URL{" "}
                  <span className="text-slate-600 normal-case font-normal tracking-normal">(optional)</span>
                </label>
                <input
                  {...register("agentCardURL")}
                  data-testid="field-agentCardURL"
                  placeholder="https://myagent.example/.well-known/agent.json"
                  className="input-field"
                />
                <p className="text-xs text-slate-600 mt-1.5">
                  URL to an A2A-compatible agent card for automated negotiation.
                </p>
              </div>
              <div className="w-40">
                <label className="label">Expires In (days)</label>
                <input
                  {...register("expiresInDays", { required: true, min: 1 })}
                  data-testid="field-expiresInDays"
                  type="number"
                  className="input-field"
                />
              </div>
            </div>
          </div>

          {/* ─── Submit ──────────────────────────────────────── */}
          <div className="card p-4 flex items-center justify-between gap-4">
            <p className="text-sm text-slate-400">
              Requires a{" "}
              <span className="text-slate-900 font-semibold">0.001 xDAI</span>{" "}
              anti-spam deposit (refundable on removal)
            </p>
            <button
              type="submit"
              disabled={step === "pending"}
              data-testid="submit-listing-btn"
              className="btn-primary whitespace-nowrap"
            >
              {step === "pending" ? "Publishing…" : "Publish Listing →"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
