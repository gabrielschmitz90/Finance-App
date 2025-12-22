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
  const qrContainer = document.getElementById('qr-container');
  const dashboardBtn = document.getElementById('dashboard-btn');
  const chartCanvas = document.getElementById('category-chart');
  const totalInvestedEl = document.getElementById('total-invested');
  
  // Novos seletores para sidebar (não mais hardcoded nos inputs)
  const investAmountInput = null;
  const investBtn = null;
  const rescueAmountInput = null;
  const rescueBtn = null;
  const rescueAllBtn = null;
  const investInfoEl = null;
  
  // Sidebar
  const sidebar = document.getElementById('app-sidebar');
  const sidebarOpen = document.getElementById('sidebar-open');
  const sidebarToggle = document.getElementById('sidebar-toggle');

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

  // auto-reset monthly if user opted in
  try{
    const auto = localStorage.getItem('auto_reset_monthly');
    const last = localStorage.getItem('last_reset_month');
    const now = new Date();
    const thisMonthKey = now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0');
    if(auto === '1' && last !== thisMonthKey){
      // archive existing transactions under archive_{last or current-1}
      const archiveKey = 'archive_' + (last || thisMonthKey);
      localStorage.setItem(archiveKey, JSON.stringify(transactions));
      // clear transactions for new month
      localStorage.removeItem(STORAGE_KEY);
      transactions = [];
      localStorage.setItem('last_reset_month', thisMonthKey);
    }
  }catch(e){ /* ignore */ }

  render();
  attachEvents();
  saveCategories();

  function attachEvents(){
    form.addEventListener('submit', onSubmit);
    if(themeToggle) themeToggle.addEventListener('click', toggleTheme);
  }

  // Persist available categories (from the select) so dashboard can list them
  const CATEGORIES_KEY = 'categories_v1';
  function saveCategories(){
    try{
      if(!categorySelect) return;
      const opts = Array.from(categorySelect.options).filter(o=>o.value).map(o=>({value:o.value,label:o.textContent||o.text}));
      localStorage.setItem(CATEGORIES_KEY, JSON.stringify(opts));
    }catch(e){/* ignore */}
  }

  // Dashboard modal + charts
  function getCategoryAggregation(){
    const expenses = transactions.filter(t=>t.amount<0 && t.category!=='investimento');
    const byCat = {};
    expenses.forEach(t=>{
      const c = t.category || 'outros';
      byCat[c] = (byCat[c] || 0) + Math.abs(t.amount);
    });
    const labels = Object.keys(byCat);
    const data = labels.map(l=>byCat[l]);
    return {labels,data};
  }

  function getBalanceOverTime(){
    // build cumulative balance per date
    const map = new Map();
    transactions.slice().sort((a,b)=> new Date(a.date) - new Date(b.date)).forEach(t=>{
      const d = t.date;
      map.set(d, (map.get(d) || 0) + t.amount);
    });
    const dates = Array.from(map.keys()).sort((a,b)=> new Date(a)-new Date(b));
    const labels = [];
    const data = [];
    let cum = 0;
    dates.forEach(d=>{
      cum += map.get(d);
      labels.push(new Date(d).toLocaleDateString('pt-BR'));
      data.push(+cum.toFixed(2));
    });
    return {labels,data};
  }

  function showDashboardModal(){
    try{
      // remove existing
      const prev = document.getElementById('dashboard-overlay'); if(prev) prev.remove();
      const overlay = document.createElement('div'); overlay.id = 'dashboard-overlay';
      overlay.style.position = 'fixed'; overlay.style.left = 0; overlay.style.top = 0; overlay.style.right = 0; overlay.style.bottom = 0;
      overlay.style.background = 'rgba(2,6,23,0.45)'; overlay.style.zIndex = 120000; overlay.style.display = 'flex'; overlay.style.alignItems = 'center'; overlay.style.justifyContent = 'center';

      const dialog = document.createElement('div'); dialog.style.background = 'var(--card-bg, #fff)'; dialog.style.padding = '18px'; dialog.style.borderRadius = '12px';
      dialog.style.minWidth = '320px'; dialog.style.maxWidth = '920px'; dialog.style.width = '92%'; dialog.style.maxHeight = '92%'; dialog.style.overflow = 'auto';

      const header = document.createElement('div'); header.style.display = 'flex'; header.style.justifyContent = 'space-between'; header.style.alignItems = 'center'; header.style.marginBottom = '10px';
      const title = document.createElement('h3'); title.textContent = 'Dashboard'; title.style.margin = 0; title.style.fontSize = '1.05rem';
      const closeBtn = document.createElement('button'); closeBtn.className = 'btn'; closeBtn.textContent = 'Fechar'; closeBtn.style.background = '#ef4444'; closeBtn.style.marginLeft = '12px';
      header.appendChild(title); header.appendChild(closeBtn);

      const grid = document.createElement('div'); grid.style.display = 'grid'; grid.style.gridTemplateColumns = '1fr 1fr'; grid.style.gap = '12px';
      // canvas for category
      const cWrap = document.createElement('div'); cWrap.style.background = 'transparent'; cWrap.style.padding = '8px'; cWrap.style.borderRadius = '8px';
      const catCanvas = document.createElement('canvas'); catCanvas.id = 'dash-category-chart'; catCanvas.style.width = '100%'; catCanvas.style.height = '300px'; cWrap.appendChild(catCanvas);
      // canvas for balance
      const bWrap = document.createElement('div'); bWrap.style.background = 'transparent'; bWrap.style.padding = '8px'; bWrap.style.borderRadius = '8px';
      const balCanvas = document.createElement('canvas'); balCanvas.id = 'dash-balance-chart'; balCanvas.style.width = '100%'; balCanvas.style.height = '300px'; bWrap.appendChild(balCanvas);

      grid.appendChild(cWrap); grid.appendChild(bWrap);
      dialog.appendChild(header); dialog.appendChild(grid); overlay.appendChild(dialog); document.body.appendChild(overlay);

      // create charts
      let catChart = null, balChart = null;
      try{
        const catAgg = getCategoryAggregation();
        catChart = new Chart(catCanvas.getContext('2d'), { type: 'pie', data: { labels: catAgg.labels, datasets:[{ data: catAgg.data, backgroundColor: catAgg.labels.map((_,i)=>palette(i)) }] }, options:{ plugins:{legend:{position:'bottom'}} } });
      }catch(e){/* ignore chart errors */}
      try{
        const bal = getBalanceOverTime();
        balChart = new Chart(balCanvas.getContext('2d'), { type: 'line', data: { labels: bal.labels, datasets:[{ label:'Saldo acumulado', data: bal.data, borderColor: 'rgba(59,130,246,0.95)', backgroundColor: 'rgba(59,130,246,0.08)', fill:true, tension:0.2 }] }, options:{ plugins:{legend:{display:false}}, scales:{ x:{ ticks:{maxRotation:0,minRotation:0} } } } });
      }catch(e){/* ignore chart errors */}

      // cleanup on close
      closeBtn.addEventListener('click', ()=>{
        try{ if(catChart) catChart.destroy(); if(balChart) balChart.destroy(); }catch(e){}
        overlay.remove();
      });
      // allow overlay click outside dialog to close
      overlay.addEventListener('click', (ev)=>{ if(ev.target === overlay){ closeBtn.click(); } });
    }catch(e){ showMessage('Não foi possível abrir o dashboard.', 'error'); }
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

  // inline prompt block: inserts a small UI near the invest/rescue controls
  // returns a Promise<number|null>
  function inlinePromptAmount(message, defaultValue = ''){
    return new Promise((resolve)=>{
      try{
        // remove existing inline prompt
        const prev = document.getElementById('inline-rescue-block'); if(prev) prev.remove();
        // prefer to attach near the invest panel
        const anchor = document.querySelector('.invest-panel') || document.querySelector('.controls-row') || document.body;

        const block = document.createElement('div');
        block.id = 'inline-rescue-block';
        block.style.display = 'flex';
        block.style.gap = '8px';
        block.style.alignItems = 'center';
        block.style.background = 'linear-gradient(180deg, #fff, #fbfbff)';
        block.style.border = '1px solid rgba(2,6,23,0.06)';
        block.style.padding = '10px';
        block.style.borderRadius = '10px';
        block.style.boxShadow = '0 8px 30px rgba(2,6,23,0.06)';
        block.style.marginTop = '8px';

        const label = document.createElement('div'); label.textContent = message; label.style.color = '#334155'; label.style.fontSize = '0.95rem'; label.style.minWidth = '220px';
        const input = document.createElement('input'); input.type = 'number'; input.step = '0.01'; input.style.padding='8px 10px'; input.style.border='1px solid #e6e9ef'; input.style.borderRadius='8px'; input.style.width='160px';
        if(defaultValue !== undefined && defaultValue !== null) input.value = String(defaultValue);
        const ok = document.createElement('button'); ok.className='btn'; ok.textContent='Confirmar'; ok.style.padding='8px 12px';
        const cancel = document.createElement('button'); cancel.className='btn'; cancel.textContent='Cancelar'; cancel.style.background='#e5e7eb'; cancel.style.color='#111827';

        block.appendChild(label); block.appendChild(input); block.appendChild(ok); block.appendChild(cancel);

        // place after anchor
        if(anchor === document.body) document.body.appendChild(block);
        else anchor.parentNode.insertBefore(block, anchor.nextSibling);

        function cleanup(){ try{ if(block && block.parentNode) block.parentNode.removeChild(block); }catch(e){} }

        cancel.addEventListener('click', ()=>{ cleanup(); resolve(null); });
        ok.addEventListener('click', ()=>{
          const val = parseFloat(input.value);
          if(isNaN(val) || val < 0){ input.style.borderColor = '#ef4444'; input.focus(); return; }
          cleanup(); resolve(+val.toFixed(2));
        });

        input.addEventListener('keydown', (ev)=>{ if(ev.key === 'Enter'){ ok.click(); } if(ev.key === 'Escape'){ cancel.click(); } });
        setTimeout(()=>{ input.focus(); input.select(); }, 20);
      }catch(e){ resolve(null); }
    });
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
      
      // update sidebar info if needed
      updateSidebarInfo(invested, resgates, available);
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
    showMessage('Dados exportados com sucesso!', 'success');
  }

  // Export Excel (enhanced with summaries and insights)
  function exportExcel(){
    if(!transactions.length){ alert('Nenhuma transação para exportar'); return; }
    
    // Calculate summaries
    const incomes = transactions.filter(t=>t.amount>0).reduce((s,t)=>s+t.amount,0);
    const expenses = transactions.filter(t=>t.amount<0).reduce((s,t)=>s+t.amount,0);
    const balance = incomes + expenses;
    const invested = transactions.filter(t=>t.category==='investimento').reduce((s,t)=>s+Math.abs(t.amount),0);
    const resgates = transactions.filter(t=>t.category==='resgate').reduce((s,t)=>s+Math.abs(t.amount),0);
    
    // Calculate by category
    const byCat = {};
    transactions.filter(t=>t.amount<0 && t.category!=='investimento').forEach(t=>{
      const c = t.category || 'outros';
      byCat[c] = (byCat[c]||0) + Math.abs(t.amount);
    });
    
    // Calculate monthly evolution
    const monthlyMap = new Map();
    transactions.forEach(t=>{
      const dt = new Date(t.date);
      if(isNaN(dt)) return;
      const key = dt.getFullYear() + '-' + String(dt.getMonth()+1).padStart(2,'0');
      monthlyMap.set(key, (monthlyMap.get(key)||0) + t.amount);
    });
    
    // Build CSV content with multiple sections
    const lines = [];
    
    // Header
    lines.push('RELATÓRIO FINANCEIRO - ' + new Date().toLocaleDateString('pt-BR'));
    lines.push('Data da Geração: ' + new Date().toLocaleString('pt-BR'));
    lines.push('');
    
    // Summary section
    lines.push('RESUMO FINANCEIRO');
    lines.push('Receitas,' + formatCurrencyRaw(incomes));
    lines.push('Despesas,' + formatCurrencyRaw(Math.abs(expenses)));
    lines.push('Investido,' + formatCurrencyRaw(invested));
    lines.push('Resgatado,' + formatCurrencyRaw(resgates));
    lines.push('Saldo Total,' + formatCurrencyRaw(balance));
    lines.push('');
    
    // Category breakdown
    lines.push('DESPESAS POR CATEGORIA');
    Object.entries(byCat).forEach(([cat, amount]) => {
      const pct = (amount/Math.abs(expenses)*100).toFixed(1);
      lines.push(cat + ',' + formatCurrencyRaw(amount) + ',' + pct + '%');
    });
    lines.push('');
    
    // Monthly evolution
    lines.push('EVOLUÇÃO MENSAL');
    const sortedMonths = Array.from(monthlyMap.keys()).sort();
    sortedMonths.forEach(month => {
      const amount = monthlyMap.get(month);
      lines.push(month + ',' + formatCurrencyRaw(amount));
    });
    lines.push('');
    
    // Detailed transactions
    lines.push('TRANSAÇÕES DETALHADAS');
    lines.push('ID,Descrição,Valor,Data,Categoria,Pagamento');
    transactions.slice().reverse().forEach(t=>{
      const row = [t.id, escapeCsv(t.text), formatCurrencyRaw(t.amount), t.date, t.category||'', t.payment||''];
      lines.push(row.join(','));
    });
    
    const csv = lines.join('\n');
    const blob = new Blob([csv],{type:'text/csv;charset=utf-8;'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `relatorio_financeiro_${new Date().toISOString().slice(0,10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    showMessage('Relatório exportado com sucesso!', 'success');
  }
  
  // Helper to format currency without 'R$ ' prefix for CSV
  function formatCurrencyRaw(v){
    return Number(v).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
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
        showMessage('QR Code gerado com sucesso!', 'success');
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
    const incomes = transactions.filter(t=>t.amount>0).reduce((s,t)=>s+t.amount,0);
    const expenses = transactions.filter(t=>t.amount<0).reduce((s,t)=>s+t.amount,0);
    const balance = +(incomes + expenses).toFixed(2); // current available balance

    // Show prompt for amount to invest
    fullScreenPromptAmount('Quanto deseja investir?', balance).then(amountToInvest => {
      if(!amountToInvest) return;
      
      if(amountToInvest <= 0){
        alert('Valor deve ser maior que zero.');
        return;
      }

      if(amountToInvest > balance){
        alert('Valor maior que o saldo disponível.');
        return;
      }

      const tx = { id: Date.now(), text: 'Investimento', amount: -Math.abs(amountToInvest), date: new Date().toISOString().slice(0,10), category: 'investimento', payment: '' };
      transactions.push(tx);
      save();
      render();
      showMessage(`Investido ${formatCurrency(amountToInvest)} com sucesso.`, 'success');
    });
  }

  // Resgate handler: resgatar um valor do total investido (cria transação positiva de categoria 'resgate')
  async function onRescue(e){
    e && e.preventDefault && e.preventDefault();
    // if user has typed a value in the input use it, otherwise ask with a custom inline prompt
    let raw = rescueAmountInput && rescueAmountInput.value ? parseFloat(rescueAmountInput.value) : NaN;
    const investedIn = transactions
      .filter(t=>t.category==='investimento')
      .reduce((s,t)=>s+Math.abs(t.amount),0);
    const resgatesSoFar = transactions
      .filter(t=>t.category==='resgate')
      .reduce((s,t)=>s+Math.abs(t.amount),0);
    const available = Math.max(0, +(investedIn - resgatesSoFar).toFixed(2));

    // show full-screen custom modal to request amount (pre-filled with input or available)
    try{
      const prefill = (!isNaN(raw) && raw>0) ? raw : available;
      const answer = await topPromptAmount(`Quanto deseja resgatar? Disponível ${formatCurrency(available)}`, prefill);
      if(answer === null) return; // cancelled
      raw = answer;
    }catch(e){
      // fallback to old modal prompt if creation fails
      const answer = await promptAmount(`Quanto deseja resgatar? Disponível ${formatCurrency(available)}`, available);
      if(answer === null) return;
      raw = answer;
    }

    let amountToRescue = NaN;
    if(!isNaN(raw) && raw > 0){
      amountToRescue = raw;
    }else{
      amountToRescue = available;
    }

    if(amountToRescue <= 0){
      showMessage(`Nenhum valor disponível para resgatar. Investido: ${formatCurrency(investedIn)} — Já resgatado: ${formatCurrency(resgatesSoFar)}.`, 'error');
      return;
    }

    if(amountToRescue > available){
      showMessage(`Valor maior que o total investido disponível (${formatCurrency(available)}). Ajuste o valor.`, 'error');
      return;
    }

    const tx = { id: Date.now(), text: 'Resgate investimento', amount: Math.abs(amountToRescue), date: new Date().toISOString().slice(0,10), category: 'resgate', payment: '' };
    transactions.push(tx);
    save();
    render();
    if(rescueAmountInput) rescueAmountInput.value = '';
    showMessage(`Resgatado ${formatCurrency(amountToRescue)} com sucesso.`, 'success');
  }

  // full-screen custom prompt: centered dialog overlay asking for numeric amount
  function fullScreenPromptAmount(message, defaultValue = ''){
    return new Promise((resolve)=>{
      try{
        // remove existing
        const prev = document.getElementById('full-rescue-overlay'); if(prev) prev.remove();
        const overlay = document.createElement('div'); overlay.id = 'full-rescue-overlay';
        overlay.style.position = 'fixed'; overlay.style.left = 0; overlay.style.top = 0; overlay.style.right = 0; overlay.style.bottom = 0;
        overlay.style.background = 'rgba(2,6,23,0.6)'; overlay.style.zIndex = 200000; overlay.style.display = 'flex'; overlay.style.alignItems = 'center'; overlay.style.justifyContent = 'center';

        const dialog = document.createElement('div');
        dialog.style.width = 'min(680px, 92%)'; dialog.style.background = 'var(--card-bg, #fff)'; dialog.style.borderRadius = '14px'; dialog.style.padding = '22px'; dialog.style.boxShadow = '0 20px 60px rgba(2,6,23,0.4)'; dialog.style.maxWidth = '92%';

        const title = document.createElement('h3'); title.textContent = 'Resgate de Investimento'; title.style.margin = '0 0 8px 0'; title.style.fontSize = '1.1rem';
        const descr = document.createElement('div'); descr.textContent = message; descr.style.color = 'var(--muted)'; descr.style.marginBottom = '12px';
        const input = document.createElement('input'); input.type = 'number'; input.step = '0.01'; input.style.width = '100%'; input.style.padding = '12px 14px'; input.style.fontSize = '1.05rem'; input.style.border = '1px solid #e6e9ef'; input.style.borderRadius = '10px'; input.style.marginBottom = '14px';
        if(defaultValue !== undefined && defaultValue !== null) input.value = String(defaultValue);

        const row = document.createElement('div'); row.style.display = 'flex'; row.style.justifyContent = 'flex-end'; row.style.gap = '10px';
        const cancel = document.createElement('button'); cancel.className='btn'; cancel.textContent='Cancelar'; cancel.style.background='#e5e7eb'; cancel.style.color='#111827';
        const ok = document.createElement('button'); ok.className='btn'; ok.textContent='Confirmar'; ok.style.background='linear-gradient(90deg,var(--primary),#7c3aed)'; ok.style.color='#fff';
        row.appendChild(cancel); row.appendChild(ok);

        dialog.appendChild(title); dialog.appendChild(descr); dialog.appendChild(input); dialog.appendChild(row); overlay.appendChild(dialog); document.body.appendChild(overlay);

        function cleanup(){ try{ if(overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay); }catch(e){} }

        cancel.addEventListener('click', ()=>{ cleanup(); resolve(null); });
        ok.addEventListener('click', ()=>{
          const val = parseFloat(input.value);
          if(isNaN(val) || val < 0){ input.style.borderColor = '#ef4444'; input.focus(); return; }
          cleanup(); resolve(+val.toFixed(2));
        });

        overlay.addEventListener('click', (ev)=>{ if(ev.target === overlay){ cancel.click(); } });
        input.addEventListener('keydown', (ev)=>{ if(ev.key === 'Enter'){ ok.click(); } if(ev.key === 'Escape'){ cancel.click(); } });
        setTimeout(()=>{ input.focus(); input.select(); }, 30);
      }catch(e){ resolve(null); }
    });
  }

  // top banner prompt: non-blocking banner under the header asking for amount
  function topPromptAmount(message, defaultValue = ''){
    return new Promise((resolve)=>{
      try{
        const prev = document.getElementById('top-rescue-banner'); if(prev) prev.remove();
        const banner = document.createElement('div'); banner.id = 'top-rescue-banner';
        banner.style.position = 'fixed'; banner.style.top = '72px'; banner.style.left = '50%'; banner.style.transform = 'translateX(-50%)';
        banner.style.zIndex = 200000; banner.style.width = 'min(880px,96%)'; banner.style.background = 'var(--card-bg,#fff)'; banner.style.boxShadow = '0 12px 40px rgba(2,6,23,0.2)';
        banner.style.borderRadius = '10px'; banner.style.padding = '12px 14px'; banner.style.display = 'flex'; banner.style.alignItems = 'center'; banner.style.gap = '10px';

        const text = document.createElement('div'); text.textContent = message; text.style.flex = '1'; text.style.color = 'var(--muted)'; text.style.fontSize = '0.98rem';
        const input = document.createElement('input'); input.type = 'number'; input.step = '0.01'; input.style.width = '160px'; input.style.padding = '8px 10px'; input.style.border = '1px solid #e6e9ef'; input.style.borderRadius = '8px';
        if(defaultValue !== undefined && defaultValue !== null) input.value = String(defaultValue);
        const ok = document.createElement('button'); ok.className = 'btn'; ok.textContent = 'Confirmar'; ok.style.padding = '8px 12px';
        const cancel = document.createElement('button'); cancel.className = 'btn'; cancel.textContent = 'Cancelar'; cancel.style.background = '#e5e7eb'; cancel.style.color = '#111827';

        banner.appendChild(text); banner.appendChild(input); banner.appendChild(ok); banner.appendChild(cancel);
        document.body.appendChild(banner);

        function cleanup(){ try{ if(banner && banner.parentNode) banner.parentNode.removeChild(banner); }catch(e){} }

        cancel.addEventListener('click', ()=>{ cleanup(); resolve(null); });
        ok.addEventListener('click', ()=>{
          const v = parseFloat(input.value);
          if(isNaN(v) || v < 0){ input.style.borderColor = '#ef4444'; input.focus(); return; }
          cleanup(); resolve(+v.toFixed(2));
        });

        input.addEventListener('keydown', (ev)=>{ if(ev.key === 'Enter'){ ok.click(); } if(ev.key === 'Escape'){ cancel.click(); } });
        // ensure it is visible for a11y
        setTimeout(()=>{ input.focus(); input.select(); }, 30);
      }catch(e){ resolve(null); }
    });
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

  // on-screen transient message (toast)
  function showMessage(msg, type = 'info', timeout = 3500){
    try{
      const existing = document.getElementById('app-notification');
      if(existing) existing.remove();
      const el = document.createElement('div');
      el.id = 'app-notification';
      el.setAttribute('role','status');
      el.style.position = 'fixed';
      el.style.right = '20px';
      el.style.bottom = '20px';
      el.style.zIndex = 99999;
      el.style.padding = '12px 16px';
      el.style.borderRadius = '10px';
      el.style.boxShadow = '0 8px 24px rgba(2,6,23,0.18)';
      el.style.color = '#fff';
      el.style.fontSize = '0.95rem';
      el.style.maxWidth = '320px';
      el.style.wordBreak = 'break-word';
      el.style.transition = 'opacity 200ms ease, transform 200ms ease';
      el.style.opacity = '0';
      el.style.transform = 'translateY(8px)';
      if(type === 'success') el.style.background = '#10b981';
      else if(type === 'error') el.style.background = '#ef4444';
      else el.style.background = '#111827';
      el.textContent = msg;
      document.body.appendChild(el);
      // animate in
      requestAnimationFrame(()=>{ el.style.opacity = '1'; el.style.transform = 'translateY(0)'; });
      // auto-remove
      setTimeout(()=>{
        el.style.opacity = '0'; el.style.transform = 'translateY(8px)';
        setTimeout(()=>{ if(el && el.parentNode) el.parentNode.removeChild(el); }, 220);
      }, timeout);
    }catch(e){ /* silently ignore */ }
  }

  // Sidebar behavior (toggle + action handlers)
  function initSidebar(){
    try{
      if(!sidebar) return;
      
      // Handle sidebar toggle button
      if(sidebarOpen){
        sidebarOpen.addEventListener('click', ()=>{
          sidebar.classList.toggle('expanded');
        });
      }
      
      // Handle sidebar close button
      if(sidebarToggle){
        sidebarToggle.addEventListener('click', ()=>{
          sidebar.classList.remove('expanded');
        });
      }
      
      // Close sidebar when clicking outside
      document.addEventListener('click', (e)=>{
        const isClickInsideSidebar = sidebar.contains(e.target);
        const isClickOnOpenBtn = sidebarOpen && sidebarOpen.contains(e.target);
        if(!isClickInsideSidebar && !isClickOnOpenBtn && sidebar.classList.contains('expanded')){
          sidebar.classList.remove('expanded');
        }
      });

      // Handle nav items
      sidebar.querySelectorAll('[data-action]').forEach(btn=>{
        btn.addEventListener('click', (e)=>{
          const a = btn.getAttribute('data-action');
          if(a === 'export-csv'){ onExportCSV(); }
          else if(a === 'export-report'){ exportExcel(); }
          else if(a === 'generate-qr'){ onGenerateQR(); }
          else if(a === 'focus-invest'){ onInvest(); }
          else if(a === 'focus-rescue'){ onRescue(); }
          sidebar.classList.remove('expanded');
        });
      });
    }catch(e){/* ignore */}
  }

  // Update sidebar with current financial info
  function updateSidebarInfo(invested, resgates, available){
    // This can be used to show live info in sidebar if needed
  }

  // try initialize sidebar after DOM ready (in case elements present)
  try{ document.addEventListener('DOMContentLoaded', initSidebar); }catch(e){}

  // modal prompt asking for an amount (returns number or null if cancelled)
  function promptAmount(message, defaultValue = ''){
    return new Promise((resolve)=>{
      try{
        // remove existing prompt if any
        const prev = document.getElementById('app-prompt-overlay'); if(prev) prev.remove();
        const overlay = document.createElement('div');
        overlay.id = 'app-prompt-overlay';
        overlay.style.position = 'fixed'; overlay.style.left = 0; overlay.style.top = 0; overlay.style.right = 0; overlay.style.bottom = 0;
        overlay.style.background = 'rgba(2,6,23,0.45)'; overlay.style.zIndex = 100000;
        overlay.style.display = 'flex'; overlay.style.alignItems = 'center'; overlay.style.justifyContent = 'center';

        const dialog = document.createElement('div');
        dialog.style.background = 'var(--card-bg, #fff)'; dialog.style.padding = '18px'; dialog.style.borderRadius = '12px';
        dialog.style.minWidth = '320px'; dialog.style.maxWidth = '92%'; dialog.style.boxShadow = '0 12px 40px rgba(2,6,23,0.25)';

        const label = document.createElement('div'); label.style.marginBottom = '8px'; label.style.color = 'var(--muted, #374151)'; label.textContent = message;
        const input = document.createElement('input'); input.type = 'number'; input.step = '0.01'; input.style.width = '100%'; input.style.padding = '10px 12px'; input.style.borderRadius = '8px'; input.style.border = '1px solid #e6e9ef'; input.style.marginBottom = '12px';
        if(defaultValue) input.value = String(defaultValue);

        const btnRow = document.createElement('div'); btnRow.style.display = 'flex'; btnRow.style.justifyContent = 'flex-end'; btnRow.style.gap = '8px';
        const cancelBtn = document.createElement('button'); cancelBtn.textContent = 'Cancelar'; cancelBtn.className = 'btn'; cancelBtn.style.background = '#e5e7eb'; cancelBtn.style.color = '#111827';
        const okBtn = document.createElement('button'); okBtn.textContent = 'Confirmar'; okBtn.className = 'btn'; okBtn.style.background = '#10b981'; okBtn.style.color = '#fff';

        btnRow.appendChild(cancelBtn); btnRow.appendChild(okBtn);
        dialog.appendChild(label); dialog.appendChild(input); dialog.appendChild(btnRow); overlay.appendChild(dialog); document.body.appendChild(overlay);

        function cleanup(){ if(overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay); }

        cancelBtn.addEventListener('click', ()=>{ cleanup(); resolve(null); });
        okBtn.addEventListener('click', ()=>{
          const val = parseFloat(input.value);
          if(isNaN(val) || val < 0){ input.style.borderColor = '#ef4444'; input.focus(); return; }
          cleanup(); resolve(+val.toFixed(2));
        });

        input.addEventListener('keydown', (ev)=>{ if(ev.key === 'Enter'){ okBtn.click(); } if(ev.key === 'Escape'){ cancelBtn.click(); } });
        // focus
        setTimeout(()=>{ input.focus(); input.select(); }, 20);
      }catch(e){ resolve(null); }
    });
  }

})();
