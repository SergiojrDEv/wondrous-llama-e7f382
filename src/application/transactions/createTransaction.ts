import type { CreateTransactionInput, Transaction } from "../../domain/transaction/Transaction";

function assertValidInput(input: CreateTransactionInput) {
  if (!input.userId) throw new Error("userId is required");
  if (!input.description.trim()) throw new Error("description is required");
  if (!(input.amount > 0)) throw new Error("amount must be greater than zero");
  if (!input.transactionDate) throw new Error("transactionDate is required");
}

export function createTransaction(input: CreateTransactionInput, idFactory: () => string, nowIso: string): Transaction {
  assertValidInput(input);

  return {
    id: idFactory(),
    userId: input.userId,
    kind: input.kind,
    status: input.status || "paid",
    description: input.description.trim(),
    notes: input.notes || null,
    amount: input.amount,
    transactionDate: input.transactionDate,
    dueDate: input.dueDate || input.transactionDate,
    paidAt: input.status === "paid" ? nowIso : null,
    categoryId: input.categoryId || null,
    categoryTagId: input.categoryTagId || null,
    accountId: input.accountId || null,
    creditCardId: input.creditCardId || null,
    paymentMethod: input.paymentMethod || "pix",
    recurringRuleId: input.recurringRuleId || null,
    installmentGroupId: input.installmentGroupId || null,
    installmentNumber: input.installmentNumber || null,
    installmentTotal: input.installmentTotal || null,
    createdAt: nowIso,
    updatedAt: nowIso,
  };
}
