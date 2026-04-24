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
Object.assign(deps, createTransactionsModule(deps));
Object.assign(deps, createSettingsModule(deps));
Object.assign(deps, createDashboardModule(deps));
Object.assign(deps, createAuthModule(deps));
Object.assign(deps, createSupabaseModule(deps));

function bindEvents() {
  document.querySelector("#prev-month").addEventListener("click", () => {
    state.currentDate = new Date(state.currentDate.getFullYear(), state.currentDate.getMonth() - 1, 1);
    deps.renderAll();
  });
  document.querySelector("#next-month").addEventListener("click", () => {
    state.currentDate = new Date(state.currentDate.getFullYear(), state.currentDate.getMonth() + 1, 1);
    deps.renderAll();
  });
  document.querySelector("#open-transaction").addEventListener("click", () => {
    location.hash = "novo-lancamento";
    setSectionFromHash();
    document.querySelector("#description").focus();
  });
  document.querySelector("#go-to-new-transaction").addEventListener("click", () => {
    location.hash = "novo-lancamento";
    setSectionFromHash();
    document.querySelector("#description").focus();
    document.querySelector("#transaction-form").scrollIntoView({ behavior: "smooth", block: "start" });
  });
  document.querySelector("#go-to-month-transactions").addEventListener("click", () => {
    location.hash = "lancamentos-mes";
    setSectionFromHash();
  });
  document.querySelector("#seed-data").addEventListener("click", deps.seedData);
  document.querySelector("#install-app").addEventListener("click", deps.promptInstallApp);
  document.querySelectorAll(".segment").forEach((button) =>
    button.addEventListener("click", () => deps.setActiveType(button.dataset.type))
  );
  els.form.addEventListener("submit", deps.addTransaction);
  document.querySelector("#category-form").addEventListener("submit", deps.addCategory);
  document.querySelector("#account-form").addEventListener("submit", deps.addAccount);
  document.querySelector("#card-form").addEventListener("submit", deps.addCreditCard);
  document.querySelector("#subcategory-form").addEventListener("submit", deps.addSubcategory);
  document.querySelector("#goal-form").addEventListener("submit", deps.addGoal);
  document.querySelector("#login-form").addEventListener("submit", deps.signInSupabase);
  document.querySelector("#login-reset").addEventListener("click", () => {
    document.querySelector("#reset-email").value = document.querySelector("#login-email").value.trim();
    deps.showAuthView("reset");
  });
  document.querySelector("#login-create").addEventListener("click", () => deps.showAuthView("signup"));
  document.querySelector("#signup-back").addEventListener("click", () => deps.showAuthView("login"));
  document.querySelector("#reset-back").addEventListener("click", () => deps.showAuthView("login"));
  document.querySelector("#update-password-back").addEventListener("click", () => {
    location.hash = "";
    deps.showAuthView("login");
  });
  document.querySelector("#signup-form").addEventListener("submit", (event) => {
    event.preventDefault();
    deps.signUpSupabase();
  });
  document.querySelector("#reset-form").addEventListener("submit", deps.requestPasswordReset);
  document.querySelector("#update-password-form").addEventListener("submit", deps.updatePassword);
  document.querySelector("#goal-modal-form").addEventListener("submit", deps.saveGoalFromModal);
  document.querySelector("#goal-modal-close").addEventListener("click", deps.closeGoalModal);
  document.querySelector("#goal-modal-cancel").addEventListener("click", deps.closeGoalModal);
  document.querySelector("#goal-modal-overlay").addEventListener("click", (event) => {
    if (event.target.id === "goal-modal-overlay") deps.closeGoalModal();
  });
  document.querySelector("#settings-item-modal-form").addEventListener("submit", deps.saveSettingsItemFromModal);
  document.querySelector("#settings-item-modal-close").addEventListener("click", deps.closeSettingsItemModal);
  document.querySelector("#settings-item-modal-cancel").addEventListener("click", deps.closeSettingsItemModal);
  document.querySelector("#settings-item-modal-overlay").addEventListener("click", (event) => {
    if (event.target.id === "settings-item-modal-overlay") deps.closeSettingsItemModal();
  });
  document.querySelector("#transaction-modal-form").addEventListener("submit", deps.saveTransactionFromModal);
  document.querySelector("#transaction-modal-close").addEventListener("click", deps.closeTransactionModal);
  document.querySelector("#transaction-modal-cancel").addEventListener("click", deps.closeTransactionModal);
  document.querySelector("#transaction-modal-overlay").addEventListener("click", (event) => {
    if (event.target.id === "transaction-modal-overlay") deps.closeTransactionModal();
  });
  document.querySelectorAll(".transaction-modal-segment").forEach((button) => {
    button.addEventListener("click", () => deps.setTransactionModalType(button.dataset.modalType));
  });
  document.querySelector("#transaction-modal-payment-method").addEventListener("change", deps.updateTransactionModalCreditFields);
  document.querySelector("#transaction-modal-category").addEventListener("change", () => deps.updateTransactionModalSubcategoryOptions());
  document.querySelector("#signup-cpf").addEventListener("input", (event) => {
    event.target.value = formatCpf(event.target.value);
  });
  document.querySelector("#signup-phone").addEventListener("input", (event) => {
    event.target.value = formatPhone(event.target.value);
  });
  document.querySelector("#payment-method").addEventListener("change", deps.updateCreditPaymentFields);
  document.querySelector("#category").addEventListener("change", () => deps.updateSubcategoryOptions());
  document.querySelector("#new-subcategory-type").addEventListener("change", deps.renderSubcategoryParentOptions);
  document.querySelector("#logout-btn").addEventListener("click", deps.signOutSupabase);
  document.querySelector("#cancel-edit").addEventListener("click", deps.resetTransactionForm);
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
  document.querySelector("#export-csv").addEventListener("click", deps.exportCsv);
  document.querySelector("#export-json").addEventListener("click", deps.exportJson);
  document.querySelector("#clear-data").addEventListener("click", () => {
    if (!confirm("Limpar todos os dados salvos neste navegador?")) return;
    state.transactions = [];
    deps.persist();
    deps.renderAll();
    deps.notify("Dados limpos.");
  });
  document.querySelector("#budget-list").addEventListener("submit", (event) => {
    const form = event.target.closest(".budget-rule-form");
    if (form) deps.saveBudgetRule(event);
  });
  document.querySelector("#import-json").addEventListener("change", async (event) => {
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
  document.querySelector("#import-preview").addEventListener("click", (event) => {
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
  document.querySelector("#category-manage-list").addEventListener("click", (event) => {
    const removeButton = event.target.closest("[data-remove-category]");
    const editButton = event.target.closest("[data-edit-category]");
    if (removeButton) {
      const [type, key] = removeButton.dataset.removeCategory.split(":");
      deps.removeCategory(type, key);
    }
    if (editButton) {
      const [type, key] = editButton.dataset.editCategory.split(":");
      const item = state.settings.categories[type].find(([itemKey]) => itemKey === key);
      if (!item) return;
      deps.openSettingsItemModal({
        kind: "category",
        kicker: "Categorias",
        title: "Editar categoria",
        type,
        key,
        name: item[1],
        color: item[2],
        limit: deps.getBudgetRule(key).monthly || item[3] || 0,
      });
    }
  });
  document.querySelector("#account-manage-list").addEventListener("click", (event) => {
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
        name: state.settings.accounts[index] || "",
      });
    }
  });
  document.querySelector("#card-manage-list").addEventListener("click", (event) => {
    const removeButton = event.target.closest("[data-remove-card]");
    const editButton = event.target.closest("[data-edit-card]");
    if (removeButton) deps.removeCreditCard(Number(removeButton.dataset.removeCard));
    if (editButton) {
      const index = Number(editButton.dataset.editCard);
      const card = state.settings.creditCards[index];
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
  document.querySelector("#goal-manage-list").addEventListener("click", (event) => {
    const saveButton = event.target.closest("[data-save-goal]");
    const removeButton = event.target.closest("[data-remove-goal]");
    if (saveButton) {
      deps.updateGoal(Number(saveButton.dataset.saveGoal));
      return;
    }
    if (removeButton) {
      state.settings.goals.splice(Number(removeButton.dataset.removeGoal), 1);
      deps.persist();
      deps.renderAll();
      deps.notify("Meta removida.");
    }
  });
  document.querySelector("#subcategory-manage-list").addEventListener("click", (event) => {
    const removeButton = event.target.closest("[data-remove-subcategory]");
    const editButton = event.target.closest("[data-edit-subcategory]");
    if (removeButton) {
      const [type, categoryKey, subKey] = removeButton.dataset.removeSubcategory.split(":");
      deps.removeSubcategory(type, categoryKey, subKey);
    }
    if (editButton) {
      const [type, categoryKey, subKey] = editButton.dataset.editSubcategory.split(":");
      const item = deps.getSubcategories(type, categoryKey).find(([key]) => key === subKey);
      if (!item) return;
      deps.openSettingsItemModal({
        kind: "tag",
        kicker: "Etiquetas",
        title: "Editar etiqueta",
        type,
        categoryKey,
        subKey,
        name: item[1],
        color: item[2] || deps.getCategoryColorFromList(type, categoryKey, state.settings.categories),
      });
    }
  });
  document.querySelector("#subcategory-manage-list").addEventListener("submit", (event) => {
    const form = event.target.closest("[data-subcategory-inline]");
    if (!form) return;
    event.preventDefault();
    const [type, categoryKey] = form.dataset.subcategoryInline.split(":");
    const name = new FormData(form).get("name");
    deps.addInlineSubcategory(type, categoryKey, String(name || ""));
  });
  document.querySelector("#settings-manage-switcher").addEventListener("click", (event) => {
    const button = event.target.closest("[data-manage-view]");
    if (!button) return;
    state.manageView = button.dataset.manageView;
    deps.renderManagePanels();
  });
  document.querySelector("#goals-list").addEventListener("click", (event) => {
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
