# 🐸 PEPE JUMP

> A crypto meme game on Solana — Play, earn, and meme your way to the top.

## What is PEPE JUMP?

PEPE JUMP is a Web3 mini-game where players buy in-game PEPE coins with SOL, spend them to play a Flappy Bird-style jumping game, and compete on a daily leaderboard for real SOL prizes.

**Key Features:**
- Buy PEPE coins with SOL (0.01 SOL each, 3% platform fee)
- Addictive 2D side-scroller with collectible coins and power-ups
- Daily leaderboard with SOL prize payouts (50/30/20 split)
- Wallet integration (Phantom, Solflare, etc.)
- Optional Telegram bot for hype notifications
- Mobile and desktop responsive

## Architecture

```
Smart Contract (Anchor/Rust)    Frontend (React)         Bot (Node.js)
├── Buy PEPE coins              ├── Game canvas           ├── Score announcements
├── Track balances              ├── Wallet adapter        ├── Prize pool updates
├── Game lifecycle              ├── Leaderboard           └── Jackpot alerts
├── Leaderboard tracking        ├── Power-ups shop
├── Prize distribution          └── Buy modal
└── Fee collection
```

## Quick Start

### 1. Deploy Smart Contract (Devnet)

```bash
# Install prerequisites
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
sh -c "$(curl -sSfL https://release.solana.com/stable/install)"
cargo install --git https://github.com/coral-xyz/anchor anchor-cli

# Configure for devnet
solana config set --url https://api.devnet.solana.com
solana-keygen new
solana airdrop 5

# Build and deploy
anchor build
anchor deploy --provider.cluster devnet

# Run tests
anchor test
```

### 2. Run Frontend

```bash
cd app
npm install
npm run dev
# Open http://localhost:5173
```

### 3. Run Telegram Bot (Optional)

```bash
export TELEGRAM_BOT_TOKEN="your-token"
export TELEGRAM_CHAT_ID="your-chat-id"
npx ts-node scripts/telegram-bot.ts
```

## Project Structure

```
pepe-jump/
├── programs/pepe_jump/src/
│   └── lib.rs                  # Solana smart contract
├── tests/
│   └── pepe_jump.ts            # Integration tests
├── app/src/
│   ├── PepeJump.jsx            # React game + full UI
│   └── pepe-client.ts          # Blockchain client SDK
├── scripts/
│   └── telegram-bot.ts         # Telegram notifications
├── docs/
│   └── DEPLOYMENT.md           # Full deployment guide
├── Anchor.toml                 # Anchor config
└── README.md
```

## Smart Contract Functions

| Function | Description | Cost |
|----------|-------------|------|
| `initialize` | Set up game state (admin only) | One-time |
| `buy_pepe_coins` | Buy PEPE with SOL | 0.01 SOL/coin |
| `start_game` | Begin a game round | 1 PEPE |
| `buy_power_up` | Purchase power-up | 2-5 PEPE |
| `submit_score` | Record game score | Free |
| `distribute_prizes` | Pay daily winners (admin) | Free |
| `withdraw_fees` | Collect platform fees (admin) | Free |

## Power-Ups

| Power-Up | Cost | Effect |
|----------|------|--------|
| 🛡️ Shield | 2 PEPE | Survive 1 pipe collision |
| 🧲 Magnet | 3 PEPE | Attract nearby coins |
| ⏳ Slow-Mo | 2 PEPE | Pipes move 40% slower |
| ⚡ 2x Score | 5 PEPE | Double all points |

## Prize Distribution

Daily prizes from the prize pool (97% of all SOL spent):
- 🥇 1st Place: 50%
- 🥈 2nd Place: 30%
- 🥉 3rd Place: 20%

## Security Notes

- Smart contract uses PDA-based accounts for trustless storage
- All SOL is held in a program-controlled vault
- Score submission should be validated server-side in production
- Consider a professional audit before mainnet deployment
- Platform fees are separately tracked and only withdrawable by authority

## License

MIT
