import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { money, fromMinor, parseMoney, Money } from '../dist/esm/index.js';
const usd = { currency: 'USD', precision: 2 };
const m = (value, options = usd) => money(value, options);

test('exact arithmetic never passes through floating point', () => {
  assert.equal(m('0.1').add(m('0.2')).toString(), '0.30');
  assert.equal(m('9007199254740993.99').add(m('0.01')).toString(), '9007199254740994.00');
  assert.equal(m('3').subtract(m('4.25')).toString(), '-1.25');
  assert.equal(m('-0.00').toString(), '0.00');
  assert.equal(m('+0001.20').toString(), '1.20');
});
test('signed rounding modes and ties are explicit', () => {
  for (const [mode, positive, negative] of [
    ['half-even', '1.22', '-1.22'],
    ['half-up', '1.23', '-1.23'],
    ['down', '1.22', '-1.22'],
    ['up', '1.23', '-1.23'],
    ['floor', '1.22', '-1.23'],
    ['ceil', '1.23', '-1.22'],
  ]) {
    assert.equal(m('1.225', { ...usd, rounding: mode }).toString(), positive);
    assert.equal(m('-1.225', { ...usd, rounding: mode }).toString(), negative);
  }
  assert.equal(m('1.235').toString(), '1.24');
  assert.equal(m('-1.235').toString(), '-1.24');
});
test('multiplication division and rescaling round only at output precision', () => {
  assert.equal(m('10.01').multiply('0.5').toString(), '5.00');
  assert.equal(m('10.03').multiply('0.5').toString(), '5.02');
  assert.equal(m('1').divide('3').toString(), '0.33');
  assert.equal(m('-1').divide('-8').toString(), '0.12');
  assert.equal(
    m('1.235', { ...usd, precision: 3 })
      .rescale(2)
      .toString(),
    '1.24',
  );
  assert.equal(m('1.20').rescale(4).toString(), '1.2000');
  assert.throws(() => m('1').divide('0'), /zero/);
});
test('currency conversion requires explicit rates and target precision', () => {
  assert.equal(m('10.25').convert('1.5', { currency: 'JPY', precision: 0 }).toString(), '15');
  assert.equal(m('-10.25').convert('1.5', { currency: 'EUR', precision: 2 }).toString(), '-15.38');
  assert.throws(() => m('1').convert('-1', usd), /positive/);
});
test('allocation uses largest remainder and stable index tie breaks', () => {
  assert.deepEqual(m('0.05').allocate([1n, 1n, 1n]).map(String), ['0.02', '0.02', '0.01']);
  assert.deepEqual(m('-0.05').split(3).map(String), ['-0.02', '-0.02', '-0.01']);
  assert.deepEqual(m('0.02').allocate([1n, 3n, 0n]).map(String), ['0.01', '0.01', '0.00']);
  assert.deepEqual(m('0').split(2).map(String), ['0.00', '0.00']);
});
test('allocations conserve positive and negative totals across generated cases', () => {
  for (let units = -150; units <= 150; units++) {
    for (const weights of [
      [1n, 2n, 3n],
      [0n, 1n],
      [5n, 5n, 1n, 9n],
    ]) {
      const value = fromMinor(BigInt(units), usd);
      const parts = value.allocate(weights);
      assert.equal(
        parts.reduce((sum, part) => sum + part.minor, 0n),
        value.minor,
      );
      parts.forEach((part, index) => {
        if (weights[index] === 0n) assert.equal(part.minor, 0n);
        assert.ok(units >= 0 ? part.minor >= 0n : part.minor <= 0n);
      });
    }
  }
});
test('incompatible money values fail rather than implicitly converting', () => {
  const value = m('1');
  for (const other of [
    m('1', { currency: 'EUR', precision: 2 }),
    m('1', { ...usd, precision: 3 }),
  ]) {
    for (const operation of ['add', 'subtract', 'compare', 'equals'])
      assert.throws(() => value[operation](other), /matching/);
  }
  assert.equal(value.compare(m('2')), -1);
  assert.equal(value.equals(m('1.00')), true);
  assert.equal(value.negate().abs().toString(), '1.00');
  assert.ok(value instanceof Money);
  assert.ok(Object.isFrozen(value));
});
test('serialization is portable and validates unknown JSON data', () => {
  const value = m('-123.45');
  assert.deepEqual(value.toJSON(), { currency: 'USD', precision: 2, minor: '-12345' });
  assert.equal(parseMoney(JSON.parse(JSON.stringify(value))).minor, value.minor);
  for (const minor of ['1.2', '01', '-0', '1e3', '', '1'.repeat(1001)]) {
    assert.throws(() => parseMoney({ ...usd, minor }), /serialized/);
  }
  assert.throws(() => parseMoney(null), /serialized/);
});
test('malformed input and oversized work fail explicitly', () => {
  for (const value of [0.1, NaN, '', '.1', '1.', '1e3', ' 1', '--1', '1'.repeat(1001)])
    assert.throws(() => m(value), TypeError);
  for (const precision of [-1, 101, 1.5, NaN])
    assert.throws(() => m('1', { ...usd, precision }), RangeError);
  for (const currency of ['usd', '', 'US', 'USD!'])
    assert.throws(() => m('1', { ...usd, currency }), TypeError);
  for (const weights of [[], [0n], [-1n], [1]]) assert.throws(() => m('1').allocate(weights));
  for (const parts of [0, -1, 1.5, 100001]) assert.throws(() => m('1').split(parts), RangeError);
  assert.throws(() => m('1').multiply('1', 'bad'), /rounding/);
  assert.throws(() => fromMinor(1, usd), /bigint/);
});
test('all supported precisions render fixed decimal places', () => {
  for (let precision = 0; precision <= 100; precision++) {
    const value = fromMinor(1n, { ...usd, precision });
    assert.equal(m(value.toString(), { ...usd, precision }).minor, 1n);
  }
});
test('CommonJS exposes equivalent independent arithmetic', () => {
  const cjs = createRequire(import.meta.url)('../dist/cjs/index.js');
  assert.equal(cjs.money('0.1', usd).add(cjs.money('0.2', usd)).toString(), '0.30');
});
