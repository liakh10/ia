#!/bin/zsh
# The IA suite's validator ports (RPC 52899, websocket 52900, faucet 53900, gossip 52000, dynamic 52100-52300) are held by one runner at
# a time: a lock directory made atomically. Machine rule: at most 3 validators on the machine, so take_lock also waits while 3 run.
LOCK=${IA_LOCK:-/private/tmp/claude-501/-Users-artem-Desktop-sol/be802bf9-e299-4d83-b38b-bc795e5cbb1e/scratchpad/ia-program/validator.lock}
export IA_LEDGERS=${IA_LEDGERS:-${LOCK:h}}
take_lock() {
  local wait=8
  mkdir -p ${LOCK:h}
  until mkdir $LOCK 2>/dev/null; do
    echo "validator ports held by $(cat $LOCK/owner 2>/dev/null || echo '?'): waiting $wait s"
    sleep $wait
    (( wait < 60 )) && wait=$((wait * 2 > 60 ? 60 : wait * 2))
  done
  echo ia-program > $LOCK/owner
  local n=0
  while (( $(pgrep -x solana-test-validator | wc -l) >= 3 )); do
    (( n++ % 12 == 0 )) && echo "3 validators already run on this machine: waiting (checks every 5 s)"
    sleep 5
  done
}
drop_lock() { rm -rf $LOCK; }
