// ============================================================================
// useGameContract.js — Real Solana blockchain integration for PEPE JUMP
// ============================================================================
// Provides: wallet connection, PEPE balance, buy coins, start game,
//           submit score, leaderboard, prize pool — all on-chain.
// ============================================================================

import { useState, useEffect, useCallback, useRef } from "react";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import {
  PublicKey,
  SystemProgram,
  LAMPORTS_PER_SOL,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";
import * as anchor from "@coral-xyz/anchor";

// ---------------------------------------------------------------------------
// Program Configuration
// ---------------------------------------------------------------------------
const PROGRAM_ID = new PublicKey(
  import.meta.env.VITE_PROGRAM_ID || "PEPEjump111111111111111111111111111111111"
);
const PEPE_PRICE_LAMPORTS = 10_000_000; // 0.01 SOL per PEPE coin
const PLATFORM_FEE_BPS = 300; // 3% — must match smart contract

// ---------------------------------------------------------------------------
// PDA Helpers
// ---------------------------------------------------------------------------
function getGameStatePda() {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("game_state")],
    PROGRAM_ID
  );
}
function getGameVaultPda() {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("game_vault")],
    PROGRAM_ID
  );
}
function getPlayerPda(wallet) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("player"), wallet.toBuffer()],
    PROGRAM_ID
  );
}

// ---------------------------------------------------------------------------
// IDL (Anchor Interface Definition) — minimal version for client calls
// Must match programs/pepe_jump/src/lib.rs exactly
// ---------------------------------------------------------------------------
const IDL = {
  version: "0.1.0",
  name: "pepe_jump",
  instructions: [
    {
      name: "buyPepeCoins",
      accounts: [
        { name: "gameState", isMut: true, isSigner: false },
        { name: "playerAccount", isMut: true, isSigner: false },
        { name: "gameVault", isMut: true, isSigner: false },
        { name: "buyer", isMut: true, isSigner: true },
        { name: "systemProgram", isMut: false, isSigner: false },
      ],
      args: [{ name: "amount", type: "u64" }],
    },
    {
      name: "startGame",
      accounts: [
        { name: "playerAccount", isMut: true, isSigner: false },
        { name: "player", isMut: false, isSigner: true },
      ],
      args: [],
    },
    {
      name: "submitScore",
      accounts: [
        { name: "gameState", isMut: true, isSigner: false },
        { name: "playerAccount", isMut: true, isSigner: false },
        { name: "player", isMut: false, isSigner: true },
      ],
      args: [{ name: "score", type: "u64" }],
    },
    {
      name: "buyPowerUp",
      accounts: [
        { name: "playerAccount", isMut: true, isSigner: false },
        { name: "player", isMut: false, isSigner: true },
      ],
      args: [
        { name: "powerUpType", type: "u8" },
        { name: "cost", type: "u64" },
      ],
    },
  ],
  accounts: [
    {
      name: "GameState",
      type: {
        kind: "struct",
        fields: [
          { name: "authority", type: "publicKey" },
          { name: "platformFeeBps", type: "u64" },
          { name: "totalSolCollected", type: "u64" },
          { name: "prizePoolLamports", type: "u64" },
          { name: "platformFeesLamports", type: "u64" },
          { name: "leaderboardDay", type: "i64" },
          {
            name: "leaderboard",
            type: { array: [{ defined: "LeaderboardEntry" }, 10] },
          },
          { name: "bump", type: "u8" },
        ],
      },
    },
    {
      name: "PlayerAccount",
      type: {
        kind: "struct",
        fields: [
          { name: "owner", type: "publicKey" },
          { name: "pepeBalance", type: "u64" },
          { name: "totalPurchased", type: "u64" },
          { name: "totalGamesPlayed", type: "u64" },
          { name: "highScore", type: "u64" },
          { name: "currentGameActive", type: "bool" },
        ],
      },
    },
  ],
  types: [
    {
      name: "LeaderboardEntry",
      type: {
        kind: "struct",
        fields: [
          { name: "player", type: "publicKey" },
          { name: "score", type: "u64" },
        ],
      },
    },
  ],
};

// ---------------------------------------------------------------------------
// The Hook
// ---------------------------------------------------------------------------
export default function useGameContract() {
  const { connection } = useConnection();
  const wallet = useWallet();
  const { setVisible } = useWalletModal();

  // State
  const [pepeBalance, setPepeBalance] = useState(0);
  const [highScore, setHighScore] = useState(0);
  const [prizePool, setPrizePool] = useState(0);
  const [platformFees, setPlatformFees] = useState(0);
  const [leaderboard, setLeaderboard] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [txStatus, setTxStatus] = useState(null); // "pending" | "confirmed" | "error"

  const programRef = useRef(null);

  // Create Anchor program instance
  const getProgram = useCallback(() => {
    if (!wallet.publicKey || !wallet.signTransaction) return null;
    if (programRef.current) return programRef.current;

    const provider = new anchor.AnchorProvider(connection, wallet, {
      commitment: "confirmed",
      preflightCommitment: "confirmed",
    });
    const program = new anchor.Program(IDL, PROGRAM_ID, provider);
    programRef.current = program;
    return program;
  }, [connection, wallet]);

  // Reset program ref when wallet changes
  useEffect(() => {
    programRef.current = null;
  }, [wallet.publicKey]);

  // -----------------------------------------------------------------------
  // READ: Fetch game state (prize pool, leaderboard, fees)
  // -----------------------------------------------------------------------
  const fetchGameState = useCallback(async () => {
    try {
      const [pda] = getGameStatePda();
      const info = await connection.getAccountInfo(pda);
      if (!info) return;

      const program = getProgram();
      if (!program) {
        // Read without wallet (just for display)
        // Fallback: decode manually or skip
        return;
      }

      const state = await program.account.gameState.fetch(pda);

      setPrizePool(state.prizePoolLamports.toNumber() / LAMPORTS_PER_SOL);
      setPlatformFees(
        state.platformFeesLamports.toNumber() / LAMPORTS_PER_SOL
      );

      // Parse leaderboard (filter empty entries)
      const lb = state.leaderboard
        .map((entry) => ({
          player: entry.player.toBase58(),
          score: entry.score.toNumber(),
        }))
        .filter((e) => e.score > 0)
        .sort((a, b) => b.score - a.score);

      setLeaderboard(lb);
    } catch (e) {
      console.warn("Failed to fetch game state:", e.message);
    }
  }, [connection, getProgram]);

  // -----------------------------------------------------------------------
  // READ: Fetch player account (balance, high score)
  // -----------------------------------------------------------------------
  const fetchPlayerData = useCallback(async () => {
    if (!wallet.publicKey) return;
    try {
      const program = getProgram();
      if (!program) return;

      const [playerPda] = getPlayerPda(wallet.publicKey);
      const player = await program.account.playerAccount.fetch(playerPda);

      setPepeBalance(player.pepeBalance.toNumber());
      setHighScore(player.highScore.toNumber());
    } catch (e) {
      // Account doesn't exist yet (first-time player)
      setPepeBalance(0);
      setHighScore(0);
    }
  }, [wallet.publicKey, getProgram]);

  // Auto-refresh data
  useEffect(() => {
    fetchGameState();
    fetchPlayerData();
    const iv = setInterval(() => {
      fetchGameState();
      fetchPlayerData();
    }, 10000); // refresh every 10s
    return () => clearInterval(iv);
  }, [fetchGameState, fetchPlayerData]);

  // -----------------------------------------------------------------------
  // WRITE: Connect wallet
  // -----------------------------------------------------------------------
  const connectWallet = useCallback(() => {
    setVisible(true); // opens Solana wallet modal (Phantom, Solflare, etc.)
  }, [setVisible]);

  // -----------------------------------------------------------------------
  // WRITE: Buy PEPE coins with SOL
  // -----------------------------------------------------------------------
  const buyPepeCoins = useCallback(
    async (amount) => {
      if (!wallet.publicKey) throw new Error("Wallet not connected");
      setLoading(true);
      setTxStatus("pending");
      setError(null);

      try {
        const program = getProgram();
        if (!program) throw new Error("Program not initialized");

        const [gameStatePda] = getGameStatePda();
        const [gameVaultPda] = getGameVaultPda();
        const [playerPda] = getPlayerPda(wallet.publicKey);

        const tx = await program.methods
          .buyPepeCoins(new BN(amount))
          .accounts({
            gameState: gameStatePda,
            playerAccount: playerPda,
            gameVault: gameVaultPda,
            buyer: wallet.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .rpc();

        setTxStatus("confirmed");
        console.log(`Bought ${amount} PEPE. TX: ${tx}`);

        // Refresh balances
        await fetchPlayerData();
        await fetchGameState();

        return tx;
      } catch (e) {
        setError(e.message);
        setTxStatus("error");
        throw e;
      } finally {
        setLoading(false);
      }
    },
    [wallet, getProgram, fetchPlayerData, fetchGameState]
  );

  // -----------------------------------------------------------------------
  // WRITE: Start a game round (costs 1 or 2 PEPE)
  // -----------------------------------------------------------------------
  const startGame = useCallback(async () => {
    if (!wallet.publicKey) throw new Error("Wallet not connected");
    setLoading(true);
    setError(null);

    try {
      const program = getProgram();
      if (!program) throw new Error("Program not initialized");

      const [playerPda] = getPlayerPda(wallet.publicKey);

      const tx = await program.methods
        .startGame()
        .accounts({
          playerAccount: playerPda,
          player: wallet.publicKey,
        })
        .rpc();

      console.log(`Game started. TX: ${tx}`);
      await fetchPlayerData();
      return tx;
    } catch (e) {
      setError(e.message);
      throw e;
    } finally {
      setLoading(false);
    }
  }, [wallet, getProgram, fetchPlayerData]);

  // -----------------------------------------------------------------------
  // WRITE: Submit game score
  // -----------------------------------------------------------------------
  const submitScore = useCallback(
    async (score) => {
      if (!wallet.publicKey) throw new Error("Wallet not connected");
      setLoading(true);
      setError(null);

      try {
        const program = getProgram();
        if (!program) throw new Error("Program not initialized");

        const [gameStatePda] = getGameStatePda();
        const [playerPda] = getPlayerPda(wallet.publicKey);

        const tx = await program.methods
          .submitScore(new BN(score))
          .accounts({
            gameState: gameStatePda,
            playerAccount: playerPda,
            player: wallet.publicKey,
          })
          .rpc();

        console.log(`Score ${score} submitted. TX: ${tx}`);
        await fetchPlayerData();
        await fetchGameState();
        return tx;
      } catch (e) {
        setError(e.message);
        throw e;
      } finally {
        setLoading(false);
      }
    },
    [wallet, getProgram, fetchPlayerData, fetchGameState]
  );

  // -----------------------------------------------------------------------
  // WRITE: Buy power-up
  // -----------------------------------------------------------------------
  const buyPowerUp = useCallback(
    async (powerUpType, cost) => {
      if (!wallet.publicKey) throw new Error("Wallet not connected");
      setLoading(true);
      setError(null);

      try {
        const program = getProgram();
        if (!program) throw new Error("Program not initialized");

        const [playerPda] = getPlayerPda(wallet.publicKey);

        const tx = await program.methods
          .buyPowerUp(powerUpType, new BN(cost))
          .accounts({
            playerAccount: playerPda,
            player: wallet.publicKey,
          })
          .rpc();

        console.log(`Power-up ${powerUpType} bought. TX: ${tx}`);
        await fetchPlayerData();
        return tx;
      } catch (e) {
        setError(e.message);
        throw e;
      } finally {
        setLoading(false);
      }
    },
    [wallet, getProgram, fetchPlayerData]
  );

  // -----------------------------------------------------------------------
  // Utility
  // -----------------------------------------------------------------------
  const walletAddress = wallet.publicKey
    ? wallet.publicKey.toBase58().slice(0, 4) +
      "..." +
      wallet.publicKey.toBase58().slice(-4)
    : "";

  const isConnected = wallet.connected && !!wallet.publicKey;

  const solCost = (pepeAmount) =>
    (pepeAmount * PEPE_PRICE_LAMPORTS) / LAMPORTS_PER_SOL;

  const platformFeePct =
    PLATFORM_FEE_BPS / 100; // 3%

  return {
    // Wallet
    isConnected,
    walletAddress,
    connectWallet,

    // Player
    pepeBalance,
    highScore,

    // Game state
    prizePool,
    platformFees,
    platformFeePct,
    leaderboard,

    // Actions
    buyPepeCoins,
    startGame,
    submitScore,
    buyPowerUp,

    // UI state
    loading,
    error,
    txStatus,

    // Utils
    solCost,
    refresh: () => {
      fetchGameState();
      fetchPlayerData();
    },
  };
}
