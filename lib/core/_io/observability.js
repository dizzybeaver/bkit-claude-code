/**
 * Hook dispatch recording, crash recorder, and hook-text reader.
 * Sub-module of lib/core/io.js; import from lib/core/io.js, not from this file directly.
 *
 * I/O Utilities
 * @module lib/core/io
 * @version 2.1.10
 *
 * Claude Code 전용 플러그인으로 단순화 (v1.5.0). Tag synced to 2.0.0 per ENH-263 (2026-04-21).
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { truncateContext } = require('./shared');

// Lazy require to avoid a circular dependency (debug.js -> platform.js is a
// separate chain; io.js -> debug.js is one-way). Needed so H5 can surface
// stdin parse failures via debugLog instead of swallowing them silently.
let _debug = null;
function getDebug() {
  if (!_debug) {
    _debug = require('../debug');
  }
  return _debug;
}

/**
 * Record that this hook event reached bkit, then hand the payload back.
 *
 * Placed on the shared readers rather than in each handler so it covers every
 * hook script bkit ships and cannot be forgotten by a new one. A hook that
 * cannot prove the host ever invoked it is how eight bkit features stayed dead
 * across releases while every test stayed green — see lib/core/hook-dispatch.js.
 *
 * @template T
 * @param {T} payload
 * @returns {T} the same payload, unchanged
 */
function withDispatchRecord(payload) {
  try {
    require('../hook-dispatch').recordDispatch(payload);
    installCrashRecorder(payload && payload.hook_event_name);
  } catch (_) {
    /* observability must never break a hook */
  }
  if (!_isEmptyPayload(payload)) _processPayload = payload;
  return payload;
}

/**
 * The payload this process read, cached for readers that come after it.
 *
 * A hook process handles exactly one event, so there is exactly one payload to
 * remember and no staleness to reason about.
 *
 * Why it has to be remembered: unified-stop.js reads the payload with
 * `readStdinBounded`, which destroys stdin on resolve (Issue #139 — the Stop
 * hook must never block on a write-end Claude Code holds open), and then
 * dispatches the per-agent handler with `require()`, in the SAME process. Every
 * one of those handlers is self-executing and calls `readStdinSync()` for
 * itself, by which point the bytes are long gone: the parent sees the payload,
 * the child sees `{}`. Measured, not inferred — a two-file harness reproduces it
 * in isolation.
 *
 * That is why no Stop handler has ever had a `transcript_path` to read, and so
 * why their metric extraction has always fallen through to defaults. Caching the
 * payload here fixes every self-executing handler at once, including ones not
 * yet written, rather than converting six handlers to a `run(context)` shape and
 * leaving the seventh to rediscover this.
 */
let _processPayload = null;

/**
 * Whether a parsed payload carries nothing a handler could act on.
 * @param {*} value
 * @returns {boolean}
 * @private
 */
function _isEmptyPayload(value) {
  if (value == null) return true;
  if (typeof value !== 'object') return false;
  return Object.keys(value).length === 0;
}

/** Guard so repeated reader calls in one process install the listeners once. */
let crashRecorderInstalled = false;

/**
 * The event this process is handling, once known.
 *
 * The recorder is installed at module load — before any handler has read its
 * payload — so at install time the event name is genuinely unknown. Keeping it
 * in a mutable cell lets a crash that happens LATER be attributed correctly,
 * while a crash that happens EARLIER is still recorded, as 'unknown'. Recording
 * an unattributed failure beats recording none.
 */
let crashRecorderEvent = null;

/**
 * Make a hook crash observable, without changing what happens next.
 *
 * v2.1.34 (R9). bkit's hook layer holds 333 catch blocks and 188 of them
 * swallow without a trace. Most are legitimately best-effort — a hook must not
 * take down the user's session because bookkeeping failed — but a layer where
 * every failure is silent is a layer where "working" and "broken" look
 * identical, which is exactly how eight shipped features stayed dead across
 * releases while every test passed.
 *
 * This records the failure and then lets the original behaviour proceed:
 * an uncaught exception still terminates with code 1, an unhandled rejection is
 * still non-fatal. Observation only — control flow is untouched, because a
 * mechanism that also changed semantics would be a second thing to debug.
 *
 * @param {string|undefined} event
 * @returns {void}
 */
function installCrashRecorder(event) {
  if (event) crashRecorderEvent = event;
  if (crashRecorderInstalled) return;
  crashRecorderInstalled = true;
  const record = (status, err) => {
    try {
      require('../hook-dispatch').recordOutcome(
        crashRecorderEvent || process.env.CLAUDE_HOOK_EVENT || 'unknown',
        status,
        (err && (err.stack || err.message)) || String(err)
      );
    } catch (_) { /* nothing left to fall back to */ }
  };

  /*
   * `uncaughtExceptionMonitor` is the API built for exactly this: it observes
   * and Node still applies its default afterwards.
   *
   * The first version of this used `process.on('uncaughtException')` plus
   * `process.on('unhandledRejection')`, with a comment claiming control flow was
   * untouched. Both halves were wrong, and measured:
   *
   *   no listener            exit=1, stack on stderr
   *   with the old listeners exit=0, no stack
   *
   * Registering an `unhandledRejection` listener SUPPRESSES Node's default,
   * which has been fatal since Node 15. So the recorder built to end silent
   * failure introduced a new one: a hook that died on a rejection exited 0 and
   * printed nothing, with the stack visible only in a ledger nobody reads at
   * the moment of the crash.
   *
   * The monitor keeps both properties — verified on this runtime: a throw and an
   * unhandled rejection each still exit 1 and still print their stack, and both
   * are observed.
   */
  process.on('uncaughtExceptionMonitor', (err) => {
    record('threw', err);
  });
}

/**
 * Extract the assistant text a Stop handler wants to scan for metrics.
 *
 * Why this exists: `readStdinSync` returns the *parsed* hook payload — an
 * object, never a string. Three Stop handlers were treating its return value
 * as text and calling `.match()` on it, which throws TypeError on the first
 * pattern and is then swallowed by the handler's own try/catch. The metrics
 * those handlers exist to collect were never written, and the failure was
 * invisible because the handler still printed its success message.
 *
 * The payload itself never carries the assistant's answer — only
 * `transcript_path` does. So the text is read from the transcript's trailing
 * assistant messages. Only `text` blocks are kept: `thinking` is not the
 * agent's reported result, and `tool_use` blocks are structured input that
 * would produce false regex hits (a tool argument containing "pass rate: 100%"
 * is not a measurement).
 *
 * Falls back to `JSON.stringify(input)` when no transcript is readable, which
 * matches what gap-detector-stop.js has always done — a string, so callers can
 * regex it without crashing, even if it rarely matches.
 *
 * @param {*} input - Parsed hook payload (or a string, passed through)
 * @param {Object} [options]
 * @param {number} [options.maxMessages=5] - Trailing assistant messages to keep
 * @returns {string} Text safe to run regex against — never null/undefined
 */
function readHookText(input, options = {}) {
  if (typeof input === 'string') return input;
  if (!input || typeof input !== 'object') return '';

  const maxMessages = options.maxMessages || 5;
  const transcriptPath = input.transcript_path || input.transcriptPath;

  if (transcriptPath) {
    // br043: only read transcripts under the CC session projects dir or the
    // project dir — a crafted payload could otherwise point this hook at an
    // arbitrary file and have its contents regexed / surfaced. Both sides are
    // resolved through fs.realpathSync so a symlink planted inside an allowed
    // dir cannot pass the prefix check while pointing elsewhere; if the
    // transcript path itself cannot be resolved (e.g. ENOENT), fail closed
    // and skip the read.
    let resolved = null;
    try {
      resolved = fs.realpathSync.native
        ? fs.realpathSync.native(transcriptPath)
        : fs.realpathSync.call(fs, transcriptPath);
    } catch (_e) {
      resolved = null; // nonexistent/unreadable path — do not read it
    }
    const allowed = [
      path.join(os.homedir(), '.claude', 'projects'),
      process.env.CLAUDE_PROJECT_DIR || process.cwd(),
    ]
      .filter(Boolean)
      .map((dir) => {
        try {
          return fs.realpathSync.native
            ? fs.realpathSync.native(dir)
            : fs.realpathSync.call(fs, dir);
        } catch (_e) {
          return path.resolve(dir); // dir may not exist yet — plain resolve
        }
      });
    const permitted =
      resolved !== null &&
      allowed.some(
        (dir) => resolved === dir || resolved.startsWith(dir + path.sep)
      );
    if (permitted) {
      try {
      const lines = fs.readFileSync(transcriptPath, 'utf8').split('\n');
      const collected = [];

      for (let i = lines.length - 1; i >= 0 && collected.length < maxMessages; i--) {
        if (!lines[i]) continue;

        let entry;
        try {
          entry = JSON.parse(lines[i]);
        } catch (_) {
          continue; // partial write / non-JSON line — skip, don't abort
        }
        if (!entry || entry.type !== 'assistant') continue;

        const content = entry.message && entry.message.content;
        if (typeof content === 'string') {
          collected.push(content);
          continue;
        }
        if (!Array.isArray(content)) continue;

        const text = content
          .filter((block) => block && block.type === 'text' && typeof block.text === 'string')
          .map((block) => block.text)
          .join('\n');
        if (text) collected.push(text);
      }

      if (collected.length > 0) {
        return collected.reverse().join('\n');
      }
        } catch (e) {
          getDebug().debugLog('io', 'readHookText transcript read failed', {
            transcriptPath,
            error: e && e.message,
          });
        }
      } else {
        getDebug().debugLog('io', 'readHookText transcript path outside allowed dirs — skipping read', {
          transcriptPath,
          resolved,
        });
      }
    }

  try {
    return JSON.stringify(input);
  } catch (_) {
    return '';
  }
}

module.exports = {
  withDispatchRecord,
  installCrashRecorder,
  readHookText,
  _internal: {
    getProcessPayload: () => _processPayload,
    isEmptyPayload: _isEmptyPayload,
  },
};