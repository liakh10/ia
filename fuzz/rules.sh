#!/bin/zsh
# Property tests of rules.rs: 10k+ randomized rounds (seeded), plus vectors for the JS model (fuzz/model.mjs) to cross-check.
#   SEED=1 CASES=10000 zsh fuzz/rules.sh       (needs fuzz/build.sh first: it uses that snapshot of programs/ia)
set -e
here=${0:A:h}
S=${FUZZ_SCRATCH:-/private/tmp/claude-501/-Users-artem-Desktop-sol/be802bf9-e299-4d83-b38b-bc795e5cbb1e/scratchpad/ia-fuzz}
[[ -d $S/ws/programs/ia ]] || { echo "no snapshot: zsh fuzz/build.sh"; exit 1; }
rm -rf $S/ws/rules-fuzz && cp -R $here/rules $S/ws/rules-fuzz
sed -i '' 's#\.\./\.\./program/programs/ia#../programs/ia#' $S/ws/rules-fuzz/Cargo.toml
cp $S/ws/Cargo.lock $S/ws/rules-fuzz/ 2>/dev/null || true
mkdir -p $here/results
( cd $S/ws/rules-fuzz && CARGO_TARGET_DIR=$S/target-host cargo run --release --quiet -- ${SEED:-1} ${CASES:-10000} $S/rules-vectors-${SEED:-1}.json ) | tee $here/results/rules-${SEED:-1}.txt
node $here/model-check.mjs $S/rules-vectors-${SEED:-1}.json | tee -a $here/results/rules-${SEED:-1}.txt
