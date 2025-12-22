// dashboard.js — rendeiza gráficos a partir de localStorage
(function(){
  const STORAGE_KEY = 'transactions_v1';
  function load(){ try{ return JSON.parse(localStorage.getItem(STORAGE_KEY))||[] }catch(e){return []} }
  function formatCurrency(v){ return 'R$ ' + Number(v).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}); }
  function palette(i){ const cols=['#f00d0dff','#c2590eff','#f59e0b','#84cc16','#10b981','#06b6d4','#3b82f6','#8b5cf6','#ec4899']; return cols[i%cols.length]; }

  const tx = load();
  let catChart = null;
  let balChart = null;

  function getCategoryAggregation(transactions){
    const byCat = {};
    transactions.filter(t=>t.amount<0 && t.category!=='investimento').forEach(t=>{
      const c = t.category || 'outros';
      byCat[c] = (byCat[c]||0) + Math.abs(t.amount);
    });

    // try to load saved categories list from index page
    let savedCats = null;
    try{ savedCats = JSON.parse(localStorage.getItem('categories_v1')||'null'); }catch(e){ savedCats = null; }

    if(savedCats && Array.isArray(savedCats) && savedCats.length){
      const labels = savedCats.map(c=>c.label);
      const data = savedCats.map(c=> +(byCat[c.value]||0).toFixed(2));
      return {labels,data};
    }

    const labels = Object.keys(byCat);
    const data = labels.map(l=>byCat[l]);
    return {labels,data};
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

    // monthly evolution: returns last N months labels and net sums per month
    function getMonthlyEvolution(transactions, months = 12){
      const map = new Map();
      transactions.forEach(t=>{
        const dt = new Date(t.date);
        if(isNaN(dt)) return;
        const key = dt.getFullYear() + '-' + String(dt.getMonth()+1).padStart(2,'0');
        map.set(key, (map.get(key)||0) + t.amount);
      });
      // build last `months` months keys
      const outLabels = [];
      const outData = [];
      const now = new Date();
      for(let i = months-1; i >= 0; i--){
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const key = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0');
        const label = d.toLocaleString('pt-BR',{month:'short', year:'numeric'});
        outLabels.push(label);
        outData.push( +(map.get(key)||0).toFixed(2) );
      }
      return {labels: outLabels, data: outData};
    }

  // helper: filter transactions by month key 'YYYY-MM' (or null for all)
  function filterByMonth(transactions, monthKey){
    if(!monthKey) return transactions.slice();
    return transactions.filter(t=>{
      const dt = new Date(t.date);
      if(isNaN(dt)) return false;
      const key = dt.getFullYear() + '-' + String(dt.getMonth()+1).padStart(2,'0');
      return key === monthKey;
    });
  }

  // render charts given optional monthKey
  function renderDashboard(monthKey){
    const filtered = filterByMonth(tx, monthKey);

    // category pie
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
          catChart = new Chart(ctx, { type:'pie', data:{ labels:cat.labels, datasets:[{ data:cat.data, backgroundColor:cat.labels.map((_,i)=>palette(i)) }] }, options:{ plugins:{legend:{position:'bottom'}} } });
        }
      }
    }catch(e){ console.warn('category chart error', e); }

    // balance chart: if month selected, show daily cumulative for that month, else monthly evolution
    try{
      const balEl = document.getElementById('balance-chart');
      if(!balEl){ console.warn('balance-chart element not found'); }
      else{
        if(balChart) try{ balChart.destroy(); }catch(e){}
        const ctx = balEl.getContext('2d');
        if(monthKey){
          // build cumulative per day within month
          const map = new Map();
          filtered.slice().sort((a,b)=> new Date(a.date) - new Date(b.date)).forEach(t=>{
            const d = t.date;
            map.set(d, (map.get(d) || 0) + t.amount);
          });
          const dates = Array.from(map.keys()).sort((a,b)=> new Date(a)-new Date(b));
          let cum = 0; const labels = [], data = [];
          dates.forEach(d=>{ cum += map.get(d); labels.push(new Date(d).toLocaleDateString('pt-BR')); data.push(+cum.toFixed(2)); });
          balChart = new Chart(ctx, { type:'line', data:{ labels, datasets:[{ label:'Saldo acumulado (mês)', data, borderColor:'rgba(59,130,246,0.95)', backgroundColor:'rgba(59,130,246,0.08)', fill:true, tension:0.2 }] }, options:{ plugins:{legend:{display:false}}, scales:{ y:{ ticks:{ callback: function(v){ return 'R$ '+Number(v).toLocaleString('pt-BR',{minimumFractionDigits:2}) } } } } }});
        }else{
          const monthly = getMonthlyEvolution(tx, 12);
          balChart = new Chart(ctx, { type:'line', data:{ labels:monthly.labels, datasets:[{ label:'Variação mensal (saldo líquido)', data:monthly.data, borderColor:'rgba(59,130,246,0.95)', backgroundColor:'rgba(59,130,246,0.08)', fill:true, tension:0.2 }] }, options:{ plugins:{legend:{display:false}}, scales:{ y:{ ticks:{ callback: function(v){ return 'R$ '+Number(v).toLocaleString('pt-BR',{minimumFractionDigits:2}) } } } } }});
        }
      }
    }catch(e){ console.warn('balance chart error', e); }
  }

  // export CSV
  document.getElementById('export-dashboard-csv').addEventListener('click', ()=>{
    if(!tx.length){ alert('Nenhuma transação para exportar'); return; }
    const header = ['id','text','amount','date','category','payment'];
    const lines = [header.join(',')];
    tx.forEach(t=>{ const row = [t.id, '"'+String(t.text).replace(/"/g,'""')+'"', t.amount, t.date, t.category||'', t.payment||'']; lines.push(row.join(',')); });
    const csv = lines.join('\n'); const blob = new Blob([csv],{type:'text/csv;charset=utf-8;'}); const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `transactions_${new Date().toISOString().slice(0,10)}.csv`; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  });

  // clear data
  document.getElementById('clear-data').addEventListener('click', ()=>{
    if(!confirm('Tem certeza que deseja apagar todas as transações salvas?')) return;
    localStorage.removeItem(STORAGE_KEY);
    location.reload();
  });

  // initialize controls: month filter
  try{
    const monthInput = document.getElementById('month-filter');
    const clearBtn = document.getElementById('clear-month');
    if(monthInput){
      const now = new Date();
      const defaultKey = now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0');
      monthInput.value = defaultKey;
      monthInput.addEventListener('change', ()=>{ renderDashboard(monthInput.value || null); });
      clearBtn && clearBtn.addEventListener('click', ()=>{ monthInput.value = ''; renderDashboard(null); });
    }
  }catch(e){/* ignore */}

  // initial render
  try{ renderDashboard(document.getElementById('month-filter')?.value || null); }catch(e){ renderDashboard(null); }

  // Auto-reset toggle and manual reset
  const autoEl = document.getElementById('auto-reset');
  const resetNowBtn = document.getElementById('reset-now');
  try{
    const auto = localStorage.getItem('auto_reset_monthly');
    autoEl.checked = auto === '1';
  }catch(e){/* ignore */}
  autoEl.addEventListener('change', ()=>{
    localStorage.setItem('auto_reset_monthly', autoEl.checked ? '1' : '0');
    alert('Configuração salva. Quando ativado, o app arquiva e zera dados ao detectar novo mês (opt-in).');
  });

  resetNowBtn.addEventListener('click', ()=>{
    if(!confirm('Arquivar as transações atuais e iniciar novo mês?')) return;
    // archive under key archive_YYYY-MM for current month
    try{
      const now = new Date();
      const key = now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0');
      const archiveKey = 'archive_' + key;
      localStorage.setItem(archiveKey, JSON.stringify(tx));
      localStorage.removeItem(STORAGE_KEY);
      localStorage.setItem('last_reset_month', key);
      alert('Dados arquivados em '+archiveKey+' e transações zeradas.');
      location.reload();
    }catch(e){ alert('Erro ao arquivar dados. Veja console.'); console.error(e); }
  });

  // Helper to format currency without 'R$ ' prefix for CSV
  function formatCurrencyRaw(v){
    return Number(v).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
  }

  // Export Excel (enhanced with summaries and insights)
  function exportExcelDashboard(){
    if(!tx.length){ alert('Nenhuma transação para exportar'); return; }
    
    // Calculate summaries
    const incomes = tx.filter(t=>t.amount>0).reduce((s,t)=>s+t.amount,0);
    const expenses = tx.filter(t=>t.amount<0).reduce((s,t)=>s+t.amount,0);
    const balance = incomes + expenses;
    const invested = tx.filter(t=>t.category==='investimento').reduce((s,t)=>s+Math.abs(t.amount),0);
    const resgates = tx.filter(t=>t.category==='resgate').reduce((s,t)=>s+Math.abs(t.amount),0);
    
    // Calculate by category
    const byCat = {};
    tx.filter(t=>t.amount<0 && t.category!=='investimento').forEach(t=>{
      const c = t.category || 'outros';
      byCat[c] = (byCat[c]||0) + Math.abs(t.amount);
    });
    
    // Calculate monthly evolution
    const monthlyMap = new Map();
    tx.forEach(t=>{
      const dt = new Date(t.date);
      if(isNaN(dt)) return;
      const key = dt.getFullYear() + '-' + String(dt.getMonth()+1).padStart(2,'0');
      monthlyMap.set(key, (monthlyMap.get(key)||0) + t.amount);
    });
    
    // Build CSV content with multiple sections
    const lines = [];
    
    // Header
    lines.push('RELATÓRIO FINANCEIRO - DASHBOARD');
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
    tx.slice().reverse().forEach(t=>{
      const row = [t.id, '"'+String(t.text).replace(/"/g,'""')+'"', formatCurrencyRaw(t.amount), t.date, t.category||'', t.payment||''];
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

  // Sidebar handlers for dashboard page
  function initSidebarDashboard(){
    try{
      const sidebar = document.getElementById('app-sidebar');
      const sidebarOpen = document.getElementById('sidebar-open');
      const toggle = document.getElementById('sidebar-toggle');
      if(!sidebar) return;
      
      // Handle sidebar open button
      if(sidebarOpen){
        sidebarOpen.addEventListener('click', ()=>{
          sidebar.classList.toggle('expanded');
        });
      }
      
      // Handle sidebar close button
      if(toggle){
        toggle.addEventListener('click', ()=>{
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
        btn.addEventListener('click', ()=>{
          const a = btn.getAttribute('data-action');
          if(a === 'export-csv'){ 
            // Export basic CSV
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
  try{ initSidebarDashboard(); }catch(e){}
})();