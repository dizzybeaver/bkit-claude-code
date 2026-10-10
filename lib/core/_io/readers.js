/**
 * stdin readers + hook input parsing.
 * Sub-module of lib/core/io.js; import from lib/core/io.js, not from this file directly.
 *
 * I/O Utilities
 * @module lib/core/io
 * @version 2.1.10
 *
 * Claude Code 전용 플러그인으로 단순화 (v1.5.0). Tag synced to 2.0.0 per ENH-263 (2026-04-21).
 */

const fs = require('fs');
const { STDIN_READ_TIMEOUT_MS } = require('../constants');
const { MAX_CONTEXT_LENGTH, STDIN_CHUNK_SIZE, truncateContext } = require('./shared');

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

/*
 * ENH-466 (v2.1.37) — the permission-mode policy, loaded lazily for the same reason
 * `debug` is: this module is required at the top of all 28 hook scripts, and a
 * load-time require chain is one more thing that can fail before a handler has
 * read its payload. The policy is a pure lookup table with no dependencies of its
 * own, so the lazy handle costs nothing on the hot path.
 */
let _permissionModePolicy = null;
function getPermissionModePolicy() {
  if (!_permissionModePolicy) {
    _permissionModePolicy = require('../../domain/policy/permission-mode-policy');
  }
  return _permissionModePolicy;
}

// Dispatch recording + the payload cache live in the observability sibling;
// readStdinSync/readStdinBounded wrap their readers with them.
const observability = require('./observability');
const { withDispatchRecord } = observability;
const { getProcessPayload, isEmptyPayload } = observability._internal;

/**
 * stdin에서 JSON 동기적 읽기 (유계 parse-early 리더)
 *
 * Issue #139: the previous `fs.readFileSync(0, 'utf8')` blocks until stdin EOF
 * with NO timeout. A hook therefore stalls for as long as Claude Code keeps the
 * stdin write-end open (observed up to ~15.5 min, far past the hook's own 10 s
 * timeout). This reader reads fd 0 incrementally and returns the instant the
 * accumulated buffer holds a complete JSON value — it never waits for EOF, which
 * is precisely the source of the stall. Used by every bkit hook script, so the
 * fix is central: all hook events are protected, not just Stop.
 *
 * The raw-fd `fs.readSync` path creates no libuv stream handle, so the process
 * exits promptly after this returns even when the pipe is still held open.
 *
 * H5 fix (audit) preserved: a malformed/truncated JSON-RPC envelope used to be
 * indistinguishable from a valid empty object (silently returned {}). Every
 * parse failure is recorded via debugLog, and BKIT_STRICT_STDIN=1 rethrows so a
 * debugging session sees the real error instead of a fabricated empty input.
 *
 * Residual (accepted): the deadline is best-effort — it is only checked between
 * blocking `readSync` calls, so a truly empty-but-held-open pipe can still block
 * inside a single read until EOF. Callers that must be hard-bounded even then
 * (the turn-gating Stop hook) use `readStdinBounded` instead.
 *
 * @returns {*}
 */
function readStdinSyncInner() {
  const deadline = Date.now() + STDIN_READ_TIMEOUT_MS;
  const tmp = Buffer.alloc(STDIN_CHUNK_SIZE);
  let buf = Buffer.alloc(0);
  try {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      // parse-early: return as soon as the buffer holds a complete JSON value.
      if (buf.length > 0) {
        try {
          return JSON.parse(buf.toString('utf8'));
        } catch (_) {
          /* incomplete — read more */
        }
      }
      if (Date.now() > deadline) break; // best-effort bound between reads
      let n = 0;
      try {
        n = fs.readSync(0, tmp, 0, STDIN_CHUNK_SIZE, null);
      } catch (e) {
        if (e.code === 'EAGAIN') continue; // non-blocking fd, no data yet
        if (e.code === 'EOF') { n = 0; } // some platforms surface EOF as a throw
        else throw e;
      }
      if (n === 0) break; // real EOF
      buf = Buffer.concat([buf, tmp.slice(0, n)]);
    }
    return JSON.parse(buf.toString('utf8')); // final attempt (empty → throws → {})
  } catch (e) {
    getDebug().debugLog('io', 'readStdinSync parse failure', {
      error: e && e.message,
      strict: process.env.BKIT_STRICT_STDIN === '1',
    });
    /*
     * v2.1.34 — this is what `degraded` means, and until now nothing produced it.
     *
     * Returning `{}` lets the hook keep running, which is right: a hook must not
     * take down the session over a malformed envelope. But every guard
     * downstream then inspects an empty payload, finds no command and no file
     * path, and ALLOWS. The hook exits 0 having enforced nothing — the single
     * most dangerous silent state in the layer, and it left no trace at all.
     *
     * Only recorded when bytes actually arrived and failed to parse. An empty
     * stdin is a direct invocation (a test, a CLI run), not a degradation, and
     * recording it would fill the ledger with noise from the tooling.
     */
    if (buf.length > 0) {
      /*
       * Recorded only when the degradation can be ATTRIBUTED to a hook event.
       *
       * Without that condition the suite poisons its own project: several tests
       * feed deliberately malformed payloads to this reader, and each one wrote
       * an `unknown` failure into `.bkit/runtime/hook-dispatch.ndjson`. Running
       * the tests then made the next session open with "bkit hooks reported 3
       * failure(s)" — a warning about the test suite doing its job. A guard that
       * cries wolf is one people learn to skip, and then the real failure it was
       * built for goes past unread too.
       *
       * A genuine hook invocation names its event: the host sets
       * CLAUDE_HOOK_EVENT, and even a truncated envelope usually still carries
       * `hook_event_name`. An unattributable degradation cannot be told apart
       * from a direct CLI or test invocation, so it is left alone.
       */
      const named = process.env.CLAUDE_HOOK_EVENT
        || (buf.toString('utf8').match(/"hook_event_name"\s*:\s*"([A-Za-z]+)"/) || [])[1];
      if (named) {
        try {
          require('../hook-dispatch').recordOutcome(
            named,
            'degraded',
            `stdin payload did not parse (${buf.length} bytes): ${e && e.message}`
          );
        } catch (_) { /* the recorder must never be the thing that breaks */ }
      }
    }
    if (process.env.BKIT_STRICT_STDIN === '1') {
      throw e; /* surface the real error in strict/debug mode */
    }
    return {};
  }
}

/**
 * stdin에서 JSON 읽기 — parse-early + hard timeout으로 완전 유계화 (Issue #139).
 *
 * The async, event-based counterpart to readStdinSync for hooks that MUST never
 * exceed a wall-clock budget even when stdin carries no data / a truncated
 * payload while the pipe is held open (cases the sync reader cannot hard-bound,
 * because its deadline can only be checked between blocking `readSync` calls).
 *
 * Two guarantees:
 *  1. parse-early — resolves the instant the accumulated data is valid JSON,
 *     without waiting for EOF.
 *  2. hard timeout — a `setTimeout` resolves with the best available value once
 *     `timeoutMs` elapses, so the read can never block longer than that.
 *
 * Critically, it destroys `process.stdin` on resolve. Without that, the open
 * stdin handle keeps the event loop alive until EOF and the PROCESS lingers even
 * though the payload was already parsed — reintroducing the very stall we fix.
 *
 * @param {number} [timeoutMs=STDIN_READ_TIMEOUT_MS] - Hard wall-clock budget (ms)
 * @returns {Promise<*>} Parsed payload, or {} on timeout/parse-failure
 */
function readStdinBoundedInner(timeoutMs) {
  const budget = (typeof timeoutMs === 'number' && timeoutMs > 0)
    ? timeoutMs
    : STDIN_READ_TIMEOUT_MS;
  return new Promise((resolve) => {
    let data = '';
    let done = false;
    let timer = null;

    const cleanup = () => {
      if (timer) clearTimeout(timer);
      try { process.stdin.pause(); } catch (_) { /* ignore */ }
      process.stdin.removeAllListeners('data');
      process.stdin.removeAllListeners('end');
      process.stdin.removeAllListeners('error');
      // Release the stdin handle so the event loop can drain and the process
      // can exit promptly even if CC keeps the write-end open.
      try { process.stdin.destroy(); } catch (__) { /* ignore */ }
    };

    const finish = (value) => {
      if (done) return;
      done = true;
      cleanup();
      resolve(value);
    };

    const parseOrEmpty = () => {
      try {
        return JSON.parse(data);
      } catch (e) {
        getDebug().debugLog('io', 'readStdinBounded parse failure', {
          error: e && e.message,
          bytes: data.length,
        });
        return {};
      }
    };

    timer = setTimeout(() => {
      getDebug().debugLog('io', 'readStdinBounded hard timeout', {
        timeoutMs: budget,
        bytes: data.length,
      });
      finish(parseOrEmpty());
    }, budget);
    if (timer.unref) timer.unref();

    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => {
      data += chunk;
      // parse-early: resolve the moment we hold a complete JSON value.
      try {
        const parsed = JSON.parse(data);
        finish(parsed);
      } catch (__) {
        /* incomplete — keep reading */
      }
    });
    process.stdin.on('end', () => finish(parseOrEmpty()));
    process.stdin.on('error', () => finish({}));
  });
}

/**
 * stdin에서 JSON 비동기 읽기
 *
 * Mirrors the H5 fix: parse failures are debugLogged (and rethrown under
 * BKIT_STRICT_STDIN) rather than silently resolved to {}.
 *
 * @returns {Promise<*>}
 */
async function readStdin() {
  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', chunk => data += chunk);
    process.stdin.on('end', () => {
      try {
        resolve(JSON.parse(data));
      } catch (e) {
        getDebug().debugLog('io', 'readStdin parse failure', {
          error: e && e.message,
          strict: process.env.BKIT_STRICT_STDIN === '1',
        });
        if (process.env.BKIT_STRICT_STDIN === '1') {
          reject(e); /* surface the real error in strict/debug mode */
          return;
        }
        resolve({});
      }
    });
  });
}

/**
 * Hook 입력 파싱
 *
 * H4 fix (audit): absent fields now return null (not '') so callers can
 * distinguish "no value supplied" from "empty string". Returning '' for
 * absent values caused empty-vs-null branch bugs (e.g. treating "no feature"
 * as "feature named ''"). Callers branching on a field's presence should use
 * `value == null` rather than `value === ''`.
 *
 * ENH-466 (v2.1.37) — `permissionMode` joins the five fields this parser has always
 * extracted. Claude Code sends `permission_mode` on EVERY hook event, and through
 * v2.1.36 bkit read it nowhere, so every guard behaved the same whether the user
 * had asked for maximum oversight or had run with `--dangerously-skip-permissions`.
 * Unlike the other fields it is normalized rather than picked verbatim: an absent
 * or unrecognized value becomes `'default'`, which changes nothing, so older
 * Claude Code builds keep their current behaviour (see permission-mode-policy.js
 * for why no version floor could be established for the field).
 *
 * @param {*} input
 * @returns {{toolName: ?string, filePath: ?string, content: ?string, command: ?string, oldString: ?string, permissionMode: string}}
 */
function parseHookInput(input) {
  const pick = (...vals) => {
    for (const v of vals) {
      if (v !== undefined && v !== null && v !== '') return v;
    }
    return null;
  };
  return {
    toolName: pick(input?.tool_name, input?.toolName),
    filePath: pick(input?.tool_input?.file_path, input?.tool_input?.filePath),
    content: pick(input?.tool_input?.content),
    command: pick(input?.tool_input?.command),
    oldString: pick(input?.tool_input?.old_string),
    permissionMode: getPermissionModePolicy().normalizeMode(
      pick(input?.permission_mode, input?.permissionMode)
    ),
  };
}

/**
 * Read JSON from stdin synchronously, and record the dispatch.
 * @returns {*}
 */
function readStdinSync() {
  const value = readStdinSyncInner();
  /*
   * Empty read + a payload already taken in this process = a handler dispatched
   * by another handler that drained stdin first. Hand back what was read rather
   * than the `{}` that made every downstream metric fall through to its default.
   * The dispatch is deliberately not re-recorded: one event, one ledger entry.
   */
  if (isEmptyPayload(value) && getProcessPayload()) return getProcessPayload();
  return withDispatchRecord(value);
}

/**
 * Bounded stdin read, and record the dispatch.
 * @param {number} [timeoutMs]
 * @returns {Promise<*>}
 */
function readStdinBounded(timeoutMs) {
  return readStdinBoundedInner(timeoutMs).then(withDispatchRecord);
}

module.exports = {
  MAX_CONTEXT_LENGTH,
  truncateContext,
  readStdinSync,
  readStdinBounded,
  readStdin,
  parseHookInput,
};