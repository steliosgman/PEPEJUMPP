// ============================================================================
// PEPE JUMP — Solana Client SDK
// ============================================================================
// Use this from the React frontend to interact with the on-chain program.
// Import into your React app and call these functions.
// ============================================================================

import {
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import * as anchor from "@coral-xyz/anchor";
import { AnchorProvider, Program, BN } from "@coral-xyz/anchor";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------
export const PROGRAM_ID = new PublicKey(
  "PEPEjump111111111111111111111111111111111"
);

export const PEPE_PRICE_LAMPORTS = 10_000_000; // 0.01 SOL per PEPE
export const GAME_COST_PEPE = 1;

// ---------------------------------------------------------------------------
// PDA Derivations
// ---------------------------------------------------------------------------
export function getGameStatePda(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("game_state")],
    PROGRAM_ID
  );
}

export function getGameVaultPda(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("game_vault")],
    PROGRAM_ID
  );
}

export function getPlayerAccountPda(
  playerPubkey: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("player"), playerPubkey.toBuffer()],
    PROGRAM_ID
  );
}

// ---------------------------------------------------------------------------
// Types (mirrors on-chain structs)
// ---------------------------------------------------------------------------
export interface LeaderboardEntry {
  player: PublicKey;
  score: number;
}

export interface GameState {
  authority: PublicKey;
  platformFeeBps: number;
  totalSolCollected: number;
  prizePoolLamports: number;
  platformFeesLamports: number;
  leaderboardDay: number;
  leaderboard: LeaderboardEntry[];
}

export interface PlayerAccount {
  owner: PublicKey;
  pepeBalance: number;
  totalPurchased: number;
  totalGamesPlayed: number;
  highScore: number;
  currentGameActive: boolean;
}

// ---------------------------------------------------------------------------
// Client Class
// ---------------------------------------------------------------------------
export class PepeJumpClient {
  private connection: Connection;
  private program: Program;
  private provider: AnchorProvider;

  constructor(connection: Connection, wallet: any) {
    this.connection = connection;
    this.provider = new AnchorProvider(connection, wallet, {
      commitment: "confirmed",
    });
    // In production, load the IDL from the chain or a JSON file
    // this.program = new Program(IDL, PROGRAM_ID, this.provider);
  }

  // -----------------------------------------------------------------------
  // Read Operations
  // -----------------------------------------------------------------------

  /** Fetch the global game state */
  async getGameState(): Promise<GameState | null> {
    try {
      const [pda] = getGameStatePda();
      const account = await this.program.account.gameState.fetch(pda);
      return {
        authority: account.authority,
        platformFeeBps: account.platformFeeBps.toNumber(),
        totalSolCollected: account.totalSolCollected.toNumber(),
        prizePoolLamports: account.prizePoolLamports.toNumber(),
        platformFeesLamports: account.platformFeesLamports.toNumber(),
        leaderboardDay: account.leaderboardDay.toNumber(),
        leaderboard: account.leaderboard.map((e: any) => ({
          player: e.player,
          score: e.score.toNumber(),
        })),
      };
    } catch {
      return null;
    }
  }

  /** Fetch a player's account */
  async getPlayerAccount(
    playerPubkey: PublicKey
  ): Promise<PlayerAccount | null> {
    try {
      const [pda] = getPlayerAccountPda(playerPubkey);
      const account = await this.program.account.playerAccount.fetch(pda);
      return {
        owner: account.owner,
        pepeBalance: account.pepeBalance.toNumber(),
        totalPurchased: account.totalPurchased.toNumber(),
        totalGamesPlayed: account.totalGamesPlayed.toNumber(),
        highScore: account.highScore.toNumber(),
        currentGameActive: account.currentGameActive,
      };
    } catch {
      return null;
    }
  }

  // -----------------------------------------------------------------------
  // Write Operations
  // -----------------------------------------------------------------------

  /** Buy PEPE coins with SOL */
  async buyPepeCoins(amount: number): Promise<string> {
    const [gameStatePda] = getGameStatePda();
    const [gameVaultPda] = getGameVaultPda();
    const [playerPda] = getPlayerAccountPda(
      this.provider.wallet.publicKey
    );

    const tx = await this.program.methods
      .buyPepeCoins(new BN(amount))
      .accounts({
        gameState: gameStatePda,
        playerAccount: playerPda,
        gameVault: gameVaultPda,
        buyer: this.provider.wallet.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    return tx;
  }

  /** Start a game round (costs 1 PEPE) */
  async startGame(): Promise<string> {
    const [playerPda] = getPlayerAccountPda(
      this.provider.wallet.publicKey
    );

    const tx = await this.program.methods
      .startGame()
      .accounts({
        playerAccount: playerPda,
        player: this.provider.wallet.publicKey,
      })
      .rpc();

    return tx;
  }

  /** Buy a power-up */
  async buyPowerUp(powerUpType: number, cost: number): Promise<string> {
    const [playerPda] = getPlayerAccountPda(
      this.provider.wallet.publicKey
    );

    const tx = await this.program.methods
      .buyPowerUp(powerUpType, new BN(cost))
      .accounts({
        playerAccount: playerPda,
        player: this.provider.wallet.publicKey,
      })
      .rpc();

    return tx;
  }

  /** Submit a game score */
  async submitScore(score: number): Promise<string> {
    const [gameStatePda] = getGameStatePda();
    const [playerPda] = getPlayerAccountPda(
      this.provider.wallet.publicKey
    );

    const tx = await this.program.methods
      .submitScore(new BN(score))
      .accounts({
        gameState: gameStatePda,
        playerAccount: playerPda,
        player: this.provider.wallet.publicKey,
      })
      .rpc();

    return tx;
  }

  // -----------------------------------------------------------------------
  // Utility
  // -----------------------------------------------------------------------

  /** Get the SOL cost for N PEPE coins */
  static getCostInSol(pepeAmount: number): number {
    return (pepeAmount * PEPE_PRICE_LAMPORTS) / LAMPORTS_PER_SOL;
  }

  /** Get time remaining until next leaderboard reset */
  static getTimeUntilReset(): {
    hours: number;
    minutes: number;
    seconds: number;
  } {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setUTCHours(24, 0, 0, 0);
    const diff = tomorrow.getTime() - now.getTime();
    return {
      hours: Math.floor(diff / 3600000),
      minutes: Math.floor((diff % 3600000) / 60000),
      seconds: Math.floor((diff % 60000) / 1000),
    };
  }
}
