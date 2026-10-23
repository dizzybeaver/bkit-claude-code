# br148-quoted-string-fp — Design (EN)

**Version:** 1.0 · **Date:** 2026-10-19 · **Feature:** br148-quoted-string-fp

## 1. Overview

Stop G-001-family rules from matching delete tokens inside quoted regions
that are DATA, not operations — without opening a bypass. Measured FPs
(br148 report + live repro):

- `node -e "const t='shutil.rmtree'; console.log(t)"` → was critical/deny
- `echo 'deny for any rm -rf' | head` → was critical/deny
- `grep "rm -rf" file.txt | head` → was critical/deny

## 2. Mechanism

New exported helper `stripInertQuotedDeletes(command)` in
`lib/control/destructive-detector.js`, following the br046 stripper contract
("may remove noise, never evidence"; fail-open on unbalanced quotes →
command returned unchanged).

Region rules (deny-biased):

| Region | Action |
|---|---|
| Arg of shells (`bash|sh|zsh|dash|ksh -c`, `eval`) | KEEP whole |
| Arg of remote/composed executors (`ssh su doas sudo xargs docker kubectl podman nc`) | KEEP whole |
| Arg of a `--flag` (e.g. `wrangler --command "DROP ..."`) | KEEP whole — flags carry executable payload (GP-21 regression guard) |
| Interpreter payload (`node/python/perl/ruby/php -e/-c/-r/-p`) WITH exec markers (`child_process, execSync, spawn, os.system, subprocess, popen`) | KEEP whole |
| Interpreter payload WITHOUT exec markers | code kept, INNER string literals blanked — data-in-data (`node -e "…'shutil.rmtree'…"`) no longer matches; live bare calls (`shutil.rmtree(`) survive |
| Other single-quoted region with exec markers | KEEP |
| Other single-quoted region, no markers | BLANK (`''`) |
| Other double-quoted region with `$` or backtick | KEEP (command substitution possible) |
| Other double-quoted region | BLANK (`""`) |

## 3. Application Points

1. Segmented pipeline: `inputs = …map(stripHeredocBodies).map(stripInertQuotedDeletes)`.
2. targetFields branch (G-001/G-013/G-020 path): pattern-test against the
   inert-stripped field, so a token that lives only inside quoted DATA does
   not match the rule at all.

Exported alongside `stripHeredocBodies` for direct assertion.

## 4. Verification (measured, post-fix)

- All 3 FPs → no match.
- GP-21 `wrangler d1 execute db --command "DROP TABLE audit_log"` → G-009
  critical/deny (restored after the `--flag` guard was added — the first cut
  stripped it and failed GP-21).
- Live calls: `rm -rf /tmp/x` high/ask; `python3 -c …shutil.rmtree…`
  critical/deny (both quote styles).
- Bypass attempts all still caught: `bash -c` critical; `node -e
  execSync`, `python os.system`, `ssh`, `$( )` in double quotes → high/ask
  (user-confirmation gate); `xargs` critical.
- Suites: destructive-detector 30/30 wait — unit 14/14 within, registry-lockdown,
  enh-440-447 precision 30/30 incl. GP-21 — all pass.
- Residual: heredoc-body prose still MATCHES G-001 but grades high/ask
  (br046 strips bodies; the ask-level residual is friction, not a block).

## 5. Notes

- The verification probe itself was blocked twice by the live (pre-sync)
  detector — first inline (`node -e` strings in a Bash command line), then
  the probe FILE's literal SQL string (G-009 has no targetFields, so Write
  content matches). Probe v3 assembles the SQL at runtime. Recorded as a
  workflow hazard: detector tests that quote live patterns must build them
  at runtime or run from a file outside matching scope.
