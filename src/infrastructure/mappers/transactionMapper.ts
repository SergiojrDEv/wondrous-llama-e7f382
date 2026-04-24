import type { Transaction } from "../../domain/transaction/Transaction";

export interface V2TransactionRow {
  id: string;
  user_id: string;
  transaction_kind: Transaction["kind"];
  status: Transaction["status"];
  description: string;
  notes: string | null;
  amount: number;
  transaction_date: string;
  due_date: string | null;
  paid_at: string | null;
  category_id: string | null;
  category_tag_id: string | null;
  account_id: string | null;
  credit_card_id: string | null;
  payment_method: Transaction["paymentMethod"];
  recurring_rule_id: string | null;
  installment_group_id: string | null;
  installment_number: number | null;
  installment_total: number | null;
  created_at: string;
  updated_at: string | null;
}

export function mapV2RowToTransaction(row: V2TransactionRow): Transaction {
  return {
    id: row.id,
    userId: row.user_id,
    kind: row.transaction_kind,
    status: row.status,
    description: row.description,
    notes: row.notes,
    amount: Number(row.amount || 0),
    transactionDate: row.transaction_date,
    dueDate: row.due_date,
    paidAt: row.paid_at,
    categoryId: row.category_id,
    categoryTagId: row.category_tag_id,
    accountId: row.account_id,
    creditCardId: row.credit_card_id,
    paymentMethod: row.payment_method,
    recurringRuleId: row.recurring_rule_id,
    installmentGroupId: row.installment_group_id,
    installmentNumber: row.installment_number,
    installmentTotal: row.installment_total,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapTransactionToV2Row(transaction: Transaction): V2TransactionRow {
  return {
    id: transaction.id,
    user_id: transaction.userId,
    transaction_kind: transaction.kind,
    status: transaction.status,
    description: transaction.description,
    notes: transaction.notes || null,
    amount: transaction.amount,
    transaction_date: transaction.transactionDate,
    due_date: transaction.dueDate || null,
    paid_at: transaction.paidAt || null,
    category_id: transaction.categoryId || null,
    category_tag_id: transaction.categoryTagId || null,
    account_id: transaction.accountId || null,
    credit_card_id: transaction.creditCardId || null,
    payment_method: transaction.paymentMethod,
    recurring_rule_id: transaction.recurringRuleId || null,
    installment_group_id: transaction.installmentGroupId || null,
    installment_number: transaction.installmentNumber || null,
    installment_total: transaction.installmentTotal || null,
    created_at: transaction.createdAt,
    updated_at: transaction.updatedAt || null,
  };
}
