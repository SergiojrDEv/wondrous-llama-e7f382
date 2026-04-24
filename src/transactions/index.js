import { els, state } from "../core/state.js";
import {
  addMonths,
  categoryDisplayLabel,
  createId,
  esc,
  getAccountsList,
  getCategoriesByType,
  getCreditCardsList,
  getMonthTransactions,
  resolveTransactionAccount,
  resolveTransactionCategory,
  resolveTransactionCreditCard,
  resolveTransactionTag,
  getSubcategories,
  money,
  parseLocalDate,
  paymentMethodLabel,
  slugify,
  simplifyFieldName,
  syncTransactionRefs,
  toDateInput,
} from "../core/utils.js";

export function createTransactionsModule(deps) {
  function setDefaultDate() {
    const today = new Date();
    const value = toDateInput(today);
    els.date.value = value;
    document.querySelector("#due-date").value = value;
  }

  function updateCategoryOptions() {
    els.category.innerHTML = getCategoriesByType(state.activeType)
      .map((item) => `<option value="${esc(item.slug)}">${esc(item.name)}</option>`)
      .join("");
    updateSubcategoryOptions();
  }

  function updateAccountOptions() {
    els.account.innerHTML = getAccountsList().map((item) => `<option>${esc(item.name)}</option>`).join("");
  }

  function updateCreditCardOptions() {
    if (!els.creditCard) return;
    els.creditCard.innerHTML = '<option value="">Nenhum</option>' + getCreditCardsList()
      .map((card) => `<option value="${esc(card.id)}">${esc(card.name)}</option>`)
      .join("");

    const modalCard = document.querySelector("#transaction-modal-credit-card");
    if (modalCard) {
      modalCard.innerHTML = '<option value="">Nenhum</option>' + getCreditCardsList()
        .map((card) => `<option value="${esc(card.id)}">${esc(card.name)}</option>`)
        .join("");
    }
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

  function updateTransactionModalCategories(type = state.transactionModalType) {
    const category = document.querySelector("#transaction-modal-category");
    if (!category) return;
    category.innerHTML = getCategoriesByType(type)
      .map((item) => `<option value="${esc(item.slug)}">${esc(item.name)}</option>`)
      .join("");
    updateTransactionModalSubcategoryOptions();
  }

  function updateTransactionModalAccounts() {
    const account = document.querySelector("#transaction-modal-account");
    if (!account) return;
    account.innerHTML = getAccountsList().map((item) => `<option>${esc(item.name)}</option>`).join("");
  }

  function updateTransactionModalCreditFields() {
    const isCredit = document.querySelector("#transaction-modal-payment-method")?.value === "credit";
    const cardField = document.querySelector("#transaction-modal-credit-card-field");
    if (!cardField) return;
    cardField.classList.toggle("is-hidden", !isCredit);
    cardField.hidden = !isCredit;
    if (!isCredit) {
      document.querySelector("#transaction-modal-credit-card").value = "";
    }
  }

  function updateSubcategoryOptions(preferredValue = "") {
    const field = document.querySelector("#subcategory-field");
    const select = document.querySelector("#subcategory");
    if (!field || !select) return;
    const categoryKey = els.category.value;
    const items = getSubcategories(state.activeType, categoryKey);
    if (!items.length) {
      field.classList.add("is-hidden");
      field.hidden = true;
      select.innerHTML = "";
      select.value = "";
      return;
    }
    field.classList.remove("is-hidden");
    field.hidden = false;
    select.innerHTML = `<option value="">Sem subcategoria</option>${items
      .map(([value, label]) => `<option value="${esc(value)}">${esc(label)}</option>`)
      .join("")}`;
    select.value = items.some(([value]) => value === preferredValue) ? preferredValue : "";
  }

  function updateTransactionModalSubcategoryOptions(preferredValue = "") {
    const field = document.querySelector("#transaction-modal-subcategory-field");
    const select = document.querySelector("#transaction-modal-subcategory");
    const categoryKey = document.querySelector("#transaction-modal-category")?.value;
    if (!field || !select || !categoryKey) return;
    const items = getSubcategories(state.transactionModalType, categoryKey);
    if (!items.length) {
      field.classList.add("is-hidden");
      field.hidden = true;
      select.innerHTML = "";
      select.value = "";
      return;
    }
    field.classList.remove("is-hidden");
    field.hidden = false;
    select.innerHTML = `<option value="">Sem subcategoria</option>${items
      .map(([value, label]) => `<option value="${esc(value)}">${esc(label)}</option>`)
      .join("")}`;
    select.value = items.some(([value]) => value === preferredValue) ? preferredValue : "";
  }

  function setTransactionModalType(type) {
    state.transactionModalType = type;
    document.querySelectorAll(".transaction-modal-segment").forEach((button) => {
      button.classList.toggle("active", button.dataset.modalType === type);
    });
    updateTransactionModalCategories(type);
  }

  function setActiveType(type) {
    state.activeType = type;
    document.querySelectorAll(".segment").forEach((button) => {
      button.classList.toggle("active", button.dataset.type === type);
    });
    updateCategoryOptions();
  }

  function renderTable() {
    const monthTransactions = getMonthTransactions();
    const filtered = monthTransactions
      .filter((item) => state.typeFilter === "all" || item.type === state.typeFilter)
      .filter((item) => {
        const categoryLabel = resolveTransactionCategory(item)?.name || item.category;
        const tagLabel = resolveTransactionTag(item)?.name || item.subcategory || "";
        const accountLabel = resolveTransactionAccount(item)?.name || item.account;
        const haystack = `${item.description} ${item.category} ${categoryLabel} ${item.subcategory || ""} ${tagLabel} ${accountLabel} ${item.paymentMethod || ""}`.toLowerCase();
        return haystack.includes(state.search.toLowerCase());
      })
      .sort((a, b) => b.date.localeCompare(a.date));

    if (!filtered.length) {
      els.table.innerHTML = '<tr><td colspan="10" class="empty-state">Nenhum lancamento encontrado.</td></tr>';
      return;
    }

    els.table.innerHTML = filtered
      .map((item) => {
        const amountClass = item.type === "income" ? "positive" : item.type === "investment" ? "purple" : "negative";
        const sign = item.type === "income" ? "+" : "-";
        const typeLabel = item.type === "income" ? "Receita" : item.type === "investment" ? "Investimento" : "Despesa";
        const statusLabel = item.status === "pending" ? "Pendente" : item.status === "planned" ? "Previsto" : "Pago";

        return `
          <tr>
            <td>${parseLocalDate(item.date).toLocaleDateString("pt-BR")}</td>
            <td><strong>${esc(item.description)}</strong></td>
            <td><span class="category-pill">${esc(categoryDisplayLabel(item))}</span></td>
            <td>${esc(resolveTransactionAccount(item)?.name || item.account)}</td>
            <td><span class="type-pill ${item.status || "paid"}">${statusLabel}</span></td>
            <td><span class="payment-pill ${item.paymentMethod || "pix"}">${paymentMethodLabel(item.paymentMethod)}</span></td>
            <td>${item.dueDate ? parseLocalDate(item.dueDate).toLocaleDateString("pt-BR") : "-"}</td>
            <td><span class="type-pill ${item.type}">${typeLabel}</span></td>
            <td class="right money ${amountClass}">${sign} ${money(Number(item.amount))}</td>
            <td class="right">
              <div class="row-actions">
                ${item.status !== "paid" ? `<button class="row-action success" type="button" data-paid="${item.id}" title="Marcar como pago">Pago</button>` : ""}
                <button class="row-action neutral" type="button" data-edit="${item.id}" title="Editar">Editar</button>
                <button class="row-action" type="button" data-remove="${item.id}" aria-label="Remover lancamento">X</button>
              </div>
            </td>
          </tr>
        `;
      })
      .join("");
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
    const subcategory = formData.get("subcategory") || null;
    const transactions = Array.from({ length: totalItems }, (_, index) => {
      const date = addMonths(formData.get("date"), index);
      const dueDate = formData.get("dueDate") ? addMonths(formData.get("dueDate"), index) : date;
      const suffix = installments > 1 ? ` (${index + 1}/${installments})` : recurrence === "monthly" && totalItems > 1 ? ` (${index + 1}/${totalItems})` : "";
      return syncTransactionRefs({
        id: createId(),
        type: state.activeType,
        description: `${formData.get("description").trim()}${suffix}`,
        category: formData.get("category"),
        subcategory,
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
      });
    });

    state.transactions.push(...transactions);
    deps.persist();
    event.currentTarget.reset();
    setDefaultDate();
    updateCategoryOptions();
    deps.renderAll();
    deps.notify(totalItems > 1 ? `${totalItems} lancamentos criados.` : "Lancamento salvo.");
  }

  function updateTransaction(formData) {
    const item = state.transactions.find((transaction) => transaction.id === state.editingId);
    if (!item) return;
    item.type = state.activeType;
    item.description = formData.get("description").trim();
    item.category = formData.get("category");
    item.subcategory = formData.get("subcategory") || null;
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
    syncTransactionRefs(item);
    deps.persist();
    resetTransactionForm();
    deps.renderAll();
    deps.notify("Lancamento atualizado.");
  }

  function editTransaction(id) {
    const item = state.transactions.find((transaction) => transaction.id === id);
    if (!item) return;
    state.activeTransactionEditId = id;
    setTransactionModalType(item.type);
    updateTransactionModalAccounts();
    updateCreditCardOptions();
    document.querySelector("#transaction-modal-description").value = item.description;
    document.querySelector("#transaction-modal-category").value = item.category;
    updateTransactionModalSubcategoryOptions(item.subcategory || "");
    document.querySelector("#transaction-modal-account").value = resolveTransactionAccount(item)?.name || item.account;
    document.querySelector("#transaction-modal-amount").value = item.amount;
    document.querySelector("#transaction-modal-date").value = item.date;
    document.querySelector("#transaction-modal-due-date").value = item.dueDate || item.date;
    document.querySelector("#transaction-modal-status").value = item.status || "paid";
    document.querySelector("#transaction-modal-payment-method").value = item.paymentMethod || "pix";
    updateTransactionModalCreditFields();
    document.querySelector("#transaction-modal-credit-card").value = resolveTransactionCreditCard(item)?.id || item.creditCardId || "";
    document.querySelector("#transaction-modal-overlay").classList.remove("is-hidden");
    document.body.classList.add("modal-open");
    document.querySelector("#transaction-modal-description").focus();
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
    updateSubcategoryOptions();
  }

  function closeTransactionModal() {
    state.activeTransactionEditId = null;
    document.querySelector("#transaction-modal-form").reset();
    document.querySelector("#transaction-modal-overlay").classList.add("is-hidden");
    document.body.classList.remove("modal-open");
  }

  function saveTransactionFromModal(event) {
    event.preventDefault();
    const item = state.transactions.find((transaction) => transaction.id === state.activeTransactionEditId);
    if (!item) return closeTransactionModal();

    item.type = state.transactionModalType;
    item.description = document.querySelector("#transaction-modal-description").value.trim();
    item.category = document.querySelector("#transaction-modal-category").value;
    item.subcategory = document.querySelector("#transaction-modal-subcategory").value || null;
    item.account = document.querySelector("#transaction-modal-account").value;
    item.amount = Number(document.querySelector("#transaction-modal-amount").value);
    item.date = document.querySelector("#transaction-modal-date").value;
    item.dueDate = document.querySelector("#transaction-modal-due-date").value || item.date;
    item.status = document.querySelector("#transaction-modal-status").value || "paid";
    item.paymentMethod = document.querySelector("#transaction-modal-payment-method").value || "pix";
    item.creditCardId = item.paymentMethod === "credit" ? document.querySelector("#transaction-modal-credit-card").value || null : null;
    if (item.paymentMethod !== "credit") {
      item.installmentGroup = null;
      item.installmentNumber = null;
      item.installmentTotal = null;
    }

    if (!item.description || !item.category || !item.account || !item.amount || !item.date) {
      return deps.notify("Preencha os dados do lancamento corretamente.");
    }

    syncTransactionRefs(item);
    deps.persist();
    deps.renderAll();
    closeTransactionModal();
    deps.notify("Lancamento atualizado.");
  }

  function markTransactionPaid(id) {
    const item = state.transactions.find((transaction) => transaction.id === id);
    if (!item) return;
    item.status = "paid";
    item.date = toDateInput(new Date());
    syncTransactionRefs(item);
    deps.persist();
    deps.renderAll();
    deps.notify("Lancamento marcado como pago.");
  }

  function removeTransaction(id) {
    state.transactions = state.transactions.filter((item) => item.id !== id);
    deps.persist();
    deps.renderAll();
    deps.notify("Lancamento removido.");
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
    const subcategory = row.subcategory || row.subcat || null;
    const paymentMethod = normalizePaymentMethod(getImportedField(row, "payment"));
    const isCredit = paymentMethod === "credit";

    return syncTransactionRefs({
      id: row.id || createId(),
      type,
      description,
      category,
      subcategory,
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
    });
  }

  function normalizeImportedBackup(imported) {
    const rows = Array.isArray(imported) ? imported : imported.transactions;
    if (!Array.isArray(rows)) throw new Error("Formato invalido");
    const settings = imported.settings ? deps.mergeSettings(deps.clone(imported.settings)) : deps.mergeSettings(deps.clone(state.settings));
    const transactions = rows.map((row) => normalizeImportedTransaction(row, settings)).filter(Boolean);
    if (!transactions.length) throw new Error("Nenhum lancamento valido");
    return {
      transactions,
      settings,
      catalog: imported.catalog || null,
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
      state.catalog = imported.catalog || deps.hydrateCatalog(state.settings, state.catalog);
      deps.syncSettingsFromCatalog();
    } else {
      const byId = new Map(state.transactions.map((item) => [item.id, item]));
      imported.transactions.forEach((item) => byId.set(item.id, item));
      state.transactions = Array.from(byId.values());
      state.settings = deps.mergeSettings(imported.settings);
      state.catalog = imported.catalog ? deps.hydrateCatalog(imported.settings, imported.catalog) : deps.hydrateCatalog(state.settings, state.catalog);
      deps.syncSettingsFromCatalog();
    }
    deps.persist();
    updateCategoryOptions();
    updateAccountOptions();
    updateCreditCardOptions();
    deps.renderAll();
    clearImportPreview();
    deps.notify(mode === "replace" ? "Backup importado substituindo os dados." : "Backup somado aos dados atuais.");
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
    const rows = [["Data", "Vencimento", "Descricao", "Categoria", "Subcategoria", "Conta", "Status", "Pagamento", "Tipo", "Valor"]];
    getMonthTransactions().forEach((item) => {
      const [, categoryLabel] = deps.getCategory(item.type, item.category);
      const subcategoryLabel = deps.getSubcategoryLabel(item.type, item.category, item.subcategory);
      rows.push([
        item.date,
        item.dueDate || item.date,
        item.description,
        categoryLabel,
        subcategoryLabel,
        item.account,
        item.status || "paid",
        item.paymentMethod || "pix",
        item.type,
        String(item.amount).replace(".", ","),
      ]);
    });
    const csv = rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(";")).join("\n");
    download(`finance-flow-${deps.monthKey(state.currentDate)}.csv`, `\ufeff${csv}`, "text/csv;charset=utf-8");
  }

  function exportJson() {
    download(
      "finance-flow-backup.json",
      JSON.stringify({ transactions: state.transactions, settings: state.settings, catalog: state.catalog }, null, 2),
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

    state.transactions = samples.map(([type, description, category, account, amount, day]) => syncTransactionRefs({
      id: createId(),
      type,
      description,
      category,
      subcategory: description === "Supermercado" ? "mercado" : description === "Uber e metro" ? "app-mobilidade" : type === "income" && category === "salario" ? "fixo" : type === "investment" && category === "renda-fixa" ? "tesouro" : null,
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
    deps.persist();
    deps.renderAll();
    deps.notify("Dados de exemplo carregados.");
  }

  return {
    setDefaultDate,
    updateCategoryOptions,
    updateAccountOptions,
    updateCreditCardOptions,
    updateCreditPaymentFields,
    updateTransactionModalCategories,
    updateTransactionModalAccounts,
    updateTransactionModalCreditFields,
    updateSubcategoryOptions,
    updateTransactionModalSubcategoryOptions,
    setTransactionModalType,
    setActiveType,
    renderTable,
    addTransaction,
    updateTransaction,
    editTransaction,
    resetTransactionForm,
    closeTransactionModal,
    saveTransactionFromModal,
    markTransactionPaid,
    removeTransaction,
    getImportedField,
    normalizePaymentMethod,
    normalizeImportedDate,
    ensureImportedCategory,
    normalizeImportedTransaction,
    normalizeImportedBackup,
    showImportPreview,
    clearImportPreview,
    applyPendingImport,
    download,
    exportCsv,
    exportJson,
    seedData,
  };
}
