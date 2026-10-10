# bkit v2.0.5 Comprehensive Test Report

> Generated: 2026-10-10T07:44:53.912Z
> Total: 5364 TC, 5352 PASS, 7 FAIL, 5 SKIP
> Pass Rate: 99.8%

---

## Summary

| Category | Total | Passed | Failed | Skipped | Rate |
|----------|:-----:|:------:|:------:|:-------:|:----:|
| Unit Tests | 1985 | 1985 | 0 | 0 | 100.0% PASS |
| Integration Tests | 611 | 609 | 2 | 0 | 99.7% FAIL |
| Security Tests | 267 | 267 | 0 | 0 | 100.0% PASS |
| Regression Tests | 876 | 875 | 1 | 0 | 99.9% FAIL |
| Performance Tests | 161 | 157 | 0 | 4 | 97.5% PASS |
| Philosophy Tests | 140 | 140 | 0 | 0 | 100.0% PASS |
| UX Tests | 185 | 185 | 0 | 0 | 100.0% PASS |
| E2E Tests (Node) | 151 | 151 | 0 | 0 | 100.0% PASS |
| Architecture Tests | 100 | 100 | 0 | 0 | 100.0% PASS |
| Controllable AI Tests | 80 | 80 | 0 | 0 | 100.0% PASS |
| behavioral | 45 | 45 | 0 | 0 | 100.0% PASS |
| contract | 763 | 758 | 4 | 1 | 99.3% FAIL |
| **Total** | **5364** | **5352** | **7** | **5** | **99.8%** |

## Version Comparison: v1.6.2 → v2.0.0

| Metric | v1.6.2 | v2.0.0 | Delta |
|--------|:------:|:------:|:-----:|
| Categories | 8 | 12 | +4 |
| Total TC | 1151 | 5364 | +4213 |
| Unit Tests | 450 | 1985 | +1535 |
| Integration Tests | 130 | 611 | +481 |
| Security Tests | 80 | 267 | +187 |
| Regression Tests | 200 | 876 | +676 |
| Performance Tests | 76 | 161 | +85 |
| Philosophy Tests | 60 | 140 | +80 |
| UX Tests | 60 | 185 | +125 |
| E2E Tests (Node) | 20 | 151 | +131 |
| Architecture Tests | N/A | 100 | NEW |
| Controllable AI Tests | N/A | 80 | NEW |
| behavioral | N/A | 45 | NEW |
| contract | N/A | 763 | NEW |

## Failures

### Integration Tests

- **TC-EC-01**: core/index.js has 154 exports (expected 40-120 range)
- **TC-EC-03**: core/index.js has 154 exports (expected 49-70)

### Regression Tests

- **regression/enh-433-hook-output-visibility.test.js**: Execution error: Command failed: node "/run/media/joe/H10-512GB/bkit-claude-code/test/regression/enh-433-hook-output-visibility.test.js"

### contract

- **contract/mcp-port.test.js**: Execution error: Command failed: node "/run/media/joe/H10-512GB/bkit-claude-code/test/contract/mcp-port.test.js"

## Verdict

**7 TESTS FAILED** - Issues must be resolved before release.
