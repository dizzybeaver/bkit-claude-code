#!/usr/bin/env bash
# L5 E2E Scenario 04 — docs-code-sync PASS with canonical BKIT_VERSION
#
# v2.1.11 update: pin assertion to canonical version from bkit.config.json
# instead of hard-coding the release number, so this scenario survives bumps.
#
# br200 update: vault targets (fenced declarations) are now part of the
# default doc-scan pass — case 1 exercises them on the current tree;
# case 2 proves drift detection via a --docs fixture expecting exit 1.

set -euo pipefail
cd "$(dirname "$0")/../.."

VERSION=$(node -e "console.log(require('./bkit.config.json').version)")
VERSION_REGEX="${VERSION//./\\.}"

# Case 1: full run (default docs + br200 vault targets, fenceMode) — must PASS.
out=$(node scripts/docs-code-sync.js 2>&1)
rc=$?
if [ "$rc" -ne 0 ]; then
  echo "✗ L5-04 FAIL: docs-code-sync exited ${rc} (expected 0)"
  echo "  output: $out"
  exit 1
fi
if ! echo "$out" | grep -q 'PASSED' || ! echo "$out" | grep -qE "canonical.*${VERSION_REGEX}"; then
  echo "✗ L5-04 FAIL (expected canonical ${VERSION})"
  echo "  output: $out"
  exit 1
fi
echo "✓ L5-04 PASS: docs-code-sync PASSED with canonical ${VERSION} (incl. vault targets)"

# Case 2: fixture with a wrong count inside fences — must FAIL with exit 1.
TMPFIX=$(mktemp /tmp/br200-smoke-XXXXXX.md)
trap 'rm -f "$TMPFIX"' EXIT
cat > "$TMPFIX" <<'FIXTURE'
prose line
<!-- docs-code-sync:begin -->
This vault ships 999 Skills today.
<!-- docs-code-sync:end -->
FIXTURE

fout=$(node scripts/docs-code-sync.js --docs="$TMPFIX" 2>&1) && frc=0 || frc=$?
if [ "$frc" -eq 1 ] && echo "$fout" | grep -q 'declared 999'; then
  echo "✓ L5-04 PASS: vault fence drift detected via --docs fixture (exit 1)"
  exit 0
else
  echo "✗ L5-04 FAIL: expected exit 1 + drift report for fenced fixture (got exit ${frc})"
  echo "  output: $fout"
  exit 1
fi
