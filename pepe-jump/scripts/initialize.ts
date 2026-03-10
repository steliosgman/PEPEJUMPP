// ============================================================================
// PEPE JUMP — Admin Scripts
// ============================================================================
// Usage:
//   Initialize:        npx ts-node scripts/initialize.ts init
//   Distribute prizes: npx ts-node scripts/initialize.ts prizes
//   Withdraw fees:     npx ts-node scripts/initialize.ts withdraw
//   Check state:       npx ts-node scripts/initialize.ts status
// ============================================================================

import * as anchor from "@coral-xyz/anchor";
import {
  Connection,
  PublicKey,
  SystemProgram,
  LAMPORTS_PER_SOL,
  Keypair,
} from "@solana/web3.js";
import fs from "fs";
import path from "path";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------
const CLUSTER = process.env.SOLANA_CLUSTER || "https://api.devnet.solana.com";
const PROGRAM_ID = new PublicKey(
  process.env.PROGRAM_ID || "PEPEjump111111111111111111111111111111111"
);
const PLATFORM_FEE_BPS = 300; // 3%

// ---------------------------------------------------------------------------
// Load wallet from default Solana CLI keypair
// ---------------------------------------------------------------------------
function loadWallet(): Keypair {
  const keypairPath =
    process.env.WALLET_PATH ||
    path.join(
      process.env.HOME || "~",
      ".config",
      "solana",
      "id.json"
    );

  const raw = JSON.parse(fs.readFileSync(keypairPath, "utf-8"));
  return Keypair.fromSecretKey(Buffer.from(raw));
}

// ---------------------------------------------------------------------------
// PDA helpers
// ---------------------------------------------------------------------------
function getGameStatePda(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("game_state")],
    PROGRAM_ID
  );
}

function getGameVaultPda(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("game_vault")],
    PROGRAM_ID
  );
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------
async function initialize(program: anchor.Program, authority: Keypair) {
  const [gameStatePda] = getGameStatePda();
  const [gameVaultPda] = getGameVaultPda();

  console.log("Initializing PEPE JUMP...");
  console.log(`  Program ID:  ${PROGRAM_ID.toBase58()}`);
  console.log(`  Authority:   ${authority.publicKey.toBase58()}`);
  console.log(`  Game State:  ${gameStatePda.toBase58()}`);
  console.log(`  Game Vault:  ${gameVaultPda.toBase58()}`);
  console.log(`  Fee:         ${PLATFORM_FEE_BPS / 100}%`);

  try {
    const tx = await program.methods
      .initialize(new anchor.BN(PLATFORM_FEE_BPS))
      .accounts({
        gameState: gameStatePda,
        gameVault: gameVaultPda,
        authority: authority.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([authority])
      .rpc();

    console.log(`\n✅ Initialized! TX: ${tx}`);
  } catch (err: any) {
    if (err.toString().includes("already in use")) {
      console.log("\n⚠️  Game already initialized!");
    } else {
      throw err;
    }
  }
}

async function distributePrizes(program: anchor.Program, authority: Keypair) {
  const [gameStatePda] = getGameStatePda();
  const [gameVaultPda] = getGameVaultPda();

  console.log("Distributing daily prizes...");

  // Fetch current state
  const state = await program.account.gameState.fetch(gameStatePda);
  const pool = state.prizePoolLamports.toNumber();

  if (pool === 0) {
    console.log("⚠️  No prize pool to distribute.");
    return;
  }

  console.log(`  Prize pool: ${(pool / LAMPORTS_PER_SOL).toFixed(6)} SOL`);
  console.log(`  Top 3 winners:`);

  const shares = [5000, 3000, 2000];
  for (let i = 0; i < 3; i++) {
    const entry = state.leaderboard[i];
    if (entry.player.equals(PublicKey.default)) continue;
    const reward = Math.floor((pool * shares[i]) / 10000);
    console.log(
      `    #${i + 1}: ${entry.player.toBase58().slice(0, 12)}... — ` +
        `Score: ${entry.score.toNumber()} — ` +
        `Prize: ${(reward / LAMPORTS_PER_SOL).toFixed(6)} SOL`
    );
  }

  const tx = await program.methods
    .distributePrizes()
    .accounts({
      gameState: gameStatePda,
      gameVault: gameVaultPda,
      authority: authority.publicKey,
    })
    .signers([authority])
    .rpc();

  console.log(`\n✅ Prizes distributed! TX: ${tx}`);
}

async function withdrawFees(program: anchor.Program, authority: Keypair) {
  const [gameStatePda] = getGameStatePda();
  const [gameVaultPda] = getGameVaultPda();

  const state = await program.account.gameState.fetch(gameStatePda);
  const fees = state.platformFeesLamports.toNumber();

  if (fees === 0) {
    console.log("⚠️  No fees to withdraw.");
    return;
  }

  console.log(`Withdrawing ${(fees / LAMPORTS_PER_SOL).toFixed(6)} SOL in fees...`);

  const tx = await program.methods
    .withdrawFees()
    .accounts({
      gameState: gameStatePda,
      gameVault: gameVaultPda,
      authority: authority.publicKey,
    })
    .signers([authority])
    .rpc();

  console.log(`✅ Fees withdrawn! TX: ${tx}`);
}

async function showStatus(program: anchor.Program) {
  const [gameStatePda] = getGameStatePda();
  const [gameVaultPda] = getGameVaultPda();
  const connection = program.provider.connection;

  try {
    const state = await program.account.gameState.fetch(gameStatePda);
    const vaultBalance = await connection.getBalance(gameVaultPda);

    console.log("=== PEPE JUMP Status ===");
    console.log(`Authority:       ${state.authority.toBase58()}`);
    console.log(`Fee:             ${state.platformFeeBps.toNumber() / 100}%`);
    console.log(`Total collected: ${(state.totalSolCollected.toNumber() / LAMPORTS_PER_SOL).toFixed(6)} SOL`);
    console.log(`Prize pool:      ${(state.prizePoolLamports.toNumber() / LAMPORTS_PER_SOL).toFixed(6)} SOL`);
    console.log(`Platform fees:   ${(state.platformFeesLamports.toNumber() / LAMPORTS_PER_SOL).toFixed(6)} SOL`);
    console.log(`Vault balance:   ${(vaultBalance / LAMPORTS_PER_SOL).toFixed(6)} SOL`);
    console.log(`Leaderboard day: ${state.leaderboardDay.toNumber()}`);
    console.log("\nLeaderboard:");

    for (let i = 0; i < 10; i++) {
      const entry = state.leaderboard[i];
      if (entry.player.equals(PublicKey.default)) continue;
      const medals = ["🥇", "🥈", "🥉"];
      const prefix = i < 3 ? medals[i] : `#${i + 1}`;
      console.log(
        `  ${prefix} ${entry.player.toBase58().slice(0, 16)}... — ${entry.score.toNumber()}`
      );
    }
  } catch {
    console.log("⚠️  Game not initialized yet.");
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const command = process.argv[2] || "status";
  const wallet = loadWallet();
  const connection = new Connection(CLUSTER, "confirmed");
  const provider = new anchor.AnchorProvider(
    connection,
    new anchor.Wallet(wallet),
    { commitment: "confirmed" }
  );
  anchor.setProvider(provider);

  // Load program (IDL must be available after `anchor build`)
  const program = anchor.workspace?.PepeJump;

  if (!program) {
    console.error("Program not found. Run `anchor build` first.");
    process.exit(1);
  }

  switch (command) {
    case "init":
      await initialize(program, wallet);
      break;
    case "prizes":
      await distributePrizes(program, wallet);
      break;
    case "withdraw":
      await withdrawFees(program, wallet);
      break;
    case "status":
      await showStatus(program);
      break;
    default:
      console.log("Usage: npx ts-node scripts/initialize.ts [init|prizes|withdraw|status]");
  }
}

main().catch(console.error);
