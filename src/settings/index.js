import { state } from "../core/state.js";
import {
  createId,
  esc,
  getBudgetRule,
  getCategoryColorFromList,
  money,
  slugify,
} from "../core/utils.js";

export function createSettingsModule(deps) {
  function getCatalog() {
    return state.catalog || deps.hydrateCatalog(state.settings, state.catalog);
  }

  function getCategoriesByType(type) {
    return getCatalog().categories.filter((item) => item.kind === type && !item.isArchived);
  }

  function getCategoryRecord(type, slug) {
    return getCategoriesByType(type).find((item) => item.slug === slug) || null;
  }

  function getAccounts() {
    return getCatalog().accounts.filter((item) => !item.isArchived);
  }

  function getAccountRecord(index) {
    return getAccounts()[index] || null;
  }

  function getCards() {
    return getCatalog().creditCards.filter((item) => !item.isArchived);
  }

  function getCardRecord(index) {
    return getCards()[index] || null;
  }

  function getGoals() {
    return getCatalog().goals.filter((item) => !item.isArchived);
  }

  function getGoalRecord(index) {
    return getGoals()[index] || null;
  }

  function getTags(type, categorySlug) {
    return getCatalog().tags.filter((item) => item.kind === type && item.categorySlug === categorySlug && !item.isArchived);
  }

  function getTagRecord(type, categorySlug, slug) {
    return getTags(type, categorySlug).find((item) => item.slug === slug) || null;
  }

  function getBudgetValue(categorySlug, periodKind) {
    const budget = getCatalog().budgets.find((item) => item.categorySlug === categorySlug && item.periodKind === periodKind);
    return Number(budget?.amount || 0);
  }

  function upsertBudget(categorySlug, periodKind, amount) {
    const catalog = getCatalog();
    const current = catalog.budgets.find((item) => item.categorySlug === categorySlug && item.periodKind === periodKind);
    if (current) {
      current.amount = Number(amount || 0);
      return;
    }
    catalog.budgets.push({
      id: `${categorySlug}:${periodKind}`,
      categorySlug,
      periodKind,
      amount: Number(amount || 0),
    });
  }

  function commitCatalogChanges(message) {
    deps.syncSettingsFromCatalog();
    deps.persist();
    deps.updateCategoryOptions();
    deps.updateAccountOptions();
    deps.updateCreditCardOptions();
    deps.updateTransactionModalAccounts();
    deps.updateTransactionModalCategories(state.transactionModalType);
    deps.renderAll();
    if (message) deps.notify(message);
  }

  function renderGoals() {
    const investments = state.transactions.filter((item) => item.type === "investment");
    const target = document.querySelector("#goals-list");
    const goals = getGoals();
    if (!goals.length) {
      target.innerHTML = '<article class="goal-card empty-state">Nenhuma meta criada ainda.</article>';
      return;
    }

    target.innerHTML = goals
      .map((goal, index) => {
        const current = investments
          .filter((item) => item.category === goal.key)
          .reduce((sum, item) => sum + Number(item.amount), 0) || Number(goal.currentAmount || 0);
        const pct = Math.min((current / goal.target) * 100, 100);
        const category = getCategoryRecord("investment", goal.key) || { name: goal.key };
        return `
          <article class="goal-card">
            <header>
              <strong>${esc(goal.name)}</strong>
              <small>${pct.toFixed(0)}%</small>
            </header>
            <div class="bar"><span style="--value:${pct}%;--color:var(--invest)"></span></div>
            <p><span class="money purple">${money(current)}</span> de ${money(goal.target)}</p>
            <small class="goal-card-note">Categoria: ${esc(category.name)}</small>
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
    const totals = getGoals().map((goal) => {
      const current = investments
        .filter((item) => item.category === goal.key)
        .reduce((sum, item) => sum + Number(item.amount), 0) || Number(goal.currentAmount || 0);
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
        <strong>${getGoals().length}</strong>
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
    const goal = getGoalRecord(index);
    if (!goal) return;
    location.hash = "novo-lancamento";
    deps.setSectionFromHash();
    deps.setActiveType("investment");
    deps.updateCategoryOptions();
    document.querySelector("#category").value = goal.key;
    const accountNames = getAccounts().map((item) => item.name);
    document.querySelector("#account").value = accountNames.includes("Corretora") ? "Corretora" : accountNames[0];
    document.querySelector("#payment-method").value = "transfer";
    deps.updateCreditPaymentFields();
    document.querySelector("#description").value = `Aporte - ${goal.name}`;
    document.querySelector("#amount").value = "";
    document.querySelector("#description").focus();
    document.querySelector("#transaction-form").scrollIntoView({ behavior: "smooth", block: "start" });
    deps.notify(`Preencha o valor para lancar aporte em ${goal.name}.`);
  }

  function editGoalFromCard(index) {
    const goal = getGoalRecord(index);
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
    const goal = getGoalRecord(index);
    if (!goal) return closeGoalModal();

    const name = document.querySelector("#goal-modal-name").value.trim();
    const key = document.querySelector("#goal-modal-category").value;
    const target = Number(document.querySelector("#goal-modal-target").value);
    if (!name || target <= 0) return deps.notify("Preencha a meta corretamente.");

    goal.name = name;
    goal.key = key;
    goal.target = target;
    commitCatalogChanges("Meta atualizada.");
    closeGoalModal();
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
    const rows = getCatalog().categories
      .filter((item) => !item.isArchived)
      .map((item) => ({ type: item.kind, key: item.slug, label: item.name, color: item.color, limit: item.monthlyLimit }));
    const target = document.querySelector("#category-manage-list");

    target.innerHTML = rows
      .map((item) => `
        <div class="manage-item">
          <div>
            <strong><span class="color-dot" style="--color:${esc(item.color)}"></span>${esc(item.label)}</strong>
            <small>${labels[item.type]}${item.type === "expense" ? ` | limite ${money(Number(item.limit || 0))}` : ""}${getTags(item.type, item.key).length ? ` | ${getTags(item.type, item.key).length} subcategoria${getTags(item.type, item.key).length === 1 ? "" : "s"}` : ""}</small>
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
    target.innerHTML = getAccounts()
      .map((account, index) => `
        <div class="manage-item">
          <div>
            <strong>${esc(account.name)}</strong>
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
    target.innerHTML = getCards()
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
    const goals = getGoals();
    if (!goals.length) {
      target.innerHTML = '<div class="empty-state">Nenhuma meta cadastrada.</div>';
      return;
    }

    const categoryOptions = (selected) => getCategoriesByType("investment")
      .map((item) => `<option value="${esc(item.slug)}"${item.slug === selected ? " selected" : ""}>${esc(item.name)}</option>`)
      .join("");

    target.innerHTML = goals
      .map((goal, index) => {
        const categoryLabel = getCategoryRecord("investment", goal.key)?.name || goal.key;
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
    const options = getCategoriesByType("investment")
      .map((item) => `<option value="${esc(item.slug)}">${esc(item.name)}</option>`)
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
    select.innerHTML = getCategoriesByType(type)
      .map((item) => `<option value="${esc(item.slug)}">${esc(item.name)}</option>`)
      .join("");
  }

  function renderSubcategoryManager() {
    const target = document.querySelector("#subcategory-manage-list");
    if (!target) return;
    const typeLabels = { expense: "Despesa", income: "Receita", investment: "Investimento" };
    const groups = getCatalog().categories
      .filter((item) => !item.isArchived)
      .map((item) => ({
        type: item.kind,
        categoryKey: item.slug,
        categoryLabel: item.name,
        tags: getTags(item.kind, item.slug).map((tag) => [tag.slug, tag.name, tag.color]),
      }));

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
    const catalog = getCatalog();
    if (catalog.tags.some((item) => item.kind === type && item.categorySlug === categoryKey && item.slug === key && !item.isArchived)) {
      return deps.notify("Esta etiqueta ja existe nessa categoria.");
    }

    catalog.tags.push({
      id: `tag:${type}:${categoryKey}:${key}`,
      kind: type,
      categorySlug: categoryKey,
      slug: key,
      name: normalized,
      color,
      isArchived: false,
    });
    commitCatalogChanges("Etiqueta adicionada.");
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
      const item = getCategoryRecord(edit.type, edit.key);
      if (!item) return closeSettingsItemModal();
      item.name = name;
      item.color = document.querySelector("#settings-item-modal-color").value;
      const monthly = Math.max(0, Number(document.querySelector("#settings-item-modal-limit").value) || 0);
      item.monthlyLimit = monthly;
      upsertBudget(edit.key, "weekly", getBudgetRule(edit.key).weekly || (monthly ? monthly / 4 : 0));
      upsertBudget(edit.key, "monthly", monthly);
    }

    if (edit.kind === "account") {
      const accounts = getAccounts();
      const duplicate = accounts.some((item, index) => index !== edit.index && item.name.toLowerCase() === name.toLowerCase());
      if (duplicate) return deps.notify("Ja existe uma conta com este nome.");
      const previous = accounts[edit.index]?.name;
      const account = accounts[edit.index];
      if (!account) return closeSettingsItemModal();
      account.name = name;
      state.transactions.forEach((item) => {
        if (item.account === previous) item.account = name;
      });
    }

    if (edit.kind === "card") {
      const cards = getCards();
      const duplicate = cards.some((item, index) => index !== edit.index && item.name.toLowerCase() === name.toLowerCase());
      if (duplicate) return deps.notify("Ja existe um cartao com este nome.");
      const card = cards[edit.index];
      if (!card) return closeSettingsItemModal();
      card.name = name;
      card.closingDay = Math.max(1, Math.min(31, Number(document.querySelector("#settings-item-modal-closing").value) || 25));
      card.dueDay = Math.max(1, Math.min(31, Number(document.querySelector("#settings-item-modal-due").value) || 10));
    }

    if (edit.kind === "tag") {
      const item = getTagRecord(edit.type, edit.categoryKey, edit.subKey);
      if (!item) return closeSettingsItemModal();
      item.name = name;
      item.color = document.querySelector("#settings-item-modal-color").value;
    }

    commitCatalogChanges("Alteracoes salvas.");
    closeSettingsItemModal();
  }

  function addCategory(event) {
    event.preventDefault();
    const type = document.querySelector("#new-category-type").value;
    const name = document.querySelector("#new-category-name").value.trim();
    const color = document.querySelector("#new-category-color").value;
    const limit = Number(document.querySelector("#new-category-limit").value || 0);
    const key = slugify(name);

    if (!key) return deps.notify("Informe um nome valido.");
    if (getCategoriesByType(type).some((item) => item.slug === key)) {
      return deps.notify("Esta categoria ja existe.");
    }

    getCatalog().categories.push({
      id: `category:${type}:${key}`,
      kind: type,
      slug: key,
      name,
      color,
      monthlyLimit: type === "expense" ? limit : null,
      isArchived: false,
    });
    if (type === "expense") {
      upsertBudget(key, "weekly", limit ? limit / 4 : 0);
      upsertBudget(key, "monthly", limit);
    }
    event.currentTarget.reset();
    document.querySelector("#new-category-color").value = "#0b7285";
    commitCatalogChanges("Categoria criada.");
    deps.updateCategoryOptions();
  }

  function addAccount(event) {
    event.preventDefault();
    const input = document.querySelector("#new-account-name");
    const name = input.value.trim();
    if (!name) return deps.notify("Informe o nome da conta.");
    if (getAccounts().some((item) => item.name.toLowerCase() === name.toLowerCase())) {
      return deps.notify("Esta conta ja existe.");
    }

    getCatalog().accounts.push({
      id: `account:${slugify(name)}`,
      name,
      kind: "checking",
      color: "#0b7285",
      institution: "",
      isArchived: false,
    });
    input.value = "";
    commitCatalogChanges("Conta criada.");
    deps.updateAccountOptions();
  }

  function addCreditCard(event) {
    event.preventDefault();
    const nameInput = document.querySelector("#new-card-name");
    const name = nameInput.value.trim();
    const closingDay = Number(document.querySelector("#new-card-closing").value);
    const dueDay = Number(document.querySelector("#new-card-due").value);
    if (!name) return deps.notify("Informe o nome do cartao.");
    if (closingDay < 1 || closingDay > 31 || dueDay < 1 || dueDay > 31) return deps.notify("Informe dias validos.");
    if (getCards().some((card) => card.name.toLowerCase() === name.toLowerCase())) {
      return deps.notify("Este cartao ja existe.");
    }
    getCatalog().creditCards.push({ id: createId(), name, closingDay, dueDay, color: "#635bff", accountId: null, brand: "", isArchived: false });
    event.currentTarget.reset();
    document.querySelector("#new-card-closing").value = 25;
    document.querySelector("#new-card-due").value = 10;
    commitCatalogChanges("Cartao criado.");
    deps.updateCreditCardOptions();
  }

  function addSubcategory(event) {
    event.preventDefault();
    const type = document.querySelector("#new-subcategory-type").value;
    const categoryKey = document.querySelector("#new-subcategory-category").value;
    const name = document.querySelector("#new-subcategory-name").value.trim();
    const color = document.querySelector("#new-subcategory-color").value || getCategoryColorFromList(type, categoryKey, state.settings.categories);
    if (!name || !categoryKey) return deps.notify("Preencha a subcategoria corretamente.");

    const key = slugify(name);
    if (getTags(type, categoryKey).some((item) => item.slug === key)) {
      return deps.notify("Esta subcategoria ja existe nessa categoria.");
    }

    getCatalog().tags.push({
      id: `tag:${type}:${categoryKey}:${key}`,
      kind: type,
      categorySlug: categoryKey,
      slug: key,
      name,
      color,
      isArchived: false,
    });
    event.currentTarget.reset();
    document.querySelector("#new-subcategory-type").value = type;
    document.querySelector("#new-subcategory-color").value = "#0b7285";
    renderSubcategoryParentOptions();
    commitCatalogChanges("Subcategoria criada.");
  }

  function addGoal(event) {
    event.preventDefault();
    const name = document.querySelector("#new-goal-name").value.trim();
    const key = document.querySelector("#new-goal-category").value;
    const target = Number(document.querySelector("#new-goal-target").value);
    if (!name || target <= 0) return deps.notify("Preencha a meta corretamente.");

    getCatalog().goals.push({ id: createId(), name, key, target, currentAmount: 0, color: "#635bff", isArchived: false });
    event.currentTarget.reset();
    commitCatalogChanges("Meta criada.");
  }

  function updateGoal(index) {
    const goal = getGoalRecord(index);
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
    commitCatalogChanges("Meta atualizada.");
  }

  function removeCategory(type, key) {
    if (getCategoriesByType(type).length <= 1) {
      return deps.notify("Mantenha pelo menos uma categoria deste tipo.");
    }
    const inUse = state.transactions.some((item) => item.type === type && item.category === key);
    if (inUse) return deps.notify("Categoria em uso. Remova ou altere os lancamentos primeiro.");
    const catalog = getCatalog();
    catalog.categories = catalog.categories.filter((item) => !(item.kind === type && item.slug === key));
    catalog.tags = catalog.tags.filter((item) => !(item.kind === type && item.categorySlug === key));
    catalog.goals = catalog.goals.filter((goal) => goal.key !== key);
    catalog.budgets = catalog.budgets.filter((item) => item.categorySlug !== key);
    commitCatalogChanges("Categoria removida.");
    deps.updateCategoryOptions();
  }

  function removeSubcategory(type, categoryKey, subKey) {
    const inUse = state.transactions.some((item) => item.type === type && item.category === categoryKey && item.subcategory === subKey);
    if (inUse) return deps.notify("Subcategoria em uso. Ajuste os lancamentos primeiro.");
    getCatalog().tags = getCatalog().tags.filter((item) => !(item.kind === type && item.categorySlug === categoryKey && item.slug === subKey));
    commitCatalogChanges("Subcategoria removida.");
  }

  function removeAccount(index) {
    const accounts = getAccounts();
    const name = accounts[index]?.name;
    if (!name) return;
    if (accounts.length <= 1) return deps.notify("Mantenha pelo menos uma conta cadastrada.");
    const inUse = state.transactions.some((item) => item.account === name);
    if (inUse) return deps.notify("Conta em uso. Remova ou altere os lancamentos primeiro.");
    getCatalog().accounts = getCatalog().accounts.filter((item, itemIndex) => itemIndex !== index);
    commitCatalogChanges("Conta removida.");
    deps.updateAccountOptions();
  }

  function removeCreditCard(index) {
    const card = getCardRecord(index);
    if (!card) return;
    const inUse = state.transactions.some((item) => item.creditCardId === card.id);
    if (inUse) return deps.notify("Cartao em uso. Altere os lancamentos primeiro.");
    getCatalog().creditCards = getCatalog().creditCards.filter((item) => item.id !== card.id);
    commitCatalogChanges("Cartao removido.");
    deps.updateCreditCardOptions();
  }

  function editExpenseLimit(key) {
    const category = getCategoryRecord("expense", key);
    if (!category) return;
    const current = getBudgetRule(key);
    const next = prompt("Novo limite mensal para esta categoria:", current.monthly || category.monthlyLimit || 0);
    if (next === null) return;
    const monthly = Math.max(0, Number(next) || 0);
    category.monthlyLimit = monthly;
    upsertBudget(key, "monthly", monthly);
    upsertBudget(key, "weekly", current.weekly || (monthly ? monthly / 4 : 0));
    commitCatalogChanges("Limite atualizado.");
  }

  function saveBudgetRule(event) {
    event.preventDefault();
    const form = event.target.closest(".budget-rule-form");
    const key = form.dataset.budgetKey;
    if (!key) return;
    const weekly = Math.max(0, Number(new FormData(form).get("weekly")) || 0);
    const monthly = Math.max(0, Number(new FormData(form).get("monthly")) || 0);
    const category = getCategoryRecord("expense", key);
    if (category) category.monthlyLimit = monthly;
    upsertBudget(key, "weekly", weekly);
    upsertBudget(key, "monthly", monthly);
    commitCatalogChanges("Regras de gasto atualizadas.");
  }

  return {
    getCategoryRecord,
    getAccountRecord,
    getCardRecord,
    getTagRecord,
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
    removeGoal(index) {
      const goal = getGoalRecord(index);
      if (!goal) return;
      getCatalog().goals = getCatalog().goals.filter((item) => item.id !== goal.id);
      commitCatalogChanges("Meta removida.");
    },
    removeCategory,
    removeSubcategory,
    removeAccount,
    removeCreditCard,
    editExpenseLimit,
    saveBudgetRule,
  };
}
