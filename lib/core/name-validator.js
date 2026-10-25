/**
 * Path-Safe Name Validator
 * @module lib/core/name-validator
 * @version 2.1.22
 *
 * Validates user-derived names before they are interpolated into file paths.
 * Closes path-traversal holes (audit C3/C4/M8) by rejecting anything outside
 * the safe [A-Za-z0-9_-] set, so parent-directory (`..`) and separator (`/`)
 * sequences can never reach `path.join`.
 *
 * Shared across MCP tool boundaries and lib path-join sites so the rule lives
 * in exactly one place (design Option C).
 */

const crypto = require('crypto');

/**
 * Allowlist pattern for a path-safe name segment.
 * Matches one or more ASCII letters, digits, underscore, or hyphen.
 * @type {RegExp}
 */
const NAME_RE = /^[A-Za-z0-9_-]+$/;

/**
 * Validate a user-derived name used in path construction.
 *
 * @param {string} name - Candidate name (e.g. checkpoint id, feature name).
 * @param {string} [label='name'] - Human label for the error message.
 * @returns {string} The validated name (unchanged).
 * @throws {Error} If `name` is not a string or contains characters outside
 *   [A-Za-z0-9_-]. Failing closed here prevents `..`/`/` from reaching
 *   `path.join`, so traversal attempts never escape their intended directory.
 */
function validateName(name, label = "name") {
  if (typeof name !== "string" || !NAME_RE.test(name)) {
    throw new Error(
      `Invalid ${label}: must match [A-Za-z0-9_-]+ (got: ${JSON.stringify(name)})`
    );
  }
  return name;
}

/**
 * Validate a PDCA feature name before it reaches path construction.
 *
 * Thin wrapper over validateName with a fixed label, so the lib path-join
 * chokepoints (feature-manager / resume / state-transitions) read as intent
 * rather than re-stating the pattern. Closes M8 (audit): feature names are
 * user-derived and spliced into `${feature}.json`, so an unvalidated value
 * could write outside `.bkit/` (e.g. overwrite package.json). Every site that
 * builds a path from a feature routes through this.
 *
 * @param {string} feature - Candidate feature name.
 * @returns {string} The validated feature name (unchanged).
 * @throws {Error} If `feature` is not path-safe.
 */
function validateFeatureName(feature) {
  return validateName(feature, "feature name");
}

/**
 * Non-throwing check for a path-safe feature name (FR-02, br151).
 *
 * Single canonical boolean entry the registration surfaces (MCP tool inputs,
 * feature-manager registration) call pre-write so invalid names are rejected
 * at intake instead of exploding later inside path construction. Uses the
 * exact same grammar as validateName/validateFeatureName — no weakening.
 *
 * @param {string} name - Candidate feature name.
 * @returns {boolean} True iff `name` is a non-empty [A-Za-z0-9_-]+ string.
 */
function isValidFeatureName(name) {
  return typeof name === 'string' && NAME_RE.test(name);
}

/**
 * Slugify a feature name into a path-safe segment (FR-03, br151).
 * // Design Ref: §3.2/§7
 *
 * Already-valid names pass through UNCHANGED (byte-identical paths vs the
 * pre-fix throw-on-anything path), so no existing archive location moves.
 * Invalid names (spaces, parens, em-dashes, scoped CLI leftovers like
 * "feat --scope module-1") are slugified instead of throwing: lowercase,
 * collapse [^a-z0-9-]+ to '-', trim '-'. Because distinct raw names can
 * collapse to the same slug ("a b" vs "a-b"), a deterministic 8-hex sha1
 * suffix of the raw name is appended, so slugs never collide. Traversal
 * sequences cannot survive: '/' and '.' both fall outside the kept set.
 *
 * @param {string} name - Raw feature name.
 * @returns {string} Path-safe segment: `name` itself when valid, else
 *   `<slug>-<sha1_8>`.
 * @throws {Error} If `name` is not a string (fail closed, like validateName).
 */
function slugifyFeatureName(name) {
  if (typeof name !== 'string') {
    throw new Error(
      `Invalid feature name: must be a string (got: ${JSON.stringify(name)})`
    );
  }
  if (NAME_RE.test(name)) return name;
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  const hash = crypto.createHash('sha1').update(name, 'utf8').digest('hex');
  return `${slug || 'feature'}-${hash.slice(0, 8)}`;
}

module.exports = {
  NAME_RE,
  validateName,
  validateFeatureName,
  isValidFeatureName,
  slugifyFeatureName,
};
