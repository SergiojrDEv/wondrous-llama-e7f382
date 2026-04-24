import { SUPABASE_FALLBACK_CONFIG, state } from "../core/state.js";

export function createSupabaseModule(deps) {
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

    if (options.silent && !txRows?.length && state.transactions.length) {
      renderCloudStatus();
      return;
    }

    state.transactions = (txRows || []).map(fromRemoteTransaction);
    if (settingsRow?.settings) state.settings = deps.mergeSettings(settingsRow.settings);
    deps.save();
    deps.updateCategoryOptions();
    deps.updateAccountOptions();
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
