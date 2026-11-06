import { money, fromMinor, parseMoney, Money } from '@lp-labs/money-engine';
import type { MoneyJSON, MoneyOptions, Rounding } from '@lp-labs/money-engine';
const rounding: Rounding = 'half-even';
const options: MoneyOptions = { currency: 'USD', precision: 2, rounding };
const amount: Money = money('10.25', options).add(fromMinor(1n, options));
const serialized: MoneyJSON = amount.toJSON();
parseMoney(serialized)
  .allocate([1n, 2n])
  .map((part) => part.toString());
amount.convert('0.9', { currency: 'EUR', precision: 2 });
// @ts-expect-error no floating point amount input
money(0.1, options);
// @ts-expect-error immutable value
amount.minor = 1n;
// @ts-expect-error unknown rounding mode
amount.divide('2', 'nearest');
