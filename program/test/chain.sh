#!/bin/zsh
# The suite's local chain: this build of `ia` loaded as an upgradeable program whose upgrade authority is test/.run/authority.json
# (so init_config's ProgramData check runs as on mainnet). Ports: RPC 52899 (ws 52900), faucet 53900, gossip 52000, dynamic 52100-52300.
# Only the validator whose PID this script wrote, on this ledger, is ever stopped. Callers take the lock first (lock.sh).
#   zsh test/chain.sh         start fresh (target/quick: window floors of 5 slots)
#   zsh test/chain.sh stop
# IA_CHAIN=site starts the launch rehearsal's chain instead: pump.fun cloned (test/prep.mjs saved it in .run/), no `ia` loaded (launch.mjs
# deploys the launch build through sol-ops, as on launch day). IA_TICKS sets ticks per slot (16: slots about 4x faster than mainnet's).
set -e
here=${0:A:h}
run=$here/.run
base=52899; faucet=53900; gossip=52000
mkdir -p $run
led=${IA_LEDGERS:-$run}
mkdir -p $led
sfx=${IA_CHAIN:+-$IA_CHAIN}
pidfile=$run/validator$sfx.pid
busy() { { lsof -nP -iTCP:$base -iTCP:$((base+1)) -iTCP:$faucet -sTCP:LISTEN || lsof -nP -iUDP:$gossip; } >/dev/null 2>&1; }
halt() {
  [[ -f $pidfile ]] || return 0
  local pid=$(cat $pidfile)
  if ps -o args= -p $pid 2>/dev/null | grep -q -- "--ledger $led/ledger$sfx "; then
    kill $pid 2>/dev/null || true
    for i in {1..40}; do kill -0 $pid 2>/dev/null || break; sleep 0.5; done
    kill -0 $pid 2>/dev/null && kill -9 $pid 2>/dev/null || true
  fi
  rm -f $pidfile
  for i in {1..60}; do busy || break; sleep 1; done
}
halt
[[ $1 == stop ]] && exit 0
if busy; then echo "ports $base, $((base+1)), $faucet, $gossip are in use by something else: not starting"; exit 1; fi
free=$(df -k / | awk 'NR==2{print $4}')
(( free >= 20000000 )) || { echo "under 20 GB free on the disk: not starting"; exit 1; }
[[ -f $run/authority.json ]] || solana-keygen new --no-bip39-passphrase -s -o $run/authority.json >/dev/null
args=(--reset --quiet --ledger $led/ledger$sfx --limit-ledger-size 20000000 --rpc-port $base --faucet-port $faucet --gossip-port $gossip
      --dynamic-port-range 52100-52300)
[[ -n $IA_TICKS ]] && args+=(--ticks-per-slot $IA_TICKS)
if [[ $IA_CHAIN == site ]]; then
  [[ -f $run/programs.txt ]] || { echo "no clones saved: run node test/prep.mjs first"; exit 1; }
  for p in $(cat $run/programs.txt); do [[ -s $run/programs/$p.so ]] && args+=(--upgradeable-program $p $run/programs/$p.so none); done
  for f in $run/accounts/*.json(N); do args+=(--account ${f:t:r} $f); done
else
  so=$here/../target/${IA_SO:-quick}/ia.so
  [[ -f $so ]] || { echo "no $so: run zsh test/build.sh"; exit 1; }
  id=$(solana-keygen pubkey $here/../target/deploy/ia-keypair.json)
  args+=(--upgradeable-program $id $so $run/authority.json)
fi
nohup solana-test-validator $args > $run/validator.log 2>&1 &
echo $! > $pidfile
for i in {1..240}; do
  if solana -u http://127.0.0.1:$base cluster-version >/dev/null 2>&1; then echo "validator up on http://127.0.0.1:$base (pid $(cat $pidfile))"; exit 0; fi
  kill -0 $(cat $pidfile) 2>/dev/null || break
  sleep 1
done
rm -f $pidfile
echo "validator did not start"; tail -20 $run/validator.log; exit 1
