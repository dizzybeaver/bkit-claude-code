/**
 * Deny-pattern matching semantics for the hook defense stack.
 *
 * @version 2.1.40
 *
 * Module-2 (textual-matching-defense) of the hook-audit-fix-wave-1028 PDCA
 * wave. Design Ref: docs/02-design/features/hook-audit-fix-wave-1028.design.en.md
 * §8 (probe P3 row 7) and §9 — matching semantics live in lib/defense/*.
 *
 * The wave's red-team audit found one evasion class at two gates: deny
 * decisions made on raw literal text. Four reports, four primitives:
 *
 * - rb007 — `stripInertQuotedDeletes()` blanks a quoted region unless the
 *   text before the quote names a keep-command. No database client was in
 *   that list, so `sqlite3 app.db "DELETE FROM users"` had its payload
 *   blanked before G-009/G-010b ever ran. `isDbClientInvocation()` is the
 *   missing keep predicate.
 * - rb008 — G-010b's `(?![\s\S]*\bWHERE\b)` lookahead suppressed the
 *   unscoped-DELETE deny on ANY later occurrence of the word "where",
 *   including trailing English prose. `hasScopedWhereEverywhere()` replaces
 *   the bare-word lookahead with a clause-shape test: a WHERE only counts
 *   when it directly follows the table (optional single alias) and reads as
 *   a predicate.
 * - rb009 — the Write/Edit doc exemption covered docs/ and work/ only and
 *   exempted G-002/G-009/G-010 but not G-010b, so a security report quoting
 *   the SQL it documents was denied by the rule it documents.
 *   `isDocumentationTarget()` + `DOC_EXEMPT_RULE_IDS` are the shared
 *   exemption vocabulary.
 * - rb013 — the phase-9 deploy deny table matched `lowered.includes(pattern)`
 *   literal substrings; whitespace/tab/continuation/quote variants of
 *   `kubectl delete` split the substring and executed. `normalizeForDenyMatch()`
 *   + `matchesDenyPattern()` give the deny loop the same boundary-aware
 *   treatment the preview flags already have (hasDeployPreviewFlag).
 *
 * Bias: deny-biased throughout. These primitives feed destructive-command
 * detectors — a false negative hands the operator's asset to the evader,
 * a false positive costs one confirmation.
 *
 * Pure module: no fs, no network, no env reads (`path` is used only to
 * resolve documentation-target roots). Consumed by
 * lib/control/destructive-detector.js and scripts/unified-bash-pre.js.
 *
 * @module lib/defense/deny-matching
 */

'use strict';

const path = require('path');

/**
 * SQL clients that accept a destructive statement as an inline argument.
 *
 * rb007. The br148 keep-list (`BR148_KEEP_CMD`) names shell-family and
 * container executables; none of the clients below appear on it, so their
 * quoted payloads were the one invocation shape the SQL deny rules could
 * never see. Membership here is a KEEP decision, not a match decision —
 * the payload is preserved for the rule table to grade, exactly like the
 * `bash -c` and `--flag` keeps.
 */
const DB_CLIENTS = /\b(?:sqlite3|psql|mysql|mysqladmin|mariadb|mariadb-dump|mongosh|mongo|redis-cli|sqlcmd|duckdb)\b/;

/**
 * Does the text preceding a quoted region invoke a database client?
 *
 * rb007. `before` is the raw command text immediately ahead of the quote
 * (the same 160-char window `stripInertQuotedDeletes` already builds).
 * Only the LAST command segment counts: a `;`, `|`, `&`, or newline starts
 * a new command whose arguments are not the client's. Word-boundary match
 * so `grepsqlite3` does not arm the keep.
 *
 * Deny-biased residue: a client name appearing as a non-command word in the
 * final segment (`grep sqlite3 notes "..."`) also keeps the quoted region —
 * keeping evidence can cost a confirmation, blanking it costs the table.
 *
 * @param {string} before - command text preceding the quoted region
 * @returns {boolean}
 */
function isDbClientInvocation(before) {
  if (typeof before !== 'string' || before.length === 0) return false;
  const segment = before.split(/[;|&\n]/).pop();
  return DB_CLIENTS.test(segment);
}

/**
 * The positive half of G-010b, lookahead removed.
 *
 * rb008. The consumer rule drops its `(?![\s\S]*\bWHERE\b)` lookahead and
 * delegates the WHERE question to `hasScopedWhereEverywhere()` — the
 * lookahead is what trailing prose exploited.
 */
const DELETE_FROM_TABLE = /\bDELETE\s+FROM\s+(?!the\b|a\b|an\b|this\b|that\b|these\b|those\b|my\b|our\b|your\b|its\b)[\w.]+/gi;

/**
 * Does every `DELETE FROM <table>` in the text carry a REAL WHERE clause?
 *
 * rb008. A WHERE only counts when:
 *   1. it directly follows the table name — whitespace plus at most ONE
 *      alias token (`sessions s`, `sessions AS s`) may sit between. SQL's
 *      grammar puts the WHERE there; prose puts words there
 *      ("sessions and log where ..." -> not a clause, deny stands);
 *   2. it reads as a predicate, not a narration: the tokens after it must
 *      contain a comparison/membership shape (=, <, >, <>, !=, IN, LIKE,
 *      BETWEEN, IS, EXISTS, or a parenthesised test). "where it happened"
 *      has none.
 *
 * Word-boundary and case-insensitive by construction (`WHERE\b` / /i);
 * comment stripping is the caller's job (segmentation already strips SQL
 * comments before G-010b runs).
 *
 * Used as G-010b's `suppressIf`: true means every DELETE is scoped and the
 * rule stands down; any single unscoped DELETE (or prose "where") returns
 * false and the deny fires.
 *
 * @param {string} text - one command/SQL segment
 * @returns {boolean}
 */
function hasScopedWhereEverywhere(text) {
  if (typeof text !== 'string' || text.length === 0) return false;
  DELETE_FROM_TABLE.lastIndex = 0;
  let match;
  let seen = false;
  while ((match = DELETE_FROM_TABLE.exec(text)) !== null) {
    seen = true;
    if (!hasImmediateWhereClause(text, match.index + match[0].length)) {
      DELETE_FROM_TABLE.lastIndex = 0;
      return false;
    }
  }
  DELETE_FROM_TABLE.lastIndex = 0;
  return seen;
}

/**
 * Clause-shape test for one DELETE's tail.
 *
 * @param {string} text - full segment
 * @param {number} from - index just past the table name
 * @returns {boolean}
 */
function hasImmediateWhereClause(text, from) {
  let rest = text.slice(from);
  // Optional single alias between table and WHERE; never consume the WHERE
  // token itself as the alias.
  rest = rest.replace(/^[ \t]+(?:AS[ \t]+)?(?!WHERE\b)[\w$#."'-]+[ \t]+/i, ' ');
  const clause = /^[ \t]*WHERE[ \t]+([^;]+)/i.exec(rest);
  if (!clause) return false;
  // A predicate names a comparison, membership, or parenthesised test —
  // bare prose does not.
  return /(?:=|<>|!=|<=|>=|<|>|\bIN\b|\bLIKE\b|\bBETWEEN\b|\bIS\b|\bEXISTS\b|\()/i.test(clause[1]);
}

/**
 * Rule ids the Write/Edit documentation exemption stands down for.
 *
 * rb009. Was G-002/G-009/G-010 inline in detect(); G-010b — given its
 * current reach by the ENH-446/br165 fixes after the list was written —
 * was missing, so a .md quoting an unscoped DELETE was denied. A named
 * constant here means the next literal rule cannot be forgotten: the
 * consumer tests membership instead of re-typing ids.
 */
const DOC_EXEMPT_RULE_IDS = new Set(['G-002', 'G-009', 'G-010', 'G-010b']);

/**
 * Is a resolved Write/Edit target a documentation surface whose prose may
 * quote destructive literals?
 *
 * rb009. docs/ and work/ keep their existing coverage; bug_reports/ is
 * added — it is precisely where findings quoting dangerous commands are
 * filed. `resolvedTarget` must already be resolved against the project
 * root (the consumer's path.resolve guard against `docs/../../lib/x.md`
 * traversal stays theirs).
 *
 * @param {string} resolvedTarget - absolute, resolved target path
 * @param {string} projectRoot - project root the target was resolved against
 * @returns {boolean}
 */
function isDocumentationTarget(resolvedTarget, projectRoot) {
  if (typeof resolvedTarget !== 'string' || resolvedTarget.length === 0) {
    return false;
  }
  return ['docs', 'work', 'bug_reports'].some((dir) => {
    const root = path.resolve(projectRoot, dir);
    return resolvedTarget === root || resolvedTarget.startsWith(root + path.sep);
  });
}

/**
 * Normalize a command string for deny-pattern matching.
 *
 * rb013. Undoes every token-separator variation the shell accepts on the
 * way to the same argv: backslash-newline continuations join, quoting
 * characters dissolve, whitespace collapses. Lowercased, trimmed. Deny
 * tables match against THIS form; preview/exemption checks keep their own
 * boundary tokenizer (hasDeployPreviewFlag) on the raw text.
 *
 * @param {string} command - raw command text
 * @returns {string}
 */
function normalizeForDenyMatch(command) {
  if (typeof command !== 'string') return '';
  return command
    .replace(/\\\r?\n/g, ' ') // shell line continuations join into one line
    .toLowerCase()
    .replace(/['"`]/g, ' ') // `kubectl "delete" pod` and `kubectl delete pod` are the same argv
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Boundary-aware deny-pattern match against normalized text.
 *
 * rb013. Multi-token patterns (`kubectl delete`) match as a token SEQUENCE:
 * each token whole, separated by the single normalized space — the
 * double-space / tab / continuation / quoted-token variants that slipped
 * past `includes()` all normalize into this shape and now fall. A single-
 * token pattern keeps the legacy substring semantics (`--force`,
 * `production` may sit inside a larger word, as the ask-grade table always
 * intended).
 *
 * @param {string} normalized - output of normalizeForDenyMatch()
 * @param {string} pattern - deny-table pattern (raw casing/spaces)
 * @returns {boolean}
 */
function matchesDenyPattern(normalized, pattern) {
  if (typeof normalized !== 'string') return false;
  const pat = String(pattern).toLowerCase().trim();
  if (!pat) return false;
  const tokens = pat.split(/\s+/).filter(Boolean);
  if (tokens.length === 1) return normalized.includes(pat);
  const escaped = tokens.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return new RegExp(`(?:^| )${escaped.join(' ')}(?: |$)`).test(normalized);
}

module.exports = {
  isDbClientInvocation,
  hasScopedWhereEverywhere,
  DOC_EXEMPT_RULE_IDS,
  isDocumentationTarget,
  normalizeForDenyMatch,
  matchesDenyPattern,
};
