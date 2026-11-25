#!/bin/zsh
# devx's local chain: the quick build of `ia` (window floors of 5 slots) as an upgradeable program, on devx's ports (BUILD.md):
# RPC 58899 (ws 58900), faucet 59900, gossip 58000, dynamic 58100-58300. Machine rule: at most 3 validators; a lock directory keeps
# devx's ports to one user. Only the validator whose PID this script wrote, on this ledger, is ever stopped.
#   zsh chain.sh          take the lock, wait while 3 validators run, start fresh
#   zsh chain.sh stop     stop ours, drop the ledger and the lock
set -e
here=${0:A:h}
scratch=${IA_DEVX_SCRATCH:-/private/tmp/claude-501/-Users-artem-Desktop-sol/be802bf9-e299-4d83-b38b-bc795e5cbb1e/scratchpad/ia-devx}
run=$scratch/chain
lock=$scratch/validator.lock
base=58899; faucet=59900; gossip=58000
pidfile=$run/validator.pid
mkdir -p $run
busy() { { lsof -nP -iTCP:$base -iTCP:$((base+1)) -iTCP:$faucet -sTCP:LISTEN || lsof -nP -iUDP:$gossip; } >/dev/null 2>&1; }
halt() {
  [[ -f $pidfile ]] || return 0
  local pid=$(cat $pidfile)
  if ps -o args= -p $pid 2>/dev/null | grep -q -- "--ledger $run/ledger "; then
    kill $pid 2>/dev/null || true
    for i in {1..40}; do kill -0 $pid 2>/dev/null || break; sleep 0.5; done
    kill -0 $pid 2>/dev/null && kill -9 $pid 2>/dev/null || true
  fi
  rm -f $pidfile
  for i in {1..60}; do busy || break; sleep 1; done
}
if [[ $1 == stop ]]; then halt; rm -rf $run/ledger; rm -rf $lock; exit 0; fi
[[ -f /Users/artem/Desktop/sol/_x/ia/STOP ]] && { echo "STOP file present: not starting"; exit 1; }
wait=8
until mkdir $lock 2>/dev/null; do echo "devx validator ports held by $(cat $lock/owner 2>/dev/null || echo '?'): waiting $wait s"; sleep $wait; done
echo "ia-devx $$" > $lock/owner
n=0
while (( $(pgrep -x solana-test-validator | wc -l) >= 3 )); do
  (( n++ % 12 == 0 )) && echo "3 validators already run on this machine: waiting (checks every 5 s)"
  sleep 5
done
halt
if busy; then echo "ports $base, $((base+1)), $faucet, $gossip are in use by something else: not starting"; rm -rf $lock; exit 1; fi
free=$(df -k / | awk 'NR==2{print $4}')
(( free >= 20000000 )) || { echo "under 20 GB free on the disk: not starting"; rm -rf $lock; exit 1; }
prog=$here/../../program
# a snapshot of the build and its IDL, so a rebuild by the program agent mid-run cannot mix versions
cp $prog/target/quick/ia.so $run/ia.so
cp $prog/target/idl/ia.json $run/ia.json 2>/dev/null || cp $prog/idl/ia.json $run/ia.json
[[ -f $run/authority.json ]] || solana-keygen new --no-bip39-passphrase -s -o $run/authority.json >/dev/null
id=$(solana-keygen pubkey $prog/target/deploy/ia-keypair.json)
args=(--reset --quiet --ledger $run/ledger --limit-ledger-size 20000000 --rpc-port $base --faucet-port $faucet --gossip-port $gossip
      --dynamic-port-range 58100-58300 --upgradeable-program $id $run/ia.so $run/authority.json)
nohup solana-test-validator $args > $run/validator.log 2>&1 &
echo $! > $pidfile
for i in {1..240}; do
  if solana -u http://127.0.0.1:$base cluster-version >/dev/null 2>&1; then echo "validator up on http://127.0.0.1:$base (pid $(cat $pidfile))"; exit 0; fi
  kill -0 $(cat $pidfile) 2>/dev/null || break
  sleep 1
done
rm -f $pidfile; rm -rf $lock
echo "validator did not start"; tail -20 $run/validator.log; exit 1
