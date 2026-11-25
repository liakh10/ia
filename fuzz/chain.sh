#!/bin/zsh
# The fuzz/audit chain: the snapshot build (fuzz/build.sh) loaded as an upgradeable program whose upgrade authority is the scratchpad's
# authority.json. Ports (BUILD.md, part fuzz): RPC 60899 (ws 60900), faucet 61900, gossip 60000, dynamic 60100-60300. Machine rule: at
# most 3 validators; this script waits while 3 run. Only the validator whose PID it wrote is ever stopped.
#   zsh fuzz/chain.sh        start fresh
#   zsh fuzz/chain.sh stop
set -e
S=${FUZZ_SCRATCH:-/private/tmp/claude-501/-Users-artem-Desktop-sol/be802bf9-e299-4d83-b38b-bc795e5cbb1e/scratchpad/ia-fuzz}
base=60899; faucet=61900; gossip=60000
mkdir -p $S
pidfile=$S/validator.pid
busy() { { lsof -nP -iTCP:$base -iTCP:$((base+1)) -iTCP:$faucet -sTCP:LISTEN || lsof -nP -iUDP:$gossip; } >/dev/null 2>&1; }
halt() {
  [[ -f $pidfile ]] || return 0
  local pid=$(cat $pidfile)
  if ps -o args= -p $pid 2>/dev/null | grep -q -- "--ledger $S/ledger "; then
    kill $pid 2>/dev/null || true
    for i in {1..40}; do kill -0 $pid 2>/dev/null || break; sleep 0.5; done
    kill -0 $pid 2>/dev/null && kill -9 $pid 2>/dev/null || true
  fi
  rm -f $pidfile; rm -rf $S/ledger
  for i in {1..60}; do busy || break; sleep 1; done
}
halt
[[ $1 == stop ]] && exit 0
[[ -f /Users/artem/Desktop/sol/_x/ia/STOP ]] && { echo "STOP file present: not starting"; exit 1; }
if busy; then echo "fuzz ports in use by something else: not starting"; exit 1; fi
n=0; while (( $(pgrep -x solana-test-validator | wc -l) >= 3 )); do (( n++ % 12 == 0 )) && echo "3 validators run: waiting"; sleep 5; done
[[ -f $S/authority.json ]] || solana-keygen new --no-bip39-passphrase -s -o $S/authority.json >/dev/null
[[ -f $S/so/ia.so ]] || { echo "no snapshot build: zsh fuzz/build.sh"; exit 1; }
consumer=""
[[ -f $S/so/ia_consumer.so ]] && consumer="--bpf-program $(grep -o 'declare_id!("[A-Za-z0-9]*")' ${0:A:h}/consumer/src/lib.rs | cut -d'"' -f2) $S/so/ia_consumer.so"
id=$(node -e 'console.log(JSON.parse(require("fs").readFileSync(process.argv[1])).address)' $S/idl/ia.json)
nohup solana-test-validator --reset --quiet --ledger $S/ledger --limit-ledger-size 20000000 --rpc-port $base --faucet-port $faucet \
  --gossip-port $gossip --dynamic-port-range 60100-60300 --upgradeable-program $id $S/so/ia.so $S/authority.json \
  ${(z)consumer} > $S/validator.log 2>&1 &
echo $! > $pidfile
for i in {1..240}; do
  if solana -u http://127.0.0.1:$base cluster-version >/dev/null 2>&1; then echo "fuzz validator up on http://127.0.0.1:$base (pid $(cat $pidfile))"; exit 0; fi
  kill -0 $(cat $pidfile) 2>/dev/null || break
  sleep 1
done
rm -f $pidfile; echo "validator did not start"; tail -20 $S/validator.log; exit 1
