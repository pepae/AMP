import { http, createConfig } from "wagmi";
import { gnosis } from "wagmi/chains";
import { getDefaultConfig } from "@rainbow-me/rainbowkit";

// Chiado testnet definition
// Multicall3 is deployed at the standard address on Chiado:
// https://github.com/mds1/multicall
export const chiado = {
  id: 10200,
  name: "Gnosis Chiado",
  nativeCurrency: { name: "Chiado xDAI", symbol: "xDAI", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://rpc.chiadochain.net"] },
    public: { http: ["https://rpc.chiadochain.net"] },
  },
  blockExplorers: {
    default: { name: "Blockscout", url: "https://blockscout.chiadochain.net" },
  },
  contracts: {
    multicall3: {
      address: "0xcA11bde05977b3631167028862bE2a173976CA11" as `0x${string}`,
      blockCreated: 498533,
    },
  },
  testnet: true,
} as const;

// Register a free WalletConnect project at https://cloud.reown.com
// then set VITE_WC_PROJECT_ID in your .env or CI environment.
export const wagmiConfig = getDefaultConfig({
  appName: "AMP Marketplace",
  projectId: import.meta.env.VITE_WC_PROJECT_ID ?? "",
  chains: [chiado, gnosis],
  transports: {
    [chiado.id]: http("https://rpc.chiadochain.net"),
    [gnosis.id]: http("https://rpc.gnosischain.com"),
  },
  ssr: false,
});
