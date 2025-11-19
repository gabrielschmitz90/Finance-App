// script.js — gerenciamento de transações, export CSV, QR e gráfico
(() => {
  const STORAGE_KEY = 'transactions_v1';

  // Seletores
  const form = document.getElementById('transaction-form');
  const textInput = document.getElementById('text');
  const amountInput = document.getElementById('amount');
  const dateInput = document.getElementById('date-input');
  const categorySelect = document.getElementById('category-select');
  const paymentSelect = document.getElementById('payment-method');
  const listEl = document.getElementById('transaction-list');
  const totalIncomeEl = document.getElementById('total-income');
  const totalExpenseEl = document.getElementById('total-expense');
  const balanceEl = document.getElementById('current-balance');
  const exportBtn = document.getElementById('export-csv');
  const qrBtn = document.getElementById('generate-qr');
  const qrContainer = document.getElementById('qr-container');
  const chartCanvas = document.getElementById('category-chart');
  const investAmountInput = document.getElementById('invest-amount');
  const investBtn = document.getElementById('invest-btn');
  const totalInvestedEl = document.getElementById('total-invested');
  const rescueAmountInput = document.getElementById('rescue-amount');
  const rescueBtn = document.getElementById('rescue-btn');
  const rescueAllBtn = document.getElementById('rescue-all-btn');
  const investInfoEl = document.getElementById('invest-info');

  let transactions = load();
  let chart = null;

  // Theme toggle elements
  const themeToggle = document.getElementById('theme-toggle');
  const themeIcon = document.getElementById('theme-icon');

  // --- Inicialização ---
  // set default date to today for convenience
  if(dateInput && !dateInput.value) dateInput.value = new Date().toISOString().slice(0,10);
  // init theme before render so panel colors are correct
  initTheme();
  render();
  attachEvents();

  function attachEvents(){
    form.addEventListener('submit', onSubmit);
    exportBtn.addEventListener('click', onExportCSV);
    qrBtn.addEventListener('click', onGenerateQR);
    if(themeToggle) themeToggle.addEventListener('click', toggleTheme);
    if(investBtn) investBtn.addEventListener('click', onInvest);
    if(rescueBtn) rescueBtn.addEventListener('click', onRescue);
    if(rescueAllBtn) rescueAllBtn.addEventListener('click', onRescueAll);
  }

  function onSubmit(e){
    e.preventDefault();
    const text = textInput.value.trim();
    const amount = parseFloat(amountInput.value);
    const date = dateInput.value || new Date().toISOString().slice(0,10);
    const category = categorySelect.value || 'outros';
    const payment = paymentSelect.value || '';
    if(!text){ alert('Preencha a descrição.'); textInput.focus(); return; }
    if(isNaN(amount)){ alert('Digite um valor válido.'); amountInput.focus(); return; }
    const tx = {id: Date.now(), text, amount, date, category, payment};
    transactions.push(tx);
    save();
    render();
    form.reset();
    // keep date defaulting to today after reset
    if(dateInput) dateInput.value = new Date().toISOString().slice(0,10);
    // focus next interaction
    if(textInput) textInput.focus();
  }

  function render(){
    renderList();
    renderSummary();
    updateChart();
    updateHealth();
  }

  // Financial health evaluation and UI
  function updateHealth(){
    const el = document.getElementById('financial-health');
    if(!el) return;
    const incomes = transactions.filter(t=>t.amount>0).reduce((s,t)=>s+t.amount,0);
    const expenses = transactions.filter(t=>t.amount<0).reduce((s,t)=>s+t.amount,0);
    const balance = incomes + expenses;
    // Simple heuristics
    let status = 'good';
    let message = 'Saudável — continue assim!';
    if(balance < 0 && balance >= -1000){ status = 'warn'; message = 'Atenção — saldo negativo, revise gastos.'; }
    if(balance < -1000){ status = 'bad'; message = 'Risco — saldo muito negativo. Priorize cortar despesas.'; }
    if(incomes === 0 && expenses === 0){ status = 'warn'; message = 'Sem transações — adicione suas entradas.'; }
    el.classList.remove('good','warn','bad');
    el.classList.add(status);
    const msgEl = document.getElementById('health-message');
    if(msgEl) msgEl.textContent = `${message} Saldo: ${formatCurrency(balance)}`;
  }

  // Theme functions
  function initTheme(){
    const saved = localStorage.getItem('theme');
    if(saved === 'light'){
      document.body.classList.add('light-mode');
      if(themeIcon) themeIcon.innerHTML = svgSun();
    }else{
      document.body.classList.remove('light-mode');
      if(themeIcon) themeIcon.innerHTML = svgMoon();
    }
  }

  function toggleTheme(){
    const isLight = document.body.classList.toggle('light-mode');
    localStorage.setItem('theme', isLight ? 'light' : 'dark');
    if(themeIcon) themeIcon.innerHTML = isLight ? svgSun() : svgMoon();
    if(themeToggle) themeToggle.setAttribute('aria-pressed', isLight ? 'true' : 'false');
  }

  // SVG icons for theme toggle
  function svgSun(){
    return `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <circle cx="12" cy="12" r="4" fill="#FBBF24"/>
        <g stroke="#F59E0B" stroke-width="1.2">
          <path d="M12 2v2"/>
          <path d="M12 20v2"/>
          <path d="M4.93 4.93l1.41 1.41"/>
          <path d="M17.66 17.66l1.41 1.41"/>
          <path d="M2 12h2"/>
          <path d="M20 12h2"/>
          <path d="M4.93 19.07l1.41-1.41"/>
          <path d="M17.66 6.34l1.41-1.41"/>
        </g>
      </svg>`;
  }

  function svgMoon(){
    return `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" fill="#CBD5E1"/>
      </svg>`;
  }

  function renderList(){
    listEl.innerHTML = '';
    transactions.slice().reverse().forEach(tx => {
      const li = document.createElement('li');
      const textWrap = document.createElement('div');
      textWrap.className = 'text';
      textWrap.innerHTML = `<strong>${escapeHtml(tx.text)}</strong><div style="font-size:0.85rem;color:var(--muted)">${tx.date} • ${tx.category} ${tx.payment?('• '+tx.payment):''}</div>`;
      const amountEl = document.createElement('div');
      amountEl.className = 'amount ' + (tx.amount >= 0 ? 'positive' : 'negative');
      amountEl.textContent = formatCurrency(tx.amount);

      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'icon-btn trash';
      deleteBtn.title = 'Remover transação';
      deleteBtn.innerHTML = svgTrash();
      deleteBtn.addEventListener('click', ()=>{ removeTransaction(tx.id); });

      li.appendChild(textWrap);
      li.appendChild(amountEl);
      li.appendChild(deleteBtn);
      listEl.appendChild(li);
    });
  }

  function renderSummary(){
    const incomes = transactions.filter(t=>t.amount>0).reduce((s,t)=>s+t.amount,0);
    const expenses = transactions.filter(t=>t.amount<0).reduce((s,t)=>s+t.amount,0);
    totalIncomeEl.textContent = formatCurrency(incomes);
    totalExpenseEl.textContent = formatCurrency(Math.abs(expenses));
    const balance = incomes + expenses;
    balanceEl.textContent = formatCurrency(balance);
    // total investido (sum of transactions categorized as 'investimento')
    const invested = transactions.filter(t=>t.category==='investimento').reduce((s,t)=>s+Math.abs(t.amount),0);
    if(totalInvestedEl) totalInvestedEl.textContent = formatCurrency(invested);

    // resgates already performed
    const resgates = transactions.filter(t=>t.category==='resgate').reduce((s,t)=>s+Math.abs(t.amount),0);
    const available = computeAvailableInvested();
    if(rescueAmountInput){
      rescueAmountInput.placeholder = `Valor para resgatar (ou vazio = máximo — disponível ${formatCurrency(available)})`;
    }

    // show a small visible summary near controls
    if(investInfoEl) investInfoEl.textContent = `Investido: ${formatCurrency(invested)} • Resgatado: ${formatCurrency(resgates)} • Disponível: ${formatCurrency(available)}`;
  }

  // compute available invested amount: total investimentos menos resgates
  function computeAvailableInvested(){
    const investedIn = transactions
      .filter(t=>t.category==='investimento')
      .reduce((s,t)=>s+Math.abs(t.amount),0);
    const resgates = transactions
      .filter(t=>t.category==='resgate')
      .reduce((s,t)=>s+Math.abs(t.amount),0);
    return Math.max(0, +(investedIn - resgates).toFixed(2));
  }

  function onRescueAll(e){
    e && e.preventDefault && e.preventDefault();
    const available = computeAvailableInvested();
    if(available <= 0){
      alert('Nenhum valor disponível para resgatar.');
      return;
    }
    if(rescueAmountInput) rescueAmountInput.value = String(available);
    // call the existing handler to perform the resgate
    onRescue();
  }

  function updateChart(){
    if(!chartCanvas) return;
    // Agrega despesas por categoria
    // exclude investments from the expense category chart
    const expenses = transactions.filter(t=>t.amount<0 && t.category!=='investimento');
    const byCat = {};
    expenses.forEach(t=>{
      const c = t.category || 'outros';
      byCat[c] = (byCat[c] || 0) + Math.abs(t.amount);
    });
    const labels = Object.keys(byCat);
    const data = labels.map(l=>byCat[l]);

    const config = {
      type: 'pie',
      data: { labels, datasets:[{data,backgroundColor: labels.map((_,i)=>palette(i))}]},
      options: {plugins:{legend:{position:'bottom'}}}
    };

    if(chart) chart.destroy();
    try{ chart = new Chart(chartCanvas.getContext('2d'), config); }catch(e){/* Chart.js may not be loaded */}
  }

  // Export CSV
  function onExportCSV(){
    if(!transactions.length){ alert('Nenhuma transação para exportar'); return; }
    const header = ['id','text','amount','date','category','payment'];
    const lines = [header.join(',')];
    transactions.forEach(t=>{
      const row = [t.id, escapeCsv(t.text), t.amount, t.date, t.category||'', t.payment||''];
      lines.push(row.join(','));
    });
    const csv = lines.join('\n');
    const blob = new Blob([csv],{type:'text/csv;charset=utf-8;'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `transactions_${new Date().toISOString().slice(0,10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  // QR Code (JSON of transactions) — uses QRCode.toDataURL if available
  async function onGenerateQR(){
    if(!transactions.length){ alert('Nenhuma transação para gerar QR'); return; }
    const payload = JSON.stringify(transactions);
    qrContainer.innerHTML = '';
    // prefer library: QRCode.toDataURL
    if(window.QRCode && window.QRCode.toDataURL){
      try{
        const dataUrl = await window.QRCode.toDataURL(payload, {errorCorrectionLevel:'M', width:280});
        const img = document.createElement('img'); img.src = dataUrl; img.alt='QR Code'; img.style.borderRadius='8px';
        qrContainer.appendChild(img);
      }catch(e){ qrContainer.textContent = 'Erro ao gerar QR'; }
    }else if(window.QRCode){
      // some libs expose constructor
      try{ new window.QRCode(qrContainer, {text:payload,width:280,height:280}); }catch(e){ qrContainer.textContent='QR lib não disponível'; }
    }else{
      qrContainer.textContent = 'Biblioteca QR não encontrada';
    }
  }

  // Invest handler: invest a specific amount or the remaining balance
  function onInvest(e){
    e && e.preventDefault && e.preventDefault();
    const raw = investAmountInput && investAmountInput.value ? parseFloat(investAmountInput.value) : NaN;
    const incomes = transactions.filter(t=>t.amount>0).reduce((s,t)=>s+t.amount,0);
    const expenses = transactions.filter(t=>t.amount<0).reduce((s,t)=>s+t.amount,0);
    const balance = incomes + expenses; // expenses are negative

    let amountToInvest = NaN;
    if(!isNaN(raw) && raw > 0){
      amountToInvest = raw;
    }else{
      amountToInvest = Math.max(0, balance);
    }

    if(amountToInvest <= 0){
      alert('Saldo insuficiente para investir.');
      return;
    }

    if(amountToInvest > balance){
      alert('Valor maior que o saldo disponível. Ajuste o valor.');
      return;
    }

    const tx = { id: Date.now(), text: 'Investimento', amount: -Math.abs(amountToInvest), date: new Date().toISOString().slice(0,10), category: 'investimento', payment: '' };
    transactions.push(tx);
    save();
    render();
    if(investAmountInput) investAmountInput.value = '';
  }

  // Resgate handler: resgatar um valor do total investido (cria transação positiva de categoria 'resgate')
  function onRescue(e){
    e && e.preventDefault && e.preventDefault();
    const raw = rescueAmountInput && rescueAmountInput.value ? parseFloat(rescueAmountInput.value) : NaN;
    // calcula total investido disponível = somatório de investimentos menos somatório de resgates
    const investedIn = transactions
      .filter(t=>t.category==='investimento')
      .reduce((s,t)=>s+Math.abs(t.amount),0);
    // use absolute values for resgates as well to avoid sign issues
    const resgates = transactions
      .filter(t=>t.category==='resgate')
      .reduce((s,t)=>s+Math.abs(t.amount),0);
    const available = Math.max(0, +(investedIn - resgates).toFixed(2));

    let amountToRescue = NaN;
    if(!isNaN(raw) && raw > 0){
      amountToRescue = raw;
    }else{
      amountToRescue = available;
    }

    if(amountToRescue <= 0){
      alert(`Nenhum valor disponível para resgatar. Investido: ${formatCurrency(investedIn)} — Já resgatado: ${formatCurrency(resgates)}.`);
      return;
    }

    if(amountToRescue > available){
      alert(`Valor maior que o total investido disponível (${formatCurrency(available)}). Ajuste o valor.`);
      return;
    }

    const tx = { id: Date.now(), text: 'Resgate investimento', amount: Math.abs(amountToRescue), date: new Date().toISOString().slice(0,10), category: 'resgate', payment: '' };
    transactions.push(tx);
    save();
    render();
    if(rescueAmountInput) rescueAmountInput.value = '';
  }

  // Utilitários
  function save(){ localStorage.setItem(STORAGE_KEY, JSON.stringify(transactions)); }
  function load(){ try{ return JSON.parse(localStorage.getItem(STORAGE_KEY))||[] }catch(e){return []} }
  function removeTransaction(id){ transactions = transactions.filter(t=>t.id!==id); save(); render(); }
  function formatCurrency(v){ return 'R$ ' + Number(v).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}); }
  function escapeCsv(s){ if(s==null) return ''; return '"'+String(s).replace(/"/g,'""')+'"'; }
  function escapeHtml(s){ return String(s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#39;"})[c]); }
  function palette(i){ const cols=['#ef4444','#f97316','#f59e0b','#84cc16','#10b981','#06b6d4','#3b82f6','#8b5cf6','#ec4899']; return cols[i%cols.length]; }
  function svgTrash(){ return '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path><path d="M10 11v6"></path><path d="M14 11v6"></path><path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"></path></svg>'; }

})();
