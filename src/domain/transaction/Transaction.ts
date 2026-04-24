export type TransactionKind = "expense" | "income" | "investment";

export type TransactionStatus = "paid" | "pending" | "planned" | "cancelled";

export type PaymentMethod = "pix" | "debit" | "credit" | "cash" | "transfer";

export interface Transaction {
  id: string;
  userId: string;
  kind: TransactionKind;
  status: TransactionStatus;
  description: string;
  notes?: string | null;
  amount: number;
  transactionDate: string;
  dueDate?: string | null;
  paidAt?: string | null;
  categoryId?: string | null;
  categoryTagId?: string | null;
  accountId?: string | null;
  creditCardId?: string | null;
  paymentMethod: PaymentMethod;
  recurringRuleId?: string | null;
  installmentGroupId?: string | null;
  installmentNumber?: number | null;
  installmentTotal?: number | null;
  createdAt: string;
  updatedAt?: string | null;
}

export interface CreateTransactionInput {
  userId: string;
  kind: TransactionKind;
  description: string;
  amount: number;
  transactionDate: string;
  dueDate?: string | null;
  status?: TransactionStatus;
  categoryId?: string | null;
  categoryTagId?: string | null;
  accountId?: string | null;
  creditCardId?: string | null;
  paymentMethod?: PaymentMethod;
  recurringRuleId?: string | null;
  installmentGroupId?: string | null;
  installmentNumber?: number | null;
  installmentTotal?: number | null;
  notes?: string | null;
}
