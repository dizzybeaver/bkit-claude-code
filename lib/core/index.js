/**
 * @bkit/core - Core Module Entry Point
 * @module lib/core
 * @version 2.1.10
 *
 * Claude Code plugin core module (v2.0.0)
 */

const platform = require('./platform');
const cache = require('./cache');
const io = require('./io');
const debug = require('./debug');
const config = require('./config');
const file = require('./file');
const paths = require('./paths');
const constants = require('./constants');
const errors = require('./errors');
const stateStore = require('./state-store');
// M8/C3/C4 (audit): path-safe name validation. Wired into the core barrel so
// lib callers (via getCore()) and servers reach it uniformly.
const nameValidator = require('./name-validator');

// 9 missing modules (br051)
const hookDispatch = require('./hook-dispatch');
const hookReachability = require('./hook-reachability');
const activeSkillMarker = require('./active-skill-marker');
const contextBudget = require('./context-budget');
const sessionCtxFp = require('./session-ctx-fp');
const sessionTitleCache = require('./session-title-cache');
const skillName = require('./skill-name');
const version = require('./version');
const worktreeDetector = require('./worktree-detector');

module.exports = {
  // Platform (9 exports)
  detectPlatform: platform.detectPlatform,
  BKIT_PLATFORM: platform.BKIT_PLATFORM,
  isClaudeCode: platform.isClaudeCode,
  PLUGIN_ROOT: platform.PLUGIN_ROOT,
  PROJECT_DIR: platform.PROJECT_DIR,
  BKIT_PROJECT_DIR: platform.BKIT_PROJECT_DIR,
  getPluginPath: platform.getPluginPath,
  getProjectPath: platform.getProjectPath,
  getTemplatePath: platform.getTemplatePath,

  // Cache (10 exports)
  get: cache.get,
  set: cache.set,
  invalidate: cache.invalidate,
  clear: cache.clear,
  globalCache: cache.globalCache,
  _cache: cache._cache,
  DEFAULT_TTL: cache.DEFAULT_TTL,
  TOOLSEARCH_TTL: cache.TOOLSEARCH_TTL,
  getToolSearchCache: cache.getToolSearchCache,
  setToolSearchCache: cache.setToolSearchCache,

  // I/O (17 exports — +7 from br051: readHookText, outputBlockWithContext,
  // outputContext, outputStopSurface, outputStopAllow, isCursorRuntime,
  // hasInFlightBackgroundWork)
  MAX_CONTEXT_LENGTH: io.MAX_CONTEXT_LENGTH,
  truncateContext: io.truncateContext,
  readStdinSync: io.readStdinSync,
  readStdinBounded: io.readStdinBounded,
  readStdin: io.readStdin,
  parseHookInput: io.parseHookInput,
  outputAllow: io.outputAllow,
  outputBlock: io.outputBlock,
  outputBlockWithContext: io.outputBlockWithContext,
  outputAsk: io.outputAsk,
  outputContext: io.outputContext,
  outputEmpty: io.outputEmpty,
  outputStopSurface: io.outputStopSurface,
  outputStopAllow: io.outputStopAllow,
  xmlSafeOutput: io.xmlSafeOutput,
  isCursorRuntime: io.isCursorRuntime,
  hasInFlightBackgroundWork: io.hasInFlightBackgroundWork,
  readHookText: io.readHookText,

  // Debug (3 exports)
  DEBUG_LOG_PATHS: debug.DEBUG_LOG_PATHS,
  getDebugLogPath: debug.getDebugLogPath,
  debugLog: debug.debugLog,

  // Config (6 exports — +getUIConfig from br051)
  loadConfig: config.loadConfig,
  getConfig: config.getConfig,
  getConfigArray: config.getConfigArray,
  getBkitConfig: config.getBkitConfig,
  safeJsonParse: config.safeJsonParse,
  getUIConfig: config.getUIConfig,

  // File (8 exports)
  TIER_EXTENSIONS: file.TIER_EXTENSIONS,
  DEFAULT_EXCLUDE_PATTERNS: file.DEFAULT_EXCLUDE_PATTERNS,
  DEFAULT_FEATURE_PATTERNS: file.DEFAULT_FEATURE_PATTERNS,
  isSourceFile: file.isSourceFile,
  isCodeFile: file.isCodeFile,
  isUiFile: file.isUiFile,
  isEnvFile: file.isEnvFile,
  extractFeature: file.extractFeature,
  GENERIC_NAMES: file.GENERIC_NAMES,

  // Paths (11 exports — +findAllDocs from br051)
  STATE_PATHS: paths.STATE_PATHS,
  LEGACY_PATHS: paths.LEGACY_PATHS,
  CONFIG_PATHS: paths.CONFIG_PATHS,
  ensureBkitDirs: paths.ensureBkitDirs,
  getDocPaths: paths.getDocPaths,
  resolveDocPaths: paths.resolveDocPaths,
  findDoc: paths.findDoc,
  findAllDocs: paths.findAllDocs,
  getArchivePath: paths.getArchivePath,
  backupToPluginData: paths.backupToPluginData,
  restoreFromPluginData: paths.restoreFromPluginData,

  // Constants (v2.0.0 - centralized magic numbers) — all 32 public names
  MATCH_RATE_THRESHOLD: constants.MATCH_RATE_THRESHOLD,
  MATCH_RATE_WARNING: constants.MATCH_RATE_WARNING,
  MAX_HISTORY_ENTRIES: constants.MAX_HISTORY_ENTRIES,
  AUTO_START_THRESHOLD: constants.AUTO_START_THRESHOLD,
  MAX_FEATURES: constants.MAX_FEATURES,
  MAX_PDCA_ITERATIONS: constants.MAX_PDCA_ITERATIONS,
  PDCA_PHASES: constants.PDCA_PHASES,
  AUTOMATION_LEVELS: constants.AUTOMATION_LEVELS,
  MAX_TEAMMATES: constants.MAX_TEAMMATES,
  MAX_TEAM_MESSAGES: constants.MAX_TEAM_MESSAGES,
  MAX_VERSION_HISTORY: constants.MAX_VERSION_HISTORY,
  DEFAULT_CACHE_TTL: constants.DEFAULT_CACHE_TTL,
  TOOLSEARCH_CACHE_TTL: constants.TOOLSEARCH_CACHE_TTL,
  IMPORT_CACHE_TTL: constants.IMPORT_CACHE_TTL,
  SKILL_CACHE_TTL: constants.SKILL_CACHE_TTL,
  BKIT_CONFIG_CACHE_TTL: constants.BKIT_CONFIG_CACHE_TTL,
  HOOK_TIMEOUT_MS: constants.HOOK_TIMEOUT_MS,
  STDIN_READ_TIMEOUT_MS: constants.STDIN_READ_TIMEOUT_MS,
  MAX_QUALITY_HISTORY: constants.MAX_QUALITY_HISTORY,
  MAX_SESSIONS_PER_SKILL: constants.MAX_SESSIONS_PER_SKILL,
  MAX_METADATA_PER_SKILL: constants.MAX_METADATA_PER_SKILL,
  HEALTH_CRITICAL_THRESHOLD: constants.HEALTH_CRITICAL_THRESHOLD,
  HEALTH_ATTENTION_THRESHOLD: constants.HEALTH_ATTENTION_THRESHOLD,
  CLASSIFICATION_THRESHOLDS: constants.CLASSIFICATION_THRESHOLDS,
  LOCK_TIMEOUT_MS: constants.LOCK_TIMEOUT_MS,
  LOCK_STALE_MS: constants.LOCK_STALE_MS,
  LOCK_RETRY_INTERVAL_MS: constants.LOCK_RETRY_INTERVAL_MS,
  LOCK_MAX_RETRIES: constants.LOCK_MAX_RETRIES,
  DESTRUCTIVE_PATTERNS: constants.DESTRUCTIVE_PATTERNS,
  LOOP_DETECT_LIMITS: constants.LOOP_DETECT_LIMITS,
  generateUUID: constants.generateUUID,

  // Namespace object (pre-br051 contract) — consumers do getCore().constants.X
  constants,

  // Errors (v2.0.0 - standardized error handling)
  BkitError: errors.BkitError,
  ERROR_CODES: errors.ERROR_CODES,
  SEVERITY: errors.SEVERITY,
  safeCatch: errors.safeCatch,

  // StateStore (v2.0.0 - atomic file I/O with locking) — 10 methods
  read: stateStore.read,
  write: stateStore.write,
  exists: stateStore.exists,
  remove: stateStore.remove,
  appendJsonl: stateStore.appendJsonl,
  lock: stateStore.lock,
  unlock: stateStore.unlock,
  lockedUpdate: stateStore.lockedUpdate,
  sleepSync: stateStore.sleepSync,
  stateStore,  // legacy namespace object

  // NameValidator (v2.1.22 - path-safe name validation, audit C3/C4/M8)
  NAME_RE: nameValidator.NAME_RE,
  validateName: nameValidator.validateName,
  validateFeatureName: nameValidator.validateFeatureName,

  // HookDispatch (v2.1.13 - hook dispatch ledger)
  DISPATCH_FILE: hookDispatch.DISPATCH_FILE,
  MAX_LEDGER_BYTES: hookDispatch.MAX_LEDGER_BYTES,
  recordDispatch: hookDispatch.recordDispatch,
  recordOutcome: hookDispatch.recordOutcome,
  readDispatch: hookDispatch.readDispatch,
  readFailures: hookDispatch.readFailures,
  FAILURE_WINDOW_MS: hookDispatch.FAILURE_WINDOW_MS,
  agentsSeen: hookDispatch.agentsSeen,
  missingEvents: hookDispatch.missingEvents,
  toolsFor: hookDispatch.toolsFor,

  // HookReachability (v2.1.13 - hook canary + event-driven health)
  evaluateReachability: hookReachability.evaluateReachability,
  buildReachabilityWarning: hookReachability.buildReachabilityWarning,
  CANARY_KEYS: hookReachability.CANARY_KEYS,
  EVENT_DRIVEN_KEYS: hookReachability.EVENT_DRIVEN_KEYS,
  DEFAULT_STALE_THRESHOLD_MS: hookReachability.DEFAULT_STALE_THRESHOLD_MS,

  // ActiveSkillMarker (v2.1.13 - PDCA skill gate)
  writeActiveSkill: activeSkillMarker.writeActiveSkill,
  readActiveSkill: activeSkillMarker.readActiveSkill,
  clearActiveSkill: activeSkillMarker.clearActiveSkill,
  consumeActiveSkill: activeSkillMarker.consumeActiveSkill,
  markerPath: activeSkillMarker.markerPath,
  DEFAULT_TTL_MS: activeSkillMarker.DEFAULT_TTL_MS,

  // ContextBudget (v2.1.13 - context truncation with priority)
  applyBudget: contextBudget.applyBudget,
  DEFAULT_MAX_CHARS: contextBudget.DEFAULT_MAX_CHARS,
  DEFAULT_PRIORITY_KEYS: contextBudget.DEFAULT_PRIORITY_KEYS,

  // SessionCtxFp (v2.1.13 - session fingerprint dedup)
  computeFingerprint: sessionCtxFp.computeFingerprint,
  shouldDedup: sessionCtxFp.shouldDedup,
  record: sessionCtxFp.record,

  // SessionTitleCache (v2.1.13 - session title memoization)
  readCache: sessionTitleCache.readCache,
  writeCache: sessionTitleCache.writeCache,
  clearCache: sessionTitleCache.clearCache,
  isSameAsCached: sessionTitleCache.isSameAsCached,
  getCachePath: sessionTitleCache.getCachePath,
  normalizeStore: sessionTitleCache.normalizeStore,
  keyFor: sessionTitleCache.keyFor,

  // SkillName (v2.1.13 - skill name normalization)
  normalizeSkillName: skillName.normalizeSkillName,

  // Version (v2.1.13 - centralized version)
  BKIT_VERSION: version.BKIT_VERSION,

  // WorktreeDetector (v2.1.13 - worktree safety check)
  inspectWorktree: worktreeDetector.inspectWorktree,
  detectAndWarn: worktreeDetector.detectAndWarn,
  ADVISORY: worktreeDetector.ADVISORY,
};