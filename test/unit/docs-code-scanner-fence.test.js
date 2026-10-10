/*
 * docs-code-scanner-fence.test.js — br200 fence-mode unit tests.
 *
 * Covers extractFencedLines: block extraction, multi-block, no fences,
 * unbalanced begin, stray end, nested begin, and lineNos offset
 * correctness against original file positions.
 */

const assert = require('node:assert');
const path = require('node:path');

let pass = 0, fail = 0;
function test(name, fn) { try { fn(); pass++; } catch (e) { fail++; console.error(`✗ ${name}: ${e.message}`); } }

const scanner = require('../../lib/infra/docs-code-scanner');
const extractFencedLines = scanner.extractFencedLines;

const BEGIN = '<!-- docs-code-sync:begin -->';
const END = '<!-- docs-code-sync:end -->';

// ============================================================
// extractFencedLines
// ============================================================
test('exports extractFencedLines', () => assert.strictEqual(typeof extractFencedLines, 'function'));

test('single block: lines between markers collected, markers excluded', () => {
  const content = [
    'intro line',
    BEGIN,
    '44 Skills declared',
    '36 Agents declared',
    END,
    'outro line',
  ].join('\n');
  const r = extractFencedLines(content, 'doc.md');
  assert.deepStrictEqual(r.errors, []);
  assert.deepStrictEqual(r.lines, ['44 Skills declared', '36 Agents declared']);
});

test('multi block: all blocks concatenated in order', () => {
  const content = [
    BEGIN,
    'first',
    END,
    'middle prose',
    BEGIN,
    'second',
    END,
  ].join('\n');
  const r = extractFencedLines(content, 'doc.md');
  assert.deepStrictEqual(r.errors, []);
  assert.deepStrictEqual(r.lines, ['first', 'second']);
});

test('no fences: empty lines, no errors', () => {
  const content = 'just prose\nno fences here\n44 Skills anywhere';
  const r = extractFencedLines(content, 'doc.md');
  assert.deepStrictEqual(r.errors, []);
  assert.deepStrictEqual(r.lines, []);
  assert.deepStrictEqual(r.lineNos, []);
});

test('unbalanced begin (no end before EOF): error reported', () => {
  const content = ['prose', BEGIN, 'trapped inside'].join('\n');
  const r = extractFencedLines(content, 'doc.md');
  assert.strictEqual(r.errors.length, 1);
  assert.ok(r.errors[0].includes('never closed'), r.errors[0]);
  assert.ok(r.errors[0].includes('doc.md'), 'error names the file');
});

test('stray end without begin: error reported', () => {
  const content = ['prose', END, 'after'].join('\n');
  const r = extractFencedLines(content, 'doc.md');
  assert.strictEqual(r.errors.length, 1);
  assert.ok(r.errors[0].includes('without begin'), r.errors[0]);
});

test('nested begin inside open block: error reported', () => {
  const content = [BEGIN, 'inner', BEGIN, 'deeper', END].join('\n');
  const r = extractFencedLines(content, 'doc.md');
  assert.strictEqual(r.errors.length, 1);
  assert.ok(r.errors[0].includes('nested'), r.errors[0]);
});

test('lineNos offsets point at original 1-based file positions', () => {
  const content = [
    'line1',        // 1
    BEGIN,          // 2 (marker line — excluded)
    'fenced A',     // 3
    'fenced B',     // 4
    END,            // 5 (marker line — excluded)
    'line6',        // 6
  ].join('\n');
  const r = extractFencedLines(content, 'doc.md');
  assert.deepStrictEqual(r.errors, []);
  assert.deepStrictEqual(r.lines, ['fenced A', 'fenced B']);
  assert.deepStrictEqual(r.lineNos, [3, 4]);
});

test('lineNos offsets across multiple blocks keep original positions', () => {
  const content = [
    BEGIN,          // 1
    'a',            // 2
    END,            // 3
    'x',            // 4
    'y',            // 5
    BEGIN,          // 6
    'b',            // 7
    END,            // 8
  ].join('\n');
  const r = extractFencedLines(content, 'doc.md');
  assert.deepStrictEqual(r.errors, []);
  assert.deepStrictEqual(r.lineNos, [2, 7]);
});

test('marker matching is whitespace-trimmed', () => {
  const content = ['  ' + BEGIN + '  ', 'value', '\t' + END].join('\n');
  const r = extractFencedLines(content, 'doc.md');
  assert.deepStrictEqual(r.errors, []);
  assert.deepStrictEqual(r.lines, ['value']);
});

// ============================================================
// Summary
// ============================================================
console.log(`\ndocs-code-scanner-fence.test.js: ${pass}/${pass + fail} PASS, ${fail} FAIL, 0 SKIP`);
if (fail > 0) process.exit(1);
