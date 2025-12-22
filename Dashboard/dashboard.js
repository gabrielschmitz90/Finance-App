// dashboard.js — renderiza gráficos a partir de localStorage com filtros avançados
(function(){
  const STORAGE_KEY = 'transactions_v1';
  const CATEGORIES_KEY = 'categories_v1';

  // Category colors
  const categoryColors = {
    alimentacao: '#ef4444',
    transporte: '#f97316',
    moradia: '#eab308',
    lazer: '#84cc16',
    saude: '#10b981',
    salario: '#06b6d4',
    investimento: '#8b5cf6',
    resgate: '#06b6d4',
    outros: '#64748b'
  };

  function getCategoryColor(category) {
    return categoryColors[category] || '#94a3b8';
  }

  function load(){ try{ return JSON.parse(localStorage.getItem(STORAGE_KEY))||[] }catch(e){return []} }
  
  function formatCurrency(v){ return 'R$ ' + Number(v).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}); }
  
  function palette(i){ 
    const cols = Object.values(categoryColors);
    return cols[i % cols.length]; 
  }

  const tx = load();
  let catChart = null;
  let balChart = null;

  // Filter state
  let currentFilters = {
    period: 'all',
    type: 'all',
    month: null,
    categories: new Set()
  };

  // Initialize filters
  function initializeFilters() {
    const periodSelect = document.getElementById('filter-period');
    const typeSelect = document.getElementById('filter-type');
    const monthInput = document.getElementById('filter-month');

    if(periodSelect) {
      periodSelect.addEventListener('change', (e) => {
        currentFilters.period = e.target.value;
        renderDashboard();
      });
    }

    if(typeSelect) {
      typeSelect.addEventListener('change', (e) => {
        currentFilters.type = e.target.value;
        renderDashboard();
      });
    }

    if(monthInput) {
      monthInput.addEventListener('change', (e) => {
        currentFilters.month = e.target.value || null;
        renderDashboard();
      });
    }

    // Create category pills
    createCategoryPills();
  }

  function createCategoryPills() {
    const container = document.getElementById('category-pills');
    if(!container) return;

    // Get all unique categories from transactions
    const categories = new Set();
    tx.forEach(t => {
      if(t.category && t.category !== 'investimento' && t.category !== 'resgate') {
        categories.add(t.category);
      }
    });

    // Add "All" pill
    const allPill = document.createElement('button');
    allPill.className = 'pill active';
    allPill.style.borderColor = '#7c3aed';
    allPill.style.color = '#fff';
    allPill.textContent = 'Todas';
    allPill.addEventListener('click', () => {
      currentFilters.categories.clear();
      document.querySelectorAll('.pill').forEach(p => {
        p.classList.remove('active');
        p.style.borderColor = '#64748b';
      });
      allPill.classList.add('active');
      allPill.style.borderColor = '#7c3aed';
      renderDashboard();
    });
    container.appendChild(allPill);

    // Add category pills
    Array.from(categories).sort().forEach(cat => {
      const pill = document.createElement('button');
      pill.className = 'pill';
      const color = getCategoryColor(cat);
      pill.style.borderColor = color;
      pill.textContent = cat.charAt(0).toUpperCase() + cat.slice(1);
      
      pill.addEventListener('click', () => {
        const allPill = document.querySelector('.pill.active');
        if(currentFilters.categories.has(cat)) {
          currentFilters.categories.delete(cat);
          pill.classList.remove('active');
          pill.style.borderColor = color;
        } else {
          allPill.classList.remove('active');
          allPill.style.borderColor = '#64748b';
          currentFilters.categories.add(cat);
          pill.classList.add('active');
        }
        renderDashboard();
      });
      container.appendChild(pill);
    });
  }

  // Filter transactions
  function filterTransactions(transactions) {
    let filtered = transactions.slice();

    // Filter by period
    const now = new Date();
    if(currentFilters.period !== 'all') {
      filtered = filtered.filter(t => {
        const tDate = new Date(t.date);
        switch(currentFilters.period) {
          case 'current-month':
            return tDate.getMonth() === now.getMonth() && tDate.getFullYear() === now.getFullYear();
          case 'last-3-months':
            const date3m = new Date(now.getFullYear(), now.getMonth() - 3, now.getDate());
            return tDate >= date3m;
          case 'last-6-months':
            const date6m = new Date(now.getFullYear(), now.getMonth() - 6, now.getDate());
            return tDate >= date6m;
          case 'current-year':
            return tDate.getFullYear() === now.getFullYear();
          default:
            return true;
        }
      });
    }

    // Filter by month
    if(currentFilters.month) {
      filtered = filtered.filter(t => {
        const tDate = new Date(t.date);
        const [year, month] = currentFilters.month.split('-');
        return tDate.getFullYear() === parseInt(year) && 
               tDate.getMonth() === parseInt(month) - 1;
      });
    }

    // Filter by type
    if(currentFilters.type === 'income') {
      filtered = filtered.filter(t => t.amount > 0);
    } else if(currentFilters.type === 'expense') {
      filtered = filtered.filter(t => t.amount < 0);
    }

    // Filter by categories
    if(currentFilters.categories.size > 0) {
      filtered = filtered.filter(t => currentFilters.categories.has(t.category));
    }

    return filtered;
  }

  function getCategoryAggregation(transactions){
    const byCat = {};
    transactions.filter(t=>t.amount<0 && t.category!=='investimento' && t.category!=='resgate').forEach(t=>{
      const c = t.category || 'outros';
      byCat[c] = (byCat[c]||0) + Math.abs(t.amount);
    });

    const labels = Object.keys(byCat);
    const data = labels.map(l=>byCat[l]);
    const colors = labels.map(l => getCategoryColor(l));
    return {labels, data, colors};
  }

  function getBalanceOverTime(transactions){
    const map = new Map();
    transactions.slice().sort((a,b)=> new Date(a.date) - new Date(b.date)).forEach(t=>{
      const d = t.date;
      map.set(d, (map.get(d) || 0) + t.amount);
    });
    const dates = Array.from(map.keys()).sort((a,b)=> new Date(a)-new Date(b));
    const labels = []; const data = []; let cum = 0;
    dates.forEach(d=>{ cum += map.get(d); labels.push(new Date(d).toLocaleDateString('pt-BR')); data.push(+cum.toFixed(2)); });
    return {labels,data};
  }

  function renderDashboard(){
    const filtered = filterTransactions(tx);

    // Update summary cards
    updateSummaryCards(filtered);

    // category pie chart
    try{
      const cat = getCategoryAggregation(filtered);
      const catEl = document.getElementById('category-chart');
      if(!catEl){ console.warn('category-chart element not found'); }
      else{
        if(catChart) try{ catChart.destroy(); }catch(e){}
        const ctx = catEl.getContext('2d');
        if(!cat.labels || !cat.labels.length){
          catChart = new Chart(ctx, { type:'pie', data:{ labels:['Sem despesas'], datasets:[{ data:[1], backgroundColor:['#e5e7eb'] }] }, options:{ plugins:{legend:{display:false}} } });
        }else{
          catChart = new Chart(ctx, { type:'pie', data:{ labels:cat.labels, datasets:[{ data:cat.data, backgroundColor:cat.colors }] }, options:{ plugins:{legend:{position:'bottom'}}, responsive: true, maintainAspectRatio: false } });
        }
      }
    }catch(e){ console.warn('category chart error', e); }

    // balance chart
    try{
      const balEl = document.getElementById('balance-chart');
      if(!balEl){ console.warn('balance-chart element not found'); }
      else{
        if(balChart) try{ balChart.destroy(); }catch(e){}
        const ctx = balEl.getContext('2d');
        const bal = getBalanceOverTime(filtered);
        if(!bal.labels || !bal.labels.length){
          balChart = new Chart(ctx, { type:'line', data:{ labels:['Sem dados'], datasets:[{ label:'Saldo', data:[0], borderColor:'#7c3aed', backgroundColor:'rgba(124,58,237,0.08)', fill:true }] }, options:{plugins:{legend:{display:false}}} });
        } else {
          balChart = new Chart(ctx, { type:'line', data:{ labels:bal.labels, datasets:[{ label:'Saldo acumulado', data:bal.data, borderColor:'rgba(124,58,237,0.95)', backgroundColor:'rgba(124,58,237,0.08)', fill:true, tension:0.3, borderWidth: 3 }] }, options:{ plugins:{legend:{display:false}}, scales:{ y:{ ticks:{ callback: function(v){ return 'R$ '+Number(v).toLocaleString('pt-BR',{minimumFractionDigits:0}) } } } }, responsive: true, maintainAspectRatio: false } });
        }
      }
    }catch(e){ console.warn('balance chart error', e); }

    // Update category breakdown
    updateCategoryBreakdown(filtered);

    // Update statistics
    updateStatistics(filtered);
  }

  function updateSummaryCards(transactions) {
    const incomes = transactions.filter(t=>t.amount>0).reduce((s,t)=>s+t.amount,0);
    const expenses = transactions.filter(t=>t.amount<0).reduce((s,t)=>s+t.amount,0);
    const balance = incomes + expenses;
    const invested = transactions.filter(t=>t.category==='investimento').reduce((s,t)=>s+Math.abs(t.amount),0);

    const incomeEl = document.getElementById('total-income-value');
    const expenseEl = document.getElementById('total-expenses-value');
    const balanceEl = document.getElementById('total-balance-value');
    const investedEl = document.getElementById('total-invested-value');

    if(incomeEl) incomeEl.textContent = formatCurrency(incomes);
    if(expenseEl) expenseEl.textContent = formatCurrency(Math.abs(expenses));
    if(balanceEl) {
      balanceEl.textContent = formatCurrency(balance);
      const balanceCard = balanceEl.closest('.summary-card');
      if(balanceCard) {
        balanceCard.style.borderColor = balance >= 0 ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)';
      }
    }
    if(investedEl) investedEl.textContent = formatCurrency(invested);
  }

  function updateCategoryBreakdown(transactions) {
    const byCat = {};
    const expenses = transactions.filter(t=>t.amount<0 && t.category!=='investimento' && t.category!=='resgate');
    const totalExpense = expenses.reduce((s,t)=>s+Math.abs(t.amount),0);

    expenses.forEach(t=>{
      const c = t.category || 'outros';
      byCat[c] = (byCat[c]||0) + Math.abs(t.amount);
    });

    const container = document.getElementById('category-breakdown');
    if(!container) return;

    container.innerHTML = '';
    Object.entries(byCat).sort((a,b)=>b[1]-a[1]).forEach(([cat, amount]) => {
      const pct = totalExpense > 0 ? ((amount/totalExpense)*100).toFixed(1) : 0;
      const item = document.createElement('div');
      item.className = 'category-item';
      const color = getCategoryColor(cat);
      item.style.borderLeftColor = color;
      
      item.innerHTML = `
        <div class="category-item-info">
          <div class="category-color-box" style="background-color: ${color}"></div>
          <div class="category-item-text">
            <h4>${cat.charAt(0).toUpperCase() + cat.slice(1)}</h4>
            <p>${Object.values(byCat).length} transação(ões)</p>
          </div>
        </div>
        <div class="category-item-value">
          <div class="amount">${formatCurrency(amount)}</div>
          <div class="percentage">${pct}%</div>
        </div>
      `;
      container.appendChild(item);
    });
  }

  function updateStatistics(transactions) {
    const totalTx = transactions.length;
    const expenses = transactions.filter(t=>t.amount<0).map(t=>Math.abs(t.amount));
    const maxExpense = expenses.length > 0 ? Math.max(...expenses) : 0;
    const avgExpense = expenses.length > 0 ? expenses.reduce((a,b)=>a+b,0)/expenses.length : 0;

    const datesSet = new Set(transactions.map(t=>t.date));
    const daysMonitored = datesSet.size;

    const txEl = document.getElementById('stat-total-transactions');
    const maxEl = document.getElementById('stat-max-expense');
    const avgEl = document.getElementById('stat-avg-expense');
    const daysEl = document.getElementById('stat-days');

    if(txEl) txEl.textContent = totalTx;
    if(maxEl) maxEl.textContent = formatCurrency(maxExpense);
    if(avgEl) avgEl.textContent = formatCurrency(avgExpense);
    if(daysEl) daysEl.textContent = daysMonitored;
  }

  // Initialize sidebar
  function initSidebar(){
    try{
      const sidebar = document.getElementById('app-sidebar');
      const sidebarOpen = document.getElementById('sidebar-open');
      const toggle = document.getElementById('sidebar-toggle');
      if(!sidebar) return;
      
      if(sidebarOpen){
        sidebarOpen.addEventListener('click', ()=>{
          sidebar.classList.toggle('expanded');
        });
      }
      
      if(toggle){
        toggle.addEventListener('click', ()=>{
          sidebar.classList.remove('expanded');
        });
      }
      
      document.addEventListener('click', (e)=>{
        const isClickInsideSidebar = sidebar.contains(e.target);
        const isClickOnOpenBtn = sidebarOpen && sidebarOpen.contains(e.target);
        if(!isClickInsideSidebar && !isClickOnOpenBtn && sidebar.classList.contains('expanded')){
          sidebar.classList.remove('expanded');
        }
      });

      sidebar.querySelectorAll('[data-action]').forEach(btn=>{
        btn.addEventListener('click', ()=>{
          const a = btn.getAttribute('data-action');
          if(a === 'export-csv'){ 
            if(!tx.length){ alert('Nenhuma transação para exportar'); return; }
            const header = ['id','text','amount','date','category','payment'];
            const lines = [header.join(',')];
            tx.forEach(t=>{ const row = [t.id, '"'+String(t.text).replace(/"/g,'""')+'"', t.amount, t.date, t.category||'', t.payment||'']; lines.push(row.join(',')); });
            const csv = lines.join('\n'); const blob = new Blob([csv],{type:'text/csv;charset=utf-8;'}); const url = URL.createObjectURL(blob);
            const link = document.createElement('a'); link.href = url; link.download = `transactions_${new Date().toISOString().slice(0,10)}.csv`; document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url);
            alert('Dados exportados com sucesso!');
          }
          else if(a === 'export-report'){ exportExcelDashboard(); }
          sidebar.classList.remove('expanded');
        });
      });
    }catch(e){console.error(e);}
  }

  // Export Excel (enhanced)
  function exportExcelDashboard(){
    if(!tx.length){ alert('Nenhuma transação para exportar'); return; }
    
    const incomes = tx.filter(t=>t.amount>0).reduce((s,t)=>s+t.amount,0);
    const expenses = tx.filter(t=>t.amount<0).reduce((s,t)=>s+t.amount,0);
    const balance = incomes + expenses;
    const invested = tx.filter(t=>t.category==='investimento').reduce((s,t)=>s+Math.abs(t.amount),0);
    const resgates = tx.filter(t=>t.category==='resgate').reduce((s,t)=>s+Math.abs(t.amount),0);
    
    const byCat = {};
    tx.filter(t=>t.amount<0 && t.category!=='investimento').forEach(t=>{
      const c = t.category || 'outros';
      byCat[c] = (byCat[c]||0) + Math.abs(t.amount);
    });
    
    const monthlyMap = new Map();
    tx.forEach(t=>{
      const dt = new Date(t.date);
      if(isNaN(dt)) return;
      const key = dt.getFullYear() + '-' + String(dt.getMonth()+1).padStart(2,'0');
      monthlyMap.set(key, (monthlyMap.get(key)||0) + t.amount);
    });
    
    const lines = [];
    lines.push('RELATÓRIO FINANCEIRO - DASHBOARD');
    lines.push('Data da Geração: ' + new Date().toLocaleString('pt-BR'));
    lines.push('');
    lines.push('RESUMO FINANCEIRO');
    lines.push('Receitas,' + Number(incomes).toLocaleString('pt-BR',{minimumFractionDigits:2}));
    lines.push('Despesas,' + Number(Math.abs(expenses)).toLocaleString('pt-BR',{minimumFractionDigits:2}));
    lines.push('Investido,' + Number(invested).toLocaleString('pt-BR',{minimumFractionDigits:2}));
    lines.push('Resgatado,' + Number(resgates).toLocaleString('pt-BR',{minimumFractionDigits:2}));
    lines.push('Saldo Total,' + Number(balance).toLocaleString('pt-BR',{minimumFractionDigits:2}));
    lines.push('');
    lines.push('DESPESAS POR CATEGORIA');
    Object.entries(byCat).forEach(([cat, amount]) => {
      const pct = (amount/Math.abs(expenses)*100).toFixed(1);
      lines.push(cat + ',' + Number(amount).toLocaleString('pt-BR',{minimumFractionDigits:2}) + ',' + pct + '%');
    });
    lines.push('');
    lines.push('EVOLUÇÃO MENSAL');
    Array.from(monthlyMap.keys()).sort().forEach(month => {
      const amount = monthlyMap.get(month);
      lines.push(month + ',' + Number(amount).toLocaleString('pt-BR',{minimumFractionDigits:2}));
    });
    lines.push('');
    lines.push('TRANSAÇÕES DETALHADAS');
    lines.push('ID,Descrição,Valor,Data,Categoria,Pagamento');
    tx.slice().reverse().forEach(t=>{
      const row = [t.id, '"'+String(t.text).replace(/"/g,'""')+'"', Number(t.amount).toLocaleString('pt-BR',{minimumFractionDigits:2}), t.date, t.category||'', t.payment||''];
      lines.push(row.join(','));
    });
    
    const csv = lines.join('\n');
    const blob = new Blob([csv],{type:'text/csv;charset=utf-8;'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `relatorio_dashboard_${new Date().toISOString().slice(0,10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    alert('Relatório exportado com sucesso!');
  }

  // Initialize
  initializeFilters();
  initSidebar();
  renderDashboard();
})();
