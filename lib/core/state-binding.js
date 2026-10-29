/**
 * Source Binding for model-writable runtime state.
 * @module lib/core/state-binding
 * @version 2.1.40
 *
 * hook-audit-fix-wave-1028 (RB5-4 / rb022 writer half + rb016/rb041).
 *
 * Runtime JSON under .bkit/runtime/ is model-writable (rb014 proved the
 * directory unprivileged-writable end-to-end). Any such file that a gate
 * treats as enforcement truth must carry a binding to its AUTHORITATIVE
 * source — mtime + short sha256 — so a consumer can prove the source was
 * present and unmodified when the cache was written, and void the cache
 * the moment the source diverges (deleted, edited, reverted).
 *
 * Pure module: fs + crypto only, no project-internal requires, so it is
 * safe to load from any hook entrypoint without dependency risk.
 *
 * Conventions (both sides of the pair are intentional):
 *   - `sourceBinding(filePath)`  — compute at WRITE time, embed in payload.
 *   - `isBoundValid(bound, filePath)` — check at READ time, deny-bias on
 *     any failure (missing field, missing source, mtime drift, hash drift).
 */

const fs = require('fs');
const crypto = require('crypto');

/** Length of the truncated sha256 hex digest carried in bindings. */
const HASH_HEX_CHARS = 8;

/**
 * Compute an integrity binding for a source file.
 * Returns null when the file does not exist or cannot be read — callers
 * must treat a null binding as "no cache may be written".
 *
 * @param {string} filePath - Absolute path to the authoritative source file.
 * @returns {{srcPath: string, srcMtime: number, srcHash: string} | null}
 */
function sourceBinding(filePath) {
  try {
    const stat = fs.statSync(filePath);
    const contents = fs.readFileSync(filePath);
    return {
      srcPath: filePath,
      srcMtime: stat.mtimeMs,
      srcHash: crypto.createHash('sha256').update(contents).digest('hex').slice(0, HASH_HEX_CHARS),
    };
  } catch (_) {
    return null;
  }
}

/**
 * Validate a previously embedded binding against the live source file.
 * Deny-biased: any missing field, unreadable source, mtime mismatch, or
 * hash mismatch returns false. A falsy `bound` is always invalid.
 *
 * @param {{srcPath?: string, srcMtime?: number, srcHash?: string}|null|undefined} bound
 * @param {string} filePath - Path the binding claims to describe.
 * @returns {boolean} true only when the source exists AND mtime AND hash match.
 */
function isBoundValid(bound, filePath) {
  if (!bound || typeof bound !== 'object') return false;
  if (typeof bound.srcMtime !== 'number' || typeof bound.srcHash !== 'string') return false;
  if (bound.srcPath && bound.srcPath !== filePath) return false;
  try {
    const stat = fs.statSync(filePath);
    if (stat.mtimeMs !== bound.srcMtime) return false;
    const contents = fs.readFileSync(filePath);
    const hash = crypto.createHash('sha256').update(contents).digest('hex').slice(0, HASH_HEX_CHARS);
    return hash === bound.srcHash;
  } catch (_) {
    return false;
  }
}

module.exports = { sourceBinding, isBoundValid, HASH_HEX_CHARS };
