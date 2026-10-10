# Scenario: QA Execution

> bkit's behavior flow when executing Zero Script QA

## Scenario Overview

```
User: "/zero-script-qa" or "Run QA"
→ zero-script-qa skill activation
→ qa-monitor agent preparation
→ Docker log monitoring
→ Issue detection and reporting
```

## Trigger Flow

```
┌─────────────────────────────────────────────────────────────────┐
│  1. User Request: "/zero-script-qa" or "Run QA"                  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  2. Skills/Agents Activation                                     │
│                                                                 │
│  [[../../skills/zero-script-qa/SKILL|zero-script-qa]] activated              │
│  • Keywords "QA", "test", "log analysis" matched                │
│                                                                 │
│  [[../../agents/qa-monitor|qa-monitor]] prepared                    │
│  • Ready to invoke via Task tool                                │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  3. Environment Check                                            │
│                                                                 │
│  Claude checks:                                                 │
│  • Does docker-compose.yml exist?                               │
│  • Is Docker running? (docker compose ps)                       │
│  • Is JSON logging configured?                                  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  4. Start Log Monitoring                                         │
│                                                                 │
│  Claude: "Starting docker compose logs -f."                     │
│  "Please test the features in your browser."                    │
│  "I'll analyze logs in real-time."                              │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  5. PreToolUse Hook on Bash Execution                            │
│                                                                 │
│  [[../../skills/zero-script-qa/SKILL|zero-script-qa]]                       │
│  → unified-bash-pre.js                                               │
│                                                                 │
│  • Check destructive commands (rm -rf, DROP, etc.)              │
│  • If found → Block                                             │
│  • If safe → Allow with "QA environment verified"               │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  6. During Log Analysis                                          │
│                                                                 │
│  Real-time pattern detection:                                   │
│  • "level":"ERROR" → 🔴 Critical                                │
│  • "status":5xx → 🔴 Critical                                   │
│  • duration_ms > 3000 → 🔴 Critical                             │
│  • "status":401/403 → 🟡 Warning                                │
│  • duration_ms > 1000 → 🟡 Warning                              │
│                                                                 │
│  Immediate report on issue detection                            │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  7. QA Report Generation (Write)                                 │
│                                                                 │
│  Path: docs/03-analysis/zero-script-qa-{date}.md                │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  8. PostToolUse Hook (After Report Creation)                     │
│                                                                 │
│  [[../../agents/qa-monitor|qa-monitor]]                             │
│  → (qa-monitor-post.js removed — QA notification now in unified-write-post chain)                                           │
│                                                                 │
│  • If critical issues:                                          │
│    "🚨 Critical issues detected!"                               │
│    "/pdca-iterate recommended"                                  │
│  • If none:                                                     │
│    "✅ No critical issues"                                      │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  9. Stop Hook (On QA Session End)                                │
│                                                                 │
│  [[../../skills/zero-script-qa/SKILL|zero-script-qa]]                       │
│  → qa-stop.js                                                   │
│                                                                 │
│  "QA Session completed."                                        │
│  "1. Review logs for any missed issues"                         │
│  "2. Document findings in docs/03-analysis/"                    │
│  "3. Run /pdca-iterate if issues found"                         │
└─────────────────────────────────────────────────────────────────┘
```

## Example: Zero Script QA Execution

### Start

```
User: /zero-script-qa

Claude: Starting Zero Script QA.

Checking environment...
✅ docker-compose.yml exists
✅ Docker running (api, web, db containers)
✅ LOG_LEVEL=DEBUG configured

Starting log monitoring.
Please test the features in your browser.

[Running docker compose logs -f]
```

### Issue Detection

```
[Streaming logs...]

🔴 Critical detected:
{"timestamp":"2026-01-20T10:30:00Z","level":"ERROR","service":"api",
"request_id":"req_abc123","message":"Database connection failed"}

Investigating immediately.
Tracing full flow with Request ID: req_abc123...

Cause: DB connection timeout
Impact: POST /api/users failed
Recommendation: Check DB connection pool settings
```

### Report Generation

```
Claude: Ending QA session and generating report.

📄 Generated: docs/03-analysis/zero-script-qa-2026-01-20.md

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 QA Summary
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔴 Critical: 2
🟡 Warning: 5
ℹ️ Info: 12

Critical Issues:
1. Database connection timeout
2. 500 error on POST /api/orders

🚨 Critical issues detected!
Run /pdca-iterate for auto-fix?
```

---

## Hook Trigger Summary

| Timing | Hook | Script | Action |
|--------|------|--------|--------|
| Before Bash execution | PreToolUse | unified-bash-pre.js | Block destructive commands |
| After report Write | PostToolUse | (qa-monitor-post.js removed — QA notification now in unified-write-post chain) | Critical issue notification |
| On QA session end | Stop | qa-stop.js | Next steps guidance |

---

## Destructive Command Block List

Patterns blocked by `unified-bash-pre.js`:

```bash
- rm -rf
- rm -r
- DROP TABLE
- DROP DATABASE
- DELETE FROM
- TRUNCATE
- > /dev/
- mkfs
- dd if=
- :(){ :|:& };:   # fork bomb
```

---

## Test Checklist

- [ ] Verify zero-script-qa skill activation on /zero-script-qa execution
- [ ] Verify guidance message when docker compose is not running
- [ ] Verify destructive command blocking (test with rm -rf)
- [ ] Verify immediate report on ERROR log detection
- [ ] Verify (qa-monitor-post.js removed — QA notification now in unified-write-post chain) fires after report creation
- [ ] Verify /pdca-iterate recommendation when critical issues exist
- [ ] Verify qa-stop.js fires on session end

---

## v1.5.4 Note

For team-based QA execution, CTO-Led Agent Teams can parallelize QA:
- qa-strategist (sonnet, plan) handles test strategy planning
- qa-monitor (haiku) handles real-time log monitoring
- CTO Lead orchestrates QA phases with gap-detector for design-implementation validation

---

## Related Documents

- [[scenario-write-code]] - Write code scenario
- [[scenario-new-feature]] - New feature request scenario
- [[../../skills/zero-script-qa/SKILL|zero-script-qa]] - Zero Script QA skill
- [[../../agents/qa-monitor|qa-monitor]] - QA Monitor agent
- [[../components/scripts/_scripts-overview]] - unified-bash-pre.js
