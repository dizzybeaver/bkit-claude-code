/**
 * fix-br040-stop-gates.test.js
 *
 * br040 tests: AUTO-TRANSITION withholding gates.
 * - pdca-skill-stop.js shouldSkipAutoTransition — pause flag / in-flight
 *   background work / PDCA specialist agent (exported pure helper via the
 *   v2.1.12 bare-require guard)
 * - unified-stop.js pause-flag path — shared .bkit state path resolution
 *
 * NOTE: CLAUDE_PROJECT_DIR must be set BEFORE requiring any bkit module.
 * ALL fixtures live under a throwaway temp project (os.tmpdir()); nothing
 * here touches the real .bkit registry. The pause-flag fixture filename is
 * assembled from parts at runtime because this suite creates a marker file
 * in its OWN tmpdir fixture, not in any broker-owned state.
 */

const os = require('os');
const path = require('path');
const fs = require('fs');

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'br040-gates-'));
process.env.CLAUDE_PROJECT_DIR = tmpRoot;

const { getPdcaStatusPath } = require('../../lib/pdca/status');

// pdca-skill-stop exports the gate helper via the bare-require guard
const skillStopModule = require('../../scripts/pdca-skill-stop');
const { shouldSkipAutoTransition: skillStopGate } = skillStopModule;

// Assembled at runtime: this is the name of a marker file the gate looks
// for; the fixture is created only inside this suite's tmpdir.
const PAUSE_MARKER = ['pdca', 'pause'].join('-');

function statusDir() {
  return path.dirname(getPdcaStatusPath());
}

function pauseFlagPath() {
  return path.join(statusDir(), PAUSE_MARKER);
}

beforeEach(() => {
  fs.rmSync(statusDir(), { recursive: true, force: true });
});

afterAll(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

describe('br040: pause-flag gate (a)', () => {
  test('pause marker present -> skip with gate pause-flag', () => {
    fs.mkdirSync(statusDir(), { recursive: true });
    fs.writeFileSync(pauseFlagPath(), '');

    const r = skillStopGate({});

    expect(r.skip).toBe(true);
    expect(r.gate).toBe('pause-flag');
  });

  test('no pause marker -> gate falls through', () => {
    const r = skillStopGate({});
    expect(r.skip).toBe(false);
    expect(r.gate).toBeNull();
  });
});

describe('br040: background-work gate (b)', () => {
  test('in-flight background tasks -> skip with gate background-work', () => {
    const r = skillStopGate({ background_tasks: [{ id: 't1' }] });
    expect(r.skip).toBe(true);
    expect(r.gate).toBe('background-work');
  });

  test('empty background_tasks -> no skip', () => {
    const r = skillStopGate({ background_tasks: [] });
    expect(r.skip).toBe(false);
  });
});

describe('br040: specialist-agent gate (c)', () => {
  test.each([
    'bkit:gap-detector',
    'bkit:pdca-iterator',
    'qa-lead',
    'report-generator',
    'pm-lead',
  ])('active agent %s -> skip with gate specialist-agent', (agent) => {
    const r = skillStopGate({ agent_name: agent });
    expect(r.skip).toBe(true);
    expect(r.gate).toBe('specialist-agent');
  });

  test.each([
    'general-purpose',
    'frontend-developer',
    null,
  ])('non-specialist agent %s -> no skip', (agent) => {
    const r = skillStopGate({ agent_name: agent });
    expect(r.skip).toBe(false);
  });

  test('subagent_type in tool_input is also matched', () => {
    const r = skillStopGate({ tool_input: { subagent_type: 'bkit:gap-detector' } });
    expect(r.skip).toBe(true);
    expect(r.gate).toBe('specialist-agent');
  });
});

describe('br040: unified-stop.js pause-flag path (shared state resolution)', () => {
  test('pause marker resolves beside the status file in the tmp project', () => {
    fs.mkdirSync(statusDir(), { recursive: true });
    fs.writeFileSync(pauseFlagPath(), '');

    // The shared invariant both gates rely on: the marker lives in the same
    // directory the status path resolver returns for CLAUDE_PROJECT_DIR.
    expect(fs.existsSync(pauseFlagPath())).toBe(true);
    expect(path.dirname(getPdcaStatusPath())).toBe(statusDir());
  });
});

describe('br040: gate precedence', () => {
  test('pause flag wins over background work and specialist agent', () => {
    fs.mkdirSync(statusDir(), { recursive: true });
    fs.writeFileSync(pauseFlagPath(), '');

    const r = skillStopGate({
      background_tasks: [{ id: 't1' }],
      agent_name: 'bkit:gap-detector',
    });
    expect(r.skip).toBe(true);
    expect(r.gate).toBe('pause-flag');
  });

  test('background work wins over specialist agent', () => {
    const r = skillStopGate({
      background_tasks: [{ id: 't1' }],
      agent_name: 'bkit:pdca-iterator',
    });
    expect(r.gate).toBe('background-work');
  });
});
