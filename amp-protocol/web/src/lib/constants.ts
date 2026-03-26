// AMP contract addresses (Chiado testnet)
export const CONTRACTS = {
  ListingRegistry: "0x01517B12805AdeC6dCb978FDB139c3bD0A92879E" as `0x${string}`,
  AMPEscrow: "0xADaA2Eb39eCDfbb457D36d34951daEd08179e3c8" as `0x${string}`,
  ReputationLedger: "0x79145D065c713596e1c2a1715c5c655dC3641CB5" as `0x${string}`,
} as const;

export const CATEGORY_OPTIONS = [
  { value: "services/accommodation", label: "Accommodation" },
  { value: "services/transport",     label: "Transport" },
  { value: "services/food",          label: "Food & Catering" },
  { value: "services/professional",  label: "Professional Services" },
  { value: "services/agent",         label: "Agent Services" },
  { value: "goods/physical",         label: "Physical Goods" },
  { value: "goods/digital",          label: "Digital Goods" },
] as const;

export const TOKEN_OPTIONS = [
  { value: "0x0000000000000000000000000000000000000000", label: "xDAI (native)" },
] as const;

export interface CategoryConfig {
  icon: string;
  label: string;
  stripColor: string;
  defaultPricingUnit: string;
}

export const CATEGORY_CONFIG: Record<string, CategoryConfig> = {
  "services/accommodation": { icon: "🏠", label: "Accommodation",        stripColor: "#0ea5e9", defaultPricingUnit: "night"   },
  "services/transport":     { icon: "🚗", label: "Transport",            stripColor: "#8b5cf6", defaultPricingUnit: "trip"    },
  "services/food":          { icon: "🍕", label: "Food & Catering",      stripColor: "#f97316", defaultPricingUnit: "portion" },
  "services/professional":  { icon: "💼", label: "Professional Services",stripColor: "#a855f7", defaultPricingUnit: "project" },
  "services/agent":         { icon: "🤖", label: "Agent Services",       stripColor: "#10b981", defaultPricingUnit: "task"    },
  "goods/physical":         { icon: "📦", label: "Physical Goods",       stripColor: "#f59e0b", defaultPricingUnit: "item"    },
  "goods/digital":          { icon: "💾", label: "Digital Goods",        stripColor: "#3b82f6", defaultPricingUnit: "license" },
};

export type FieldType = "text" | "number" | "textarea" | "select" | "tags";

export interface CategoryField {
  key: string;
  label: string;
  type: FieldType;
  placeholder?: string;
  options?: string[];
  required?: boolean;
  span?: "full";
}

export const CATEGORY_FIELDS: Record<string, CategoryField[]> = {
  "services/accommodation": [
    { key: "name",          label: "Listing Title",      type: "text",     placeholder: "e.g. Cozy apartment in Lisbon",           required: true, span: "full" },
    { key: "description",   label: "Description",        type: "textarea", placeholder: "Describe the property and what's included…", required: true, span: "full" },
    { key: "location",      label: "City / Area",        type: "text",     placeholder: "e.g. Lisbon, Portugal",                   required: true },
    { key: "roomType",      label: "Room Type",          type: "select",   options: ["Entire place", "Private room", "Shared room"], required: true },
    { key: "maxGuests",     label: "Max Guests",         type: "number",   placeholder: "2" },
    { key: "bedrooms",      label: "Bedrooms",           type: "number",   placeholder: "1" },
    { key: "amenities",     label: "Amenities",          type: "tags",     placeholder: "WiFi, Kitchen, Parking, AC, Pool…",        span: "full" },
    { key: "checkInTime",   label: "Check-in Time",      type: "text",     placeholder: "15:00" },
    { key: "checkOutTime",  label: "Check-out Time",     type: "text",     placeholder: "11:00" },
  ],
  "services/transport": [
    { key: "name",        label: "Service Name",        type: "text",     placeholder: "e.g. Private airport transfer",   required: true, span: "full" },
    { key: "description",label: "Description",          type: "textarea", placeholder: "Describe the vehicle and service…",              span: "full" },
    { key: "origin",      label: "Origin / Area",       type: "text",     placeholder: "e.g. Lisbon Airport",             required: true },
    { key: "destination", label: "Destination / Area",  type: "text",     placeholder: "e.g. Lisbon City Center" },
    { key: "vehicleType", label: "Vehicle Type",        type: "select",   options: ["Sedan", "SUV", "Van", "Minibus", "Bus", "Motorcycle", "Bicycle", "Other"] },
    { key: "capacity",    label: "Passenger Capacity",  type: "number",   placeholder: "4" },
    { key: "features",    label: "Features",            type: "tags",     placeholder: "A/C, Meet & Greet, Child seat, Luggage…" },
  ],
  "services/food": [
    { key: "name",           label: "Listing Name",         type: "text",     placeholder: "e.g. Home-cooked Mediterranean meals", required: true, span: "full" },
    { key: "description",    label: "Description",          type: "textarea", placeholder: "Describe your food offering…",          required: true, span: "full" },
    { key: "cuisine",        label: "Cuisine Type",         type: "text",     placeholder: "e.g. Mediterranean, Japanese, Vegan" },
    { key: "location",       label: "Location / Delivery",  type: "text",     placeholder: "e.g. Lisbon CBD" },
    { key: "dietaryOptions", label: "Dietary Options",      type: "tags",     placeholder: "Vegetarian, Vegan, Gluten-free, Halal…" },
    { key: "minOrder",       label: "Min Order (xDAI)",     type: "number",   placeholder: "0.01" },
    { key: "leadTime",       label: "Lead Time (hours)",    type: "number",   placeholder: "24" },
  ],
  "services/professional": [
    { key: "name",         label: "Service Title",            type: "text",     placeholder: "e.g. Smart Contract Audit",             required: true, span: "full" },
    { key: "description",  label: "Description",              type: "textarea", placeholder: "Describe your expertise and process…",  required: true, span: "full" },
    { key: "skills",       label: "Skills / Technologies",    type: "tags",     placeholder: "Solidity, Python, React, Legal…",                      span: "full" },
    { key: "deliverables", label: "Deliverables",             type: "textarea", placeholder: "What tangibles does the client receive?" },
    { key: "turnaround",   label: "Turnaround (days)",        type: "number",   placeholder: "7" },
    { key: "portfolio",    label: "Portfolio URL",            type: "text",     placeholder: "https://github.com/you" },
    { key: "languages",    label: "Languages",               type: "tags",     placeholder: "English, Spanish, Portuguese…" },
  ],
  "services/agent": [
    { key: "name",          label: "Agent Name",       type: "text",     placeholder: "e.g. ResearchGPT Pro",                  required: true, span: "full" },
    { key: "description",   label: "Description",     type: "textarea", placeholder: "What can this agent do?",               required: true, span: "full" },
    { key: "capabilities", label: "Capabilities",     type: "tags",     placeholder: "Web search, Code gen, PDF analysis…",               span: "full" },
    { key: "inputFormat",   label: "Input Format",    type: "text",     placeholder: "e.g. Plain text, JSON, URL" },
    { key: "outputFormat",  label: "Output Format",   type: "text",     placeholder: "e.g. Markdown report, JSON, PDF" },
    { key: "sla",           label: "Response SLA",    type: "text",     placeholder: "e.g. < 30 seconds" },
    { key: "model",         label: "Underlying Model",type: "text",     placeholder: "e.g. Claude Sonnet 4.6" },
  ],
  "goods/physical": [
    { key: "name",        label: "Product Name",    type: "text",     placeholder: "e.g. Ergonomic Mechanical Keyboard", required: true, span: "full" },
    { key: "description",label: "Description",      type: "textarea", placeholder: "Describe the item and its condition…",required: true, span: "full" },
    { key: "condition",   label: "Condition",       type: "select",   options: ["New", "Like New", "Good", "Fair", "For Parts"] },
    { key: "brand",       label: "Brand",           type: "text",     placeholder: "e.g. Keychron" },
    { key: "shipping",    label: "Shipping Options",type: "tags",     placeholder: "Worldwide, EU only, Local pickup…" },
    { key: "weight",      label: "Weight (kg)",     type: "number",   placeholder: "0.5" },
    { key: "dimensions",  label: "Dimensions (cm)", type: "text",     placeholder: "35×14×4" },
  ],
  "goods/digital": [
    { key: "name",           label: "Product Name",       type: "text",     placeholder: "e.g. Premium icon set (500 icons)", required: true, span: "full" },
    { key: "description",    label: "Description",        type: "textarea", placeholder: "Describe what's included…",         required: true, span: "full" },
    { key: "format",         label: "File Format(s)",     type: "tags",     placeholder: "SVG, PNG, PDF, ZIP, MP4…" },
    { key: "license",        label: "License",            type: "select",   options: ["Commercial Use", "Personal Use", "Open Source (MIT)", "CC BY", "CC BY-NC"] },
    { key: "fileSize",       label: "Approx. File Size",  type: "text",     placeholder: "e.g. 12 MB" },
    { key: "deliveryMethod", label: "Delivery Method",    type: "text",     placeholder: "e.g. IPFS, email, direct download" },
    { key: "previewURL",     label: "Preview URL",        type: "text",     placeholder: "https://…" },
  ],
};
