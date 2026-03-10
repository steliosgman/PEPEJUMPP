// ============================================================================
// PEPE JUMP — Telegram Bot Integration
// ============================================================================
// Announces top scores, prize pool updates, and jackpot events.
// Run with: npx ts-node telegram-bot.ts
// Requires: TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID env variables
// ============================================================================

import { Connection, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || "";
const SOLANA_RPC = process.env.SOLANA_RPC || "https://api.devnet.solana.com";
const PROGRAM_ID = new PublicKey(
  "PEPEjump111111111111111111111111111111111"
);
const POLL_INTERVAL_MS = 30_000; // Check every 30 seconds

// ---------------------------------------------------------------------------
// Telegram API Helper
// ---------------------------------------------------------------------------
async function sendTelegramMessage(text: string): Promise<void> {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    console.log("[Telegram] Not configured. Message:", text);
    return;
  }

  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
    });

    if (!response.ok) {
      console.error("[Telegram] Send failed:", await response.text());
    }
  } catch (error) {
    console.error("[Telegram] Error:", error);
  }
}

// ---------------------------------------------------------------------------
// Message Templates
// ---------------------------------------------------------------------------
const messages = {
  newHighScore: (player: string, score: number, rank: number) =>
    `🐸 <b>NEW HIGH SCORE!</b> 🐸\n\n` +
    `Player <code>${player.slice(0, 8)}...${player.slice(-4)}</code>\n` +
    `Score: <b>${score.toLocaleString()}</b> 🏆\n` +
    `Rank: #${rank}\n\n` +
    `Can YOU beat this? Play now! 🎮`,

  prizePoolUpdate: (pool: number) =>
    `💰 <b>PRIZE POOL UPDATE</b> 💰\n\n` +
    `Current pool: <b>${(pool / LAMPORTS_PER_SOL).toFixed(4)} SOL</b>\n\n` +
    `Top 3 players split the pot daily!\n` +
    `🥇 50% | 🥈 30% | 🥉 20%`,

  dailyReset: (winners: Array<{ player: string; score: number; prize: number }>) => {
    let msg = `🎉 <b>DAILY LEADERBOARD RESULTS!</b> 🎉\n\n`;
    const medals = ["🥇", "🥈", "🥉"];
    winners.forEach((w, i) => {
      msg +=
        `${medals[i]} <code>${w.player.slice(0, 8)}...</code> — ` +
        `Score: ${w.score.toLocaleString()} — ` +
        `Won: ${(w.prize / LAMPORTS_PER_SOL).toFixed(4)} SOL\n`;
    });
    msg += `\nNew day, new chances! 🐸🚀`;
    return msg;
  },

  jackpotEvent: (player: string, amount: number) =>
    `🎰 <b>JACKPOT!</b> 🎰\n\n` +
    `Player <code>${player.slice(0, 8)}...${player.slice(-4)}</code> ` +
    `just won a random jackpot!\n` +
    `Prize: <b>${(amount / LAMPORTS_PER_SOL).toFixed(4)} SOL</b> 💎\n\n` +
    `Keep playing for your chance! 🍀`,

  lastMinuteGrab: (player: string, score: number, minutesLeft: number) =>
    `⚡ <b>LAST-MINUTE HIGH SCORE!</b> ⚡\n\n` +
    `With only ${minutesLeft} minutes left...\n` +
    `<code>${player.slice(0, 8)}...</code> scored <b>${score.toLocaleString()}</b>!\n\n` +
    `Leaderboard resets soon! Can you beat it? 🏃‍♂️💨`,
};

// ---------------------------------------------------------------------------
// Leaderboard Monitor
// ---------------------------------------------------------------------------
interface LeaderboardEntry {
  player: string;
  score: number;
}

class PepeJumpBot {
  private connection: Connection;
  private lastLeaderboard: LeaderboardEntry[] = [];
  private lastPrizePool: number = 0;
  private lastDay: number = 0;

  constructor() {
    this.connection = new Connection(SOLANA_RPC, "confirmed");
  }

  /** Parse game state from account data (simplified — use Anchor in production) */
  async fetchGameState(): Promise<{
    prizePool: number;
    day: number;
    leaderboard: LeaderboardEntry[];
  } | null> {
    try {
      const [gameStatePda] = PublicKey.findProgramAddressSync(
        [Buffer.from("game_state")],
        PROGRAM_ID
      );

      const accountInfo = await this.connection.getAccountInfo(gameStatePda);
      if (!accountInfo) return null;

      // In production, deserialize with Anchor IDL
      // This is a placeholder structure
      return {
        prizePool: 0,
        day: Math.floor(Date.now() / 86400000),
        leaderboard: [],
      };
    } catch {
      return null;
    }
  }

  /** Check for leaderboard changes and announce */
  async checkAndAnnounce(): Promise<void> {
    const state = await this.fetchGameState();
    if (!state) return;

    // Check for new day (daily reset)
    if (state.day > this.lastDay && this.lastDay > 0) {
      const winners = this.lastLeaderboard.slice(0, 3).map((entry, i) => ({
        player: entry.player,
        score: entry.score,
        prize: Math.floor(
          (this.lastPrizePool * [5000, 3000, 2000][i]) / 10000
        ),
      }));

      if (winners.length > 0) {
        await sendTelegramMessage(messages.dailyReset(winners));
      }
    }

    // Check for new high scores
    for (let i = 0; i < state.leaderboard.length; i++) {
      const entry = state.leaderboard[i];
      if (!entry || entry.score === 0) continue;

      const wasOnBoard = this.lastLeaderboard.find(
        (e) => e.player === entry.player && e.score === entry.score
      );

      if (!wasOnBoard) {
        await sendTelegramMessage(
          messages.newHighScore(entry.player, entry.score, i + 1)
        );

        // Check if last-minute grab (within 30 minutes of reset)
        const now = new Date();
        const minutesUntilReset =
          (24 - now.getUTCHours()) * 60 - now.getUTCMinutes();
        if (minutesUntilReset <= 30 && minutesUntilReset > 0) {
          await sendTelegramMessage(
            messages.lastMinuteGrab(entry.player, entry.score, minutesUntilReset)
          );
        }
      }
    }

    // Check prize pool changes
    if (
      state.prizePool > this.lastPrizePool &&
      state.prizePool - this.lastPrizePool > 0.1 * LAMPORTS_PER_SOL
    ) {
      await sendTelegramMessage(messages.prizePoolUpdate(state.prizePool));
    }

    // Update cache
    this.lastLeaderboard = [...state.leaderboard];
    this.lastPrizePool = state.prizePool;
    this.lastDay = state.day;
  }

  /** Start the polling loop */
  async start(): Promise<void> {
    console.log("🐸 PEPE JUMP Telegram Bot started!");
    console.log(`   Polling every ${POLL_INTERVAL_MS / 1000}s`);
    console.log(`   RPC: ${SOLANA_RPC}`);
    console.log(
      `   Telegram: ${TELEGRAM_BOT_TOKEN ? "Configured" : "⚠ Not configured"}`
    );

    // Initial fetch
    await this.checkAndAnnounce();

    // Poll loop
    setInterval(async () => {
      try {
        await this.checkAndAnnounce();
      } catch (error) {
        console.error("[Bot] Poll error:", error);
      }
    }, POLL_INTERVAL_MS);
  }
}

// ---------------------------------------------------------------------------
// Entry Point
// ---------------------------------------------------------------------------
const bot = new PepeJumpBot();
bot.start().catch(console.error);
