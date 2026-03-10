#!/bin/bash
# ============================================================================
# PEPE JUMP — Complete Server Setup Script
# ============================================================================
# Run this on a fresh Ubuntu 22.04/24.04 server:
#   chmod +x setup.sh && ./setup.sh
# ============================================================================

set -e
echo "🐸 PEPE JUMP — Server Setup Starting..."
echo "========================================="

# ---------------------------------------------------------------------------
# 1. System packages
# ---------------------------------------------------------------------------
echo ""
echo "📦 Step 1/7: Installing system packages..."
sudo apt update && sudo apt upgrade -y
sudo apt install -y \
  build-essential \
  pkg-config \
  libssl-dev \
  libudev-dev \
  curl \
  git \
  unzip \
  protobuf-compiler

# ---------------------------------------------------------------------------
# 2. Install Rust
# ---------------------------------------------------------------------------
echo ""
echo "🦀 Step 2/7: Installing Rust..."
if command -v rustc &> /dev/null; then
  echo "  Rust already installed: $(rustc --version)"
else
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
  source "$HOME/.cargo/env"
  echo "  Rust installed: $(rustc --version)"
fi

# Make sure cargo is in PATH for this session
source "$HOME/.cargo/env" 2>/dev/null || true

# ---------------------------------------------------------------------------
# 3. Install Solana CLI
# ---------------------------------------------------------------------------
echo ""
echo "☀️  Step 3/7: Installing Solana CLI..."
if command -v solana &> /dev/null; then
  echo "  Solana already installed: $(solana --version)"
else
  sh -c "$(curl -sSfL https://release.anza.xyz/stable/install)"
  export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"
  echo 'export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"' >> ~/.bashrc
  echo "  Solana installed: $(solana --version)"
fi

# ---------------------------------------------------------------------------
# 4. Install Anchor CLI
# ---------------------------------------------------------------------------
echo ""
echo "⚓ Step 4/7: Installing Anchor CLI..."
if command -v anchor &> /dev/null; then
  echo "  Anchor already installed: $(anchor --version)"
else
  # Install AVM (Anchor Version Manager)
  cargo install --git https://github.com/coral-xyz/anchor avm --locked --force
  avm install 0.29.0
  avm use 0.29.0
  echo "  Anchor installed: $(anchor --version)"
fi

# ---------------------------------------------------------------------------
# 5. Install Node.js 18+
# ---------------------------------------------------------------------------
echo ""
echo "📗 Step 5/7: Installing Node.js 18..."
if command -v node &> /dev/null && [[ $(node -v | cut -d. -f1 | tr -d 'v') -ge 18 ]]; then
  echo "  Node.js already installed: $(node --version)"
else
  curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
  sudo apt install -y nodejs
  echo "  Node.js installed: $(node --version)"
  echo "  npm installed: $(npm --version)"
fi

# Install Yarn globally
sudo npm install -g yarn pm2 ts-node typescript

# ---------------------------------------------------------------------------
# 6. Configure Solana for Devnet
# ---------------------------------------------------------------------------
echo ""
echo "🔧 Step 6/7: Configuring Solana..."
solana config set --url https://api.devnet.solana.com

# Generate keypair if none exists
if [ ! -f "$HOME/.config/solana/id.json" ]; then
  echo "  Generating new keypair..."
  solana-keygen new --no-bip39-passphrase -o "$HOME/.config/solana/id.json"
  echo "  ⚠️  SAVE YOUR KEYPAIR! This is your authority wallet."
fi

echo "  Wallet address: $(solana address)"
echo "  Cluster: $(solana config get | grep 'RPC URL')"

# Airdrop devnet SOL
echo "  Requesting devnet SOL airdrop..."
solana airdrop 5 || echo "  (airdrop may be rate-limited, try again later)"
sleep 2
solana airdrop 5 || true
echo "  Balance: $(solana balance)"

# ---------------------------------------------------------------------------
# 7. Verify everything
# ---------------------------------------------------------------------------
echo ""
echo "✅ Step 7/7: Verification"
echo "========================================="
echo "  Rust:    $(rustc --version 2>/dev/null || echo 'NOT FOUND ❌')"
echo "  Solana:  $(solana --version 2>/dev/null || echo 'NOT FOUND ❌')"
echo "  Anchor:  $(anchor --version 2>/dev/null || echo 'NOT FOUND ❌')"
echo "  Node.js: $(node --version 2>/dev/null || echo 'NOT FOUND ❌')"
echo "  npm:     $(npm --version 2>/dev/null || echo 'NOT FOUND ❌')"
echo "  Yarn:    $(yarn --version 2>/dev/null || echo 'NOT FOUND ❌')"
echo "  PM2:     $(pm2 --version 2>/dev/null || echo 'NOT FOUND ❌')"
echo "========================================="
echo ""
echo "🐸 Setup complete! Now run:"
echo ""
echo "  cd pepe-jump"
echo "  chmod +x deploy.sh"
echo "  ./deploy.sh"
echo ""
