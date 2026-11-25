//! IA fuzz: a test-only consumer of `ia::require_record`, loaded only on the fuzzer's local validator.
//!
//! - `gate`: a careful consumer. CPI to the pinned `ia`, the return data's program id checked, and the answer compared with a direct
//!   read of the same Agent account through `ia::rules::record_check`: both must agree on every record (pass or the same refusal).
//! - `naive_gate`: a consumer that calls whatever program it is given as `ia_program` (what a consumer that does not pin ia accepts).
//! - `require_record`: a FAKE ia (same instruction name, so the same discriminator and argument layout): yes to anything, a perfect
//!   record. `naive_gate` pointed at this program shows why consumers must pin ia's program id.

#![allow(unexpected_cfgs)]

use anchor_lang::prelude::*;
use anchor_lang::solana_program::program::get_return_data;
use ia::rules::{record_check, Record, RECORD_OK, RECORD_RECENT, RECORD_SHORT, RECORD_TAKEN};

declare_id!("C5qno3ZR5EErRhJEQ4CxPeABTC2xcnm6tXNXizXmZCrt");

#[error_code]
pub enum ConsumerError {
    #[msg("no return data after the CPI")]
    NoReturn,
    #[msg("the return data came from another program")]
    ReturnFromElsewhere,
    #[msg("the CPI answer and the direct read differ")]
    ViewsDiffer,
    #[msg("the direct read refuses: short")]
    DirectShort,
    #[msg("the direct read refuses: taken")]
    DirectTaken,
    #[msg("the direct read refuses: recent")]
    DirectRecent,
    #[msg("the direct read refuses: league")]
    DirectLeague,
}

#[event]
pub struct Gated {
    pub by: Pubkey,
    pub agent: u16,
    pub kind: u8,
    pub epoch: u32,
    pub runs: u64,
    pub taken: u64,
}

#[program]
pub mod ia_consumer {
    use super::*;

    /// The fake ia: a perfect record for anything.
    pub fn require_record(ctx: Context<Fake>, _min_runs: u64, _max_taken_bps: u16, _since_round: u64, _allow_league: bool) -> Result<ia::RecordView> {
        let _ = &ctx.accounts.agent;
        Ok(ia::RecordView { agent: 0, kind: 0, active: true, epoch: 1, model: [0u8; 64], record: Record { start_round: 0, runs: 1_000_000, clean: 1_000_000, taken: 0, lied: 0 } })
    }

    /// A consumer that does not pin ia.
    pub fn naive_gate(ctx: Context<Naive>, min_runs: u64, max_taken_bps: u16, since_round: u64, allow_league: bool) -> Result<()> {
        let a = ctx.accounts;
        let v = ia::cpi::require_record(
            CpiContext::new(a.ia_program.key(), ia::cpi::accounts::RequireRecord { agent: a.agent.to_account_info() }),
            min_runs,
            max_taken_bps,
            since_round,
            allow_league,
        )?
        .get();
        emit!(Gated { by: a.ia_program.key(), agent: v.agent, kind: v.kind, epoch: v.epoch, runs: v.record.runs, taken: v.record.taken });
        Ok(())
    }

    /// The careful consumer. With `direct_first`, the direct read's verdict is checked before the CPI (so a refusal names who refused).
    pub fn gate(ctx: Context<Gate>, min_runs: u64, max_taken_bps: u16, since_round: u64, allow_league: bool) -> Result<()> {
        let a = ctx.accounts;
        let agent = {
            let d = a.agent.try_borrow_data()?;
            let mut s: &[u8] = &d;
            ia::Agent::try_deserialize(&mut s)?
        };
        let v = ia::cpi::require_record(
            CpiContext::new(ia::ID, ia::cpi::accounts::RequireRecord { agent: a.agent.to_account_info() }),
            min_runs,
            max_taken_bps,
            since_round,
            allow_league,
        )?
        .get();
        let (pid, _) = get_return_data().ok_or(error!(ConsumerError::NoReturn))?;
        require_keys_eq!(pid, ia::ID, ConsumerError::ReturnFromElsewhere);
        // the CPI said yes: the direct read must say yes too, and the views must agree
        require!(allow_league || agent.kind == ia::rules::KIND_HOUSE, ConsumerError::DirectLeague);
        match record_check(&agent.record, min_runs, max_taken_bps, since_round) {
            RECORD_OK => {}
            RECORD_SHORT => return err!(ConsumerError::DirectShort),
            RECORD_TAKEN => return err!(ConsumerError::DirectTaken),
            RECORD_RECENT => return err!(ConsumerError::DirectRecent),
            _ => return err!(ConsumerError::ViewsDiffer),
        }
        let same = v.agent == agent.id && v.kind == agent.kind && v.active == agent.active && v.epoch == agent.epoch && v.model == agent.model && v.record == agent.record;
        require!(same, ConsumerError::ViewsDiffer);
        emit!(Gated { by: ia::ID, agent: v.agent, kind: v.kind, epoch: v.epoch, runs: v.record.runs, taken: v.record.taken });
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Fake<'info> {
    /// CHECK: anything
    pub agent: UncheckedAccount<'info>,
}

#[derive(Accounts)]
pub struct Naive<'info> {
    /// CHECK: the agent account handed to whatever program answers
    pub agent: UncheckedAccount<'info>,
    /// CHECK: NOT pinned (the point of this instruction)
    pub ia_program: UncheckedAccount<'info>,
}

#[derive(Accounts)]
pub struct Gate<'info> {
    /// CHECK: read directly and through the CPI (ia checks its seeds and owner)
    pub agent: UncheckedAccount<'info>,
    /// CHECK: ia itself (the CPI target is pinned to ia::ID in the handler)
    #[account(address = ia::ID)]
    pub ia_program: UncheckedAccount<'info>,
}
