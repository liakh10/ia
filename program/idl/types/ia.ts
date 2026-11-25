/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/ia.json`.
 */
export type Ia = {
  "address": "CAnntf6D3Ec3jZpzqSDmShvWbmvF6Dhk9rJYR1jxyVnr",
  "metadata": {
    "name": "ia",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Internal Affairs: AI agents work real tasks with planted bait; the program records who takes it, pays the investigator whose plant caught a model, and keeps every model's purse growing while it holds"
  },
  "instructions": [
    {
      "name": "act",
      "docs": [
        "A session key acts on its run. Remaining accounts: optional extra signers (a leaked canary key the agent chose to use)."
      ],
      "discriminator": [
        114,
        158,
        229,
        112,
        242,
        50,
        227,
        5
      ],
      "accounts": [
        {
          "name": "session",
          "signer": true
        },
        {
          "name": "round",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  111,
                  117,
                  110,
                  100
                ]
              },
              {
                "kind": "account",
                "path": "round.seq",
                "account": "round"
              }
            ]
          }
        },
        {
          "name": "docket",
          "docs": [
            "The docket's round is checked against `round` in the handler."
          ],
          "writable": true
        }
      ],
      "args": [
        {
          "name": "run",
          "type": "u8"
        },
        {
          "name": "step",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        },
        {
          "name": "action",
          "type": {
            "defined": {
              "name": "action"
            }
          }
        }
      ]
    },
    {
      "name": "addAgent",
      "docs": [
        "A house lineup agent with its exact model version string. Ids are 0, 1, 2, … (shared with the Open League)."
      ],
      "discriminator": [
        214,
        206,
        14,
        110,
        178,
        131,
        218,
        45
      ],
      "accounts": [
        {
          "name": "admin",
          "writable": true,
          "signer": true,
          "relations": [
            "config"
          ]
        },
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "agent",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  103,
                  101,
                  110,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "config.agentCount",
                "account": "config"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "model",
          "type": "string"
        }
      ]
    },
    {
      "name": "applyAgent",
      "docs": [
        "Anyone, once the delay has passed and no docket of the agent is open: the pending change takes effect (a new model version",
        "opens a new epoch with a fresh record). The next round's lineup sees it."
      ],
      "discriminator": [
        54,
        54,
        194,
        62,
        134,
        19,
        230,
        158
      ],
      "accounts": [
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "agent",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  103,
                  101,
                  110,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "agent.id",
                "account": "agent"
              }
            ]
          }
        }
      ],
      "args": []
    },
    {
      "name": "applyRunner",
      "docs": [
        "Anyone, once the rotation delay has passed: the proposed runner becomes the runner."
      ],
      "discriminator": [
        36,
        12,
        62,
        123,
        57,
        46,
        140,
        239
      ],
      "accounts": [
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        }
      ],
      "args": []
    },
    {
      "name": "claimPlant",
      "docs": [
        "The planter, once the round is settled: the bounty its plant earned (maybe zero); the plant account closes to the planter."
      ],
      "discriminator": [
        219,
        203,
        204,
        20,
        220,
        149,
        47,
        108
      ],
      "accounts": [
        {
          "name": "planter",
          "writable": true,
          "signer": true,
          "relations": [
            "plant"
          ]
        },
        {
          "name": "round",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  111,
                  117,
                  110,
                  100
                ]
              },
              {
                "kind": "account",
                "path": "round.seq",
                "account": "round"
              }
            ]
          }
        },
        {
          "name": "plant",
          "writable": true
        }
      ],
      "args": []
    },
    {
      "name": "closeAgent",
      "docs": [
        "Closing, once no surety is left: the agent account to whoever paid its rent (the dev for a house agent, the operator for an",
        "Open League agent), with what is left in it (orphan fees, share rounding dust)."
      ],
      "discriminator": [
        52,
        185,
        104,
        145,
        157,
        30,
        87,
        237
      ],
      "accounts": [
        {
          "name": "admin",
          "signer": true,
          "relations": [
            "config"
          ]
        },
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "agent",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  103,
                  101,
                  110,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "agent.id",
                "account": "agent"
              }
            ]
          }
        },
        {
          "name": "recipient",
          "writable": true
        }
      ],
      "args": []
    },
    {
      "name": "closeBegin",
      "docs": [
        "The admin starts closing: no round, plant, run, deposit or agent from now on; open rounds settle at once, bounties go straight",
        "to their planters, sureties are paid out (no unbond delay), every account closes to whoever paid it."
      ],
      "discriminator": [
        161,
        49,
        64,
        17,
        104,
        205,
        191,
        182
      ],
      "accounts": [
        {
          "name": "admin",
          "signer": true,
          "relations": [
            "config"
          ]
        },
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        }
      ],
      "args": []
    },
    {
      "name": "closeConfig",
      "docs": [
        "Closing, once every agent and round is closed: the treasury's fees, the runner fund and every rent to the dev."
      ],
      "discriminator": [
        145,
        9,
        72,
        157,
        95,
        125,
        61,
        85
      ],
      "accounts": [
        {
          "name": "admin",
          "signer": true,
          "relations": [
            "config"
          ]
        },
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "treasury",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  114,
                  101,
                  97,
                  115,
                  117,
                  114,
                  121
                ]
              }
            ]
          }
        },
        {
          "name": "runnerFund",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  117,
                  110,
                  110,
                  101,
                  114,
                  95,
                  102,
                  117,
                  110,
                  100
                ]
              }
            ]
          }
        },
        {
          "name": "dev",
          "writable": true,
          "relations": [
            "config"
          ]
        }
      ],
      "args": []
    },
    {
      "name": "closeEmptyRound",
      "docs": [
        "Anyone: a round that drew no plant closes at the end of its plant window (at once while closing).",
        "Remaining accounts: the round's lineup agents in order (writable): they are no longer under test."
      ],
      "discriminator": [
        13,
        204,
        252,
        231,
        59,
        21,
        152,
        146
      ],
      "accounts": [
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "round",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  111,
                  117,
                  110,
                  100
                ]
              },
              {
                "kind": "account",
                "path": "round.seq",
                "account": "round"
              }
            ]
          }
        }
      ],
      "args": []
    },
    {
      "name": "closeSurety",
      "docs": [
        "Closing: a surety's share of the purse to its owner, its account's rent with it."
      ],
      "discriminator": [
        176,
        155,
        75,
        50,
        231,
        138,
        84,
        148
      ],
      "accounts": [
        {
          "name": "admin",
          "signer": true,
          "relations": [
            "config"
          ]
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "agent",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  103,
                  101,
                  110,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "agent.id",
                "account": "agent"
              }
            ]
          }
        },
        {
          "name": "surety",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  117,
                  114,
                  101,
                  116,
                  121
                ]
              },
              {
                "kind": "account",
                "path": "agent.id",
                "account": "agent"
              },
              {
                "kind": "account",
                "path": "owner"
              }
            ]
          }
        },
        {
          "name": "owner",
          "writable": true,
          "relations": [
            "surety"
          ]
        }
      ],
      "args": []
    },
    {
      "name": "commitHarness",
      "docs": [
        "The runner, before the plant window closes: sha256(harness bundle ‖ prompts ‖ exact model versions ‖ runs ‖ nudge)."
      ],
      "discriminator": [
        6,
        235,
        9,
        73,
        143,
        95,
        32,
        210
      ],
      "accounts": [
        {
          "name": "runner",
          "signer": true,
          "relations": [
            "config"
          ]
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "round",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  111,
                  117,
                  110,
                  100
                ]
              },
              {
                "kind": "account",
                "path": "round.seq",
                "account": "round"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "harness",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        }
      ]
    },
    {
      "name": "deposit",
      "docs": [
        "Stand surety: lamports into the agent's purse for shares of what sureties own of it. Open League agents take only their",
        "operator's money; the runner key never stands surety. Never while the agent is under test (from `open_round` until its",
        "docket settles), so nobody buys into a round's fees after seeing its acts."
      ],
      "discriminator": [
        242,
        35,
        198,
        137,
        82,
        225,
        242,
        182
      ],
      "accounts": [
        {
          "name": "owner",
          "writable": true,
          "signer": true
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "agent",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  103,
                  101,
                  110,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "agent.id",
                "account": "agent"
              }
            ]
          }
        },
        {
          "name": "surety",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  117,
                  114,
                  101,
                  116,
                  121
                ]
              },
              {
                "kind": "account",
                "path": "agent.id",
                "account": "agent"
              },
              {
                "kind": "account",
                "path": "owner"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "lamports",
          "type": "u64"
        }
      ]
    },
    {
      "name": "draw",
      "docs": [
        "The runner draws its bills from the fund, at most `runner_draw_cap` per round (counted against the newest round). Passing the",
        "newest round also spills the fund's surplus above `runner_fund_cap` into its purse pool."
      ],
      "discriminator": [
        61,
        40,
        62,
        184,
        31,
        176,
        24,
        130
      ],
      "accounts": [
        {
          "name": "runner",
          "writable": true,
          "signer": true,
          "relations": [
            "config"
          ]
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "runnerFund",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  117,
                  110,
                  110,
                  101,
                  114,
                  95,
                  102,
                  117,
                  110,
                  100
                ]
              }
            ]
          }
        },
        {
          "name": "round",
          "docs": [
            "The newest round (optional): the fund's surplus spills into its purse pool."
          ],
          "writable": true,
          "optional": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  111,
                  117,
                  110,
                  100
                ]
              },
              {
                "kind": "account",
                "path": "round.seq",
                "account": "round"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "lamports",
          "type": "u64"
        }
      ]
    },
    {
      "name": "initConfig",
      "docs": [
        "Only the program's upgrade authority, who becomes the admin and pays the config, treasury and runner fund rent."
      ],
      "discriminator": [
        23,
        235,
        115,
        232,
        168,
        96,
        1,
        231
      ],
      "accounts": [
        {
          "name": "admin",
          "writable": true,
          "signer": true
        },
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "treasury",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  114,
                  101,
                  97,
                  115,
                  117,
                  114,
                  121
                ]
              }
            ]
          }
        },
        {
          "name": "runnerFund",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  117,
                  110,
                  110,
                  101,
                  114,
                  95,
                  102,
                  117,
                  110,
                  100
                ]
              }
            ]
          }
        },
        {
          "name": "programData",
          "address": "62ZFPHK1XiatUCPJ9W48nvALPVMfjLmWJjgvWQNRusc2"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "runner",
          "type": "pubkey"
        },
        {
          "name": "dev",
          "type": "pubkey"
        }
      ]
    },
    {
      "name": "leaveLeague",
      "docs": [
        "The operator retires its Open League agent at once (from the next round's lineup); the bond then leaves by unbond + withdraw."
      ],
      "discriminator": [
        203,
        232,
        205,
        216,
        161,
        35,
        177,
        110
      ],
      "accounts": [
        {
          "name": "operator",
          "signer": true,
          "relations": [
            "agent"
          ]
        },
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "agent",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  103,
                  101,
                  110,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "agent.id",
                "account": "agent"
              }
            ]
          }
        }
      ],
      "args": []
    },
    {
      "name": "openDocket",
      "docs": [
        "Anyone, after the plant window (at once while closing), for a lineup agent of an unsettled round with plants: the docket with",
        "the task's numbers and the purse at this moment. The payer gets the rent back at settlement."
      ],
      "discriminator": [
        99,
        60,
        65,
        146,
        237,
        201,
        207,
        120
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "round",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  111,
                  117,
                  110,
                  100
                ]
              },
              {
                "kind": "account",
                "path": "round.seq",
                "account": "round"
              }
            ]
          }
        },
        {
          "name": "agent",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  103,
                  101,
                  110,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "agent.id",
                "account": "agent"
              }
            ]
          }
        },
        {
          "name": "docket",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  111,
                  99,
                  107,
                  101,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "round.seq",
                "account": "round"
              },
              {
                "kind": "account",
                "path": "agent.id",
                "account": "agent"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "openRound",
      "docs": [
        "Anyone, once the previous round is settled. Remaining accounts: every active agent, ascending id (the lineup snapshot)."
      ],
      "discriminator": [
        66,
        235,
        123,
        240,
        8,
        35,
        185,
        159
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "prevRound",
          "docs": [
            "The previous round (required from the second round on)."
          ],
          "optional": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  111,
                  117,
                  110,
                  100
                ]
              },
              {
                "kind": "account",
                "path": "prevRound.seq",
                "account": "round"
              }
            ]
          }
        },
        {
          "name": "round",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  111,
                  117,
                  110,
                  100
                ]
              },
              {
                "kind": "account",
                "path": "config.nextRound",
                "account": "config"
              }
            ]
          }
        },
        {
          "name": "slotHashes"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "plant",
      "docs": [
        "Anyone but the runner key, inside the plant window. The text itself goes to the plant registry; its sha256 is fixed here.",
        "`max_price`: the planter's limit (the price rises 10% with every plant before it lands)."
      ],
      "discriminator": [
        200,
        121,
        224,
        150,
        235,
        239,
        156,
        246
      ],
      "accounts": [
        {
          "name": "planter",
          "writable": true,
          "signer": true
        },
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "round",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  111,
                  117,
                  110,
                  100
                ]
              },
              {
                "kind": "account",
                "path": "round.seq",
                "account": "round"
              }
            ]
          }
        },
        {
          "name": "plant",
          "writable": true
        },
        {
          "name": "treasury",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  114,
                  101,
                  97,
                  115,
                  117,
                  114,
                  121
                ]
              }
            ]
          }
        },
        {
          "name": "runnerFund",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  117,
                  110,
                  110,
                  101,
                  114,
                  95,
                  102,
                  117,
                  110,
                  100
                ]
              }
            ]
          }
        },
        {
          "name": "holderToken",
          "optional": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "class",
          "type": "u8"
        },
        {
          "name": "medium",
          "type": "u8"
        },
        {
          "name": "textHash",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        },
        {
          "name": "target",
          "type": "u64"
        },
        {
          "name": "canary",
          "type": "pubkey"
        },
        {
          "name": "maxPrice",
          "type": "u64"
        }
      ]
    },
    {
      "name": "postTranscript",
      "docs": [
        "The docket's transcript Merkle root (CONTRACT §6), any time before settlement: the runner for a house agent, the operator for",
        "an Open League agent."
      ],
      "discriminator": [
        114,
        10,
        173,
        39,
        217,
        192,
        128,
        108
      ],
      "accounts": [
        {
          "name": "authority",
          "docs": [
            "The runner (house agent) or the agent's operator (Open League)."
          ],
          "signer": true
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "agent",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  103,
                  101,
                  110,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "agent.id",
                "account": "agent"
              }
            ]
          }
        },
        {
          "name": "docket",
          "writable": true
        }
      ],
      "args": [
        {
          "name": "root",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        }
      ]
    },
    {
      "name": "proposeRunner",
      "docs": [
        "Propose a new runner key; it takes over `rotation_delay` slots later (`apply_runner`). Proposing the current runner cancels."
      ],
      "discriminator": [
        86,
        236,
        152,
        23,
        139,
        137,
        201,
        248
      ],
      "accounts": [
        {
          "name": "admin",
          "signer": true,
          "relations": [
            "config"
          ]
        },
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "runner",
          "type": "pubkey"
        }
      ]
    },
    {
      "name": "reapRound",
      "docs": [
        "Anyone, once a settled round is not the newest and its claim window has passed (at once while closing): every unclaimed",
        "bounty to the runner fund (to its planter while closing), every unclaimed plant account closed to its planter, the round's",
        "rent to its payer. Remaining accounts: (plant, planter) for each unclaimed plant, in index order."
      ],
      "discriminator": [
        251,
        88,
        49,
        166,
        140,
        139,
        171,
        133
      ],
      "accounts": [
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "round",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  111,
                  117,
                  110,
                  100
                ]
              },
              {
                "kind": "account",
                "path": "round.seq",
                "account": "round"
              }
            ]
          }
        },
        {
          "name": "payer",
          "writable": true
        },
        {
          "name": "runnerFund",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  117,
                  110,
                  110,
                  101,
                  114,
                  95,
                  102,
                  117,
                  110,
                  100
                ]
              }
            ]
          }
        }
      ],
      "args": []
    },
    {
      "name": "registerAgent",
      "docs": [
        "Open League: an operator registers its own agent with a bond (≥ `league_bond`) that becomes its purse; the operator is its only",
        "surety. The agent joins the next round's lineup; the operator starts its runs and earns the plant fees it resists."
      ],
      "discriminator": [
        135,
        157,
        66,
        195,
        2,
        113,
        175,
        30
      ],
      "accounts": [
        {
          "name": "operator",
          "writable": true,
          "signer": true
        },
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "agent",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  103,
                  101,
                  110,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "config.agentCount",
                "account": "config"
              }
            ]
          }
        },
        {
          "name": "surety",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  117,
                  114,
                  101,
                  116,
                  121
                ]
              },
              {
                "kind": "account",
                "path": "config.agentCount",
                "account": "config"
              },
              {
                "kind": "account",
                "path": "operator"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "model",
          "type": "string"
        },
        {
          "name": "bond",
          "type": "u64"
        }
      ]
    },
    {
      "name": "requestUnbond",
      "docs": [
        "Start the unbond clock for `shares` (replaces an earlier request). The shares keep earning and losing until withdrawn. The",
        "request matures after the unbond delay in force now and expires one delay later."
      ],
      "discriminator": [
        11,
        35,
        179,
        103,
        226,
        159,
        251,
        63
      ],
      "accounts": [
        {
          "name": "owner",
          "writable": true,
          "signer": true,
          "relations": [
            "surety"
          ]
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "agent",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  103,
                  101,
                  110,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "agent.id",
                "account": "agent"
              }
            ]
          }
        },
        {
          "name": "surety",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  117,
                  114,
                  101,
                  116,
                  121
                ]
              },
              {
                "kind": "account",
                "path": "agent.id",
                "account": "agent"
              },
              {
                "kind": "account",
                "path": "owner"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "shares",
          "type": "u128"
        }
      ]
    },
    {
      "name": "requireRecord",
      "docs": [
        "A calling program checks an agent's record by CPI: ≥ `min_runs` started runs in its current exact model version, taken runs",
        "≤ `max_taken_bps` of them, the record reaching back to `since_round`. House agents only unless `allow_league` (an Open League",
        "agent's runs are self-reported). Fails otherwise; returns the record (return data)."
      ],
      "discriminator": [
        42,
        60,
        71,
        5,
        193,
        30,
        35,
        181
      ],
      "accounts": [
        {
          "name": "agent",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  103,
                  101,
                  110,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "agent.id",
                "account": "agent"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "minRuns",
          "type": "u64"
        },
        {
          "name": "maxTakenBps",
          "type": "u16"
        },
        {
          "name": "sinceRound",
          "type": "u64"
        },
        {
          "name": "allowLeague",
          "type": "bool"
        }
      ],
      "returns": {
        "defined": {
          "name": "recordView"
        }
      }
    },
    {
      "name": "setAgent",
      "docs": [
        "Schedule a lineup change: retire or return an agent, or record a new exact model version (a new epoch). It applies",
        "`rotation_delay` slots later (`apply_agent`), and only between this agent's dockets. A newer call replaces a pending one.",
        "Open League agents can only be retired here."
      ],
      "discriminator": [
        154,
        74,
        121,
        91,
        137,
        19,
        101,
        166
      ],
      "accounts": [
        {
          "name": "admin",
          "signer": true,
          "relations": [
            "config"
          ]
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "agent",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  103,
                  101,
                  110,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "agent.id",
                "account": "agent"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "active",
          "type": "bool"
        },
        {
          "name": "model",
          "type": {
            "option": "string"
          }
        }
      ]
    },
    {
      "name": "setParams",
      "docs": [
        "New parameters inside the hard caps. They apply from the next round (a round runs under the parameters of its opening),",
        "except the surety, draw and rotation rules, which apply at once; a lowered rotation delay still waits out the old one."
      ],
      "discriminator": [
        27,
        234,
        178,
        52,
        147,
        2,
        187,
        141
      ],
      "accounts": [
        {
          "name": "admin",
          "signer": true,
          "relations": [
            "config"
          ]
        },
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "params",
          "type": {
            "defined": {
              "name": "params"
            }
          }
        }
      ]
    },
    {
      "name": "setPaused",
      "discriminator": [
        91,
        60,
        125,
        192,
        176,
        225,
        166,
        218
      ],
      "accounts": [
        {
          "name": "admin",
          "signer": true,
          "relations": [
            "config"
          ]
        },
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "paused",
          "type": "bool"
        }
      ]
    },
    {
      "name": "setRoles",
      "docs": [
        "The dev key (None leaves it), and the $IA mint once (pass its mint account). The runner changes only by rotation."
      ],
      "discriminator": [
        119,
        86,
        129,
        161,
        55,
        23,
        250,
        12
      ],
      "accounts": [
        {
          "name": "admin",
          "signer": true,
          "relations": [
            "config"
          ]
        },
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "rootMint",
          "optional": true
        }
      ],
      "args": [
        {
          "name": "dev",
          "type": {
            "option": "pubkey"
          }
        }
      ]
    },
    {
      "name": "settleDocket",
      "docs": [
        "Anyone, after the run window (at once while closing): tiers, bounties (agent → round), the agent's share of the round's plant",
        "fees (round → house agent), the stats and the epoch record; the docket closes to its payer. An Open League agent takes no",
        "share; one that started no run leaves the league."
      ],
      "discriminator": [
        140,
        157,
        87,
        117,
        37,
        17,
        85,
        171
      ],
      "accounts": [
        {
          "name": "caller",
          "signer": true
        },
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "round",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  111,
                  117,
                  110,
                  100
                ]
              },
              {
                "kind": "account",
                "path": "round.seq",
                "account": "round"
              }
            ]
          }
        },
        {
          "name": "agent",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  103,
                  101,
                  110,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "agent.id",
                "account": "agent"
              }
            ]
          }
        },
        {
          "name": "docket",
          "docs": [
            "The docket's round, agent and payer are checked in the handler."
          ],
          "writable": true
        },
        {
          "name": "payer",
          "writable": true
        },
        {
          "name": "runnerFund",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  117,
                  110,
                  110,
                  101,
                  114,
                  95,
                  102,
                  117,
                  110,
                  100
                ]
              }
            ]
          }
        }
      ],
      "args": []
    },
    {
      "name": "spill",
      "docs": [
        "Anyone: the runner fund's surplus above `runner_fund_cap` into the newest round's purse pool (while it has plants and no",
        "docket settled)."
      ],
      "discriminator": [
        101,
        91,
        244,
        103,
        21,
        236,
        134,
        217
      ],
      "accounts": [
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "runnerFund",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  117,
                  110,
                  110,
                  101,
                  114,
                  95,
                  102,
                  117,
                  110,
                  100
                ]
              }
            ]
          }
        },
        {
          "name": "round",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  111,
                  117,
                  110,
                  100
                ]
              },
              {
                "kind": "account",
                "path": "round.seq",
                "account": "round"
              }
            ]
          }
        }
      ],
      "args": []
    },
    {
      "name": "startRun",
      "docs": [
        "A run gets its session key (one per run, made fresh): from the runner for a house agent (after its harness commitment), from",
        "the operator for an Open League agent."
      ],
      "discriminator": [
        72,
        212,
        1,
        91,
        61,
        186,
        2,
        52
      ],
      "accounts": [
        {
          "name": "authority",
          "docs": [
            "The runner (house agent) or the agent's operator (Open League)."
          ],
          "signer": true
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "round",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  111,
                  117,
                  110,
                  100
                ]
              },
              {
                "kind": "account",
                "path": "round.seq",
                "account": "round"
              }
            ]
          }
        },
        {
          "name": "agent",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  103,
                  101,
                  110,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "agent.id",
                "account": "agent"
              }
            ]
          }
        },
        {
          "name": "docket",
          "docs": [
            "The docket's round and agent are checked in the handler."
          ],
          "writable": true
        }
      ],
      "args": [
        {
          "name": "run",
          "type": "u8"
        },
        {
          "name": "session",
          "type": "pubkey"
        }
      ]
    },
    {
      "name": "withdraw",
      "docs": [
        "From the request's maturity until one delay later (a test in between restarts that count when it ends), and never while the",
        "agent is under test. An active Open League agent keeps its minimum bond."
      ],
      "discriminator": [
        183,
        18,
        70,
        156,
        148,
        109,
        161,
        34
      ],
      "accounts": [
        {
          "name": "owner",
          "writable": true,
          "signer": true,
          "relations": [
            "surety"
          ]
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "agent",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  103,
                  101,
                  110,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "agent.id",
                "account": "agent"
              }
            ]
          }
        },
        {
          "name": "surety",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  117,
                  114,
                  101,
                  116,
                  121
                ]
              },
              {
                "kind": "account",
                "path": "agent.id",
                "account": "agent"
              },
              {
                "kind": "account",
                "path": "owner"
              }
            ]
          }
        }
      ],
      "args": []
    },
    {
      "name": "withdrawFees",
      "docs": [
        "The admin sends the treasury's fees (above rent) to the dev wallet."
      ],
      "discriminator": [
        198,
        212,
        171,
        109,
        144,
        215,
        174,
        89
      ],
      "accounts": [
        {
          "name": "admin",
          "signer": true,
          "relations": [
            "config"
          ]
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "treasury",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  114,
                  101,
                  97,
                  115,
                  117,
                  114,
                  121
                ]
              }
            ]
          }
        },
        {
          "name": "dev",
          "writable": true,
          "relations": [
            "config"
          ]
        }
      ],
      "args": []
    },
    {
      "name": "withholdPlants",
      "docs": [
        "The runner marks the plants the registry never delivered (no text at plant close), before the round's first house run starts",
        "(an Open League run cannot block it: the mask is applied at settlement to every docket).",
        "They are never shown and cannot be taken. Bits only add."
      ],
      "discriminator": [
        100,
        193,
        159,
        239,
        187,
        135,
        158,
        96
      ],
      "accounts": [
        {
          "name": "runner",
          "signer": true,
          "relations": [
            "config"
          ]
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "round",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  111,
                  117,
                  110,
                  100
                ]
              },
              {
                "kind": "account",
                "path": "round.seq",
                "account": "round"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "mask",
          "type": "u16"
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "agent",
      "discriminator": [
        47,
        166,
        112,
        147,
        155,
        197,
        86,
        7
      ]
    },
    {
      "name": "config",
      "discriminator": [
        155,
        12,
        170,
        224,
        30,
        250,
        204,
        130
      ]
    },
    {
      "name": "docket",
      "discriminator": [
        17,
        244,
        16,
        81,
        85,
        93,
        149,
        157
      ]
    },
    {
      "name": "plant",
      "discriminator": [
        221,
        207,
        23,
        150,
        148,
        54,
        227,
        103
      ]
    },
    {
      "name": "round",
      "discriminator": [
        87,
        127,
        165,
        51,
        73,
        78,
        116,
        174
      ]
    },
    {
      "name": "runnerFund",
      "discriminator": [
        153,
        180,
        240,
        59,
        17,
        130,
        234,
        88
      ]
    },
    {
      "name": "surety",
      "discriminator": [
        74,
        63,
        170,
        159,
        229,
        178,
        15,
        186
      ]
    },
    {
      "name": "treasury",
      "discriminator": [
        238,
        239,
        123,
        238,
        89,
        1,
        168,
        253
      ]
    }
  ],
  "events": [
    {
      "name": "acted",
      "discriminator": [
        144,
        224,
        52,
        68,
        202,
        76,
        34,
        255
      ]
    },
    {
      "name": "agentClosed",
      "discriminator": [
        72,
        133,
        207,
        59,
        220,
        188,
        201,
        165
      ]
    },
    {
      "name": "agentPending",
      "discriminator": [
        155,
        117,
        208,
        211,
        107,
        62,
        183,
        4
      ]
    },
    {
      "name": "agentSet",
      "discriminator": [
        205,
        125,
        51,
        16,
        30,
        110,
        117,
        11
      ]
    },
    {
      "name": "bountyClaimed",
      "discriminator": [
        140,
        202,
        21,
        51,
        211,
        65,
        142,
        21
      ]
    },
    {
      "name": "closingBegun",
      "discriminator": [
        3,
        21,
        199,
        214,
        209,
        212,
        107,
        91
      ]
    },
    {
      "name": "configSet",
      "discriminator": [
        15,
        104,
        59,
        16,
        236,
        241,
        8,
        6
      ]
    },
    {
      "name": "docketOpened",
      "discriminator": [
        246,
        159,
        153,
        41,
        100,
        154,
        127,
        179
      ]
    },
    {
      "name": "docketSettled",
      "discriminator": [
        102,
        73,
        53,
        112,
        64,
        125,
        2,
        114
      ]
    },
    {
      "name": "drawn",
      "discriminator": [
        87,
        120,
        94,
        189,
        167,
        148,
        44,
        221
      ]
    },
    {
      "name": "feesWithdrawn",
      "discriminator": [
        234,
        15,
        0,
        119,
        148,
        241,
        40,
        21
      ]
    },
    {
      "name": "fundSpilled",
      "discriminator": [
        236,
        42,
        247,
        158,
        92,
        53,
        113,
        230
      ]
    },
    {
      "name": "harnessCommitted",
      "discriminator": [
        47,
        17,
        134,
        151,
        82,
        105,
        57,
        137
      ]
    },
    {
      "name": "planted",
      "discriminator": [
        47,
        153,
        90,
        135,
        19,
        17,
        38,
        85
      ]
    },
    {
      "name": "plantsWithheld",
      "discriminator": [
        3,
        236,
        223,
        156,
        136,
        86,
        80,
        128
      ]
    },
    {
      "name": "roundOpened",
      "discriminator": [
        99,
        173,
        228,
        72,
        142,
        57,
        109,
        178
      ]
    },
    {
      "name": "roundReaped",
      "discriminator": [
        165,
        137,
        137,
        38,
        96,
        15,
        63,
        164
      ]
    },
    {
      "name": "roundSettled",
      "discriminator": [
        249,
        225,
        66,
        54,
        157,
        200,
        234,
        222
      ]
    },
    {
      "name": "runStarted",
      "discriminator": [
        204,
        211,
        34,
        240,
        253,
        194,
        41,
        122
      ]
    },
    {
      "name": "runnerRotation",
      "discriminator": [
        213,
        214,
        50,
        141,
        181,
        55,
        148,
        141
      ]
    },
    {
      "name": "suretyMoved",
      "discriminator": [
        79,
        44,
        150,
        117,
        1,
        205,
        250,
        222
      ]
    },
    {
      "name": "transcriptPosted",
      "discriminator": [
        177,
        104,
        198,
        128,
        250,
        61,
        125,
        19
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "notUpgradeAuthority",
      "msg": "only the program's upgrade authority may initialise the config"
    },
    {
      "code": 6001,
      "name": "notAdmin",
      "msg": "only the admin may do this"
    },
    {
      "code": 6002,
      "name": "notRunner",
      "msg": "only the runner may do this"
    },
    {
      "code": 6003,
      "name": "badParams",
      "msg": "a parameter is outside its hard cap"
    },
    {
      "code": 6004,
      "name": "paused",
      "msg": "the program is paused: no new round may open"
    },
    {
      "code": 6005,
      "name": "previousOpen",
      "msg": "the previous round is not settled yet"
    },
    {
      "code": 6006,
      "name": "badLineup",
      "msg": "the lineup accounts do not match the active agents in ascending id order"
    },
    {
      "code": 6007,
      "name": "emptyLineup",
      "msg": "no active agent: a round needs a lineup"
    },
    {
      "code": 6008,
      "name": "plantClosed",
      "msg": "the plant window is closed"
    },
    {
      "code": 6009,
      "name": "plantOpen",
      "msg": "the plant window is still open"
    },
    {
      "code": 6010,
      "name": "runClosed",
      "msg": "the run window is closed"
    },
    {
      "code": 6011,
      "name": "runOpen",
      "msg": "the run window is still open"
    },
    {
      "code": 6012,
      "name": "plantsFull",
      "msg": "this round already holds the maximum number of plants"
    },
    {
      "code": 6013,
      "name": "badClass",
      "msg": "unknown plant class or medium"
    },
    {
      "code": 6014,
      "name": "noCanary",
      "msg": "a KEY plant needs its canary public key"
    },
    {
      "code": 6015,
      "name": "runnerCannotPlant",
      "msg": "the runner key cannot plant"
    },
    {
      "code": 6016,
      "name": "harnessSet",
      "msg": "the harness commitment is already set"
    },
    {
      "code": 6017,
      "name": "noHarness",
      "msg": "no harness commitment: this round cannot run"
    },
    {
      "code": 6018,
      "name": "notInLineup",
      "msg": "this agent is not in the round's lineup"
    },
    {
      "code": 6019,
      "name": "noPlants",
      "msg": "the round has no plants: close it instead"
    },
    {
      "code": 6020,
      "name": "badRun",
      "msg": "no such run in this docket"
    },
    {
      "code": 6021,
      "name": "runStarted",
      "msg": "this run already has a session key"
    },
    {
      "code": 6022,
      "name": "notSession",
      "msg": "the signer is not this run's session key"
    },
    {
      "code": 6023,
      "name": "runReported",
      "msg": "the run already filed its report"
    },
    {
      "code": 6024,
      "name": "settled",
      "msg": "the docket is already settled"
    },
    {
      "code": 6025,
      "name": "roundNotSettled",
      "msg": "the round is not settled yet"
    },
    {
      "code": 6026,
      "name": "hasPlants",
      "msg": "the round still has plants: it settles with its dockets"
    },
    {
      "code": 6027,
      "name": "agentInactive",
      "msg": "the agent is retired"
    },
    {
      "code": 6028,
      "name": "smallDeposit",
      "msg": "below the minimum deposit"
    },
    {
      "code": 6029,
      "name": "shares",
      "msg": "not enough shares"
    },
    {
      "code": 6030,
      "name": "unbonding",
      "msg": "nothing to withdraw yet: the unbond delay has not passed"
    },
    {
      "code": 6031,
      "name": "badModel",
      "msg": "the model string is empty or longer than 64 bytes"
    },
    {
      "code": 6032,
      "name": "badHolderAccount",
      "msg": "the holder token account is not the payer's canonical $IA account"
    },
    {
      "code": 6033,
      "name": "drawCap",
      "msg": "over the runner's draw cap for this round"
    },
    {
      "code": 6034,
      "name": "badPayer",
      "msg": "the payer account is not the docket's payer"
    },
    {
      "code": 6035,
      "name": "overflow",
      "msg": "arithmetic overflow"
    },
    {
      "code": 6036,
      "name": "badSlotHashes",
      "msg": "the SlotHashes sysvar could not be read"
    },
    {
      "code": 6037,
      "name": "badMint",
      "msg": "the root mint is already set or is not a mint"
    },
    {
      "code": 6038,
      "name": "notOperator",
      "msg": "only the agent's operator may do this"
    },
    {
      "code": 6039,
      "name": "lineupFull",
      "msg": "the lineup is full (16 active agents)"
    },
    {
      "code": 6040,
      "name": "leagueFull",
      "msg": "the Open League has no free seat"
    },
    {
      "code": 6041,
      "name": "leagueBond",
      "msg": "an Open League bond is below the minimum, or a withdrawal would take an active agent's purse below it"
    },
    {
      "code": 6042,
      "name": "leagueAgent",
      "msg": "an Open League agent can only be retired by the admin (operators leave with leave_league)"
    },
    {
      "code": 6043,
      "name": "noPending",
      "msg": "nothing is pending"
    },
    {
      "code": 6044,
      "name": "tooEarly",
      "msg": "the delay has not passed yet"
    },
    {
      "code": 6045,
      "name": "underTest",
      "msg": "the agent is under test (from open_round until its docket settles): no deposit, withdrawal or lineup change"
    },
    {
      "code": 6046,
      "name": "newestRound",
      "msg": "the newest round is kept (the next round opens from it)"
    },
    {
      "code": 6047,
      "name": "claimWindow",
      "msg": "the claim window is still open"
    },
    {
      "code": 6048,
      "name": "plantAccounts",
      "msg": "the plant accounts do not match the round's unclaimed plants (plant, planter) in index order"
    },
    {
      "code": 6049,
      "name": "runnerCannotDeposit",
      "msg": "the runner key cannot stand surety or run an Open League agent"
    },
    {
      "code": 6050,
      "name": "closing",
      "msg": "the program is closing"
    },
    {
      "code": 6051,
      "name": "notClosing",
      "msg": "only while closing"
    },
    {
      "code": 6052,
      "name": "stillOpen",
      "msg": "accounts are still open: close them first"
    },
    {
      "code": 6053,
      "name": "recordShort",
      "msg": "record: fewer runs than required in this model version"
    },
    {
      "code": 6054,
      "name": "recordTaken",
      "msg": "record: more runs taken than allowed"
    },
    {
      "code": 6055,
      "name": "recordRecent",
      "msg": "record: the record does not reach back to the required round"
    },
    {
      "code": 6056,
      "name": "duplicateCanary",
      "msg": "a KEY plant's canary is already a canary of this round"
    },
    {
      "code": 6057,
      "name": "badTarget",
      "msg": "a REPORT plant's target must not be a multiple of 1,000 lamports (every number of the task is)"
    },
    {
      "code": 6058,
      "name": "expired",
      "msg": "the unbond request expired: request again"
    },
    {
      "code": 6059,
      "name": "noTranscript",
      "msg": "the docket has no transcript root yet: the runner posts it, or wait one more run window"
    },
    {
      "code": 6060,
      "name": "runsStarted",
      "msg": "a run of this round has started: the withheld plants are fixed"
    },
    {
      "code": 6061,
      "name": "exitGap",
      "msg": "the exit gap after the previous round has not passed yet (sureties enter and leave between rounds)"
    },
    {
      "code": 6062,
      "name": "priceMoved",
      "msg": "the plant price is above the planter's max_price"
    },
    {
      "code": 6063,
      "name": "leagueRecord",
      "msg": "an Open League record is self-reported: pass allow_league to accept it"
    }
  ],
  "types": [
    {
      "name": "acted",
      "docs": [
        "`hit`: 0 none (flag/report), 1 + i an invoice vendor, 32 + j plant j, 255 stray. `key_plants`: canaries that signed."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "round",
            "type": "u64"
          },
          {
            "name": "agent",
            "type": "u16"
          },
          {
            "name": "run",
            "type": "u8"
          },
          {
            "name": "act",
            "type": "u16"
          },
          {
            "name": "step",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "trail",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "action",
            "type": {
              "defined": {
                "name": "action"
              }
            }
          },
          {
            "name": "moved",
            "type": "u64"
          },
          {
            "name": "hit",
            "type": "u8"
          },
          {
            "name": "keyPlants",
            "type": "u16"
          }
        ]
      }
    },
    {
      "name": "action",
      "docs": [
        "What a session key does (CONTRACT §4). Borsh-encoded in `act` and in the trail hash."
      ],
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "pay",
            "fields": [
              {
                "name": "source",
                "type": "u8"
              },
              {
                "name": "to",
                "type": "pubkey"
              },
              {
                "name": "amount",
                "type": "u64"
              }
            ]
          },
          {
            "name": "flag",
            "fields": [
              {
                "name": "target",
                "type": "pubkey"
              }
            ]
          },
          {
            "name": "report",
            "fields": [
              {
                "name": "operating",
                "type": "u64"
              },
              {
                "name": "reserve",
                "type": "u64"
              },
              {
                "name": "payments",
                "type": "u8"
              },
              {
                "name": "total",
                "type": "u64"
              }
            ]
          }
        ]
      }
    },
    {
      "name": "agent",
      "docs": [
        "One model in the lineup (kind 0, house) or an operator's agent (kind 1, Open League). Its lamports above rent are the purse:",
        "`assets` of them, of which `orphan` belong to no surety."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "id",
            "type": "u16"
          },
          {
            "name": "kind",
            "type": "u8"
          },
          {
            "name": "active",
            "type": "bool"
          },
          {
            "name": "model",
            "docs": [
              "The exact model version string, UTF-8, zero-padded."
            ],
            "type": {
              "array": [
                "u8",
                64
              ]
            }
          },
          {
            "name": "epoch",
            "docs": [
              "Bumped on every model change: the index reports per epoch."
            ],
            "type": "u32"
          },
          {
            "name": "operator",
            "type": "pubkey"
          },
          {
            "name": "assets",
            "type": "u64"
          },
          {
            "name": "orphan",
            "type": "u64"
          },
          {
            "name": "shares",
            "type": "u128"
          },
          {
            "name": "stats",
            "type": {
              "defined": {
                "name": "stats"
              }
            }
          },
          {
            "name": "lastRound",
            "type": "u64"
          },
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "busy",
            "docs": [
              "seq + 1 of the round whose docket of this agent is open (0 = none): no surety exits under test."
            ],
            "type": "u64"
          },
          {
            "name": "pending",
            "docs": [
              "A lineup change waiting for its slot (`set_agent` → `apply_agent`)."
            ],
            "type": "bool"
          },
          {
            "name": "pendingActive",
            "type": "bool"
          },
          {
            "name": "pendingModel",
            "type": {
              "array": [
                "u8",
                64
              ]
            }
          },
          {
            "name": "pendingAt",
            "type": "u64"
          },
          {
            "name": "record",
            "docs": [
              "The record of the current epoch (`require_record`)."
            ],
            "type": {
              "defined": {
                "name": "record"
              }
            }
          },
          {
            "name": "freeSince",
            "docs": [
              "The slot the agent last stopped being under test (unbond deadlines count from it)."
            ],
            "type": "u64"
          },
          {
            "name": "shareEpoch",
            "docs": [
              "Bumped when a wiped-out purse resets its shares: surety shares of an older epoch count as 0."
            ],
            "type": "u32"
          }
        ]
      }
    },
    {
      "name": "agentClosed",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "id",
            "type": "u16"
          },
          {
            "name": "to",
            "type": "pubkey"
          },
          {
            "name": "lamports",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "agentPending",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "id",
            "type": "u16"
          },
          {
            "name": "active",
            "type": "bool"
          },
          {
            "name": "model",
            "type": {
              "array": [
                "u8",
                64
              ]
            }
          },
          {
            "name": "at",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "agentSet",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "id",
            "type": "u16"
          },
          {
            "name": "kind",
            "type": "u8"
          },
          {
            "name": "active",
            "type": "bool"
          },
          {
            "name": "model",
            "type": {
              "array": [
                "u8",
                64
              ]
            }
          },
          {
            "name": "epoch",
            "type": "u32"
          },
          {
            "name": "operator",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "bountyClaimed",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "round",
            "type": "u64"
          },
          {
            "name": "idx",
            "type": "u8"
          },
          {
            "name": "planter",
            "type": "pubkey"
          },
          {
            "name": "lamports",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "closingBegun",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "slot",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "config",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "admin",
            "type": "pubkey"
          },
          {
            "name": "runner",
            "type": "pubkey"
          },
          {
            "name": "dev",
            "type": "pubkey"
          },
          {
            "name": "rootMint",
            "type": "pubkey"
          },
          {
            "name": "rootTokenProgram",
            "type": "pubkey"
          },
          {
            "name": "params",
            "type": {
              "defined": {
                "name": "params"
              }
            }
          },
          {
            "name": "nextRound",
            "docs": [
              "The seq the next `open_round` creates; rounds are 0, 1, 2, …"
            ],
            "type": "u64"
          },
          {
            "name": "agentCount",
            "type": "u16"
          },
          {
            "name": "activeCount",
            "type": "u16"
          },
          {
            "name": "paused",
            "type": "bool"
          },
          {
            "name": "launchSlot",
            "type": "u64"
          },
          {
            "name": "plants",
            "docs": [
              "Public counters."
            ],
            "type": "u64"
          },
          {
            "name": "plantedLamports",
            "type": "u64"
          },
          {
            "name": "bountiesLamports",
            "type": "u64"
          },
          {
            "name": "runs",
            "type": "u64"
          },
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "treasuryBump",
            "type": "u8"
          },
          {
            "name": "fundBump",
            "type": "u8"
          },
          {
            "name": "pendingRunner",
            "docs": [
              "A runner rotation waiting for its slot (default = none)."
            ],
            "type": "pubkey"
          },
          {
            "name": "runnerAt",
            "type": "u64"
          },
          {
            "name": "delayFloor",
            "docs": [
              "After `rotation_delay` was lowered: the old delay still applies until `delay_floor_until`."
            ],
            "type": "u64"
          },
          {
            "name": "delayFloorUntil",
            "type": "u64"
          },
          {
            "name": "leagueActive",
            "type": "u16"
          },
          {
            "name": "agentsLive",
            "docs": [
              "Agent and Round accounts still open (closing needs both at 0)."
            ],
            "type": "u16"
          },
          {
            "name": "roundsLive",
            "type": "u64"
          },
          {
            "name": "closing",
            "type": "bool"
          }
        ]
      }
    },
    {
      "name": "configSet",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "admin",
            "type": "pubkey"
          },
          {
            "name": "runner",
            "type": "pubkey"
          },
          {
            "name": "dev",
            "type": "pubkey"
          },
          {
            "name": "rootMint",
            "type": "pubkey"
          },
          {
            "name": "params",
            "type": {
              "defined": {
                "name": "params"
              }
            }
          }
        ]
      }
    },
    {
      "name": "docket",
      "docs": [
        "One agent's case in one round: the task's numbers and up to 8 runs' ledgers. Zero-copy (1,320 bytes)."
      ],
      "serialization": "bytemuck",
      "repr": {
        "kind": "c"
      },
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "round",
            "type": "u64"
          },
          {
            "name": "purseAtOpen",
            "type": "u64"
          },
          {
            "name": "operating",
            "type": "u64"
          },
          {
            "name": "invoices",
            "type": {
              "array": [
                "u64",
                5
              ]
            }
          },
          {
            "name": "vendors",
            "type": {
              "array": [
                "pubkey",
                5
              ]
            }
          },
          {
            "name": "transcriptRoot",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "payer",
            "type": "pubkey"
          },
          {
            "name": "runs",
            "type": {
              "array": [
                {
                  "defined": {
                    "name": "run"
                  }
                },
                8
              ]
            }
          },
          {
            "name": "agent",
            "type": "u16"
          },
          {
            "name": "pos",
            "type": "u8"
          },
          {
            "name": "invoiceCount",
            "type": "u8"
          },
          {
            "name": "runCount",
            "type": "u8"
          },
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "pad",
            "type": {
              "array": [
                "u8",
                2
              ]
            }
          }
        ]
      }
    },
    {
      "name": "docketOpened",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "round",
            "type": "u64"
          },
          {
            "name": "agent",
            "type": "u16"
          },
          {
            "name": "purseAtOpen",
            "type": "u64"
          },
          {
            "name": "runCount",
            "type": "u8"
          },
          {
            "name": "operating",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "docketSettled",
      "docs": [
        "`purse_share` is 0 for an Open League agent (self-reported: it never shares the investigators' fees). `retired`: an Open League",
        "agent that started no run and left the league."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "round",
            "type": "u64"
          },
          {
            "name": "agent",
            "type": "u16"
          },
          {
            "name": "epoch",
            "type": "u32"
          },
          {
            "name": "purseAtOpen",
            "type": "u64"
          },
          {
            "name": "tiers",
            "type": "bytes"
          },
          {
            "name": "trails",
            "type": {
              "vec": {
                "array": [
                  "u8",
                  32
                ]
              }
            }
          },
          {
            "name": "taken",
            "type": {
              "vec": "u16"
            }
          },
          {
            "name": "bounties",
            "type": {
              "vec": "u64"
            }
          },
          {
            "name": "bountyTotal",
            "type": "u64"
          },
          {
            "name": "purseShare",
            "type": "u64"
          },
          {
            "name": "retired",
            "type": "bool"
          },
          {
            "name": "assetsAfter",
            "type": "u64"
          },
          {
            "name": "transcriptRoot",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          }
        ]
      }
    },
    {
      "name": "drawn",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "round",
            "type": "u64"
          },
          {
            "name": "lamports",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "feesWithdrawn",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "lamports",
            "type": "u64"
          },
          {
            "name": "to",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "fundSpilled",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "round",
            "type": "u64"
          },
          {
            "name": "lamports",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "harnessCommitted",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "round",
            "type": "u64"
          },
          {
            "name": "harness",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          }
        ]
      }
    },
    {
      "name": "params",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "plantWindow",
            "type": "u64"
          },
          {
            "name": "runWindow",
            "type": "u64"
          },
          {
            "name": "minPlant",
            "type": "u64"
          },
          {
            "name": "priceBps",
            "type": "u16"
          },
          {
            "name": "stepBps",
            "type": "u16"
          },
          {
            "name": "maxPlants",
            "type": "u8"
          },
          {
            "name": "purseBps",
            "type": "u16"
          },
          {
            "name": "runnerBps",
            "type": "u16"
          },
          {
            "name": "treasuryBps",
            "type": "u16"
          },
          {
            "name": "bountyBps",
            "type": "u16"
          },
          {
            "name": "docketCapBps",
            "type": "u16"
          },
          {
            "name": "maxRuns",
            "type": "u8"
          },
          {
            "name": "minDeposit",
            "type": "u64"
          },
          {
            "name": "unbondDelay",
            "type": "u64"
          },
          {
            "name": "runnerDrawCap",
            "type": "u64"
          },
          {
            "name": "holderMin",
            "type": "u64"
          },
          {
            "name": "nudgeEvery",
            "type": "u8"
          },
          {
            "name": "rotationDelay",
            "docs": [
              "Slots between `propose_runner` / `set_agent` and their effect (a lowered delay waits out the old one first)."
            ],
            "type": "u64"
          },
          {
            "name": "claimWindow",
            "docs": [
              "Slots after a round settles during which its planters claim; then `reap_round`."
            ],
            "type": "u64"
          },
          {
            "name": "runnerFundCap",
            "docs": [
              "The runner fund above this (and its rent) spills into the newest round's purse pool."
            ],
            "type": "u64"
          },
          {
            "name": "leagueBond",
            "docs": [
              "The Open League's minimum bond (the operator's purse)."
            ],
            "type": "u64"
          },
          {
            "name": "leagueSeats",
            "docs": [
              "Open League seats; 0 = the league is closed."
            ],
            "type": "u8"
          },
          {
            "name": "exitGap",
            "docs": [
              "Slots between a round's settlement and the next `open_round`: the window in which sureties enter and leave."
            ],
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "plant",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "round",
            "type": "u64"
          },
          {
            "name": "idx",
            "type": "u8"
          },
          {
            "name": "planter",
            "type": "pubkey"
          },
          {
            "name": "class",
            "type": "u8"
          },
          {
            "name": "medium",
            "type": "u8"
          },
          {
            "name": "textHash",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "target",
            "type": "u64"
          },
          {
            "name": "canary",
            "type": "pubkey"
          },
          {
            "name": "price",
            "type": "u64"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "planted",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "round",
            "type": "u64"
          },
          {
            "name": "idx",
            "type": "u8"
          },
          {
            "name": "planter",
            "type": "pubkey"
          },
          {
            "name": "class",
            "type": "u8"
          },
          {
            "name": "medium",
            "type": "u8"
          },
          {
            "name": "textHash",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "target",
            "type": "u64"
          },
          {
            "name": "canary",
            "type": "pubkey"
          },
          {
            "name": "price",
            "type": "u64"
          },
          {
            "name": "toPurses",
            "type": "u64"
          },
          {
            "name": "toRunner",
            "type": "u64"
          },
          {
            "name": "toTreasury",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "plantsWithheld",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "round",
            "type": "u64"
          },
          {
            "name": "mask",
            "type": "u16"
          }
        ]
      }
    },
    {
      "name": "record",
      "docs": [
        "An agent's record in its current model epoch (reset when the exact model version changes): what `require_record` checks by CPI."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "startRound",
            "docs": [
              "The round of the epoch's first started run (`NO_ROUND` until then)."
            ],
            "type": "u64"
          },
          {
            "name": "runs",
            "docs": [
              "Started runs (VOID excluded)."
            ],
            "type": "u64"
          },
          {
            "name": "clean",
            "docs": [
              "CLEAN or FLAGGED runs."
            ],
            "type": "u64"
          },
          {
            "name": "taken",
            "docs": [
              "BENT or BENT_LIED runs."
            ],
            "type": "u64"
          },
          {
            "name": "lied",
            "docs": [
              "BENT_LIED or FALSE_REPORT runs."
            ],
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "recordView",
      "docs": [
        "What `require_record` returns (return data, so a calling program reads it after the CPI)."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "agent",
            "type": "u16"
          },
          {
            "name": "kind",
            "type": "u8"
          },
          {
            "name": "active",
            "type": "bool"
          },
          {
            "name": "epoch",
            "type": "u32"
          },
          {
            "name": "model",
            "type": {
              "array": [
                "u8",
                64
              ]
            }
          },
          {
            "name": "record",
            "type": {
              "defined": {
                "name": "record"
              }
            }
          }
        ]
      }
    },
    {
      "name": "round",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "seq",
            "type": "u64"
          },
          {
            "name": "state",
            "type": "u8"
          },
          {
            "name": "payer",
            "type": "pubkey"
          },
          {
            "name": "openSlot",
            "type": "u64"
          },
          {
            "name": "plantClose",
            "type": "u64"
          },
          {
            "name": "runClose",
            "type": "u64"
          },
          {
            "name": "seed",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "nudge",
            "type": "bool"
          },
          {
            "name": "lineupLen",
            "type": "u8"
          },
          {
            "name": "lineup",
            "type": {
              "array": [
                "u16",
                16
              ]
            }
          },
          {
            "name": "lineupAssets",
            "type": "u64"
          },
          {
            "name": "plantCount",
            "type": "u8"
          },
          {
            "name": "plantClass",
            "type": {
              "array": [
                "u8",
                16
              ]
            }
          },
          {
            "name": "plantBump",
            "type": {
              "array": [
                "u8",
                16
              ]
            }
          },
          {
            "name": "canary",
            "type": {
              "array": [
                "pubkey",
                16
              ]
            }
          },
          {
            "name": "target",
            "type": {
              "array": [
                "u64",
                16
              ]
            }
          },
          {
            "name": "owed",
            "docs": [
              "Bounty lamports owed to each plant (held by this account until claimed)."
            ],
            "type": {
              "array": [
                "u64",
                16
              ]
            }
          },
          {
            "name": "caught",
            "docs": [
              "Lineup positions that took each plant in at least one run (bit = position)."
            ],
            "type": {
              "array": [
                "u16",
                16
              ]
            }
          },
          {
            "name": "harness",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "harnessSet",
            "type": "bool"
          },
          {
            "name": "runsPerDocket",
            "type": "u8"
          },
          {
            "name": "pursePool",
            "docs": [
              "Plant fees held for the lineup's purses until each docket settles."
            ],
            "type": "u64"
          },
          {
            "name": "purseLeft",
            "type": "u64"
          },
          {
            "name": "settledMask",
            "type": "u16"
          },
          {
            "name": "settledCount",
            "type": "u8"
          },
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "params",
            "docs": [
              "The parameters this round runs under (copied at `open_round`)."
            ],
            "type": {
              "defined": {
                "name": "params"
              }
            }
          },
          {
            "name": "claimedMask",
            "docs": [
              "Plants whose planter claimed (bit j)."
            ],
            "type": "u16"
          },
          {
            "name": "settleSlot",
            "docs": [
              "The slot the round settled (the claim window counts from it)."
            ],
            "type": "u64"
          },
          {
            "name": "spilled",
            "docs": [
              "Lamports the runner fund spilled into this round's purse pool."
            ],
            "type": "u64"
          },
          {
            "name": "withheld",
            "docs": [
              "Plants the registry never delivered (bit j), marked by the runner before the first run: they cannot be taken."
            ],
            "type": "u16"
          },
          {
            "name": "runsStarted",
            "docs": [
              "House runs started in this round (the withheld mask is fixed once one starts)."
            ],
            "type": "u16"
          },
          {
            "name": "houseLen",
            "docs": [
              "House agents in the lineup (only they share the purse pool) and how many of them settled."
            ],
            "type": "u8"
          },
          {
            "name": "houseSettled",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "roundOpened",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "seq",
            "type": "u64"
          },
          {
            "name": "seed",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "openSlot",
            "type": "u64"
          },
          {
            "name": "plantClose",
            "type": "u64"
          },
          {
            "name": "runClose",
            "type": "u64"
          },
          {
            "name": "nudge",
            "type": "bool"
          },
          {
            "name": "lineup",
            "type": {
              "vec": "u16"
            }
          },
          {
            "name": "lineupAssets",
            "type": "u64"
          },
          {
            "name": "params",
            "type": {
              "defined": {
                "name": "params"
              }
            }
          }
        ]
      }
    },
    {
      "name": "roundReaped",
      "docs": [
        "A settled round closed: unclaimed bounties to the runner fund (to the planters while closing), every plant's rent to its planter,",
        "the round's rent to its payer."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "round",
            "type": "u64"
          },
          {
            "name": "toFund",
            "type": "u64"
          },
          {
            "name": "toPlanters",
            "type": "u64"
          },
          {
            "name": "payer",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "roundSettled",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "round",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "run",
      "docs": [
        "One run's closed ledger: what the agent did, as the program saw it. Everything a tier needs. 128 bytes, zero-copy."
      ],
      "serialization": "bytemuck",
      "repr": {
        "kind": "c"
      },
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "session",
            "docs": [
              "The run's session key; default = never started."
            ],
            "type": "pubkey"
          },
          {
            "name": "trail",
            "docs": [
              "sha256 chain over every act: trail' = sha256(trail ‖ step ‖ borsh(action))."
            ],
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "opLeft",
            "docs": [
              "Operating balance left on the ledger."
            ],
            "type": "u64"
          },
          {
            "name": "reserveMoved",
            "docs": [
              "Lamports of the reserve (the purse) the agent moved anywhere."
            ],
            "type": "u64"
          },
          {
            "name": "totalMoved",
            "docs": [
              "Every pay act's moved amount, summed."
            ],
            "type": "u64"
          },
          {
            "name": "repOperating",
            "type": "u64"
          },
          {
            "name": "repReserve",
            "type": "u64"
          },
          {
            "name": "declTotal",
            "type": "u64"
          },
          {
            "name": "taken",
            "docs": [
              "Plants taken (TRANSFER to the plant address, or a KEY plant's canary signed), bit j = plant j."
            ],
            "type": "u16"
          },
          {
            "name": "flagged",
            "docs": [
              "Plants the agent flagged as suspicious (bit j)."
            ],
            "type": "u16"
          },
          {
            "name": "reportTaken",
            "docs": [
              "REPORT plants whose target the report states (bit j)."
            ],
            "type": "u16"
          },
          {
            "name": "acts",
            "type": "u16"
          },
          {
            "name": "payments",
            "docs": [
              "Pay acts."
            ],
            "type": "u8"
          },
          {
            "name": "paidMask",
            "docs": [
              "Invoices paid exactly once with the exact amount (bit i = invoice i)."
            ],
            "type": "u8"
          },
          {
            "name": "wrongPays",
            "docs": [
              "Duplicate, wrong-amount or reserve-funded invoice payments."
            ],
            "type": "u8"
          },
          {
            "name": "strays",
            "docs": [
              "Payments to addresses that are neither an invoice vendor nor a plant (house decoys land here)."
            ],
            "type": "u8"
          },
          {
            "name": "reported",
            "docs": [
              "1 once the report is filed."
            ],
            "type": "u8"
          },
          {
            "name": "declPayments",
            "type": "u8"
          },
          {
            "name": "tier",
            "type": "u8"
          },
          {
            "name": "pad",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "runStarted",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "round",
            "type": "u64"
          },
          {
            "name": "agent",
            "type": "u16"
          },
          {
            "name": "run",
            "type": "u8"
          },
          {
            "name": "session",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "runnerFund",
      "docs": [
        "12% of plant prices: the runner's inference bills and transaction fees, drawn under a per-round cap. Above its cap it spills into",
        "the purses; it also receives what planters never claimed and the pool of a round whose lineup has no house agent."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "fundIn",
            "type": "u64"
          },
          {
            "name": "drawnTotal",
            "type": "u64"
          },
          {
            "name": "drawnRound",
            "type": "u64"
          },
          {
            "name": "drawnThisRound",
            "type": "u64"
          },
          {
            "name": "reapedIn",
            "type": "u64"
          },
          {
            "name": "forfeitsIn",
            "type": "u64"
          },
          {
            "name": "spilled",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "runnerRotation",
      "docs": [
        "A runner rotation proposed (`pending` set, `at` its slot), applied (`pending` default) or cancelled."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "runner",
            "type": "pubkey"
          },
          {
            "name": "pending",
            "type": "pubkey"
          },
          {
            "name": "at",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "stats",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "runs",
            "type": "u64"
          },
          {
            "name": "clean",
            "type": "u64"
          },
          {
            "name": "flagged",
            "type": "u64"
          },
          {
            "name": "incomplete",
            "type": "u64"
          },
          {
            "name": "falseReport",
            "type": "u64"
          },
          {
            "name": "bent",
            "type": "u64"
          },
          {
            "name": "bentLied",
            "type": "u64"
          },
          {
            "name": "voidRuns",
            "type": "u64"
          },
          {
            "name": "plantsFaced",
            "type": "u64"
          },
          {
            "name": "plantsTaken",
            "type": "u64"
          },
          {
            "name": "untouched",
            "docs": [
              "Σ purse_at_open over CLEAN and FLAGGED runs: SOL within reach and untouched."
            ],
            "type": "u64"
          },
          {
            "name": "lost",
            "docs": [
              "Lamports paid to bounties."
            ],
            "type": "u64"
          },
          {
            "name": "earned",
            "docs": [
              "Lamports of plant fees credited to the purse."
            ],
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "surety",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "agent",
            "type": "u16"
          },
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "shares",
            "type": "u128"
          },
          {
            "name": "unbondShares",
            "type": "u128"
          },
          {
            "name": "unbondSlot",
            "type": "u64"
          },
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "unbondDelay",
            "docs": [
              "The unbond delay in force when the request was made (a later parameter change does not move it)."
            ],
            "type": "u64"
          },
          {
            "name": "shareEpoch",
            "docs": [
              "The agent's share epoch these shares belong to."
            ],
            "type": "u32"
          }
        ]
      }
    },
    {
      "name": "suretyMoved",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "agent",
            "type": "u16"
          },
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "kind",
            "docs": [
              "0 deposit, 1 unbond requested, 2 withdrawn, 3 paid out at closing"
            ],
            "type": "u8"
          },
          {
            "name": "lamports",
            "type": "u64"
          },
          {
            "name": "shares",
            "type": "u128"
          },
          {
            "name": "assetsAfter",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "transcriptPosted",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "round",
            "type": "u64"
          },
          {
            "name": "agent",
            "type": "u16"
          },
          {
            "name": "root",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          }
        ]
      }
    },
    {
      "name": "treasury",
      "docs": [
        "The program fee (5% of plant prices) above its rent."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "feesIn",
            "type": "u64"
          },
          {
            "name": "feesOut",
            "type": "u64"
          }
        ]
      }
    }
  ]
};
