// shared predicates and mappers used by both twins

import type { Transaction } from './mock/transactions';

export const isPositive = (tx: Transaction) => tx.amount > 0;
export const formatTx = (tx: Transaction) => `${tx.id}: $${tx.amount}`;
export const getAmount = (tx: Transaction) => tx.amount;
export const sumAmounts = (acc: number, val: number) => acc + val;
