// Shared predicates and mappers used by both twins. Extracted here so neither twin imports from
// the other (twin independence rule).

import type { Transaction } from './mock/transactions';

export const isPositive = (tx: Transaction) => tx.amount > 0;
export const formatTx = (tx: Transaction) => `${tx.id}: $${tx.amount}`;
export const getAmount = (tx: Transaction) => tx.amount;
export const sumAmounts = (acc: number, val: number) => acc + val;
