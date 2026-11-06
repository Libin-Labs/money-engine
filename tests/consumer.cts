import { money, Money } from '@lp-labs/money-engine';
const amount: Money = money('1', { currency: 'USD', precision: 2 });
const total: bigint = amount.multiply('3').minor;
void total;
// @ts-expect-error exact factors are strings
amount.multiply(0.3);
