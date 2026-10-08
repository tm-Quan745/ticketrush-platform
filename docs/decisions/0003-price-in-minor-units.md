# ADR 0003: Store prices in integer minor units

Status: Accepted

## Context

Money must survive API, database and future payment-provider round trips without
binary floating-point rounding. V1 used NUMERIC(19,2) and did not record currency.

## Options

- Floating point: convenient but cannot represent many decimal prices exactly.
- Decimal plus currency: exact, but requires explicit scale and rounding rules.
- Integer minor units plus currency: exact, simple comparisons, matches common
  payment API contracts; callers must know the currency exponent.

## Decision

Use PostgreSQL BIGINT / Java long and an uppercase ISO 4217 currency code. API
requires integer values, rejects fractional numbers, and validates currency codes.
USD has two minor-unit digits, VND zero, and some currencies three; never assume
all new prices should be divided by 100. No exchange-rate conversion is added.

V2 interprets legacy V1 prices as USD major units and multiplies by 100 exactly.
V1 contains no currency metadata, so this is an explicit migration assumption.
Operators with non-USD legacy data must resolve that before applying V2. A value
outside BIGINT range aborts the migration rather than silently truncating it.
V1 remains unchanged. A migration integration test verifies 12.34 becomes 1234.

## Consequences

Arithmetic and equality are exact within signed BIGINT range. Clients format using
the currency exponent. Future multiplication by quantity must check overflow.
Currency changes count as price changes for the sale-start restriction.
