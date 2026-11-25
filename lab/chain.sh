#!/bin/zsh
# The lab's own local chain: the quick build of `ia` (window floors of 5 slots) loaded as an upgradeable program whose upgrade
# authority is a throwaway key in the lab's state folder, so the lab can run init_config and every admin step itself.
# Ports (site range): RPC 62899 (ws 62900), faucet 63900, gossip 62000, dynamic 62100-62300. Only the validator whose PID this
# script wrote is ever stopped. Machine rule: at most 3 validators, so start waits while 3 run.
#   zsh lab/chain.sh          start fresh
#   zsh lab/chain.sh stop     stop it and delete its ledger
set -e
here=${0:A:h}
state=${IA_LAB_STATE:-$here/.run}
base=62899; faucet=63900; gossip=62000
mkdir -p $state
pidfile=$state/validator.pid
busy() { { lsof -nP -iTCP:$base -iTCP:$((base+1)) -iTCP:$faucet -sTCP:LISTEN || lsof -nP -iUDP:$gossip; } >/dev/null 2>&1; }
halt() {
  [[ -f $pidfile ]] || return 0
  local pid=$(cat $pidfile)
  if ps -o args= -p $pid 2>/dev/null | grep -q -- "--ledger $state/ledger "; then
    kill $pid 2>/dev/null || true
    for i in {1..40}; do kill -0 $pid 2>/dev/null || break; sleep 0.5; done
    kill -0 $pid 2>/dev/null && kill -9 $pid 2>/dev/null || true
  fi
  rm -f $pidfile
  for i in {1..60}; do busy || break; sleep 1; done
}
halt
if [[ $1 == stop ]]; then rm -rf $state/ledger; exit 0; fi
[[ -f /Users/artem/Desktop/sol/_x/ia/STOP ]] && { echo "STOP file present: not starting"; exit 1; }
if busy; then echo "ports $base, $((base+1)), $faucet, $gossip are in use by something else: not starting"; exit 1; fi
free=$(df -k / | awk 'NR==2{print $4}')
(( free >= 20000000 )) || { echo "under 20 GB free on the disk: not starting"; exit 1; }
n=0
while (( $(pgrep -x solana-test-validator | wc -l) >= 3 )); do
  (( n++ % 12 == 0 )) && echo "3 validators already run on this machine: waiting (checks every 5 s)"
  sleep 5
done
prog=$here/../program
so=$prog/target/${IA_SO:-quick}/ia.so
[[ -f $so ]] || { echo "no $so: run zsh program/test/build.sh"; exit 1; }
# a private copy, so a rebuild in program/ while the chain runs cannot change what was loaded
cp $so $state/ia.so
cp $prog/idl/ia.json $state/ia.json
[[ -f $state/authority.json ]] || solana-keygen new --no-bip39-passphrase -s -o $state/authority.json >/dev/null
id=$(solana-keygen pubkey $prog/target/deploy/ia-keypair.json)
# a fresh chain: what the lab knew about the last one goes with it
rm -rf $state/ledger $state/transcripts
rm -f $state/sealed.json $state/forecasts.json $state/index.json
args=(--reset --quiet --ledger $state/ledger --limit-ledger-size 20000000 --rpc-port $base --faucet-port $faucet --gossip-port $gossip
      --dynamic-port-range 62100-62300 --upgradeable-program $id $state/ia.so $state/authority.json)
nohup solana-test-validator $args > $state/validator.log 2>&1 &
echo $! > $pidfile
for i in {1..240}; do
  if solana -u http://127.0.0.1:$base cluster-version >/dev/null 2>&1; then echo "lab chain up on http://127.0.0.1:$base (pid $(cat $pidfile))"; exit 0; fi
  kill -0 $(cat $pidfile) 2>/dev/null || break
  sleep 1
done
rm -f $pidfile
echo "validator did not start"; tail -20 $state/validator.log; exit 1
