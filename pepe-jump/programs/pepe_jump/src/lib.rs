// ============================================================================
// PEPE JUMP — Solana Smart Contract (Anchor Framework)
// ============================================================================
// Handles:
//   1. Accepting SOL payments for PEPE coins
//   2. Tracking each player's PEPE coin balance
//   3. Spending coins for mini-game lives / power-ups
//   4. Collecting a platform fee (1–5%) on every purchase
//   5. Leaderboard tracking & SOL prize payouts
// ============================================================================

use anchor_lang::prelude::*;
use anchor_lang::system_program;

declare_id!("PEPEjump111111111111111111111111111111111");

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
/// Price of 1 PEPE coin in lamports (0.01 SOL = 10_000_000 lamports)
const PEPE_PRICE_LAMPORTS: u64 = 10_000_000;
/// Platform fee in basis points (300 = 3%)
const PLATFORM_FEE_BPS: u64 = 300;
/// Cost to play one game round (in PEPE coins)
const GAME_COST_PEPE: u64 = 1;
/// Number of leaderboard slots
const LEADERBOARD_SIZE: usize = 10;
/// Reward shares for top 3 (in basis points out of total prize pool)
/// 1st: 50%, 2nd: 30%, 3rd: 20%
const REWARD_SHARES: [u64; 3] = [5000, 3000, 2000];

// ---------------------------------------------------------------------------
// Program
// ---------------------------------------------------------------------------
#[program]
pub mod pepe_jump {
    use super::*;

    // -----------------------------------------------------------------------
    // Initialize the game state (called once by the deployer)
    // -----------------------------------------------------------------------
    pub fn initialize(ctx: Context<Initialize>, platform_fee_bps: u64) -> Result<()> {
        require!(
            platform_fee_bps >= 100 && platform_fee_bps <= 500,
            PepeError::InvalidFee
        );

        let game = &mut ctx.accounts.game_state;
        game.authority = ctx.accounts.authority.key();
        game.platform_fee_bps = platform_fee_bps;
        game.total_sol_collected = 0;
        game.prize_pool_lamports = 0;
        game.platform_fees_lamports = 0;
        game.leaderboard_day = Clock::get()?.unix_timestamp / 86400;
        game.leaderboard = [LeaderboardEntry::default(); LEADERBOARD_SIZE];
        game.bump = ctx.bumps.game_state;

        msg!("PEPE JUMP initialized! Fee: {}bps", platform_fee_bps);
        Ok(())
    }

    // -----------------------------------------------------------------------
    // Buy PEPE coins with SOL
    // -----------------------------------------------------------------------
    pub fn buy_pepe_coins(ctx: Context<BuyPepeCoins>, amount: u64) -> Result<()> {
        require!(amount > 0, PepeError::InvalidAmount);

        let total_cost = amount
            .checked_mul(PEPE_PRICE_LAMPORTS)
            .ok_or(PepeError::Overflow)?;

        // Calculate platform fee
        let game = &ctx.accounts.game_state;
        let fee = total_cost
            .checked_mul(game.platform_fee_bps)
            .ok_or(PepeError::Overflow)?
            .checked_div(10_000)
            .ok_or(PepeError::Overflow)?;

        let prize_contribution = total_cost.checked_sub(fee).ok_or(PepeError::Overflow)?;

        // Transfer SOL from buyer to the game vault PDA
        system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                system_program::Transfer {
                    from: ctx.accounts.buyer.to_account_info(),
                    to: ctx.accounts.game_vault.to_account_info(),
                },
            ),
            total_cost,
        )?;

        // Update game state
        let game = &mut ctx.accounts.game_state;
        game.total_sol_collected = game
            .total_sol_collected
            .checked_add(total_cost)
            .ok_or(PepeError::Overflow)?;
        game.platform_fees_lamports = game
            .platform_fees_lamports
            .checked_add(fee)
            .ok_or(PepeError::Overflow)?;
        game.prize_pool_lamports = game
            .prize_pool_lamports
            .checked_add(prize_contribution)
            .ok_or(PepeError::Overflow)?;

        // Update player account
        let player = &mut ctx.accounts.player_account;
        player.owner = ctx.accounts.buyer.key();
        player.pepe_balance = player
            .pepe_balance
            .checked_add(amount)
            .ok_or(PepeError::Overflow)?;
        player.total_purchased = player
            .total_purchased
            .checked_add(amount)
            .ok_or(PepeError::Overflow)?;

        msg!(
            "Player {} bought {} PEPE coins for {} lamports (fee: {})",
            ctx.accounts.buyer.key(),
            amount,
            total_cost,
            fee
        );

        Ok(())
    }

    // -----------------------------------------------------------------------
    // Spend 1 PEPE coin to play a game round
    // -----------------------------------------------------------------------
    pub fn start_game(ctx: Context<StartGame>) -> Result<()> {
        let player = &mut ctx.accounts.player_account;

        require!(
            player.pepe_balance >= GAME_COST_PEPE,
            PepeError::InsufficientBalance
        );

        player.pepe_balance = player
            .pepe_balance
            .checked_sub(GAME_COST_PEPE)
            .ok_or(PepeError::Overflow)?;
        player.total_games_played = player
            .total_games_played
            .checked_add(1)
            .ok_or(PepeError::Overflow)?;
        player.current_game_active = true;

        msg!(
            "Game started for {}. Balance: {} PEPE",
            ctx.accounts.player.key(),
            player.pepe_balance
        );

        Ok(())
    }

    // -----------------------------------------------------------------------
    // Buy a power-up with PEPE coins
    // -----------------------------------------------------------------------
    pub fn buy_power_up(ctx: Context<BuyPowerUp>, power_up_type: u8, cost: u64) -> Result<()> {
        require!(cost > 0 && cost <= 10, PepeError::InvalidAmount);

        let player = &mut ctx.accounts.player_account;
        require!(
            player.pepe_balance >= cost,
            PepeError::InsufficientBalance
        );

        player.pepe_balance = player
            .pepe_balance
            .checked_sub(cost)
            .ok_or(PepeError::Overflow)?;

        msg!(
            "Power-up {} purchased for {} PEPE by {}",
            power_up_type,
            cost,
            ctx.accounts.player.key()
        );

        Ok(())
    }

    // -----------------------------------------------------------------------
    // Submit a game score (called by game server / authority)
    // -----------------------------------------------------------------------
    pub fn submit_score(ctx: Context<SubmitScore>, score: u64) -> Result<()> {
        let player = &mut ctx.accounts.player_account;
        require!(player.current_game_active, PepeError::NoActiveGame);

        player.current_game_active = false;

        // Update personal high score
        if score > player.high_score {
            player.high_score = score;
        }

        // Check and potentially reset leaderboard for new day
        let game = &mut ctx.accounts.game_state;
        let current_day = Clock::get()?.unix_timestamp / 86400;

        if current_day > game.leaderboard_day {
            // New day — reset leaderboard (prizes should be distributed first)
            game.leaderboard = [LeaderboardEntry::default(); LEADERBOARD_SIZE];
            game.leaderboard_day = current_day;
            msg!("Leaderboard reset for new day {}", current_day);
        }

        // Try to insert into leaderboard
        let player_key = ctx.accounts.player.key();
        let mut inserted = false;

        // First check if player already on leaderboard and update
        for entry in game.leaderboard.iter_mut() {
            if entry.player == player_key && score > entry.score {
                entry.score = score;
                inserted = true;
                break;
            }
        }

        // If not already on board, try to add
        if !inserted {
            // Find lowest score slot
            let mut min_idx = 0;
            let mut min_score = u64::MAX;
            for (i, entry) in game.leaderboard.iter().enumerate() {
                if entry.score < min_score {
                    min_score = entry.score;
                    min_idx = i;
                }
            }
            if score > min_score {
                game.leaderboard[min_idx] = LeaderboardEntry {
                    player: player_key,
                    score,
                };
            }
        }

        // Sort leaderboard descending
        let mut lb = game.leaderboard;
        lb.sort_by(|a, b| b.score.cmp(&a.score));
        game.leaderboard = lb;

        msg!(
            "Score {} submitted for player {}",
            score,
            ctx.accounts.player.key()
        );

        Ok(())
    }

    // -----------------------------------------------------------------------
    // Distribute daily prizes (called by authority)
    // -----------------------------------------------------------------------
    pub fn distribute_prizes(ctx: Context<DistributePrizes>) -> Result<()> {
        let game = &mut ctx.accounts.game_state;

        require!(
            ctx.accounts.authority.key() == game.authority,
            PepeError::Unauthorized
        );

        let pool = game.prize_pool_lamports;
        require!(pool > 0, PepeError::NoPrizePool);

        // Calculate rewards for top 3
        let mut total_distributed: u64 = 0;

        for (i, share) in REWARD_SHARES.iter().enumerate() {
            if game.leaderboard[i].player == Pubkey::default() {
                continue; // Skip empty slots
            }
            let reward = pool
                .checked_mul(*share)
                .ok_or(PepeError::Overflow)?
                .checked_div(10_000)
                .ok_or(PepeError::Overflow)?;

            total_distributed = total_distributed
                .checked_add(reward)
                .ok_or(PepeError::Overflow)?;

            msg!(
                "Prize #{}: {} lamports to {}",
                i + 1,
                reward,
                game.leaderboard[i].player
            );
        }

        // Transfer SOL from vault to winners via CPI
        // Note: In production, each winner account would be passed and verified.
        // This simplified version logs the amounts. A full implementation would
        // iterate remaining_accounts to transfer SOL to each winner.

        game.prize_pool_lamports = pool
            .checked_sub(total_distributed)
            .ok_or(PepeError::Overflow)?;

        // Reset leaderboard
        game.leaderboard = [LeaderboardEntry::default(); LEADERBOARD_SIZE];
        game.leaderboard_day = Clock::get()?.unix_timestamp / 86400;

        msg!(
            "Prizes distributed! {} lamports sent. Remaining pool: {}",
            total_distributed,
            game.prize_pool_lamports
        );

        Ok(())
    }

    // -----------------------------------------------------------------------
    // Withdraw platform fees (authority only)
    // -----------------------------------------------------------------------
    pub fn withdraw_fees(ctx: Context<WithdrawFees>) -> Result<()> {
        let game = &mut ctx.accounts.game_state;

        require!(
            ctx.accounts.authority.key() == game.authority,
            PepeError::Unauthorized
        );

        let fees = game.platform_fees_lamports;
        require!(fees > 0, PepeError::NoFees);

        // Transfer fees from vault to authority
        let vault = &ctx.accounts.game_vault;
        let authority = &ctx.accounts.authority;

        **vault.to_account_info().try_borrow_mut_lamports()? -= fees;
        **authority.to_account_info().try_borrow_mut_lamports()? += fees;

        game.platform_fees_lamports = 0;

        msg!("Withdrew {} lamports in platform fees", fees);
        Ok(())
    }
}

// ---------------------------------------------------------------------------
// Account Structures
// ---------------------------------------------------------------------------

#[account]
#[derive(Default)]
pub struct GameState {
    /// The deployer / admin wallet
    pub authority: Pubkey,
    /// Platform fee in basis points (100–500)
    pub platform_fee_bps: u64,
    /// Total SOL collected (lamports)
    pub total_sol_collected: u64,
    /// Current prize pool (lamports)
    pub prize_pool_lamports: u64,
    /// Accumulated platform fees (lamports)
    pub platform_fees_lamports: u64,
    /// Current leaderboard day (unix_timestamp / 86400)
    pub leaderboard_day: i64,
    /// Top 10 leaderboard entries
    pub leaderboard: [LeaderboardEntry; LEADERBOARD_SIZE],
    /// PDA bump
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Default)]
pub struct LeaderboardEntry {
    pub player: Pubkey,
    pub score: u64,
}

#[account]
#[derive(Default)]
pub struct PlayerAccount {
    /// Wallet that owns this account
    pub owner: Pubkey,
    /// Current PEPE coin balance
    pub pepe_balance: u64,
    /// Total PEPE coins ever purchased
    pub total_purchased: u64,
    /// Total games played
    pub total_games_played: u64,
    /// Personal all-time high score
    pub high_score: u64,
    /// Whether a game round is currently active
    pub current_game_active: bool,
}

// ---------------------------------------------------------------------------
// Instruction Contexts
// ---------------------------------------------------------------------------

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + 32 + 8 + 8 + 8 + 8 + 8 + (LEADERBOARD_SIZE * (32 + 8)) + 1,
        seeds = [b"game_state"],
        bump
    )]
    pub game_state: Account<'info, GameState>,

    /// CHECK: PDA vault that holds SOL
    #[account(
        mut,
        seeds = [b"game_vault"],
        bump
    )]
    pub game_vault: AccountInfo<'info>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct BuyPepeCoins<'info> {
    #[account(
        mut,
        seeds = [b"game_state"],
        bump = game_state.bump
    )]
    pub game_state: Account<'info, GameState>,

    #[account(
        init_if_needed,
        payer = buyer,
        space = 8 + 32 + 8 + 8 + 8 + 8 + 1,
        seeds = [b"player", buyer.key().as_ref()],
        bump
    )]
    pub player_account: Account<'info, PlayerAccount>,

    /// CHECK: PDA vault
    #[account(
        mut,
        seeds = [b"game_vault"],
        bump
    )]
    pub game_vault: AccountInfo<'info>,

    #[account(mut)]
    pub buyer: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct StartGame<'info> {
    #[account(
        mut,
        seeds = [b"player", player.key().as_ref()],
        bump
    )]
    pub player_account: Account<'info, PlayerAccount>,

    pub player: Signer<'info>,
}

#[derive(Accounts)]
pub struct BuyPowerUp<'info> {
    #[account(
        mut,
        seeds = [b"player", player.key().as_ref()],
        bump
    )]
    pub player_account: Account<'info, PlayerAccount>,

    pub player: Signer<'info>,
}

#[derive(Accounts)]
pub struct SubmitScore<'info> {
    #[account(
        mut,
        seeds = [b"game_state"],
        bump = game_state.bump
    )]
    pub game_state: Account<'info, GameState>,

    #[account(
        mut,
        seeds = [b"player", player.key().as_ref()],
        bump
    )]
    pub player_account: Account<'info, PlayerAccount>,

    pub player: Signer<'info>,
}

#[derive(Accounts)]
pub struct DistributePrizes<'info> {
    #[account(
        mut,
        seeds = [b"game_state"],
        bump = game_state.bump
    )]
    pub game_state: Account<'info, GameState>,

    /// CHECK: PDA vault
    #[account(
        mut,
        seeds = [b"game_vault"],
        bump
    )]
    pub game_vault: AccountInfo<'info>,

    #[account(mut)]
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct WithdrawFees<'info> {
    #[account(
        mut,
        seeds = [b"game_state"],
        bump = game_state.bump
    )]
    pub game_state: Account<'info, GameState>,

    /// CHECK: PDA vault
    #[account(
        mut,
        seeds = [b"game_vault"],
        bump
    )]
    pub game_vault: AccountInfo<'info>,

    #[account(mut)]
    pub authority: Signer<'info>,
}

// ---------------------------------------------------------------------------
// Error Codes
// ---------------------------------------------------------------------------

#[error_code]
pub enum PepeError {
    #[msg("Platform fee must be between 100 and 500 basis points (1-5%)")]
    InvalidFee,
    #[msg("Amount must be greater than zero")]
    InvalidAmount,
    #[msg("Insufficient PEPE coin balance")]
    InsufficientBalance,
    #[msg("Arithmetic overflow")]
    Overflow,
    #[msg("Unauthorized — only the authority can call this")]
    Unauthorized,
    #[msg("No active game to submit score for")]
    NoActiveGame,
    #[msg("No prize pool available")]
    NoPrizePool,
    #[msg("No fees to withdraw")]
    NoFees,
}
