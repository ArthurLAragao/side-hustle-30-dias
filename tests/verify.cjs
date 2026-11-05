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
const scriptNames = ['bos-core', 'bos-products', 'bos-business', 'bos-operations', 'bos-legacy', 'bos-boot'];
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
function financialEnvironment() {
  const e = environment({}, false);
  e.B.state = e.B.defaultState();
  return e;
}

test('All shipped inline scripts parse; the document remains standalone pt-BR', () => {
  assert.equal(Object.keys(scripts).length, 6);
  assert(html.includes('<html lang="pt-BR">'));
  assert(!/<script\b[^>]+src=/i.test(html), 'Unexpected external script dependency');
  assert(!/<link\b[^>]+rel=["']stylesheet/i.test(html), 'Unexpected external stylesheet');
  assert(!html.includes('\ufffd'), 'Invalid UTF-8 replacement character');
});
test('Fresh initialization has unique seeded tasks, products and no fabricated results', () => {
  const { B } = environment();
  assert.equal(B.readOnly, false);
  const seedTasks = [B.productSeeds, B.businessSeeds, B.cycleSeeds].flatMap(s => s?.tasks || []);
  const expected = new Set(seedTasks.map(t => t.id));
  assert.equal(expected.size, seedTasks.length, 'Duplicate task IDs in seeds');
  assert.equal(B.state.tasks.filter(t => t.cycle !== 'legacy').length, expected.size);
  assert.equal(new Set(B.state.tasks.map(t => t.id)).size, B.state.tasks.length);
  assert.equal(B.legacyTaskSeeds.length, 34);
  assert.equal(B.state.tasks.filter(t => t.cycle === 'legacy').length, 34);
  assert.equal(B.state.tasks.filter(t => t.status === 'completed').length, 0);
  assert.equal(B.state.sales.length, 0);
  assert.equal(B.state.prospects.length, 0);
  assert.equal(B.state.products.filter(p => p.id === 'product-a').length, 1);
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
test('Unsigned proposals and drafts are pipeline only, never cash or contracted revenue', () => {
  const { B } = financialEnvironment();
  B.state.sales = [sale('draft', { status: 'draft', collected: 750 })];
  B.state.prospects = [{ id: 'p', stage: 'proposal', proposalValue: 1250 }];
  const f = B.finance();
  assert.equal(f.collected, 0); assert.equal(f.contracted, 0); assert.equal(f.pipeline, 1250);
});
test('Signed unpaid and partial contracts separate pending cash, refunds and expenses', () => {
  const { B } = financialEnvironment();
  B.state.sales = [sale('unpaid'), sale('partial', { amount: 1250, collected: 300, refunds: 30 })];
  B.state.expenses = [{ id: 'expense', workstream: 'services', date: '2026-11-05', amount: 40, category: 'delivery' }];
  const f = B.finance();
  assert.equal(f.contracted, 2000); assert.equal(f.collected, 300); assert.equal(f.pending, 1700);
  assert.equal(f.refunds, 30); assert.equal(f.netSales, 270); assert.equal(f.profitEstimate, 230);
  assert.equal(f.coverageComplete, false);
});
test('Only confirmed digital purchases count, and cancelled transactions are excluded', () => {
  const { B } = financialEnvironment();
  B.state.sales = [
    sale('unconfirmed', { workstream: 'digital', amount: 19, collected: 19 }),
    sale('confirmed', { workstream: 'digital', productId: 'product-a', status: 'confirmed', amount: 19, collected: 19 }),
    sale('cancelled', { status: 'cancelled', collected: 750 }),
  ];
  const f = B.finance();
  assert.equal(f.collected, 19); assert.equal(f.purchases, 1); assert.equal(f.averageOrderValue, 19);
});
test('Setup fees never become MRR; only current active subscriptions contribute', () => {
  const { B } = financialEnvironment();
  B.state.sales = [sale('setup', { status: 'confirmed', collected: 750 })];
  B.state.subscriptions = [
    { id: 'active', workstream: 'services', status: 'active', monthlyAmount: 79, startDate: '2026-11-05' },
    { id: 'paused', status: 'paused', monthlyAmount: 297 },
    { id: 'cancelled', status: 'cancelled', monthlyAmount: 397 },
    { id: 'future', status: 'active', monthlyAmount: 99, startDate: '2026-11-06' },
  ];
  assert.equal(B.finance().mrr, 79); assert.equal(B.finance().serviceSetupRevenue, 750);
});
test('Cycle boundaries include Nov 5 and Dec 5, exclude adjacent dates, and render 31 dates', () => {
  const { B } = financialEnvironment();
  B.state.sales = [
    sale('before', { date: '2026-11-04', collected: 750 }),
    sale('first', { date: '2026-11-05', collected: 750 }),
    sale('last', { date: '2026-12-05', collected: 750 }),
    sale('after', { date: '2026-12-06', collected: 750 }),
  ];
  assert.equal(B.finance().collected, 1500); assert.equal(B.finance({ cycle: false }).collected, 3000);
  const plan = B.modules.operations.render('plan');
  const dates = [...new Set([...plan.matchAll(/data-plan-date="([\d-]+)"/g)].map(m => m[1]))].sort();
  assert.equal(dates.length, 31); assert.equal(dates[0], '2026-11-05'); assert.equal(dates.at(-1), '2026-12-05');
});
test('Invalid monetary tuples are excluded and product/channel filters are safe', () => {
  const { B } = financialEnvironment();
  B.state.sales = [
    sale('negative', { collected: -1 }), sale('overpaid', { collected: 751 }),
    sale('bad-refund', { collected: 5, refunds: 6 }),
    sale('special', { collected: 100, channel: '__proto__' }),
    sale('product', { workstream: 'digital', productId: 'product-a', status: 'confirmed', amount: 19, collected: 19, channel: 'LinkedIn' }),
  ];
  const f = B.finance();
  assert.equal(f.collected, 119); assert.equal(f.invalidRecords.length, 3);
  assert.equal(f.byChannel.__proto__.collected, 100);
  assert.equal(B.finance({ productId: 'product-a' }).collected, 19);
  assert.equal(vm.runInContext('Object.prototype.collected', environment({}, false).context), undefined);
});
test('Every module subview renders without creating business records', () => {
  const { B, node } = environment(), before = JSON.stringify(B.state);
  let count = 0;
  for (const [key, module] of Object.entries(B.modules)) {
    for (const [sub] of module.tabs || [['', '']]) {
      B.open(key, sub); count++;
      assert.equal(typeof node('#bos-content').innerHTML, 'string');
      assert(!node('#bos-content').innerHTML.includes('[object Object]'), key + '/' + sub);
    }
  }
  assert(count >= 28); assert.equal(JSON.stringify(B.state), before);
});
test('Shared product completion survives reload without duplicate seeds or automatic price changes', () => {
  const { B } = environment();
  const seed = B.state.tasks.find(t => t.productId === 'product-a' && !t.dependencies.length && t.cycle !== 'legacy');
  B.updateTask(seed.id, { status: 'completed' });
  assert.equal(B.progress(B.state.tasks.filter(t => t.productId === 'product-a')).done, 1);
  const count = B.state.tasks.length, product = B.state.products.find(p => p.id === 'product-a');
  assert.equal(product.betaPrice, 19); assert.equal(product.plannedPrice, 29);
  product.stage = 'ready'; B.save(); B.init();
  assert.equal(B.state.tasks.length, count);
  assert.equal(B.state.tasks.find(t => t.id === seed.id).status, 'completed');
  assert.equal(B.state.products.find(p => p.id === 'product-a').price, 19);
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
