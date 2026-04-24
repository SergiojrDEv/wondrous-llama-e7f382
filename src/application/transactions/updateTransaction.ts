import type { Transaction } from "../../domain/transaction/Transaction";

export interface UpdateTransactionInput extends Partial<Omit<Transaction, "id" | "userId" | "createdAt">> {}

export function updateTransaction(current: Transaction, patch: UpdateTransactionInput, nowIso: string): Transaction {
  const next: Transaction = {
    ...current,
    ...patch,
    description: (patch.description ?? current.description).trim(),
    dueDate: patch.dueDate ?? current.dueDate ?? current.transactionDate,
    updatedAt: nowIso,
  };

  if (!next.description) throw new Error("description is required");
  if (!(next.amount > 0)) throw new Error("amount must be greater than zero");
  if (!next.transactionDate) throw new Error("transactionDate is required");

  return next;
}
