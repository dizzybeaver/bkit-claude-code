/**
 * Task Creation Module
 * @module lib/task/creator
 * @version 2.1.10
 */

// Lazy require
let _pdca = null;
function getPdca() {
  if (!_pdca) {
    _pdca = require('../pdca');
  }
  return _pdca;
}

/**
 * Generate PDCA task subject
 * @param {string} phase
 * @param {string} feature
 * @returns {string}
 */
function generatePdcaTaskSubject(phase, feature) {
  const phaseIcons = {
    plan: '📋',
    design: '📐',
    do: '🔨',
    check: '🔍',
    act: '🔄',
    report: '📊'
  };

  const icon = phaseIcons[phase] || '📌';
  return `${icon} [${phase.charAt(0).toUpperCase() + phase.slice(1)}] ${feature}`;
}

/**
 * Generate PDCA task description
 * @param {string} phase
 * @param {string} feature
 * @param {string} docPath
 * @returns {string}
 */
function generatePdcaTaskDescription(phase, feature, docPath = '') {
  const descriptions = {
    plan: `Plan phase for ${feature}. Define requirements and scope.`,
    design: `Design phase for ${feature}. Create detailed design document.`,
    do: `Implementation phase for ${feature}. Build according to design.`,
    check: `Verification phase for ${feature}. Run gap analysis.`,
    act: `Improvement phase for ${feature}. Fix gaps found in check.`,
    report: `Reporting phase for ${feature}. Generate completion report.`
  };

  let desc = descriptions[phase] || `${phase} phase for ${feature}`;

  if (docPath) {
    desc += `\n\nReference: ${docPath}`;
  }

  return desc;
}

/**
 * Get PDCA task metadata
 * @param {string} phase
 * @param {string} feature
 * @param {Object} options
 * @returns {Object}
 */
function getPdcaTaskMetadata(phase, feature, options = {}) {
  const { getPhaseNumber } = getPdca();

  return {
    pdcaPhase: phase,
    pdcaOrder: getPhaseNumber(phase),
    feature: feature,
    level: options.level || 'Dynamic',
    createdAt: new Date().toISOString()
  };
}

/**
 * Generate task guidance for phase
 * @param {string} phase
 * @param {string} feature
 * @param {string} blockedByPhase
 * @returns {string}
 */
function generateTaskGuidance(phase, feature, blockedByPhase = '') {
  let guidance = `Phase: ${phase}\nFeature: ${feature}\n\n`;

  if (blockedByPhase) {
    guidance += `⚠️ Blocked by: ${blockedByPhase} phase\n`;
    guidance += `Complete the ${blockedByPhase} phase first.\n\n`;
  }

  const phaseGuidance = {
    plan: 'Create a plan document with requirements and scope.',
    design: 'Create a design document with architecture and implementation details.',
    do: 'Implement according to the design document.',
    check: 'Run /pdca analyze to verify implementation matches design.',
    act: 'Run /pdca iterate to fix any gaps found.',
    report: 'Run /pdca report to generate completion report.'
  };

  guidance += phaseGuidance[phase] || '';

  return guidance;
}

module.exports = {
  generatePdcaTaskSubject,
  generatePdcaTaskDescription,
  getPdcaTaskMetadata,
  generateTaskGuidance,
};
