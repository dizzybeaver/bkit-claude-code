#!/usr/bin/env bash
# ============================================================================
# br139-remember-injection-cap.test.sh — contract tests for br139
# (SessionStart injection cap: 2048-byte budget, archive exclusion,
#  per-session hash-dedup) against the wired remember plugin cache 0.43.1.
#
# Standalone runner: pass/fail counters, exit nonzero on any failure.
# Covers design §6 TS-1..TS-7 (docs/02-design/features/
# br139-sessionstart-injection-cap.design.en.md).
#
# Invocation strategy:
#   - lib-level: source lib-memory-context.sh in a subshell with a fabricated
#     REMEMBER_DIR (stubs for log/config/config_into), mirroring the hook's
#     own render call shape (memory paths -> render -> max-bytes -> budget).
#   - hook-level (dedup, TS-2/3/5): invoke the real session-start-hook.sh
#     with a fabricated payload JSON on stdin and CLAUDE_PROJECT_DIR pointed
#     at the fixture, exactly as Claude Code would. Skipped with a warning
#     if `jq` is unavailable (the hook needs it to parse the payload).
# ============================================================================

REMEMBER_PLUGIN_CACHE="${HOME}/.claude/plugins/cache/claude-plugins-official/remember"
CACHE43="${REMEMBER_PLUGIN_CACHE}/0.43.1"
CACHE33="${REMEMBER_PLUGIN_CACHE}/0.33.0"
LIB="$CACHE43/scripts/lib-memory-context.sh"
HOOK="$CACHE43/scripts/session-start-hook.sh"

PASS=0
FAIL=0
declare -a FAILURES=()

ok()  { PASS=$((PASS + 1)); echo "  ok: $1"; }
bad() { FAIL=$((FAIL + 1)); FAILURES+=("$1"); echo "  FAIL: $1"; }
check() { # check <desc> <command...>
    local desc="$1"; shift
    if "$@" >/dev/null 2>&1; then ok "$desc"; else bad "$desc"; fi
}

# ---------------------------------------------------------------------------
# lib-level render helper: emits the assembled body the hook would inject
# ---------------------------------------------------------------------------
render_block() { # $1 = REMEMBER_DIR
(
    export REMEMBER_DIR="$1"
    log() { :; }                          # stub: hook-level logger not loaded
    config() { return 0; }                # stub: no user config layers
    config_into() { eval "$1=\$3"; }      # stub: pass the bundled default through
    # shellcheck disable=SC1090
    source "$LIB"
    _remember_memory_paths
    _REMEMBER_SESSION_START_BODY=$(_remember_render_memory_section)
    local _max=""
    _remember_session_start_max_bytes_into _max
    _remember_apply_session_start_budget _REMEMBER_SESSION_START_BODY "$_max" "$_REMEMBER_SESSION_START_BODY"
    printf '%s\n' "$_REMEMBER_SESSION_START_BODY"
)
}

new_fixture() { # $1 = dir ; writes the fixture .remember tree
    local d="$1/.remember"
    mkdir -p "$d"
    printf 'fresh now content marker-now\n' > "$d/now.md"
    printf 'ARCHIVE_SECRET_MARKER should never appear in any injection\n' > "$d/archive.md"
    printf 'recent slice content\n' > "$d/recent.md"
    printf 'today content\n' > "$d/today.md"
}

hook_run() { # $1 = project dir, $2 = session_id, $3 = outfile ; -> hook exit code
    local proj="$1" sid="$2" out="$3"
    printf '{"session_id":"%s","source":"startup"}' "$sid" \
        | timeout 30 env -u REMEMBER_DIR \
            CLAUDE_PROJECT_DIR="$proj" bash "$HOOK" > "$out" 2>"$out.err"
    return $?
}

# ===========================================================================
echo "== preflight =="
[ -f "$LIB" ]  || { echo "FATAL: lib not found: $LIB";  exit 2; }
[ -f "$HOOK" ] || { echo "FATAL: hook not found: $HOOK"; exit 2; }
HAVE_JQ=1; command -v jq >/dev/null 2>&1 || HAVE_JQ=0
if [ "$HAVE_JQ" = 0 ]; then
    echo "  WARN: jq not found — hook-level dedup tests (TS-2/3/5) will fail; install jq"
fi
command -v sha256sum >/dev/null 2>&1 || { echo "FATAL: sha256sum required"; exit 2; }

FIXROOT=$(mktemp -d /tmp/br139-test.XXXXXX)
trap 'rm -rf "$FIXROOT"' EXIT
PROJ="$FIXROOT/proj"
mkdir -p "$PROJ"
new_fixture "$PROJ"

# ===========================================================================
echo "== TS-1: fresh start — capped block, now.md present, archive absent + notice =="
TS1=$(render_block "$PROJ/.remember")
if grep -q "marker-now" <<<"$TS1"; then ok "TS-1 now.md content present"; else bad "TS-1 now.md content present"; fi
if grep -q "ARCHIVE_SECRET_MARKER" <<<"$TS1"; then bad "TS-1 archive.md content absent"; else ok "TS-1 archive.md content absent"; fi
if grep -q -- "--- archive.md not injected (br139) -- grep or read on request ---" <<<"$TS1"; then
    ok "TS-1 archive notice line present"; else bad "TS-1 archive notice line present"; fi
TS1_LEN=$(printf '%s' "$TS1" | wc -c)
if [ "$TS1_LEN" -le 2048 ]; then ok "TS-1 assembled block <= 2048 bytes ($TS1_LEN)"; else bad "TS-1 assembled block <= 2048 bytes (got $TS1_LEN)"; fi

# ===========================================================================
echo "== TS-4: oversized memory — whole-file drops, notice lists dropped files =="
PROJ4="$FIXROOT/proj4"; mkdir -p "$PROJ4"; new_fixture "$PROJ4"
{
    for i in $(seq 1 300); do printf 'oversized line %04d padded padding padding\n' "$i"; done
} > "$PROJ4/.remember/now.md"
TS4=$(render_block "$PROJ4/.remember")
if grep -q "oversized line" <<<"$TS4"; then bad "TS-4 oversized now.md content dropped"; else ok "TS-4 oversized now.md content dropped"; fi
if grep -q -- "--- not injected (over thresholds.session_start_max_bytes) -- grep or read on request ---" <<<"$TS4"; then
    ok "TS-4 budget-dropped notice present"; else bad "TS-4 budget-dropped notice present"; fi
if grep -q "now.md" <<<"$(sed -n '/not injected (over/,$p' <<<"$TS4")"; then
    ok "TS-4 dropped-files list names now.md"; else bad "TS-4 dropped-files list names now.md"; fi
TS4_LEN=$(printf '%s' "$TS4" | wc -c)
if [ "$TS4_LEN" -le 2048 ]; then ok "TS-4 assembled block still <= 2048 bytes ($TS4_LEN)"; else bad "TS-4 assembled block still <= 2048 bytes (got $TS4_LEN)"; fi
# reverse priority: with archive already excluded, several oversize files —
# now.md (first priority) must be the one kept; recent.md drops before it.
PROJ4b="$FIXROOT/proj4b"; mkdir -p "$PROJ4b"; new_fixture "$PROJ4b"
{
    for i in $(seq 1 120); do printf 'now pad %04d pppppppppp\n' "$i"; done
} > "$PROJ4b/.remember/now.md"
{
    for i in $(seq 1 120); do printf 'recent pad %04d pppppppppp\n' "$i"; done
} > "$PROJ4b/.remember/recent.md"
TS4b=$(render_block "$PROJ4b/.remember")
NOW_IN=0; RECENT_IN=0
grep -q "now pad" <<<"$TS4b" && NOW_IN=1
grep -q "recent pad" <<<"$TS4b" && RECENT_IN=1
if [ "$NOW_IN" = 1 ] && [ "$RECENT_IN" = 0 ]; then
    ok "TS-4 reverse priority: now.md kept, recent.md dropped first"
elif [ "$NOW_IN" = 0 ] && [ "$RECENT_IN" = 0 ]; then
    ok "TS-4 reverse priority: both oversize files dropped (conservative pass)"
else
    bad "TS-4 reverse priority: now_in=$NOW_IN recent_in=$RECENT_IN (recent must not beat now)"
fi

# ===========================================================================
echo "== TS-6: archive.md content never appears in any render =="
check "TS-6 no archive secret in TS-1 output"  bash -c '! grep -q ARCHIVE_SECRET_MARKER <<<"'"$TS1"'"'
check "TS-6 no archive secret in TS-4 output"  bash -c '! grep -q ARCHIVE_SECRET_MARKER <<<"'"$TS4"'"'
check "TS-6 no archive secret in TS-4b output" bash -c '! grep -q ARCHIVE_SECRET_MARKER <<<"'"$TS4b"'"'
# compact source also excludes archive
TS6=$(REMEMBER_DIR="$PROJ/.remember" SESSION_START_SOURCE=compact bash -c '
    log() { :; }; config() { return 0; }; config_into() { eval "$1=\$3"; }
    source "'"$LIB"'"
    _remember_memory_paths
    _remember_render_memory_section
')
check "TS-6 no archive secret in compact render" bash -c '! grep -q ARCHIVE_SECRET_MARKER <<<"'"$TS6"'"'

# ===========================================================================
echo "== TS-2/TS-3/TS-5: hook-level dedup (session-start-hook.sh) =="
if [ "$HAVE_JQ" = 1 ]; then
    SID="br139-sess-A"

    echo "-- TS-2: same session_id, unchanged memory -> second run suppressed"
    PROJ2="$FIXROOT/proj2"; mkdir -p "$PROJ2"; new_fixture "$PROJ2"
    hook_run "$PROJ2" "$SID" "$FIXROOT/ts2-run1.out"; RC1=$?
    check "TS-2 first hook run exits 0"            bash -c "[ $RC1 = 0 ]"
    if grep -q "=== MEMORY ===" "$FIXROOT/ts2-run1.out"; then ok "TS-2 run1 injects memory block"; else bad "TS-2 run1 injects memory block"; fi
    check "TS-2 run1 carries now.md content"       grep -q "marker-now" "$FIXROOT/ts2-run1.out"
    hook_run "$PROJ2" "$SID" "$FIXROOT/ts2-run2.out"; RC2=$?
    check "TS-2 second hook run exits 0"           bash -c "[ $RC2 = 0 ]"
    if grep -q "=== MEMORY ===" "$FIXROOT/ts2-run2.out"; then bad "TS-2 run2 suppresses memory block"; else ok "TS-2 run2 suppresses memory block"; fi
    if grep -q "unchanged earlier this session" "$FIXROOT/ts2-run2.out"; then ok "TS-2 run2 shows br139 suppression notice"; else bad "TS-2 run2 shows br139 suppression notice"; fi
    SKEY=$(printf '%s' "$SID" | tr -c 'A-Za-z0-9-' '-')
    STATE="$PROJ2/.remember/tmp/injected-hash.$SKEY.txt"
    check "TS-2 dedup state file exists"           test -f "$STATE"

    echo "-- TS-3: now.md changed -> fresh injection once, state hash updated"
    printf 'REVISED now content marker-now-v2\n' > "$PROJ2/.remember/now.md"
    hook_run "$PROJ2" "$SID" "$FIXROOT/ts3-run3.out"; RC3=$?
    check "TS-3 third hook run exits 0"            bash -c "[ $RC3 = 0 ]"
    if grep -q "=== MEMORY ===" "$FIXROOT/ts3-run3.out"; then ok "TS-3 changed memory re-injects"; else bad "TS-3 changed memory re-injects"; fi
    check "TS-3 re-injection carries new content"  grep -q "marker-now-v2" "$FIXROOT/ts3-run3.out"
    check "TS-3 state file updated (non-empty)"    bash -c "[ -s '$STATE' ]"
    # the hook hashes the assembled body pre-stdout, so the recorded hash is
    # not directly observable here; instead verify behavior: run 4 with
    # unchanged (revised) memory must be suppressed.
    hook_run "$PROJ2" "$SID" "$FIXROOT/ts3-run4.out"
    if grep -q "=== MEMORY ===" "$FIXROOT/ts3-run4.out"; then bad "TS-3 run4 suppressed after hash update"; else ok "TS-3 run4 suppressed after hash update"; fi

    echo "-- TS-5: corrupt dedup state -> fail-open inject, exit 0"
    rm -rf "$PROJ2/.remember/tmp/injected-hash.$SKEY.txt"
    mkdir -p "$PROJ2/.remember/tmp/injected-hash.$SKEY.txt"   # corrupt: a directory
    hook_run "$PROJ2" "$SID" "$FIXROOT/ts5-run5.out"; RC5=$?
    check "TS-5 hook exits 0 with corrupt state"   bash -c "[ $RC5 = 0 ]"
    if grep -q "=== MEMORY ===" "$FIXROOT/ts5-run5.out"; then ok "TS-5 corrupt state -> injects (fail-open)"; else bad "TS-5 corrupt state -> injects (fail-open)"; fi

    echo "-- TS-5b: unwritable state dir -> fail-open inject, exit 0"
    PROJ5="$FIXROOT/proj5"; mkdir -p "$PROJ5"; new_fixture "$PROJ5"
    chmod 555 "$PROJ5/.remember/tmp" 2>/dev/null || { mkdir -p "$PROJ5/.remember/tmp"; chmod 555 "$PROJ5/.remember/tmp"; }
    hook_run "$PROJ5" "br139-sess-B" "$FIXROOT/ts5b.out"; RC5B=$?
    check "TS-5b hook exits 0 with unwritable state" bash -c "[ $RC5B = 0 ]"
    if grep -q "=== MEMORY ===" "$FIXROOT/ts5b.out"; then ok "TS-5b unwritable state -> injects (fail-open)"; else bad "TS-5b unwritable state -> injects (fail-open)"; fi
    chmod 755 "$PROJ5/.remember/tmp"
else
    bad "TS-2/3/5 skipped: jq unavailable in environment"
fi

# ===========================================================================
echo "== TS-7: br139 markers present in 0.43.1; absent from 0.33.0 =="
if grep -q "# br139:" "$LIB"; then ok "TS-7 lib-memory-context.sh (0.43.1) has # br139: markers"; else bad "TS-7 lib-memory-context.sh (0.43.1) has # br139: markers"; fi
if grep -q "# br139:" "$HOOK"; then ok "TS-7 session-start-hook.sh (0.43.1) has # br139: markers"; else bad "TS-7 session-start-hook.sh (0.43.1) has # br139: markers"; fi
if grep -q "2048" "$LIB"; then ok "TS-7 lib budget default is 2048"; else bad "TS-7 lib budget default is 2048"; fi
if [ -d "$CACHE33" ]; then
    if grep -rq "# br139:" "$CACHE33/scripts" 2>/dev/null; then bad "TS-7 0.33.0 contains br139 markers (must be untouched)"; else ok "TS-7 0.33.0 has no br139 markers"; fi
else
    ok "TS-7 0.33.0 not present on disk — nothing to contaminate"
fi

# ===========================================================================
echo ""
echo "== results: $PASS passed, $FAIL failed =="
if [ "$FAIL" -gt 0 ]; then
    printf 'failed checks:\n'
    printf '  - %s\n' "${FAILURES[@]}"
    exit 1
fi
exit 0
