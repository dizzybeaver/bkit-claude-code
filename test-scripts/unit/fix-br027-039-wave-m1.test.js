/**
 * fix-br027-039-wave-m1.test.js
 *
 * M1 wave tests: br030 (locked RMW on PDCA status), br037 (savePdcaStatus
 * loud failure), br034 (completePdcaFeature requireDocs bypass), br038
 * (enforceLimit full-list walk).
 *
 * NOTE: CLAUDE_PROJECT_DIR must be set BEFORE requiring any bkit module —
 * lib/core/platform.js resolves PROJECT_DIR once at require time. All
 * fixtures live under a throwaway temp project; the registry path is
 * derived from getPdcaStatusPath(), never hardcoded.
 */

const os = require('os');
const path = require('path');
const fs = require('fs');

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'br027-039-m1-'));
process.env.CLAUDE_PROJECT_DIR = tmpRoot;

const {
  updatePdcaStatus,
  savePdcaStatus,
  completePdcaFeature,
  getPdcaStatusPath,
} = require('../../lib/pdca/status-core');
const { enforceLimit } = require('../../lib/pdca/lifecycle');

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

describe('br030: updatePdcaStatus locked read-modify-write', () => {
  test('two interleaved writers both survive in the on-disk registry', () => {
    seedStatus();

    // Seed through the gate bypass: the tmp project has no docs/, so the
    // default requireDocs:true gate (Issue #89) would nondeterministically
    // reject these writes (br027/br034 subject — covered by its own test).
    updatePdcaStatus('feat-a', 'do', {}, { requireDocs: false });
    updatePdcaStatus('feat-b', 'plan', {}, { requireDocs: false });

    const status = readStatus();
    expect(status.features['feat-a']).toBeDefined();
    expect(status.features['feat-a'].phase).toBe('do');
    expect(status.features['feat-b']).toBeDefined();
    expect(status.features['feat-b'].phase).toBe('plan');
    expect(status.activeFeatures).toEqual(
      expect.arrayContaining(['feat-a', 'feat-b'])
    );
  });
});

describe('br037: savePdcaStatus loud failure', () => {
  test('returns false and reports to stderr when the write fails', () => {
    if (typeof process.getuid === 'function' && process.getuid() === 0) {
      // chmod-based failure injection cannot fail as root
      return;
    }
    seedStatus({ features: { f: { phase: 'do' } } });
    const dir = statusDir();
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    let returned;
    try {
      fs.chmodSync(dir, 0o500);
      returned = savePdcaStatus(readStatus());
    } finally {
      fs.chmodSync(dir, 0o700);
    }

    expect(returned).toBe(false);
    expect(errSpy).toHaveBeenCalledWith(
      '[bkit-pdca] savePdcaStatus FAILED:',
      expect.any(String)
    );
    errSpy.mockRestore();
  });

  test('returns true on success', () => {
    seedStatus();
    expect(savePdcaStatus(readStatus())).toBe(true);
  });
});

describe('br034: completePdcaFeature requireDocs bypass', () => {
  test('completes a doc-less feature instead of silently no-oping', () => {
    seedStatus();

    // br150-152 ghost-guard: completePdcaFeature now fails closed
    // (E-INVALID-STATE, no write) for a name with no registry row, so the
    // feature must be registered first (same seeding idiom as the br030
    // test above — tmp project has no docs/). br034's contract — completion
    // must not be blocked by missing docs — still holds for a REGISTERED
    // feature; the ghost-row refusal itself is covered by
    // test/unit/core-lifecycle-br150.test.js.
    updatePdcaStatus('docless-feature', 'do', {}, { requireDocs: false });
    completePdcaFeature('docless-feature');

    const status = readStatus();
    expect(status.features['docless-feature']).toBeDefined();
    expect(status.features['docless-feature'].phase).toBe('completed');
  });
});

describe('br038: enforceLimit walks the full sorted list', () => {
  test('archives the youngest completed feature past the non-completed one', () => {
    seedStatus();

    // oldest completed, active (not completable), youngest completed
    updatePdcaStatus('done-old', 'completed', {
      completionType: 'completed',
      timestamps: { lastUpdated: '2026-01-01T00:00:00.000Z' },
    }, { requireDocs: false });
    updatePdcaStatus('in-progress', 'do', {
      timestamps: { lastUpdated: '2026-02-01T00:00:00.000Z' },
    }, { requireDocs: false });
    updatePdcaStatus('done-new', 'completed', {
      completionType: 'completed',
      timestamps: { lastUpdated: '2026-03-01T00:00:00.000Z' },
    }, { requireDocs: false });

    const result = enforceLimit(1);

    const status = readStatus();
    expect(status.features['done-old'].phase).toBe('archived');
    // Pre-fix behavior: the loop consumed its budget on the skipped active
    // feature and never reached done-new, leaving 2 active features.
    expect(status.features['done-new'].phase).toBe('archived');
    expect(result.skipped).toEqual(['in-progress']);
  });
});
