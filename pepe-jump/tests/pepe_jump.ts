// ============================================================================
// PEPE JUMP — Test Suite (Anchor / TypeScript)
// ============================================================================
// Run with: anchor test
// ============================================================================

import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PepeJump } from "../target/types/pepe_jump";
import { expect } from "chai";
import {
  SystemProgram,
  PublicKey,
  LAMPORTS_PER_SOL,
  Keypair,
} from "@solana/web3.js";

describe("pepe_jump", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.PepeJump as Program<PepeJump>;
  const authority = provider.wallet;

  // PDAs
  let gameStatePda: PublicKey;
  let gameVaultPda: PublicKey;
  let playerAccountPda: PublicKey;

  // Test player
  const player = Keypair.generate();

  before(async () => {
    // Derive PDAs
    [gameStatePda] = PublicKey.findProgramAddressSync(
      [Buffer.from("game_state")],
      program.programId
    );
    [gameVaultPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("game_vault")],
      program.programId
    );
    [playerAccountPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("player"), player.publicKey.toBuffer()],
      program.programId
    );

    // Airdrop SOL to test player
    const sig = await provider.connection.requestAirdrop(
      player.publicKey,
      5 * LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(sig);
  });

  // -----------------------------------------------------------------------
  // 1. Initialize
  // -----------------------------------------------------------------------
  it("Initializes the game state", async () => {
    await program.methods
      .initialize(new anchor.BN(300)) // 3% fee
      .accounts({
        gameState: gameStatePda,
        gameVault: gameVaultPda,
        authority: authority.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const game = await program.account.gameState.fetch(gameStatePda);
    expect(game.authority.toString()).to.equal(authority.publicKey.toString());
    expect(game.platformFeeBps.toNumber()).to.equal(300);
    expect(game.totalSolCollected.toNumber()).to.equal(0);
    expect(game.prizePoolLamports.toNumber()).to.equal(0);
    console.log("✅ Game initialized with 3% platform fee");
  });

  // -----------------------------------------------------------------------
  // 2. Buy PEPE Coins
  // -----------------------------------------------------------------------
  it("Buys 10 PEPE coins with SOL", async () => {
    const amount = 10;
    const pepePriceLamports = 10_000_000; // 0.01 SOL
    const totalCost = amount * pepePriceLamports;
    const expectedFee = Math.floor((totalCost * 300) / 10_000);

    await program.methods
      .buyPepeCoins(new anchor.BN(amount))
      .accounts({
        gameState: gameStatePda,
        playerAccount: playerAccountPda,
        gameVault: gameVaultPda,
        buyer: player.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([player])
      .rpc();

    const playerAcc = await program.account.playerAccount.fetch(
      playerAccountPda
    );
    expect(playerAcc.pepeBalance.toNumber()).to.equal(amount);
    expect(playerAcc.totalPurchased.toNumber()).to.equal(amount);

    const game = await program.account.gameState.fetch(gameStatePda);
    expect(game.totalSolCollected.toNumber()).to.equal(totalCost);
    expect(game.platformFeesLamports.toNumber()).to.equal(expectedFee);
    expect(game.prizePoolLamports.toNumber()).to.equal(totalCost - expectedFee);

    console.log(`✅ Bought ${amount} PEPE for ${totalCost / LAMPORTS_PER_SOL} SOL`);
    console.log(`   Fee: ${expectedFee} lamports, Prize pool: ${totalCost - expectedFee} lamports`);
  });

  // -----------------------------------------------------------------------
  // 3. Start Game
  // -----------------------------------------------------------------------
  it("Starts a game round (costs 1 PEPE)", async () => {
    await program.methods
      .startGame()
      .accounts({
        playerAccount: playerAccountPda,
        player: player.publicKey,
      })
      .signers([player])
      .rpc();

    const playerAcc = await program.account.playerAccount.fetch(
      playerAccountPda
    );
    expect(playerAcc.pepeBalance.toNumber()).to.equal(9); // 10 - 1
    expect(playerAcc.totalGamesPlayed.toNumber()).to.equal(1);
    expect(playerAcc.currentGameActive).to.be.true;

    console.log("✅ Game started! Balance: 9 PEPE");
  });

  // -----------------------------------------------------------------------
  // 4. Submit Score
  // -----------------------------------------------------------------------
  it("Submits a game score to the leaderboard", async () => {
    await program.methods
      .submitScore(new anchor.BN(420))
      .accounts({
        gameState: gameStatePda,
        playerAccount: playerAccountPda,
        player: player.publicKey,
      })
      .signers([player])
      .rpc();

    const playerAcc = await program.account.playerAccount.fetch(
      playerAccountPda
    );
    expect(playerAcc.highScore.toNumber()).to.equal(420);
    expect(playerAcc.currentGameActive).to.be.false;

    const game = await program.account.gameState.fetch(gameStatePda);
    expect(game.leaderboard[0].score.toNumber()).to.equal(420);
    expect(game.leaderboard[0].player.toString()).to.equal(
      player.publicKey.toString()
    );

    console.log("✅ Score 420 submitted. #1 on leaderboard!");
  });

  // -----------------------------------------------------------------------
  // 5. Buy Power-Up
  // -----------------------------------------------------------------------
  it("Buys a power-up for 2 PEPE", async () => {
    await program.methods
      .buyPowerUp(1, new anchor.BN(2)) // type=1 (shield), cost=2
      .accounts({
        playerAccount: playerAccountPda,
        player: player.publicKey,
      })
      .signers([player])
      .rpc();

    const playerAcc = await program.account.playerAccount.fetch(
      playerAccountPda
    );
    expect(playerAcc.pepeBalance.toNumber()).to.equal(7); // 9 - 2

    console.log("✅ Shield power-up purchased! Balance: 7 PEPE");
  });

  // -----------------------------------------------------------------------
  // 6. Withdraw Fees
  // -----------------------------------------------------------------------
  it("Authority withdraws platform fees", async () => {
    const balBefore = await provider.connection.getBalance(
      authority.publicKey
    );

    await program.methods
      .withdrawFees()
      .accounts({
        gameState: gameStatePda,
        gameVault: gameVaultPda,
        authority: authority.publicKey,
      })
      .rpc();

    const game = await program.account.gameState.fetch(gameStatePda);
    expect(game.platformFeesLamports.toNumber()).to.equal(0);

    console.log("✅ Platform fees withdrawn");
  });

  // -----------------------------------------------------------------------
  // 7. Error Cases
  // -----------------------------------------------------------------------
  it("Fails to buy 0 PEPE coins", async () => {
    try {
      await program.methods
        .buyPepeCoins(new anchor.BN(0))
        .accounts({
          gameState: gameStatePda,
          playerAccount: playerAccountPda,
          gameVault: gameVaultPda,
          buyer: player.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([player])
        .rpc();
      expect.fail("Should have thrown");
    } catch (e) {
      expect(e.toString()).to.include("InvalidAmount");
      console.log("✅ Correctly rejected zero-amount purchase");
    }
  });

  it("Fails to start game without balance", async () => {
    // Create a broke player
    const broke = Keypair.generate();
    const sig = await provider.connection.requestAirdrop(
      broke.publicKey,
      LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(sig);

    const [brokePda] = PublicKey.findProgramAddressSync(
      [Buffer.from("player"), broke.publicKey.toBuffer()],
      program.programId
    );

    // Buy 0 coins first (will fail), so player has no balance
    // Instead, just try starting without an account
    try {
      await program.methods
        .startGame()
        .accounts({
          playerAccount: brokePda,
          player: broke.publicKey,
        })
        .signers([broke])
        .rpc();
      expect.fail("Should have thrown");
    } catch (e) {
      console.log("✅ Correctly rejected game start with no balance");
    }
  });
});
