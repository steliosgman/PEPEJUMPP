# ============================================================================
# 🐸 PEPE JUMP — Baby Steps Deployment Guide
# ============================================================================
# Copy-paste each command ONE AT A TIME
# Wait for each one to finish before doing the next
# Lines starting with # are comments — DON'T paste those
# ============================================================================


# ============================================================================
# PART 1: PREPARE YOUR SERVER (do this on YOUR computer first)
# ============================================================================

# Q: Will this mess up my Solana sniper bot?
# A: NO! They are completely separate programs. Like having
#    Chrome and Firefox on the same computer — no conflict.


# ============================================================================
# PART 2: ON YOUR LOCAL COMPUTER — Upload the project
# ============================================================================

# First, download the pepe-jump folder from Claude artifacts
# Then open your terminal (on YOUR computer, not the server) and run:

scp -r pepe-jump root@62.171.152.231:/root/

# It will ask for your password. Type it and press Enter.
# Wait until it says 100% for all files.


# ============================================================================
# PART 3: SSH INTO YOUR SERVER
# ============================================================================

# Connect to your server:
ssh root@62.171.152.231

# Type your password, press Enter. Now you're on the server.


# ============================================================================
# PART 4: INSTALL EVERYTHING (one command at a time)
# ============================================================================

# 4.1 — Update system packages
sudo apt update && sudo apt upgrade -y

# 4.2 — Install build tools
sudo apt install -y build-essential pkg-config libssl-dev libudev-dev curl git unzip protobuf-compiler

# 4.3 — Install Rust (say "yes" or press 1 when asked)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# 4.4 — Load Rust into your terminal (IMPORTANT — don't skip!)
source "$HOME/.cargo/env"

# 4.5 — Check Rust works
rustc --version
# Should say: rustc 1.xx.x — if it does, continue ✅

# 4.6 — Install Solana CLI
sh -c "$(curl -sSfL https://release.anza.xyz/stable/install)"

# 4.7 — Add Solana to PATH
export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"
echo 'export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"' >> ~/.bashrc

# 4.8 — Check Solana works
solana --version
# Should say: solana-cli 1.xx.x or 2.xx.x ✅

# 4.9 — Install Node.js 18
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# 4.10 — Check Node works
node --version
# Should say: v18.xx.x ✅

# 4.11 — Install global tools
sudo npm install -g yarn pm2 ts-node typescript

# 4.12 — Install Anchor (this takes 5-10 minutes, be patient!)
cargo install --git https://github.com/coral-xyz/anchor avm --locked --force

# 4.13 — Install Anchor version 0.29.0
avm install 0.29.0
avm use 0.29.0

# 4.14 — Check Anchor works
anchor --version
# Should say: anchor-cli 0.29.0 ✅


# ============================================================================
# PART 5: SETUP SOLANA WALLET
# ============================================================================

# 5.1 — Set Solana to devnet (test network — free fake SOL)
solana config set --url https://api.devnet.solana.com

# 5.2 — Create a NEW wallet for the game
# (don't use your sniper bot wallet!)
solana-keygen new -o ~/.config/solana/pepe-jump-authority.json

# ⚠️ WRITE DOWN THE SEED PHRASE! This wallet will control your fees!

# 5.3 — Tell Solana to use this wallet
solana config set --keypair ~/.config/solana/pepe-jump-authority.json

# 5.4 — Check your wallet address
solana address
# Copy this address! You'll need it later

# 5.5 — Get free test SOL (devnet only)
solana airdrop 5
# Wait 5 seconds...
solana airdrop 5

# 5.6 — Check balance
solana balance
# Should say: 10 SOL ✅


# ============================================================================
# PART 6: BUILD AND DEPLOY THE SMART CONTRACT
# ============================================================================

# 6.1 — Go to the project folder
cd /root/pepe-jump

# 6.2 — Install project dependencies
npm install --legacy-peer-deps

# 6.3 — Build the smart contract (takes 2-3 minutes)
anchor build

# 6.4 — Get your Program ID
solana address -k target/deploy/pepe_jump-keypair.json
# COPY THE OUTPUT! It looks like: ABC123...XYZ (a long string)
# This is your PROGRAM_ID

# 6.5 — Update the Program ID in the code
# Replace YOUR_PROGRAM_ID_HERE with the string you copied in step 6.4
# Run these 4 commands (change the ID in each one!):

sed -i 's/PEPEjump111111111111111111111111111111111/YOUR_PROGRAM_ID_HERE/g' programs/pepe_jump/src/lib.rs
sed -i 's/PEPEjump111111111111111111111111111111111/YOUR_PROGRAM_ID_HERE/g' Anchor.toml
sed -i 's/PEPEjump111111111111111111111111111111111/YOUR_PROGRAM_ID_HERE/g' app/src/pepe-client.ts
sed -i 's/PEPEjump111111111111111111111111111111111/YOUR_PROGRAM_ID_HERE/g' app/src/useGameContract.js

# 6.6 — Rebuild with the correct Program ID
anchor build

# 6.7 — Deploy to Solana devnet!
anchor deploy --provider.cluster devnet

# If it says "Program deployed" — SUCCESS! ✅
# If it says "insufficient funds" — run: solana airdrop 5


# ============================================================================
# PART 7: INITIALIZE THE GAME (sets up your 3% fee)
# ============================================================================

# 7.1 — Initialize (this creates the game on the blockchain)
npx ts-node scripts/initialize.ts init

# 7.2 — Check it worked
npx ts-node scripts/initialize.ts status

# Should show:
#   Authority: (your wallet address)
#   Fee: 3%
#   Prize pool: 0 SOL
#   Platform fees: 0 SOL


# ============================================================================
# PART 8: SETUP THE WEBSITE
# ============================================================================

# 8.1 — Go to the frontend folder
cd /root/pepe-jump/app

# 8.2 — Create the config file
# Replace YOUR_PROGRAM_ID_HERE with your actual program ID from step 6.4!
cat > .env << EOF
VITE_NETWORK=devnet
VITE_SOLANA_RPC=https://api.devnet.solana.com
VITE_PROGRAM_ID=YOUR_PROGRAM_ID_HERE
EOF

# 8.3 — Install frontend packages
npm install --legacy-peer-deps

# 8.4 — Build the website
npm run build

# Should say "✓ built in X.XXs" ✅


# ============================================================================
# PART 9: PUT THE WEBSITE ONLINE
# ============================================================================

# 9.1 — Install nginx (web server)
sudo apt install -y nginx

# 9.2 — Copy your game to the web server
sudo rm -rf /var/www/html/*
sudo cp -r /root/pepe-jump/app/dist/* /var/www/html/

# 9.3 — Setup nginx for single-page app
sudo cat > /etc/nginx/sites-available/default << 'EOF'
server {
    listen 80;
    server_name _;
    root /var/www/html;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2)$ {
        expires 30d;
        add_header Cache-Control "public, immutable";
    }

    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml;
}
EOF

# 9.4 — Restart nginx
sudo systemctl restart nginx

# 9.5 — TEST IT!
# Open in your browser: http://62.171.152.231
# You should see the PEPE JUMP game! 🐸


# ============================================================================
# PART 10: SETUP DAILY PRIZES (auto-pay winners every night)
# ============================================================================

# 10.1 — Open crontab
crontab -e
# If it asks which editor, press 1 for nano

# 10.2 — Add this line at the bottom (paste it):
# 0 0 * * * cd /root/pepe-jump && npx ts-node scripts/daily-prizes.ts >> /var/log/pepe-prizes.log 2>&1

# 10.3 — Save and exit (in nano: Ctrl+X, then Y, then Enter)


# ============================================================================
# PART 11: YOUR MONEY — HOW TO COLLECT FEES
# ============================================================================

# Every time someone buys PEPE coins, 3% goes to YOUR fees.
# Example: If 100 SOL is spent on PEPE coins, you earn 3 SOL.

# To check how much you've earned:
cd /root/pepe-jump
npx ts-node scripts/initialize.ts status
# Look at "Platform fees: X.XXXX SOL"

# To WITHDRAW your fees to your wallet:
npx ts-node scripts/initialize.ts withdraw
# The SOL goes straight to your authority wallet!

# To check your wallet balance:
solana balance


# ============================================================================
# CHEAT SHEET — Commands you'll use often
# ============================================================================

# Check game status (prize pool, fees, leaderboard):
cd /root/pepe-jump && npx ts-node scripts/initialize.ts status

# Withdraw your platform fees:
cd /root/pepe-jump && npx ts-node scripts/initialize.ts withdraw

# Check your SOL balance:
solana balance

# Manually distribute prizes:
cd /root/pepe-jump && npx ts-node scripts/daily-prizes.ts

# Restart the website after changes:
cd /root/pepe-jump/app && npm run build && sudo cp -r dist/* /var/www/html/

# View prize distribution logs:
cat /var/log/pepe-prizes.log


# ============================================================================
# TROUBLESHOOTING
# ============================================================================

# "anchor: command not found"
# → Run: source ~/.cargo/env && source ~/.bashrc

# "solana: command not found"
# → Run: export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"

# "Error: Insufficient funds"
# → Run: solana airdrop 5 (devnet only, can do it multiple times)

# "Account not initialized"
# → Run: cd /root/pepe-jump && npx ts-node scripts/initialize.ts init

# Website not loading
# → Run: sudo systemctl status nginx (check for errors)
# → Run: sudo systemctl restart nginx

# "Transaction simulation failed"
# → Check logs: solana logs YOUR_PROGRAM_ID

# My sniper bot stopped working
# → The bot and game are separate. Check: pm2 status
# → The game uses a DIFFERENT wallet (pepe-jump-authority.json)
#   than your bot. They don't touch each other.


# ============================================================================
# WHEN READY FOR REAL MONEY (Mainnet)
# ============================================================================

# 1. Get a security audit of the smart contract
# 2. Change cluster: solana config set --url https://api.mainnet-beta.solana.com
# 3. Use a paid RPC: Helius (helius.dev) or QuickNode
# 4. Fund your wallet with REAL SOL
# 5. Redeploy: anchor deploy --provider.cluster mainnet
# 6. Update app/.env with VITE_NETWORK=mainnet-beta
# 7. Rebuild: cd app && npm run build
# 8. Copy to web: sudo cp -r dist/* /var/www/html/
