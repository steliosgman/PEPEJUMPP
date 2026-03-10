// ============================================================================
// PEPE JUMP — Daily Prize Distribution Cron
// ============================================================================
// Run daily at UTC midnight via cron or PM2:
//   crontab: 0 0 * * * cd /path/to/pepe-jump && npx ts-node scripts/daily-prizes.ts
//   pm2:     pm2 start scripts/daily-prizes.ts --cron "0 0 * * *" --no-autorestart
// ============================================================================

import * as anchor from "@coral-xyz/anchor";
import {
  Connection,
  PublicKey,
  SystemProgram,
  LAMPORTS_PER_SOL,
  Keypair,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import fs from "fs";
import path from "path";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------
const CLUSTER = process.env.SOLANA_RPC || "https://api.devnet.solana.com";
const PROGRAM_ID = new PublicKey(
  process.env.PROGRAM_ID || "PEPEjump111111111111111111111111111111111"
);
const REWARD_SHARES = [5000, 3000, 2000]; // basis points: 50%, 30%, 20%

// ---------------------------------------------------------------------------
// Load authority wallet
// ---------------------------------------------------------------------------
function loadWallet(): Keypair {
  const kpPath =
    process.env.WALLET_PATH ||
    path.join(process.env.HOME || "~", ".config", "solana", "id.json");
  const raw = JSON.parse(fs.readFileSync(kpPath, "utf-8"));
  return Keypair.fromSecretKey(Buffer.from(raw));
}

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
// Send Telegram notification
// ---------------------------------------------------------------------------
async function notifyTelegram(message: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return;

  try {
    await fetch(
      `https://api.telegram.org/bot${token}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: message,
          parse_mode: "HTML",
        }),
      }
    );
  } catch (e) {
    console.error("[Telegram] Failed:", e);
  }
}

// ---------------------------------------------------------------------------
// Main: Distribute prizes and reset leaderboard
// ---------------------------------------------------------------------------
async function main() {
  console.log("=== PEPE JUMP Daily Prize Distribution ===");
  console.log(`Time: ${new Date().toISOString()}`);
  console.log(`Cluster: ${CLUSTER}`);

  const wallet = loadWallet();
  const connection = new Connection(CLUSTER, "confirmed");
  const provider = new anchor.AnchorProvider(
    connection,
    new anchor.Wallet(wallet),
    { commitment: "confirmed" }
  );
  anchor.setProvider(provider);

  const program = anchor.workspace?.PepeJump;
  if (!program) {
    console.error("Program not found. Ensure IDL is available.");
    process.exit(1);
  }

  const [gameStatePda] = getGameStatePda();
  const [gameVaultPda] = getGameVaultPda();

  try {
    // Fetch current game state
    const state = await program.account.gameState.fetch(gameStatePda);
    const pool = state.prizePoolLamports.toNumber();
    const vaultBalance = await connection.getBalance(gameVaultPda);

    console.log(`\nPrize Pool: ${(pool / LAMPORTS_PER_SOL).toFixed(6)} SOL`);
    console.log(`Vault Balance: ${(vaultBalance / LAMPORTS_PER_SOL).toFixed(6)} SOL`);

    if (pool === 0) {
      console.log("No prize pool. Skipping distribution.");
      return;
    }

    // Display winners
    const winners: Array<{ player: PublicKey; score: number; reward: number }> = [];
    const medals = ["🥇", "🥈", "🥉"];

    for (let i = 0; i < 3; i++) {
      const entry = state.leaderboard[i];
      if (entry.player.equals(PublicKey.default)) continue;

      const reward = Math.floor((pool * REWARD_SHARES[i]) / 10000);
      winners.push({
        player: entry.player,
        score: entry.score.toNumber(),
        reward,
      });

      console.log(
        `  ${medals[i]} ${entry.player.toBase58().slice(0, 16)}... — ` +
          `Score: ${entry.score.toNumber()} — ` +
          `Prize: ${(reward / LAMPORTS_PER_SOL).toFixed(6)} SOL`
      );
    }

    if (winners.length === 0) {
      console.log("No winners on leaderboard. Skipping.");
      return;
    }

    // Transfer SOL to each winner from vault
    for (const winner of winners) {
      if (winner.reward <= 0) continue;

      try {
        // In production, use the program's distribute_prizes instruction
        // which transfers from the PDA vault. This is a simplified version.
        const tx = await program.methods
          .distributePrizes()
          .accounts({
            gameState: gameStatePda,
            gameVault: gameVaultPda,
            authority: wallet.publicKey,
          })
          .signers([wallet])
          .rpc();

        console.log(`  ✅ Distributed! TX: ${tx}`);
      } catch (e: any) {
        console.error(`  ❌ Failed for ${winner.player.toBase58()}: ${e.message}`);
      }
    }

    // Notify Telegram
    let tgMsg = `🎉 <b>DAILY PRIZES DISTRIBUTED!</b> 🎉\n\n`;
    tgMsg += `Prize Pool: <b>${(pool / LAMPORTS_PER_SOL).toFixed(4)} SOL</b>\n\n`;
    winners.forEach((w, i) => {
      tgMsg += `${medals[i]} <code>${w.player.toBase58().slice(0, 12)}...</code>`;
      tgMsg += ` — Score: ${w.score} — Won: ${(w.reward / LAMPORTS_PER_SOL).toFixed(4)} SOL\n`;
    });
    tgMsg += `\n🐸 New day, new chances!`;
    await notifyTelegram(tgMsg);

    console.log("\n✅ Daily distribution complete!");
  } catch (e: any) {
    console.error("Distribution failed:", e.message);
    await notifyTelegram(`❌ PEPE JUMP daily distribution failed: ${e.message}`);
    process.exit(1);
  }
}

main().catch(console.error);
