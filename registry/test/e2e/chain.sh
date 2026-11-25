#!/bin/zsh
# The verifier's local chain (BUILD.md ports: RPC 56899, ws 56900, faucet 57900, gossip 56000, dynamic 56100-56300) with a copy of the
# program's quick build (window floors of 5 slots) as an upgradeable program whose authority is .run/authority.json. Only the validator
# this script started (its PID, its ledger) is ever stopped. The lock is a directory made atomically; it also waits while 3 validators
# already run on the machine (the machine rule).
#   zsh chain.sh start | stop
set -e
here=${0:A:h}
run=$here/.run
mkdir -p $run
LOCK=${IA_VERIFIER_LOCK:-/private/tmp/claude-501/-Users-artem-Desktop-sol/be802bf9-e299-4d83-b38b-bc795e5cbb1e/scratchpad/ia-verifier/validator.lock}
base=56899; faucet=57900; gossip=56000
pidfile=$run/validator.pid
led=$run/ledger
busy() { { lsof -nP -iTCP:$base -iTCP:$((base+1)) -iTCP:$faucet -sTCP:LISTEN || lsof -nP -iUDP:$gossip; } >/dev/null 2>&1; }
halt() {
  [[ -f $pidfile ]] || return 0
  local pid=$(cat $pidfile)
  if ps -o args= -p $pid 2>/dev/null | grep -q -- "--ledger $led "; then
    kill $pid 2>/dev/null || true
    for i in {1..40}; do kill -0 $pid 2>/dev/null || break; sleep 0.5; done
    kill -0 $pid 2>/dev/null && kill -9 $pid 2>/dev/null || true
  fi
  rm -f $pidfile
  for i in {1..60}; do busy || break; sleep 1; done
}
if [[ $1 == stop ]]; then halt; rm -rf $led; rm -rf $LOCK; exit 0; fi
mkdir -p ${LOCK:h}
wait=8
until mkdir $LOCK 2>/dev/null; do echo "verifier validator ports held by $(cat $LOCK/owner 2>/dev/null || echo '?'): waiting $wait s"; sleep $wait; (( wait < 60 )) && wait=$((wait * 2 > 60 ? 60 : wait * 2)); done
echo ia-verifier > $LOCK/owner
n=0
while (( $(pgrep -x solana-test-validator | wc -l) >= 3 )); do (( n++ % 12 == 0 )) && echo "3 validators already run on this machine: waiting"; sleep 5; done
halt
if busy; then echo "ports $base/$faucet/$gossip are in use by something else: not starting"; rm -rf $LOCK; exit 1; fi
free=$(df -k / | awk 'NR==2{print $4}')
(( free >= 20000000 )) || { echo "under 20 GB free on the disk: not starting"; rm -rf $LOCK; exit 1; }
prog=$here/../../../program
cp $prog/target/quick/ia.so $run/ia.so
cp $prog/target/idl/ia.json $run/ia.idl.json
[[ -f $run/authority.json ]] || solana-keygen new --no-bip39-passphrase -s -o $run/authority.json >/dev/null
id=$(solana-keygen pubkey $prog/target/deploy/ia-keypair.json)
# SPL Memo v2, the mainnet bytes (read-only dump, cached), so local anchors run the same program as mainnet
MEMO=MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr; MEMO_SHA=f520eaf096361abbb9639ea4dc3e5388a87b9330e121f476607b87c46ef67954
[[ -f $run/memo-v2.so ]] || solana program dump -u mainnet-beta $MEMO $run/memo-v2.so >/dev/null
[[ $(shasum -a 256 $run/memo-v2.so | cut -d' ' -f1) == $MEMO_SHA ]] || { echo "memo-v2.so is not the pinned mainnet Memo v2"; rm -rf $LOCK; exit 1; }
nohup solana-test-validator --reset --quiet --ledger $led --limit-ledger-size 20000000 --rpc-port $base --faucet-port $faucet --gossip-port $gossip \
  --dynamic-port-range 56100-56300 --upgradeable-program $id $run/ia.so $run/authority.json --bpf-program $MEMO $run/memo-v2.so > $run/validator.log 2>&1 &
echo $! > $pidfile
for i in {1..240}; do
  if solana -u http://127.0.0.1:$base cluster-version >/dev/null 2>&1; then echo "validator up on http://127.0.0.1:$base (pid $(cat $pidfile))"; exit 0; fi
  kill -0 $(cat $pidfile) 2>/dev/null || break
  sleep 1
done
rm -f $pidfile; rm -rf $LOCK
echo "validator did not start"; tail -20 $run/validator.log; exit 1
