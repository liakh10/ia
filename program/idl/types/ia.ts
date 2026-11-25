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
        "A house lineup agent with its exact model version string. Ids are 0, 1, 2, …"
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
      "name": "closeEmptyRound",
      "docs": [
        "Anyone: a round that drew no plant closes at the end of its plant window."
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
        "Stand surety: lamports into the agent's purse for shares of what sureties own of it."
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
        "The runner draws its bills from the fund, at most `runner_draw_cap` per round (counted against the newest round)."
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
      "name": "openDocket",
      "docs": [
        "Anyone, after the plant window, for a lineup agent of a round with plants: the docket with the task's numbers and the purse",
        "at this moment. The payer gets the rent back at settlement."
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
        "Anyone but the runner key, inside the plant window. The text itself goes to the plant registry; its sha256 is fixed here."
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
        }
      ]
    },
    {
      "name": "postTranscript",
      "docs": [
        "The runner may post the docket's transcript Merkle root (CONTRACT §6) any time before settlement."
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
      "name": "requestUnbond",
      "docs": [
        "Start the unbond clock for `shares` (replaces an earlier request). The shares keep earning and losing until withdrawn."
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
      "name": "setAgent",
      "docs": [
        "Retire or return an agent, or record a new exact model version (a new epoch). Takes effect from the next round's lineup."
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
        "The runner and dev keys (None leaves them), and the $IA mint once (pass its mint account)."
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
          "name": "runner",
          "type": {
            "option": "pubkey"
          }
        },
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
        "Anyone, after the run window: tiers, bounties (agent → round), the agent's share of the round's plant fees (round → agent),",
        "the stats; the docket closes to its payer."
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
        }
      ],
      "args": []
    },
    {
      "name": "startRun",
      "docs": [
        "The runner gives a run its session key (one per run, made fresh)."
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
          "name": "session",
          "type": "pubkey"
        }
      ]
    },
    {
      "name": "withdraw",
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
        "One model in the lineup (kind 0, house) or an operator's agent (kind 1, Open League, phase 1.5). Its lamports above rent are the",
        "purse: `assets` of them, of which `orphan` belong to no surety."
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
        "12% of plant prices: the runner's inference bills and transaction fees, drawn under a per-round cap."
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
              "0 deposit, 1 unbond requested, 2 withdrawn"
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
