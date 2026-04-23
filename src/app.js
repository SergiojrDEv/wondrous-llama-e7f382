const STORAGE_KEY = "finance-flow-data-v1";
const APP_STORAGE_KEY = "finance-flow-state-v2";
const SUPABASE_FALLBACK_CONFIG = {
  url: "https://gxwukctgfrquureyerli.supabase.co",
  anonKey: "sb_publishable_SBwSuHSETeSd7mtl9-A7kQ_gS5Y2Y14",
};

const defaultSettings = {
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
  goals: [
  { name: "Reserva de emergencia", target: 30000, key: "renda-fixa" },
  { name: "Viagem", target: 9000, key: "fundos" },
  { name: "Aposentadoria", target: 120000, key: "previdencia" },
  ],
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

const state = {
  transactions: [],
  settings: clone(defaultSettings),
  currentDate: new Date(),
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
};

const els = {
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
};

const formatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

function money(value) {
  return formatter.format(value || 0);
}

function esc(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function monthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function parseLocalDate(value) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function toDateInput(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function addMonths(dateValue, amount) {
  const date = parseLocalDate(dateValue);
  const day = date.getDate();
  const next = new Date(date.getFullYear(), date.getMonth() + amount, 1);
  const lastDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
  next.setDate(Math.min(day, lastDay));
  return toDateInput(next);
}

function transactionMonth(transaction) {
  return monthKey(parseLocalDate(transaction.date));
}

function getMonthTransactions(date = state.currentDate) {
  const key = monthKey(date);
  return state.transactions.filter((item) => transactionMonth(item) === key);
}

function getCategory(type, key) {
  return state.settings.categories[type].find((item) => item[0] === key) || [key, key, "#667085"];
}

function paymentMethodLabel(value) {
  const labels = {
    pix: "Pix",
    debit: "Debito",
    credit: "Credito",
    cash: "Dinheiro",
    transfer: "Transferencia",
  };
  return labels[value] || "Outro";
}

function save() {
  localStorage.setItem(
    APP_STORAGE_KEY,
    JSON.stringify({ transactions: state.transactions, settings: state.settings })
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
    syncToSupabase();
  }, 700);
}

function load() {
  const raw = localStorage.getItem(APP_STORAGE_KEY);
  if (raw) {
    const saved = JSON.parse(raw);
    state.transactions = saved.transactions || [];
    state.settings = mergeSettings(saved.settings);
    return;
  }

  const legacy = localStorage.getItem(STORAGE_KEY);
  state.transactions = legacy ? JSON.parse(legacy) : [];
}

function mergeSettings(saved = {}) {
  return {
    accounts: saved.accounts?.length ? saved.accounts : [...defaultSettings.accounts],
    creditCards: saved.creditCards?.length ? saved.creditCards : clone(defaultSettings.creditCards),
    categories: {
      expense: saved.categories?.expense?.length ? saved.categories.expense : clone(defaultSettings.categories.expense),
      income: saved.categories?.income?.length ? saved.categories.income : clone(defaultSettings.categories.income),
      investment: saved.categories?.investment?.length ? saved.categories.investment : clone(defaultSettings.categories.investment),
    },
    goals: saved.goals?.length ? saved.goals : clone(defaultSettings.goals),
  };
}

function notify(message) {
  els.toast.textContent = message;
  els.toast.classList.add("show");
  window.setTimeout(() => els.toast.classList.remove("show"), 2400);
}

function createId() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  return "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (char) =>
    (Number(char) ^ (Math.random() * 16) >> (Number(char) / 4)).toString(16)
  );
}

function setDefaultDate() {
  const today = new Date();
  const value = toDateInput(today);
  els.date.value = value;
  document.querySelector("#due-date").value = value;
}

function updateCategoryOptions() {
  els.category.innerHTML = state.settings.categories[state.activeType]
    .map(([value, label]) => `<option value="${esc(value)}">${esc(label)}</option>`)
    .join("");
}

function updateAccountOptions() {
  els.account.innerHTML = state.settings.accounts.map((name) => `<option>${esc(name)}</option>`).join("");
}

function updateCreditCardOptions() {
  if (!els.creditCard) return;
  els.creditCard.innerHTML = '<option value="">Nenhum</option>' + state.settings.creditCards
    .map((card) => `<option value="${esc(card.id)}">${esc(card.name)}</option>`)
    .join("");
}

function updateCreditPaymentFields() {
  const isCredit = document.querySelector("#payment-method").value === "credit";
  const cardField = document.querySelector("#credit-card-field");
  const installmentsField = document.querySelector("#installments-field");
  cardField.classList.toggle("is-hidden", !isCredit);
  installmentsField.classList.toggle("is-hidden", !isCredit);
  cardField.hidden = !isCredit;
  installmentsField.hidden = !isCredit;
  if (!isCredit) {
    document.querySelector("#credit-card").value = "";
    document.querySelector("#installments").value = 1;
  }
}

function setActiveType(type) {
  state.activeType = type;
  document.querySelectorAll(".segment").forEach((button) => {
    button.classList.toggle("active", button.dataset.type === type);
  });
  updateCategoryOptions();
}

function renderMonthLabel() {
  els.currentMonth.textContent = state.currentDate.toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
  });
}

function summarize(transactions) {
  const sumByType = (type) =>
    transactions
      .filter((item) => item.type === type)
      .reduce((sum, item) => sum + Number(item.amount), 0);

  return {
    income: sumByType("income"),
    expense: sumByType("expense"),
    investment: sumByType("investment"),
  };
}

function renderSummary() {
  const transactions = getMonthTransactions();
  const totals = summarize(transactions);
  const free = totals.income - totals.expense - totals.investment;
  const expenseCategories = new Set(
    transactions.filter((item) => item.type === "expense").map((item) => item.category)
  );
  const investRate = totals.income ? (totals.investment / totals.income) * 100 : 0;
  const commitment = totals.income ? ((totals.expense + totals.investment) / totals.income) * 100 : 0;
  const health = totals.income ? Math.max(0, Math.min(100, 100 - commitment + investRate)) : 0;

  document.querySelector("#income-total").textContent = money(totals.income);
  document.querySelector("#expense-total").textContent = money(totals.expense);
  document.querySelector("#invest-total").textContent = money(totals.investment);
  document.querySelector("#free-balance").textContent = money(free);
  document.querySelector("#income-count").textContent = `${transactions.filter((item) => item.type === "income").length} lancamentos`;
  document.querySelector("#expense-count").textContent = `${expenseCategories.size} categorias`;
  document.querySelector("#invest-rate").textContent = `${investRate.toFixed(1)}% da receita`;
  document.querySelector("#commitment-rate").textContent = `${commitment.toFixed(1)}% comprometido`;
  document.querySelector("#health-score").textContent = `${Math.round(health)}%`;
  document.querySelector("#health-copy").textContent =
    health >= 70 ? "Bom equilibrio entre gastos, reserva e investimentos." : "Revise os maiores gastos e proteja o saldo livre.";
  renderSmartDashboard(transactions, totals, free);
}

function renderSmartDashboard(transactions, totals, free) {
  const today = new Date();
  const currentMonth = monthKey(state.currentDate) === monthKey(today);
  const daysInMonth = new Date(state.currentDate.getFullYear(), state.currentDate.getMonth() + 1, 0).getDate();
  const dayRef = currentMonth ? today.getDate() : 1;
  const remainingDays = Math.max(1, daysInMonth - dayRef + 1);
  const dailySafe = Math.max(0, free / remainingDays);
  const previousDate = new Date(state.currentDate.getFullYear(), state.currentDate.getMonth() - 1, 1);
  const previousTotals = summarize(getMonthTransactions(previousDate));
  const previousFree = previousTotals.income - previousTotals.expense - previousTotals.investment;
  const freeDelta = free - previousFree;
  const commitment = totals.income ? ((totals.expense + totals.investment) / totals.income) * 100 : 0;
  const investRate = totals.income ? (totals.investment / totals.income) * 100 : 0;

  document.querySelector("#daily-safe").textContent = money(dailySafe);
  document.querySelector("#month-comparison").textContent = previousTotals.income || previousTotals.expense
    ? `${freeDelta >= 0 ? "+" : ""}${money(freeDelta)}`
    : "Sem historico";

  let title = "Seu mes esta em construcao";
  let copy = "Registre receitas, despesas e vencimentos para receber uma leitura mais precisa.";
  if (transactions.length) {
    if (free < 0) {
      title = "Atencao ao saldo do mes";
      copy = `No ritmo atual, o mes fecha ${money(Math.abs(free))} negativo. Revise gastos pendentes e categorias acima do limite.`;
    } else if (commitment > 80) {
      title = "Mes apertado, mas ainda controlavel";
      copy = `Voce tem ${money(free)} livre e pode gastar cerca de ${money(dailySafe)} por dia ate o fim do mes.`;
    } else {
      title = "Seu mes esta sob controle";
      copy = `Voce tem ${money(free)} livre, comprometeu ${commitment.toFixed(1)}% da renda e investiu ${investRate.toFixed(1)}%.`;
    }
  }
  document.querySelector("#smart-title").textContent = title;
  document.querySelector("#smart-copy").textContent = copy;
  renderInsights(transactions, totals);
}

function renderInsights(transactions, totals) {
  const target = document.querySelector("#insight-list");
  const insights = [];
  const pending = transactions
    .filter((item) => item.status !== "paid" && item.dueDate)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
    .slice(0, 3);

  pending.forEach((item) => {
    const due = parseLocalDate(item.dueDate);
    const diff = Math.ceil((due - new Date()) / 86400000);
    insights.push({
      label: diff < 0 ? "Vencido" : diff === 0 ? "Vence hoje" : `Vence em ${diff} dia${diff === 1 ? "" : "s"}`,
      text: `${item.description}: ${money(Number(item.amount))}`,
    });
  });

  state.settings.categories.expense.forEach(([key, label, , limit]) => {
    if (!limit) return;
    const used = transactions
      .filter((item) => item.type === "expense" && item.category === key)
      .reduce((sum, item) => sum + Number(item.amount), 0);
    if (used >= limit * 0.8) {
      insights.push({
        label: used > limit ? "Orcamento estourado" : "Perto do limite",
        text: `${label}: ${money(used)} de ${money(limit)}`,
      });
    }
  });

  if (totals.income && totals.investment / totals.income >= 0.1) {
    insights.push({ label: "Boa disciplina", text: `Voce investiu ${((totals.investment / totals.income) * 100).toFixed(1)}% da renda.` });
  }

  if (!insights.length) {
    target.innerHTML = '<div class="empty-state">Sem alertas por enquanto.</div>';
    return;
  }

  target.innerHTML = insights.slice(0, 5).map((item) => `
    <div class="insight-item">
      <span>${esc(item.label)}</span>
      <strong>${esc(item.text)}</strong>
    </div>
  `).join("");
}

function renderCategoryBreakdown() {
  const expenses = getMonthTransactions().filter((item) => item.type === "expense");
  const totals = expenses.reduce((acc, item) => {
    acc[item.category] = (acc[item.category] || 0) + Number(item.amount);
    return acc;
  }, {});
  const rows = Object.entries(totals).sort((a, b) => b[1] - a[1]);
  const max = Math.max(...rows.map(([, value]) => value), 0);
  const target = document.querySelector("#category-breakdown");

  if (!rows.length) {
    target.innerHTML = '<div class="empty-state">Nenhuma despesa lancada neste mes.</div>';
    return;
  }

  target.innerHTML = rows
    .map(([key, value]) => {
      const [, label, color] = getCategory("expense", key);
      const width = max ? (value / max) * 100 : 0;
      return `
        <div class="category-row">
          <strong>${esc(label)}</strong>
          <span class="money negative">${money(value)}</span>
          <div class="bar"><span style="--value:${width}%;--color:${color}"></span></div>
        </div>
      `;
    })
    .join("");
}

function renderTransactionHighlights() {
  const target = document.querySelector("#transaction-highlights");
  if (!target) return;

  const monthTransactions = getMonthTransactions();
  const paidCount = monthTransactions.filter((item) => item.status === "paid").length;
  const pendingCount = monthTransactions.filter((item) => item.status !== "paid").length;
  const pixCount = monthTransactions.filter((item) => item.paymentMethod === "pix").length;
  const creditCount = monthTransactions.filter((item) => item.paymentMethod === "credit").length;
  const totalAmount = monthTransactions.reduce((sum, item) => sum + Number(item.amount || 0), 0);

  target.innerHTML = `
    <article class="mini-stat-card">
      <span>No mes</span>
      <strong>${monthTransactions.length} lancamentos</strong>
      <small>${money(totalAmount)} movimentados</small>
    </article>
    <article class="mini-stat-card">
      <span>Status</span>
      <strong>${paidCount} pagos</strong>
      <small>${pendingCount} pendentes ou previstos</small>
    </article>
    <article class="mini-stat-card">
      <span>Pagamento</span>
      <strong>${pixCount} no Pix</strong>
      <small>${creditCount} no credito</small>
    </article>
  `;
}

function renderTable() {
  const monthTransactions = getMonthTransactions();
  const filtered = monthTransactions
    .filter((item) => state.typeFilter === "all" || item.type === state.typeFilter)
    .filter((item) => {
      const haystack = `${item.description} ${item.category} ${item.account} ${item.paymentMethod || ""}`.toLowerCase();
      return haystack.includes(state.search.toLowerCase());
    })
    .sort((a, b) => b.date.localeCompare(a.date));

  if (!filtered.length) {
    els.table.innerHTML = '<tr><td colspan="10" class="empty-state">Nenhum lancamento encontrado.</td></tr>';
    return;
  }

  els.table.innerHTML = filtered
    .map((item) => {
      const [, label] = getCategory(item.type, item.category);
      const amountClass = item.type === "income" ? "positive" : item.type === "investment" ? "purple" : "negative";
      const sign = item.type === "income" ? "+" : "-";
      const typeLabel = item.type === "income" ? "Receita" : item.type === "investment" ? "Investimento" : "Despesa";
      const statusLabel = item.status === "pending" ? "Pendente" : item.status === "planned" ? "Previsto" : "Pago";

      return `
        <tr>
          <td>${parseLocalDate(item.date).toLocaleDateString("pt-BR")}</td>
          <td><strong>${esc(item.description)}</strong></td>
          <td><span class="category-pill">${esc(label)}</span></td>
          <td>${esc(item.account)}</td>
          <td><span class="type-pill ${item.status || "paid"}">${statusLabel}</span></td>
          <td><span class="payment-pill ${item.paymentMethod || "pix"}">${paymentMethodLabel(item.paymentMethod)}</span></td>
          <td>${item.dueDate ? parseLocalDate(item.dueDate).toLocaleDateString("pt-BR") : "-"}</td>
          <td><span class="type-pill ${item.type}">${typeLabel}</span></td>
          <td class="right money ${amountClass}">${sign} ${money(Number(item.amount))}</td>
          <td class="right">
            <div class="row-actions">
              ${item.status !== "paid" ? `<button class="row-action success" type="button" data-paid="${item.id}" title="Marcar como pago">Pago</button>` : ""}
              <button class="row-action neutral" type="button" data-edit="${item.id}" title="Editar">Editar</button>
              <button class="row-action" type="button" data-remove="${item.id}" aria-label="Remover lancamento">×</button>
            </div>
          </td>
        </tr>
      `;
    })
    .join("");
}

function renderBudgets() {
  const expenses = getMonthTransactions().filter((item) => item.type === "expense");
  const target = document.querySelector("#budget-list");
  target.innerHTML = state.settings.categories.expense
    .map(([key, label, color, limit]) => {
      const used = expenses
        .filter((item) => item.category === key)
        .reduce((sum, item) => sum + Number(item.amount), 0);
      const pct = limit ? Math.min((used / limit) * 100, 100) : 0;
      return `
        <article class="budget-card">
          <header>
            <strong>${esc(label)}</strong>
            <small>${pct.toFixed(0)}%</small>
          </header>
          <div class="bar"><span style="--value:${pct}%;--color:${color}"></span></div>
          <p><span class="money">${money(used)}</span> de ${money(limit)}</p>
        </article>
      `;
    })
    .join("");
}

function renderGoals() {
  const investments = state.transactions.filter((item) => item.type === "investment");
  const target = document.querySelector("#goals-list");
  if (!state.settings.goals.length) {
    target.innerHTML = '<article class="goal-card empty-state">Nenhuma meta criada ainda.</article>';
    return;
  }

  target.innerHTML = state.settings.goals
    .map((goal, index) => {
      const current = investments
        .filter((item) => item.category === goal.key)
        .reduce((sum, item) => sum + Number(item.amount), 0);
      const pct = Math.min((current / goal.target) * 100, 100);
      const category = getCategory("investment", goal.key);
      return `
        <article class="goal-card">
          <header>
            <strong>${esc(goal.name)}</strong>
            <small>${pct.toFixed(0)}%</small>
          </header>
          <div class="bar"><span style="--value:${pct}%;--color:var(--invest)"></span></div>
          <p><span class="money purple">${money(current)}</span> de ${money(goal.target)}</p>
          <small class="goal-card-note">Categoria: ${esc(category[1])}</small>
          <div class="goal-card-actions">
            <button class="mini-btn" type="button" data-goal-contribute="${index}">Lancar aporte</button>
            <button class="mini-btn" type="button" data-goal-edit-card="${index}">Editar meta</button>
          </div>
        </article>
      `;
    })
    .join("");
}

function renderGoalsSummary() {
  const target = document.querySelector("#goals-summary");
  if (!target) return;

  const investments = state.transactions.filter((item) => item.type === "investment");
  const totals = state.settings.goals.map((goal) => {
    const current = investments
      .filter((item) => item.category === goal.key)
      .reduce((sum, item) => sum + Number(item.amount), 0);
    return { goal, current };
  });

  const totalTarget = totals.reduce((sum, item) => sum + Number(item.goal.target || 0), 0);
  const totalCurrent = totals.reduce((sum, item) => sum + Number(item.current || 0), 0);
  const closest = totals
    .map((item) => ({
      ...item,
      progress: item.goal.target ? (item.current / item.goal.target) * 100 : 0,
    }))
    .sort((a, b) => b.progress - a.progress)[0];

  target.innerHTML = `
    <article class="mini-stat-card">
      <span>Metas ativas</span>
      <strong>${state.settings.goals.length}</strong>
      <small>${money(totalTarget)} planejados</small>
    </article>
    <article class="mini-stat-card">
      <span>Ja acumulado</span>
      <strong>${money(totalCurrent)}</strong>
      <small>${totalTarget ? `${((totalCurrent / totalTarget) * 100).toFixed(1)}% do total` : "Comece pela primeira meta"}</small>
    </article>
    <article class="mini-stat-card">
      <span>Mais avancada</span>
      <strong>${closest ? esc(closest.goal.name) : "Sem metas"}</strong>
      <small>${closest ? `${Math.min(closest.progress, 100).toFixed(0)}% concluido` : "Crie sua primeira meta"}</small>
    </article>
  `;
}

function openGoalContribution(index) {
  const goal = state.settings.goals[index];
  if (!goal) return;
  location.hash = "lancamentos";
  setSectionFromHash();
  setActiveType("investment");
  updateCategoryOptions();
  document.querySelector("#category").value = goal.key;
  document.querySelector("#account").value = state.settings.accounts.includes("Corretora") ? "Corretora" : state.settings.accounts[0];
  document.querySelector("#payment-method").value = "transfer";
  updateCreditPaymentFields();
  document.querySelector("#description").value = `Aporte - ${goal.name}`;
  document.querySelector("#amount").value = "";
  document.querySelector("#description").focus();
  document.querySelector("#transaction-form").scrollIntoView({ behavior: "smooth", block: "start" });
  notify(`Preencha o valor para lancar aporte em ${goal.name}.`);
}

function editGoalFromCard(index) {
  const goal = state.settings.goals[index];
  if (!goal) return;
  state.activeGoalEditIndex = index;
  document.querySelector("#goal-modal-name").value = goal.name;
  document.querySelector("#goal-modal-category").value = goal.key;
  document.querySelector("#goal-modal-target").value = Number(goal.target) || 0;
  document.querySelector("#goal-modal-overlay").classList.remove("is-hidden");
  document.body.classList.add("modal-open");
  document.querySelector("#goal-modal-name").focus();
}

function closeGoalModal() {
  state.activeGoalEditIndex = null;
  document.querySelector("#goal-modal-form").reset();
  document.querySelector("#goal-modal-overlay").classList.add("is-hidden");
  document.body.classList.remove("modal-open");
}

function saveGoalFromModal(event) {
  event.preventDefault();
  const index = state.activeGoalEditIndex;
  const goal = state.settings.goals[index];
  if (!goal) return closeGoalModal();

  const name = document.querySelector("#goal-modal-name").value.trim();
  const key = document.querySelector("#goal-modal-category").value;
  const target = Number(document.querySelector("#goal-modal-target").value);
  if (!name || target <= 0) return notify("Preencha a meta corretamente.");

  goal.name = name;
  goal.key = key;
  goal.target = target;
  persist();
  renderAll();
  closeGoalModal();
  notify("Meta atualizada.");
}

function renderSettings() {
  renderCategoryManager();
  renderAccountManager();
  renderCardManager();
  renderGoalManager();
  renderGoalCategoryOptions();
}

function renderCategoryManager() {
  const labels = { expense: "Despesa", income: "Receita", investment: "Investimento" };
  const rows = Object.entries(state.settings.categories).flatMap(([type, list]) =>
    list.map(([key, label, color, limit]) => ({ type, key, label, color, limit }))
  );
  const target = document.querySelector("#category-manage-list");

  target.innerHTML = rows
    .map((item) => `
      <div class="manage-item">
        <div>
          <strong><span class="color-dot" style="--color:${esc(item.color)}"></span>${esc(item.label)}</strong>
          <small>${labels[item.type]}${item.type === "expense" ? ` | limite ${money(Number(item.limit || 0))}` : ""}</small>
        </div>
        <div class="mini-actions">
          ${item.type === "expense" ? `<button class="mini-btn" type="button" data-edit-limit="${item.key}">Limite</button>` : ""}
          <button class="mini-btn danger" type="button" data-remove-category="${item.type}:${item.key}">Remover</button>
        </div>
      </div>
    `)
    .join("");
}

function renderAccountManager() {
  const target = document.querySelector("#account-manage-list");
  target.innerHTML = state.settings.accounts
    .map((name, index) => `
      <div class="manage-item">
        <div>
          <strong>${esc(name)}</strong>
          <small>Conta disponivel para lancamentos</small>
        </div>
        <button class="mini-btn danger" type="button" data-remove-account="${index}">Remover</button>
      </div>
    `)
    .join("");
}

function renderCardManager() {
  const target = document.querySelector("#card-manage-list");
  target.innerHTML = state.settings.creditCards
    .map((card, index) => `
      <div class="manage-item">
        <div>
          <strong>${esc(card.name)}</strong>
          <small>Fecha dia ${card.closingDay} | vence dia ${card.dueDay}</small>
        </div>
        <button class="mini-btn danger" type="button" data-remove-card="${index}">Remover</button>
      </div>
    `)
    .join("");
}

function renderGoalManager() {
  const target = document.querySelector("#goal-manage-list");
  if (!state.settings.goals.length) {
    target.innerHTML = '<div class="empty-state">Nenhuma meta cadastrada.</div>';
    return;
  }

  const categoryOptions = (selected) => state.settings.categories.investment
    .map(([value, label]) => `<option value="${esc(value)}"${value === selected ? " selected" : ""}>${esc(label)}</option>`)
    .join("");

  target.innerHTML = state.settings.goals
    .map((goal, index) => {
      const [, categoryLabel] = getCategory("investment", goal.key);
      return `
        <div class="manage-item goal-edit-item">
          <div>
            <strong>${esc(goal.name)}</strong>
            <small>${esc(categoryLabel)} | alvo ${money(Number(goal.target))}</small>
          </div>
          <div class="goal-edit-grid">
            <label>
              Nome
              <input data-goal-name="${index}" type="text" value="${esc(goal.name)}">
            </label>
            <label>
              Categoria
              <select data-goal-category="${index}">${categoryOptions(goal.key)}</select>
            </label>
            <label>
              Valor alvo
              <input data-goal-target="${index}" type="number" min="1" step="0.01" value="${Number(goal.target) || 0}">
            </label>
          </div>
          <div class="mini-actions">
            <button class="mini-btn" type="button" data-save-goal="${index}">Salvar</button>
            <button class="mini-btn danger" type="button" data-remove-goal="${index}">Remover</button>
          </div>
        </div>
      `;
    })
    .join("");
}

function renderGoalCategoryOptions() {
  const options = state.settings.categories.investment
    .map(([value, label]) => `<option value="${esc(value)}">${esc(label)}</option>`)
    .join("");
  const selects = [document.querySelector("#new-goal-category"), document.querySelector("#goal-modal-category")].filter(Boolean);
  selects.forEach((select) => {
    const currentValue = select.value;
    select.innerHTML = options;
    if (currentValue && [...select.options].some((option) => option.value === currentValue)) {
      select.value = currentValue;
    }
  });
}

function renderChart() {
  const canvas = document.querySelector("#cashflow-chart");
  if (!canvas || !window.Chart) {
    document.querySelector("#trend-status").textContent = "Grafico indisponivel";
    return;
  }

  const months = Array.from({ length: 6 }, (_, index) => {
    const date = new Date(state.currentDate.getFullYear(), state.currentDate.getMonth() - (5 - index), 1);
    const totals = summarize(getMonthTransactions(date));
    return {
      label: date.toLocaleDateString("pt-BR", { month: "short" }),
      income: totals.income,
      expense: totals.expense,
      investment: totals.investment,
      free: totals.income - totals.expense - totals.investment,
    };
  });

  const last = months.at(-1);
  document.querySelector("#trend-status").textContent = last.free >= 0 ? "Saldo positivo" : "Saldo negativo";

  if (state.chart) state.chart.destroy();
  state.chart = new Chart(canvas, {
    type: "line",
    data: {
      labels: months.map((item) => item.label),
      datasets: [
        { label: "Receitas", data: months.map((item) => item.income), borderColor: "#168a5b", backgroundColor: "rgba(22,138,91,.08)", tension: 0.35, fill: true },
        { label: "Despesas", data: months.map((item) => item.expense), borderColor: "#c43d4b", backgroundColor: "rgba(196,61,75,.08)", tension: 0.35, fill: true },
        { label: "Saldo livre", data: months.map((item) => item.free), borderColor: "#0b7285", tension: 0.35, borderWidth: 3 },
      ],
    },
    options: {
      responsive: true,
      plugins: {
        legend: { labels: { usePointStyle: true } },
        tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label}: ${money(ctx.parsed.y)}` } },
      },
      scales: {
        y: { ticks: { callback: (value) => money(value).replace(",00", "") } },
      },
    },
  });
}

function renderAll() {
  renderMonthLabel();
  renderSummary();
  renderCategoryBreakdown();
  renderTransactionHighlights();
  renderTable();
  renderBudgets();
  renderGoalsSummary();
  renderGoals();
  renderSettings();
  renderChart();
}

function addTransaction(event) {
  event.preventDefault();
  const formData = new FormData(event.currentTarget);
  if (state.editingId) {
    updateTransaction(formData);
    return;
  }
  const paymentMethod = formData.get("paymentMethod") || "pix";
  const isCredit = paymentMethod === "credit";
  const installments = isCredit ? Math.max(1, Number(formData.get("installments") || 1)) : 1;
  const repeatCount = Math.max(1, Number(formData.get("repeatCount") || 1));
  const recurrence = formData.get("recurrence");
  const totalItems = installments > 1 ? installments : recurrence === "monthly" ? repeatCount : 1;
  const groupId = totalItems > 1 ? createId() : null;
  const baseAmount = Number(formData.get("amount"));
  const perItemAmount = installments > 1 ? Number((baseAmount / installments).toFixed(2)) : baseAmount;
  const transactions = Array.from({ length: totalItems }, (_, index) => {
    const date = addMonths(formData.get("date"), index);
    const dueDate = formData.get("dueDate") ? addMonths(formData.get("dueDate"), index) : date;
    const suffix = installments > 1 ? ` (${index + 1}/${installments})` : recurrence === "monthly" && totalItems > 1 ? ` (${index + 1}/${totalItems})` : "";
    return {
      id: createId(),
      type: state.activeType,
      description: `${formData.get("description").trim()}${suffix}`,
      category: formData.get("category"),
      account: formData.get("account"),
      amount: perItemAmount,
      date,
      dueDate,
      status: formData.get("status") || "paid",
      paymentMethod,
      creditCardId: isCredit ? formData.get("creditCardId") || null : null,
      recurrence: recurrence || "none",
      recurrenceId: recurrence === "monthly" ? groupId : null,
      installmentGroup: installments > 1 ? groupId : null,
      installmentNumber: installments > 1 ? index + 1 : null,
      installmentTotal: installments > 1 ? installments : null,
      createdAt: new Date().toISOString(),
    };
  });

  state.transactions.push(...transactions);
  persist();
  event.currentTarget.reset();
  setDefaultDate();
  updateCategoryOptions();
  renderAll();
  notify(totalItems > 1 ? `${totalItems} lancamentos criados.` : "Lancamento salvo.");
}

function updateTransaction(formData) {
  const item = state.transactions.find((transaction) => transaction.id === state.editingId);
  if (!item) return;
  item.type = state.activeType;
  item.description = formData.get("description").trim();
  item.category = formData.get("category");
  item.account = formData.get("account");
  item.amount = Number(formData.get("amount"));
  item.date = formData.get("date");
  item.dueDate = formData.get("dueDate") || formData.get("date");
  item.status = formData.get("status") || "paid";
  const paymentMethod = formData.get("paymentMethod") || "pix";
  item.paymentMethod = paymentMethod;
  item.creditCardId = paymentMethod === "credit" ? formData.get("creditCardId") || null : null;
  if (paymentMethod !== "credit") {
    item.installmentGroup = null;
    item.installmentNumber = null;
    item.installmentTotal = null;
  }
  persist();
  resetTransactionForm();
  renderAll();
  notify("Lancamento atualizado.");
}

function editTransaction(id) {
  const item = state.transactions.find((transaction) => transaction.id === id);
  if (!item) return;
  state.editingId = id;
  setActiveType(item.type);
  document.querySelector("#description").value = item.description;
  document.querySelector("#category").value = item.category;
  document.querySelector("#account").value = item.account;
  document.querySelector("#amount").value = item.amount;
  document.querySelector("#date").value = item.date;
  document.querySelector("#due-date").value = item.dueDate || item.date;
  document.querySelector("#status").value = item.status || "paid";
  document.querySelector("#payment-method").value = item.paymentMethod || "pix";
  updateCreditPaymentFields();
  document.querySelector("#credit-card").value = item.creditCardId || "";
  document.querySelector("#installments").value = item.installmentTotal || 1;
  document.querySelector("#recurrence").value = "none";
  document.querySelector("#repeat-count").value = 1;
  document.querySelector("#installments").disabled = true;
  document.querySelector("#recurrence").disabled = true;
  document.querySelector("#repeat-count").disabled = true;
  document.querySelector("#transaction-form-title").textContent = "Editar lancamento";
  document.querySelector("#transaction-submit").textContent = "Salvar alteracoes";
  document.querySelector("#cancel-edit").classList.remove("is-hidden");
  location.hash = "lancamentos";
  setSectionFromHash();
}

function resetTransactionForm() {
  state.editingId = null;
  els.form.reset();
  setDefaultDate();
  updateCategoryOptions();
  updateCreditCardOptions();
  document.querySelector("#installments").disabled = false;
  document.querySelector("#recurrence").disabled = false;
  document.querySelector("#repeat-count").disabled = false;
  document.querySelector("#transaction-form-title").textContent = "Novo lancamento";
  document.querySelector("#transaction-submit").textContent = "Salvar lancamento";
  document.querySelector("#cancel-edit").classList.add("is-hidden");
  updateCreditPaymentFields();
}

function markTransactionPaid(id) {
  const item = state.transactions.find((transaction) => transaction.id === id);
  if (!item) return;
  item.status = "paid";
  item.date = toDateInput(new Date());
  persist();
  renderAll();
  notify("Lancamento marcado como pago.");
}

function removeTransaction(id) {
  state.transactions = state.transactions.filter((item) => item.id !== id);
  persist();
  renderAll();
  notify("Lancamento removido.");
}

function slugify(value) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function simplifyFieldName(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function getImportedField(row, kind) {
  const matchers = {
    description: (key) => key === "description" || key === "descricao" || key.startsWith("descri"),
    category: (key) => key === "category" || key === "cat" || key.includes("categoria"),
    note: (key) => key === "note" || key.includes("observa"),
    payment: (key) => key === "paymentmethod" || key === "payment" || key.includes("pagamento"),
    amount: (key) => key === "amount" || key === "val" || key.includes("valor"),
    date: (key) => key === "date" || key === "data",
    type: (key) => key === "type" || key === "tipo",
  };
  const matcher = matchers[kind];
  const found = Object.entries(row).find(([key]) => matcher(simplifyFieldName(key)));
  return found ? found[1] : undefined;
}

function normalizePaymentMethod(value) {
  const key = slugify(String(value || "pix"));
  if (key.includes("credito") || key.includes("credit")) return "credit";
  if (key.includes("debito") || key.includes("debit")) return "debit";
  if (key.includes("dinheiro") || key.includes("cash")) return "cash";
  if (key.includes("transfer")) return "transfer";
  return "pix";
}

function normalizeImportedDate(value) {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  if (typeof value === "string" && value.includes("/")) {
    const [day, month, year] = value.split("/");
    if (day && month && year) return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }
  return "";
}

function ensureImportedCategory(settings, type, label) {
  const name = String(label || "Outros").trim() || "Outros";
  const key = slugify(name) || "outros";
  const categories = settings.categories[type] || settings.categories.expense;
  if (!categories.some(([itemKey]) => itemKey === key)) {
    categories.push([key, name, "#667085", type === "expense" ? 0 : undefined]);
  }
  return key;
}

function normalizeImportedTransaction(row, settings) {
  const description = String(getImportedField(row, "description") || getImportedField(row, "note") || "").trim();
  const amount = Number(getImportedField(row, "amount"));
  const date = normalizeImportedDate(getImportedField(row, "date"));
  if (!description || !Number.isFinite(amount) || amount <= 0 || !date) return null;

  const rawType = slugify(String(getImportedField(row, "type") || ""));
  const type = rawType.includes("receita") || rawType.includes("income")
    ? "income"
    : rawType.includes("invest")
      ? "investment"
      : "expense";
  const category = ensureImportedCategory(settings, type, getImportedField(row, "category"));
  const paymentMethod = normalizePaymentMethod(getImportedField(row, "payment"));
  const isCredit = paymentMethod === "credit";

  return {
    id: row.id || createId(),
    type,
    description,
    category,
    account: row.account || "Conta corrente",
    amount,
    date,
    dueDate: normalizeImportedDate(row.dueDate || row.due_date) || date,
    status: row.status || "paid",
    paymentMethod,
    creditCardId: isCredit ? row.creditCardId || row.credit_card_id || null : null,
    recurrence: row.recurrence || "none",
    recurrenceId: row.recurrenceId || row.recurrence_id || null,
    installmentGroup: isCredit ? row.installmentGroup || row.installment_group || null : null,
    installmentNumber: isCredit ? row.installmentNumber || row.installment_number || null : null,
    installmentTotal: isCredit ? row.installmentTotal || row.installment_total || null : null,
    createdAt: row.createdAt || row.created_at || new Date().toISOString(),
  };
}

function normalizeImportedBackup(imported) {
  const rows = Array.isArray(imported) ? imported : imported.transactions;
  if (!Array.isArray(rows)) throw new Error("Formato invalido");
  const settings = imported.settings ? mergeSettings(clone(imported.settings)) : mergeSettings(clone(state.settings));
  const transactions = rows.map((row) => normalizeImportedTransaction(row, settings)).filter(Boolean);
  if (!transactions.length) throw new Error("Nenhum lancamento valido");
  return {
    transactions,
    settings,
    ignored: rows.length - transactions.length,
    total: rows.length,
  };
}

function showImportPreview(imported) {
  state.pendingImport = imported;
  const target = document.querySelector("#import-preview");
  const currentCount = state.transactions.length;
  target.innerHTML = `
    <div>
      <strong>Previa da importacao</strong>
      <p>${imported.transactions.length} lancamentos validos encontrados.${imported.ignored ? ` ${imported.ignored} linha${imported.ignored === 1 ? "" : "s"} ignorada${imported.ignored === 1 ? "" : "s"} por falta de data, descricao ou valor.` : ""}</p>
      <p>Hoje existem ${currentCount} lancamento${currentCount === 1 ? "" : "s"} no app.</p>
    </div>
    <div class="import-preview-actions">
      <button class="primary-btn" type="button" data-import-action="merge">Somar aos dados atuais</button>
      <button class="ghost-btn" type="button" data-import-action="replace">Substituir tudo</button>
      <button class="danger-btn" type="button" data-import-action="cancel">Cancelar</button>
    </div>
  `;
  target.classList.remove("is-hidden");
}

function clearImportPreview() {
  state.pendingImport = null;
  const target = document.querySelector("#import-preview");
  target.innerHTML = "";
  target.classList.add("is-hidden");
}

function applyPendingImport(mode) {
  if (!state.pendingImport) return;
  const imported = state.pendingImport;
  if (mode === "replace") {
    state.transactions = imported.transactions;
    state.settings = imported.settings;
  } else {
    const byId = new Map(state.transactions.map((item) => [item.id, item]));
    imported.transactions.forEach((item) => byId.set(item.id, item));
    state.transactions = Array.from(byId.values());
    state.settings = mergeSettings(imported.settings);
  }
  persist();
  updateCategoryOptions();
  updateAccountOptions();
  updateCreditCardOptions();
  renderAll();
  clearImportPreview();
  notify(mode === "replace" ? "Backup importado substituindo os dados." : "Backup somado aos dados atuais.");
}

function addCategory(event) {
  event.preventDefault();
  const type = document.querySelector("#new-category-type").value;
  const name = document.querySelector("#new-category-name").value.trim();
  const color = document.querySelector("#new-category-color").value;
  const limit = Number(document.querySelector("#new-category-limit").value || 0);
  const key = slugify(name);

  if (!key) return notify("Informe um nome valido.");
  if (state.settings.categories[type].some(([itemKey]) => itemKey === key)) {
    return notify("Esta categoria ja existe.");
  }

  state.settings.categories[type].push([key, name, color, type === "expense" ? limit : 0]);
  event.currentTarget.reset();
  document.querySelector("#new-category-color").value = "#0b7285";
  persist();
  updateCategoryOptions();
  renderAll();
  notify("Categoria criada.");
}

function addAccount(event) {
  event.preventDefault();
  const input = document.querySelector("#new-account-name");
  const name = input.value.trim();
  if (!name) return notify("Informe o nome da conta.");
  if (state.settings.accounts.some((item) => item.toLowerCase() === name.toLowerCase())) {
    return notify("Esta conta ja existe.");
  }

  state.settings.accounts.push(name);
  input.value = "";
  persist();
  updateAccountOptions();
  renderAll();
  notify("Conta criada.");
}

function addCreditCard(event) {
  event.preventDefault();
  const nameInput = document.querySelector("#new-card-name");
  const name = nameInput.value.trim();
  const closingDay = Number(document.querySelector("#new-card-closing").value);
  const dueDay = Number(document.querySelector("#new-card-due").value);
  if (!name) return notify("Informe o nome do cartao.");
  if (closingDay < 1 || closingDay > 31 || dueDay < 1 || dueDay > 31) return notify("Informe dias validos.");
  if (state.settings.creditCards.some((card) => card.name.toLowerCase() === name.toLowerCase())) {
    return notify("Este cartao ja existe.");
  }
  state.settings.creditCards.push({ id: createId(), name, closingDay, dueDay });
  event.currentTarget.reset();
  document.querySelector("#new-card-closing").value = 25;
  document.querySelector("#new-card-due").value = 10;
  persist();
  updateCreditCardOptions();
  renderAll();
  notify("Cartao criado.");
}

function addGoal(event) {
  event.preventDefault();
  const name = document.querySelector("#new-goal-name").value.trim();
  const key = document.querySelector("#new-goal-category").value;
  const target = Number(document.querySelector("#new-goal-target").value);
  if (!name || target <= 0) return notify("Preencha a meta corretamente.");

  state.settings.goals.push({ name, key, target });
  event.currentTarget.reset();
  persist();
  renderAll();
  notify("Meta criada.");
}

function updateGoal(index) {
  const goal = state.settings.goals[index];
  if (!goal) return;
  const nameInput = document.querySelector(`[data-goal-name="${index}"]`);
  const categoryInput = document.querySelector(`[data-goal-category="${index}"]`);
  const targetInput = document.querySelector(`[data-goal-target="${index}"]`);
  if (!nameInput || !categoryInput || !targetInput) return;

  const name = nameInput.value.trim();
  const key = categoryInput.value;
  const target = Number(targetInput.value);
  if (!name || target <= 0) return notify("Preencha a meta corretamente.");

  goal.name = name;
  goal.key = key;
  goal.target = target;
  persist();
  renderAll();
  notify("Meta atualizada.");
}

function removeCategory(type, key) {
  if (state.settings.categories[type].length <= 1) {
    return notify("Mantenha pelo menos uma categoria deste tipo.");
  }
  const inUse = state.transactions.some((item) => item.type === type && item.category === key);
  if (inUse) return notify("Categoria em uso. Remova ou altere os lancamentos primeiro.");
  state.settings.categories[type] = state.settings.categories[type].filter(([itemKey]) => itemKey !== key);
  state.settings.goals = state.settings.goals.filter((goal) => goal.key !== key);
  persist();
  updateCategoryOptions();
  renderAll();
  notify("Categoria removida.");
}

function removeAccount(index) {
  const name = state.settings.accounts[index];
  if (!name) return;
  if (state.settings.accounts.length <= 1) return notify("Mantenha pelo menos uma conta cadastrada.");
  const inUse = state.transactions.some((item) => item.account === name);
  if (inUse) return notify("Conta em uso. Remova ou altere os lancamentos primeiro.");
  state.settings.accounts.splice(index, 1);
  persist();
  updateAccountOptions();
  renderAll();
  notify("Conta removida.");
}

function removeCreditCard(index) {
  const card = state.settings.creditCards[index];
  if (!card) return;
  const inUse = state.transactions.some((item) => item.creditCardId === card.id);
  if (inUse) return notify("Cartao em uso. Altere os lancamentos primeiro.");
  state.settings.creditCards.splice(index, 1);
  persist();
  updateCreditCardOptions();
  renderAll();
  notify("Cartao removido.");
}

function editExpenseLimit(key) {
  const category = state.settings.categories.expense.find(([itemKey]) => itemKey === key);
  if (!category) return;
  const next = prompt("Novo limite mensal para esta categoria:", category[3] || 0);
  if (next === null) return;
  category[3] = Math.max(0, Number(next) || 0);
  persist();
  renderAll();
  notify("Limite atualizado.");
}

async function initSupabase() {
  if (state.supabaseClient) return true;

  if (!window.supabase) {
    renderCloudStatus("Supabase indisponivel");
    renderAuthGate("Nao foi possivel conectar agora. Tente novamente em instantes.");
    return false;
  }

  const config = await loadSupabaseConfig();
  if (!config?.url || !config?.anonKey) {
    renderCloudStatus("Configure o deploy");
    renderAuthGate("Nao foi possivel conectar agora. Tente novamente em instantes.");
    return false;
  }

  state.supabaseClient = window.supabase.createClient(config.url, config.anonKey);
  state.cloudReady = true;

  state.isPasswordRecovery = location.hash.includes("type=recovery") || location.hash.includes("access_token=");
  if (state.isPasswordRecovery) {
    showAuthView("update-password");
    renderAuthGate("Defina sua nova senha para continuar.");
  }

  const { data } = await state.supabaseClient.auth.getSession();
  if (data.session?.user && !isEmailConfirmed(data.session.user)) {
    await state.supabaseClient.auth.signOut();
    state.currentUser = null;
    renderAuthGate("Confirme seu e-mail antes de entrar.");
    renderCloudStatus();
  } else {
    state.currentUser = data.session?.user || null;
    if (state.isPasswordRecovery) {
      state.currentUser = null;
      renderAuthGate("Defina sua nova senha para continuar.");
      renderCloudStatus();
      return true;
    }
    renderAuthGate();
    renderCloudStatus();
    if (state.currentUser) {
      await saveUserProfileFromMetadata(state.currentUser);
      await pullFromSupabase({ silent: true });
    }
  }

  state.supabaseClient.auth.onAuthStateChange(async (event, session) => {
    if (event === "INITIAL_SESSION") return;
    if (event === "PASSWORD_RECOVERY") {
      state.isPasswordRecovery = true;
      state.currentUser = null;
      showAuthView("update-password");
      renderAuthGate("Defina sua nova senha para continuar.");
      renderCloudStatus();
      return;
    }
    if (session?.user && !isEmailConfirmed(session.user)) {
      await state.supabaseClient.auth.signOut();
      state.currentUser = null;
      renderAuthGate("Confirme seu e-mail antes de entrar.");
      renderCloudStatus();
      return;
    }
    if (state.isPasswordRecovery) {
      state.currentUser = null;
      showAuthView("update-password");
      renderAuthGate("Defina sua nova senha para continuar.");
      renderCloudStatus();
      return;
    }
    state.currentUser = session?.user || null;
    renderAuthGate();
    renderCloudStatus();
    if (state.currentUser) await pullFromSupabase({ silent: true });
  });
  return true;
}

async function ensureSupabaseReady() {
  if (state.supabaseClient) return true;
  if (!state.supabaseInitPromise) state.supabaseInitPromise = initSupabase();
  const isReady = await state.supabaseInitPromise;
  if (!isReady || !state.supabaseClient) {
    notify("Conexao com Supabase indisponivel. Atualize a pagina.");
    return false;
  }
  return true;
}

async function loadSupabaseConfig() {
  if (window.FINANCE_FLOW_SUPABASE) return window.FINANCE_FLOW_SUPABASE;

  const endpoints = ["/.netlify/functions/config", "/api/config"];
  try {
    for (const endpoint of endpoints) {
      const response = await fetch(endpoint, { cache: "no-store" });
      if (!response.ok) continue;
      const config = await response.json();
      if (config?.url && config?.anonKey) return config;
    }
    return SUPABASE_FALLBACK_CONFIG;
  } catch (error) {
    return SUPABASE_FALLBACK_CONFIG;
  }
}

function renderCloudStatus(forcedText) {
  return forcedText;
}

function renderAuthGate(message) {
  const isLogged = Boolean(state.currentUser) && !state.isPasswordRecovery;
  document.body.classList.remove("auth-loading");
  els.authScreen.classList.toggle("is-hidden", isLogged);
  els.appShell.classList.toggle("is-hidden", !isLogged);
  els.sidebar.classList.toggle("is-hidden", !isLogged);
  if (message) els.authNote.textContent = message;
  else if (!state.cloudReady) els.authNote.textContent = "Preparando acesso...";
  else els.authNote.textContent = isLogged ? "Sessao conectada." : "Entre para continuar.";
}

function isEmailConfirmed(user) {
  return Boolean(user?.email_confirmed_at || user?.confirmed_at);
}

async function requestPasswordReset(event) {
  if (event) event.preventDefault();
  if (!(await ensureSupabaseReady())) return;
  const email = document.querySelector("#reset-email").value.trim();
  if (!email) return notify("Informe seu e-mail.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return notify("Informe um e-mail valido.");

  const { error } = await state.supabaseClient.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.href.split("#")[0],
  });
  if (error) return notify(error.message);
  showAuthView("login");
  document.querySelector("#login-email").value = email;
  renderAuthGate("Verifique seu e-mail para redefinir a senha.");
  notify("Link de recuperacao enviado.");
}

async function updatePassword(event) {
  if (event) event.preventDefault();
  if (!(await ensureSupabaseReady())) return;
  const password = document.querySelector("#update-password").value;
  const confirmPassword = document.querySelector("#update-password-confirm").value;
  if (password.length < 6) return notify("A senha deve ter pelo menos 6 caracteres.");
  if (password !== confirmPassword) return notify("As senhas nao conferem.");

  const { error } = await state.supabaseClient.auth.updateUser({ password });
  if (error) return notify(error.message);

  state.isPasswordRecovery = false;
  await state.supabaseClient.auth.signOut();
  state.currentUser = null;
  document.querySelector("#update-password").value = "";
  document.querySelector("#update-password-confirm").value = "";
  location.hash = "";
  showAuthView("login");
  renderAuthGate("Senha atualizada. Entre com a nova senha.");
  notify("Senha atualizada com sucesso.");
}

async function signInSupabase(event) {
  if (event) event.preventDefault();
  if (!(await ensureSupabaseReady())) return;
  const credentials = getAuthCredentials();
  const email = credentials.email;
  const password = credentials.password;
  const validationError = validateAuthInput(email, password);
  if (validationError) return notify(validationError);

  const { data, error } = await state.supabaseClient.auth.signInWithPassword({ email, password });
  if (error) return notify(error.message);
  if (!isEmailConfirmed(data.user)) {
    await state.supabaseClient.auth.signOut();
    state.currentUser = null;
    renderAuthGate("Confirme seu e-mail antes de entrar.");
    return notify("Confirme seu e-mail antes de entrar.");
  }
  state.currentUser = data.user;
  renderAuthGate();
  renderCloudStatus();
  await saveUserProfileFromMetadata(data.user);
  await pullFromSupabase({ silent: true });
  notify("Login conectado.");
  renderCloudStatus();
}

async function signUpSupabase() {
  if (!(await ensureSupabaseReady())) return;
  const profile = getSignupProfile();
  const validationError = validateSignupProfile(profile);
  if (validationError) return notify(validationError);

  const { error } = await state.supabaseClient.auth.signUp({
    email: profile.email,
    password: profile.password,
    options: {
      emailRedirectTo: window.location.origin,
      data: {
        full_name: profile.fullName,
        cpf: profile.cpf,
        phone: profile.phone,
        birthdate: profile.birthdate,
      },
    },
  });
  if (error) return notify(error.message);
  await state.supabaseClient.auth.signOut();
  state.currentUser = null;
  showAuthView("login");
  document.querySelector("#login-email").value = profile.email;
  renderAuthGate("Conta criada. Verifique seu e-mail para confirmar o acesso.");
  notify("Conta criada. Verifique seu e-mail.");
}

async function signOutSupabase() {
  if (state.supabaseClient) await state.supabaseClient.auth.signOut();
  window.clearTimeout(state.syncTimer);
  state.isPasswordRecovery = false;
  state.currentUser = null;
  state.isSyncing = false;
  state.search = "";
  document.querySelector("#login-password").value = "";
  document.querySelector("#signup-password").value = "";
  location.hash = "";
  showAuthView("login");
  renderAuthGate("Sessao encerrada.");
  renderCloudStatus();
  notify("Sessao encerrada.");
}

function getAuthCredentials() {
  const loginEmail = document.querySelector("#login-email")?.value.trim();
  const loginPassword = document.querySelector("#login-password")?.value;

  return {
    email: loginEmail || "",
    password: loginPassword || "",
  };
}

function getSignupProfile() {
  return {
    fullName: document.querySelector("#signup-name").value.trim(),
    cpf: onlyDigits(document.querySelector("#signup-cpf").value),
    phone: document.querySelector("#signup-phone").value.trim(),
    birthdate: document.querySelector("#signup-birthdate").value,
    email: document.querySelector("#signup-email").value.trim(),
    password: document.querySelector("#signup-password").value,
  };
}

function validateAuthInput(email, password) {
  if (!email || !password) return "Informe e-mail e senha.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "Informe um e-mail valido.";
  if (password.length < 6) return "A senha deve ter pelo menos 6 caracteres.";
  return "";
}

function validateSignupProfile(profile) {
  if (!profile.fullName || profile.fullName.split(" ").length < 2) return "Informe seu nome completo.";
  if (!isValidCpf(profile.cpf)) return "Informe um CPF valido.";
  if (onlyDigits(profile.phone).length < 10) return "Informe um telefone valido.";
  if (!profile.birthdate) return "Informe sua data de nascimento.";
  if (!isAdult(profile.birthdate)) return "Cadastro permitido apenas para maiores de 18 anos.";
  return validateAuthInput(profile.email, profile.password);
}

function onlyDigits(value) {
  return String(value || "").replace(/\D/g, "");
}

function isAdult(dateValue) {
  const birth = parseLocalDate(dateValue);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) age -= 1;
  return age >= 18;
}

function isValidCpf(value) {
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

function formatCpf(value) {
  const digits = onlyDigits(value).slice(0, 11);
  return digits
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
}

function formatPhone(value) {
  const digits = onlyDigits(value).slice(0, 11);
  if (digits.length <= 10) {
    return digits.replace(/(\d{2})(\d)/, "($1) $2").replace(/(\d{4})(\d)/, "$1-$2");
  }
  return digits.replace(/(\d{2})(\d)/, "($1) $2").replace(/(\d{5})(\d)/, "$1-$2");
}

function showAuthView(view) {
  state.authView = view;
  const isSignup = view === "signup";
  const isReset = view === "reset";
  const isUpdatePassword = view === "update-password";
  document.querySelector("#login-form").classList.toggle("is-hidden", isSignup || isReset || isUpdatePassword);
  document.querySelector("#signup-form").classList.toggle("is-hidden", !isSignup);
  document.querySelector("#reset-form").classList.toggle("is-hidden", !isReset);
  document.querySelector("#update-password-form").classList.toggle("is-hidden", !isUpdatePassword);
  els.authTitle.textContent = isSignup
    ? "Crie sua conta"
    : isReset
      ? "Recupere sua senha"
      : isUpdatePassword
        ? "Defina uma nova senha"
        : "Acesse sua conta";
  els.authNote.textContent = isSignup
    ? "Preencha seus dados para criar o acesso."
    : isReset
      ? "Enviaremos um link para redefinir sua senha."
      : isUpdatePassword
        ? "Informe a nova senha para concluir a recuperacao."
        : "Entre para continuar.";
}

async function saveUserProfileFromMetadata(user) {
  if (!state.supabaseClient || !user?.id || !isEmailConfirmed(user)) return;
  const data = user.user_metadata || {};
  if (!data.full_name && !data.cpf && !data.phone && !data.birthdate) return;

  await state.supabaseClient.from("user_profiles").upsert({
    user_id: user.id,
    full_name: data.full_name || "",
    cpf: data.cpf || "",
    phone: data.phone || "",
    birthdate: data.birthdate || null,
    updated_at: new Date().toISOString(),
  });
}

function requireCloudUser() {
  if (!state.supabaseClient) {
    notify("Conexao com Supabase indisponivel. Atualize a pagina.");
    return false;
  }
  if (!state.currentUser) {
    notify("Entre com sua conta antes de sincronizar.");
    return false;
  }
  return true;
}

function toRemoteTransaction(item) {
  const date = parseLocalDate(item.date);
  return {
    id: item.id,
    user_id: state.currentUser.id,
    date: item.date,
    descricao: item.description,
    cat: item.category,
    type: item.type,
    val: Number(item.amount),
    account: item.account || "Conta corrente",
    status: item.status || "paid",
    due_date: item.dueDate || item.date,
    payment_method: item.paymentMethod || "pix",
    credit_card_id: item.creditCardId || null,
    recurrence_id: item.recurrenceId || null,
    installment_group: item.installmentGroup || null,
    installment_number: item.installmentNumber || null,
    installment_total: item.installmentTotal || null,
    year: date.getFullYear(),
    month: date.getMonth(),
    created_at: item.createdAt || new Date().toISOString(),
  };
}

function fromRemoteTransaction(row) {
  return {
    id: row.id,
    type: row.type,
    description: row.description || row.descricao || "",
    category: row.category || row.cat || "outros",
    account: row.account || "Conta corrente",
    amount: Number(row.amount ?? row.val ?? 0),
    date: normalizeRemoteDate(row.date, row.year, row.month),
    dueDate: normalizeRemoteDate(row.due_date || row.date, row.year, row.month),
    status: row.status || "paid",
    paymentMethod: row.payment_method || "pix",
    creditCardId: row.credit_card_id || null,
    recurrenceId: row.recurrence_id || null,
    installmentGroup: row.installment_group || null,
    installmentNumber: row.installment_number || null,
    installmentTotal: row.installment_total || null,
    createdAt: row.created_at || new Date().toISOString(),
  };
}

function normalizeRemoteDate(value, year, month) {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  if (typeof value === "string" && value.includes("/")) {
    const [day, localMonth, localYear] = value.split("/");
    return `${localYear}-${localMonth.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }
  if (Number.isInteger(year) && Number.isInteger(month)) {
    return `${year}-${String(month + 1).padStart(2, "0")}-01`;
  }
  return new Date().toISOString().slice(0, 10);
}

async function syncToSupabase() {
  if (!state.currentUser || !state.supabaseClient || state.isSyncing) return;
  state.isSyncing = true;
  renderCloudStatus("Salvando...");

  const client = state.supabaseClient;
  const userId = state.currentUser.id;
  const rows = state.transactions.map(toRemoteTransaction);
  if (rows.length) {
    const { error: upsertTxError } = await client.from("transactions").upsert(rows, { onConflict: "id" });
    if (upsertTxError) {
      handleCloudError(upsertTxError);
      return;
    }
  }

  const { error: settingsError } = await client
    .from("finance_settings")
    .upsert({ user_id: userId, settings: state.settings, updated_at: new Date().toISOString() });
  if (settingsError) {
    handleCloudError(settingsError);
    return;
  }

  const { data: remoteRows, error: remoteRowsError } = await client
    .from("transactions")
    .select("id")
    .eq("user_id", userId);
  if (remoteRowsError) {
    handleCloudError(remoteRowsError);
    return;
  }

  const localIds = new Set(state.transactions.map((item) => item.id));
  const idsToDelete = (remoteRows || []).map((item) => item.id).filter((id) => !localIds.has(id));
  if (idsToDelete.length) {
    const { error: deleteTxError } = await client.from("transactions").delete().eq("user_id", userId).in("id", idsToDelete);
    if (deleteTxError) {
      handleCloudError(deleteTxError);
      return;
    }
  }

  state.isSyncing = false;
  renderCloudStatus();
}

async function pullFromSupabase(options = {}) {
  if (!requireCloudUser()) return;
  if (!options.silent && state.transactions.length && !confirm("Substituir os dados locais pelos dados do Supabase?")) return;
  if (!options.silent) renderCloudStatus("Baixando...");

  const client = state.supabaseClient;
  const userId = state.currentUser.id;
  const { data: txRows, error: txError } = await client
    .from("transactions")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });
  if (txError) return handleCloudError(txError);

  const { data: settingsRow, error: settingsError } = await client
    .from("finance_settings")
    .select("settings")
    .eq("user_id", userId)
    .maybeSingle();
  if (settingsError) return handleCloudError(settingsError);

  state.transactions = (txRows || []).map(fromRemoteTransaction);
  if (settingsRow?.settings) state.settings = mergeSettings(settingsRow.settings);
  save();
  updateCategoryOptions();
  updateAccountOptions();
  renderAll();
  renderCloudStatus();
  if (!options.silent) notify("Dados baixados do Supabase.");
}

function handleCloudError(error) {
  state.isSyncing = false;
  renderCloudStatus();
  notify(error.message || "Erro ao sincronizar Supabase.");
}

function download(filename, content, type) {
  const blob = new Blob([content], { type });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}

function exportCsv() {
  const rows = [["Data", "Vencimento", "Descricao", "Categoria", "Conta", "Status", "Pagamento", "Tipo", "Valor"]];
  getMonthTransactions().forEach((item) => {
    const [, categoryLabel] = getCategory(item.type, item.category);
    rows.push([
      item.date,
      item.dueDate || item.date,
      item.description,
      categoryLabel,
      item.account,
      item.status || "paid",
      item.paymentMethod || "pix",
      item.type,
      String(item.amount).replace(".", ","),
    ]);
  });
  const csv = rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(";")).join("\n");
  download(`finance-flow-${monthKey(state.currentDate)}.csv`, `\ufeff${csv}`, "text/csv;charset=utf-8");
}

function exportJson() {
  download(
    "finance-flow-backup.json",
    JSON.stringify({ transactions: state.transactions, settings: state.settings }, null, 2),
    "application/json"
  );
}

function seedData() {
  if (state.transactions.length && !confirm("Substituir os dados atuais por dados de exemplo?")) return;
  const current = new Date(state.currentDate.getFullYear(), state.currentDate.getMonth(), 10);
  const samples = [
    ["income", "Salario", "salario", "Conta corrente", 7200, 5],
    ["expense", "Aluguel", "moradia", "Conta corrente", 1850, 6],
    ["expense", "Supermercado", "alimentacao", "Cartao de credito", 760, 8],
    ["expense", "Uber e metro", "transporte", "Cartao de credito", 210, 12],
    ["investment", "Tesouro Selic", "renda-fixa", "Corretora", 900, 15],
    ["expense", "Academia e farmacia", "saude", "Cartao de credito", 260, 18],
    ["expense", "Cinema e jantar", "lazer", "Cartao de credito", 340, 21],
    ["income", "Projeto freelance", "freelance", "Conta corrente", 1300, 24],
  ];

  state.transactions = samples.map(([type, description, category, account, amount, day]) => ({
    id: createId(),
    type,
    description,
    category,
    account,
    amount,
    date: new Date(current.getFullYear(), current.getMonth(), day).toISOString().slice(0, 10),
    dueDate: new Date(current.getFullYear(), current.getMonth(), day).toISOString().slice(0, 10),
    status: day > new Date().getDate() ? "pending" : "paid",
    paymentMethod: type === "income" ? "transfer" : "credit",
    creditCardId: type === "expense" ? "default-card" : null,
    recurrence: "none",
    recurrenceId: null,
    installmentGroup: null,
    installmentNumber: null,
    installmentTotal: null,
    createdAt: new Date().toISOString(),
  }));
  persist();
  renderAll();
  notify("Dados de exemplo carregados.");
}

function bindEvents() {
  document.querySelector("#prev-month").addEventListener("click", () => {
    state.currentDate = new Date(state.currentDate.getFullYear(), state.currentDate.getMonth() - 1, 1);
    renderAll();
  });
  document.querySelector("#next-month").addEventListener("click", () => {
    state.currentDate = new Date(state.currentDate.getFullYear(), state.currentDate.getMonth() + 1, 1);
    renderAll();
  });
  document.querySelector("#open-transaction").addEventListener("click", () => {
    location.hash = "lancamentos";
    setSectionFromHash();
    document.querySelector("#description").focus();
  });
  document.querySelector("#jump-to-form").addEventListener("click", () => {
    document.querySelector("#description").focus();
    document.querySelector("#transaction-form").scrollIntoView({ behavior: "smooth", block: "start" });
  });
  document.querySelector("#seed-data").addEventListener("click", seedData);
  document.querySelectorAll(".segment").forEach((button) =>
    button.addEventListener("click", () => setActiveType(button.dataset.type))
  );
  els.form.addEventListener("submit", addTransaction);
  document.querySelector("#category-form").addEventListener("submit", addCategory);
  document.querySelector("#account-form").addEventListener("submit", addAccount);
  document.querySelector("#card-form").addEventListener("submit", addCreditCard);
  document.querySelector("#goal-form").addEventListener("submit", addGoal);
  document.querySelector("#login-form").addEventListener("submit", signInSupabase);
  document.querySelector("#login-reset").addEventListener("click", () => {
    document.querySelector("#reset-email").value = document.querySelector("#login-email").value.trim();
    showAuthView("reset");
  });
  document.querySelector("#login-create").addEventListener("click", () => showAuthView("signup"));
  document.querySelector("#signup-back").addEventListener("click", () => showAuthView("login"));
  document.querySelector("#reset-back").addEventListener("click", () => showAuthView("login"));
  document.querySelector("#update-password-back").addEventListener("click", () => {
    location.hash = "";
    showAuthView("login");
  });
  document.querySelector("#signup-form").addEventListener("submit", (event) => {
    event.preventDefault();
    signUpSupabase();
  });
  document.querySelector("#reset-form").addEventListener("submit", requestPasswordReset);
  document.querySelector("#update-password-form").addEventListener("submit", updatePassword);
  document.querySelector("#goal-modal-form").addEventListener("submit", saveGoalFromModal);
  document.querySelector("#goal-modal-close").addEventListener("click", closeGoalModal);
  document.querySelector("#goal-modal-cancel").addEventListener("click", closeGoalModal);
  document.querySelector("#goal-modal-overlay").addEventListener("click", (event) => {
    if (event.target.id === "goal-modal-overlay") closeGoalModal();
  });
  document.querySelector("#signup-cpf").addEventListener("input", (event) => {
    event.target.value = formatCpf(event.target.value);
  });
  document.querySelector("#signup-phone").addEventListener("input", (event) => {
    event.target.value = formatPhone(event.target.value);
  });
  document.querySelector("#payment-method").addEventListener("change", updateCreditPaymentFields);
  document.querySelector("#logout-btn").addEventListener("click", signOutSupabase);
  document.querySelector("#cancel-edit").addEventListener("click", resetTransactionForm);
  els.search.addEventListener("input", (event) => {
    state.search = event.target.value;
    renderTable();
  });
  els.typeFilter.addEventListener("change", (event) => {
    state.typeFilter = event.target.value;
    renderTable();
  });
  els.table.addEventListener("click", (event) => {
    const removeButton = event.target.closest("[data-remove]");
    const editButton = event.target.closest("[data-edit]");
    const paidButton = event.target.closest("[data-paid]");
    if (removeButton) removeTransaction(removeButton.dataset.remove);
    if (editButton) editTransaction(editButton.dataset.edit);
    if (paidButton) markTransactionPaid(paidButton.dataset.paid);
  });
  document.querySelector("#export-csv").addEventListener("click", exportCsv);
  document.querySelector("#export-json").addEventListener("click", exportJson);
  document.querySelector("#clear-data").addEventListener("click", () => {
    if (!confirm("Limpar todos os dados salvos neste navegador?")) return;
    state.transactions = [];
    persist();
    renderAll();
    notify("Dados limpos.");
  });
  document.querySelector("#import-json").addEventListener("change", async (event) => {
    const [file] = event.target.files;
    if (!file) return;
    try {
      const imported = JSON.parse(await file.text());
      const normalized = normalizeImportedBackup(imported);
      showImportPreview(normalized);
    } catch (error) {
      notify("Nao foi possivel importar este arquivo.");
    } finally {
      event.target.value = "";
    }
  });
  document.querySelector("#import-preview").addEventListener("click", (event) => {
    const button = event.target.closest("[data-import-action]");
    if (!button) return;
    const action = button.dataset.importAction;
    if (action === "cancel") {
      clearImportPreview();
      notify("Importacao cancelada.");
      return;
    }
    applyPendingImport(action);
  });
  document.querySelector("#category-manage-list").addEventListener("click", (event) => {
    const removeButton = event.target.closest("[data-remove-category]");
    const limitButton = event.target.closest("[data-edit-limit]");
    if (removeButton) {
      const [type, key] = removeButton.dataset.removeCategory.split(":");
      removeCategory(type, key);
    }
    if (limitButton) editExpenseLimit(limitButton.dataset.editLimit);
  });
  document.querySelector("#account-manage-list").addEventListener("click", (event) => {
    const button = event.target.closest("[data-remove-account]");
    if (button) removeAccount(Number(button.dataset.removeAccount));
  });
  document.querySelector("#card-manage-list").addEventListener("click", (event) => {
    const button = event.target.closest("[data-remove-card]");
    if (button) removeCreditCard(Number(button.dataset.removeCard));
  });
  document.querySelector("#goal-manage-list").addEventListener("click", (event) => {
    const saveButton = event.target.closest("[data-save-goal]");
    const removeButton = event.target.closest("[data-remove-goal]");
    if (saveButton) {
      updateGoal(Number(saveButton.dataset.saveGoal));
      return;
    }
    if (removeButton) {
      state.settings.goals.splice(Number(removeButton.dataset.removeGoal), 1);
      persist();
      renderAll();
      notify("Meta removida.");
    }
  });
  document.querySelector("#goals-list").addEventListener("click", (event) => {
    const contributeButton = event.target.closest("[data-goal-contribute]");
    const editButton = event.target.closest("[data-goal-edit-card]");
    if (contributeButton) {
      openGoalContribution(Number(contributeButton.dataset.goalContribute));
      return;
    }
    if (editButton) {
      editGoalFromCard(Number(editButton.dataset.goalEditCard));
    }
  });
  window.addEventListener("hashchange", setSectionFromHash);
}

function setSectionFromHash() {
  const id = location.hash.replace("#", "") || "visao-geral";
  document.querySelectorAll(".section").forEach((section) => {
    section.classList.toggle("active", section.id === id);
  });
  document.querySelectorAll(".nav-item").forEach((item) => {
    item.classList.toggle("active", item.dataset.section === id);
  });
}

async function init() {
  load();
  setDefaultDate();
  setActiveType("expense");
  updateAccountOptions();
  updateCreditCardOptions();
  updateCreditPaymentFields();
  bindEvents();
  setSectionFromHash();
  renderAll();
  state.supabaseInitPromise = initSupabase();
  await state.supabaseInitPromise;
}

init().catch((error) => {
  console.error(error);
  state.currentUser = null;
  state.cloudReady = false;
  renderAuthGate("Nao foi possivel carregar agora. Atualize a pagina.");
});
