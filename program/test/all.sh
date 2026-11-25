#!/bin/zsh
# One full run: the unit tests (rules.rs: task, price, split, tiers, bounties, shares), then the lock, a fresh local chain with the quick
# build, the suite (test.mjs), the chain stopped by its PID, its ledger deleted, the lock released. Needs `zsh test/build.sh` first.
# Each run appends a line to .run/runs.txt.
set -e
here=${0:A:h}
cd $here/..
source $here/lock.sh
mkdir -p $here/.run
[[ -f /Users/artem/Desktop/sol/_x/ia/STOP ]] && { echo "STOP file present: not running"; exit 1; }
take_lock
stopchain() { zsh test/chain.sh stop; rm -rf ${IA_LEDGERS:-$here/.run}/ledger; drop_lock; }
trap stopchain EXIT
rm -f $here/.run/result-*.txt(N)
out=$(cargo test --lib 2>&1 | grep -E 'test result' | awk '{p+=$4; f+=$6} END {print p" "f}')
echo "${out% *}/$(( ${out% *} + ${out#* } ))" > $here/.run/result-unit.txt
zsh test/chain.sh
node test/test.mjs 2>&1 | tee $here/.run/test.log || true
for s in unit suite; do
  r=$(cat $here/.run/result-$s.txt 2>/dev/null || echo 0/1)
  echo "ia $s $r"
  all="$all $s=$r"
  [[ ${r%/*} -eq ${r#*/} ]] || bad=1
done
echo "$(date '+%Y-%m-%d %H:%M:%S')$all" >> $here/.run/runs.txt
[[ -z $bad ]]
