use anchor_lang::prelude::*;

#[error_code]
pub enum IaError {
    #[msg("only the program's upgrade authority may initialise the config")]
    NotUpgradeAuthority,
    #[msg("only the admin may do this")]
    NotAdmin,
    #[msg("only the runner may do this")]
    NotRunner,
    #[msg("a parameter is outside its hard cap")]
    BadParams,
    #[msg("the program is paused: no new round may open")]
    Paused,
    #[msg("the previous round is not settled yet")]
    PreviousOpen,
    #[msg("the lineup accounts do not match the active agents in ascending id order")]
    BadLineup,
    #[msg("no active agent: a round needs a lineup")]
    EmptyLineup,
    #[msg("the plant window is closed")]
    PlantClosed,
    #[msg("the plant window is still open")]
    PlantOpen,
    #[msg("the run window is closed")]
    RunClosed,
    #[msg("the run window is still open")]
    RunOpen,
    #[msg("this round already holds the maximum number of plants")]
    PlantsFull,
    #[msg("unknown plant class or medium")]
    BadClass,
    #[msg("a KEY plant needs its canary public key")]
    NoCanary,
    #[msg("the runner key cannot plant")]
    RunnerCannotPlant,
    #[msg("the harness commitment is already set")]
    HarnessSet,
    #[msg("no harness commitment: this round cannot run")]
    NoHarness,
    #[msg("this agent is not in the round's lineup")]
    NotInLineup,
    #[msg("the round has no plants: close it instead")]
    NoPlants,
    #[msg("no such run in this docket")]
    BadRun,
    #[msg("this run already has a session key")]
    RunStarted,
    #[msg("the signer is not this run's session key")]
    NotSession,
    #[msg("the run already filed its report")]
    RunReported,
    #[msg("the docket is already settled")]
    Settled,
    #[msg("the round is not settled yet")]
    RoundNotSettled,
    #[msg("the round still has plants: it settles with its dockets")]
    HasPlants,
    #[msg("the agent is retired")]
    AgentInactive,
    #[msg("below the minimum deposit")]
    SmallDeposit,
    #[msg("not enough shares")]
    Shares,
    #[msg("nothing to withdraw yet: the unbond delay has not passed")]
    Unbonding,
    #[msg("the model string is empty or longer than 64 bytes")]
    BadModel,
    #[msg("the holder token account is not the payer's canonical $IA account")]
    BadHolderAccount,
    #[msg("over the runner's draw cap for this round")]
    DrawCap,
    #[msg("the payer account is not the docket's payer")]
    BadPayer,
    #[msg("arithmetic overflow")]
    Overflow,
    #[msg("the SlotHashes sysvar could not be read")]
    BadSlotHashes,
    #[msg("the root mint is already set or is not a mint")]
    BadMint,
}
