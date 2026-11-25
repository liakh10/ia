#!/bin/zsh
# The verifier's local end-to-end: start the chain, run local-e2e.mjs, always stop the chain. Writes local-e2e.txt.
here=${0:A:h}
zsh $here/chain.sh start || exit 1
node $here/local-e2e.mjs; code=$?
zsh $here/chain.sh stop
exit $code
