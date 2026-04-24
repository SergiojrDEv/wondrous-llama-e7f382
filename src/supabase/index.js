import { SUPABASE_FALLBACK_CONFIG, state } from "../core/state.js";
import { buildCatalogFromV2, ensureCatalogCoversTransactions } from "../core/catalog.js";

export function createSupabaseModule(deps) {
  function isMissingRelationError(error) {
    const message = String(error?.message || "").toLowerCase();
    return message.includes("does not exist") || message.includes("could not find") || error?.code === "PGRST205";
  }

  function inferAccountKind(name) {
    const lower = String(name || "").toLowerCase();
    if (lower.includes("cartao")) return "credit_card";
    if (lower.includes("corretora")) return "investment";
    if (lower.includes("carteira")) return "wallet";
    if (lower.includes("poupanca")) return "savings";
    return "checking";
  }

  function getAuthHashType() {
    const hash = String(location.hash || "").replace(/^#/, "");
    const params = new URLSearchParams(hash);
    return params.get("type") || "";
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
    } catch (error) {
      console.error("Erro ao carregar config do Supabase", error);
    }
    return SUPABASE_FALLBACK_CONFIG;
  }

  function renderCloudStatus(forcedText) {
    const badge = document.querySelector("#cloud-status");
    if (!badge) return;
    if (forcedText) {
      badge.textContent = forcedText;
      return;
    }
    if (!state.cloudReady) badge.textContent = "Offline";
    else if (state.isSyncing) badge.textContent = "Salvando...";
    else if (state.currentUser?.email) badge.textContent = `Salvo na nuvem: ${state.currentUser.email}`;
    else badge.textContent = "Nao conectado";
  }

  function requireCloudUser() {
    if (!state.supabaseClient) {
      deps.notify("Conexao com Supabase indisponivel. Atualize a pagina.");
      return false;
    }
    if (!state.currentUser) {
      deps.notify("Entre com sua conta antes de sincronizar.");
      return false;
    }
    return true;
  }

  async function saveUserProfileFromMetadata(user) {
    if (!state.supabaseClient || !user?.id || !deps.isEmailConfirmed(user)) return;
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

  function toRemoteTransaction(item) {
    const date = deps.parseLocalDate(item.date);
    return {
      id: item.id,
      user_id: state.currentUser.id,
      date: item.date,
      descricao: item.description,
      cat: item.category,
      subcat: item.subcategory || null,
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
      subcategory: row.subcategory || row.subcat || null,
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

  function handleCloudError(error) {
    state.isSyncing = false;
    renderCloudStatus();
    deps.notify(error.message || "Erro ao sincronizar Supabase.");
  }

  async function hasV2Schema() {
    const { error } = await state.supabaseClient
      .from("transactions_v2")
      .select("id")
      .limit(1);
    if (!error) return true;
    if (isMissingRelationError(error)) return false;
    throw error;
  }

  function fromV2Transaction(row, refs) {
    const category = refs.categoryById.get(row.category_id);
    const tag = refs.tagById.get(row.category_tag_id);
    const account = refs.accountById.get(row.account_id);

    return {
      id: row.id,
      type: row.transaction_kind,
      description: row.description || "",
      category: category?.slug || "outros",
      subcategory: tag?.slug || null,
      account: account?.name || "Conta corrente",
      amount: Number(row.amount || 0),
      date: row.transaction_date,
      dueDate: row.due_date || row.transaction_date,
      status: row.status || "paid",
      paymentMethod: row.payment_method || "pix",
      creditCardId: row.credit_card_id || null,
      recurrenceId: row.recurring_rule_id || null,
      installmentGroup: row.installment_group_id || null,
      installmentNumber: row.installment_number || null,
      installmentTotal: row.installment_total || null,
      createdAt: row.created_at || new Date().toISOString(),
    };
  }

  async function pullFromSupabaseV2(options = {}) {
    const client = state.supabaseClient;
    const userId = state.currentUser.id;
    const [
      accountsResult,
      cardsResult,
      categoriesResult,
      tagsResult,
      budgetsResult,
      goalsResult,
      transactionsResult,
      legacyTransactionsResult,
    ] = await Promise.all([
      client.from("accounts").select("*").eq("user_id", userId).eq("is_archived", false).order("created_at", { ascending: true }),
      client.from("credit_cards").select("*").eq("user_id", userId).eq("is_archived", false).order("created_at", { ascending: true }),
      client.from("categories").select("*").eq("user_id", userId).eq("is_archived", false).order("created_at", { ascending: true }),
      client.from("category_tags").select("*").eq("user_id", userId).eq("is_archived", false).order("created_at", { ascending: true }),
      client.from("budgets").select("*").eq("user_id", userId).order("created_at", { ascending: true }),
      client.from("goals").select("*").eq("user_id", userId).eq("is_archived", false).order("created_at", { ascending: true }),
      client.from("transactions_v2").select("*").eq("user_id", userId).order("created_at", { ascending: true }),
      client.from("transactions").select("id,cat,subcat,type").eq("user_id", userId),
    ]);

    const firstError = [
      accountsResult.error,
      cardsResult.error,
      categoriesResult.error,
      tagsResult.error,
      budgetsResult.error,
      goalsResult.error,
      transactionsResult.error,
      legacyTransactionsResult.error && !isMissingRelationError(legacyTransactionsResult.error) ? legacyTransactionsResult.error : null,
    ].find(Boolean);
    if (firstError) return handleCloudError(firstError);

    const accounts = accountsResult.data || [];
    const creditCards = cardsResult.data || [];
    const categories = categoriesResult.data || [];
    const categoryTags = tagsResult.data || [];
    const budgets = budgetsResult.data || [];
    const goals = goalsResult.data || [];
    const txRows = transactionsResult.data || [];
    const legacyRows = legacyTransactionsResult.data || [];

    if (options.silent && !txRows.length && !categories.length && state.transactions.length) {
      renderCloudStatus();
      return;
    }

    const refs = {
      accountById: new Map(accounts.map((item) => [item.id, item])),
      categoryById: new Map(categories.map((item) => [item.id, item])),
      tagById: new Map(categoryTags.map((item) => [item.id, item])),
    };

    state.catalog = ensureCatalogCoversTransactions(
      buildCatalogFromV2({ accounts, creditCards, categories, categoryTags, budgets, goals }),
      legacyRows
    );
    state.dataMode = "v2";
    deps.syncSettingsFromCatalog();
    const legacyById = new Map(legacyRows.map((item) => [item.id, item]));
    state.transactions = txRows.map((row) => fromV2Transaction(row, refs));
    state.transactions.forEach((item) => {
      const legacy = legacyById.get(item.id);
      if (!legacy) return;
      if ((item.category === "outros" || !item.category) && legacy.cat) item.category = legacy.cat;
      if (!item.subcategory && legacy.subcat) item.subcategory = legacy.subcat;
      if (!item.type && legacy.type) item.type = legacy.type;
    });
    deps.save();
    deps.updateCategoryOptions();
    deps.updateAccountOptions();
    deps.updateCreditCardOptions();
    deps.renderAll();
    renderCloudStatus();
    if (!options.silent) deps.notify("Dados baixados do Supabase.");
  }

  async function syncSettingsToV2(userId) {
    const client = state.supabaseClient;
    const catalog = ensureCatalogCoversTransactions(
      state.catalog || deps.hydrateCatalog(state.settings, state.catalog),
      state.transactions
    );
    state.catalog = catalog;

    const accountRows = catalog.accounts.map((account) => ({
      user_id: userId,
      name: account.name,
      kind: account.kind || inferAccountKind(account.name),
      color: account.color || "#0b7285",
      is_archived: false,
      updated_at: new Date().toISOString(),
    }));
    if (accountRows.length) {
      const { error } = await client.from("accounts").upsert(accountRows, { onConflict: "user_id,name" });
      if (error) throw error;
    }

    const { data: existingAccounts, error: accountsFetchError } = await client
      .from("accounts")
      .select("id,name,is_archived")
      .eq("user_id", userId);
    if (accountsFetchError) throw accountsFetchError;

    const activeAccountNames = new Set(catalog.accounts.map((item) => item.name.toLowerCase()));
    const staleAccountIds = (existingAccounts || [])
      .filter((item) => !activeAccountNames.has(String(item.name).toLowerCase()))
      .map((item) => item.id);
    if (staleAccountIds.length) {
      const { error } = await client.from("accounts").update({ is_archived: true, updated_at: new Date().toISOString() }).in("id", staleAccountIds);
      if (error) throw error;
    }

    const categoryRows = catalog.categories.map((item) => ({
        user_id: userId,
        kind: item.kind,
        slug: item.slug,
        name: item.name,
        color: item.color || "#667085",
        monthly_limit: item.kind === "expense" ? Number(item.monthlyLimit || 0) : null,
        is_archived: false,
        updated_at: new Date().toISOString(),
      }));
    if (categoryRows.length) {
      const { error } = await client.from("categories").upsert(categoryRows, { onConflict: "user_id,kind,slug" });
      if (error) throw error;
    }

    const { data: existingCategories, error: categoriesFetchError } = await client
      .from("categories")
      .select("id,kind,slug")
      .eq("user_id", userId);
    if (categoriesFetchError) throw categoriesFetchError;

    const activeCategoryKeys = new Set(categoryRows.map((item) => `${item.kind}:${item.slug}`));
    const staleCategoryIds = (existingCategories || [])
      .filter((item) => !activeCategoryKeys.has(`${item.kind}:${item.slug}`))
      .map((item) => item.id);
    if (staleCategoryIds.length) {
      const { error } = await client.from("categories").update({ is_archived: true, updated_at: new Date().toISOString() }).in("id", staleCategoryIds);
      if (error) throw error;
    }

    const { data: freshCategories, error: freshCategoriesError } = await client
      .from("categories")
      .select("id,kind,slug,color")
      .eq("user_id", userId)
      .eq("is_archived", false);
    if (freshCategoriesError) throw freshCategoriesError;
    const categoryKeyToId = new Map((freshCategories || []).map((item) => [`${item.kind}:${item.slug}`, item]));

    const tagRows = catalog.tags.flatMap((item) => {
      const category = categoryKeyToId.get(`${item.kind}:${item.categorySlug}`);
      if (!category) return [];
      return [{
        user_id: userId,
        category_id: category.id,
        slug: item.slug,
        name: item.name,
        color: item.color || category.color || "#667085",
        is_archived: false,
        updated_at: new Date().toISOString(),
      }];
    });
    if (tagRows.length) {
      const { error } = await client.from("category_tags").upsert(tagRows, { onConflict: "user_id,category_id,slug" });
      if (error) throw error;
    }

    const { data: existingTags, error: tagsFetchError } = await client
      .from("category_tags")
      .select("id,category_id,slug")
      .eq("user_id", userId);
    if (tagsFetchError) throw tagsFetchError;
    const activeTagKeys = new Set(tagRows.map((item) => `${item.category_id}:${item.slug}`));
    const staleTagIds = (existingTags || [])
      .filter((item) => !activeTagKeys.has(`${item.category_id}:${item.slug}`))
      .map((item) => item.id);
    if (staleTagIds.length) {
      const { error } = await client.from("category_tags").update({ is_archived: true, updated_at: new Date().toISOString() }).in("id", staleTagIds);
      if (error) throw error;
    }

    const creditCardRows = catalog.creditCards.map((card) => ({
      id: card.id,
      user_id: userId,
      name: card.name,
      color: card.color || "#635bff",
      closing_day: Number(card.closingDay || 25),
      due_day: Number(card.dueDay || 10),
      is_archived: false,
      updated_at: new Date().toISOString(),
    }));
    if (creditCardRows.length) {
      const { error } = await client.from("credit_cards").upsert(creditCardRows, { onConflict: "id" });
      if (error) throw error;
    }

    const activeCardIds = new Set(catalog.creditCards.map((item) => item.id));
    const { data: existingCards, error: cardsFetchError } = await client
      .from("credit_cards")
      .select("id")
      .eq("user_id", userId);
    if (cardsFetchError) throw cardsFetchError;
    const staleCardIds = (existingCards || []).map((item) => item.id).filter((id) => !activeCardIds.has(id));
    if (staleCardIds.length) {
      const { error } = await client.from("credit_cards").update({ is_archived: true, updated_at: new Date().toISOString() }).in("id", staleCardIds);
      if (error) throw error;
    }

    const budgetRows = catalog.budgets.flatMap((item) => {
      const category = categoryKeyToId.get(`expense:${item.categorySlug}`);
      if (!category) return [];
      return [{
        user_id: userId,
        category_id: category.id,
        period_kind: item.periodKind,
        amount: Number(item.amount || 0),
        starts_on: new Date().toISOString().slice(0, 10),
        updated_at: new Date().toISOString(),
      }];
    });
    const { error: deleteBudgetsError } = await client.from("budgets").delete().eq("user_id", userId);
    if (deleteBudgetsError) throw deleteBudgetsError;
    if (budgetRows.length) {
      const { error } = await client.from("budgets").insert(budgetRows);
      if (error) throw error;
    }

    const goalRows = catalog.goals.map((goal) => ({
      user_id: userId,
      name: goal.name,
      target_amount: Number(goal.target || 0),
      current_amount: Number(goal.currentAmount || 0),
      linked_category_id: categoryKeyToId.get(`investment:${goal.key}`)?.id || null,
      color: goal.color || "#635bff",
      updated_at: new Date().toISOString(),
    }));
    const { error: deleteGoalsError } = await client.from("goals").delete().eq("user_id", userId);
    if (deleteGoalsError) throw deleteGoalsError;
    if (goalRows.length) {
      const { error } = await client.from("goals").insert(goalRows);
      if (error) throw error;
    }

    return {
      accounts: new Map((existingAccounts || []).map((item) => [item.name.toLowerCase(), item.id])),
      categories: categoryKeyToId,
      tags: new Map(tagRows.map((item) => [`${item.category_id}:${item.slug}`, item])),
    };
  }

  async function syncTransactionsToV2(userId, refs) {
    const client = state.supabaseClient;
    const categoryRecords = refs.categories;
    const accountNameToId = refs.accounts;

    const { data: currentTags, error: currentTagsError } = await client
      .from("category_tags")
      .select("id,category_id,slug")
      .eq("user_id", userId)
      .eq("is_archived", false);
    if (currentTagsError) throw currentTagsError;
    const tagKeyToId = new Map((currentTags || []).map((item) => [`${item.category_id}:${item.slug}`, item.id]));

    const rows = state.transactions.map((item) => {
      const category = categoryRecords.get(`${item.type}:${item.category}`);
      const categoryId = category?.id || null;
      const categoryTagId = categoryId && item.subcategory ? tagKeyToId.get(`${categoryId}:${item.subcategory}`) || null : null;
      return {
        id: item.id,
        user_id: userId,
        transaction_kind: item.type,
        status: item.status || "paid",
        description: item.description,
        amount: Number(item.amount),
        transaction_date: item.date,
        due_date: item.dueDate || item.date,
        category_id: categoryId,
        category_tag_id: categoryTagId,
        account_id: accountNameToId.get(String(item.account || "Conta corrente").toLowerCase()) || null,
        credit_card_id: item.creditCardId || null,
        payment_method: item.paymentMethod || "pix",
        recurring_rule_id: item.recurrenceId || null,
        installment_group_id: item.installmentGroup || null,
        installment_number: item.installmentNumber || null,
        installment_total: item.installmentTotal || null,
        created_at: item.createdAt || new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
    });

    if (rows.length) {
      const { error } = await client.from("transactions_v2").upsert(rows, { onConflict: "id" });
      if (error) throw error;
    }

    const { data: remoteRows, error: remoteRowsError } = await client
      .from("transactions_v2")
      .select("id")
      .eq("user_id", userId);
    if (remoteRowsError) throw remoteRowsError;

    const localIds = new Set(state.transactions.map((item) => item.id));
    const idsToDelete = (remoteRows || []).map((item) => item.id).filter((id) => !localIds.has(id));
    if (idsToDelete.length) {
      const { error } = await client.from("transactions_v2").delete().eq("user_id", userId).in("id", idsToDelete);
      if (error) throw error;
    }
  }

  async function syncToSupabase() {
    if (!state.currentUser || !state.supabaseClient || state.isSyncing) return;
    state.isSyncing = true;
    renderCloudStatus("Salvando...");

    const client = state.supabaseClient;
    const userId = state.currentUser.id;
    const supportsV2 = await hasV2Schema().catch((error) => {
      handleCloudError(error);
      return false;
    });

    if (supportsV2) {
      try {
        deps.syncSettingsFromCatalog();
        const refs = await syncSettingsToV2(userId);
        await syncTransactionsToV2(userId, refs);
      } catch (error) {
        handleCloudError(error);
        return;
      }
    }

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

    const supportsV2 = await hasV2Schema().catch((error) => {
      handleCloudError(error);
      return false;
    });
    if (supportsV2) {
      await pullFromSupabaseV2(options);
      return;
    }

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

    if (options.silent && !txRows?.length && state.transactions.length) {
      renderCloudStatus();
      return;
    }

    state.transactions = (txRows || []).map(fromRemoteTransaction);
    if (settingsRow?.settings) {
      state.settings = deps.mergeSettings(settingsRow.settings);
      deps.hydrateCatalog(state.settings, state.catalog);
      state.dataMode = "legacy";
    }
    deps.save();
    deps.updateCategoryOptions();
    deps.updateAccountOptions();
    deps.updateCreditCardOptions();
    deps.renderAll();
    renderCloudStatus();
    if (!options.silent) deps.notify("Dados baixados do Supabase.");
  }

  async function initSupabase() {
    if (state.supabaseClient) return true;

    if (!window.supabase) {
      renderCloudStatus("Supabase indisponivel");
      deps.renderAuthGate("Nao foi possivel conectar agora. Tente novamente em instantes.");
      return false;
    }

    const config = await loadSupabaseConfig();
    if (!config?.url || !config?.anonKey) {
      renderCloudStatus("Configure o deploy");
      deps.renderAuthGate("Nao foi possivel conectar agora. Tente novamente em instantes.");
      return false;
    }

    state.supabaseClient = window.supabase.createClient(config.url, config.anonKey);
    state.cloudReady = true;

    state.isPasswordRecovery = getAuthHashType() === "recovery";
    if (state.isPasswordRecovery) {
      deps.showAuthView("update-password");
      deps.renderAuthGate("Defina sua nova senha para continuar.");
    }

    const { data } = await state.supabaseClient.auth.getSession();
    if (data.session?.user && !deps.isEmailConfirmed(data.session.user)) {
      await state.supabaseClient.auth.signOut();
      state.currentUser = null;
      deps.renderAuthGate("Confirme seu e-mail antes de entrar.");
      renderCloudStatus();
    } else {
      state.currentUser = data.session?.user || null;
      if (state.isPasswordRecovery) {
        state.currentUser = null;
        deps.renderAuthGate("Defina sua nova senha para continuar.");
        renderCloudStatus();
        return true;
      }
      deps.renderAuthGate();
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
        deps.showAuthView("update-password");
        deps.renderAuthGate("Defina sua nova senha para continuar.");
        renderCloudStatus();
        return;
      }
      if (session?.user && !deps.isEmailConfirmed(session.user)) {
        await state.supabaseClient.auth.signOut();
        state.currentUser = null;
        deps.renderAuthGate("Confirme seu e-mail antes de entrar.");
        renderCloudStatus();
        return;
      }
      if (state.isPasswordRecovery) {
        state.currentUser = null;
        deps.showAuthView("update-password");
        deps.renderAuthGate("Defina sua nova senha para continuar.");
        renderCloudStatus();
        return;
      }
      state.currentUser = session?.user || null;
      deps.renderAuthGate();
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
      deps.notify("Conexao com Supabase indisponivel. Atualize a pagina.");
      return false;
    }
    return true;
  }

  return {
    loadSupabaseConfig,
    renderCloudStatus,
    requireCloudUser,
    saveUserProfileFromMetadata,
    toRemoteTransaction,
    fromRemoteTransaction,
    normalizeRemoteDate,
    handleCloudError,
    syncToSupabase,
    pullFromSupabase,
    initSupabase,
    ensureSupabaseReady,
  };
}
