import { state } from "../core/state.js";
import {
  categoryDisplayLabel,
  esc,
  getBudgetRule,
  getCategory,
  getMonthTransactions,
  money,
  monthKey,
  parseLocalDate,
  paymentMethodLabel,
  toDateInput,
} from "../core/utils.js";

export function createDashboardModule(deps) {
  function renderMonthLabel() {
    deps.els.currentMonth.textContent = state.currentDate.toLocaleDateString("pt-BR", {
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
    const hasTransactions = transactions.length > 0;
    let health = 0;
    if (totals.income) {
      const commitmentGap = commitment - 100;
      const healthyHeadroom = Math.max(0, 100 - commitment);
      health = 58 + Math.min(22, healthyHeadroom * 0.3) + Math.min(12, investRate * 0.45);
      if (commitment > 78) health -= (commitment - 78) * 0.45;
      if (commitment > 92) health -= (commitment - 92) * 0.4;
      if (commitmentGap > 0) health -= Math.min(18, commitmentGap * 0.42);
      if (free >= 0) {
        health += Math.min(8, free / Math.max(180, totals.income * 0.05));
      } else {
        const negativeRatio = Math.abs(free) / Math.max(1, totals.income);
        health -= Math.min(16, negativeRatio * 42);
      }
      health = Math.max(commitmentGap > 0 ? 12 : 18, Math.min(96, health));
    } else if (hasTransactions) {
      health = Math.max(
        12,
        Math.min(58, totals.investment > 0 ? 36 + Math.min(22, totals.investment / 100) : 18 - Math.min(8, totals.expense / 500))
      );
    }

    document.querySelector("#income-total").textContent = money(totals.income);
    document.querySelector("#expense-total").textContent = money(totals.expense);
    document.querySelector("#invest-total").textContent = money(totals.investment);
    document.querySelector("#free-balance").textContent = money(free);
    document.querySelector("#income-count").textContent = `${transactions.filter((item) => item.type === "income").length} lancamentos`;
    document.querySelector("#expense-count").textContent = `${expenseCategories.size} categorias`;
    document.querySelector("#invest-rate").textContent = `${investRate.toFixed(1)}% da receita direcionado para investimento`;
    document.querySelector("#commitment-rate").textContent = `${commitment.toFixed(1)}% da receita ja foi comprometida`;
    document.querySelector("#health-score").textContent = `${Math.round(health)}%`;
    document.querySelector("#health-copy").textContent =
      !hasTransactions
        ? "Adicione receitas, despesas e investimentos para medir o saldo disponivel do mes."
        : !totals.income
          ? "Ja da para ler os movimentos do mes, mas registrar receitas deixa o saldo disponivel mais preciso."
          : free < 0
            ? `Mes no vermelho: depois de despesas e investimentos, faltam ${money(Math.abs(free))} para o disponivel imediato fechar positivo.`
            : health >= 70
              ? "Bom equilibrio entre gastos, reserva e disponivel para movimentacao."
              : "Revise os maiores gastos e proteja o valor ainda disponivel para movimentacao.";
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
    let copy = "Registre receitas, despesas e investimentos para entender o que ainda fica disponivel para movimentacao imediata.";
    if (transactions.length) {
      if (free < 0) {
        title = "Atencao ao saldo do mes";
        copy = `No ritmo atual, o mes fecha com ${money(Math.abs(free))} a menos no disponivel imediato. Revise gastos pendentes e categorias acima do limite.`;
      } else if (commitment > 80) {
        title = "Mes apertado, mas ainda controlavel";
        copy = `Voce ainda tem ${money(free)} disponivel para movimentacao e pode usar cerca de ${money(dailySafe)} por dia ate o fim do mes.`;
      } else {
        title = "Seu mes esta sob controle";
        copy = `Voce tem ${money(free)} disponivel para movimentacao, comprometeu ${commitment.toFixed(1)}% da receita e direcionou ${investRate.toFixed(1)}% para investimento.`;
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
      const threshold = Number(getBudgetRule(key).monthly || limit || 0);
      if (!threshold) return;
      const used = transactions
        .filter((item) => item.type === "expense" && item.category === key)
        .reduce((sum, item) => sum + Number(item.amount), 0);
      if (used >= threshold * 0.8) {
        insights.push({
          label: used > threshold ? "Orcamento estourado" : "Perto do limite",
          text: `${label}: ${money(used)} de ${money(threshold)}`,
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
    const totalIncome = monthTransactions
      .filter((item) => item.type === "income")
      .reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const totalOutflow = monthTransactions
      .filter((item) => item.type !== "income")
      .reduce((sum, item) => sum + Number(item.amount || 0), 0);

    target.innerHTML = `
      <article class="mini-stat-card">
        <span>No mes</span>
        <strong>${monthTransactions.length} lancamentos</strong>
        <small>Entradas: ${money(totalIncome)}</small>
        <small>Saidas: ${money(totalOutflow)}</small>
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

  function renderBudgets() {
    const expenses = getMonthTransactions().filter((item) => item.type === "expense");
    const target = document.querySelector("#budget-list");
    const today = new Date();
    const referenceDate = monthKey(state.currentDate) === monthKey(today)
      ? today
      : new Date(state.currentDate.getFullYear(), state.currentDate.getMonth(), 1);
    const weekday = (referenceDate.getDay() + 6) % 7;
    const weekStart = new Date(referenceDate);
    weekStart.setDate(referenceDate.getDate() - weekday);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    const weekStartKey = toDateInput(weekStart);
    const weekEndKey = toDateInput(weekEnd);
    target.innerHTML = state.settings.categories.expense
      .map(([key, label, color]) => {
        const rule = getBudgetRule(key);
        const monthlyUsed = expenses
          .filter((item) => item.category === key)
          .reduce((sum, item) => sum + Number(item.amount), 0);
        const weeklyUsed = expenses
          .filter((item) => item.category === key && item.date >= weekStartKey && item.date <= weekEndKey)
          .reduce((sum, item) => sum + Number(item.amount), 0);
        const monthlyPct = rule.monthly ? Math.min((monthlyUsed / rule.monthly) * 100, 100) : 0;
        const weeklyPct = rule.weekly ? Math.min((weeklyUsed / rule.weekly) * 100, 100) : 0;
        const weeklyStatus = weeklyPct >= 100 ? "Limite semanal" : `${weeklyPct.toFixed(0)}%`;
        const monthlyStatus = monthlyPct >= 100 ? "Limite mensal" : `${monthlyPct.toFixed(0)}%`;
        return `
          <article class="budget-card">
            <header class="budget-card-header">
              <strong>${esc(label)}</strong>
              <div class="budget-badges">
                <span class="budget-badge">Sem ${weeklyStatus}</span>
                <span class="budget-badge">Mes ${monthlyStatus}</span>
              </div>
            </header>
            <div class="budget-meter">
              <div class="budget-meter-head">
                <span>Semana</span>
                <small>${money(weeklyUsed)} de ${money(rule.weekly)}</small>
              </div>
              <div class="bar"><span style="--value:${weeklyPct}%;--color:${color}"></span></div>
            </div>
            <div class="budget-meter">
              <div class="budget-meter-head">
                <span>Mes</span>
                <small>${money(monthlyUsed)} de ${money(rule.monthly)}</small>
              </div>
              <div class="bar"><span style="--value:${monthlyPct}%;--color:${color}"></span></div>
            </div>
            <form class="budget-rule-form compact" data-budget-key="${esc(key)}">
              <label>
                Semanal
                <input type="number" min="0" step="0.01" name="weekly" value="${Number(rule.weekly || 0)}">
              </label>
              <label>
                Mensal
                <input type="number" min="0" step="0.01" name="monthly" value="${Number(rule.monthly || 0)}">
              </label>
              <button class="mini-btn" type="submit">Salvar regra</button>
            </form>
          </article>
        `;
      })
      .join("");
  }

  function renderDailyHistory() {
    const target = document.querySelector("#daily-history-list");
    if (!target) return;

    const grouped = new Map();
    getMonthTransactions()
      .slice()
      .sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt || "").localeCompare(a.createdAt || ""))
      .forEach((item) => {
        grouped.set(item.date, [...(grouped.get(item.date) || []), item]);
      });

    if (!grouped.size) {
      target.innerHTML = '<div class="empty-state">Nenhum lancamento registrado neste mes ainda.</div>';
      return;
    }

    target.innerHTML = Array.from(grouped.entries())
      .map(([date, items]) => {
        const income = items
          .filter((item) => item.type === "income")
          .reduce((sum, item) => sum + Number(item.amount || 0), 0);
        const outflow = items
          .filter((item) => item.type !== "income")
          .reduce((sum, item) => sum + Number(item.amount || 0), 0);
        return `
          <article class="history-day-card">
            <header class="history-day-header">
              <div>
                <strong>${parseLocalDate(date).toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" })}</strong>
                <small>${items.length} lancamento${items.length === 1 ? "" : "s"}</small>
              </div>
              <div class="history-day-totals">
                <small>Entradas: <span class="money positive">${money(income)}</span></small>
                <small>Saidas: <span class="money negative">${money(outflow)}</span></small>
              </div>
            </header>
            <div class="history-day-items">
              ${items.map((item) => `
                <div class="history-row">
                  <div>
                    <strong>${esc(item.description)}</strong>
                    <small>${esc(categoryDisplayLabel(item))} | ${esc(paymentMethodLabel(item.paymentMethod))}</small>
                  </div>
                  <strong class="money ${item.type === "income" ? "positive" : "negative"}">${item.type === "income" ? "+" : "-"} ${money(Number(item.amount || 0))}</strong>
                </div>
              `).join("")}
            </div>
          </article>
        `;
      })
      .join("");
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
    deps.renderTable();
    renderBudgets();
    renderDailyHistory();
    deps.renderGoalsSummary();
    deps.renderGoals();
    deps.renderSettings();
    renderChart();
  }

  return {
    renderMonthLabel,
    summarize,
    renderSummary,
    renderSmartDashboard,
    renderInsights,
    renderCategoryBreakdown,
    renderTransactionHighlights,
    renderBudgets,
    renderDailyHistory,
    renderChart,
    renderAll,
  };
}
