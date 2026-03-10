// ============================================================================
// App.jsx — Wraps PepeJump with Solana Wallet Providers
// ============================================================================
import React, { useMemo } from "react";
import {
  ConnectionProvider,
  WalletProvider,
} from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import {
  PhantomWalletAdapter,
  SolflareWalletAdapter,
} from "@solana/wallet-adapter-wallets";
import { clusterApiUrl } from "@solana/web3.js";
import PepeJump from "./PepeJump";

// Network: "devnet" for testing, "mainnet-beta" for production
const NETWORK = import.meta.env.VITE_NETWORK || "devnet";

export default function App() {
  const endpoint = useMemo(
    () => import.meta.env.VITE_SOLANA_RPC || clusterApiUrl(NETWORK),
    []
  );

  const wallets = useMemo(
    () => [new PhantomWalletAdapter(), new SolflareWalletAdapter()],
    []
  );

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          <PepeJump />
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
