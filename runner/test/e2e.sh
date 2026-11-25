#!/bin/zsh
# The runner's local end to end (needs the program's quick build: ia/program/target/quick/ia.so). Takes the runner-ports lock (and waits
# while 3 validators run on the machine), snapshots the build + IDL, starts the chain, runs test/e2e.mjs (real model calls through the
# adapters' budget guard), stops the chain by its PID, deletes the ledger, releases the lock. Appends a line to test/.run/runs.txt.
#   zsh runner/test/e2e.sh            (IA_E2E_MODELS="anthropic/claude-haiku-5-5,google/gemini-3.8-flash,enrol/scripted-careful-1")
set -e
here=${0:A:h}
cd $here/..
[[ -f /Users/artem/Desktop/sol/_x/ia/STOP ]] && { echo "STOP file present: not running"; exit 1; }
LOCK=${IA_RUNNER_LOCK:-/private/tmp/claude-501/-Users-artem-Desktop-sol/be802bf9-e299-4d83-b38b-bc795e5cbb1e/scratchpad/ia-runner/validator.lock}
mkdir -p ${LOCK:h}
wait=8
until mkdir $LOCK 2>/dev/null; do echo "runner ports held by $(cat $LOCK/owner 2>/dev/null || echo '?'): waiting $wait s"; sleep $wait; (( wait < 60 )) && wait=$((wait * 2)); done
echo ia-runner > $LOCK/owner
n=0
while (( $(pgrep -x solana-test-validator | wc -l) >= 3 )); do (( n++ % 12 == 0 )) && echo "3 validators run on this machine: waiting"; sleep 5; done
stopchain() { zsh $here/chain.sh stop; rm -rf ${IA_RUNNER_LEDGER:-$here/.run}/ledger; rm -rf $LOCK; }
trap stopchain EXIT
mkdir -p $here/.run
cp ../program/target/quick/ia.so $here/.run/ia.so
cp ../program/target/idl/ia.json $here/.run/ia.json
zsh $here/chain.sh
rm -f $here/.run/result-e2e.txt
IA_IDL=$here/.run/ia.json RPC_URL=http://127.0.0.1:54899 node $here/e2e.mjs 2>&1 | tee $here/.run/e2e.log || true
r=$(cat $here/.run/result-e2e.txt 2>/dev/null || echo 0/1)
echo "$(date '+%Y-%m-%d %H:%M:%S') unit=$(cat $here/.run/result-unit.txt 2>/dev/null) e2e=$r" >> $here/.run/runs.txt
echo "runner e2e $r"
[[ ${r%/*} -eq ${r#*/} ]]
