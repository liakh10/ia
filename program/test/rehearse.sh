#!/bin/zsh
# Launch day rehearsed on a fresh local chain with pump.fun cloned and no `ia` loaded (see test/rehearse.mjs). Takes the validator lock
# (this part's ports), runs the "site" chain, releases the lock. Needs `node test/prep.mjs` once and `zsh test/build.sh`.
set -e
here=${0:A:h}
cd $here/..
source $here/lock.sh
mkdir -p $here/.run
[[ -f /Users/artem/Desktop/sol/_x/ia/STOP ]] && { echo "STOP file present: not running"; exit 1; }
take_lock
cleanup() { IA_CHAIN=site zsh test/chain.sh stop; rm -rf ${IA_LEDGERS:-$here/.run}/ledger-site; drop_lock; }
trap cleanup EXIT
rm -f $here/.run/rehearse.txt
up=0
for i in 1 2 3; do IA_TICKS=16 IA_CHAIN=site zsh test/chain.sh && { up=1; break; }; IA_CHAIN=site zsh test/chain.sh stop; sleep 10; done
(( up )) || { echo "the local chain did not start"; exit 1; }
node test/rehearse.mjs 2>&1 | tee $here/.run/rehearse.log || true
r=$(cat $here/.run/rehearse.txt 2>/dev/null || echo 0/1)
echo "ia rehearse $r"
echo "$(date '+%Y-%m-%d %H:%M:%S') rehearse=$r" >> $here/.run/runs.txt
[[ ${r%/*} -eq ${r#*/} ]]
