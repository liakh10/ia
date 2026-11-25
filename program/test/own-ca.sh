#!/bin/zsh
# The own-CA launch path rehearsed (IA_OWN_CA=1 test/rehearse.mjs): the owner puts his CA in config.js and has no mint key; launch.mjs
# deploys, inits, asks for the create at once and waits; the test creates the coin from the dev wallet; the launch goes on.
set -e
here=${0:A:h}
cd $here/..
source $here/lock.sh
mkdir -p $here/.run
[[ -f /Users/artem/Desktop/sol/_x/ia/STOP ]] && { echo "STOP file present: not running"; exit 1; }
take_lock
cleanup() { IA_CHAIN=site zsh test/chain.sh stop; rm -rf ${IA_LEDGERS:-$here/.run}/ledger-site; drop_lock; }
trap cleanup EXIT
rm -f $here/.run/own-ca.txt
up=0
for i in 1 2 3; do IA_TICKS=16 IA_CHAIN=site zsh test/chain.sh && { up=1; break; }; IA_CHAIN=site zsh test/chain.sh stop; sleep 10; done
(( up )) || { echo "the local chain did not start"; exit 1; }
IA_OWN_CA=1 node test/rehearse.mjs 2>&1 | tee $here/.run/own-ca.log || true
r=$(cat $here/.run/own-ca.txt 2>/dev/null || echo 0/1)
echo "ia own-ca $r"
echo "$(date '+%Y-%m-%d %H:%M:%S') own-ca=$r" >> $here/.run/runs.txt
[[ ${r%/*} -eq ${r#*/} ]]
