#!/usr/bin/env bash
# Run the judge's hollow-test negative check for ONE deliverable, as a single
# committed command. The judge supplies the fault (an exact literal string in a
# source file to flip, and what to flip it to); the script owns everything else:
# backup, apply, scoped run, verdict, restore, and a green re-verify. The restore
# runs from an EXIT trap, so the file is put back however the script exits. The
# backup is a plain filesystem copy under .building/ (gitignored), which works on
# the UNTRACKED files a new deliverable adds, where git checkout/restore/stash
# silently no-op. The index is never touched.
#
# Usage:
#   agent-hollow.sh <tier> <src-file> <test-file> <old-string> <new-string>
#
# The fault must be BEHAVIOURAL and still compile (flip a value or comparison).
# <old-string> must occur exactly once in <src-file>, and differ from <new-string>.
#
# Verdict (what the negative run proves about <test-file>):
#   exit 0  ASSERTS   a test failed on the fault: the test is real, not hollow
#   exit 1  HOLLOW    the tier stayed green with the code broken: hollow test, FAIL
#   exit 2  BAD FAULT no tests ran (the fault broke the build, not behaviour):
#                     the judge must pick a behavioural fault and retry
#   exit 3  HALT      restore did not return the tier to green: do not proceed
#   exit 64 usage / <old-string> not found exactly once / old == new
set -euo pipefail

backup_root=".building/hollow"

die(){ echo "$1" >&2; exit "${2:-1}"; }
usage(){ grep '^#' "$0" | grep -v '^#!' | sed 's/^# \{0,1\}//'; }

[ "$#" -eq 5 ] || { usage >&2; exit 64; }
tier="$1"; src="$2"; testfile="$3"; old="$4"; new="$5"

[ -f "$src" ] || die "no such source file: $src" 64
[ -f "$testfile" ] || die "no such test file: $testfile" 64
[ "$old" != "$new" ] || die "old and new strings are identical; not a fault" 64
occ=$(grep -Fo -- "$old" "$src" | wc -l | tr -d ' ')
[ "$occ" = 1 ] || die "fault target must occur exactly once in $src (found $occ)" 64

bak="$backup_root/$src"
mkdir -p "$(dirname "$bak")"
cp "$src" "$bak"
# Restore from the backup no matter how we exit, then drop the backup.
restore(){ [ -f "$bak" ] && mv "$bak" "$src"; }
trap restore EXIT

# Apply the fault: literal first-occurrence replace (no regex), via bash expansion.
content="$(cat "$src")"
printf '%s\n' "${content/"$old"/"$new"}" > "$src"

# Scoped negative run through the project's runner (single source of truth for
# HOW tests run). Capture output: a real assertion failure prints "Tests N failed"
# with N>=1; a build break prints "Tests no tests" (nothing ran); green means the
# test never asserted the broken behaviour.
# Capture without letting a non-zero runner exit trip set -e (a failing test is
# the expected outcome here, not a script error).
if out="$(./scripts/agent-tests.sh "$tier" "$testfile" 2>&1)"; then rc=0; else rc=$?; fi

verdict=""
if [ "$rc" -eq 0 ]; then
    verdict="HOLLOW"; code=1
elif printf '%s' "$out" | grep -qE "Tests +[1-9][0-9]* failed"; then
    verdict="ASSERTS"; code=0
elif printf '%s' "$out" | grep -qiE "Tests +no tests|No test files found"; then
    verdict="BAD FAULT (no tests ran; fault was not behavioural)"; code=2
else
    verdict="BAD FAULT (tier did not run a test; treat as non-behavioural)"; code=2
fi

# Explicit restore now, then verify green before reporting (the trap is a backstop).
restore; trap - EXIT
if green="$(./scripts/agent-tests.sh "$tier" "$testfile" 2>&1)"; then grc=0; else grc=$?; fi
[ "$grc" -eq 0 ] || { echo "HALT: $src did not return to green after restore"; printf '%s\n' "$green"; exit 3; }

echo "hollow-check: $verdict"
exit "$code"
