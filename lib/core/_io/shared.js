/**
 * Shared constants for _io sub-modules.
 * Sub-module of lib/core/io.js; import from lib/core/io.js, not from this file directly.
 * @version 2.1.40
 */

const MAX_CONTEXT_LENGTH = 500;

// Read buffer size for the incremental stdin reader (64 KiB — hook payloads are
// far smaller, but a generous chunk keeps large/multi-chunk payloads to one or
// two reads).
const STDIN_CHUNK_SIZE = 65536;

/**
 * 컨텍스트 문자열 자르기
 * @param {string} context
 * @param {number} [maxLength=MAX_CONTEXT_LENGTH]
 * @returns {string}
 */
function truncateContext(context, maxLength = MAX_CONTEXT_LENGTH) {
  if (!context || context.length <= maxLength) return context || '';
  return context.slice(0, maxLength) + '... (truncated)';
}

module.exports = {
  MAX_CONTEXT_LENGTH,
  STDIN_CHUNK_SIZE,
  truncateContext,
};