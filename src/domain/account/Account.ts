export type AccountKind = "cash" | "checking" | "savings" | "investment" | "credit_card" | "wallet";

export interface Account {
  id: string;
  userId: string;
  name: string;
  kind: AccountKind;
  color: string;
  institution?: string | null;
  isArchived: boolean;
}

export interface CreditCard {
  id: string;
  userId: string;
  accountId?: string | null;
  name: string;
  brand?: string | null;
  color: string;
  closingDay: number;
  dueDay: number;
  creditLimit?: number | null;
  isArchived: boolean;
}
