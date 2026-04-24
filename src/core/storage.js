import { APP_STORAGE_KEY, STORAGE_KEY, defaultSettings, state } from "./state.js";
import { buildCatalogFromSettings, buildSettingsFromCatalog } from "./catalog.js";
import { clone, mergeBudgetRules, mergeSubcategories } from "./utils.js";

export function createStorageModule(deps) {
  function save() {
    localStorage.setItem(
      APP_STORAGE_KEY,
      JSON.stringify({ transactions: state.transactions, settings: state.settings, catalog: state.catalog })
    );
  }

  function persist() {
    save();
    scheduleAutoSync();
  }

  function scheduleAutoSync() {
    if (!state.currentUser || !state.supabaseClient) return;
    window.clearTimeout(state.syncTimer);
    state.syncTimer = window.setTimeout(() => {
      deps.syncToSupabase?.();
    }, 600);
  }

  function load() {
    try {
      const raw = localStorage.getItem(APP_STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw);
        state.transactions = Array.isArray(saved.transactions) ? saved.transactions : [];
        state.settings = mergeSettings(saved.settings);
        state.catalog = buildCatalogFromSettings(state.settings, saved.catalog || {});
        return;
      }

      const legacy = localStorage.getItem(STORAGE_KEY);
      state.transactions = legacy ? JSON.parse(legacy) : [];
      state.settings = mergeSettings();
      state.catalog = buildCatalogFromSettings(state.settings);
    } catch (error) {
      console.error("Erro ao ler cache local", error);
      localStorage.removeItem(APP_STORAGE_KEY);
      localStorage.removeItem(STORAGE_KEY);
      state.transactions = [];
      state.settings = mergeSettings();
      state.catalog = buildCatalogFromSettings(state.settings);
      deps.notify?.("Os dados locais estavam corrompidos e foram reinicializados neste navegador.");
    }
  }

  function hydrateCatalog(settings = state.settings, existingCatalog = state.catalog) {
    state.catalog = buildCatalogFromSettings(settings, existingCatalog || {});
    return state.catalog;
  }

  function syncSettingsFromCatalog() {
    state.settings = mergeSettings(buildSettingsFromCatalog(state.catalog));
    return state.settings;
  }

  function mergeSettings(saved = {}) {
    const categories = {
      expense: saved.categories?.expense?.length ? saved.categories.expense : clone(defaultSettings.categories.expense),
      income: saved.categories?.income?.length ? saved.categories.income : clone(defaultSettings.categories.income),
      investment: saved.categories?.investment?.length ? saved.categories.investment : clone(defaultSettings.categories.investment),
    };
    return {
      accounts: saved.accounts?.length ? saved.accounts : [...defaultSettings.accounts],
      creditCards: saved.creditCards?.length ? saved.creditCards : clone(defaultSettings.creditCards),
      categories,
      subcategories: mergeSubcategories(saved.subcategories, categories),
      goals: saved.goals?.length ? saved.goals : clone(defaultSettings.goals),
      budgetRules: mergeBudgetRules(saved.budgetRules, categories.expense),
    };
  }

  return { save, persist, scheduleAutoSync, load, mergeSettings, hydrateCatalog, syncSettingsFromCatalog };
}
