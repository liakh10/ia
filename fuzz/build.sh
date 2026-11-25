#!/bin/zsh
# The fuzz/audit snapshot build. The program agent keeps editing ia/program, so the fuzzer never builds in its tree: it copies the
# program sources (working tree, or a commit with SNAP_REF=<commit>) into the scratchpad, builds the QUICK feature (window floors of 5
# slots) with cargo build-sbf into the scratchpad's own target/, builds that snapshot's IDL, and records the sha256 of every source in
# fuzz/results/snapshot.json, so each report row names the exact code it ran against.
#   zsh fuzz/build.sh                 snapshot the working tree of ia/program
#   SNAP_REF=<commit> zsh fuzz/build.sh
set -e
here=${0:A:h}
prog=$here/../program
S=${FUZZ_SCRATCH:-/private/tmp/claude-501/-Users-artem-Desktop-sol/be802bf9-e299-4d83-b38b-bc795e5cbb1e/scratchpad/ia-fuzz}
ws=$S/ws
mkdir -p $S
free=$(df -k / | awk 'NR==2{print $4}')
(( free >= 20000000 )) || { echo "under 20 GB free on the disk: not building"; exit 1; }
rm -rf $ws && mkdir -p $ws/programs
if [[ -n $SNAP_REF ]]; then
  ( cd $prog/.. && git archive $SNAP_REF program/Cargo.toml program/Cargo.lock program/rust-toolchain.toml program/Anchor.toml program/programs ) | tar -x -C $ws --strip-components 1
else
  cp $prog/Cargo.toml $prog/Cargo.lock $prog/rust-toolchain.toml $prog/Anchor.toml $ws/
  cp -R $prog/programs/ia $ws/programs/
fi
find $ws/programs -name "*.rs" -exec touch {} +
export CARGO_TARGET_DIR=$S/target
out=$S/so
rm -rf $out && mkdir -p $out
cd $ws
sbf() { cargo build-sbf "$@" > $S/sbf.log 2>&1 || cargo build-sbf "$@" > $S/sbf.log 2>&1 || { tail -20 $S/sbf.log; exit 1; }; grep -E 'Finished' $S/sbf.log | tail -1; }
sbf --manifest-path programs/ia/Cargo.toml --features quick --sbf-out-dir $out
mkdir -p $S/idl
anchor idl build -p ia -o $S/idl/ia.json >/dev/null 2>$S/idl/ia.err || { echo "idl failed"; tail -20 $S/idl/ia.err; exit 1; }
node -e '
const fs=require("fs"),c=require("crypto"),p=require("path");
const [ws,out,ref,dir]=process.argv.slice(1);
const h=f=>c.createHash("sha256").update(fs.readFileSync(f)).digest("hex");
const files=fs.readdirSync(p.join(ws,"programs/ia/src")).map(f=>"programs/ia/src/"+f).concat(["Cargo.lock"]);
const snap={built:new Date().toISOString(),ref:ref||"working tree",feature:"quick",sources:Object.fromEntries(files.map(f=>[f,h(p.join(ws,f))])),binary:{sha256:h(p.join(out,"ia.so")),bytes:fs.statSync(p.join(out,"ia.so")).size}};
fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(p.join(dir,"snapshot.json"),JSON.stringify(snap,null,1));console.log("snapshot",snap.ref,snap.binary);
' $ws $out "$SNAP_REF" $here/results
