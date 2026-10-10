/**
 * Phase Control Module
 * @module lib/pdca/phase
 * @version 2.1.10
 */

const fs = require('fs');
const path = require('path');

// Lazy require
let _core = null;
function getCore() {
  if (!_core) {
    _core = require('../core');
  }
  return _core;
}

/**
 * PDCA Phase definitions
 */
const PDCA_PHASES = {
  pm: { order: 0, name: 'PM', icon: '🎯' },
  plan: { order: 1, name: 'Plan', icon: '📋' },
  design: { order: 2, name: 'Design', icon: '📐' },
  do: { order: 3, name: 'Do', icon: '🔨' },
  check: { order: 4, name: 'Check', icon: '🔍' },
  act: { order: 5, name: 'Act', icon: '🔄' },
  qa: { order: 6, name: 'QA', icon: '🧪' },
  report: { order: 7, name: 'Report', icon: '📊' },
  archived: { order: 8, name: 'Archived', icon: '📦' },
  // br032: 'completed' was missing, so getPhaseNumber('completed') fell
  // through to 0 (indistinguishable from pm) and terminal-state checks
  // against it never fired. Order 9 keeps archived(8) < completed(9);
  // both are terminal (see validatePdcaTransition).
  completed: { order: 9, name: 'Completed', icon: '✅' }
};

/**
 * Get phase number from name
 * @param {string} phase - Phase name
 * @returns {number}
 */
function getPhaseNumber(phase) {
  return PDCA_PHASES[phase]?.order || 0;
}

/**
 * Get phase name from number
 * @param {number} phaseNumber - Phase number
 * @returns {string}
 */
function getPhaseName(phaseNumber) {
  for (const [name, info] of Object.entries(PDCA_PHASES)) {
    if (info.order === phaseNumber) return name;
  }
  return 'unknown';
}

/**
 * Get previous PDCA phase
 * @param {string} currentPhase - Current phase name
 * @returns {string|null}
 */
function getPreviousPdcaPhase(currentPhase) {
  const order = ['pm', 'plan', 'design', 'do', 'check', 'act', 'qa', 'report'];
  const index = order.indexOf(currentPhase);
  return index > 0 ? order[index - 1] : null;
}

/**
 * Get next PDCA phase
 * @param {string} currentPhase - Current phase name
 * @returns {string|null}
 */
function getNextPdcaPhase(currentPhase) {
  const order = ['pm', 'plan', 'design', 'do', 'check', 'act', 'qa', 'report'];
  const index = order.indexOf(currentPhase);
  return index >= 0 && index < order.length - 1 ? order[index + 1] : null;
}

/**
 * Find design document for feature
 * @param {string} feature - Feature name
 * @returns {string} Path to design doc or empty string
 */
function findDesignDoc(feature) {
  const { findDoc } = require('../core/paths');
  return findDoc('design', feature);
}

/**
 * Find plan document for feature
 * @param {string} feature - Feature name
 * @returns {string} Path to plan doc or empty string
 */
function findPlanDoc(feature) {
  const { findDoc } = require('../core/paths');
  return findDoc('plan', feature);
}

/**
 * Check phase deliverables exist
 * @param {string|number} phase - Phase name (string) or pipeline phase number (1-9)
 * @param {string} [feature] - Feature name (required for PDCA phase checks)
 * @returns {{exists: boolean, path: string|null, allComplete?: boolean, items?: Array}}
 */
function checkPhaseDeliverables(phase, feature) {
  // Handle pipeline phase number (1-9) - used by phase stop scripts
  if (typeof phase === 'number') {
    return _checkPipelinePhaseDeliverables(phase);
  }

  if (!feature) return { exists: false, path: null };

  const { resolveDocPaths } = require('../core/paths');

  // Map PDCA phase to doc phase (check → analysis)
  const phaseMap = { check: 'analysis', qa: 'qa' };
  const docPhase = phaseMap[phase] || phase;

  const candidates = resolveDocPaths(docPhase, feature);
  if (!candidates.length) return { exists: true, path: null }; // No deliverable required

  for (const fullPath of candidates) {
    if (fs.existsSync(fullPath)) {
      return { exists: true, path: fullPath };
    }
  }

  return { exists: false, path: null };
}

/**
 * Check pipeline phase deliverables (phase 1-9)
 * Returns {allComplete, items} format expected by phase stop scripts
 * @param {number} phaseNumber - Pipeline phase number (1-9)
 * @returns {{allComplete: boolean, items: Array<{name: string, exists: boolean}>}}
 * @private
 */
// br036: minimal self-contained glob matcher (no external deps — jest cannot
// resolve system-hoisted minimatch). Supports the pattern shapes used by the
// deliverable table: `**` cross-segment wildcard, `*` within-segment wildcard,
// and `{a,b,...}` brace groups. Matches dotfiles (dot:true semantics) so
// `.github/workflows/*` resolves.
function _globMatch(relPath, pattern) {
  if (relPath === pattern) return true;
  // expand one level of braces (the deliverable globs use at most one group)
  const braceMatch = pattern.match(/^([^{}]*)\{([^{}]*)\}([^{}]*)$/);
  const patterns = braceMatch
    ? braceMatch[2].split(',').map((alt) => braceMatch[1] + alt + braceMatch[3])
    : [pattern];
  return patterns.some((pat) => {
    let rx = '';
    for (let i = 0; i < pat.length; i++) {
      const c = pat[i];
      if (c === '*') {
        if (pat[i + 1] === '*') {
          rx += '.*';
          i++; // consume the second *
          if (pat[i + 1] === '/') i++; // `**/` also matches zero segments
        } else {
          rx += '[^/]*';
        }
      } else if (c === '?') {
        rx += '[^/]';
      } else {
        rx += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
      }
    }
    try {
      return new RegExp(`^${rx}$`).test(relPath);
    } catch {
      return false;
    }
  });
}

// br036: bounded recursive walk of the project tree (relative POSIX paths).
// Skips node_modules/.git and caps at 20000 entries so huge trees can't hang
// the Stop path. Root-level entries included (phase 9 checks Dockerfile etc.).
function _collectProjectFiles(rootDir, _dir = '', _out = [], _depth = 0) {
  if (_depth > 8 || _out.length > 20000) return _out;
  const abs = _dir ? path.join(rootDir, _dir) : rootDir;
  let entries;
  try {
    entries = fs.readdirSync(abs, { withFileTypes: true });
  } catch {
    return _out;
  }
  for (const e of entries) {
    if (_out.length > 20000) break;
    const rel = _dir ? `${_dir}/${e.name}` : e.name;
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name === '.git') continue;
      _collectProjectFiles(rootDir, rel, _out, _depth + 1);
    } else {
      _out.push(rel);
    }
  }
  return _out;
}

function _checkPipelinePhaseDeliverables(phaseNumber) {
  const { PROJECT_DIR } = getCore();

  const phaseDeliverables = {
    1: [{ name: 'Schema/Terminology document', glob: 'docs/**/schema*' }],
    2: [{ name: 'Coding conventions document', glob: 'docs/**/convention*' }],
    3: [{ name: 'Mockup/Wireframe files', glob: 'docs/**/mockup*' }],
    4: [{ name: 'API design document', glob: 'docs/**/api*' }],
    5: [{ name: 'Design system document', glob: 'docs/**/design-system*' }],
    6: [{ name: 'UI implementation files', glob: 'src/**/*.{tsx,jsx,vue}' }],
    7: [{ name: 'SEO/Security checklist', glob: 'docs/**/seo*' }],
    8: [{ name: 'Code review report', glob: 'docs/**/review*' }],
    9: [{ name: 'Deployment configuration', glob: '{Dockerfile,docker-compose*,vercel.json,.github/workflows/*}' }]
  };

  const deliverables = phaseDeliverables[phaseNumber];
  if (!deliverables) {
    return { allComplete: true, items: [] };
  }

  const items = deliverables.map(d => {
    // br036: evaluate the actual glob against the project tree. The old code
    // assigned d.glob and never used it — any project with docs/ or src/
    // passed every deliverable check. Walk the project (bounded) and match
    // relative paths with minimatch (supports the brace patterns phase 9 uses).
    let exists = false;
    try {
      const files = _collectProjectFiles(PROJECT_DIR);
      exists = files.some((rel) => {
        try {
          return _globMatch(rel, d.glob);
        } catch (err) {
          console.error(`[bkit-pdca] deliverable glob error (${d.glob}):`, err.message);
          return false;
        }
      });
    } catch (e) {
      exists = false;
    }
    return { name: d.name, exists, glob: d.glob };
  });

  const allComplete = items.every(item => item.exists);
  return { allComplete, items };
}

/**
 * Validate phase transition
 * @param {string} feature - Feature name
 * @param {string} fromPhase - Current phase
 * @param {string} toPhase - Target phase
 * @returns {{valid: boolean, reason: string}}
 */
function validatePdcaTransition(feature, fromPhase, toPhase) {
  const fromOrder = getPhaseNumber(fromPhase);
  const toOrder = getPhaseNumber(toPhase);

  // br033: terminal states. Without this, the "allow going back" branch
  // below accepted any transition out of a terminal phase (e.g. a re-pdca
  // of an archived feature silently restarted the cycle).
  if (fromPhase === 'archived') {
    return { valid: false, reason: 'archived is terminal' };
  }
  if (fromPhase === 'completed' && toPhase !== 'archived') {
    return { valid: false, reason: 'completed is terminal; only archived may follow' };
  }

  // Allow going back
  if (toOrder < fromOrder) {
    return { valid: true, reason: 'Returning to earlier phase' };
  }

  // Check if previous deliverable exists (for forward transitions)
  if (toOrder > fromOrder + 1) {
    return { valid: false, reason: `Cannot skip from ${fromPhase} to ${toPhase}` };
  }

  // Check deliverables for current phase
  const deliverable = checkPhaseDeliverables(fromPhase, feature);
  if (!deliverable.exists && fromPhase !== 'do' && fromPhase !== 'act' && fromPhase !== 'qa') {
    return { valid: false, reason: `${fromPhase} deliverable not found` };
  }

  return { valid: true, reason: 'Transition allowed' };
}

module.exports = {
  PDCA_PHASES,
  getPhaseNumber,
  getPhaseName,
  getPreviousPdcaPhase,
  getNextPdcaPhase,
  findDesignDoc,
  findPlanDoc,
  checkPhaseDeliverables,
  validatePdcaTransition,
};
