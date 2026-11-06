# @lp-labs/money-engine

Exact monetary arithmetic using native `bigint`. Zero runtime or peer dependencies. No floating-point amount conversions, implicit exchange rates or hidden currency tables.

## Install

```sh
npm install @lp-labs/money-engine
```

Requires Node 18+ or a modern browser supporting BigInt and ES2022. ESM, CommonJS and TypeScript declarations are included.

## Quick start

```js
import { money } from '@lp-labs/money-engine';

const usd = { currency: 'USD', precision: 2 };
const total = money('0.10', usd).add(money('0.20', usd));
console.log(total.toString()); // "0.30"
console.log(money('10.00', usd).split(3).map(String)); // ["3.34", "3.33", "3.33"]
```

CommonJS: `const { money } = require('@lp-labs/money-engine');`.

## Amount and currency model

Each immutable `Money` value has `minor: bigint`, `currency: string` and `precision: number`. For example, USD 1.23 at precision 2 has `minor === 123n`.

- Amounts, multiplication factors, divisors and exchange rates are **plain decimal strings**, not JavaScript numbers. Signs and leading zeros are accepted. Whitespace, exponent notation, `.5` and `1.` are rejected.
- `precision` is required and ranges from 0 to 100. There is deliberately no built-in ISO currency precision database.
- `currency` is a case-sensitive uppercase identifier of 3-12 characters, starting with a letter and containing letters/digits. It identifies units, not an ISO validity guarantee.
- Addition, subtraction and comparisons require identical currency and precision. Mismatches throw rather than silently converting.
- Input decimal strings are capped at 1,000 characters. Raw bigint values and arithmetic results have no digit cap; applications must bound their own workloads.
- Allocate a new value through a factory; the `Money` constructor is private in TypeScript. Properties are frozen at runtime.

## API

Runtime exports: `Money`, `money`, `fromMinor`, `parseMoney`.

Type exports: `MoneyOptions`, `MoneyJSON`, `Rounding`.

### Factories

| API | Behavior |
|---|---|
| `money(amount, options)` | Parse a decimal string, quantize to `precision`, return `Money`. |
| `fromMinor(minor, options)` | Construct from bigint minor units without quantization. |
| `Money.fromMinor(minor, options)` | Same operation as the exported factory. |
| `parseMoney(value: unknown)` | Validate a serialized object and reconstruct a value. |

`MoneyOptions` is `{ currency: string; precision: number; rounding?: Rounding }`. Default rounding is `half-even`; values do not retain a default rounding policy. Pass a policy to each operation when needed.

### Value methods

| Method | Result |
|---|---|
| `add(other)`, `subtract(other)` | New compatible `Money`. |
| `negate()`, `abs()` | Sign-adjusted immutable value. |
| `compare(other)` | `-1`, `0` or `1`; rejects incompatible metadata. |
| `equals(other)` | Boolean; also rejects incompatible metadata. |
| `multiply(factor, rounding?)` | Exact decimal multiplication followed by rounding to existing precision. |
| `divide(divisor, rounding?)` | Exact decimal division followed by rounding; zero divisor throws. |
| `rescale(precision, rounding?)` | Change precision while retaining currency. |
| `convert(rate, targetOptions)` | Multiply by a strictly positive rate and quantize once to target precision/currency. |
| `allocate(weights)` | Deterministic largest-remainder distribution using nonnegative bigint weights. |
| `split(parts)` | Equal-weight allocation across an integer number of parts. |
| `toString()` | Fixed-precision decimal string without symbol/grouping. |
| `toJSON()` | `{ currency, precision, minor: string }`. |

### Rounding

| Policy | Meaning |
|---|---|
| `half-even` | Nearest; exact ties go to the even minor unit. Default. |
| `half-up` | Nearest; exact ties go away from zero. |
| `down` | Toward zero. |
| `up` | Away from zero. |
| `floor` | Toward negative infinity. |
| `ceil` | Toward positive infinity. |

```js
const precise = money('1.235', { currency: 'USD', precision: 3 });
console.log(precise.rescale(2, 'half-even').toString()); // "1.24"
console.log(money('-1.225', { currency: 'USD', precision: 2, rounding: 'floor' }).toString()); // "-1.23"
const euro = money('10.25', { currency: 'USD', precision: 2 })
  .convert('0.92', { currency: 'EUR', precision: 2 });
console.log(euro.toString()); // "9.43"
```

No automatic rate fetching or fee/tax logic is performed. When a calculation has multiple stages, each quantizing operation may round. Retain sufficient intermediate precision or combine factors explicitly according to your business rules.

## Allocation

```js
const bill = money('0.05', { currency: 'USD', precision: 2 });
console.log(bill.allocate([1n, 1n, 1n]).map(String)); // ["0.02", "0.02", "0.01"]
console.log(bill.negate().split(3).map(String)); // ["-0.02", "-0.02", "-0.01"]
```

Shares are floored on the absolute total, then leftover units go to descending fractional remainders. Ties use original index order. Negative totals receive the same allocation with signs reversed. Zero-weight shares receive zero. At least one weight must be positive. Allocations/splits support 1-100,000 recipients; sorting is O(n log n). Every result retains metadata and sums exactly to the original minor total.

## Persistence

```js
import { parseMoney } from '@lp-labs/money-engine';
const text = JSON.stringify(money('123.45', { currency: 'USD', precision: 2 }));
const restored = parseMoney(JSON.parse(text));
console.log(restored.minor); // 12345n
```

`MoneyJSON` contains a canonical integer `minor` string (no leading zeros, plus sign, fraction or negative zero). The parser caps that string at 1,000 characters, validates metadata and ignores unrelated object fields. Larger arithmetic results can be serialized but require an application-specific import policy instead of this bounded parser. Never convert large minor units through `Number`.

## Customization, errors and limits

- Choose currencies, precision and rounding explicitly for your accounting domain. Validate actual currency definitions using your maintained reference data.
- For locale display, integrate your own formatter without converting large exact values to unsafe numbers. This package intentionally emits canonical decimal strings only.
- Use one module format/package instance for arithmetic: ESM and CommonJS classes are separate identities. JSON is the supported interchange boundary.
- Malformed types/strings/weights throw `TypeError`; invalid precision, incompatible metadata, division by zero, nonpositive rates and invalid split counts throw `RangeError`.
- There are no side effects, network calls, persistence adapters, cross-package imports or platform globals required beyond standard JavaScript.
- This is independently authored arithmetic code, not copied framework code or financial/tax advice. No regulatory certification is claimed.

## Support

If this library is useful to you, consider supporting its maintenance with a [donation via PayPal](https://www.paypal.me/LibinPrasanth).

## Author

Created by [Libin Prasanth](https://www.linkedin.com/in/libinprasanth/). Connect on LinkedIn for updates and discussion.
