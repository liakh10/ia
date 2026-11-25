#!/bin/zsh
# The runner's local chain (BUILD ports): RPC 54899 (ws 54900), faucet 55900, gossip 54000, dynamic 54100-54300. Loads a SNAPSHOT of the
# program build (test/.run/ia.so + ia.json, copied by e2e.sh) as an upgradeable program whose authority is test/.run/authority.json, so
# a rebuild by the program agent mid-run cannot change what the chain runs. Only the validator whose PID this script wrote, on this
# ledger, is ever stopped. Callers take the lock first (test/lock.sh). Machine rule: at most 3 validators (checked by lock.sh).
#   zsh test/chain.sh        start fresh
#   zsh test/chain.sh stop
set -e
here=${0:A:h}
run=$here/.run
base=54899; faucet=55900; gossip=54000
mkdir -p $run
led=${IA_RUNNER_LEDGER:-$run}
mkdir -p $led
pidfile=$run/validator.pid
busy() { { lsof -nP -iTCP:$base -iTCP:$((base+1)) -iTCP:$faucet -sTCP:LISTEN || lsof -nP -iUDP:$gossip; } >/dev/null 2>&1; }
halt() {
  [[ -f $pidfile ]] || return 0
  local pid=$(cat $pidfile)
  if ps -o args= -p $pid 2>/dev/null | grep -q -- "--ledger $led/ledger "; then
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
[[ -f $run/ia.so ]] || { echo "no snapshot $run/ia.so (e2e.sh copies it)"; exit 1; }
id=$(solana-keygen pubkey $here/../../program/target/deploy/ia-keypair.json)
args=(--reset --quiet --ledger $led/ledger --limit-ledger-size 20000000 --rpc-port $base --faucet-port $faucet --gossip-port $gossip
      --dynamic-port-range 54100-54300 --upgradeable-program $id $run/ia.so $run/authority.json)
nohup solana-test-validator $args > $run/validator.log 2>&1 &
echo $! > $pidfile
for i in {1..240}; do
  if solana -u http://127.0.0.1:$base cluster-version >/dev/null 2>&1; then echo "validator up on http://127.0.0.1:$base (pid $(cat $pidfile))"; exit 0; fi
  kill -0 $(cat $pidfile) 2>/dev/null || break
  sleep 1
done
rm -f $pidfile
echo "validator did not start"; tail -20 $run/validator.log; exit 1
