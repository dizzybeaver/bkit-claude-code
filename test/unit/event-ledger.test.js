/**
 * event-ledger.test.js — lib/core/event-ledger.js unit suite
 *
 * Covers docs/02-design/features/stale-replay-fix-1029.design.en.md §8.1
 * (unit row for the event ledger): id format/stability, envelope format,
 * resolveEvents by family/tool/target, TTL prune, caps, session scoping,
 * and the no-plugin-data fail-open contract (FR-05).
 *
 * Contract under test (modules 1-2 implementation):
 *   - openEvent({family, tool, target, detail}) -> {id, ts} | null
 *   - resolveEvents(family, {tool, target})     -> count resolved
 *   - envelope(event)                           -> '[bkit:evt:<id>]'
 *   - id = '<fam3>-<YYYYMMDDTHHMMSS>-<sha1hex6>'
 *   - ledger: {CLAUDE_PLUGIN_DATA}/learnings/hook-events.json (JSON array)
 *   - row: {id, family, tool, target, detail, ts, session, expiresAt, resolvedAt}
 *   - TTL 90 min; caps 50 open/session, 200 total; writes via state-store
 *     lockedUpdate; fail-open on every error path.
 *
 * MUTATION CHECKS (true-tests requirement):
 *   - EL-06 (TTL prune): if pruneExpired is removed from the write path,
 *     EL-06 fails — the backdated expired row would still be present in
 *     hook-events.json after the next openEvent.
 *   - EL-07/EL-09 (caps): if the total-cap enforcement is removed, EL-07
 *     fails (rows.length would reach 201); if the per-session open cap is
 *     removed, EL-09 fails (session A would show 55 open rows).
 *   - EL-11 (resolve-path prune, Act-1 gap 2): removing the prune sweep
 *     from resolveEventsDetailed's lockedUpdate fails EL-11 — the
 *     backdated expired row would survive a resolve call for a
 *     different key.
 *
 * @module test/unit/event-ledger.test
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const LEDGER_REL = path.join('learnings', 'hook-events.json');
const SESSION_A = 'evt-test-session-a';
const SESSION_B = 'evt-test-session-b';

/** Fresh temp plugin-data dir; removed by t.after. */
function makeTempPluginData(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bkit-evt-ledger-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

/**
 * Point the env at the given plugin-data dir + session and re-require the
 * ledger module fresh, so per-test env changes are honored whether or not
 * the implementation caches env at module load.
 */
function freshLedger(pluginData, session) {
  if (pluginData === null) delete process.env.CLAUDE_PLUGIN_DATA;
  else process.env.CLAUDE_PLUGIN_DATA = pluginData;
  process.env.CLAUDE_CODE_SESSION_ID = session;
  for (const key of Object.keys(require.cache)) {
    if (key.endsWith(`${path.sep}event-ledger.js`)) delete require.cache[key];
  }
  return require('../../lib/core/event-ledger');
}

/** Read the ledger file as an array (missing file -> []). */
function readRows(pluginData) {
  const file = path.join(pluginData, LEDGER_REL);
  if (!fs.existsSync(file)) return [];
  const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  return Array.isArray(parsed) ? parsed : [];
}

/** Write rows directly to the ledger file (seed helper). */
function seedRows(pluginData, rows) {
  const file = path.join(pluginData, LEDGER_REL);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(rows, null, 2));
}

const ID_RE = /^[a-z]{3}-\d{8}T\d{6}-[0-9a-f]{6}$/;

// ============================================================
// EL-01: openEvent — id format, stability, row schema
// ============================================================
test('EL-01: openEvent mints a well-formed id and writes a full-schema row', (t) => {
  const pluginData = makeTempPluginData(t);
  const ledger = freshLedger(pluginData, SESSION_A);

  const event = ledger.openEvent({
    family: 'tpl',
    tool: 'Write',
    target: '/tmp/feat.plan.md',
    detail: 'missing: Overview',
  });

  assert.ok(event && typeof event === 'object', 'openEvent returns an object');
  assert.match(event.id, ID_RE, `id matches fam3-ts-sha1hex6: ${event.id}`);
  assert.ok(typeof event.ts === 'string' && !Number.isNaN(Date.parse(event.ts)),
    'ts is an ISO timestamp');

  const rows = readRows(pluginData);
  assert.equal(rows.length, 1, 'exactly one row written');
  const row = rows[0];
  assert.equal(row.id, event.id, 'row id matches returned id');
  assert.equal(row.family, 'tpl');
  assert.equal(row.tool, 'Write');
  assert.equal(row.target, '/tmp/feat.plan.md');
  assert.equal(row.detail, 'missing: Overview');
  assert.equal(row.session, SESSION_A, 'row carries the session key');
  assert.equal(row.resolvedAt, null, 'new row unresolved');
  assert.ok(typeof row.expiresAt === 'number', 'expiresAt is epoch-ms');

  // TTL contract: expiresAt ~ ts + 90 min (allow small clock skew)
  const skew = Math.abs(row.expiresAt - (Date.parse(row.ts) + 90 * 60 * 1000));
  assert.ok(skew < 5000, `expiresAt = ts + 90min (skew ${skew}ms)`);
});

// ============================================================
// EL-02: id stability — same family/target in the same second still
// yields a parseable, unique-per-row id (sha1 salt keeps ids distinct)
// ============================================================
test('EL-02: two openEvents produce distinct, well-formed ids', (t) => {
  const pluginData = makeTempPluginData(t);
  const ledger = freshLedger(pluginData, SESSION_A);

  const a = ledger.openEvent({ family: 'tpl', tool: 'Write', target: '/a.md', detail: 'x' });
  const b = ledger.openEvent({ family: 'tpl', tool: 'Write', target: '/a.md', detail: 'x' });

  assert.match(a.id, ID_RE);
  assert.match(b.id, ID_RE);
  assert.notEqual(a.id, b.id, 'ids are unique per event');
});

// ============================================================
// EL-03: envelope format
// ============================================================
test('EL-03: envelope wraps the id as [bkit:evt:<id>]', (t) => {
  const ledger = freshLedger(null, SESSION_A);
  assert.equal(ledger.envelope({ id: 'tpl-20261029T134512-a1b2c3' }),
    '[bkit:evt:tpl-20261029T134512-a1b2c3]');
  assert.equal(ledger.envelope({ id: 'fail-x' }), '[bkit:evt:fail-x]');
});

// ============================================================
// EL-04: resolveEvents — resolves matching family/tool/target only
// ============================================================
test('EL-04: resolveEvents resolves only matching rows and returns the count', (t) => {
  const pluginData = makeTempPluginData(t);
  const ledger = freshLedger(pluginData, SESSION_A);

  ledger.openEvent({ family: 'tpl', tool: 'Write', target: '/x.md', detail: 'd1' });
  ledger.openEvent({ family: 'tpl', tool: 'Write', target: '/x.md', detail: 'd2' });
  ledger.openEvent({ family: 'tpl', tool: 'Write', target: '/y.md', detail: 'd3' });
  ledger.openEvent({ family: 'fail', tool: 'Bash', target: 'npm test', detail: 'd4' });

  const count = ledger.resolveEvents('tpl', { tool: 'Write', target: '/x.md' });
  assert.equal(count, 2, 'count equals matching unresolved rows');

  const rows = readRows(pluginData);
  const byDetail = Object.fromEntries(rows.map(r => [r.detail, r]));
  assert.ok(byDetail.d1.resolvedAt > 0, 'matching row d1 resolvedAt set');
  assert.ok(byDetail.d2.resolvedAt > 0, 'matching row d2 resolvedAt set');
  assert.equal(byDetail.d3.resolvedAt, null, 'different target untouched');
  assert.equal(byDetail.d4.resolvedAt, null, 'different family untouched');
});

// ============================================================
// EL-05: resolveEvents miss returns 0
// ============================================================
test('EL-05: resolveEvents returns 0 on a miss (no throw)', (t) => {
  const pluginData = makeTempPluginData(t);
  const ledger = freshLedger(pluginData, SESSION_A);
  ledger.openEvent({ family: 'tpl', tool: 'Write', target: '/x.md', detail: 'd' });
  assert.equal(ledger.resolveEvents('tpl', { tool: 'Write', target: '/never.md' }), 0);
  // Resolved rows must not double-resolve
  ledger.resolveEvents('tpl', { tool: 'Write', target: '/x.md' });
  assert.equal(ledger.resolveEvents('tpl', { tool: 'Write', target: '/x.md' }), 0,
    'already-resolved rows are not counted twice');
});

// ============================================================
// EL-06: TTL prune — MUTATION CHECK: removing pruneExpired from the
// write path fails this case (expired row would survive openEvent).
// ============================================================
test('EL-06: next openEvent prunes an expired row from the file', (t) => {
  const pluginData = makeTempPluginData(t);
  const ledger = freshLedger(pluginData, SESSION_A);

  seedRows(pluginData, [{
    id: 'tpl-20200101T000000-deadbe',
    family: 'tpl',
    tool: 'Write',
    target: '/old.md',
    detail: 'expired',
    ts: '2020-01-01T00:00:00.000Z',
    session: SESSION_A,
    expiresAt: Date.now() - 1000, // backdated: already expired
    resolvedAt: null,
  }]);

  ledger.openEvent({ family: 'tpl', tool: 'Write', target: '/new.md', detail: 'fresh' });

  const rows = readRows(pluginData);
  assert.equal(rows.length, 1, 'expired row removed, fresh row kept');
  assert.equal(rows[0].detail, 'fresh');
  assert.ok(!rows.some(r => r.id === 'tpl-20200101T000000-deadbe'),
    'expired id gone from hook-events.json');
});

// ============================================================
// EL-07: total cap (200) — MUTATION CHECK: removing total-cap
// enforcement fails this case (rows would reach 201).
// ============================================================
test('EL-07: inserting past 200 total rows keeps the ledger at or below 200', (t) => {
  const pluginData = makeTempPluginData(t);
  const ledger = freshLedger(pluginData, SESSION_A);

  // Seed 200 open rows spread across sessions at exactly the per-session cap.
  const seeded = [];
  for (let s = 0; s < 4; s++) {
    for (let i = 0; i < 50; i++) {
      seeded.push({
        id: `tpl-20200101T0000${String(s)}${String(i).padStart(2, '0')}-${String(i).padStart(2, '0')}${s}ab${s}`,
        family: 'tpl', tool: 'Write', target: `/seed-${s}-${i}.md`, detail: 'seed',
        ts: '2020-01-01T00:00:00.000Z', session: `sess-${s}`,
        expiresAt: Date.now() + 3600_000, resolvedAt: null,
      });
    }
  }
  seedRows(pluginData, seeded);
  assert.equal(readRows(pluginData).length, 200);

  const event = ledger.openEvent({
    family: 'tpl', tool: 'Write', target: '/overflow.md', detail: '201st',
  });

  const rows = readRows(pluginData);
  assert.ok(rows.length <= 200, `total rows <= 200 after 201st open (got ${rows.length})`);
  // The cap must not lose the new event silently: either it was admitted
  // (present + evicted some old row) or the insert was refused (null).
  if (event !== null) {
    assert.ok(rows.some(r => r.id === event.id), '201st event admitted and present');
  }
});

// ============================================================
// EL-08: no CLAUDE_PLUGIN_DATA — fail-open (FR-05)
// ============================================================
test('EL-08: without CLAUDE_PLUGIN_DATA every API is a no-op', (t) => {
  const ledger = freshLedger(null, SESSION_A);

  assert.equal(ledger.openEvent({ family: 'tpl', tool: 'Write', target: '/x.md', detail: 'd' }), null,
    'openEvent returns null');
  assert.equal(ledger.resolveEvents('tpl', { tool: 'Write', target: '/x.md' }), 0,
    'resolveEvents returns 0');
  // envelope stays pure (no storage dependency)
  assert.equal(ledger.envelope({ id: 'tpl-x' }), '[bkit:evt:tpl-x]');
});

// ============================================================
// EL-09: per-session open cap (50)
// ============================================================
test('EL-09: two sessions each hold at most 50 open rows', (t) => {
  const pluginData = makeTempPluginData(t);

  const ledgerA = freshLedger(pluginData, SESSION_A);
  for (let i = 0; i < 55; i++) {
    ledgerA.openEvent({ family: 'tpl', tool: 'Write', target: `/a-${i}.md`, detail: `a${i}` });
  }

  const ledgerB = freshLedger(pluginData, SESSION_B);
  for (let i = 0; i < 55; i++) {
    ledgerB.openEvent({ family: 'tpl', tool: 'Write', target: `/b-${i}.md`, detail: `b${i}` });
  }

  const rows = readRows(pluginData);
  const openA = rows.filter(r => r.session === SESSION_A && r.resolvedAt === null).length;
  const openB = rows.filter(r => r.session === SESSION_B && r.resolvedAt === null).length;
  assert.ok(openA <= 50, `session A open rows <= 50 (got ${openA})`);
  assert.ok(openB <= 50, `session B open rows <= 50 (got ${openB})`);
});

// ============================================================
// EL-10: fail-open on a corrupt ledger file
// ============================================================
test('EL-10: a corrupt ledger file does not throw the API callers', (t) => {
  const pluginData = makeTempPluginData(t);
  const file = path.join(pluginData, LEDGER_REL);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, '{not json at all');

  const ledger = freshLedger(pluginData, SESSION_A);
  // state-store normalizes corrupt payloads to []/null — openEvent must still
  // work (or fail-open to null) without throwing.
  let result = null;
  let threw = false;
  try {
    result = ledger.openEvent({ family: 'tpl', tool: 'Write', target: '/x.md', detail: 'd' });
  } catch (_) {
    threw = true;
  }
  assert.equal(threw, false, 'openEvent never throws on corrupt storage');
  assert.ok(result === null || typeof result.id === 'string',
    'openEvent returns a valid event or null');
});

// ============================================================
// EL-11: resolve-path prune — resolveEventsDetailed prunes expired
// rows in the same lockedUpdate (Design §4). MUTATION CHECK: removing
// the prune sweep from the resolve path fails this case — the expired
// row would survive a resolve call for a DIFFERENT matching key.
// ============================================================
test('EL-11: resolveEventsDetailed prunes an expired row while resolving a different key', (t) => {
  const pluginData = makeTempPluginData(t);
  const ledger = freshLedger(pluginData, SESSION_A);

  seedRows(pluginData, [
    {
      id: 'tpl-20200101T000000-deadbe',
      family: 'tpl',
      tool: 'Write',
      target: '/expired.md',
      detail: 'expired',
      ts: '2020-01-01T00:00:00.000Z',
      session: SESSION_A,
      expiresAt: Date.now() - 1000, // backdated: already expired
      resolvedAt: null,
    },
    {
      id: 'tpl-20990101T000000-live1',
      family: 'tpl',
      tool: 'Write',
      target: '/live.md',
      detail: 'live',
      ts: new Date().toISOString(),
      session: SESSION_A,
      expiresAt: Date.now() + 3600_000, // live: well within TTL
      resolvedAt: null,
    },
  ]);

  // Resolve a DIFFERENT matching key than the expired row's target — the
  // prune sweep must still run inside the same lockedUpdate.
  const result = ledger.resolveEventsDetailed('tpl', { tool: 'Write', target: '/live.md' });

  assert.equal(result.count, 1, 'the live matching row resolved');
  assert.deepEqual(result.ids, ['tpl-20990101T000000-live1'], 'resolved id reported');

  const rows = readRows(pluginData);
  assert.equal(rows.length, 1, 'expired row pruned, live row kept');
  assert.equal(rows[0].id, 'tpl-20990101T000000-live1', 'live row is the survivor');
  assert.ok(rows[0].resolvedAt > 0, 'live row resolvedAt set');
  assert.ok(!rows.some(r => r.id === 'tpl-20200101T000000-deadbe'),
    'expired id gone from hook-events.json after resolveEventsDetailed');
});
