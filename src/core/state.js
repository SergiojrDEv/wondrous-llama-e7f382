export const STORAGE_KEY = "finance-flow-data-v1";
export const APP_STORAGE_KEY = "finance-flow-state-v2";
export const SUPABASE_FALLBACK_CONFIG = {
  url: "https://gxwukctgfrquureyerli.supabase.co",
  anonKey: "sb_publishable_SBwSuHSETeSd7mtl9-A7kQ_gS5Y2Y14",
};

export const defaultSettings = {
  accounts: ["Carteira", "Conta corrente", "Cartao de credito", "Corretora"],
  creditCards: [
    { id: "default-card", name: "Cartao principal", closingDay: 25, dueDay: 10 },
  ],
  categories: {
    expense: [
      ["moradia", "Moradia", "#0b7285", 2200],
      ["alimentacao", "Alimentacao", "#c43d4b", 1400],
      ["transporte", "Transporte", "#f08c00", 650],
      ["saude", "Saude", "#2b8a3e", 500],
      ["lazer", "Lazer", "#7048e8", 600],
      ["educacao", "Educacao", "#1971c2", 450],
      ["outros", "Outros", "#667085", 350],
    ],
    income: [
      ["salario", "Salario", "#168a5b"],
      ["freelance", "Freelance", "#0b7285"],
      ["rendimento", "Rendimento", "#635bff"],
      ["outros", "Outras receitas", "#667085"],
    ],
    investment: [
      ["renda-fixa", "Renda fixa", "#635bff"],
      ["acoes", "Acoes", "#1971c2"],
      ["fundos", "Fundos", "#0b7285"],
      ["cripto", "Cripto", "#f08c00"],
      ["previdencia", "Previdencia", "#7048e8"],
    ],
  },
  subcategories: {
    expense: {
      alimentacao: [["mercado", "Mercado"], ["restaurante", "Restaurante"]],
      transporte: [["combustivel", "Combustivel"], ["app-mobilidade", "App e taxi"]],
    },
    income: {
      salario: [["fixo", "Salario fixo"], ["bonus", "Bonus"]],
    },
    investment: {
      "renda-fixa": [["tesouro", "Tesouro"], ["cdb", "CDB"]],
      acoes: [["dividendos", "Dividendos"], ["buy-hold", "Buy and hold"]],
    },
  },
  goals: [
    { name: "Reserva de emergencia", target: 30000, key: "renda-fixa" },
    { name: "Viagem", target: 9000, key: "fundos" },
    { name: "Aposentadoria", target: 120000, key: "previdencia" },
  ],
  budgetRules: {
    moradia: { weekly: 550, monthly: 2200 },
    alimentacao: { weekly: 350, monthly: 1400 },
    transporte: { weekly: 162.5, monthly: 650 },
    saude: { weekly: 125, monthly: 500 },
    lazer: { weekly: 150, monthly: 600 },
    educacao: { weekly: 112.5, monthly: 450 },
    outros: { weekly: 87.5, monthly: 350 },
  },
};

export const state = {
  transactions: [],
  settings: null,
  catalog: null,
  currentDate: new Date(),
  deferredInstallPrompt: null,
  manageView: "categories",
  settingsItemEdit: null,
  activeType: "expense",
  search: "",
  typeFilter: "all",
  editingId: null,
  chart: null,
  supabaseClient: null,
  currentUser: null,
  cloudReady: false,
  isSyncing: false,
  syncTimer: null,
  supabaseInitPromise: null,
  pendingImport: null,
  authView: "login",
  isPasswordRecovery: false,
  activeGoalEditIndex: null,
  activeTransactionEditId: null,
  transactionModalType: "expense",
  dataMode: "legacy",
};

export const els = {
  currentMonth: document.querySelector("#current-month"),
  form: document.querySelector("#transaction-form"),
  category: document.querySelector("#category"),
  account: document.querySelector("#account"),
  creditCard: document.querySelector("#credit-card"),
  date: document.querySelector("#date"),
  table: document.querySelector("#transaction-table"),
  search: document.querySelector("#search"),
  typeFilter: document.querySelector("#type-filter"),
  toast: document.querySelector("#toast"),
  authScreen: document.querySelector("#auth-screen"),
  appShell: document.querySelector("#app-shell"),
  sidebar: document.querySelector("#sidebar"),
  authNote: document.querySelector("#auth-note"),
  authTitle: document.querySelector("#auth-title"),
  installApp: document.querySelector("#install-app"),
};

export const formatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});
