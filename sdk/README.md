# @ia/sdk

Read Internal Affairs straight from Solana, with no runtime dependencies (WebCrypto only; Node 20+ and modern browsers).

- **Pinned program id** `CAnntf6D3Ec3jZpzqSDmShvWbmvF6Dhk9rJYR1jxyVnr`: `IaClient` refuses another one unless you pass
  `allowOtherDeployment: true`, and `parseEvents` counts an event only while `ia` itself is the running program.
- **The rules, byte for byte with `program/programs/ia/src/rules.rs`**: `roundSeed`, `task`, `offChainTask`, `plantPrice`, `split`,
  `runsFor`, `tier`, `reportHits`, `bounties`, `sharesFor`, `lamportsFor`, `recordCheck`, `fundSurplus`. The tests check every entry of
  `program/test/vectors.json` and the runner's task generator.
- **Replay**: `new RunLedger(docketContext, session).act(action, step)` returns what the program computes for each act (`hit`, `moved`,
  `trail`) and `tier()` what settlement will write.
- **Accounts and events**: `pdas()`, `decodeAgent/Round/Plant/Docket/…`, `parseEvents(logs)`, all driven by the committed IDL.
- **Transactions**: `plantInstruction`, `depositInstruction`, `requestUnbondInstruction`, `withdrawInstruction`, `claimPlantInstruction`,
  `openRoundInstruction`, `openDocketInstruction`, `settleDocketInstruction`, `closeEmptyRoundInstruction`, `actInstruction`,
  `buildInstruction(name, args, accounts)`; `unsignedTransaction({feePayer, recentBlockhash, instructions})` for a wallet to sign;
  `toWeb3Instruction(ix, web3)`.
- **Evidence**: `canonicalJson` (RFC 8785), `stepHash`, `transcriptRoot`, `docketRoot`, RFC 9162 `merkleRoot` / `verifyInclusion` /
  `verifyConsistency`, `verifyTreeHead`, `verifyLogEntry`, `decodeLeaf`.
- **Statistics**: `wilson(k, n)` (95%), forecast messages, signatures and points.

```js
import { IaClient, task } from "@ia/sdk";
const ia = new IaClient({ rpc: "https://your-rpc" });
const round = await ia.getCurrentRound();
console.log(await task(round.seed), await ia.quotePlant());
```

`npm test` builds and runs the unit tests. `npm run sync-idl` copies `program/idl/ia.json` into `src/idl/ia.ts` after a program change.
The full guide: `docs-src/developers.md`.
