/**
 * name-paths-br151.test.js — br151 name/paths unit suite (design §8.2)
 *
 * Scenario 3: invalid registration names are rejected by the validator
 * helper (FR-02, no grammar weakening).
 * Scenario 4: getArchivePath slugifies path-unsafe names instead of
 * throwing (FR-03), and valid names keep byte-identical paths.
 *
 * Fixture/store-path pattern copied from test/unit/paths.test.js (platform
 * + config module mocks, temp project dir). node:test runner per the
 * test/unit/ convention (jest.config.js matches test-scripts/ only).
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');

// Temp project/plugin dirs so no real .bkit state is touched
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bkit-br151-test-'));
const fakeProjDir = path.join(tmpDir, 'project');
const fakePluginRoot = path.join(tmpDir, 'plugin');
fs.mkdirSync(fakeProjDir, { recursive: true });
fs.mkdirSync(fakePluginRoot, { recursive: true });
fs.mkdirSync(path.join(fakePluginRoot, '.claude-plugin'), { recursive: true });
fs.mkdirSync(path.join(fakePluginRoot, 'hooks'), { recursive: true });

// Mock platform module before requiring paths
const platformPath = require.resolve('../../lib/core/platform');
const origPlatform = require.cache[platformPath];
require.cache[platformPath] = {
  id: platformPath,
  filename: platformPath,
  loaded: true,
  exports: {
    PROJECT_DIR: fakeProjDir,
    PLUGIN_ROOT: fakePluginRoot,
  },
};

// Mock config module (defaults only)
const configPath = require.resolve('../../lib/core/config');
const origConfig = require.cache[configPath];
require.cache[configPath] = {
  id: configPath,
  filename: configPath,
  loaded: true,
  exports: {
    getConfig: (key, defaultVal) => defaultVal,
  },
};

const pathsModulePath = require.resolve('../../lib/core/paths');
delete require.cache[pathsModulePath];

const {
  NAME_RE,
  validateFeatureName,
  isValidFeatureName,
  slugifyFeatureName,
} = require('../../lib/core/name-validator');
const { getArchivePath, resolveDocPaths, getDocPaths } = require('../../lib/core/paths');

test.after(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
  if (origPlatform) require.cache[platformPath] = origPlatform;
  else delete require.cache[platformPath];
  if (origConfig) require.cache[configPath] = origConfig;
  else delete require.cache[configPath];
  delete require.cache[pathsModulePath];
});

// --- Scenario 3 (FR-02): validator rejects invalid registration names ---

test('S3.1: isValidFeatureName rejects scoped CLI leftover "name --scope module-1"', () => {
  assert.equal(isValidFeatureName('name --scope module-1'), false);
});

test('S3.2: isValidFeatureName rejects spaces, parens, em-dashes, traversal', () => {
  assert.equal(isValidFeatureName('has spaces'), false);
  assert.equal(isValidFeatureName('feat (v2)'), false);
  assert.equal(isValidFeatureName('wake—relay'), false);
  assert.equal(isValidFeatureName('../evil'), false);
  assert.equal(isValidFeatureName(''), false);
  assert.equal(isValidFeatureName(null), false);
  assert.equal(isValidFeatureName(42), false);
});

test('S3.3: isValidFeatureName accepts grammar-valid names unchanged', () => {
  assert.equal(isValidFeatureName('br150-152-registry-cleanup-fixes'), true);
  assert.equal(isValidFeatureName('Feature_Name-01'), true);
});

test('S3.4: throwing validateFeatureName still enforces the same grammar (no weakening)', () => {
  assert.throws(() => validateFeatureName('name --scope module-1'), /Invalid feature name/);
  assert.equal(validateFeatureName('valid-name'), 'valid-name');
  assert.equal(String(NAME_RE), String(/^[A-Za-z0-9_-]+$/));
});

// --- Scenario 4 (FR-03): slugify instead of throw ---

test('S4.1: slugifyFeatureName returns valid names byte-unchanged', () => {
  assert.equal(slugifyFeatureName('my-feat'), 'my-feat');
  assert.equal(slugifyFeatureName('Br151_Fix'), 'Br151_Fix');
});

test('S4.2: slugifyFeatureName slugifies "has spaces" with a deterministic hash suffix', () => {
  const s = slugifyFeatureName('has spaces');
  assert.match(s, /^has-spaces-[0-9a-f]{8}$/);
  assert.equal(s, slugifyFeatureName('has spaces'), 'must be deterministic');
});

test('S4.3: slugifyFeatureName neutralizes traversal and unicode punctuation', () => {
  const t = slugifyFeatureName('../../etc/passwd');
  assert.ok(!t.includes('/'), `traversal char survived: ${t}`);
  assert.match(slugifyFeatureName('feat — scoped (v2)'), /^feat-scoped-v2-[0-9a-f]{8}$/);
  assert.match(slugifyFeatureName('...'), /^feature-[0-9a-f]{8}$/, 'empty-slug fallback');
});

test('S4.4: collision safety — "a b" and "a-b" produce distinct segments', () => {
  const ab = slugifyFeatureName('a b');
  const aDashB = slugifyFeatureName('a-b');
  assert.equal(aDashB, 'a-b', 'valid name untouched');
  assert.match(ab, /^a-b-[0-9a-f]{8}$/);
  assert.notEqual(ab, aDashB);
});

test('S4.5: getArchivePath("has spaces") returns a slugified path WITHOUT throwing', () => {
  const d = new Date(2026, 9, 25);
  const p = getArchivePath('has spaces', d);
  assert.ok(path.isAbsolute(p));
  assert.match(p, /has-spaces-[0-9a-f]{8}/);
  assert.ok(p.includes('2026-10'));
});

test('S4.6: getArchivePath survives the br151 live-evidence scoped name', () => {
  const p = getArchivePath('wake-dashboard-improvements --scope module-1');
  // Spaces collapse to '-'; the raw name's own '--' is kept (grammar-legal),
  // so the segment is 'improvements' + '-' + '--' + 'scope'.
  assert.match(p, /wake-dashboard-improvements---scope-module-1-[0-9a-f]{8}$/);
  assert.ok(p.includes('docs/archive/'), 'must land inside the archive tree');
});

test('S4.7: valid-name getArchivePath is byte-identical to pre-fix template interpolation', () => {
  const d = new Date(2026, 0, 15);
  const got = getArchivePath('my-feat', d);
  const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  const template = getDocPaths().archive;
  const expected = path.join(
    fakeProjDir,
    template.replace(/\{date\}/g, dateStr).replace(/\{feature\}/g, 'my-feat')
  );
  assert.equal(got, expected);
});

test('S4.8: valid-name resolveDocPaths is byte-identical to raw template interpolation', () => {
  const got = resolveDocPaths('plan', 'my-feature');
  const templates = getDocPaths().plan;
  const expected = templates.map((t) =>
    path.join(fakeProjDir, t.replace(/\{feature\}/g, 'my-feature'))
  );
  assert.deepEqual(got, expected);
});

test('S4.9: resolveDocPaths slugifies instead of throwing (same segment as archive)', () => {
  const candidates = resolveDocPaths('plan', 'has spaces');
  assert.ok(candidates.length > 0);
  assert.match(candidates[0], /has-spaces-[0-9a-f]{8}/);
});
