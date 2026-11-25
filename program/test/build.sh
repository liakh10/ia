#!/bin/zsh
# Two builds: target/quick/ia.so (window floors of 5 slots, so the suite runs a round in seconds; test/all.sh loads it) and the launch
# build target/deploy/ia.so (floors of 150 slots), made last so target/deploy and idl/ always hold the launch build.
set -e
cd ${0:A:h}/..
free=$(df -k / | awk 'NR==2{print $4}')
(( free >= 20000000 )) || { echo "under 20 GB free on the disk: not building"; exit 1; }
anchor build -- --features quick
mkdir -p target/quick
cp target/deploy/ia.so target/quick/
anchor build
cmp -s target/quick/ia.so target/deploy/ia.so && { echo "the two builds are identical: the quick feature did not apply"; exit 1; }
mkdir -p idl/types
cp target/idl/ia.json idl/
cp target/types/ia.ts idl/types/
echo "built: target/quick (suite) and target/deploy (launch, $(stat -f %z target/deploy/ia.so) bytes); idl/ refreshed"
