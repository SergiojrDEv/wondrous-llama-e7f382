import { state } from "../core/state.js";
import {
  createId,
  esc,
  getBudgetRule,
  getCategory,
  getCategoryColorFromList,
  getSubcategories,
  money,
  slugify,
  syncCategoryMonthlyLimit,
} from "../core/utils.js";

export function createSettingsModule(deps) {
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
    location.hash = "novo-lancamento";
    deps.setSectionFromHash();
    deps.setActiveType("investment");
    deps.updateCategoryOptions();
    document.querySelector("#category").value = goal.key;
    document.querySelector("#account").value = state.settings.accounts.includes("Corretora") ? "Corretora" : state.settings.accounts[0];
    document.querySelector("#payment-method").value = "transfer";
    deps.updateCreditPaymentFields();
    document.querySelector("#description").value = `Aporte - ${goal.name}`;
    document.querySelector("#amount").value = "";
    document.querySelector("#description").focus();
    document.querySelector("#transaction-form").scrollIntoView({ behavior: "smooth", block: "start" });
    deps.notify(`Preencha o valor para lancar aporte em ${goal.name}.`);
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
    if (!name || target <= 0) return deps.notify("Preencha a meta corretamente.");

    goal.name = name;
    goal.key = key;
    goal.target = target;
    deps.persist();
    deps.renderAll();
    closeGoalModal();
    deps.notify("Meta atualizada.");
  }

  function renderSettings() {
    renderManagePanels();
    renderCategoryManager();
    renderAccountManager();
    renderCardManager();
    renderGoalManager();
    renderSubcategoryManager();
    renderGoalCategoryOptions();
    renderSubcategoryParentOptions();
    deps.updateTransactionModalAccounts();
    deps.updateCreditCardOptions();
  }

  function renderManagePanels() {
    document.querySelectorAll(".manage-tab").forEach((button) => {
      button.classList.toggle("is-active", button.dataset.manageView === state.manageView);
    });
    document.querySelectorAll(".manage-panel").forEach((panel) => {
      panel.classList.toggle("is-active", panel.dataset.managePanel === state.manageView);
    });
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
            <small>${labels[item.type]}${item.type === "expense" ? ` | limite ${money(Number(item.limit || 0))}` : ""}${getSubcategories(item.type, item.key).length ? ` | ${getSubcategories(item.type, item.key).length} subcategoria${getSubcategories(item.type, item.key).length === 1 ? "" : "s"}` : ""}</small>
          </div>
          <div class="mini-actions">
            <button class="mini-btn" type="button" data-edit-category="${item.type}:${item.key}">Editar</button>
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
          <div class="mini-actions">
            <button class="mini-btn" type="button" data-edit-account="${index}">Editar</button>
            <button class="mini-btn danger" type="button" data-remove-account="${index}">Remover</button>
          </div>
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
          <div class="mini-actions">
            <button class="mini-btn" type="button" data-edit-card="${index}">Editar</button>
            <button class="mini-btn danger" type="button" data-remove-card="${index}">Remover</button>
          </div>
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

  function renderSubcategoryParentOptions() {
    const type = document.querySelector("#new-subcategory-type")?.value || "expense";
    const select = document.querySelector("#new-subcategory-category");
    if (!select) return;
    select.innerHTML = state.settings.categories[type]
      .map(([value, label]) => `<option value="${esc(value)}">${esc(label)}</option>`)
      .join("");
  }

  function renderSubcategoryManager() {
    const target = document.querySelector("#subcategory-manage-list");
    if (!target) return;
    const typeLabels = { expense: "Despesa", income: "Receita", investment: "Investimento" };
    const groups = Object.entries(state.settings.categories).flatMap(([type, categories]) =>
      categories.map(([categoryKey, categoryLabel]) => ({
        type,
        categoryKey,
        categoryLabel,
        tags: getSubcategories(type, categoryKey),
      }))
    );

    target.innerHTML = groups.map((group) => `
      <article class="tag-plan-card">
        <header class="tag-plan-header">
          <div>
            <strong>${esc(group.categoryLabel)}</strong>
            <small>${typeLabels[group.type]}${group.tags.length ? ` | ${group.tags.length} etiqueta${group.tags.length === 1 ? "" : "s"}` : " | sem etiquetas"}</small>
          </div>
        </header>
        <div class="tag-chip-wrap">
          ${group.tags.length ? group.tags.map(([subKey, subLabel, subColor]) => `
            <div class="tag-chip" style="--tag-color:${esc(subColor || getCategoryColorFromList(group.type, group.categoryKey, state.settings.categories))}">
              <span class="tag-chip-dot"></span>
              <span>${esc(subLabel)}</span>
              <span class="tag-chip-actions">
                <button class="tag-chip-action" type="button" data-edit-subcategory="${group.type}:${group.categoryKey}:${subKey}" title="Editar etiqueta">Editar</button>
                <button class="tag-chip-action danger" type="button" data-remove-subcategory="${group.type}:${group.categoryKey}:${subKey}" title="Remover etiqueta">x</button>
              </span>
            </div>
          `).join("") : '<span class="tag-chip tag-chip-empty">Nenhuma etiqueta ainda</span>'}
        </div>
        <form class="tag-inline-form" data-subcategory-inline="${group.type}:${group.categoryKey}">
          <input type="text" name="name" placeholder="Adicionar etiqueta" aria-label="Adicionar etiqueta em ${esc(group.categoryLabel)}">
          <button class="mini-btn" type="submit">Adicionar</button>
        </form>
      </article>
    `).join("");
  }

  function addInlineSubcategory(type, categoryKey, name) {
    const normalized = name.trim();
    if (!normalized) return deps.notify("Informe um nome para a etiqueta.");
    const key = slugify(normalized);
    const color = getCategoryColorFromList(type, categoryKey, state.settings.categories);
    state.settings.subcategories[type] ||= {};
    state.settings.subcategories[type][categoryKey] ||= [];
    if (state.settings.subcategories[type][categoryKey].some(([itemKey]) => itemKey === key)) {
      return deps.notify("Esta etiqueta ja existe nessa categoria.");
    }

    state.settings.subcategories[type][categoryKey].push([key, normalized, color]);
    deps.persist();
    deps.renderAll();
    deps.notify("Etiqueta adicionada.");
  }

  function openSettingsItemModal(config) {
    state.settingsItemEdit = config;
    document.querySelector("#settings-item-modal-kicker").textContent = config.kicker;
    document.querySelector("#settings-item-modal-title").textContent = config.title;
    document.querySelector("#settings-item-modal-name").value = config.name || "";
    document.querySelector("#settings-item-modal-color").value = config.color || "#0b7285";
    document.querySelector("#settings-item-modal-limit").value = Number(config.limit || 0);
    document.querySelector("#settings-item-modal-closing").value = Number(config.closingDay || 25);
    document.querySelector("#settings-item-modal-due").value = Number(config.dueDay || 10);
    const showColor = config.kind === "category" || config.kind === "tag";
    document.querySelector("#settings-item-modal-category-fields").classList.toggle("is-hidden", !showColor && config.kind !== "category");
    document.querySelector("#settings-item-modal-category-fields").hidden = !showColor && config.kind !== "category";
    document.querySelector("#settings-item-modal-color-field").classList.toggle("is-hidden", !showColor);
    document.querySelector("#settings-item-modal-color-field").hidden = !showColor;
    document.querySelector("#settings-item-modal-limit-field").classList.toggle("is-hidden", config.kind !== "category");
    document.querySelector("#settings-item-modal-limit-field").hidden = config.kind !== "category";
    document.querySelector("#settings-item-modal-card-fields").classList.toggle("is-hidden", config.kind !== "card");
    document.querySelector("#settings-item-modal-card-fields").hidden = config.kind !== "card";
    document.querySelector("#settings-item-modal-overlay").classList.remove("is-hidden");
    document.body.classList.add("modal-open");
    document.querySelector("#settings-item-modal-name").focus();
  }

  function closeSettingsItemModal() {
    state.settingsItemEdit = null;
    document.querySelector("#settings-item-modal-overlay").classList.add("is-hidden");
    document.body.classList.remove("modal-open");
  }

  function saveSettingsItemFromModal(event) {
    event.preventDefault();
    const edit = state.settingsItemEdit;
    if (!edit) return closeSettingsItemModal();

    const name = document.querySelector("#settings-item-modal-name").value.trim();
    if (!name) return deps.notify("Informe um nome valido.");

    if (edit.kind === "category") {
      const item = state.settings.categories[edit.type].find(([key]) => key === edit.key);
      if (!item) return closeSettingsItemModal();
      item[1] = name;
      item[2] = document.querySelector("#settings-item-modal-color").value;
      const monthly = Math.max(0, Number(document.querySelector("#settings-item-modal-limit").value) || 0);
      item[3] = monthly;
      state.settings.budgetRules[edit.key] = {
        weekly: getBudgetRule(edit.key).weekly || (monthly ? monthly / 4 : 0),
        monthly,
      };
    }

    if (edit.kind === "account") {
      const duplicate = state.settings.accounts.some((item, index) => index !== edit.index && item.toLowerCase() === name.toLowerCase());
      if (duplicate) return deps.notify("Ja existe uma conta com este nome.");
      const previous = state.settings.accounts[edit.index];
      state.settings.accounts[edit.index] = name;
      state.transactions.forEach((item) => {
        if (item.account === previous) item.account = name;
      });
    }

    if (edit.kind === "card") {
      const duplicate = state.settings.creditCards.some((item, index) => index !== edit.index && item.name.toLowerCase() === name.toLowerCase());
      if (duplicate) return deps.notify("Ja existe um cartao com este nome.");
      const card = state.settings.creditCards[edit.index];
      if (!card) return closeSettingsItemModal();
      card.name = name;
      card.closingDay = Math.max(1, Math.min(31, Number(document.querySelector("#settings-item-modal-closing").value) || 25));
      card.dueDay = Math.max(1, Math.min(31, Number(document.querySelector("#settings-item-modal-due").value) || 10));
    }

    if (edit.kind === "tag") {
      const list = state.settings.subcategories?.[edit.type]?.[edit.categoryKey];
      const item = list?.find(([key]) => key === edit.subKey);
      if (!item) return closeSettingsItemModal();
      item[1] = name;
      item[2] = document.querySelector("#settings-item-modal-color").value;
    }

    deps.persist();
    deps.renderAll();
    closeSettingsItemModal();
    deps.notify("Alteracoes salvas.");
  }

  function addCategory(event) {
    event.preventDefault();
    const type = document.querySelector("#new-category-type").value;
    const name = document.querySelector("#new-category-name").value.trim();
    const color = document.querySelector("#new-category-color").value;
    const limit = Number(document.querySelector("#new-category-limit").value || 0);
    const key = slugify(name);

    if (!key) return deps.notify("Informe um nome valido.");
    if (state.settings.categories[type].some(([itemKey]) => itemKey === key)) {
      return deps.notify("Esta categoria ja existe.");
    }

    state.settings.categories[type].push([key, name, color, type === "expense" ? limit : 0]);
    if (type === "expense") {
      state.settings.budgetRules[key] = {
        weekly: limit ? limit / 4 : 0,
        monthly: limit,
      };
    }
    event.currentTarget.reset();
    document.querySelector("#new-category-color").value = "#0b7285";
    deps.persist();
    deps.updateCategoryOptions();
    deps.renderAll();
    deps.notify("Categoria criada.");
  }

  function addAccount(event) {
    event.preventDefault();
    const input = document.querySelector("#new-account-name");
    const name = input.value.trim();
    if (!name) return deps.notify("Informe o nome da conta.");
    if (state.settings.accounts.some((item) => item.toLowerCase() === name.toLowerCase())) {
      return deps.notify("Esta conta ja existe.");
    }

    state.settings.accounts.push(name);
    input.value = "";
    deps.persist();
    deps.updateAccountOptions();
    deps.renderAll();
    deps.notify("Conta criada.");
  }

  function addCreditCard(event) {
    event.preventDefault();
    const nameInput = document.querySelector("#new-card-name");
    const name = nameInput.value.trim();
    const closingDay = Number(document.querySelector("#new-card-closing").value);
    const dueDay = Number(document.querySelector("#new-card-due").value);
    if (!name) return deps.notify("Informe o nome do cartao.");
    if (closingDay < 1 || closingDay > 31 || dueDay < 1 || dueDay > 31) return deps.notify("Informe dias validos.");
    if (state.settings.creditCards.some((card) => card.name.toLowerCase() === name.toLowerCase())) {
      return deps.notify("Este cartao ja existe.");
    }
    state.settings.creditCards.push({ id: createId(), name, closingDay, dueDay });
    event.currentTarget.reset();
    document.querySelector("#new-card-closing").value = 25;
    document.querySelector("#new-card-due").value = 10;
    deps.persist();
    deps.updateCreditCardOptions();
    deps.renderAll();
    deps.notify("Cartao criado.");
  }

  function addSubcategory(event) {
    event.preventDefault();
    const type = document.querySelector("#new-subcategory-type").value;
    const categoryKey = document.querySelector("#new-subcategory-category").value;
    const name = document.querySelector("#new-subcategory-name").value.trim();
    const color = document.querySelector("#new-subcategory-color").value || getCategoryColorFromList(type, categoryKey, state.settings.categories);
    if (!name || !categoryKey) return deps.notify("Preencha a subcategoria corretamente.");

    const key = slugify(name);
    state.settings.subcategories[type] ||= {};
    state.settings.subcategories[type][categoryKey] ||= [];
    if (state.settings.subcategories[type][categoryKey].some(([itemKey]) => itemKey === key)) {
      return deps.notify("Esta subcategoria ja existe nessa categoria.");
    }

    state.settings.subcategories[type][categoryKey].push([key, name, color]);
    event.currentTarget.reset();
    document.querySelector("#new-subcategory-type").value = type;
    document.querySelector("#new-subcategory-color").value = "#0b7285";
    renderSubcategoryParentOptions();
    deps.persist();
    deps.renderAll();
    deps.notify("Subcategoria criada.");
  }

  function addGoal(event) {
    event.preventDefault();
    const name = document.querySelector("#new-goal-name").value.trim();
    const key = document.querySelector("#new-goal-category").value;
    const target = Number(document.querySelector("#new-goal-target").value);
    if (!name || target <= 0) return deps.notify("Preencha a meta corretamente.");

    state.settings.goals.push({ name, key, target });
    event.currentTarget.reset();
    deps.persist();
    deps.renderAll();
    deps.notify("Meta criada.");
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
    if (!name || target <= 0) return deps.notify("Preencha a meta corretamente.");

    goal.name = name;
    goal.key = key;
    goal.target = target;
    deps.persist();
    deps.renderAll();
    deps.notify("Meta atualizada.");
  }

  function removeCategory(type, key) {
    if (state.settings.categories[type].length <= 1) {
      return deps.notify("Mantenha pelo menos uma categoria deste tipo.");
    }
    const inUse = state.transactions.some((item) => item.type === type && item.category === key);
    if (inUse) return deps.notify("Categoria em uso. Remova ou altere os lancamentos primeiro.");
    state.settings.categories[type] = state.settings.categories[type].filter(([itemKey]) => itemKey !== key);
    if (state.settings.subcategories?.[type]?.[key]) delete state.settings.subcategories[type][key];
    state.settings.goals = state.settings.goals.filter((goal) => goal.key !== key);
    if (state.settings.budgetRules?.[key]) delete state.settings.budgetRules[key];
    deps.persist();
    deps.updateCategoryOptions();
    deps.renderAll();
    deps.notify("Categoria removida.");
  }

  function removeSubcategory(type, categoryKey, subKey) {
    const inUse = state.transactions.some((item) => item.type === type && item.category === categoryKey && item.subcategory === subKey);
    if (inUse) return deps.notify("Subcategoria em uso. Ajuste os lancamentos primeiro.");
    state.settings.subcategories[type][categoryKey] = (state.settings.subcategories[type][categoryKey] || [])
      .filter(([itemKey]) => itemKey !== subKey);
    if (!state.settings.subcategories[type][categoryKey].length) {
      delete state.settings.subcategories[type][categoryKey];
    }
    deps.persist();
    deps.renderAll();
    deps.notify("Subcategoria removida.");
  }

  function removeAccount(index) {
    const name = state.settings.accounts[index];
    if (!name) return;
    if (state.settings.accounts.length <= 1) return deps.notify("Mantenha pelo menos uma conta cadastrada.");
    const inUse = state.transactions.some((item) => item.account === name);
    if (inUse) return deps.notify("Conta em uso. Remova ou altere os lancamentos primeiro.");
    state.settings.accounts.splice(index, 1);
    deps.persist();
    deps.updateAccountOptions();
    deps.renderAll();
    deps.notify("Conta removida.");
  }

  function removeCreditCard(index) {
    const card = state.settings.creditCards[index];
    if (!card) return;
    const inUse = state.transactions.some((item) => item.creditCardId === card.id);
    if (inUse) return deps.notify("Cartao em uso. Altere os lancamentos primeiro.");
    state.settings.creditCards.splice(index, 1);
    deps.persist();
    deps.updateCreditCardOptions();
    deps.renderAll();
    deps.notify("Cartao removido.");
  }

  function editExpenseLimit(key) {
    const category = state.settings.categories.expense.find(([itemKey]) => itemKey === key);
    if (!category) return;
    const current = getBudgetRule(key);
    const next = prompt("Novo limite mensal para esta categoria:", current.monthly || category[3] || 0);
    if (next === null) return;
    const monthly = Math.max(0, Number(next) || 0);
    state.settings.budgetRules[key] ||= { weekly: 0, monthly: 0 };
    state.settings.budgetRules[key].monthly = monthly;
    state.settings.budgetRules[key].weekly = current.weekly || (monthly ? monthly / 4 : 0);
    syncCategoryMonthlyLimit(key, monthly);
    deps.persist();
    deps.renderAll();
    deps.notify("Limite atualizado.");
  }

  function saveBudgetRule(event) {
    event.preventDefault();
    const form = event.target.closest(".budget-rule-form");
    const key = form.dataset.budgetKey;
    if (!key) return;
    const weekly = Math.max(0, Number(new FormData(form).get("weekly")) || 0);
    const monthly = Math.max(0, Number(new FormData(form).get("monthly")) || 0);
    state.settings.budgetRules[key] = { weekly, monthly };
    syncCategoryMonthlyLimit(key, monthly);
    deps.persist();
    deps.renderAll();
    deps.notify("Regras de gasto atualizadas.");
  }

  return {
    renderGoals,
    renderGoalsSummary,
    openGoalContribution,
    editGoalFromCard,
    closeGoalModal,
    saveGoalFromModal,
    renderSettings,
    renderManagePanels,
    renderCategoryManager,
    renderAccountManager,
    renderCardManager,
    renderGoalManager,
    renderGoalCategoryOptions,
    renderSubcategoryParentOptions,
    renderSubcategoryManager,
    addInlineSubcategory,
    openSettingsItemModal,
    closeSettingsItemModal,
    saveSettingsItemFromModal,
    addCategory,
    addAccount,
    addCreditCard,
    addSubcategory,
    addGoal,
    updateGoal,
    removeCategory,
    removeSubcategory,
    removeAccount,
    removeCreditCard,
    editExpenseLimit,
    saveBudgetRule,
  };
}
