// lib/core/io.js — wrapper re-exporting _io sub-modules
// Design Ref: br050 — _subdir/ pattern preserves public surface
// The export list below is the ORIGINAL io.js module.exports (18 names),
// preserved verbatim so no consumer changes. _internal helpers
// (getProcessPayload / isEmptyPayload) stay private to the _io sub-modules.
const readers = require('./_io/readers');
const output = require('./_io/output');
const observability = require('./_io/observability');

/*
 * Arm the crash recorder at module load — this file is required at the top of
 * every bkit hook script, so arming here covers the whole lifetime of the
 * process. The event name is filled in later, once a payload is read.
 * (Preserved verbatim from pre-split io.js.)
 */
try { observability.installCrashRecorder(process.env.CLAUDE_HOOK_EVENT || null); } catch (_) { /* never fatal */ }

module.exports = {
  // readers
  MAX_CONTEXT_LENGTH: readers.MAX_CONTEXT_LENGTH,
  truncateContext: readers.truncateContext,
  readStdinSync: readers.readStdinSync,
  readStdinBounded: readers.readStdinBounded,
  readStdin: readers.readStdin,
  parseHookInput: readers.parseHookInput,
  // output
  isCursorRuntime: output.isCursorRuntime,
  hasInFlightBackgroundWork: output.hasInFlightBackgroundWork,
  outputAllow: output.outputAllow,
  outputBlock: output.outputBlock,
  outputBlockWithContext: output.outputBlockWithContext,
  outputAsk: output.outputAsk,
  outputContext: output.outputContext,
  outputEmpty: output.outputEmpty,
  outputStopSurface: output.outputStopSurface,
  outputStopAllow: output.outputStopAllow,
  xmlSafeOutput: output.xmlSafeOutput,
  // observability
  readHookText: observability.readHookText,
};
