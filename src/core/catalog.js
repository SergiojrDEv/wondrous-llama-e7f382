function localId(prefix, ...parts) {
  return `${prefix}:${parts.map((part) => String(part || "").toLowerCase()).join(":")}`;
}

export function humanizeSlug(value) {
  return String(value || "")
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ") || "Outros";
}

function inferAccountKind(name) {
  const lower = String(name || "").toLowerCase();
  if (lower.includes("cartao")) return "credit_card";
  if (lower.includes("corretora")) return "investment";
  if (lower.includes("carteira")) return "wallet";
  if (lower.includes("poupanca")) return "savings";
  return "checking";
}

export function buildCatalogFromSettings(settings = {}, existingCatalog = {}) {
  const previousAccounts = new Map((existingCatalog.accounts || []).map((item) => [String(item.name || "").toLowerCase(), item]));
  const previousCards = new Map((existingCatalog.creditCards || []).map((item) => [item.id || String(item.name || "").toLowerCase(), item]));
  const previousCategories = new Map((existingCatalog.categories || []).map((item) => [`${item.kind}:${item.slug}`, item]));
  const previousTags = new Map((existingCatalog.tags || []).map((item) => [`${item.kind}:${item.categorySlug}:${item.slug}`, item]));
  const previousBudgets = new Map((existingCatalog.budgets || []).map((item) => [`${item.categorySlug}:${item.periodKind}`, item]));
  const previousGoals = new Map((existingCatalog.goals || []).map((item) => [`${item.key}:${String(item.name || "").toLowerCase()}`, item]));

  const accounts = (settings.accounts || []).map((name) => {
    const previous = previousAccounts.get(String(name || "").toLowerCase());
    return {
      id: previous?.id || localId("account", name),
      name,
      kind: previous?.kind || inferAccountKind(name),
      color: previous?.color || "#0b7285",
      institution: previous?.institution || "",
      isArchived: false,
    };
  });

  const creditCards = (settings.creditCards || []).map((card) => {
    const previous = previousCards.get(card.id) || previousCards.get(String(card.name || "").toLowerCase());
    return {
      id: previous?.id || card.id || localId("card", card.name),
      name: card.name,
      closingDay: Number(card.closingDay || 25),
      dueDay: Number(card.dueDay || 10),
      color: previous?.color || card.color || "#635bff",
      accountId: previous?.accountId || null,
      brand: previous?.brand || "",
      isArchived: false,
    };
  });

  const categories = Object.entries(settings.categories || {}).flatMap(([kind, items]) =>
    (items || []).map(([slug, name, color, monthlyLimit]) => {
      const previous = previousCategories.get(`${kind}:${slug}`);
      return {
        id: previous?.id || localId("category", kind, slug),
        kind,
        slug,
        name,
        color: color || previous?.color || "#667085",
        monthlyLimit: kind === "expense" ? Number(monthlyLimit || 0) : null,
        isArchived: false,
      };
    })
  );

  const tags = Object.entries(settings.subcategories || {}).flatMap(([kind, categoryGroups]) =>
    Object.entries(categoryGroups || {}).flatMap(([categorySlug, items]) =>
      (items || []).map(([slug, name, color]) => {
        const previous = previousTags.get(`${kind}:${categorySlug}:${slug}`);
        return {
          id: previous?.id || localId("tag", kind, categorySlug, slug),
          kind,
          categorySlug,
          slug,
          name,
          color: color || previous?.color || "#667085",
          isArchived: false,
        };
      })
    )
  );

  const budgets = Object.entries(settings.budgetRules || {}).flatMap(([categorySlug, values]) => ([
    {
      id: previousBudgets.get(`${categorySlug}:weekly`)?.id || localId("budget", categorySlug, "weekly"),
      categorySlug,
      periodKind: "weekly",
      amount: Number(values?.weekly || 0),
    },
    {
      id: previousBudgets.get(`${categorySlug}:monthly`)?.id || localId("budget", categorySlug, "monthly"),
      categorySlug,
      periodKind: "monthly",
      amount: Number(values?.monthly || 0),
    },
  ]));

  const goals = (settings.goals || []).map((goal, index) => {
    const previous = previousGoals.get(`${goal.key}:${String(goal.name || "").toLowerCase()}`);
    return {
      id: previous?.id || localId("goal", goal.key, index, goal.name),
      name: goal.name,
      target: Number(goal.target || 0),
      currentAmount: Number(previous?.currentAmount || 0),
      key: goal.key,
      color: previous?.color || "#635bff",
      isArchived: false,
    };
  });

  return {
    source: existingCatalog.source || "legacy",
    accounts,
    creditCards,
    categories,
    tags,
    budgets,
    goals,
  };
}

export function buildSettingsFromCatalog(catalog = {}) {
  const groupedCategories = { expense: [], income: [], investment: [] };
  (catalog.categories || []).forEach((item) => {
    const row = [item.slug, item.name, item.color || "#667085"];
    if (item.kind === "expense") row.push(Number(item.monthlyLimit || 0));
    groupedCategories[item.kind] ||= [];
    groupedCategories[item.kind].push(row);
  });

  const groupedTags = { expense: {}, income: {}, investment: {} };
  (catalog.tags || []).forEach((item) => {
    groupedTags[item.kind] ||= {};
    groupedTags[item.kind][item.categorySlug] ||= [];
    groupedTags[item.kind][item.categorySlug].push([item.slug, item.name, item.color || "#667085"]);
  });

  const budgetRules = {};
  (catalog.budgets || []).forEach((item) => {
    budgetRules[item.categorySlug] ||= { weekly: 0, monthly: 0 };
    budgetRules[item.categorySlug][item.periodKind] = Number(item.amount || 0);
  });

  return {
    accounts: (catalog.accounts || []).map((item) => item.name),
    creditCards: (catalog.creditCards || []).map((item) => ({
      id: item.id,
      name: item.name,
      closingDay: Number(item.closingDay || 25),
      dueDay: Number(item.dueDay || 10),
      color: item.color || "#635bff",
    })),
    categories: groupedCategories,
    subcategories: groupedTags,
    goals: (catalog.goals || []).map((item) => ({
      name: item.name,
      target: Number(item.target || 0),
      key: item.key,
    })),
    budgetRules,
  };
}

export function buildCatalogFromV2({ accounts, creditCards, categories, categoryTags, budgets, goals }) {
  const categoryById = new Map((categories || []).map((item) => [item.id, item]));

  return {
    source: "v2",
    accounts: (accounts || []).map((item) => ({
      id: item.id,
      name: item.name,
      kind: item.kind,
      color: item.color || "#0b7285",
      institution: item.institution || "",
      isArchived: Boolean(item.is_archived),
    })),
    creditCards: (creditCards || []).map((item) => ({
      id: item.id,
      name: item.name,
      closingDay: Number(item.closing_day || 25),
      dueDay: Number(item.due_day || 10),
      color: item.color || "#635bff",
      accountId: item.account_id || null,
      brand: item.brand || "",
      isArchived: Boolean(item.is_archived),
    })),
    categories: (categories || []).map((item) => ({
      id: item.id,
      kind: item.kind,
      slug: item.slug,
      name: item.name,
      color: item.color || "#667085",
      monthlyLimit: item.kind === "expense" ? Number(item.monthly_limit || 0) : null,
      isArchived: Boolean(item.is_archived),
    })),
    tags: (categoryTags || []).map((item) => ({
      id: item.id,
      kind: categoryById.get(item.category_id)?.kind || "expense",
      categorySlug: categoryById.get(item.category_id)?.slug || "",
      slug: item.slug,
      name: item.name,
      color: item.color || "#667085",
      isArchived: Boolean(item.is_archived),
    })),
    budgets: (budgets || []).map((item) => ({
      id: item.id,
      categorySlug: categoryById.get(item.category_id)?.slug || "",
      periodKind: item.period_kind,
      amount: Number(item.amount || 0),
    })),
    goals: (goals || []).map((item) => ({
      id: item.id,
      name: item.name,
      target: Number(item.target_amount || 0),
      currentAmount: Number(item.current_amount || 0),
      key: categoryById.get(item.linked_category_id)?.slug || "renda-fixa",
      color: item.color || "#635bff",
      isArchived: Boolean(item.is_archived),
    })),
  };
}

export function ensureCatalogCoversTransactions(catalog, transactions = []) {
  const nextCatalog = catalog || { accounts: [], creditCards: [], categories: [], tags: [], budgets: [], goals: [] };
  transactions.forEach((item) => {
    const kind = item.type || item.transaction_kind || "expense";
    const categorySlug = item.category || item.cat;
    if (!categorySlug) return;

    const hasCategory = nextCatalog.categories.some((category) => category.kind === kind && category.slug === categorySlug && !category.isArchived);
    if (!hasCategory) {
      nextCatalog.categories.push({
        id: localId("category", kind, categorySlug),
        kind,
        slug: categorySlug,
        name: humanizeSlug(categorySlug),
        color: "#667085",
        monthlyLimit: kind === "expense" ? 0 : null,
        isArchived: false,
      });
    }

    const tagSlug = item.subcategory || item.subcat;
    if (!tagSlug) return;
    const hasTag = nextCatalog.tags.some((tag) => tag.kind === kind && tag.categorySlug === categorySlug && tag.slug === tagSlug && !tag.isArchived);
    if (!hasTag) {
      nextCatalog.tags.push({
        id: localId("tag", kind, categorySlug, tagSlug),
        kind,
        categorySlug,
        slug: tagSlug,
        name: humanizeSlug(tagSlug),
        color: "#667085",
        isArchived: false,
      });
    }
  });

  return nextCatalog;
}
