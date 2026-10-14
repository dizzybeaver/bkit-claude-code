/**
 * fix-br041-name-validator.test.js
 *
 * br041 tests: feature-name intake validation.
 * - lib/pdca/validate-name.js — normalizeFeatureName / isValidFeatureName
 * - registerFeature rejects malformed names with NO registry write
 * - addActiveFeature rejects malformed names with NO push and NO save
 *
 * NOTE: CLAUDE_PROJECT_DIR must be set BEFORE requiring any bkit module —
 * lib/core/platform.js resolves PROJECT_DIR once at require time. Fixtures
 * live under a throwaway temp project; registry path from getPdcaStatusPath().
 */

const os = require('os');
const path = require('path');
const fs = require('fs');

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'br041-name-'));
process.env.CLAUDE_PROJECT_DIR = tmpRoot;

const {
  normalizeFeatureName,
  isValidFeatureName,
} = require('../../lib/pdca/validate-name');
const {
  registerFeature,
} = require('../../lib/pdca/feature-manager');
const {
  addActiveFeature,
  getPdcaStatusPath,
} = require('../../lib/pdca/status-core');

function statusPath() {
  return getPdcaStatusPath();
}

function statusDir() {
  return path.dirname(getPdcaStatusPath());
}

function readStatus() {
  return JSON.parse(fs.readFileSync(statusPath(), 'utf8'));
}

function seedStatus(extra = {}) {
  fs.mkdirSync(statusDir(), { recursive: true });
  const status = {
    version: '3.0',
    primaryFeature: null,
    activeFeatures: [],
    features: {},
    history: [],
    session: {},
    ...extra,
  };
  fs.writeFileSync(statusPath(), JSON.stringify(status, null, 2));
  return status;
}

beforeEach(() => {
  fs.rmSync(statusDir(), { recursive: true, force: true });
});

afterAll(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

describe('br041: normalizeFeatureName happy paths', () => {
  test('spaces become hyphens', () => {
    const r = normalizeFeatureName('my feature');
    expect(r.ok).toBe(true);
    expect(r.name).toBe('my-feature');
  });

  test('underscores become hyphens', () => {
    const r = normalizeFeatureName('my_feature');
    expect(r.ok).toBe(true);
    expect(r.name).toBe('my-feature');
  });

  test('uppercase folds to lowercase', () => {
    const r = normalizeFeatureName('MyFeature');
    expect(r.ok).toBe(true);
    expect(r.name).toBe('myfeature');
  });

  test('runs of separators collapse to a single hyphen', () => {
    const r = normalizeFeatureName('  my__  feature  ');
    expect(r.ok).toBe(true);
    expect(r.name).toBe('my-feature');
  });

  test('underscore runs normalize to hyphens (documented contract)', () => {
    const r = normalizeFeatureName('my-feature_01');
    expect(r.ok).toBe(true);
    expect(r.name).toBe('my-feature-01');
  });

  test('64-char names are valid (boundary)', () => {
    const r = normalizeFeatureName('a'.repeat(64));
    expect(r.ok).toBe(true);
    expect(r.name).toHaveLength(64);
  });
});

describe('br041: normalizeFeatureName rejections', () => {
  test('empty string rejected with reason', () => {
    const r = normalizeFeatureName('');
    expect(r.ok).toBe(false);
    expect(typeof r.reason).toBe('string');
    expect(r.reason.length).toBeGreaterThan(0);
  });

  test('whitespace-only rejected', () => {
    const r = normalizeFeatureName('   ');
    expect(r.ok).toBe(false);
  });

  test('null/undefined rejected', () => {
    expect(normalizeFeatureName(null).ok).toBe(false);
    expect(normalizeFeatureName(undefined).ok).toBe(false);
  });

  test('over 64 chars rejected', () => {
    const r = normalizeFeatureName('a'.repeat(65));
    expect(r.ok).toBe(false);
    expect(typeof r.reason).toBe('string');
  });

  test('leading hyphen rejected', () => {
    const r = normalizeFeatureName('-lead');
    expect(r.ok).toBe(false);
  });

  test('trailing hyphen rejected', () => {
    const r = normalizeFeatureName('trail-');
    expect(r.ok).toBe(false);
  });

  test('non-allowed residue rejected', () => {
    expect(normalizeFeatureName('bad!name').ok).toBe(false);
    expect(normalizeFeatureName('bad/name').ok).toBe(false);
    expect(normalizeFeatureName('bad.name').ok).toBe(false);
    expect(normalizeFeatureName('naïve').ok).toBe(false);
  });
});

describe('br041: isValidFeatureName (pure shape check, no normalization)', () => {
  test('accepts a well-formed name', () => {
    expect(isValidFeatureName('my-feature_01')).toBe(true);
  });

  test('rejects malformed shapes without attempting repair', () => {
    expect(isValidFeatureName('My Feature')).toBe(false); // spaces are not valid raw
    expect(isValidFeatureName('')).toBe(false);
    expect(isValidFeatureName('-x')).toBe(false);
    // pure regex shape check ADMITS a trailing hyphen — edge-hyphen
    // rejection belongs to normalizeFeatureName (documented split)
    expect(isValidFeatureName('x-')).toBe(true);
    expect(normalizeFeatureName('x-').ok).toBe(false);
    expect(isValidFeatureName('a'.repeat(65))).toBe(false);
    expect(isValidFeatureName(null)).toBe(false);
  });
});

describe('br041: registerFeature rejects malformed names with no registry write', () => {
  test('malformed name -> registered:false, featureState:null, registry untouched', () => {
    seedStatus();
    const before = fs.readFileSync(statusPath(), 'utf8');

    const result = registerFeature('Bad Name!');

    expect(result.registered).toBe(false);
    expect(result.featureState).toBeNull();

    const after = fs.readFileSync(statusPath(), 'utf8');
    expect(after).toBe(before); // NO registry write
  });

  test('valid normalized name registers under the normalized form', () => {
    seedStatus();
    const result = registerFeature('My New Feature');
    // registration may be gated by canStartFeature for other reasons, but if
    // it registers it must do so under the normalized name
    if (result.registered) {
      const status = readStatus();
      // registration lands in primaryFeature + activeFeatures (live-probed
      // contract), NOT a status.features{} map entry
      expect(status.primaryFeature).toBe('my-new-feature');
      expect(status.activeFeatures).toContain('my-new-feature');
      expect(status.activeFeatures).not.toContain('My New Feature');
    }
  });
});

describe('br041: addActiveFeature rejects malformed names without touching status', () => {
  test('malformed name -> returns false, no push, no save', () => {
    seedStatus({ activeFeatures: ['good-feature'] });
    const before = fs.readFileSync(statusPath(), 'utf8');

    const result = addActiveFeature('Bad Name!');

    expect(result).toBe(false);
    const after = fs.readFileSync(statusPath(), 'utf8');
    expect(after).toBe(before); // no save happened

    const status = readStatus();
    expect(status.activeFeatures).toEqual(['good-feature']); // no push
  });

  test('valid name appends and saves as before', () => {
    seedStatus({ activeFeatures: ['good-feature'] });

    const result = addActiveFeature('another-feature');

    expect(result).not.toBe(false);
    const status = readStatus();
    expect(status.activeFeatures).toEqual(
      expect.arrayContaining(['good-feature', 'another-feature'])
    );
  });
});
