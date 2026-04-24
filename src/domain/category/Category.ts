import type { TransactionKind } from "../transaction/Transaction";

export interface Category {
  id: string;
  userId: string;
  kind: TransactionKind;
  slug: string;
  name: string;
  color: string;
  monthlyLimit?: number | null;
  isArchived: boolean;
}

export interface CategoryTag {
  id: string;
  userId: string;
  categoryId: string;
  categorySlug: string;
  kind: TransactionKind;
  slug: string;
  name: string;
  color: string;
  isArchived: boolean;
}
