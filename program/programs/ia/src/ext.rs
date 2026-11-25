//! What the program reads of other programs and of the runtime, by hand: the upgradeable loader (its upgrade authority alone runs
//! `init_config`), SPL Token / Token-2022 accounts (the $IA holder rule), the SlotHashes sysvar (the round seed), and lamport moves
//! out of accounts this program owns.

use anchor_lang::prelude::*;

use crate::errors::IaError;

pub const TOKEN_ID: Pubkey = pubkey!("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
pub const TOKEN_2022_ID: Pubkey = pubkey!("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb");
pub const ATA_ID: Pubkey = pubkey!("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");
pub const LOADER_ID: Pubkey = pubkey!("BPFLoaderUpgradeab1e11111111111111111111111");
pub const SLOT_HASHES_ID: Pubkey = pubkey!("SysvarS1otHashes111111111111111111111111111");

pub fn sha256(parts: &[&[u8]]) -> [u8; 32] {
    solana_sha256_hasher::hashv(parts).to_bytes()
}

fn key_at(d: &[u8], at: usize) -> Pubkey {
    Pubkey::new_from_array(d[at..at + 32].try_into().unwrap())
}

/// The upgrade authority recorded in this program's ProgramData account (None when the program is frozen).
pub fn upgrade_authority(program_data: &AccountInfo) -> Result<Option<Pubkey>> {
    require_keys_eq!(*program_data.owner, LOADER_ID, IaError::NotUpgradeAuthority);
    let d = program_data.try_borrow_data()?;
    require!(d.len() >= 45 && d[..4] == [3, 0, 0, 0], IaError::NotUpgradeAuthority);
    Ok(if d[12] == 1 { Some(key_at(&d, 13)) } else { None })
}

pub fn is_token_program(key: &Pubkey) -> bool {
    *key == TOKEN_ID || *key == TOKEN_2022_ID
}

pub fn ata(owner: &Pubkey, mint: &Pubkey, token_program: &Pubkey) -> Pubkey {
    Pubkey::find_program_address(&[owner.as_ref(), token_program.as_ref(), mint.as_ref()], &ATA_ID).0
}

/// An initialized mint of SPL Token or Token-2022.
pub fn is_mint(m: &AccountInfo) -> bool {
    if !is_token_program(m.owner) {
        return false;
    }
    let Ok(d) = m.try_borrow_data() else { return false };
    let shape = d.len() == 82 || (*m.owner == TOKEN_2022_ID && d.len() > 165 && d[165] == 1);
    shape && d[45] == 1
}

/// (mint, owner, amount) of an initialized token account of SPL Token or Token-2022.
pub fn token_view(account: &AccountInfo) -> Option<(Pubkey, Pubkey, u64)> {
    if !is_token_program(account.owner) {
        return None;
    }
    let d = account.try_borrow_data().ok()?;
    if d.len() < 165 || d[108] != 1 {
        return None;
    }
    Some((key_at(&d, 0), key_at(&d, 32), u64::from_le_bytes(d[64..72].try_into().unwrap())))
}

/// The newest (slot, hash) of the SlotHashes sysvar: u64 count, then (u64 slot, [u8; 32] hash) newest first.
pub fn newest_slot_hash(sysvar: &AccountInfo) -> Result<(u64, [u8; 32])> {
    require_keys_eq!(sysvar.key(), SLOT_HASHES_ID, IaError::BadSlotHashes);
    let d = sysvar.try_borrow_data()?;
    require!(d.len() >= 48 && u64::from_le_bytes(d[0..8].try_into().unwrap()) > 0, IaError::BadSlotHashes);
    Ok((u64::from_le_bytes(d[8..16].try_into().unwrap()), d[16..48].try_into().unwrap()))
}

/// Lamports out of an account this program owns.
pub fn shift(from: &AccountInfo, to: &AccountInfo, lamports: u64) -> Result<()> {
    if lamports == 0 {
        return Ok(());
    }
    let left = from.lamports().checked_sub(lamports).ok_or(IaError::Overflow)?;
    let now = to.lamports().checked_add(lamports).ok_or(IaError::Overflow)?;
    **from.try_borrow_mut_lamports()? = left;
    **to.try_borrow_mut_lamports()? = now;
    Ok(())
}

/// Close an account this program owns: every lamport to `to`, then handed back to the system program, empty.
pub fn close<'info>(info: &AccountInfo<'info>, to: &AccountInfo<'info>) -> Result<()> {
    require_keys_neq!(info.key(), to.key(), IaError::PlantAccounts);
    shift(info, to, info.lamports())?;
    info.assign(&anchor_lang::solana_program::system_program::ID);
    info.resize(0)?;
    Ok(())
}
