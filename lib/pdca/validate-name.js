/**
 * Feature-name intake validation (br041).
 *
 * Shared validator for every PDCA feature-name intake point — br041 showed
 * arbitrary argument sentences (`/pdca plan fix the thing now`) flowing into
 * the registry as junk feature rows. One module, one shape contract; intake
 * sites must not grow divergent copies.
 *
 * Shape contract: kebab-ish `^[a-z0-9][a-z0-9_-]{0,63}$` after normalization
 * (trim, lowercase, space/underscore runs -> single hyphen). Anything else is
 * rejected with a reason string — callers surface it on stderr, never a
 * silent drop (br037 lesson).
 *
 * @module lib/pdca/validate-name
 * @version 2.1.13
 */

/** @type {RegExp} Valid normalized feature-name shape (max 64 chars total). */
const FEATURE_NAME_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/;

/** @type {number} Maximum normalized feature-name length. */
const FEATURE_NAME_MAX_LEN = 64;

/**
 * Pure shape check — no normalization. Use where the input is an
 * already-registered name (e.g. addActiveFeature).
 * @param {string} name
 * @returns {boolean}
 */
function isValidFeatureName(name) {
  return typeof name === 'string' && FEATURE_NAME_RE.test(name);
}

/**
 * Normalize a raw feature-name token and validate the result.
 * @param {string} raw - raw argument token as typed
 * @returns {{ok: true, name: string}|{ok: false, reason: string}}
 */
function normalizeFeatureName(raw) {
  if (typeof raw !== 'string' || raw.trim() === '') {
    return { ok: false, reason: 'empty input' };
  }

  const name = raw.trim().toLowerCase().replace(/[ _]+/g, '-');

  if (name.length === 0) {
    return { ok: false, reason: `normalizes to empty: ${JSON.stringify(raw)}` };
  }
  if (name.length > FEATURE_NAME_MAX_LEN) {
    return {
      ok: false,
      reason: `exceeds ${FEATURE_NAME_MAX_LEN} chars (got ${name.length}): ${JSON.stringify(raw)}`,
    };
  }
  if (name.startsWith('-') || name.endsWith('-')) {
    return { ok: false, reason: `leading/trailing hyphen: ${JSON.stringify(raw)}` };
  }
  if (!FEATURE_NAME_RE.test(name)) {
    return {
      ok: false,
      reason: `invalid characters (allowed: a-z 0-9 _ -): ${JSON.stringify(raw)}`,
    };
  }

  return { ok: true, name };
}

module.exports = {
  FEATURE_NAME_RE,
  FEATURE_NAME_MAX_LEN,
  isValidFeatureName,
  normalizeFeatureName,
};
