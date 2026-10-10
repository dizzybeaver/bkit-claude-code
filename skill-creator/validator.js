#!/usr/bin/env node
/**
 * Skill Validator
 * @module skill-creator/validator
 * @version 1.6.0
 *
 * Validates existing skill structure and frontmatter completeness.
 */

const fs = require('fs');
const path = require('path');

const SKILLS_DIR = path.join(__dirname, '..', 'skills');

const REQUIRED_FRONTMATTER = [
  'name',
  'description',
  'classification',
  'deprecation-risk',
  'user-invocable'
];

const VALID_CLASSIFICATIONS = ['workflow', 'capability', 'hybrid'];
const VALID_RISKS = ['none', 'low', 'medium', 'high'];

/**
 * Validate a skill's SKILL.md
 * @param {string} skillName - Skill name
 * @returns {{ valid: boolean, errors: string[], warnings: string[] }}
 */
function validateSkill(skillName) {
  const errors = [];
  const warnings = [];

  const skillPath = path.join(SKILLS_DIR, skillName, 'SKILL.md');

  if (!fs.existsSync(skillPath)) {
    return { valid: false, errors: [`SKILL.md not found: ${skillPath}`], warnings };
  }

  const content = fs.readFileSync(skillPath, 'utf8');
  const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);

  if (!fmMatch) {
    return { valid: false, errors: ['No YAML frontmatter found'], warnings };
  }

  const frontmatter = fmMatch[1];

  // br141: line-based frontmatter key parsing (replaces substring presence check)
  const keyCounts = {};
  const keyValues = {};
  for (const line of frontmatter.split(/\r?\n/)) {
    const m = line.match(/^([a-z0-9-]+):/);
    if (m) {
      keyCounts[m[1]] = (keyCounts[m[1]] || 0) + 1;
      if (keyValues[m[1]] === undefined) keyValues[m[1]] = line.slice(m[1].length + 1).trim();
    }
  }

  // br141: duplicate top-level keys are parser-dependent (br140 defect class)
  for (const key of Object.keys(keyCounts)) {
    if (keyCounts[key] > 1) {
      errors.push(`Duplicate frontmatter key: ${key}`);
    }
  }

  // Required presence
  for (const field of REQUIRED_FRONTMATTER) {
    if (!keyCounts[field]) {
      errors.push(`Missing required field: ${field}`);
    }
  }

  // br141: user-invocable must be a strict boolean literal
  if (keyValues['user-invocable'] !== undefined && keyValues['user-invocable'] !== '') {
    if (keyValues['user-invocable'] !== 'true' && keyValues['user-invocable'] !== 'false') {
      errors.push('Invalid user-invocable value (must be true or false)');
    }
  }

  // br141: trigger-list presence + non-English coverage (8-language contract)
  // Live convention: triggers are declared as an indented "Triggers:" line inside
  // the description block, not as a frontmatter key.
  const hasTriggers = /(^|\n)\s+Triggers?:/i.test(frontmatter);
  if (!hasTriggers) {
    errors.push('Missing trigger list (expected an indented "Triggers:" line in the description block)');
  } else if (!/[\uAC00-\uD7AF\u3040-\u30FF\u4E00-\u9FFF]/.test(frontmatter)) {
    warnings.push('Trigger list lacks non-English markers (ko/ja/zh) - 8-language contract coverage');
  }

  // Validate classification value
  const clsMatch = frontmatter.match(/classification:\s*(\w+)/);
  if (clsMatch && !VALID_CLASSIFICATIONS.includes(clsMatch[1])) {
    errors.push(`Invalid classification: ${clsMatch[1]} (expected: ${VALID_CLASSIFICATIONS.join('|')})`);
  }

  // Validate deprecation-risk value
  const riskMatch = frontmatter.match(/deprecation-risk:\s*(\w+)/);
  if (riskMatch && !VALID_RISKS.includes(riskMatch[1])) {
    errors.push(`Invalid deprecation-risk: ${riskMatch[1]} (expected: ${VALID_RISKS.join('|')})`);
  }

  // Check for eval definition
  const evalDirs = ['workflow', 'capability', 'hybrid'];
  let hasEval = false;
  for (const dir of evalDirs) {
    const evalPath = path.join(__dirname, '..', 'evals', dir, skillName, 'eval.yaml');
    if (fs.existsSync(evalPath)) {
      hasEval = true;
      break;
    }
  }
  if (!hasEval) {
    warnings.push('No eval.yaml found for this skill');
  }

  return { valid: errors.length === 0, errors, warnings };
}

/**
 * Validate all skills
 * @returns {Object} Validation summary
 */
function validateAllSkills() {
  const results = {};
  const dirs = fs.readdirSync(SKILLS_DIR).filter(d =>
    fs.statSync(path.join(SKILLS_DIR, d)).isDirectory()
  );

  for (const dir of dirs) {
    results[dir] = validateSkill(dir);
  }

  const total = Object.keys(results).length;
  const valid = Object.values(results).filter(r => r.valid).length;

  return { total, valid, invalid: total - valid, results };
}

// CLI execution
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.includes('--all')) {
    const summary = validateAllSkills();
    console.log(`Validation: ${summary.valid}/${summary.total} skills valid`);
    for (const [skill, result] of Object.entries(summary.results)) {
      if (!result.valid) {
        console.log(`  FAIL: ${skill} - ${result.errors.join(', ')}`);
      }
    }
  } else {
    const skillIdx = args.indexOf('--skill');
    const skillName = skillIdx >= 0 ? args[skillIdx + 1] : null;
    if (!skillName) {
      console.log('Usage: node validator.js --skill <name> | --all');
      process.exit(1);
    }
    const result = validateSkill(skillName);
    console.log(JSON.stringify(result, null, 2));
  }
}

module.exports = { validateSkill, validateAllSkills };
