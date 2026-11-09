/* Dependency-free regression checks against the actual shipped HTML.
 * All records/storage here are synthetic, isolated in Node VM contexts.
 * This verifies the application model and rendered markup, not browser layout.
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');

const html = fs.readFileSync(path.resolve(__dirname, '../index.html'), 'utf8');
const scriptNames = ['bos-core', 'bos-pilot', 'bos-legacy', 'bos-boot'];
const scripts = Object.fromEntries(scriptNames.map(name => {
  const match = html.match(new RegExp('<script id="' + name + '">([\\s\\S]*?)</script>'));
  assert(match, 'Missing shipped script: ' + name);
  new vm.Script(match[1], { filename: name + '.js' });
  return [name, match[1]];
}));
const results = [];
function test(name, fn) {
  try { fn(); results.push({ name, status: 'PASS' }); }
  catch (error) { results.push({ name, status: 'FAIL', error: error.message }); }
}
class FixedDate extends Date {
  constructor(...args) { super(...(args.length ? args : ['2026-11-05T12:00:00Z'])); }
  static now() { return Date.parse('2026-11-05T12:00:00Z'); }
}
function environment(initial = {}, initialize = true) {
  const storage = new Map(Object.entries(initial));
  const writes = [];
  const nodes = new Map();
  function node(selector) {
    if (!nodes.has(selector)) nodes.set(selector, {
      innerHTML: '', textContent: '', value: '', style: {}, dataset: {},
      classList: { add() {}, remove() {}, toggle() {} },
      addEventListener() {}, querySelectorAll() { return []; }, querySelector: node,
      showModal() {}, close() {}, click() {}, scrollIntoView() {},
    });
    return nodes.get(selector);
  }
  const context = vm.createContext({
    console, Intl, Date: FixedDate, JSON, Set, Map, WeakMap, Math, Number, Object,
    Array, Error, Blob, URL, crypto: { randomUUID },
    setTimeout() { return 0; }, clearTimeout() {},
    document: { querySelector: node, addEventListener() {}, createElement() { return node('anchor'); } },
    localStorage: {
      getItem(key) { return storage.get(key) ?? null; },
      setItem(key, value) { writes.push(key); storage.set(key, value); },
    },
  });
  for (const name of scriptNames.filter(name => name !== 'bos-boot')) {
    vm.runInContext(scripts[name], context, { filename: name + '.js' });
  }
  vm.runInContext('globalThis.application = BOS;', context);
  if (initialize) vm.runInContext(scripts['bos-boot'], context, { filename: 'bos-boot.js' });
  return { B: context.application, storage, writes, node, context };
}
const clone = value => JSON.parse(JSON.stringify(value));
const task = (id, patch = {}) => ({
  id, title: 'SYNTHETIC TEST ' + id, workstream: 'digital', productId: 'product-a',
  category: 'QA', priority: 'medium', status: 'todo', due: '2026-11-06',
  estimate: 20, actual: null, dependencies: [], notes: '', cycle: 'current', ...patch,
});
const legacy = version => ({
  version, year: 2026, month: 11, checks: { '0-0': true, '0-2': true, '2-5': true },
  metrics: [{ revenue: 19, mrr: 0 }], sectors: [], bets: [{ ease: '3', recurring: '2' }],
  day: 5, mode: 'manual', unknown: { note: 'SYNTHETIC extra field: preserve exactly' },
});
const sale = (id, patch = {}) => ({
  id, name: 'SYNTHETIC TEST SALE', workstream: 'services', serviceType: 'landing',
  productId: '', channel: 'Direct', date: '2026-11-05', amount: 750,
  collected: 0, refunds: 0, status: 'signed', revenueType: 'setup', ...patch,
});
test('All shipped inline scripts parse; the document remains standalone', () => {
  assert.equal(Object.keys(scripts).length, 4);
  assert(html.includes('<html lang="en">'));
  assert(!/<script\b[^>]+src=/i.test(html), 'Unexpected external script dependency');
  assert(!/<link\b[^>]+rel=["']stylesheet/i.test(html), 'Unexpected external stylesheet');
  assert(!html.includes('\ufffd'), 'Invalid UTF-8 replacement character');
});
test('Fresh initialization has unique seeded tasks and no fabricated results', () => {
  const { B } = environment();
  assert.equal(B.readOnly, false);
  const seedTasks = B.pilotSeeds.tasks;
  const expected = new Set(seedTasks.map(t => t.id));
  assert.equal(expected.size, seedTasks.length, 'Duplicate task IDs in seeds');
  assert.equal(B.state.tasks.filter(t => t.cycle !== 'legacy').length, expected.size);
  assert.equal(new Set(B.state.tasks.map(t => t.id)).size, B.state.tasks.length);
  assert.equal(B.legacyTaskSeeds.length, 34);
  assert.equal(B.state.tasks.filter(t => t.cycle === 'legacy').length, 34);
  assert.equal(B.state.tasks.filter(t => t.status === 'completed').length, 0);
  assert.equal(B.state.sales.length, 0);
  assert.equal(B.state.prospects.length, 0);
  assert.equal(B.state.products.length, 0);
});
for (const version of [1, 2]) {
  test('v' + version + ' migration preserves exact task identity, flags and all raw fields', () => {
    const e = environment({}, false), raw = legacy(version), migrated = e.B.migrateLegacy(raw);
    assert.deepEqual(clone(migrated.legacy[0].data), raw);
    assert.equal(migrated.tasks.length, e.B.legacyTaskSeeds.length);
    for (const seed of e.B.legacyTaskSeeds) {
      const oldId = version === 1 ? seed.v1Id : seed.oldId;
      const actual = migrated.tasks.find(t => t.id === seed.id);
      assert(actual, 'Missing legacy task ' + seed.id);
      assert.equal(actual.title, seed.title);
      assert.equal(actual.status, raw.checks[oldId] === true ? 'completed' : 'backlog', seed.title);
    }
    const merged = e.B.merge(e.B.merge(e.B.defaultState(), migrated), migrated);
    assert.equal(merged.tasks.length, migrated.tasks.length);
    assert.equal(merged.legacy.length, 1);
    // Regression: an old completed automation offer must not complete a new digital-research task.
    const offer = migrated.tasks.find(t => t.title === 'Definir oferta de AI Automation + Landing Pages');
    assert(offer);
    const sourceId = version === 1 ? e.B.legacyTaskSeeds.find(t => t.id === offer.id).v1Id : e.B.legacyTaskSeeds.find(t => t.id === offer.id).oldId;
    assert.equal(offer.status, raw.checks[sourceId] === true ? 'completed' : 'backlog');
  });
}
test('Original localStorage bytes remain unchanged through initialization and edits', () => {
  const raw = JSON.stringify(legacy(2));
  const e = environment({ 'side-hustle-novembro-2026-v1': raw });
  assert.equal(e.B.readOnly, false);
  e.B.persistRecord('products', null, { name: 'SYNTHETIC PRODUCT' }, []);
  assert.equal(e.storage.get(e.B.OLD), raw);
  assert(!e.writes.includes(e.B.OLD));
});
test('Malformed new JSON stays byte-identical and recovery mode blocks mutations', () => {
  const raw = '{invalid json', e = environment({ 'side-hustles-business-os-v3': raw });
  assert.equal(e.B.readOnly, true);
  assert.equal(e.storage.get(e.B.KEY), raw);
  assert(!e.writes.includes(e.B.KEY));
  const before = JSON.stringify(e.B.state);
  assert.throws(() => e.B.updateTask(e.B.state.tasks[0].id, { status: 'completed' }));
  assert.throws(() => e.B.persistRecord('products', null, { name: 'BLOCKED' }, []));
  assert.throws(() => e.B.importData(e.B.defaultState()));
  assert.equal(JSON.stringify(e.B.state), before);
});
test('v3 JSON roundtrip and repeated imports retain records, conflicts and unknown fields', () => {
  const { B } = environment({}, false), local = B.defaultState(), incoming = B.defaultState();
  local.products = [{ id: 'p', name: 'LOCAL', price: 19, customNote: 'keep' }];
  incoming.products = [{ id: 'p', name: 'INCOMING', price: 29 }, { id: 'q', name: 'NEW' }];
  incoming.importConflicts = [{ collection: 'copies', id: 'c', incoming: { id: 'c', body: 'HISTORICAL' } }];
  local.unknownExtra = { value: 'SYNTHETIC preservation' };
  const once = B.merge(local, incoming), twice = B.merge(once, incoming);
  assert.equal(twice.products.length, 2);
  assert.equal(twice.products[0].name, 'LOCAL');
  assert.equal(twice.products[0].customNote, 'keep');
  assert.equal(twice.importConflicts.length, 2);
  assert.equal(twice.unknownExtra.value, 'SYNTHETIC preservation');
  assert.deepEqual(clone(B.validate(clone(twice))), clone(twice));
});
test('Safety snapshots have unique keys without overwriting an earlier payload', () => {
  const e = environment({}, false);
  const a = e.B.backup('test', { record: 1 }), b = e.B.backup('test', { record: 2 });
  assert.notEqual(a, b);
  assert.equal(JSON.parse(e.storage.get(a)).record, 1);
  assert.equal(JSON.parse(e.storage.get(b)).record, 2);
});
test('Cancelled tasks do not count completed; notes and actual time survive status changes', () => {
  const { B } = environment({}, false);
  const p = B.progress([task('a', { status: 'completed' }), task('b', { status: 'cancelled' }), task('c')]);
  assert.equal(p.done, 1); assert.equal(p.total, 2); assert.equal(p.pct, 50);
  B.state = B.defaultState(); B.state.tasks = [task('a', { notes: 'Preserve', actual: 42 })];
  B.updateTask('a', { status: 'completed' });
  assert(B.state.tasks[0].completedAt);
  B.updateTask('a', { status: 'progress' });
  assert.equal(B.state.tasks[0].notes, 'Preserve');
  assert.equal(B.state.tasks[0].actual, 42);
  assert.equal(B.state.tasks[0].completedAt, '');
});
test('Dependencies block early completion and reject self, circular or missing references', () => {
  const { B } = environment({}, false);
  B.state = B.defaultState(); B.state.tasks = [task('a'), task('b', { dependencies: ['a'] })];
  assert.throws(() => B.updateTask('b', { status: 'completed' }));
  assert.throws(() => B.updateTask('a', { dependencies: ['a'] }));
  assert.throws(() => B.updateTask('a', { dependencies: ['b'] }));
  assert.throws(() => B.updateTask('a', { dependencies: ['missing'] }));
  B.updateTask('a', { status: 'completed' }); B.updateTask('b', { status: 'completed' });
  assert(B.state.tasks.every(t => t.status === 'completed'));
});
test('Validation rejects duplicate IDs, unsupported backups, unsafe URLs and impossible dates', () => {
  const { B } = environment({}, false), state = B.defaultState();
  state.tasks = [task('a'), task('a')]; assert.throws(() => B.validate(state));
  state.tasks = [task('a', { due: '2026-11-31' })]; assert.throws(() => B.validate(state));
  state.tasks = [task('a', { workstream: 'completed' })]; assert.throws(() => B.validate(state));
  state.tasks = []; state.products = [{ id: 'p', salesUrl: 'javascript:alert(1)' }];
  assert.throws(() => B.validate(state));
  assert.throws(() => B.migrateLegacy({ version: 99 }));
  state.products = []; state.signals = [{ id: 's', basis: 'measured', date: '2026-11-31', visits: 100 }];
  assert.throws(() => B.validate(state));
  state.signals = []; state.sales = [sale('bad', { amount: '750' })];
  assert.throws(() => B.validate(state));
});
test('Only pilot views are navigable and rendering leaves all records intact', () => {
  const { B, node } = environment();
  const before = JSON.stringify(B.state);
  assert.deepEqual(Object.keys(B.modules), ['pilot']);
  const headings = ['Start with five businesses', 'Sales and delivery checklist', 'Price the job', '30-day research and sales plan', 'Checklist backup'];
  for (const [index, [view]] of B.modules.pilot.tabs.entries()) {
    B.open('pilot', view);
    assert(node('#bos-content').innerHTML.includes(headings[index]));
    assert(!node('#bos-content').innerHTML.includes('[object Object]'));
  }
  B.open('digital', 'portfolio');
  B.open('ads', 'dashboard');
  assert.equal(B.current, 'pilot');
  assert.equal(B.sub, 'backup');
  assert(!node('#bos-nav').innerHTML.includes('Digital Products'));
  assert.equal(JSON.stringify(B.state), before);
});

test('Existing records remain intact and pilot completion survives reload', () => {
  const original = environment({}, false).B.defaultState();
  original.products = [{ id: 'old-product', name: 'Keep', price: 19 }];
  original.ads = [{ id: 'old-ad', name: 'Keep this too' }];
  original.sales = [sale('existing-sale', { collected: 450 })];
  original.tasks = [task('past-task', { status: 'completed' })];
  const e = environment({ 'side-hustles-business-os-v3': JSON.stringify(original) });
  assert.deepEqual(clone(e.B.state.products), clone(original.products));
  assert.deepEqual(clone(e.B.state.ads), clone(original.ads));
  assert.deepEqual(clone(e.B.state.sales), clone(original.sales));
  const active = e.B.state.tasks.filter(e.B.isPilot);
  assert.equal(active.length, 16);
  assert.equal(e.B.progress(active).done, 0);
  e.B.updateTask(active[0].id, { status: 'completed' });
  const reload = environment({ 'side-hustles-business-os-v3': e.storage.get(e.B.KEY) });
  assert.equal(reload.B.state.tasks.length, e.B.state.tasks.length);
  assert.equal(reload.B.progress(reload.B.state.tasks.filter(reload.B.isPilot)).done, 1);
  assert(reload.B.state.tasks.some(item => item.id === 'past-task' && item.status === 'completed'));
});

test('Quote math and 30-day research quotas match the plan', () => {
  const { B } = environment();
  const q = B.estimateQuote({ hours:20, rate:35, cost:70, allowance:10, quote:900, deposit:50, fx:5, fees:3, direct:150, reserve:450 });
  assert.equal(q.floor.toFixed(2), '855.56');
  assert.equal(q.deposit, 450);
  assert.equal(q.balance, 450);
  assert.equal(q.gross, 4500);
  assert.equal(q.net, 3765);
  assert.equal(q.effective, 188.25);
  assert.equal(B.pilotDays.length, 30);
  assert.equal(B.pilotDays.reduce((total, day) => total + day[2], 0), 90);
  const markdown = fs.readFileSync(path.resolve(__dirname, '../30-DAY-PLAN.md'), 'utf8');
  for (const [i, [market, action, contacts]] of B.pilotDays.entries()) {
    assert(markdown.includes(`| ${i + 1} | ${market} | ${action} | ${contacts} |`));
  }
});

test('Copy edits preserve readable previous versions and summaries escape user markup', () => {
  const { B } = environment();
  const copy = B.persistRecord('copies', null, { name: 'SYNTHETIC COPY', productId: 'product-a', body: 'A' }, []);
  B.persistRecord('copies', copy.id, { body: 'B' }, []);
  const saved = B.state.copies.find(r => r.id === copy.id);
  assert.equal(saved.body, 'B'); assert.equal(saved.revisions[0].record.body, 'A');
  const out = B.summaryCards([['<img src=x>', '<script>bad</script>', 'A & B']]);
  assert(!out.includes('<script>')); assert(out.includes('&lt;script&gt;')); assert(out.includes('&amp;'));
});

const passed = results.filter(r => r.status === 'PASS').length;
console.log(JSON.stringify({ source: 'index.html inline scripts', passed, failed: results.length - passed, results }, null, 2));
process.exitCode = passed === results.length ? 0 : 1;
