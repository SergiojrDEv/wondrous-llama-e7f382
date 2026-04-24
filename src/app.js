import { els, state } from "./core/state.js";
import {
  clone,
  esc,
  formatCpf,
  formatPhone,
  getBudgetRule,
  getCategory,
  getCategoryColorFromList,
  getSubcategories,
  getSubcategoryLabel,
  mergeBudgetRules,
  mergeSubcategories,
  monthKey,
  parseLocalDate,
  toDateInput,
} from "./core/utils.js";
import { createStorageModule } from "./core/storage.js";
import { createUiModule } from "./core/ui.js";
import { createDashboardModule } from "./dashboard/index.js";
import { createTransactionsModule } from "./transactions/index.js";
import { createSettingsModule } from "./settings/index.js";
import { createAuthModule } from "./auth/index.js";
import { createSupabaseModule } from "./supabase/index.js";

const deps = {
  els,
  state,
  clone,
  esc,
  getCategory,
  getSubcategoryLabel,
  mergeBudgetRules,
  mergeSubcategories,
  monthKey,
  parseLocalDate,
  toDateInput,
  getBudgetRule,
  getSubcategories,
  getCategoryColorFromList,
};

Object.assign(deps, createUiModule(deps));
Object.assign(deps, createStorageModule(deps));
state.settings = deps.mergeSettings();
state.catalog = deps.hydrateCatalog(state.settings, state.catalog);
Object.assign(deps, createTransactionsModule(deps));
Object.assign(deps, createSettingsModule(deps));
Object.assign(deps, createDashboardModule(deps));
Object.assign(deps, createAuthModule(deps));
Object.assign(deps, createSupabaseModule(deps));

function bindEvents() {
  const on = (selector, eventName, handler) => {
    document.querySelector(selector)?.addEventListener(eventName, handler);
  };

  on("#prev-month", "click", () => {
    state.currentDate = new Date(state.currentDate.getFullYear(), state.currentDate.getMonth() - 1, 1);
    deps.renderAll();
  });
  on("#next-month", "click", () => {
    state.currentDate = new Date(state.currentDate.getFullYear(), state.currentDate.getMonth() + 1, 1);
    deps.renderAll();
  });
  on("#open-transaction", "click", () => {
    location.hash = "novo-lancamento";
    setSectionFromHash();
    document.querySelector("#description").focus();
  });
  on("#go-to-new-transaction", "click", () => {
    location.hash = "novo-lancamento";
    setSectionFromHash();
    document.querySelector("#description").focus();
    document.querySelector("#transaction-form").scrollIntoView({ behavior: "smooth", block: "start" });
  });
  on("#go-to-month-transactions", "click", () => {
    location.hash = "lancamentos-mes";
    setSectionFromHash();
  });
  on("#seed-data", "click", deps.seedData);
  on("#install-app", "click", deps.promptInstallApp);
  document.querySelectorAll(".segment").forEach((button) =>
    button.addEventListener("click", () => deps.setActiveType(button.dataset.type))
  );
  els.form.addEventListener("submit", deps.addTransaction);
  on("#category-form", "submit", deps.addCategory);
  on("#account-form", "submit", deps.addAccount);
  on("#card-form", "submit", deps.addCreditCard);
  on("#subcategory-form", "submit", deps.addSubcategory);
  on("#goal-form", "submit", deps.addGoal);
  on("#login-form", "submit", deps.signInSupabase);
  on("#login-reset", "click", () => {
    document.querySelector("#reset-email").value = document.querySelector("#login-email").value.trim();
    deps.showAuthView("reset");
  });
  on("#login-create", "click", () => deps.showAuthView("signup"));
  on("#signup-back", "click", () => deps.showAuthView("login"));
  on("#reset-back", "click", () => deps.showAuthView("login"));
  on("#update-password-back", "click", () => {
    location.hash = "";
    deps.showAuthView("login");
  });
  on("#signup-form", "submit", (event) => {
    event.preventDefault();
    deps.signUpSupabase();
  });
  on("#reset-form", "submit", deps.requestPasswordReset);
  on("#update-password-form", "submit", deps.updatePassword);
  on("#goal-modal-form", "submit", deps.saveGoalFromModal);
  on("#goal-modal-close", "click", deps.closeGoalModal);
  on("#goal-modal-cancel", "click", deps.closeGoalModal);
  on("#goal-modal-overlay", "click", (event) => {
    if (event.target.id === "goal-modal-overlay") deps.closeGoalModal();
  });
  on("#settings-item-modal-form", "submit", deps.saveSettingsItemFromModal);
  on("#settings-item-modal-close", "click", deps.closeSettingsItemModal);
  on("#settings-item-modal-cancel", "click", deps.closeSettingsItemModal);
  on("#settings-item-modal-overlay", "click", (event) => {
    if (event.target.id === "settings-item-modal-overlay") deps.closeSettingsItemModal();
  });
  on("#transaction-modal-form", "submit", deps.saveTransactionFromModal);
  on("#transaction-modal-close", "click", deps.closeTransactionModal);
  on("#transaction-modal-cancel", "click", deps.closeTransactionModal);
  on("#transaction-modal-overlay", "click", (event) => {
    if (event.target.id === "transaction-modal-overlay") deps.closeTransactionModal();
  });
  document.querySelectorAll(".transaction-modal-segment").forEach((button) => {
    button.addEventListener("click", () => deps.setTransactionModalType(button.dataset.modalType));
  });
  on("#transaction-modal-payment-method", "change", deps.updateTransactionModalCreditFields);
  on("#transaction-modal-category", "change", () => deps.updateTransactionModalSubcategoryOptions());
  on("#signup-cpf", "input", (event) => {
    event.target.value = formatCpf(event.target.value);
  });
  on("#signup-phone", "input", (event) => {
    event.target.value = formatPhone(event.target.value);
  });
  on("#payment-method", "change", deps.updateCreditPaymentFields);
  on("#category", "change", () => deps.updateSubcategoryOptions());
  on("#new-subcategory-type", "change", deps.renderSubcategoryParentOptions);
  on("#logout-btn", "click", deps.signOutSupabase);
  on("#cancel-edit", "click", deps.resetTransactionForm);
  els.search.addEventListener("input", (event) => {
    state.search = event.target.value;
    deps.renderTable();
  });
  els.typeFilter.addEventListener("change", (event) => {
    state.typeFilter = event.target.value;
    deps.renderTable();
  });
  els.table.addEventListener("click", (event) => {
    const removeButton = event.target.closest("[data-remove]");
    const editButton = event.target.closest("[data-edit]");
    const paidButton = event.target.closest("[data-paid]");
    if (removeButton) deps.removeTransaction(removeButton.dataset.remove);
    if (editButton) deps.editTransaction(editButton.dataset.edit);
    if (paidButton) deps.markTransactionPaid(paidButton.dataset.paid);
  });
  on("#export-csv", "click", deps.exportCsv);
  on("#export-json", "click", deps.exportJson);
  on("#clear-data", "click", () => {
    if (!confirm("Limpar todos os dados salvos neste navegador?")) return;
    state.transactions = [];
    deps.persist();
    deps.renderAll();
    deps.notify("Dados limpos.");
  });
  on("#budget-list", "submit", (event) => {
    const form = event.target.closest(".budget-rule-form");
    if (form) deps.saveBudgetRule(event);
  });
  on("#import-json", "change", async (event) => {
    const [file] = event.target.files;
    if (!file) return;
    try {
      const imported = JSON.parse(await file.text());
      const normalized = deps.normalizeImportedBackup(imported);
      deps.showImportPreview(normalized);
    } catch (error) {
      deps.notify("Nao foi possivel importar este arquivo.");
    } finally {
      event.target.value = "";
    }
  });
  on("#import-preview", "click", (event) => {
    const button = event.target.closest("[data-import-action]");
    if (!button) return;
    const action = button.dataset.importAction;
    if (action === "cancel") {
      deps.clearImportPreview();
      deps.notify("Importacao cancelada.");
      return;
    }
    deps.applyPendingImport(action);
  });
  on("#category-manage-list", "click", (event) => {
    const removeButton = event.target.closest("[data-remove-category]");
    const editButton = event.target.closest("[data-edit-category]");
    if (removeButton) {
      const [type, key] = removeButton.dataset.removeCategory.split(":");
      deps.removeCategory(type, key);
    }
    if (editButton) {
      const [type, key] = editButton.dataset.editCategory.split(":");
      const item = deps.getCategoryRecord(type, key);
      if (!item) return;
      deps.openSettingsItemModal({
        kind: "category",
        kicker: "Categorias",
        title: "Editar categoria",
        type,
        key,
        name: item.name,
        color: item.color,
        limit: deps.getBudgetRule(key).monthly || item.monthlyLimit || 0,
      });
    }
  });
  on("#account-manage-list", "click", (event) => {
    const removeButton = event.target.closest("[data-remove-account]");
    const editButton = event.target.closest("[data-edit-account]");
    if (removeButton) deps.removeAccount(Number(removeButton.dataset.removeAccount));
    if (editButton) {
      const index = Number(editButton.dataset.editAccount);
      deps.openSettingsItemModal({
        kind: "account",
        kicker: "Contas",
        title: "Editar conta",
        index,
        name: deps.getAccountRecord(index)?.name || "",
      });
    }
  });
  on("#card-manage-list", "click", (event) => {
    const removeButton = event.target.closest("[data-remove-card]");
    const editButton = event.target.closest("[data-edit-card]");
    if (removeButton) deps.removeCreditCard(Number(removeButton.dataset.removeCard));
    if (editButton) {
      const index = Number(editButton.dataset.editCard);
      const card = deps.getCardRecord(index);
      if (!card) return;
      deps.openSettingsItemModal({
        kind: "card",
        kicker: "Cartoes",
        title: "Editar cartao",
        index,
        name: card.name,
        closingDay: card.closingDay,
        dueDay: card.dueDay,
      });
    }
  });
  on("#goal-manage-list", "click", (event) => {
    const saveButton = event.target.closest("[data-save-goal]");
    const removeButton = event.target.closest("[data-remove-goal]");
    if (saveButton) {
      deps.updateGoal(Number(saveButton.dataset.saveGoal));
      return;
    }
    if (removeButton) {
      deps.removeGoal(Number(removeButton.dataset.removeGoal));
    }
  });
  on("#subcategory-manage-list", "click", (event) => {
    const removeButton = event.target.closest("[data-remove-subcategory]");
    const editButton = event.target.closest("[data-edit-subcategory]");
    if (removeButton) {
      const [type, categoryKey, subKey] = removeButton.dataset.removeSubcategory.split(":");
      deps.removeSubcategory(type, categoryKey, subKey);
    }
    if (editButton) {
      const [type, categoryKey, subKey] = editButton.dataset.editSubcategory.split(":");
      const item = deps.getTagRecord(type, categoryKey, subKey);
      if (!item) return;
      deps.openSettingsItemModal({
        kind: "tag",
        kicker: "Etiquetas",
        title: "Editar etiqueta",
        type,
        categoryKey,
        subKey,
        name: item.name,
        color: item.color || deps.getCategoryColorFromList(type, categoryKey, state.settings.categories),
      });
    }
  });
  on("#subcategory-manage-list", "submit", (event) => {
    const form = event.target.closest("[data-subcategory-inline]");
    if (!form) return;
    event.preventDefault();
    const [type, categoryKey] = form.dataset.subcategoryInline.split(":");
    const name = new FormData(form).get("name");
    deps.addInlineSubcategory(type, categoryKey, String(name || ""));
  });
  on("#settings-manage-switcher", "click", (event) => {
    const button = event.target.closest("[data-manage-view]");
    if (!button) return;
    state.manageView = button.dataset.manageView;
    deps.renderManagePanels();
  });
  on("#goals-list", "click", (event) => {
    const contributeButton = event.target.closest("[data-goal-contribute]");
    const editButton = event.target.closest("[data-goal-edit-card]");
    if (contributeButton) {
      deps.openGoalContribution(Number(contributeButton.dataset.goalContribute));
      return;
    }
    if (editButton) {
      deps.editGoalFromCard(Number(editButton.dataset.goalEditCard));
    }
  });
  window.addEventListener("hashchange", setSectionFromHash);
}

function setSectionFromHash() {
  const rawId = location.hash.replace("#", "") || "visao-geral";
  const id = rawId === "lancamentos" ? "novo-lancamento" : rawId;
  document.querySelectorAll(".section").forEach((section) => {
    section.classList.toggle("active", section.id === id);
  });
  document.querySelectorAll(".nav-item").forEach((item) => {
    item.classList.toggle("active", item.dataset.section === id);
  });
}

deps.setSectionFromHash = setSectionFromHash;

async function init() {
  deps.load();
  deps.setDefaultDate();
  deps.setActiveType("expense");
  deps.updateAccountOptions();
  deps.updateCreditCardOptions();
  deps.updateCreditPaymentFields();
  deps.setupPwaSupport();
  bindEvents();
  setSectionFromHash();
  deps.renderAll();
  state.supabaseInitPromise = deps.initSupabase();
  await state.supabaseInitPromise;
}

init().catch((error) => {
  console.error(error);
  state.currentUser = null;
  state.cloudReady = false;
  deps.renderAuthGate("Nao foi possivel carregar agora. Atualize a pagina.");
});
