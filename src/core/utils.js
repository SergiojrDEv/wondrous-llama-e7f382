import { defaultSettings, formatter, state } from "./state.js";
import { getCatalogAccount, getCatalogCategory, getCatalogCreditCard, getCatalogTag } from "./catalog.js";

export function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function money(value) {
  return formatter.format(value || 0);
}

export function esc(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function monthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function parseLocalDate(value) {
  const [year, month, day] = String(value).split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function toDateInput(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function addMonths(dateValue, amount) {
  const date = parseLocalDate(dateValue);
  const day = date.getDate();
  const next = new Date(date.getFullYear(), date.getMonth() + amount, 1);
  const lastDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
  next.setDate(Math.min(day, lastDay));
  return toDateInput(next);
}

export function transactionMonth(transaction) {
  return monthKey(parseLocalDate(transaction.date));
}

export function getMonthTransactions(date = state.currentDate) {
  const key = monthKey(date);
  return state.transactions.filter((item) => transactionMonth(item) === key);
}

export function getCategory(type, key) {
  return state.settings.categories[type].find((item) => item[0] === key) || [key, key, "#667085"];
}

export function mergeBudgetRules(saved = {}, expenseCategories = []) {
  const result = {};
  expenseCategories.forEach(([key, , , limit]) => {
    const monthly = Number(saved?.[key]?.monthly ?? defaultSettings.budgetRules?.[key]?.monthly ?? limit ?? 0);
    const weekly = Number(saved?.[key]?.weekly ?? defaultSettings.budgetRules?.[key]?.weekly ?? (monthly ? monthly / 4 : 0));
    result[key] = {
      weekly: Math.max(0, weekly || 0),
      monthly: Math.max(0, monthly || 0),
    };
  });
  return result;
}

export function getBudgetRule(categoryKey) {
  return state.settings.budgetRules?.[categoryKey] || { weekly: 0, monthly: 0 };
}

export function syncCategoryMonthlyLimit(categoryKey, monthly) {
  const category = state.settings.categories.expense.find(([itemKey]) => itemKey === categoryKey);
  if (category) category[3] = monthly;
}

export function getCategoryColorFromList(type, categoryKey, categories = defaultSettings.categories) {
  return categories?.[type]?.find(([key]) => key === categoryKey)?.[2] || "#94a3b8";
}

export function mergeSubcategories(saved = {}, categories = defaultSettings.categories) {
  const result = { expense: {}, income: {}, investment: {} };
  ["expense", "income", "investment"].forEach((type) => {
    const defaults = defaultSettings.subcategories[type] || {};
    Object.entries(defaults).forEach(([categoryKey, items]) => {
      const fallbackColor = getCategoryColorFromList(type, categoryKey, categories);
      result[type][categoryKey] = clone(items).map((item) => [item[0], item[1], item[2] || fallbackColor]);
    });
    Object.entries(saved[type] || {}).forEach(([categoryKey, items]) => {
      if (Array.isArray(items) && items.length) {
        const fallbackColor = getCategoryColorFromList(type, categoryKey, categories);
        result[type][categoryKey] = items.map((item) => [item[0], item[1], item[2] || fallbackColor]);
      }
    });
  });
  return result;
}

export function getSubcategories(type, categoryKey) {
  return state.settings.subcategories?.[type]?.[categoryKey] || [];
}

export function getSubcategoryLabel(type, categoryKey, subcategoryKey) {
  if (!subcategoryKey) return "";
  const match = getSubcategories(type, categoryKey).find(([key]) => key === subcategoryKey);
  return match ? match[1] : subcategoryKey;
}

export function getSubcategoryColor(type, categoryKey, subcategoryKey) {
  if (!subcategoryKey) return getCategoryColorFromList(type, categoryKey, state.settings.categories);
  const match = getSubcategories(type, categoryKey).find(([key]) => key === subcategoryKey);
  return match?.[2] || getCategoryColorFromList(type, categoryKey, state.settings.categories);
}

export function categoryDisplayLabel(item) {
  const categoryRecord = resolveTransactionCategory(item);
  const categoryLabel = categoryRecord?.name || getCategory(item.type, item.category)[1];
  const tagRecord = resolveTransactionTag(item, categoryRecord);
  const subLabel = tagRecord?.name || getSubcategoryLabel(item.type, item.category, item.subcategory);
  return subLabel ? `${categoryLabel} / ${subLabel}` : categoryLabel;
}

export function resolveTransactionCategory(item) {
  return getCatalogCategory(state.catalog, item.type, item.category, item.categoryId || null);
}

export function resolveTransactionTag(item, categoryRecord = resolveTransactionCategory(item)) {
  const categorySlug = categoryRecord?.slug || item.category;
  return getCatalogTag(state.catalog, item.type, categorySlug, item.subcategory, item.categoryTagId || null);
}

export function resolveTransactionAccount(item) {
  return getCatalogAccount(state.catalog, item.account, item.accountId || null);
}

export function resolveTransactionCreditCard(item) {
  return getCatalogCreditCard(state.catalog, item.creditCardId || item.credit_card_id || null);
}

export function syncTransactionRefs(item) {
  const categoryRecord = resolveTransactionCategory(item);
  if (categoryRecord) {
    item.category = categoryRecord.slug;
    item.categoryId = categoryRecord.id;
  } else {
    item.categoryId = null;
  }

  const tagRecord = resolveTransactionTag(item, categoryRecord);
  if (tagRecord) {
    item.subcategory = tagRecord.slug;
    item.categoryTagId = tagRecord.id;
  } else {
    item.categoryTagId = null;
  }

  const accountRecord = resolveTransactionAccount(item);
  if (accountRecord) {
    item.account = accountRecord.name;
    item.accountId = accountRecord.id;
  } else {
    item.accountId = null;
  }

  const cardRecord = resolveTransactionCreditCard(item);
  item.creditCardId = cardRecord?.id || item.creditCardId || null;

  return item;
}

export function paymentMethodLabel(value) {
  const labels = {
    pix: "Pix",
    debit: "Debito",
    credit: "Credito",
    cash: "Dinheiro",
    transfer: "Transferencia",
  };
  return labels[value] || "Outro";
}

export function createId() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  return "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (char) =>
    (Number(char) ^ (Math.random() * 16) >> (Number(char) / 4)).toString(16)
  );
}

export function slugify(value) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function simplifyFieldName(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

export function onlyDigits(value) {
  return String(value || "").replace(/\D/g, "");
}

export function isAdult(dateValue) {
  const birth = parseLocalDate(dateValue);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) age -= 1;
  return age >= 18;
}

export function isValidCpf(value) {
  const cpf = onlyDigits(value);
  if (cpf.length !== 11 || /^(\d)\1+$/.test(cpf)) return false;
  const calcDigit = (base) => {
    let sum = 0;
    for (let i = 0; i < base.length; i += 1) sum += Number(base[i]) * (base.length + 1 - i);
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };
  return calcDigit(cpf.slice(0, 9)) === Number(cpf[9]) && calcDigit(cpf.slice(0, 10)) === Number(cpf[10]);
}

export function formatCpf(value) {
  const digits = onlyDigits(value).slice(0, 11);
  return digits
    .replace(/^(\d{3})(\d)/, "$1.$2")
    .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1-$2");
}

export function formatPhone(value) {
  const digits = onlyDigits(value).slice(0, 11);
  if (digits.length <= 10) {
    return digits.replace(/(\d{2})(\d)/, "($1) $2").replace(/(\d{4})(\d)/, "$1-$2");
  }
  return digits.replace(/(\d{2})(\d)/, "($1) $2").replace(/(\d{5})(\d)/, "$1-$2");
}
