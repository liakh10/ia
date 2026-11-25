#!/bin/zsh
# devx local-validator suite: lock + fresh chain on devx's ports, local.mjs, chain stopped by its PID, ledger deleted, lock released.
# Appends a line to ../../.data/devx/runs.txt.
set -e
here=${0:A:h}
export IA_DEVX_SCRATCH=${IA_DEVX_SCRATCH:-/private/tmp/claude-501/-Users-artem-Desktop-sol/be802bf9-e299-4d83-b38b-bc795e5cbb1e/scratchpad/ia-devx}
trap "zsh $here/chain.sh stop" EXIT
zsh $here/chain.sh
rm -f $here/../../.data/devx/result-local.txt
node $here/local.mjs 2>&1 | tee $IA_DEVX_SCRATCH/local.log || true
r=$(cat $here/../../.data/devx/result-local.txt 2>/dev/null || echo 0/1)
mkdir -p $here/../../.data/devx
echo "$(date '+%Y-%m-%d %H:%M:%S') local=$r" >> $here/../../.data/devx/runs.txt
echo "devx local $r"
[[ ${r%/*} -eq ${r#*/} ]]
