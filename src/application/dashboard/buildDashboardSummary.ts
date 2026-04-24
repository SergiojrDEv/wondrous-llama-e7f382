import type { Transaction } from "../../domain/transaction/Transaction";

export interface DashboardSummary {
  income: number;
  expense: number;
  investment: number;
  availableBalance: number;
  commitmentRate: number;
  investmentRate: number;
}

export function buildDashboardSummary(transactions: Transaction[]): DashboardSummary {
  const income = transactions.filter((item) => item.kind === "income").reduce((sum, item) => sum + item.amount, 0);
  const expense = transactions.filter((item) => item.kind === "expense").reduce((sum, item) => sum + item.amount, 0);
  const investment = transactions.filter((item) => item.kind === "investment").reduce((sum, item) => sum + item.amount, 0);
  const availableBalance = income - expense - investment;
  const commitmentRate = income > 0 ? ((expense + investment) / income) * 100 : 0;
  const investmentRate = income > 0 ? (investment / income) * 100 : 0;

  return {
    income,
    expense,
    investment,
    availableBalance,
    commitmentRate,
    investmentRate,
  };
}
