export type BudgetPeriodKind = "weekly" | "monthly";

export interface Budget {
  id: string;
  userId: string;
  categoryId: string;
  categorySlug: string;
  periodKind: BudgetPeriodKind;
  amount: number;
  startsOn: string;
  endsOn?: string | null;
}

export interface Goal {
  id: string;
  userId: string;
  name: string;
  targetAmount: number;
  currentAmount: number;
  linkedCategoryId?: string | null;
  linkedCategorySlug?: string | null;
  color: string;
  isArchived: boolean;
}
