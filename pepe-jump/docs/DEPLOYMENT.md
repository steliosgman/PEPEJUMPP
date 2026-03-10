# PEPE JUMP — Complete Deployment Guide

## Prerequisites

```bash
# Install Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Install Solana CLI
sh -c "$(curl -sSfL https://release.solana.com/stable/install)"

# Install Anchor CLI
cargo install --git https://github.com/coral-xyz/anchor anchor-cli

# Install Node.js 18+ (use nvm)
nvm install 18 && nvm use 18

# Verify
solana --version && anchor --version && node --version
```

## Step 1: Clone & Setup

```bash
git clone <your-repo-url> pepe-jump
cd pepe-jump
npm install          # root dependencies (Anchor tests)
cd app && npm install && cd ..  # frontend dependencies
```

## Step 2: Configure Solana for Devnet

```bash
solana config set --url https://api.devnet.solana.com
solana-keygen new -o ~/.config/solana/id.json   # skip if you have one
solana airdrop 5      # get test SOL
solana airdrop 5      # run twice for 10 SOL
solana balance        # verify you have SOL
```

## Step 3: Build & Deploy Smart Contract

```bash
# Build the program
anchor build

# Get your program ID (IMPORTANT: copy this)
solana address -k target/deploy/pepe_jump-keypair.json
# Output: e.g. "ABC123...XYZ"

# Update program ID in 3 files:
# 1. programs/pepe_jump/src/lib.rs  → declare_id!("YOUR_ID_HERE")
# 2. Anchor.toml                    → pepe_jump = "YOUR_ID_HERE"
# 3. app/.env                       → VITE_PROGRAM_ID=YOUR_ID_HERE

# Rebuild with correct ID
anchor build

# Deploy to devnet
anchor deploy --provider.cluster devnet

# Verify deployment
solana program show <YOUR_PROGRAM_ID>
```

## Step 4: Initialize the Game

```bash
# Initialize game state (run once after deployment)
npx ts-node scripts/initialize.ts init

# Check it worked
npx ts-node scripts/initialize.ts status
```

## Step 5: Configure Frontend

```bash
cd app

# Create .env from template
cp .env.example .env

# Edit .env with your values:
# VITE_NETWORK=devnet
# VITE_SOLANA_RPC=https://api.devnet.solana.com
# VITE_PROGRAM_ID=<your-program-id-from-step-3>
```

## Step 6: Run Frontend Locally

```bash
cd app
npm run dev
# Opens http://localhost:3000
```

**Test the full flow:**
1. Open browser, connect Phantom wallet (set to devnet)
2. Airdrop SOL to your wallet: `solana airdrop 2 <WALLET_ADDRESS>`
3. Click "Buy PEPE Coins" → approve transaction
4. Click "PLAY" → play the game
5. Score gets submitted → check leaderboard
6. Try DEGEN MODE for 2× rewards + Elon missiles

## Step 7: Deploy Frontend to Production

### Option A: Vercel (recommended, free)
```bash
cd app
npx vercel --prod
# Follow prompts, set environment variables in Vercel dashboard
```

### Option B: Netlify
```bash
cd app
npm run build
npx netlify deploy --prod --dir=dist
```

### Option C: Docker
```bash
# From project root
cd app
docker build -t pepe-jump-frontend .
docker run -p 80:80 pepe-jump-frontend
```

### Option D: Docker Compose (everything at once)
```bash
# From project root, create .env with all vars
cp app/.env.example .env
# Edit .env with your values

docker-compose up --build -d
# Frontend at http://localhost
# Bot and cron running in background
```

## Step 8: Set Up Telegram Bot (Optional)

```bash
# 1. Message @BotFather on Telegram → /newbot → get token
# 2. Create a group → add bot → get chat ID

export TELEGRAM_BOT_TOKEN="your-token"
export TELEGRAM_CHAT_ID="your-chat-id"

# Run standalone
npx ts-node scripts/telegram-bot.ts

# Or with PM2 (recommended for production)
pm2 start scripts/telegram-bot.ts --name pepe-bot --interpreter npx
```

## Step 9: Set Up Daily Prize Distribution

```bash
# Option A: Crontab (runs at midnight UTC)
crontab -e
# Add: 0 0 * * * cd /path/to/pepe-jump && npx ts-node scripts/daily-prizes.ts >> /var/log/pepe-prizes.log 2>&1

# Option B: PM2 cron
pm2 start scripts/daily-prizes.ts --cron "0 0 * * *" --no-autorestart --name pepe-prizes

# Option C: Docker Compose (already configured)
docker-compose up -d prize-cron
```

## Step 10: Run Tests

```bash
# Smart contract tests
anchor test

# Manual testing checklist:
# [ ] Connect wallet on devnet
# [ ] Buy PEPE coins (SOL deducted, PEPE credited)
# [ ] Play normal mode (1 PEPE spent)
# [ ] Play degen mode (2 PEPE spent, faster, missiles appear)
# [ ] Shield power-up blocks a hit
# [ ] Magnet attracts coins
# [ ] Slow-mo slows pipes
# [ ] 2x doubles all scores
# [ ] Jackpot coins give 25pts
# [ ] Combo multiplier works (x2, x3, x4, x5)
# [ ] Dodge bonus appears after missile passes
# [ ] Leaderboard updates with new scores
# [ ] Share button copies/shares score text
# [ ] Daily countdown timer ticks
# [ ] Prize pool increases when PEPE bought
```

## Scaling to Mainnet

1. **Get an audit** — Have a Solana security firm audit lib.rs before mainnet
2. **Update cluster**: `solana config set --url https://api.mainnet-beta.solana.com`
3. **Update Anchor.toml**: change `[programs.devnet]` to `[programs.mainnet]`
4. **Update .env**: `VITE_NETWORK=mainnet-beta`, use a paid RPC (Helius, QuickNode)
5. **Deploy with real SOL**: `anchor deploy --provider.cluster mainnet`
6. **Set up monitoring**: alerts for vault balance, program errors
7. **Use multisig**: for the authority wallet (Squads Protocol)
8. **Add rate limiting**: on the frontend to prevent spam
9. **Score validation**: add server-side score verification (anti-cheat)

## Project Files Summary

```
pepe-jump/
├── programs/pepe_jump/src/lib.rs   # Solana smart contract
├── tests/pepe_jump.ts              # Contract tests
├── app/
│   ├── src/
│   │   ├── main.jsx                # React entry + wallet providers
│   │   ├── App.jsx                 # Wallet adapter wrapper
│   │   ├── PepeJump.jsx            # Game (UI + canvas + logic)
│   │   └── pepe-client.ts          # Blockchain client SDK
│   ├── index.html                  # HTML entry
│   ├── vite.config.js              # Build config
│   ├── package.json                # Frontend deps
│   ├── nginx.conf                  # Production server config
│   ├── Dockerfile                  # Frontend Docker build
│   └── .env.example                # Environment template
├── scripts/
│   ├── initialize.ts               # Admin: init, status, withdraw
│   ├── daily-prizes.ts             # Cron: daily prize distribution
│   └── telegram-bot.ts             # Bot: score announcements
├── docs/DEPLOYMENT.md              # This file
├── docker-compose.yml              # One-command deployment
├── Dockerfile.bot                  # Bot/cron Docker build
├── Anchor.toml                     # Anchor config
├── Cargo.toml                      # Rust workspace
├── package.json                    # Root deps (Anchor tests)
├── tsconfig.json                   # TypeScript config
├── .gitignore                      # Git ignore rules
└── README.md                       # Project overview
```

## Troubleshooting

| Issue | Fix |
|-------|-----|
| "Program not found" | Check program ID matches in all 3 files |
| "Insufficient funds" | `solana airdrop 2` (devnet only) |
| "Transaction simulation failed" | `solana logs <PROGRAM_ID>` to see error |
| "Account not initialized" | Run `npx ts-node scripts/initialize.ts init` |
| Wallet won't connect | Set wallet to devnet in settings |
| "Buffer is not defined" | Ensure `vite-plugin-node-polyfills` is installed |
| Docker build fails | Check Node 18+ and all deps in package.json |
