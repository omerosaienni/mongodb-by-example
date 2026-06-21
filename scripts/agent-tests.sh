#!/usr/bin/env bash
# Run a test tier (or both) and print one terse line per tier, so a passing run
# costs a few tokens of context instead of the full vitest dump. On failure,
# print the failing tests in full so the cause is visible without a second run.
#
# This is the AGENT test path, called by the build loop's judge. Humans keep the
# verbose path (npm run test:unit / test:integration, make test), which stays
# plain vitest. Both paths drive the same vitest.<tier>.config.ts files, so they
# cannot disagree on what they test, only on how much they print.
#
# Usage:
#   agent-tests.sh unit                  run the unit tier, terse on pass
#   agent-tests.sh integration           run the integration tier, terse on pass
#   agent-tests.sh both                  unit then integration, stops if unit fails
#   agent-tests.sh <tier> <path>...      scope to specific test files, intersected
#                                        with the tier glob (the scoped negative run)
#   agent-tests.sh <tier> [path]... --verbose   full vitest output regardless
#
# Exit: 0 all selected tiers passed, 1 a tier ran and failed, 2 a tier selected
#       zero tests (hollow suite), 3 a tier could not run (environment problem)
set -uo pipefail

# Each tier maps to its vitest config. vitest is invoked directly here, NOT via
# npm run, because this script IS the project's test:<tier> script; going back
# through npm would recurse.
unit_config="vitest.unit.config.ts"
integration_config="vitest.integration.config.ts"

verbose=0
tier=""
scope=()
for a in "$@"; do
    case "$a" in
        unit|integration|both) tier="$a" ;;
        -v|--verbose)          verbose=1 ;;
        -h|--help) grep '^#' "$0" | grep -v '^#!' | sed 's/^# \{0,1\}//'; exit 0 ;;
        -*) echo "unknown option: $a" >&2; exit 64 ;;
        *) scope+=("$a") ;;
    esac
done
[ -z "$tier" ] && { echo "usage: agent-tests.sh unit|integration|both [path]... [--verbose]" >&2; exit 64; }
[ "$tier" = both ] && [ "${#scope[@]}" -gt 0 ] && { echo "scope paths cannot be combined with 'both'; run one tier" >&2; exit 64; }

# run_one <label> <config>: run one tier through vitest, emit terse or full.
run_one() {
    local label="$1" config="$2" out rc summary
    out="$(npx vitest run -c "$config" "${scope[@]}" 2>&1)"; rc=$?

    # vitest emits ANSI colour codes even when its output is captured (not a tty),
    # and those codes sit between words in the summary line, so strip them before
    # any parsing or the greps and the count extraction silently fail.
    out="$(printf '%s' "$out" | sed -E 's/\x1b\[[0-9;]*m//g')"

    if [ "$verbose" = 1 ]; then
        printf '%s\n' "$out"
        return "$rc"
    fi

    # A tier that selects zero tests is a hollow suite: surface it, do not pass.
    if printf '%s' "$out" | grep -q "No test files found"; then
        echo "$label: 0 tests selected (hollow suite)"
        return 2
    fi

    if [ "$rc" -eq 0 ]; then
        # Pull vitest's "Tests  N passed (N)" summary into one line.
        summary="$(printf '%s' "$out" | grep -E "Tests +[0-9]+ passed" | tail -1 | sed -E 's/.*Tests +([0-9]+ passed.*)/\1/' | tr -s ' ')"
        echo "$label: ${summary:-passed}"
        return 0
    fi

    # Distinguish two failure causes the loop must treat differently:
    #   - the tests ran and a test failed (the builder's problem, exit 1)
    #   - the runner could not run at all (the environment's problem, exit 3):
    #     a missing or broken vitest config, a missing dependency. These produce
    #     no "Tests" summary line because no suite ever executed.
    # The setup gate should prevent the environment case, but if it slips through
    # mid run the loop must escalate it, not bounce it to the builder as a defect.
    if ! printf '%s' "$out" | grep -qE "Tests +[0-9]+ (passed|failed)|[0-9]+ failed"; then
        echo "$label: COULD NOT RUN (environment, not a test failure)"
        printf '%s\n' "$out"
        return 3
    fi

    # On a genuine test failure the detail is what matters: print the full output.
    echo "$label: FAILED"
    printf '%s\n' "$out"
    return 1
}

case "$tier" in
    unit)        run_one unit "$unit_config" ;;
    integration) run_one integration "$integration_config" ;;
    both)
        run_one unit "$unit_config" || exit $?
        run_one integration "$integration_config" ;;
esac
