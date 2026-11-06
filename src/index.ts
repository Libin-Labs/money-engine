export type Rounding = 'half-even' | 'half-up' | 'down' | 'up' | 'floor' | 'ceil';
export interface MoneyOptions {
  currency: string;
  precision: number;
  rounding?: Rounding;
}
export interface MoneyJSON {
  currency: string;
  precision: number;
  minor: string;
}

const modes = new Set<Rounding>(['half-even', 'half-up', 'down', 'up', 'floor', 'ceil']);
function roundingMode(value: Rounding): Rounding {
  if (!modes.has(value)) throw new TypeError(`Invalid rounding mode: ${String(value)}.`);
  return value;
}
function metadata(options: MoneyOptions): void {
  if (
    !options ||
    typeof options.currency !== 'string' ||
    !/^[A-Z][A-Z0-9]{2,11}$/.test(options.currency)
  ) {
    throw new TypeError('currency must be an uppercase identifier of 3 to 12 characters.');
  }
  if (!Number.isInteger(options.precision) || options.precision < 0 || options.precision > 100) {
    throw new RangeError('precision must be an integer from 0 to 100.');
  }
}
function decimal(value: string): { coefficient: bigint; scale: number } {
  if (typeof value !== 'string' || value.length > 1000 || !/^[+-]?\d+(?:\.\d+)?$/.test(value)) {
    throw new TypeError(
      'Expected a plain decimal string of at most 1000 characters; exponent notation is not accepted.',
    );
  }
  const [whole, fraction = ''] = value.split('.');
  return { coefficient: BigInt(whole! + fraction), scale: fraction.length };
}
function power(scale: number): bigint {
  return 10n ** BigInt(scale);
}
function rounded(numerator: bigint, denominator: bigint, mode: Rounding): bigint {
  roundingMode(mode);
  if (denominator === 0n) throw new RangeError('Cannot divide by zero.');
  const negative = numerator < 0n !== denominator < 0n;
  const n = numerator < 0n ? -numerator : numerator;
  const d = denominator < 0n ? -denominator : denominator;
  let quotient = n / d;
  const remainder = n % d;
  if (
    remainder !== 0n &&
    (mode === 'up' ||
      (mode === 'floor' && negative) ||
      (mode === 'ceil' && !negative) ||
      (mode === 'half-up' && remainder * 2n >= d) ||
      (mode === 'half-even' &&
        (remainder * 2n > d || (remainder * 2n === d && quotient % 2n !== 0n))))
  )
    quotient++;
  return negative ? -quotient : quotient;
}

/** Immutable value; the currency identifier does not perform currency conversion. */
export class Money {
  private constructor(
    readonly minor: bigint,
    readonly currency: string,
    readonly precision: number,
  ) {
    Object.freeze(this);
  }

  static fromMinor(minor: bigint, options: MoneyOptions): Money {
    metadata(options);
    if (typeof minor !== 'bigint') throw new TypeError('minor must be a bigint.');
    if (options.rounding !== undefined) roundingMode(options.rounding);
    return new Money(minor, options.currency, options.precision);
  }
  private compatible(other: Money): void {
    if (!(other instanceof Money))
      throw new TypeError('Expected a Money value from this package instance.');
    if (this.currency !== other.currency || this.precision !== other.precision) {
      throw new RangeError('Money values must have matching currencies and precision.');
    }
  }
  add(other: Money): Money {
    this.compatible(other);
    return Money.fromMinor(this.minor + other.minor, this);
  }
  subtract(other: Money): Money {
    this.compatible(other);
    return Money.fromMinor(this.minor - other.minor, this);
  }
  negate(): Money {
    return Money.fromMinor(-this.minor, this);
  }
  abs(): Money {
    return this.minor < 0n ? this.negate() : this;
  }
  compare(other: Money): -1 | 0 | 1 {
    this.compatible(other);
    return this.minor < other.minor ? -1 : this.minor > other.minor ? 1 : 0;
  }
  equals(other: Money): boolean {
    return this.compare(other) === 0;
  }
  multiply(factor: string, rounding: Rounding = 'half-even'): Money {
    const value = decimal(factor);
    return Money.fromMinor(
      rounded(this.minor * value.coefficient, power(value.scale), rounding),
      this,
    );
  }
  divide(divisor: string, rounding: Rounding = 'half-even'): Money {
    const value = decimal(divisor);
    return Money.fromMinor(
      rounded(this.minor * power(value.scale), value.coefficient, rounding),
      this,
    );
  }
  rescale(precision: number, rounding: Rounding = 'half-even'): Money {
    const options = { currency: this.currency, precision };
    metadata(options);
    return Money.fromMinor(
      rounded(this.minor * power(precision), power(this.precision), rounding),
      options,
    );
  }
  convert(rate: string, target: MoneyOptions): Money {
    metadata(target);
    const value = decimal(rate);
    if (value.coefficient <= 0n) throw new RangeError('Conversion rates must be positive.');
    const minor = rounded(
      this.minor * value.coefficient * power(target.precision),
      power(this.precision + value.scale),
      target.rounding ?? 'half-even',
    );
    return Money.fromMinor(minor, target);
  }
  allocate(weights: readonly bigint[]): Money[] {
    if (
      !Array.isArray(weights) ||
      weights.length === 0 ||
      weights.length > 100000 ||
      weights.some((weight) => typeof weight !== 'bigint' || weight < 0n)
    ) {
      throw new TypeError('weights must contain 1 to 100000 nonnegative bigints.');
    }
    const total = weights.reduce((sum, weight) => sum + weight, 0n);
    if (total === 0n) throw new RangeError('At least one weight must be positive.');
    const amount = this.minor < 0n ? -this.minor : this.minor;
    const parts = weights.map((weight, index) => ({
      index,
      units: (amount * weight) / total,
      remainder: (amount * weight) % total,
    }));
    let remaining = amount - parts.reduce((sum, part) => sum + part.units, 0n);
    const ranked = [...parts].sort((a, b) =>
      a.remainder === b.remainder ? a.index - b.index : a.remainder > b.remainder ? -1 : 1,
    );
    for (const part of ranked) {
      if (remaining === 0n) break;
      part.units++;
      remaining--;
    }
    return parts.map((part) => Money.fromMinor(this.minor < 0n ? -part.units : part.units, this));
  }
  split(parts: number): Money[] {
    if (!Number.isInteger(parts) || parts < 1 || parts > 100000)
      throw new RangeError('parts must be an integer from 1 to 100000.');
    return this.allocate(Array<bigint>(parts).fill(1n));
  }
  toString(): string {
    const digits = (this.minor < 0n ? -this.minor : this.minor)
      .toString()
      .padStart(this.precision + 1, '0');
    const value = this.precision
      ? `${digits.slice(0, -this.precision)}.${digits.slice(-this.precision)}`
      : digits;
    return `${this.minor < 0n ? '-' : ''}${value}`;
  }
  toJSON(): MoneyJSON {
    return { currency: this.currency, precision: this.precision, minor: String(this.minor) };
  }
}

export function money(amount: string, options: MoneyOptions): Money {
  metadata(options);
  const value = decimal(amount);
  return Money.fromMinor(
    rounded(
      value.coefficient * power(options.precision),
      power(value.scale),
      options.rounding ?? 'half-even',
    ),
    options,
  );
}
export function fromMinor(minor: bigint, options: MoneyOptions): Money {
  return Money.fromMinor(minor, options);
}
export function parseMoney(value: unknown): Money {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    !('currency' in value) ||
    !('precision' in value) ||
    !('minor' in value) ||
    typeof value.currency !== 'string' ||
    typeof value.precision !== 'number' ||
    typeof value.minor !== 'string' ||
    value.minor.length > 1000 ||
    !/^-?(?:0|[1-9]\d*)$/.test(value.minor) ||
    value.minor === '-0'
  ) {
    throw new TypeError(
      'Invalid serialized money; minor must be a canonical integer string of at most 1000 characters.',
    );
  }
  return fromMinor(BigInt(value.minor), { currency: value.currency, precision: value.precision });
}
