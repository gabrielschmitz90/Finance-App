// script.js — transações, edição, painel de investimentos, export CSV, QR e gráficos
(() => {
  const STORAGE_KEY = 'transactions_v1';
  const CATEGORIES_KEY = 'categories_v1';
  const GOAL_KEY = 'invest_goal_v1';
  const INV = 'investimento';
  const RES = 'resgate';

  // Tipos de investimento (chave salva em tx.assetType)
  const ASSET_TYPES = {
    renda_fixa: 'Renda fixa',
    tesouro: 'Tesouro Direto',
    acoes: 'Ações',
    fiis: 'Fundos imobiliários',
    cripto: 'Criptomoedas',
    reserva: 'Reserva de emergência',
    outros: 'Outros / não classificado'
  };

  const $ = (id) => document.getElementById(id);

  // Seletores — transações
  const form = $('transaction-form');
  const textInput = $('text');
  const amountInput = $('amount');
  const dateInput = $('date-input');
  const categorySelect = $('category-select');
  const paymentSelect = $('payment-method');
  const listEl = $('transaction-list');
  const totalIncomeEl = $('total-income');
  const totalExpenseEl = $('total-expense');
  const balanceEl = $('current-balance');
  const totalInvestedEl = $('total-invested');
  const qrContainer = $('qr-container');

  // Seletores — investimentos
  const investForm = $('invest-form');
  const invAmount = $('inv-amount');
  const invType = $('inv-type');
  const invDate = $('inv-date');
  const invDesc = $('inv-desc');
  const invBalanceHint = $('inv-balance-hint');
  const rescueForm = $('rescue-form');
  const resType = $('res-type');
  const resAmount = $('res-amount');
  const resDate = $('res-date');
  const resAllBtn = $('res-all');
  const resSubmit = $('res-submit');
  const resHint = $('res-hint');
  const goalForm = $('goal-form');
  const goalInput = $('goal-input');
  const invList = $('inv-list');

  // Seletores — modal de edição
  const editOverlay = $('edit-overlay');
  const editForm = $('edit-form');
  const editText = $('edit-text');
  const editAmount = $('edit-amount');
  const editAmountLabel = $('edit-amount-label');
  const editDate = $('edit-date');
  const editCategory = $('edit-category');
  const editPayment = $('edit-payment');
  const editRegular = $('edit-regular-fields');
  const editAssetField = $('edit-asset-field');
  const editAsset = $('edit-asset');
  const editCancel = $('edit-cancel');
  const editTitle = $('edit-title');

  // Sidebar / tema
  const sidebar = $('app-sidebar');
  const sidebarOpen = $('sidebar-open');
  const sidebarToggle = $('sidebar-toggle');
  const themeToggle = $('theme-toggle');
  const themeIcon = $('theme-icon');

  let transactions = load();
  let editingId = null;
  let chart = null;
  let allocChart = null;
  let evolChart = null;

  // Rótulos de categoria (a partir do select do formulário)
  const categoryLabels = {};
  Array.from(categorySelect.options).forEach(o => { if (o.value) categoryLabels[o.value] = o.textContent; });
  categoryLabels[INV] = 'Investimento';
  categoryLabels[RES] = 'Resgate';

  // --- Inicialização ---
  const today = () => {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  };

  if (dateInput && !dateInput.value) dateInput.value = today();
  if (invDate) invDate.value = today();
  if (resDate) resDate.value = today();
  initTheme();
  fillAssetSelect(invType);
  fillAssetSelect(editAsset);
  fillEditCategories();

  // reset mensal automático (se o usuário optou)
  try {
    const auto = localStorage.getItem('auto_reset_monthly');
    const last = localStorage.getItem('last_reset_month');
    const now = new Date();
    const thisMonthKey = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
    if (auto === '1' && last !== thisMonthKey) {
      const archiveKey = 'archive_' + (last || thisMonthKey);
      localStorage.setItem(archiveKey, JSON.stringify(transactions));
      localStorage.removeItem(STORAGE_KEY);
      transactions = [];
      localStorage.setItem('last_reset_month', thisMonthKey);
    }
  } catch (e) { /* ignore */ }

  render();
  attachEvents();
  saveCategories();

  function attachEvents() {
    form.addEventListener('submit', onSubmit);
    if (themeToggle) themeToggle.addEventListener('click', toggleTheme);
    if (investForm) investForm.addEventListener('submit', onInvestSubmit);
    if (rescueForm) rescueForm.addEventListener('submit', onRescueSubmit);
    if (resAllBtn) resAllBtn.addEventListener('click', onRescueAll);
    if (goalForm) goalForm.addEventListener('submit', onGoalSubmit);
    if (editForm) editForm.addEventListener('submit', onEditSubmit);
    if (editCancel) editCancel.addEventListener('click', closeEdit);
    if (editOverlay) editOverlay.addEventListener('click', (ev) => { if (ev.target === editOverlay) closeEdit(); });
    document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape' && editOverlay && !editOverlay.hidden) closeEdit(); });
    if (resType) resType.addEventListener('change', renderRescueHint);
  }

  // Salva as categorias para o dashboard listar
  function saveCategories() {
    try {
      const opts = Array.from(categorySelect.options).filter(o => o.value).map(o => ({ value: o.value, label: o.textContent || o.text }));
      localStorage.setItem(CATEGORIES_KEY, JSON.stringify(opts));
    } catch (e) { /* ignore */ }
  }

  // ====================== Transações ======================
  function onSubmit(e) {
    e.preventDefault();
    const text = textInput.value.trim();
    const amount = parseFloat(amountInput.value);
    const date = dateInput.value || today();
    const category = categorySelect.value || 'outros';
    const payment = paymentSelect.value || '';
    if (!text) { alert('Preencha a descrição.'); textInput.focus(); return; }
    if (isNaN(amount)) { alert('Digite um valor válido.'); amountInput.focus(); return; }
    transactions.push({ id: Date.now(), text, amount, date, category, payment });
    save();
    render();
    form.reset();
    if (dateInput) dateInput.value = today();
    if (textInput) textInput.focus();
  }

  function removeTransaction(id) {
    const next = transactions.filter(t => t.id !== id);
    const bad = findNegativeType(next);
    if (bad) {
      showMessage(`Não dá para remover: há resgates em "${ASSET_TYPES[bad]}" que dependem desse aporte.`, 'error', 5000);
      return;
    }
    transactions = next;
    save();
    render();
  }

  function createTxItem(tx) {
    const li = document.createElement('li');

    const textWrap = document.createElement('div');
    textWrap.className = 'text';
    const isInv = isInvTx(tx);
    const badge = isInv ? `<span class="badge ${tx.category === RES ? 'rescue' : ''}">${escapeHtml(ASSET_TYPES[assetOf(tx)])}</span>` : '';
    const meta = [fmtDate(tx.date), categoryLabels[tx.category] || tx.category || 'outros'];
    if (tx.payment) meta.push(tx.payment);
    textWrap.innerHTML = `<strong>${escapeHtml(tx.text)}</strong>${badge}<small>${escapeHtml(meta.join(' • '))}</small>`;

    const amountEl = document.createElement('div');
    amountEl.className = 'amount ' + (tx.amount >= 0 ? 'positive' : 'negative');
    amountEl.textContent = formatCurrency(tx.amount);

    const actions = document.createElement('div');
    actions.className = 'tx-actions';

    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className = 'icon-btn edit';
    editBtn.title = 'Editar transação';
    editBtn.setAttribute('aria-label', 'Editar transação');
    editBtn.innerHTML = svgEdit();
    editBtn.addEventListener('click', () => openEdit(tx.id));

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'icon-btn trash';
    deleteBtn.title = 'Remover transação';
    deleteBtn.setAttribute('aria-label', 'Remover transação');
    deleteBtn.innerHTML = svgTrash();
    deleteBtn.addEventListener('click', () => removeTransaction(tx.id));

    actions.appendChild(editBtn);
    actions.appendChild(deleteBtn);
    li.appendChild(textWrap);
    li.appendChild(amountEl);
    li.appendChild(actions);
    return li;
  }

  function renderList() {
    listEl.innerHTML = '';
    transactions.slice().reverse().forEach(tx => listEl.appendChild(createTxItem(tx)));
  }

  // ====================== Edição ======================
  function fillEditCategories() {
    editCategory.innerHTML = '';
    Array.from(categorySelect.options).filter(o => o.value).forEach(o => {
      const opt = document.createElement('option');
      opt.value = o.value;
      opt.textContent = o.textContent;
      editCategory.appendChild(opt);
    });
  }

  function openEdit(id) {
    const tx = transactions.find(t => t.id === id);
    if (!tx) return;
    editingId = id;
    const isInv = isInvTx(tx);

    editTitle.textContent = isInv
      ? (tx.category === RES ? 'Editar resgate' : 'Editar aporte')
      : 'Editar transação';
    editText.value = tx.text || '';
    editDate.value = tx.date || today();

    if (isInv) {
      editAmount.value = Math.abs(tx.amount);
      editAmountLabel.textContent = 'Valor (sempre positivo):';
      editAmount.min = '0.01';
      editRegular.hidden = true;
      editAssetField.hidden = false;
      editAsset.value = assetOf(tx);
    } else {
      editAmount.value = tx.amount;
      editAmountLabel.innerHTML = 'Valor (positivo = receita, negativo = despesa):';
      editAmount.removeAttribute('min');
      editRegular.hidden = false;
      editAssetField.hidden = true;
      // categoria legada que não está na lista
      const cat = tx.category || 'outros';
      if (!Array.from(editCategory.options).some(o => o.value === cat)) {
        const opt = document.createElement('option');
        opt.value = cat;
        opt.textContent = categoryLabels[cat] || cat;
        editCategory.appendChild(opt);
      }
      editCategory.value = cat;
      editPayment.value = tx.payment || '';
    }

    editOverlay.hidden = false;
    setTimeout(() => { editText.focus(); editText.select(); }, 30);
  }

  function closeEdit() {
    editOverlay.hidden = true;
    editingId = null;
    fillEditCategories(); // remove categorias legadas temporárias
  }

  function onEditSubmit(e) {
    e.preventDefault();
    const tx = transactions.find(t => t.id === editingId);
    if (!tx) { closeEdit(); return; }

    const text = editText.value.trim();
    const amount = parseFloat(editAmount.value);
    const date = editDate.value;
    if (!text) { alert('Preencha a descrição.'); editText.focus(); return; }
    if (isNaN(amount)) { alert('Digite um valor válido.'); editAmount.focus(); return; }
    if (!date) { alert('Informe a data.'); editDate.focus(); return; }

    const updated = Object.assign({}, tx, { text, date });

    if (isInvTx(tx)) {
      const abs = Math.abs(amount);
      if (abs <= 0) { alert('O valor deve ser maior que zero.'); editAmount.focus(); return; }
      updated.amount = tx.category === INV ? -abs : abs;
      updated.assetType = editAsset.value || 'outros';

      // aporte maior que antes não pode passar do saldo em conta
      if (tx.category === INV) {
        const extra = abs - Math.abs(tx.amount);
        if (extra > getBalance() + 0.001) {
          alert(`Saldo insuficiente para aumentar o aporte (saldo: ${formatCurrency(getBalance())}).`);
          return;
        }
      }
    } else {
      updated.amount = amount;
      updated.category = editCategory.value || 'outros';
      updated.payment = editPayment.value || '';
    }

    const next = transactions.map(t => (t.id === tx.id ? updated : t));
    const bad = findNegativeType(next);
    if (bad) {
      alert(`Essa alteração deixaria os resgates maiores que o investido em "${ASSET_TYPES[bad]}".`);
      return;
    }

    transactions = next;
    save();
    render();
    closeEdit();
    showMessage('Transação atualizada.', 'success');
  }

  // ====================== Resumo / saúde ======================
  function getBalance() {
    const incomes = transactions.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0);
    const expenses = transactions.filter(t => t.amount < 0).reduce((s, t) => s + t.amount, 0);
    return +(incomes + expenses).toFixed(2);
  }

  function render() {
    renderList();
    renderSummary();
    renderInvestments();
    updateChart();
    updateHealth();
  }

  function renderSummary() {
    const incomes = transactions.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0);
    const expenses = transactions.filter(t => t.amount < 0).reduce((s, t) => s + t.amount, 0);
    totalIncomeEl.textContent = formatCurrency(incomes);
    totalExpenseEl.textContent = formatCurrency(Math.abs(expenses));
    balanceEl.textContent = formatCurrency(incomes + expenses);
    // "Investido" = patrimônio investido atual (aplicado − resgatado)
    if (totalInvestedEl) totalInvestedEl.textContent = formatCurrency(investTotals(computeByType()).available);
  }

  function updateHealth() {
    const el = $('financial-health');
    if (!el) return;
    const incomes = transactions.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0);
    const expenses = transactions.filter(t => t.amount < 0).reduce((s, t) => s + t.amount, 0);
    const balance = incomes + expenses;
    let status = 'good';
    let message = 'Saudável — continue assim!';
    if (balance < 0 && balance >= -1000) { status = 'warn'; message = 'Atenção — saldo negativo, revise gastos.'; }
    if (balance < -1000) { status = 'bad'; message = 'Risco — saldo muito negativo. Priorize cortar despesas.'; }
    if (incomes === 0 && expenses === 0) { status = 'warn'; message = 'Sem transações — adicione suas entradas.'; }
    el.classList.remove('good', 'warn', 'bad');
    el.classList.add(status);
    const msgEl = $('health-message');
    if (msgEl) msgEl.textContent = `${message} Saldo: ${formatCurrency(balance)}`;
  }

  // (a página atual não tem #category-chart; mantido caso o canvas seja adicionado)
  function updateChart() {
    const chartCanvas = $('category-chart');
    if (!chartCanvas || typeof Chart === 'undefined') return;
    const byCat = {};
    transactions.filter(t => t.amount < 0 && !isInvTx(t)).forEach(t => {
      const c = t.category || 'outros';
      byCat[c] = (byCat[c] || 0) + Math.abs(t.amount);
    });
    const labels = Object.keys(byCat);
    const data = labels.map(l => byCat[l]);
    if (chart) chart.destroy();
    try {
      chart = new Chart(chartCanvas.getContext('2d'), {
        type: 'pie',
        data: { labels, datasets: [{ data, backgroundColor: labels.map((_, i) => palette(i)) }] },
        options: { plugins: { legend: { position: 'bottom' } } }
      });
    } catch (e) { /* Chart.js pode não estar carregado */ }
  }

  // ====================== Investimentos ======================
  function isInvTx(t) { return t.category === INV || t.category === RES; }
  function assetOf(t) { return ASSET_TYPES[t.assetType] ? t.assetType : 'outros'; }
  function r2(n) { return +Number(n).toFixed(2); }

  function computeByType(list = transactions) {
    const out = {};
    Object.keys(ASSET_TYPES).forEach(k => { out[k] = { applied: 0, rescued: 0, available: 0 }; });
    list.forEach(t => {
      if (t.category === INV) out[assetOf(t)].applied += Math.abs(t.amount);
      else if (t.category === RES) out[assetOf(t)].rescued += Math.abs(t.amount);
    });
    Object.values(out).forEach(o => {
      o.applied = r2(o.applied);
      o.rescued = r2(o.rescued);
      o.available = r2(o.applied - o.rescued);
    });
    return out;
  }

  function investTotals(byType) {
    const t = { applied: 0, rescued: 0, available: 0 };
    Object.values(byType).forEach(o => { t.applied += o.applied; t.rescued += o.rescued; t.available += o.available; });
    return { applied: r2(t.applied), rescued: r2(t.rescued), available: r2(t.available) };
  }

  // retorna a chave do primeiro tipo com saldo investido negativo (inconsistente), ou null
  function findNegativeType(list) {
    const byType = computeByType(list);
    return Object.keys(byType).find(k => byType[k].available < -0.005) || null;
  }

  function fillAssetSelect(sel) {
    if (!sel) return;
    sel.innerHTML = '';
    Object.entries(ASSET_TYPES).forEach(([k, label]) => {
      const opt = document.createElement('option');
      opt.value = k;
      opt.textContent = label;
      sel.appendChild(opt);
    });
  }

  function renderInvestments() {
    if (!$('investments-panel')) return;
    const byType = computeByType();
    const totals = investTotals(byType);

    $('inv-applied').textContent = formatCurrency(totals.applied);
    $('inv-rescued').textContent = formatCurrency(totals.rescued);
    $('inv-available').textContent = formatCurrency(totals.available);

    // % da receita (sem contar resgates) que foi investida
    const incomes = transactions.filter(t => t.amount > 0 && t.category !== RES).reduce((s, t) => s + t.amount, 0);
    $('inv-rate').textContent = incomes > 0 ? ((totals.applied / incomes) * 100).toFixed(1).replace('.', ',') + '%' : '—';

    invBalanceHint.textContent = 'Saldo em conta: ' + formatCurrency(getBalance());

    renderGoal(totals.available);
    renderRescueSelect(byType);
    renderTypeTable(byType, totals);
    renderInvCharts(byType);

    invList.innerHTML = '';
    const movs = transactions.filter(isInvTx).slice().sort((a, b) => (a.date === b.date ? a.id - b.id : (a.date < b.date ? -1 : 1))).reverse();
    if (!movs.length) {
      const li = document.createElement('li');
      li.innerHTML = '<span class="inv-muted" style="margin:0">Nenhuma movimentação ainda. Faça seu primeiro aporte acima.</span>';
      invList.appendChild(li);
    } else {
      movs.forEach(tx => invList.appendChild(createTxItem(tx)));
    }
  }

  function renderGoal(available) {
    const goal = parseFloat(localStorage.getItem(GOAL_KEY)) || 0;
    const bar = $('inv-progress-bar');
    const txt = $('inv-goal-text');
    if (goal > 0) {
      const pct = Math.min(100, (available / goal) * 100);
      bar.style.width = pct.toFixed(1) + '%';
      bar.classList.toggle('done', available >= goal);
      txt.textContent = available >= goal
        ? `Meta de ${formatCurrency(goal)} atingida! (${formatCurrency(available)} investidos)`
        : `${formatCurrency(available)} de ${formatCurrency(goal)} (${pct.toFixed(1).replace('.', ',')}%) — faltam ${formatCurrency(goal - available)}`;
      if (document.activeElement !== goalInput) goalInput.value = goal;
    } else {
      bar.style.width = '0';
      bar.classList.remove('done');
      txt.textContent = 'Defina uma meta para acompanhar seu progresso.';
      if (document.activeElement !== goalInput) goalInput.value = '';
    }
  }

  function onGoalSubmit(e) {
    e.preventDefault();
    const v = parseFloat(goalInput.value);
    if (isNaN(v) || v < 0) { showMessage('Informe um valor de meta válido.', 'error'); return; }
    try { if (v === 0) localStorage.removeItem(GOAL_KEY); else localStorage.setItem(GOAL_KEY, String(r2(v))); } catch (err) { /* ignore */ }
    renderInvestments();
    showMessage(v === 0 ? 'Meta removida.' : 'Meta salva.', 'success');
  }

  function renderRescueSelect(byType) {
    const prev = resType.value;
    resType.innerHTML = '';
    let any = false;
    Object.entries(ASSET_TYPES).forEach(([k, label]) => {
      if (byType[k].available > 0.004) {
        any = true;
        const opt = document.createElement('option');
        opt.value = k;
        opt.textContent = `${label} — ${formatCurrency(byType[k].available)}`;
        resType.appendChild(opt);
      }
    });
    if (!any) {
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = 'Nenhum investimento disponível';
      resType.appendChild(opt);
    } else if (prev && Array.from(resType.options).some(o => o.value === prev)) {
      resType.value = prev;
    }
    resType.disabled = !any;
    resAmount.disabled = !any;
    resSubmit.disabled = !any;
    resAllBtn.disabled = !any;
    renderRescueHint();
  }

  function renderRescueHint() {
    const byType = computeByType();
    const av = resType.value ? byType[resType.value].available : 0;
    resHint.textContent = resType.value
      ? 'Disponível neste tipo: ' + formatCurrency(av)
      : 'Faça um aporte para poder resgatar.';
  }

  function renderTypeTable(byType, totals) {
    const body = $('inv-table-body');
    const rows = Object.entries(byType).filter(([, v]) => v.applied > 0 || v.rescued > 0);
    if (!rows.length) {
      body.innerHTML = '<tr class="empty-row"><td colspan="5">Sem investimentos registrados.</td></tr>';
      return;
    }
    body.innerHTML = rows.map(([k, v]) => {
      const pct = totals.available > 0 ? (v.available / totals.available) * 100 : 0;
      return `<tr><td>${escapeHtml(ASSET_TYPES[k])}</td><td>${formatCurrency(v.applied)}</td><td>${formatCurrency(v.rescued)}</td><td>${formatCurrency(v.available)}</td><td>${pct.toFixed(1).replace('.', ',')}%</td></tr>`;
    }).join('') + `<tr style="font-weight:700;background:#f8fbff"><td>Total</td><td>${formatCurrency(totals.applied)}</td><td>${formatCurrency(totals.rescued)}</td><td>${formatCurrency(totals.available)}</td><td>${totals.available > 0 ? '100,0%' : '0,0%'}</td></tr>`;
  }

  function renderInvCharts(byType) {
    const invPalette = ['#4f46e5', '#06b6d4', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#64748b'];
    const allocCanvas = $('inv-alloc-chart');
    const evolCanvas = $('inv-evol-chart');
    const allocEmpty = $('inv-alloc-empty');
    const evolEmpty = $('inv-evol-empty');

    if (allocChart) { allocChart.destroy(); allocChart = null; }
    if (evolChart) { evolChart.destroy(); evolChart = null; }

    // Distribuição (doughnut)
    const entries = Object.entries(byType).filter(([, v]) => v.available > 0.004);
    allocEmpty.hidden = entries.length > 0;
    allocCanvas.style.visibility = entries.length ? 'visible' : 'hidden';
    if (entries.length && typeof Chart !== 'undefined') {
      try {
        allocChart = new Chart(allocCanvas.getContext('2d'), {
          type: 'doughnut',
          data: {
            labels: entries.map(([k]) => ASSET_TYPES[k]),
            datasets: [{ data: entries.map(([, v]) => v.available), backgroundColor: entries.map((_, i) => invPalette[i % invPalette.length]) }]
          },
          options: {
            maintainAspectRatio: false,
            plugins: {
              legend: { position: 'bottom' },
              tooltip: { callbacks: { label: (c) => ` ${c.label}: ${formatCurrency(c.parsed)}` } }
            }
          }
        });
      } catch (e) { /* ignore */ }
    }

    // Evolução do patrimônio investido (linha)
    const deltaByDate = new Map();
    transactions.filter(isInvTx).forEach(t => {
      const d = t.date || today();
      deltaByDate.set(d, (deltaByDate.get(d) || 0) + (t.category === INV ? Math.abs(t.amount) : -Math.abs(t.amount)));
    });
    const dates = Array.from(deltaByDate.keys()).sort();
    evolEmpty.hidden = dates.length > 0;
    evolCanvas.style.visibility = dates.length ? 'visible' : 'hidden';
    if (dates.length && typeof Chart !== 'undefined') {
      let cum = 0;
      const data = dates.map(d => { cum += deltaByDate.get(d); return r2(cum); });
      try {
        evolChart = new Chart(evolCanvas.getContext('2d'), {
          type: 'line',
          data: {
            labels: dates.map(fmtDate),
            datasets: [{ label: 'Patrimônio investido', data, borderColor: 'rgba(79,70,229,0.95)', backgroundColor: 'rgba(79,70,229,0.10)', fill: true, tension: 0.25, pointRadius: 3 }]
          },
          options: {
            maintainAspectRatio: false,
            plugins: {
              legend: { display: false },
              tooltip: { callbacks: { label: (c) => ' ' + formatCurrency(c.parsed.y) } }
            },
            scales: { y: { ticks: { callback: (v) => formatCurrency(v) } } }
          }
        });
      } catch (e) { /* ignore */ }
    }
  }

  function onInvestSubmit(e) {
    e.preventDefault();
    const amount = parseFloat(invAmount.value);
    const type = invType.value || 'outros';
    const date = invDate.value || today();
    const balance = getBalance();
    if (isNaN(amount) || amount <= 0) { showMessage('Informe um valor maior que zero.', 'error'); invAmount.focus(); return; }
    if (amount > balance + 0.001) { showMessage(`Valor maior que o saldo disponível (${formatCurrency(balance)}).`, 'error', 5000); invAmount.focus(); return; }
    const desc = invDesc.value.trim() || `Aporte — ${ASSET_TYPES[type]}`;
    transactions.push({ id: Date.now(), text: desc, amount: -r2(amount), date, category: INV, payment: '', assetType: type });
    save();
    render();
    investForm.reset();
    invDate.value = today();
    showMessage(`Investido ${formatCurrency(amount)} em ${ASSET_TYPES[type]}.`, 'success');
  }

  function doRescue(type, amount, date) {
    if (!type) { showMessage('Não há investimentos para resgatar.', 'error'); return; }
    const available = computeByType()[type].available;
    if (isNaN(amount) || amount <= 0) { showMessage('Informe um valor maior que zero.', 'error'); resAmount.focus(); return; }
    if (amount > available + 0.001) { showMessage(`Valor maior que o disponível em ${ASSET_TYPES[type]} (${formatCurrency(available)}).`, 'error', 5000); resAmount.focus(); return; }
    transactions.push({ id: Date.now(), text: `Resgate — ${ASSET_TYPES[type]}`, amount: Math.abs(r2(amount)), date: date || today(), category: RES, payment: '', assetType: type });
    save();
    render();
    resAmount.value = '';
    resDate.value = today();
    showMessage(`Resgatado ${formatCurrency(amount)} de ${ASSET_TYPES[type]}.`, 'success');
  }

  function onRescueSubmit(e) {
    e.preventDefault();
    doRescue(resType.value, parseFloat(resAmount.value), resDate.value);
  }

  function onRescueAll() {
    if (!resType.value) return;
    doRescue(resType.value, computeByType()[resType.value].available, resDate.value);
  }

  // ====================== Tema ======================
  function initTheme() {
    const saved = localStorage.getItem('theme');
    if (saved === 'light') {
      document.body.classList.add('light-mode');
      if (themeIcon) themeIcon.innerHTML = svgSun();
    } else {
      document.body.classList.remove('light-mode');
      if (themeIcon) themeIcon.innerHTML = svgMoon();
    }
  }

  function toggleTheme() {
    const isLight = document.body.classList.toggle('light-mode');
    localStorage.setItem('theme', isLight ? 'light' : 'dark');
    if (themeIcon) themeIcon.innerHTML = isLight ? svgSun() : svgMoon();
    if (themeToggle) themeToggle.setAttribute('aria-pressed', isLight ? 'true' : 'false');
  }

  function svgSun() {
    return `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <circle cx="12" cy="12" r="4" fill="#FBBF24"/>
        <g stroke="#F59E0B" stroke-width="1.2">
          <path d="M12 2v2"/><path d="M12 20v2"/><path d="M4.93 4.93l1.41 1.41"/><path d="M17.66 17.66l1.41 1.41"/>
          <path d="M2 12h2"/><path d="M20 12h2"/><path d="M4.93 19.07l1.41-1.41"/><path d="M17.66 6.34l1.41-1.41"/>
        </g>
      </svg>`;
  }

  function svgMoon() {
    return `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" fill="#CBD5E1"/>
      </svg>`;
  }

  // ====================== Exportações ======================
  function onExportCSV() {
    if (!transactions.length) { alert('Nenhuma transação para exportar'); return; }
    const header = ['id', 'text', 'amount', 'date', 'category', 'payment', 'assetType'];
    const lines = [header.join(',')];
    transactions.forEach(t => {
      lines.push([t.id, escapeCsv(t.text), t.amount, t.date, t.category || '', t.payment || '', isInvTx(t) ? assetOf(t) : ''].join(','));
    });
    downloadCsv(lines.join('\n'), `transactions_${today()}.csv`);
    showMessage('Dados exportados com sucesso!', 'success');
  }

  function exportExcel() {
    if (!transactions.length) { alert('Nenhuma transação para exportar'); return; }

    const incomes = transactions.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0);
    const expenses = transactions.filter(t => t.amount < 0).reduce((s, t) => s + t.amount, 0);
    const balance = incomes + expenses;
    const byType = computeByType();
    const totals = investTotals(byType);

    const byCat = {};
    transactions.filter(t => t.amount < 0 && !isInvTx(t)).forEach(t => {
      const c = t.category || 'outros';
      byCat[c] = (byCat[c] || 0) + Math.abs(t.amount);
    });
    const catTotal = Object.values(byCat).reduce((s, v) => s + v, 0);

    const monthlyMap = new Map();
    transactions.forEach(t => {
      const dt = new Date(t.date);
      if (isNaN(dt)) return;
      const key = dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0');
      monthlyMap.set(key, (monthlyMap.get(key) || 0) + t.amount);
    });

    const lines = [];
    lines.push('RELATÓRIO FINANCEIRO - ' + new Date().toLocaleDateString('pt-BR'));
    lines.push('Data da Geração: ' + new Date().toLocaleString('pt-BR'));
    lines.push('');
    lines.push('RESUMO FINANCEIRO');
    lines.push('Receitas,' + formatCurrencyRaw(incomes));
    lines.push('Despesas,' + formatCurrencyRaw(Math.abs(expenses)));
    lines.push('Investido (aplicado),' + formatCurrencyRaw(totals.applied));
    lines.push('Resgatado,' + formatCurrencyRaw(totals.rescued));
    lines.push('Patrimônio investido,' + formatCurrencyRaw(totals.available));
    lines.push('Saldo Total,' + formatCurrencyRaw(balance));
    lines.push('');
    lines.push('INVESTIMENTOS POR TIPO');
    lines.push('Tipo,Aplicado,Resgatado,Disponível');
    Object.entries(byType).filter(([, v]) => v.applied > 0 || v.rescued > 0).forEach(([k, v]) => {
      lines.push([escapeCsv(ASSET_TYPES[k]), formatCurrencyRaw(v.applied), formatCurrencyRaw(v.rescued), formatCurrencyRaw(v.available)].join(','));
    });
    lines.push('');
    lines.push('DESPESAS POR CATEGORIA');
    Object.entries(byCat).forEach(([cat, amount]) => {
      const pct = catTotal ? (amount / catTotal * 100).toFixed(1) : '0.0';
      lines.push(cat + ',' + formatCurrencyRaw(amount) + ',' + pct + '%');
    });
    lines.push('');
    lines.push('EVOLUÇÃO MENSAL');
    Array.from(monthlyMap.keys()).sort().forEach(month => {
      lines.push(month + ',' + formatCurrencyRaw(monthlyMap.get(month)));
    });
    lines.push('');
    lines.push('TRANSAÇÕES DETALHADAS');
    lines.push('ID,Descrição,Valor,Data,Categoria,Pagamento,Tipo de investimento');
    transactions.slice().reverse().forEach(t => {
      lines.push([t.id, escapeCsv(t.text), formatCurrencyRaw(t.amount), t.date, t.category || '', t.payment || '', isInvTx(t) ? escapeCsv(ASSET_TYPES[assetOf(t)]) : ''].join(','));
    });

    downloadCsv(lines.join('\n'), `relatorio_financeiro_${today()}.csv`);
    showMessage('Relatório exportado com sucesso!', 'success');
  }

  function downloadCsv(csv, filename) {
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function formatCurrencyRaw(v) {
    return '"' + Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '"';
  }

  async function onGenerateQR() {
    if (!transactions.length) { alert('Nenhuma transação para gerar QR'); return; }
    const payload = JSON.stringify(transactions);
    qrContainer.innerHTML = '';
    if (window.QRCode && window.QRCode.toDataURL) {
      try {
        const dataUrl = await window.QRCode.toDataURL(payload, { errorCorrectionLevel: 'M', width: 280 });
        const img = document.createElement('img');
        img.src = dataUrl; img.alt = 'QR Code'; img.style.borderRadius = '8px';
        qrContainer.appendChild(img);
        showMessage('QR Code gerado com sucesso!', 'success');
      } catch (e) { qrContainer.textContent = 'Erro ao gerar QR (dados muito grandes?)'; }
    } else if (window.QRCode) {
      try { new window.QRCode(qrContainer, { text: payload, width: 280, height: 280 }); } catch (e) { qrContainer.textContent = 'QR lib não disponível'; }
    } else {
      qrContainer.textContent = 'Biblioteca QR não encontrada';
    }
  }

  // ====================== Utilitários ======================
  function save() { localStorage.setItem(STORAGE_KEY, JSON.stringify(transactions)); }
  function load() { try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; } catch (e) { return []; } }
  function formatCurrency(v) { return 'R$ ' + Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function fmtDate(d) { return /^\d{4}-\d{2}-\d{2}$/.test(d || '') ? d.split('-').reverse().join('/') : (d || ''); }
  function escapeCsv(s) { if (s == null) return ''; return '"' + String(s).replace(/"/g, '""') + '"'; }
  function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]); }
  function palette(i) { const cols = ['#ef4444', '#f97316', '#f59e0b', '#84cc16', '#10b981', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899']; return cols[i % cols.length]; }
  function svgTrash() { return '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path><path d="M10 11v6"></path><path d="M14 11v6"></path><path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"></path></svg>'; }
  function svgEdit() { return '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"></path></svg>'; }

  // toast
  function showMessage(msg, type = 'info', timeout = 3500) {
    try {
      const existing = $('app-notification');
      if (existing) existing.remove();
      const el = document.createElement('div');
      el.id = 'app-notification';
      el.setAttribute('role', 'status');
      Object.assign(el.style, {
        position: 'fixed', right: '20px', bottom: '20px', zIndex: 300000, padding: '12px 16px', borderRadius: '10px',
        boxShadow: '0 8px 24px rgba(2,6,23,0.18)', color: '#fff', fontSize: '0.95rem', maxWidth: '320px', wordBreak: 'break-word',
        transition: 'opacity 200ms ease, transform 200ms ease', opacity: '0', transform: 'translateY(8px)',
        background: type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : '#111827'
      });
      el.textContent = msg;
      document.body.appendChild(el);
      requestAnimationFrame(() => { el.style.opacity = '1'; el.style.transform = 'translateY(0)'; });
      setTimeout(() => {
        el.style.opacity = '0'; el.style.transform = 'translateY(8px)';
        setTimeout(() => { if (el.parentNode) el.parentNode.removeChild(el); }, 220);
      }, timeout);
    } catch (e) { /* ignore */ }
  }

  // ====================== Sidebar ======================
  function scrollToEl(el, focusEl) {
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (focusEl) setTimeout(() => focusEl.focus({ preventScroll: true }), 350);
  }

  function initSidebar() {
    try {
      if (!sidebar) return;
      if (sidebarOpen) sidebarOpen.addEventListener('click', () => sidebar.classList.toggle('expanded'));
      if (sidebarToggle) sidebarToggle.addEventListener('click', () => sidebar.classList.remove('expanded'));

      document.addEventListener('click', (e) => {
        const inside = sidebar.contains(e.target);
        const onOpenBtn = sidebarOpen && sidebarOpen.contains(e.target);
        if (!inside && !onOpenBtn && sidebar.classList.contains('expanded')) sidebar.classList.remove('expanded');
      });

      sidebar.querySelectorAll('[data-action]').forEach(btn => {
        btn.addEventListener('click', () => {
          const a = btn.getAttribute('data-action');
          if (a === 'export-csv') onExportCSV();
          else if (a === 'export-report') exportExcel();
          else if (a === 'generate-qr') onGenerateQR();
          else if (a === 'open-panel') scrollToEl($('investments-panel'));
          else if (a === 'focus-invest') scrollToEl(investForm, invAmount);
          else if (a === 'focus-rescue') scrollToEl(rescueForm, resAmount.disabled ? null : resAmount);
          sidebar.classList.remove('expanded');
        });
      });
    } catch (e) { /* ignore */ }
  }

  initSidebar();
})();