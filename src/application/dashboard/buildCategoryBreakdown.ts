import type { Category } from "../../domain/category/Category";
import type { Transaction } from "../../domain/transaction/Transaction";

export interface CategoryBreakdownRow {
  categoryId: string | null;
  categorySlug: string;
  categoryName: string;
  color: string;
  total: number;
}

export function buildCategoryBreakdown(
  transactions: Transaction[],
  categories: Category[]
): CategoryBreakdownRow[] {
  const byCategoryId = new Map(categories.map((item) => [item.id, item]));
  const rows = new Map<string, CategoryBreakdownRow>();

  transactions
    .filter((item) => item.kind === "expense")
    .forEach((item) => {
      const category = item.categoryId ? byCategoryId.get(item.categoryId) : null;
      const key = category?.id || `legacy:${item.categoryId || "outros"}`;
      const previous = rows.get(key);

      rows.set(key, {
        categoryId: category?.id || null,
        categorySlug: category?.slug || "outros",
        categoryName: category?.name || "Outros",
        color: category?.color || "#667085",
        total: (previous?.total || 0) + item.amount,
      });
    });

  return Array.from(rows.values()).sort((left, right) => right.total - left.total);
}
