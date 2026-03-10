#!/bin/bash
# ============================================================================
# PEPE JUMP — Deploy Script
# ============================================================================
# Run after setup.sh completes:
#   cd pepe-jump && chmod +x deploy.sh && ./deploy.sh
# ============================================================================

set -e
source "$HOME/.cargo/env" 2>/dev/null || true
export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"

echo "🐸 PEPE JUMP — Deployment Starting..."
echo "========================================="

# ---------------------------------------------------------------------------
# 1. Install root dependencies (for Anchor tests)
# ---------------------------------------------------------------------------
echo ""
echo "📦 Step 1/8: Installing root dependencies..."
npm install --legacy-peer-deps 2>/dev/null || yarn install

# ---------------------------------------------------------------------------
# 2. Build the smart contract
# ---------------------------------------------------------------------------
echo ""
echo "🔨 Step 2/8: Building smart contract..."
anchor build

# ---------------------------------------------------------------------------
# 3. Get and set the Program ID
# ---------------------------------------------------------------------------
echo ""
echo "🔑 Step 3/8: Getting Program ID..."
PROGRAM_ID=$(solana address -k target/deploy/pepe_jump-keypair.json)
echo "  Program ID: $PROGRAM_ID"

# Update Program ID in lib.rs
echo "  Updating lib.rs..."
sed -i "s/declare_id!(\".*\")/declare_id!(\"$PROGRAM_ID\")/" programs/pepe_jump/src/lib.rs

# Update Anchor.toml
echo "  Updating Anchor.toml..."
sed -i "s/pepe_jump = \".*\"/pepe_jump = \"$PROGRAM_ID\"/" Anchor.toml

# Update pepe-client.ts
echo "  Updating pepe-client.ts..."
sed -i "s|PEPEjump111111111111111111111111111111111|$PROGRAM_ID|g" app/src/pepe-client.ts

# Update useGameContract.js
echo "  Updating useGameContract.js..."
sed -i "s|PEPEjump111111111111111111111111111111111|$PROGRAM_ID|g" app/src/useGameContract.js

# ---------------------------------------------------------------------------
# 4. Rebuild with correct Program ID
# ---------------------------------------------------------------------------
echo ""
echo "🔨 Step 4/8: Rebuilding with correct Program ID..."
anchor build

# ---------------------------------------------------------------------------
# 5. Deploy to Devnet
# ---------------------------------------------------------------------------
echo ""
echo "🚀 Step 5/8: Deploying to Solana Devnet..."
echo "  Balance: $(solana balance)"
anchor deploy --provider.cluster devnet

echo "  ✅ Contract deployed!"
echo "  Verify: solana program show $PROGRAM_ID"

# ---------------------------------------------------------------------------
# 6. Initialize the game (3% platform fee)
# ---------------------------------------------------------------------------
echo ""
echo "🎮 Step 6/8: Initializing game state..."
npx ts-node scripts/initialize.ts init 2>/dev/null || echo "  ⚠️  Init may need manual run (see below)"

# Check status
npx ts-node scripts/initialize.ts status 2>/dev/null || true

# ---------------------------------------------------------------------------
# 7. Setup frontend
# ---------------------------------------------------------------------------
echo ""
echo "🌐 Step 7/8: Setting up frontend..."
cd app

# Create .env
cat > .env << EOF
VITE_NETWORK=devnet
VITE_SOLANA_RPC=https://api.devnet.solana.com
VITE_PROGRAM_ID=$PROGRAM_ID
EOF

echo "  .env created with:"
cat .env

# Install frontend dependencies
npm install --legacy-peer-deps

# Build for production
echo "  Building production bundle..."
npm run build

echo "  ✅ Frontend built in app/dist/"

cd ..

# ---------------------------------------------------------------------------
# 8. Summary
# ---------------------------------------------------------------------------
echo ""
echo "========================================="
echo "🐸 PEPE JUMP — DEPLOYMENT COMPLETE!"
echo "========================================="
echo ""
echo "📋 Your details:"
echo "  Program ID:     $PROGRAM_ID"
echo "  Authority:      $(solana address)"
echo "  Network:        Devnet"
echo "  Platform Fee:   3%"
echo "  SOL Balance:    $(solana balance)"
echo ""
echo "🔧 Next steps:"
echo ""
echo "  1. TEST LOCALLY:"
echo "     cd app && npm run dev"
echo "     → Opens http://localhost:3000"
echo ""
echo "  2. DEPLOY TO WEB (pick one):"
echo ""
echo "     a) Vercel (free, recommended):"
echo "        cd app && npx vercel --prod"
echo ""
echo "     b) Serve with nginx on this server:"
echo "        sudo cp -r app/dist/* /var/www/html/"
echo "        sudo systemctl restart nginx"
echo ""
echo "     c) Docker:"
echo "        cd app && docker build -t pepe-jump . && docker run -p 80:80 pepe-jump"
echo ""
echo "  3. WITHDRAW YOUR FEES:"
echo "     npx ts-node scripts/initialize.ts withdraw"
echo ""
echo "  4. CHECK GAME STATUS:"
echo "     npx ts-node scripts/initialize.ts status"
echo ""
echo "  5. DAILY PRIZES (setup cron):"
echo "     crontab -e"
echo "     Add: 0 0 * * * cd $(pwd) && npx ts-node scripts/daily-prizes.ts >> /var/log/pepe-prizes.log 2>&1"
echo ""
echo "  6. TELEGRAM BOT (optional):"
echo "     export TELEGRAM_BOT_TOKEN=your-token"
echo "     export TELEGRAM_CHAT_ID=your-chat-id"
echo "     pm2 start scripts/telegram-bot.ts --name pepe-bot --interpreter npx"
echo ""
echo "⚠️  IMPORTANT: Save your keypair!"
echo "     cp ~/.config/solana/id.json ~/pepe-jump-authority-BACKUP.json"
echo "     This wallet controls fee withdrawal and prize distribution."
echo ""
echo "🐸 WAGMI! 🚀"
