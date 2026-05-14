// DATA & STATE
// ------------------------------------------
let items = [];       // raw materials with price info (admin sets base price)
let products = [];    // product recipes
let stocks = {};      // { itemId: { qty: number, threshold: number, avgPrice: number } }
let draftPurchaseItems = [];
let currentRole = localStorage.getItem('roaluxRole') || null; // 'manager' | 'admin'
let selectedLoginRole = null;
let currentReportData = null;
let currentReportDate = null;

const PASSWORDS = {
    manager: 'manager123',
    admin: 'admin123'
};

function formatDate(date) {
    if (!date) return '—';
    return new Date(date).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

// INIT
// ------------------------------------------
async function init() {
    try {
        const [itemsRes, prodsRes, stocksRes] = await Promise.all([
            fetch('/api/items'),
            fetch('/api/products'),
            fetch('/api/stocks').catch(() => ({ json: () => ({}) }))
        ]);
        items = await itemsRes.json();
        products = await prodsRes.json();
        
        if (items.error) {
            alert("Error loading raw materials: " + items.error);
            console.error("Items Error:", items.error);
            return;
        }
        if (products.error) {
            alert("Error loading products: " + products.error);
            console.error("Products Error:", products.error);
            return;
        }

        try { stocks = await stocksRes.json(); } catch (e) { stocks = {}; }
        if (!stocks || typeof stocks !== 'object') stocks = {};

        renderItems();
        renderProducts();
        renderStock();
        updateNavCounts();
        renderLowStockAlerts();

        // Initialize User Calc split dropdowns
        populateAllSelects();

        console.log("Init successful. Items:", items.length, "Products:", products.length);
        console.log("Current role:", currentRole);

        if (currentRole) {
            applyRole(currentRole);
            updateUserCalc();
            showTab('user-calc');
        } else {
            showTab('login');
        }
    } catch (e) {
        console.error("Init failed:", e);
        items = []; products = []; stocks = {};
        alert("Initialization failed: " + e.message);
    }
}
init();

// AUTH & ROLE SYSTEM
// ------------------------------------------
function openLoginPortal() {
    if (currentRole) {
        // Logout
        currentRole = null;
        selectedLoginRole = null;
        localStorage.removeItem('roaluxRole');
        applyRole(null);
        showTab('login');
        document.getElementById('login-toggle-btn').textContent = 'SIGN IN';
        document.getElementById('login-toggle-btn').className = 'btn btn-xs btn-ghost';
        return;
    }
    showTab('login');
    resetLoginForm();
}

function resetLoginForm() {
    selectedLoginRole = null;
    document.querySelectorAll('.role-btn').forEach(b => b.classList.remove('selected'));
    document.getElementById('pw-field').style.display = 'none';
    document.getElementById('login-error').style.display = 'none';
    document.getElementById('admin-pw').value = '';
    document.getElementById('login-sub').textContent = 'Select your role to continue';
}

function selectRole(role) {
    selectedLoginRole = role;
    document.querySelectorAll('.role-btn').forEach(b => b.classList.remove('selected'));
    const btn = document.getElementById('role-btn-' + role);
    btn.classList.add('selected');

    document.getElementById('login-error').style.display = 'none';

    if (role === 'manager') {
        document.getElementById('pw-field').style.display = 'block';
        document.getElementById('pw-label').textContent = 'Manager Password';
        document.getElementById('login-sub').textContent = 'Manager: Stock management + Calculator';
        document.getElementById('admin-pw').value = '';
        document.getElementById('admin-pw').focus();
    } else {
        document.getElementById('pw-field').style.display = 'block';
        document.getElementById('pw-label').textContent = 'Admin Password';
        document.getElementById('login-sub').textContent = 'Admin: Full system access';
        document.getElementById('admin-pw').value = '';
        document.getElementById('admin-pw').focus();
    }
}

function doLogin() {
    if (!selectedLoginRole) {
        document.getElementById('login-error').style.display = 'block';
        document.getElementById('login-error').innerHTML = 'Please select a role first.';
        return;
    }

    const errEl = document.getElementById('login-error');
    errEl.style.display = 'none';

    const pw = document.getElementById('admin-pw').value;
    if (pw === PASSWORDS[selectedLoginRole]) {
        currentRole = selectedLoginRole;
        localStorage.setItem('roaluxRole', selectedLoginRole);
        applyRole(selectedLoginRole);
        showTab('user-calc');
    } else {
        errEl.style.display = 'block';
        errEl.innerHTML = 'Incorrect password. Please try again.';
        document.getElementById('admin-pw').value = '';
        document.getElementById('admin-pw').focus();
    }
}

function logout() {
    currentRole = null;
    selectedLoginRole = null;
    localStorage.removeItem('roaluxRole');
    const pwEl = document.getElementById('admin-pw');
    if (pwEl) pwEl.value = '';
    applyRole(null);
    showTab('login');
}

function applyRole(role) {
    const roleBadgeWrap = document.getElementById('role-badge-wrap');
    const badge = document.getElementById('sidebar-role-badge');
    const managerSections = document.querySelectorAll('.manager-only');
    const adminSections = document.querySelectorAll('.admin-only');

    roleBadgeWrap.style.display = role ? 'block' : 'none';
    const logoutWrap = document.getElementById('logout-wrap');
    if (logoutWrap) logoutWrap.style.display = role ? 'block' : 'none';
    if (!role) {
        managerSections.forEach(el => el.style.display = 'none');
        adminSections.forEach(el => el.style.display = 'none');
        return;
    }

    if (role === 'manager') {
        badge.innerHTML = '<div class="role-dot"></div> Manager';
        badge.className = 'role-badge manager';
        managerSections.forEach(el => el.style.display = 'block');
        adminSections.forEach(el => el.style.display = 'none');
        const stockAddCard = document.getElementById('stock-add-card');
        if (stockAddCard) stockAddCard.style.display = 'none';
    } else if (role === 'admin') {
        badge.innerHTML = '<div class="role-dot"></div> Admin';
        badge.className = 'role-badge admin';
        managerSections.forEach(el => el.style.display = 'block');
        adminSections.forEach(el => el.style.display = 'block');
        const stockAddCard = document.getElementById('stock-add-card');
        if (stockAddCard) stockAddCard.style.display = 'block';
    }
}

// TABS
// ------------------------------------------
function showTab(t) {
    const tabs = ['user-calc', 'login', 'items', 'products', 'estimate', 'stock', 'create-product', 'history', 'purchases', 'reports'];

    if (!currentRole && (t === 'stock' || t === 'items' || t === 'products' || t === 'estimate' || t === 'create-product')) {
        t = 'login'; resetLoginForm();
    }

    if (currentRole === 'manager' && (t === 'items' || t === 'products' || t === 'estimate' || t === 'create-product')) {
        t = 'stock';
    }

    tabs.forEach(x => {
        const el = document.getElementById('tab-' + x);
        if (el) {
            el.style.display = x === t ? 'block' : 'none';
            if (x === t) { el.classList.remove('anim'); void el.offsetWidth; el.classList.add('anim'); }
        }
        const nav = document.getElementById('nav-' + x);
        if (nav) nav.classList.toggle('active', x === t);
    });

    if (t === 'products') {
        if (typeof initProdMasterDropdowns === 'function') initProdMasterDropdowns();
        renderProducts();
    }
    if (t === 'create-product') {
        if (draftStages.length === 0) addStage('draft');
        else renderDraftStages();
    }
    if (t === 'estimate') { updateEstimate(); }
    if (t === 'user-calc') { updateUserCalc(); }
    if (t === 'stock') { renderStock(); }
    if (t === 'items') { renderItems(); }
    if (t === 'history') { renderHistory(); }
    if (t === 'purchases') { renderPurchases(); }
    if (t === 'reports') {
        const today = new Date().toISOString().split('T')[0];
        document.getElementById('report-date').value = today;
        renderDailyReport(today);
    }
}

// STOCK MANAGEMENT
// ------------------------------------------
function getStock(itemId) {
    if (!itemId) return { qty: 0, avgPrice: null, batches: [] };
    // Force string key for object lookup
    return stocks[String(itemId)] || { qty: 0, avgPrice: null, batches: [] };
}

function effectivePrice(itemId, qtyNeeded = 0) {
    const s = getStock(itemId);
    const it = items.find(x => x.id == itemId); // Use loose equality for safety
    if (!it) return 0;

    const basePrice = parseFloat(it.price) || 0;

    if (s.batches && s.batches.length > 0) {
        if (qtyNeeded <= 0) return parseFloat(s.batches[s.batches.length - 1].price) || basePrice;
        
        let remaining = parseFloat(qtyNeeded);
        let totalCost = 0;
        
        // FIFO loop
        for (const b of s.batches) {
            const bQty = parseFloat(b.qty) || 0;
            const bPrice = parseFloat(b.price) || 0;
            
            if (bQty <= 0) continue;

            const take = Math.min(remaining, bQty);
            totalCost += take * bPrice;
            remaining -= take;
            if (remaining <= 0.000001) break; // Use epsilon for floats
        }
        
        // If we still need more than what's in batches, use master price for remainder
        if (remaining > 0.000001) {
            totalCost += remaining * basePrice;
        }
        return totalCost / qtyNeeded;
    }
    
    return basePrice;
}

function stockStatus(itemId) {
    const s = getStock(itemId);
    const threshold = parseFloat(s.threshold) || 0;
    if (s.qty <= 0) return 'critical';
    if (s.qty <= threshold) return 'low';
    return 'ok';
}

async function updateThreshold(itemId, val) {
    const threshold = parseFloat(val);
    if (isNaN(threshold) || threshold < 0) return;
    try {
        const res = await fetch('/api/stocks', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ itemId, threshold })
        });
        if (res.ok) {
            const data = await res.json();
            stocks[itemId] = { ...getStock(itemId), threshold: data.threshold };
            renderItems();
            renderLowStockAlerts();
        }
    } catch (e) { }
}

function renderLowStockAlerts() {
    const lowStockItems = items.filter(it => {
        const s = getStock(it.id);
        const threshold = parseFloat(s.threshold) || 0;
        return s.qty <= threshold;
    });

    const badge = document.getElementById('nav-stock-low');
    if (badge) {
        badge.textContent = lowStockItems.length;
        badge.style.display = lowStockItems.length > 0 ? 'inline-flex' : 'none';
        badge.style.background = lowStockItems.some(it => getStock(it.id).qty <= 0) ? 'var(--danger)' : '#b45309';
    }

    // Also render alert list in Stock tab if possible
    const alertBox = document.getElementById('low-stock-alerts');
    if (alertBox) {
        if (lowStockItems.length === 0) {
            alertBox.style.display = 'none';
        } else {
            alertBox.style.display = 'block';
            alertBox.innerHTML = `
                <div style="background:rgba(180, 83, 9, 0.1); border:1px solid rgba(180, 83, 9, 0.2); border-radius:12px; padding:16px; margin-bottom:20px;">
                    <div style="display:flex; align-items:center; gap:8px; color:#92400e; font-weight:700; font-size:14px; margin-bottom:12px;">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0zM12 9v4M12 17h.01"/></svg>
                        Low Stock Alerts
                    </div>
                    <div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap:10px;">
                        ${lowStockItems.map(it => {
                            const s = getStock(it.id);
                            const isCritical = s.qty <= 0;
                            return `
                                <div style="background:var(--white); padding:10px; border-radius:8px; border-left:4px solid ${isCritical ? 'var(--danger)' : '#f59e0b'}; box-shadow:0 1px 2px rgba(0,0,0,0.05);">
                                    <div style="font-size:12px; font-weight:700; color:var(--ink);">${esc(it.name)}</div>
                                    <div style="font-size:11px; color:${isCritical ? 'var(--danger)' : '#b45309'}; font-weight:600;">
                                        Current: ${s.qty.toFixed(2)} / Min: ${parseFloat(s.threshold || 0).toFixed(2)}
                                    </div>
                                </div>
                            `;
                        }).join('')}
                    </div>
                </div>
            `;
        }
    }
}

function populateStockSelect() {
    let input = document.getElementById('stock-item-sel');
    if (!input) return;

    // Clean up old event listeners by replacing the node
    const clone = input.cloneNode(true);
    input.parentNode.replaceChild(clone, input);
    input = clone;

    // Remove old results div to start fresh
    const container = input.parentElement;
    if (container && container.classList.contains('dropdown-container')) {
        const rd = container.querySelector('.dropdown-results');
        if (rd) rd.remove();
    }

    initSearchableDropdown('stock-item-sel', items, (it) => {
        const codeInput = document.getElementById('stock-code-sel');
        if (codeInput) codeInput.value = it.code || '';
        onStockItemChange();
    }, 'code');

    const codeInput = document.getElementById('stock-code-sel');
    if (codeInput) {
        codeInput.addEventListener('input', () => {
            const code = codeInput.value.trim().toUpperCase();
            if (!code) return;
            const match = items.find(it => (it.code || '').toUpperCase() === code);
            if (match) {
                const itemInput = document.getElementById('stock-item-sel');
                itemInput.value = match.name;
                itemInput.setAttribute('data-id', match.id);
                onStockItemChange();
            }
        });
    }
}

function onStockItemChange() {
    const input = document.getElementById('stock-item-sel');
    const itemId = input.getAttribute('data-id');
    const previewEl = document.getElementById('stock-avg-preview');
    if (!itemId) { if (previewEl) previewEl.style.display = 'none'; return; }
    const s = getStock(parseInt(itemId));
    const it = items.find(x => x.id === parseInt(itemId));
    const curAvg = s.avgPrice !== null && s.avgPrice > 0 ? s.avgPrice : (it ? it.price : 0);
    if (previewEl) previewEl.style.display = 'none';
    const qtyEl = document.getElementById('stock-add-qty');
    const priceEl = document.getElementById('stock-add-price');
    if (qtyEl && priceEl) {
        [qtyEl, priceEl].forEach(el => {
            el.oninput = () => updateAvgPreview(itemId, s, curAvg, it);
        });
    }
}

function updateAvgPreview(itemId, s, curAvg, it) {
    const addQty = parseFloat(document.getElementById('stock-add-qty').value);
    const newPrice = parseFloat(document.getElementById('stock-add-price').value);
    const previewEl = document.getElementById('stock-avg-preview');
    if (!previewEl) return;
    if (!isNaN(addQty) && addQty > 0 && !isNaN(newPrice) && newPrice > 0) {
        const totalQty = s.qty + addQty;
        const weightedAvg = ((s.qty * curAvg) + (addQty * newPrice)) / totalQty;
        previewEl.style.display = 'block';
        previewEl.innerHTML = `<strong>📊 Weighted Avg Preview:</strong>
            &nbsp;&nbsp;Opening: ${s.qty.toFixed(2)} ${it?.unit || ''} @ Rs.${parseFloat(curAvg).toFixed(2)}
            &nbsp;+&nbsp; Adding: ${addQty.toFixed(2)} ${it?.unit || ''} @ Rs.${newPrice.toFixed(2)}
            &nbsp;→&nbsp; <strong>New Avg Price: Rs.${weightedAvg.toFixed(2)} / ${it?.unit || 'unit'}</strong>
            &nbsp;&nbsp;(Total: ${totalQty.toFixed(2)} ${it?.unit || ''})`;
    } else {
        previewEl.style.display = 'none';
    }
}

async function addStock() {
    const input = document.getElementById('stock-item-sel');
    const qtyEl = document.getElementById('stock-add-qty');
    const priceEl = document.getElementById('stock-add-price');
    const itemId = input.getAttribute('data-id');
    const addQty = parseFloat(qtyEl.value);
    const purchasePrice = parseFloat(priceEl.value);

    if (!itemId) { alert('Please select a material'); return; }
    if (isNaN(addQty) || addQty <= 0) { alert('Please enter a valid quantity to add'); return; }

    const cur = getStock(itemId);
    const it = items.find(x => x.id === itemId);

    const curAvg = (cur.avgPrice !== null && cur.avgPrice > 0) ? cur.avgPrice : (it ? parseFloat(it.price) : 0);
    let newAvgPrice = cur.avgPrice;
    if (!isNaN(purchasePrice) && purchasePrice > 0) {
        const totalQty = cur.qty + addQty;
        if (totalQty > 0 && cur.qty > 0) {
            newAvgPrice = ((cur.qty * curAvg) + (addQty * purchasePrice)) / totalQty;
        } else {
            newAvgPrice = purchasePrice;
        }
    } else if (cur.avgPrice === null || cur.avgPrice === undefined) {
        newAvgPrice = it ? parseFloat(it.price) : 0;
    }

    const newQty = cur.qty + addQty;
    stocks[itemId] = { qty: newQty, avgPrice: newAvgPrice };

    try {
        if (!isNaN(purchasePrice) && purchasePrice > 0) {
            // Add to purchases to support FIFO
            await fetch('/api/purchases', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify([{ itemId, qty: addQty, price: purchasePrice, vendor: 'Stock Management' }])
            });
        } else {
            // Fallback to simple stock update if no price provided
            await fetch('/api/stocks', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ itemId, qty: newQty, avgPrice: newAvgPrice })
            });
        }
    } catch (e) { }

    qtyEl.value = '';
    priceEl.value = '';
    const previewEl = document.getElementById('stock-avg-preview');
    if (previewEl) previewEl.style.display = 'none';
    renderStock();
    renderItems();
    updateNavCounts();
    onStockItemChange();
}

async function deductStock(itemId, qty) {
    if (isNaN(qty) || qty <= 0) { alert('Enter a valid quantity to deduct'); return; }
    if (!confirm(`Deduct ${qty} from stock? This cannot be undone.`)) return;
    const cur = getStock(itemId);
    const newQty = Math.max(0, cur.qty - qty);
    stocks[itemId] = { ...cur, qty: newQty };
    try {
        await fetch('/api/stocks', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ itemId, qty: newQty, threshold: cur.threshold, avgPrice: cur.avgPrice })
        });
    } catch (e) { }
    renderStock();
    updateNavCounts();
}

function renderStock() {
    const search = (document.getElementById('stock-search')?.value || '').toLowerCase();
    const filtered = items.filter(it => 
        it.name.toLowerCase().includes(search) || 
        (it.code || '').toLowerCase().includes(search)
    );
    const isAdmin = currentRole === 'admin';

    document.querySelectorAll('.admin-col').forEach(el => {
        el.style.display = isAdmin ? '' : 'none';
    });

    const tb = document.getElementById('stock-tbody');
    if (!tb) return;
    if (!filtered.length) {
        tb.innerHTML = `<tr><td colspan="${isAdmin ? 6 : 5}" class="empty">No materials found.</td></tr>`;
        return;
    }

    tb.innerHTML = filtered.map((it, i) => {
        const s = getStock(it.id);
        const status = stockStatus(it.id);
        const rowClass = status === 'critical' ? 'stock-critical' : status === 'low' ? 'stock-low' : '';
        const ep = effectivePrice(it.id);

        const avgPriceCol = isAdmin ? `<td style="display:${isAdmin ? '' : 'none'}">
            <div style="font-size:13px">
                <strong>Rs. ${ep.toFixed(2)}</strong>
                <span style="color:var(--muted);font-size:11px">/${it.unit}</span>
            </div>
            ${s.batches && s.batches.length > 0 
                ? `<div style="font-size:10px;color:var(--brand);margin-top:2px">Latest Purchase</div>`
                : `<div style="font-size:10px;color:var(--muted);margin-top:2px">Master price</div>`}
        </td>` : '';

        return `<tr class="${rowClass}">
            <td style="color:#bbb;font-size:12px">${i + 1}</td>
            <td>
                <strong style="font-weight:600">
                    ${it.code ? `<span class="chip chip-blue" style="margin-right:6px;">${esc(it.code)}</span>` : ''}
                    ${esc(it.name)}
                </strong>
            </td>
            <td><span class="chip chip-blue">${esc(it.unit)}</span></td>
            <td>
                <strong style="font-size:15px;color:${status === 'critical' ? 'var(--danger)' : status === 'low' ? '#b45309' : 'var(--ink)'}">${s.qty.toFixed(2)}</strong>
                <span style="color:var(--muted);font-size:11px"> ${esc(it.unit)}</span>
            </td>
            ${avgPriceCol}
        </tr>`;
    }).join('');
}

// ITEM MASTER (Admin only)
// ------------------------------------------
async function addItem() {
    const name = document.getElementById('item-name').value.trim();
    const unit = document.getElementById('item-unit').value;
    const code = document.getElementById('item-code').value.trim();

    if (!name) return;

    try {
        const res = await fetch('/api/items', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, unit, price: 0, code })
        });
        if (res.ok) {
            const data = await res.json();
            stocks[data.id] = { qty: 0 };
            await init();
            document.getElementById('item-code').value = '';
            document.getElementById('item-name').value = '';
            document.getElementById('item-price').value = '';
        } else {
            const data = await res.json();
            alert(data.error || "Failed to add item.");
        }
    } catch (e) { }
}

async function deleteItem(id) {
    if (!confirm('Remove this material? It will also be removed from all product stages.')) return;
    try {
        const res = await fetch(`/api/items/${id}`, { method: 'DELETE' });
        if (res.ok) await init();
    } catch (e) { }
}

async function updateItemPrice(id, newPrice) {
    const p = parseFloat(newPrice);
    if (isNaN(p) || p < 0) return;
    const it = items.find(x => x.id === id);
    if (!it) return;
    try {
        const res = await fetch(`/api/items/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...it, price: p })
        });
        if (!res.ok) {
            const data = await res.json();
            alert(data.error || "Failed to update item price.");
            return;
        }
        it.price = p;
    } catch (e) { }
}

async function updateItemName(id, newName) {
    const name = newName.trim();
    if (!name) return;
    const it = items.find(x => x.id === id);
    if (!it) return;
    try {
        const res = await fetch(`/api/items/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...it, name })
        });
        if (!res.ok) {
            const data = await res.json();
            alert(data.error || "Failed to update item name.");
            return;
        }
        it.name = name;
    } catch (e) { }
}

async function updateItemCode(id, newCode) {
    const code = newCode.trim().toUpperCase();
    const it = items.find(x => x.id === id);
    if (!it) return;
    try {
        const res = await fetch(`/api/items/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...it, code })
        });
        if (!res.ok) {
            const data = await res.json();
            alert(data.error || "Failed to update item code.");
            return;
        }
        it.code = code;
    } catch (e) { }
}

function renderItems() {
    const count = items.length;
    const el = document.getElementById('item-count');
    if (el) el.textContent = count + ' item' + (count !== 1 ? 's' : '');
    const tb = document.getElementById('item-tbody');
    if (!tb) return;
    if (!count) {
        tb.innerHTML = `<tr><td colspan="7" class="empty">No raw materials added yet.</td></tr>`;
        return;
    }
    tb.innerHTML = items.map((it, i) => {
        const s = getStock(it.id);
        const status = stockStatus(it.id);
        const stockDisplay = status === 'critical'
            ? `<span style="color:var(--danger);font-weight:700">${s.qty.toFixed(2)} ${it.unit}</span>`
            : status === 'low'
                ? `<span style="color:#b45309;font-weight:700">${s.qty.toFixed(2)} ${it.unit}</span>`
                : `<span style="color:var(--green);font-weight:700">${s.qty.toFixed(2)} ${it.unit}</span>`;

        const threshold = s.threshold || 0;
        return `<tr onclick="openRmModal(${it.id})" style="cursor:pointer;" title="Click to view details and edit">
            <td style="color:#bbb;font-size:12px">${i + 1}</td>
            <td><strong style="font-weight:600">${esc(it.code || '')}</strong></td>
            <td><strong style="font-weight:600">${esc(it.name)}</strong></td>
            <td><span class="chip chip-blue">kg</span></td>
            <td>${parseFloat(threshold).toFixed(2)}</td>
            <td>${stockDisplay}</td>
        </tr>`;
    }).join('');
}

function openRmModal(id) {
    const it = items.find(x => x.id === id);
    if (!it) return;
    const s = getStock(id);
    
    document.getElementById('modal-item-code').value = it.code || '';
    document.getElementById('modal-item-name').value = it.name || '';
    document.getElementById('modal-item-threshold').value = s.threshold || 0;
    
    const saveBtn = document.getElementById('modal-save-btn');
    saveBtn.onclick = async () => {
        const name = document.getElementById('modal-item-name').value.trim();
        const code = document.getElementById('modal-item-code').value.trim().toUpperCase();
        const threshold = parseFloat(document.getElementById('modal-item-threshold').value) || 0;
        
        if (!name) { alert('Name cannot be empty'); return; }
        
        try {
            const res = await fetch(`/api/items/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...it, name, code })
            });
            if (!res.ok) {
                const data = await res.json();
                alert(data.error || "Failed to update item.");
                return;
            }
            it.name = name;
            it.code = code;
            
            // Update threshold
            await fetch('/api/stocks', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ itemId: id, qty: s.qty, avgPrice: s.avgPrice, threshold })
            });
            s.threshold = threshold;
            
            closeRmModal();
            renderItems();
            renderStock();
        } catch (e) { }
    };
    
    const deleteBtn = document.getElementById('modal-delete-btn');
    deleteBtn.onclick = async () => {
        if (confirm('Remove this material? It will also be removed from all product stages.')) {
            try {
                const res = await fetch(`/api/items/${id}`, { method: 'DELETE' });
                if (res.ok) {
                    items = items.filter(x => x.id !== id);
                    closeRmModal();
                    renderItems();
                    renderStock();
                }
            } catch (e) { }
        }
    };
    
    document.getElementById('rm-modal').style.display = 'flex';
}

function closeRmModal() {
    document.getElementById('rm-modal').style.display = 'none';
}

// PRODUCT MASTER (Admin)
// ------------------------------------------
async function addProduct() {
    const groupCode = document.getElementById('prod-group').value.trim().toUpperCase();
    const name = document.getElementById('prod-name').value.trim();
    const batch = parseFloat(document.getElementById('prod-batch').value);
    const density = parseFloat(document.getElementById('prod-density').value) || 0;
    const gloss = document.getElementById('prod-gloss').value.trim();
    const viscosity = document.getElementById('prod-viscosity').value.trim();
    const desc = JSON.stringify({ gloss, viscosity });
    if (!name || isNaN(batch) || batch <= 0) {
        alert("Please provide a valid product name and batch size.");
        return;
    }
    if (typeof draftStages !== 'undefined' && draftStages.length === 0) {
        alert("Please add at least one stage and material before saving.");
        return;
    }
    
    // Check for pending items not yet added
    let hasPending = false;
    draftStages.forEach(s => {
        const input = document.getElementById(`si-sel-draft-${s.id}`);
        const qtyEl = document.getElementById(`si-qty-draft-${s.id}`);
        if (input && input.getAttribute('data-id') && qtyEl && qtyEl.value) {
            hasPending = true;
        }
    });
    if (hasPending) {
        alert("You have entered a material and quantity but forgot to click '+ Add'.\nPlease click '+ Add' to include it in the recipe before saving!");
        return;
    }
    if (typeof draftStages !== 'undefined') {
        let currentSum = 0;
        draftStages.forEach(s => s.items.forEach(si => {
            const it = items.find(x => String(x.id) === String(si.itemId));
            if (it) currentSum += (parseFloat(si.qty) || 0);
        }));
        if (Math.abs(currentSum - batch) > 0.001) {
            const diff = batch - currentSum;
            alert(`Cannot save product. The recipe is not balanced!\n\nThe total material sum is ${currentSum.toFixed(2)} kg, but the Target Batch is ${batch} kg.`);
            return;
        }
    }
    try {
        const url = currentEditingProductId ? `/api/products/${currentEditingProductId}` : '/api/products';
        const method = currentEditingProductId ? 'PUT' : 'POST';
        
        const res = await fetch(url, {
            method: method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name, batch, desc,
                density: parseFloat(document.getElementById('prod-density').value) || 0,
                group_code: document.getElementById('prod-group').value.trim().toUpperCase(),
                stages: draftStages
            })
        });
        if (res.ok) {
            const data = await res.json();
            if (typeof draftStages !== 'undefined') { draftStages = []; renderDraftStages(); }
            await init();
            document.getElementById('prod-name').value = '';
            document.getElementById('prod-batch').value = '100';
            document.getElementById('prod-desc').value = '';
            document.getElementById('prod-density').value = '1';
            document.getElementById('prod-group').value = '';
            
            // Reset edit mode
            currentEditingProductId = null;
            const titleEl = document.querySelector('#tab-create-product .page-title');
            if (titleEl) titleEl.innerText = 'New Product';
            const btnEl = document.querySelector('#tab-create-product .btn-primary');
            if (btnEl) btnEl.innerText = '+ Create Product';
            
            const searchInput = document.getElementById('prod-master-search');
            if (searchInput) {
                searchInput.value = name;
                searchInput.removeAttribute('data-id');
            }
            renderProducts();
            showTab('products');
            
            alert(method === 'PUT' ? "Product updated successfully!" : "Product created successfully!");
        } else {
            const data = await res.json();
            alert(data.error || "Failed to save product.");
        }
    } catch (e) { }
}

async function deleteProduct(pid) {
    if (!confirm('Delete this product and all its stages?')) return;
    try {
        const res = await fetch(`/api/products/${pid}`, { method: 'DELETE' });
        if (res.ok) await init();
    } catch (e) { }
}

async function syncProduct(p) {
    try {
        const res = await fetch(`/api/products/${p.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...p, density: p.density || 0 })
        });
        if (res.ok) {
            const idx = products.findIndex(x => x.id === p.id);
            if (idx !== -1) products[idx] = p;
            renderProducts(document.getElementById('prod-search')?.value || '');
        }
    } catch (e) { }
}

let draftStages = [];
let currentEditingProductId = null;

function openCreateProductPage() {
    currentEditingProductId = null;
    
    // Clear fields
    document.getElementById('prod-group').value = '';
    document.getElementById('prod-name').value = '';
    document.getElementById('prod-batch').value = '100';
    document.getElementById('prod-density').value = '1';
    const descEl = document.getElementById('prod-desc');
    if (descEl) descEl.value = '';
    
    draftStages = [];
    renderDraftStages();
    
    // Reset labels
    const titleEl = document.querySelector('#tab-create-product .page-title');
    if (titleEl) titleEl.innerText = 'New Product';
    
    const btnEl = document.querySelector('#tab-create-product .btn-primary');
    if (btnEl) btnEl.innerText = '+ Create Product';
    
    showTab('create-product');
}

function openEditProductPage(pid) {
    const p = products.find(x => String(x.id) === String(pid));
    if (!p) return;
    
    currentEditingProductId = p.id;
    
    // Populate fields
    document.getElementById('prod-group').value = p.group_code || '';
    document.getElementById('prod-name').value = p.name || '';
    document.getElementById('prod-batch').value = p.batch || '100';
    document.getElementById('prod-density').value = p.density || '1';
    const descEl = document.getElementById('prod-desc');
    if (descEl) descEl.value = p.desc || '';
    
    // Deep copy stages to avoid mutating until saved
    draftStages = JSON.parse(JSON.stringify(p.stages || []));
    renderDraftStages();
    
    // Change labels
    const titleEl = document.querySelector('#tab-create-product .page-title');
    if (titleEl) titleEl.innerText = 'Edit Product';
    
    const btnEl = document.querySelector('#tab-create-product .btn-primary');
    if (btnEl) btnEl.innerText = 'Update Product';
    
    showTab('create-product');
}

function renderDraftStages() {
    const el = document.getElementById('draft-stages-wrap');
    if (el) {
        const p = { id: 'draft', stages: draftStages };
        let currentSum = 0;
        draftStages.forEach(s => s.items.forEach(si => {
            const it = items.find(x => String(x.id) === String(si.itemId));
            if (it) currentSum += (parseFloat(si.qty) || 0);
        }));
        const batch = parseFloat(document.getElementById('prod-batch').value) || 0;
        let statusHTML = '';
        if (batch > 0 && draftStages.some(s => s.items.length > 0)) {
            const diff = batch - currentSum;
            const isBalanced = Math.abs(diff) < 0.001;
            statusHTML = isBalanced
                ? `<div id="draft-status-wrap" style="margin-bottom:12px"><span class="chip chip-green">Balanced (${currentSum.toFixed(2)} / ${batch} kg)</span></div>`
                : `<div id="draft-status-wrap" style="margin-bottom:12px"><span class="chip chip-red">Unbalanced (Sum: ${currentSum.toFixed(2)} kg)</span></div>`;
        }

        const stagesHTML = draftStages.length
            ? draftStages.map((s, i) => renderStage(p, s, i)).join('')
            : '<div style="font-size:13px;color:#bbb;padding:16px;text-align:center;border:2px dashed var(--slate2);border-radius:8px">No stages added yet. Click "+ Add Stage" to begin.</div>';
        el.innerHTML = statusHTML + stagesHTML;

        draftStages.forEach(s => {
            const availableItems = items.filter(it => !s.items.some(si => si.itemId === it.id));
            initSearchableDropdown(`si-sel-draft-${s.id}`, availableItems, null, 'code');
        });
        
        // Initialize Sortable for stages (only once)
        if (draftStages.length && !el.dataset.sortableInitialized) {
            el.dataset.sortableInitialized = 'true';
            new Sortable(el, {
                animation: 150,
                handle: '.stage-drag-handle',
                onEnd: function (evt) {
                    const order = this.toArray();
                    draftStages.sort((a, b) => order.indexOf(String(a.id)) - order.indexOf(String(b.id)));
                    // Update names automatically
                    draftStages.forEach((s, idx) => {
                        s.name = 'Stage ' + (idx + 1);
                    });
                    renderDraftStages();
                }
            });
        }
        
        // Initialize Sortable for items within stages (re-created every render)
        if (draftStages.length) {
            el.querySelectorAll('.sortable-items').forEach(itemsEl => {
                new Sortable(itemsEl, {
                    animation: 150,
                    handle: '.item-drag-handle',
                    onEnd: function (evt) {
                        const stageId = itemsEl.getAttribute('data-stage-id');
                        const stage = draftStages.find(s => String(s.id) === String(stageId));
                        if (stage) {
                            const order = this.toArray();
                            stage.items.sort((a, b) => order.indexOf(String(a.itemId)) - order.indexOf(String(b.itemId)));
                        }
                    }
                });
            });
        }
    }
}

function getTargetProduct(pid) {
    return pid === 'draft' ? { id: 'draft', stages: draftStages } : products.find(x => String(x.id) === String(pid));
}

function syncOrRender(pid, p) {
    if (pid === 'draft') renderDraftStages();
    else syncProduct(p);
}

function addStage(pid) {
    const p = getTargetProduct(pid); if (!p) return;
    p.stages.push({ id: Date.now(), name: 'Stage ' + (p.stages.length + 1), items: [], duration: 0 });
    syncOrRender(pid, p);
}
function renameStage(pid, sid, newName) {
    const p = getTargetProduct(pid); if (!p) return;
    const s = p.stages.find(x => x.id === sid);
    if (s && newName.trim()) { s.name = newName.trim(); syncOrRender(pid, p); }
}
function updateStageDuration(pid, sid, val) {
    const v = parseFloat(val) || 0;
    const p = getTargetProduct(pid); if (!p) return;
    const s = p.stages.find(x => x.id === sid);
    if (s) { s.duration = v; syncOrRender(pid, p); }
}
function deleteStage(pid, sid) {
    if (!confirm('Remove this stage?')) return;
    if (pid === 'draft') {
        draftStages = draftStages.filter(s => s.id !== sid);
        draftStages.forEach((s, index) => {
            if (/^Stage \d+$/.test(s.name)) {
                s.name = 'Stage ' + (index + 1);
            }
        });
        renderDraftStages();
        return;
    }
    const p = products.find(x => String(x.id) === String(pid)); if (!p) return;
    p.stages = p.stages.filter(s => s.id !== sid);
    p.stages.forEach((s, index) => {
        if (/^Stage \d+$/.test(s.name)) {
            s.name = 'Stage ' + (index + 1);
        }
    });
    syncProduct(p);
}
function addStageItem(pid, sid) {
    const input = document.getElementById('si-sel-' + pid + '-' + sid);
    const qtyEl = document.getElementById('si-qty-' + pid + '-' + sid);
    const itemIdStr = input.getAttribute('data-id');
    const qty = parseFloat(qtyEl.value);

    if (!itemIdStr) { alert('Please select a material from the search list.'); return; }
    if (isNaN(qty) || qty <= 0) { alert('Please enter a valid quantity.'); return; }

    const itemId = parseInt(itemIdStr);
    const p = getTargetProduct(pid); if (!p) return;

    // Check if adding this would exceed target batch
    const batch = (pid === 'draft') ? parseFloat(document.getElementById('prod-batch').value) : p.batch;
    let currentSum = 0;
    p.stages.forEach(st => st.items.forEach(si => {
        const it = items.find(x => String(x.id) === String(si.itemId));
        if (it) currentSum += si.qty;
    }));
    
    if (currentSum + qty > batch) {
        alert(`Cannot add material. The total would exceed the target batch size of ${batch} kg!\nCurrent total is ${currentSum.toFixed(2)} kg.`);
        return;
    }

    const s = p.stages.find(x => x.id === sid);
    const existing = s.items.find(x => x.itemId === itemId);
    if (existing) { existing.qty += qty; } else { s.items.push({ itemId, qty }); }

    // Clear inputs after adding
    input.value = '';
    input.removeAttribute('data-id');
    qtyEl.value = '';

    syncOrRender(pid, p);
}
function updateStageItemQty(pid, sid, itemId, val) {
    const v = parseFloat(val); if (isNaN(v) || v <= 0) return;
    const p = getTargetProduct(pid); if (!p) return;
    const s = p.stages.find(x => x.id === sid);
    const si = s.items.find(x => x.itemId === itemId);
    if (si) { 
        si.qty = v; 
        
        if (pid === 'draft') {
            // Update sum directly without re-rendering to preserve focus!
            const batch = parseFloat(document.getElementById('prod-batch').value) || 100;
            let currentSum = 0;
            draftStages.forEach(st => st.items.forEach(item => {
                currentSum += (parseFloat(item.qty) || 0);
            }));
            
            const statusWrap = document.getElementById('draft-status-wrap');
            if (statusWrap) {
                const isBalanced = Math.abs(currentSum - batch) < 0.001;
                statusWrap.innerHTML = isBalanced 
                    ? `<span class="chip chip-green">Balanced (${currentSum.toFixed(2)} / ${batch} kg)</span>`
                    : `<span class="chip chip-red">Unbalanced (Sum: ${currentSum.toFixed(2)} kg)</span>`;
            }
            
            // Show tick mark!
            const row = document.querySelector(`.stage-item-row[data-id="${itemId}"]`);
            if (row) {
                const tick = row.querySelector('.save-tick');
                if (tick) {
                    tick.style.display = 'inline';
                    setTimeout(() => { tick.style.display = 'none'; }, 1000);
                }
            }
        } else {
            syncOrRender(pid, p); 
        }
    }
}
function removeStageItem(pid, sid, itemId) {
    const p = getTargetProduct(pid); if (!p) return;
    const s = p.stages.find(x => x.id === sid);
    s.items = s.items.filter(x => String(x.itemId) !== String(itemId));
    syncOrRender(pid, p);
}

function toggleProductDetails(pid) {
    const body = document.getElementById('prod-body-' + pid);
    const icon = document.getElementById('prod-icon-' + pid);
    if (body && body.style.display === 'none') {
        body.style.display = 'block';
        if (icon) icon.style.transform = 'rotate(180deg)';

        // Re-init dropdowns when shown
        const p = products.find(x => String(x.id) === String(pid));
            p.stages.forEach(s => {
                const availableItems = items.filter(it => !s.items.some(si => si.itemId === it.id));
                initSearchableDropdown(`si-sel-${p.id}-${s.id}`, availableItems, null, 'code');
            });
    } else if (body) {
        body.style.display = 'none';
        if (icon) icon.style.transform = 'rotate(0deg)';
    }
}

function initProdMasterDropdowns() {
    const groups = [...new Set(products.map(p => p.group_code || ''))]
        .filter(Boolean)
        .map(g => ({ id: g, name: g }));

    let grpInput = document.getElementById('prod-master-group');
    if (!grpInput) return;

    initSearchableDropdown('prod-master-group', groups, (grp) => {
        const filteredProds = products.filter(p => p.group_code === grp.id);

        let pInp = document.getElementById('prod-master-search');
        if (pInp) {
            pInp.value = '';
            pInp.removeAttribute('data-id');
            const cl = pInp.cloneNode(true);
            pInp.parentNode.replaceChild(cl, pInp);
            pInp = cl;
            const c = pInp.parentElement;
            if (c && c.classList.contains('dropdown-container')) {
                const rd = c.querySelector('.dropdown-results');
                if (rd) rd.remove();
            }
            initSearchableDropdown('prod-master-search', filteredProds, () => renderProducts());
        }
        renderProducts();
    });

    initSearchableDropdown('prod-master-search', products, () => renderProducts());
}

function renderProducts() {
    const el = document.getElementById('prod-list');
    if (!el) return;

    const grpInput = document.getElementById('prod-master-group');
    const prodInput = document.getElementById('prod-master-search');

    const grpId = grpInput ? grpInput.getAttribute('data-id') : null;
    let prodId = prodInput ? prodInput.getAttribute('data-id') : null;

    // Fallback if they typed exact name
    if (!prodId && prodInput && prodInput.value) {
        let pool = products;
        if (grpId) pool = pool.filter(p => p.group_code === grpId);
        const match = pool.find(p => p.name.toLowerCase() === prodInput.value.trim().toLowerCase());
        if (match) prodId = match.id;
    }

    if (!grpId && !prodId) {
        el.innerHTML = `<div class="card" style="border:2px dashed var(--slate3);background:var(--slate);opacity:0.8"><div class="empty-state"><p>Select a group or product to manage</p></div></div>`;
        return;
    }

    let filtered = products;
    if (grpId) filtered = filtered.filter(p => p.group_code === grpId);
    if (prodId) filtered = filtered.filter(p => p.id == prodId);

    if (!filtered.length) {
        el.innerHTML = `<div class="card"><div class="empty-state"><p>No products found</p></div></div>`;
        return;
    }
    el.innerHTML = filtered.map(p => {
        const totalIng = p.stages.reduce((a, s) => {
            const itemsArray = s.items ? (Array.isArray(s.items) ? s.items : [s.items]) : [];
            return a + itemsArray.length;
        }, 0);

        const formulationSum = p.stages.reduce((acc, s) => {
            const itemsArray = s.items ? (Array.isArray(s.items) ? s.items : [s.items]) : [];
            return acc + itemsArray.reduce((accI, si) => {
                const it = items.find(x => String(x.id) === String(si.itemId));
                return it ? accI + (parseFloat(si.qty) || 0) : accI;
            }, 0);
        }, 0);

        const isBalanced = Math.abs(formulationSum - p.batch) < 0.001;
        const stagesHTML = p.stages.length ? p.stages.map((s, si) => renderStage(p, s, si)).join('') : `<div style="font-size:13px;color:#bbb;padding:6px 0 10px;text-align:center">No stages yet.</div>`;
        return `<div class="prod-card" id="prod-card-${p.id}" style="border:1px solid var(--slate2); border-radius:12px;">
            <div class="prod-card-header" style="background:#fff; cursor:pointer;" onclick="openEditProductPage('${p.id}')">
                <div style="flex:1">
                    <div class="prod-card-name">
                        <svg id="prod-icon-${p.id}" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="transition:transform 0.2s;color:var(--muted);"><polyline points="6 9 12 15 18 9"></polyline></svg>
                        ${esc(p.name)}
                    </div>
                    <div style="font-size:11px; color:var(--muted); margin-top:4px; margin-left:22px;">
                        Last Modified: ${new Date(p.modified_at).toLocaleString()}
                    </div>
                </div>
            </div>
            <div id="prod-body-${p.id}" class="prod-card-body" style="display:none; background:#fafbfc; border-top:1px solid var(--slate2);"><div class="stage-wrap">${stagesHTML}</div></div>
        </div>`;
    }).join('');

    // Initialize dropdowns for each visible product stage
    filtered.forEach(p => {
        p.stages.forEach(s => {
            const id = `si-sel-${p.id}-${s.id}`;
            if (document.getElementById(id)) {
                initSearchableDropdown(id, items, null, 'code');
            }
        });
    });
}

function renderStage(p, s, stageIndex) {
    const pidStr = typeof p.id === 'string' ? `'${p.id}'` : p.id;
    const itemsArray = s.items ? (Array.isArray(s.items) ? s.items : [s.items]) : [];
    const itemRowsHTML = itemsArray.map(si => {
        const it = items.find(x => String(x.id) === String(si.itemId));
        return `<div class="stage-item-row" data-id="${si.itemId}">
            <span class="item-drag-handle" style="cursor:move; margin-right:8px; color:var(--muted);">☰</span>
            <div class="stage-item-name">${it ? esc(it.name) : 'Unknown'}</div>
            <span class="chip chip-blue">${it ? it.unit : 'kg'}</span>
            <input type="number" value="${si.qty}" min="0" step="any" style="width:90px;height:30px;" oninput="updateStageItemQty(${pidStr},${s.id},'${si.itemId}',this.value)">
            <span class="save-tick" style="color:var(--green); margin-left:4px; display:none;">✔</span>
            <button class="btn btn-xs btn-danger" onclick="removeStageItem(${pidStr},${s.id},'${si.itemId}')" style="margin-left:auto">✕</button>
        </div>`;
    }).join('');
    const opts = items.map(it => `<option value="${it.id}">${esc(it.name)} (${it.unit})</option>`).join('');
    return `<div class="stage-card" data-id="${s.id}" style="margin-bottom:8px">
        <div class="stage-head">
            <div style="display:flex;align-items:center;gap:8px">
                <span class="stage-drag-handle" style="cursor:move; margin-right:4px; color:var(--muted);">☰</span>
                <div class="stage-num">${stageIndex + 1}</div>
                <input class="stage-name-input" type="text" value="${esc(s.name)}" onblur="renameStage(${pidStr},${s.id},this.value)" onkeydown="if(event.key==='Enter')this.blur()">
                <div style="display:flex; align-items:center; gap:4px; margin-left:12px;">
                    <span style="font-size:11px; color:var(--muted); font-weight:600;">TIME (MINS)</span>
                    <input type="number" value="${s.duration || ''}" min="0" placeholder="0" onchange="updateStageDuration(${pidStr},${s.id},this.value)" style="width:60px; height:26px; font-size:12px; padding:0 6px; border-radius:4px;">
                </div>
            </div>
            <button class="btn btn-xs btn-danger" onclick="deleteStage(${pidStr},${s.id})">Remove</button>
        </div>
        <div class="stage-body sortable-items" data-stage-id="${s.id}">${itemsArray.length ? itemRowsHTML : '<div style="color:#ccc;text-align:center;">Empty</div>'}</div>
        <div class="stage-add">
            <div class="dropdown-container" style="flex:1">
                <input type="text" id="si-sel-${p.id}-${s.id}" placeholder="Search material..." autocomplete="off" style="width:100%;">
            </div>
            <input type="number" id="si-qty-${p.id}-${s.id}" placeholder="Qty" style="width:70px;">
            <button class="btn btn-sm btn-ghost" onclick="addStageItem(${pidStr},${s.id})">+ Add</button>
        </div>
    </div>`;
}

// USER CALCULATOR
// ------------------------------------------
function initUserCalcDropdowns() {
    initSplitSearchDropdowns('user-group', 'user-product', products, () => updateUserCalc());
}

function updateUserCalc() {
    const el = document.getElementById('user-calc-output');
    const input = document.getElementById('user-product');
    let pid = input ? input.getAttribute('data-id') : null;

    // Fallback: if they typed a valid name but didn't click the dropdown
    if (!pid && input && input.value) {
        const match = products.find(p => p.name.toLowerCase() === input.value.trim().toLowerCase());
        if (match) pid = match.id;
    }

    const qty = parseFloat(document.getElementById('user-qty').value) || 0;
    if (!pid || !qty) {
        el.innerHTML = `<div class="card"><div class="empty-state"><p>Select a product and quantity.</p></div></div>`;
        return;
    }
    const p = products.find(x => x.id == pid); if (!p) return;
    const scale = qty / p.batch;
    let actualRawSum = 0;

    const allIngredients = [];
    p.stages.forEach(s => {
        s.items.forEach(si => {
            const it = items.find(x => String(x.id) === String(si.itemId)); if (!it) return;
            const needed = si.qty * scale;
            const available = getStock(si.itemId).qty;
            const ep = effectivePrice(si.itemId, needed);
            allIngredients.push({
                name: it.name, unit: it.unit, needed, available,
                sufficient: available >= needed,
                shortage: Math.max(0, needed - available),
                price: ep, cost: needed * ep,
                stageName: s.name
            });
        });
    });

    const stockWarnings = allIngredients.filter(x => !x.sufficient);
    const stageSummaries = p.stages.map(s => {
        const stageItems = s.items.map(si => {
            const it = items.find(x => String(x.id) === String(si.itemId)); if (!it) return null;
            const scaledQty = si.qty * scale;
            actualRawSum += scaledQty;
            return { name: it.name, unit: it.unit, code: it.code, scaledQty, itemId: si.itemId };
        }).filter(Boolean);
        return { name: s.name, duration: s.duration || 0, items: stageItems };
    });

    const stageHTML = stageSummaries.map((ss, i) => {
        const itemsRows = ss.items.map(it => {
            const availableQty = getStock(it.itemId).qty;
            const isSufficient = availableQty >= it.scaledQty;
            return `<tr class="result-sub">
                <td>${esc(it.name)} ${it.code ? `<span class="chip chip-blue">${esc(it.code)}</span>` : ''}</td>
                <td style="text-align:right;font-weight:800;color:var(--brand-dark)">${Math.round(it.scaledQty * 1000) / 1000}</td>
                <td style="text-align:right;font-weight:600;color:${isSufficient ? 'var(--green)' : 'var(--danger)'}">
                    ${Math.round(availableQty * 1000) / 1000}
                </td>
                <td>${esc(it.unit)}</td>
            </tr>`;
        }).join('');
        return `<tr class="result-section">
            <td colspan="4" style="background:var(--ink);color:#fff;">
                <div style="display:flex; justify-content:space-between; align-items:center; width:100%; padding:0 4px;">
                    <span style="font-weight:800; letter-spacing:0.5px; text-transform:uppercase;">${esc(ss.name)}</span>
                    <span style="background:rgba(255,255,255,0.15); padding:3px 8px; border-radius:6px; font-size:11px; font-weight:700; color:#fff; border:1px solid rgba(255,255,255,0.1);">⏱ ${ss.duration} MINS</span>
                </div>
            </td>
        </tr>${itemsRows}`;
    }).join('');

    el.innerHTML = `
        <div class="stats-bar anim" style="background:var(--ink2);">
            <div style="display:flex;align-items:center;gap:12px">
                <span class="chip chip-brand" style="background:#fff;color:var(--ink2)">${esc(p.group_code || 'N/A')}</span>
                <strong style="font-size:16px">${esc(p.name)}</strong>
                <span style="opacity:0.8;margin-left:8px">Target:</span> <strong style="font-size:16px">${qty} kg</strong>
            </div>
            <div style="display:flex;gap:8px">
                ${(currentRole === 'admin' || currentRole === 'manager') ? `
                <button class="btn btn-reduce-stock" onclick="consumeProductStock(this)" data-pid="${p.id}" data-qty="${qty}" data-name="${esc(p.name)}"
                        style="background: #10b981; color: #fff;"
                        ${stockWarnings.length > 0 ? 'disabled' : ''}>
                    ${stockWarnings.length > 0 ? 'Shortage: Fix Stock First' : 'Generate Batch'}
                </button>
                ` : ''}
            </div>
        </div>
        <div class="card anim" style="padding:0;">
            <div class="table-wrap">
                <table>
                    <thead><tr><th>Material</th><th style="text-align:right">Required</th><th style="text-align:right">Stock</th><th>Unit</th></tr></thead>
                    <tbody>
                        ${stageHTML}
                        <tr style="background:var(--slate);font-weight:800;">
                            <td>TOTAL INPUT</td>
                            <td style="text-align:right">${Math.round(actualRawSum * 1000) / 1000}</td>
                            <td></td>
                            <td>kg</td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>`;
}



async function renderHistory() {
    const tb = document.getElementById('history-tbody');
    if (!tb) return;
    try {
        const res = await fetch('/api/batches');
        const batches = await res.json();
        if (!batches.length) {
            tb.innerHTML = '<tr><td colspan="6" class="empty">No history found.</td></tr>';
            return;
        }
        tb.innerHTML = batches.map(b => {
            const dt = new Date(b.created_at).toLocaleString();
            const status = b.status || 'pending';
            const isCompleted = status === 'completed';
            const statusChip = isCompleted ? `<span class="chip" style="background:#dcfce7;color:#15803d;font-weight:600;display:inline-flex;align-items:center;gap:4px;"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="8 12 11 15 16 9"></polyline></svg>Completed</span>` : `<span class="chip" style="background:#fee2e2;color:#b91c1c;font-weight:600;">Pending</span>`;
            const completeBtn = (currentRole === 'manager' && !isCompleted) ? `<button class="btn btn-xs" onclick="completeBatch(${b.id})" style="background:#0f172a;color:#fff;margin-left:4px;font-weight:600;border:none;border-radius:4px;cursor:pointer;">Complete</button>` : '';
            
            return `<tr>
                <td><span class="chip chip-accent">${b.batch_number}</span></td>
                <td>${dt}</td>
                <td><strong>${esc(b.product_name)}</strong></td>
                <td>${parseFloat(b.quantity).toFixed(2)} kg</td>
                <td>${statusChip}</td>
                <td>
                    <button class="btn btn-xs" onclick="reprintBatch(${b.id})" style="background:#0f172a;color:#fff;font-weight:600;border:none;border-radius:4px;cursor:pointer;display:inline-flex;align-items:center;gap:4px;transition:background 0.2s;" onmouseover="this.style.background='#1e293b'" onmouseout="this.style.background='#0f172a'"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 6 2 18 2 18 9"></polyline><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><rect x="6" y="14" width="12" height="8"></rect></svg>Print</button>
                    ${completeBtn}
                </td>
            </tr>`;
        }).join('');
    } catch (e) { }
}

async function completeBatch(id) {
    if (!confirm('Mark this batch as completed?')) return;
    try {
        const res = await fetch(`/api/batches/${id}/complete`, {
            method: 'PUT'
        });
        const data = await res.json();
        if (data.success) {
            renderHistory();
        } else {
            alert('Error: ' + data.error);
        }
    } catch (e) {
        alert('Error completing batch');
    }
}

async function reprintBatch(id) {
    try {
        const res = await fetch('/api/batches');
        const batches = await res.json();
        const b = batches.find(x => x.id === id);
        if (!b) return;
        const pRes = await fetch('/api/products');
        const productsList = await pRes.json();
        const prod = productsList.find(x => x.id === b.product_id);
        const stages = JSON.parse(b.stages_data);
        exportUserPDF({
            productName: b.product_name,
            groupCode: prod ? prod.group_code : '---',
            quantity: b.quantity,
            batch_number: b.batch_number,
            stages: stages,
            date: formatDate(b.created_at),
            time: new Date(b.created_at).toLocaleTimeString()
        });
    } catch (e) { }
}

async function exportUserPDF(arg1 = null, qtyIn = null, stagesIn = null, bnIn = null) {
    const logoUrl = window.location.origin + '/Roalux_PNG.png';
    let p, qty, stages, batch_number, date, time, groupCode;

    if (arg1 && typeof arg1 === 'object' && arg1.productName) {
        p = { name: arg1.productName };
        groupCode = arg1.groupCode || '';
        qty = arg1.quantity;
        stages = arg1.stages;
        batch_number = arg1.batch_number;
        date = arg1.date;
        time = arg1.time;
    } else if (arg1 && typeof arg1 === 'object' && arg1.name) {
        p = arg1;
        groupCode = p.group_code || '';
        qty = qtyIn;
        stages = stagesIn;
        batch_number = bnIn || window.lastBatchNumber;
        if (!batch_number) {
            try {
                const res = await fetch(`/api/batches/next-number?product_id=${p.id}`);
                const data = await res.json();
                batch_number = data.batch_number;
            } catch (e) { batch_number = 'PROVISIONAL'; }
        }
        date = formatDate(new Date());
        time = new Date().toLocaleTimeString();
    } else {
        const input = document.getElementById('user-product');
        let pid = input ? input.getAttribute('data-id') : null;
        if (!pid && input && input.value) {
            const match = products.find(p => p.name.toLowerCase() === input.value.trim().toLowerCase());
            if (match) pid = match.id;
        }
        qty = parseFloat(document.getElementById('user-qty').value) || 0;
        if (!pid || !qty) return;
        p = products.find(x => x.id == pid); if (!p) return;
        groupCode = p.group_code || '';
        batch_number = window.lastBatchNumber;
        if (!batch_number) {
            try {
                const res = await fetch(`/api/batches/next-number?product_id=${p.id}`);
                const data = await res.json();
                batch_number = data.batch_number;
            } catch (e) { batch_number = 'PROVISIONAL'; }
        }
        const scale = qty / p.batch;
        stages = p.stages.map(s => ({
            name: s.name,
            duration: s.duration || 0,
            items: s.items.map(si => {
                const it = items.find(x => String(x.id) === String(si.itemId));
                return { name: it ? it.name : 'Unknown', qty: si.qty * scale, unit: it ? it.unit : 'kg' };
            })
        }));
        date = new Date().toLocaleDateString();
        time = new Date().toLocaleTimeString();
    }

    const dateStr = date || formatDate(new Date());
    const timeStr = time || '';

    let actualRawSum = 0;
    const stageBlocks = stages.map((s, i) => {
        const itemsRows = s.items.map(si => {
            actualRawSum += si.qty;
            return `
                <tr>
                    <td style="padding: 10px 0; font-size: 13px; color: #475569; border-bottom: 1px solid #f1f5f9; padding-left: 20px;">${esc(si.name)}</td>
                    <td style="padding: 10px 0; font-size: 13px; color: #475569; border-bottom: 1px solid #f1f5f9; text-align: right; font-weight: 600;">${Math.round(si.qty * 1000) / 1000}</td>
                    <td style="padding: 10px 0; font-size: 13px; color: #475569; border-bottom: 1px solid #f1f5f9; padding-left: 10px;">${esc(si.unit)}</td>
                </tr>
            `;
        }).join('');

        return `
            <tr style="background: #e2e8f0; border-top: 2px solid #cbd5e1;">
                <td style="padding: 12px 10px; font-size: 14px; font-weight: 800; color: #1e293b;">
                    ${esc(s.name)} 
                    <span style="font-size: 11px; color: #475569; font-weight: 700; margin-left: 10px; display: inline-flex; align-items: center;">
                        <svg style="width:12px;height:12px;margin-right:4px;vertical-align:middle;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
                        ${s.duration || 0} MINS
                    </span>
                </td>
                <td colspan="2" style="padding: 12px 10px; font-size: 13px; color: #475569; text-align: right; font-weight: 600;">${s.items.length} materials</td>
            </tr>
            ${itemsRows}
        `;
    }).join('');

    const modifiedDate = formatDate(p.updated_at);

    let gloss = '—', viscosity = '—';
    try {
        const descObj = JSON.parse(p.desc);
        gloss = descObj.gloss || '—';
        viscosity = descObj.viscosity || '—';
    } catch(e) {
        gloss = p.desc || '—';
    }

    const html = `
    <!DOCTYPE html>
    <html>
    <head>
        <title>Batch Sheet - ${batch_number}</title>
        <style>
            body { font-family: 'Inter', -apple-system, sans-serif; padding: 40px; color: #1e293b; line-height: 1.5; position: relative; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th { text-align: left; font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; padding-bottom: 10px; border-bottom: 2px solid #e2e8f0; }
            .meta-box { border: 1px solid #e2e8f0; padding: 12px 16px; border-radius: 8px; flex: 1; }
            .meta-label { font-size: 10px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 2px; }
            .meta-value { font-size: 14px; font-weight: 800; color: #1e293b; }
            .stage-row { background: #f8fafc; border-bottom: 1px solid #e2e8f0; }
            .watermark {
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%) rotate(-45deg);
                font-size: 80px;
                font-weight: 900;
                color: rgba(128, 128, 128, 0.2);
                pointer-events: none;
                white-space: nowrap;
                z-index: 9999;
            }
            @media print { body { padding: 20px; } }
        </style>
    </head>
    <body>
        <div class="watermark">CONFIDENTIAL</div>
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 30px;">
            <div style="display: flex; align-items: center; gap: 15px;">
                <img src="${logoUrl}" style="height: 45px;">
                <div>
                    <div style="font-size: 24px; font-weight: 800; color: #0f172a; letter-spacing: -0.5px;">Batch Production Sheet</div>
                    <div style="font-size: 10px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 1px;">Roalux MixLab v3.0</div>
                </div>
            </div>
            <div style="text-align: right;">
                <div style="font-size: 10px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 2px;">Batch Number</div>
                <div style="font-size: 32px; font-weight: 900; color: #2563eb; line-height: 1;">${batch_number}</div>
                <div style="font-size: 11px; font-weight: 600; color: #64748b; margin-top: 4px;">Modified: ${modifiedDate}</div>
            </div>
        </div>

        <div style="display: flex; gap: 15px; margin-bottom: 15px;">
            <div class="meta-box"><div class="meta-label">Product</div><div class="meta-value">${esc(p.name)}</div></div>
            <div class="meta-box" style="max-width:100px;"><div class="meta-label">Group</div><div class="meta-value">${esc(p.group_code || 'N/A')}</div></div>
            <div class="meta-box" style="max-width:120px;"><div class="meta-label">Target Qty</div><div class="meta-value">${qty} kg</div></div>
            <div class="meta-box"><div class="meta-label">Production Date</div><div class="meta-value">${dateStr}</div></div>
        </div>

        <div style="display: flex; gap: 15px; margin-bottom: 30px;">
            <div class="meta-box"><div class="meta-label">Gloss</div><div class="meta-value">${esc(gloss)}</div></div>
            <div class="meta-box"><div class="meta-label">Viscosity</div><div class="meta-value">${esc(viscosity)}</div></div>
            <div class="meta-box"><div class="meta-label">Weight per Litre</div><div class="meta-value">${p.density ? esc(p.density) + ' kg/L' : '—'}</div></div>
        </div>

        <table>
            <thead>
                <tr>
                    <th style="width: 60%;">Material / Ingredient</th>
                    <th style="width: 25%; text-align: right;">Quantity</th>
                    <th style="width: 15%; padding-left: 15px;">Unit</th>
                </tr>
            </thead>
            <tbody>
                ${stageBlocks}
            </tbody>
        </table>

        <div style="margin-top: 60px; text-align: center; border-top: 1px solid #f1f5f9; padding-top: 20px; font-size: 11px; color: #94a3b8; font-weight: 500;">
            Roalux MixLab v3.0 — Precision Recipe Record
        </div>
    </body>
    </html>`;

    const win = window.open('', '_blank');
    if (win) {
        win.document.write(html);
        win.document.close();
        setTimeout(() => win.print(), 500);
    }
}

async function consumeProductStock(btn) {
    let pid = btn.getAttribute('data-pid');
    if (!pid) {
        const input = document.getElementById('user-product');
        pid = input ? input.getAttribute('data-id') : null;
    }
    const qty = parseFloat(btn.getAttribute('data-qty')) || parseFloat(document.getElementById('user-qty').value) || 0;
    if (!pid || !qty) return;
    const p = products.find(x => x.id == pid); if (!p) return;
    const scale = qty / p.batch;

    const itemsToDeduct = [];
    const stagesData = p.stages.map(s => ({
        name: s.name,
        duration: s.duration || 0,
        items: s.items.map(si => {
            const it = items.find(x => String(x.id) === String(si.itemId));
            const scaledQty = si.qty * scale;
            itemsToDeduct.push({ itemId: si.itemId, qty: scaledQty });
            return { name: it ? it.name : 'Unknown', qty: scaledQty, unit: it ? it.unit : 'kg' };
        })
    }));

    if (!confirm(`REDUCE STOCK INVENTORY for Batch Production?`)) return;

    try {
        const originalText = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = 'Processing...';

        const stockRes = await fetch('/api/stocks/consume', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ items: itemsToDeduct })
        });

        const historyRes = await fetch('/api/batches', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                product_id: pid,
                product_name: p.name,
                quantity: qty,
                stages_data: stagesData
            })
        });

        const batchData = await historyRes.json();

        if (batchData.error) {
            throw new Error(batchData.error);
        }

        window.lastBatchNumber = batchData.batch_number;
        await init();
        updateUserCalc();
        exportUserPDF(p, qty, stagesData, batchData.batch_number);

        btn.disabled = false;
        btn.innerHTML = originalText;
    } catch (err) {
        console.error(err);
        alert('Error: ' + err.message);
        btn.disabled = false;
        btn.innerHTML = 'Retry Stock Reduction';
    }
}

// PRICE ESTIMATOR (Admin)
// ------------------------------------------
function populateEstSelect() {
    let groupInput = document.getElementById('est-group');
    let productInput = document.getElementById('est-product');
    if (!groupInput || !productInput) return;

    // Split selection logic (identical to Mix Calculator)
    initSplitSearchDropdowns(
        'est-group', 
        'est-product', 
        products, 
        () => { updateEstimate(); },
        'group_code'
    );
}

function calcEstimate() {
    const productInput = document.getElementById('est-product');
    if (!productInput) return null;

    let pid = productInput.getAttribute('data-id');
    const val = productInput.value.trim().toLowerCase();

    // Fallback: If no data-id, try matching by name
    if (!pid && val) {
        const match = products.find(x => x.name.toLowerCase() === val);
        if (match) pid = match.id;
    }

    const qtyLitres = parseFloat(document.getElementById('est-qty').value) || 0;
    const margin = parseFloat(document.getElementById('est-margin').value) || 0;

    if (!pid || !qtyLitres) return null;
    const p = products.find(x => x.id == pid); if (!p) return null;
    const kgPerLitre = p.density || 1;
    const qtyKg = qtyLitres * kgPerLitre;
    const scale = qtyKg / (p.batch || 1);
    let totalCost = 0, actualRawSum = 0;
    const stageSummaries = p.stages.map(s => {
        let stageCost = 0;
        const stageItems = s.items.map(si => {
            const it = items.find(x => String(x.id) === String(si.itemId)); if (!it) return null;
            const scaledQty = si.qty * scale;
            const unitPrice = effectivePrice(si.itemId, scaledQty);
            const cost = scaledQty * unitPrice;
            stageCost += cost; totalCost += cost; actualRawSum += scaledQty;
            const s2 = getStock(si.itemId);
            return {
                name: it.name, unit: it.unit, code: it.code, scaledQty,
                price: unitPrice, cost,
                usingAvg: (s2.avgPrice !== null && s2.avgPrice > 0 && Math.abs(s2.avgPrice - it.price) > 0.001),
                masterPrice: it.price,
                stockAvail: s2.qty
            };
        }).filter(Boolean);
        return { name: s.name, duration: s.duration || 0, cost: stageCost, items: stageItems };
    });
    const salePrice = totalCost * (1 + margin / 100);

    let litreData = null;
    if (kgPerLitre > 0) {
        const totalLitres = qtyLitres;
        // Cost per Litre = Total Cost / Total Litres
        // Also equivalent to (Total Cost / Qty) * Density
        const costPerLitre = totalCost / totalLitres;
        const salePricePerLitre = salePrice / totalLitres;
        litreData = { totalLitres, costPerLitre, salePricePerLitre, kgPerLitre };
    }

    return { p, qtyLitres, qtyKg, margin, scale, totalCost, salePrice, stageSummaries, actualRawSum, litreData };
}

function updateEstimate() {
    const el = document.getElementById('estimate-output');
    if (!el) return;

    if (products.length === 0) {
        el.innerHTML = `<div class="card"><div class="empty-state">
            <div class="empty-icon">⚠️</div>
            <p>No products found in Master. Add products first.</p>
        </div></div>`;
        return;
    }

    const d = calcEstimate();
    if (!d) {
        el.innerHTML = `<div class="card"><div class="empty-state"><p>Select a product to see the estimate.</p></div></div>`;
        return;
    }
    const { p, qtyLitres, qtyKg, margin, scale, totalCost, salePrice, stageSummaries, actualRawSum, litreData } = d;

    // Prepare Summary Cards
    const litreMetrics = litreData ? `
        <div style="background:var(--white); padding:20px; border-radius:16px; border:1px solid var(--slate2); display:flex; flex-direction:column; gap:4px; box-shadow:0 2px 10px rgba(0,0,0,0.02);">
            <div style="font-size:11px; color:var(--muted); font-weight:700; text-transform:uppercase; letter-spacing:0.5px;">Density Metrics (${litreData.kgPerLitre.toFixed(2)} kg/L)</div>
            <div style="font-size:22px; font-weight:800; color:var(--ink);">Rs. ${litreData.costPerLitre.toFixed(2)} <span style="font-size:12px; font-weight:600; color:var(--muted); opacity:0.6;">/ Litre</span></div>
            <div style="font-size:12px; color:var(--muted); font-weight:500;">Yield: ${litreData.totalLitres.toFixed(2)} L</div>
        </div>` : '';

    const tableContent = stageSummaries.map(s => {
        const itemRows = s.items.map(it => {
            const vol = litreData ? (it.scaledQty / litreData.kgPerLitre).toFixed(2) + ' L' : '—';
            const ratePerLitre = litreData ? (it.price * litreData.kgPerLitre) : it.price;
            return `
            <tr>
                <td style="padding:12px 24px;">
                    <div style="font-weight:700;">${esc(it.name)}</div>
                    <div style="font-size:10px; color:var(--muted);">${it.usingAvg ? 'FIFO Projection' : 'Master Price'}</div>
                </td>
                <td style="padding:12px 24px;">
                    ${it.code ? `<span class="chip chip-blue" style="font-size:11px; padding:3px 8px;">${esc(it.code)}</span>` : '—'}
                </td>
                <td style="text-align:right; padding:12px 24px;">${it.scaledQty.toFixed(2)} kg</td>
                <td style="text-align:right; padding:12px 24px; color:var(--muted); font-size:12px;">${vol}</td>
                <td style="text-align:right; padding:12px 24px; color:var(--muted);">Rs. ${ratePerLitre.toFixed(2)}</td>
                <td style="text-align:right; padding:12px 24px; font-weight:700; color:var(--ink);">Rs. ${it.cost.toFixed(2)}</td>
            </tr>`;
        }).join('');
        return `
            <tr style="background:#f1f5f9; border-top:1px solid var(--slate2);">
                <td colspan="5" style="padding:10px 24px;">
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <span style="font-size:12px; font-weight:800; color:var(--ink); text-transform:uppercase; letter-spacing:0.5px;">${esc(s.name)}</span>
                        <span style="font-size:11px; font-weight:700; color:var(--muted); background:rgba(0,0,0,0.05); padding:2px 8px; border-radius:4px;">⏱ ${s.duration || 0} MINS</span>
                    </div>
                </td>
                <td style="text-align:right; padding:10px 24px; font-weight:800; color:var(--ink);">Rs. ${s.cost.toFixed(2)}</td>
            </tr>
            ${itemRows}
        `;
    }).join('');

    el.innerHTML = `
        <div style="background:linear-gradient(135deg, var(--ink), #334155); padding:24px; border-radius:16px; margin-bottom:24px; display:flex; justify-content:space-between; align-items:center; color:#fff; box-shadow:0 8px 30px rgba(15,23,42,0.15);">
            <div>
                <div style="font-size:11px; font-weight:700; color:rgba(255,255,255,0.6); text-transform:uppercase; letter-spacing:1px; margin-bottom:4px;">Draft Estimate For</div>
                <div style="font-size:24px; font-family:var(--font-display); font-weight:800;">${esc(p.name)}</div>
                <div style="font-size:11px; color:rgba(255,255,255,0.4);">Group: ${esc(p.group_code || '---')}</div>
            </div>
            <div style="text-align:right;">
                <div style="font-size:28px; font-weight:800; line-height:1;">${qtyLitres.toFixed(0)} <span style="font-size:14px; opacity:0.6;">Litres</span></div>
                <div style="font-size:11px; font-weight:700; opacity:0.6; text-transform:uppercase; letter-spacing:0.5px;">Target Volume</div>
            </div>
        </div>

        <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap:20px; margin-bottom:24px;">
            <div style="background:linear-gradient(135deg, #f8fafc, #f1f5f9); padding:24px; border-radius:16px; border:1px solid var(--slate2); box-shadow:0 4px 15px rgba(0,0,0,0.03);">
                <div style="font-size:12px; color:var(--muted); font-weight:700; text-transform:uppercase; letter-spacing:1px; margin-bottom:8px;">Total Material Cost</div>
                <div style="font-size:32px; font-weight:900; color:var(--ink); font-family:var(--font-display);">Rs. ${totalCost.toFixed(2)}</div>
                <div style="font-size:12px; color:var(--muted); margin-top:4px; font-weight:500;">Based on ${actualRawSum.toFixed(2)} kg ingredients</div>
            </div>
            <div style="background:linear-gradient(135deg, #f0fdfa, #ccfbf1); padding:24px; border-radius:16px; border:1px solid #99f6e4; box-shadow:0 4px 15px rgba(13,148,136,0.08);">
                <div style="font-size:12px; color:#115e59; font-weight:700; text-transform:uppercase; letter-spacing:1px; margin-bottom:8px;">Estimated Selling Price</div>
                <div style="font-size:32px; font-weight:900; color:#134e4a; font-family:var(--font-display);">Rs. ${salePrice.toFixed(2)}</div>
                <div style="font-size:12px; color:#0d9488; margin-top:4px; font-weight:600;">Includes ${margin}% Profit Margin</div>
            </div>
            ${litreMetrics}
        </div>

        <div class="card anim" style="padding:0; overflow:hidden; border:1px solid var(--slate2); border-radius:16px;">
            <div class="table-wrap">
                <table style="width:100%; border-collapse:collapse;">
                    <thead>
                        <tr style="background:var(--white); border-bottom:1px solid var(--slate2);">
                            <th style="padding:16px 24px; text-align:left; font-size:12px; color:var(--muted); text-transform:uppercase; letter-spacing:1px;">Stage / Material</th>
                            <th style="padding:16px 24px; text-align:left; font-size:12px; color:var(--muted); text-transform:uppercase; letter-spacing:1px;">Code</th>
                            <th style="padding:16px 24px; text-align:right; font-size:12px; color:var(--muted); text-transform:uppercase; letter-spacing:1px;">Weight</th>
                            <th style="padding:16px 24px; text-align:right; font-size:12px; color:var(--muted); text-transform:uppercase; letter-spacing:1px;">Volume</th>
                            <th style="padding:16px 24px; text-align:right; font-size:12px; color:var(--muted); text-transform:uppercase; letter-spacing:1px;">Rate/L</th>
                            <th style="padding:16px 24px; text-align:right; font-size:12px; color:var(--muted); text-transform:uppercase; letter-spacing:1px;">Cost</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${tableContent}
                        <tr style="border-top:2px solid var(--slate2); background:#f8fafc;">
                            <td colspan="5" style="padding:20px 24px; font-weight:700; color:var(--ink);">Total Material Cost</td>
                            <td style="padding:20px 24px; text-align:right; font-size:18px; font-weight:800; color:var(--ink);">Rs. ${totalCost.toFixed(2)}</td>
                        </tr>
                        <tr style="background:#f8fafc;">
                            <td colspan="5" style="padding:10px 24px; color:var(--muted); font-size:13px;">Gross Margin (${margin}%)</td>
                            <td style="padding:10px 24px; text-align:right; color:#16a34a; font-weight:700;">+ Rs. ${(salePrice - totalCost).toFixed(2)}</td>
                        </tr>
                        <tr style="background:linear-gradient(to right, #ecfdf5, #f0fdf4); border-top:2px solid #bbf7d0;">
                            <td colspan="5" style="padding:24px; font-size:16px; font-weight:800; color:#065f46;">FINAL ESTIMATED SELLING PRICE</td>
                            <td style="padding:24px; text-align:right; font-size:24px; font-weight:900; color:#059669; font-family:var(--font-display);">Rs. ${salePrice.toFixed(2)}</td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>
    `;

    const pdfBtn = document.getElementById('pdf-btn');
    if (pdfBtn) pdfBtn.style.display = 'block';
}

function exportPDF() {
    const d = calcEstimate();
    if (!d) return;
    const { p, qtyLitres, qtyKg, margin, scale, totalCost, salePrice, stageSummaries, litreData } = d;
    const modifiedDate = formatDate(p.modified_at);
    let gloss = '—', viscosity = '—';
    try {
        const descObj = JSON.parse(p.desc);
        gloss = descObj.gloss || '—';
        viscosity = descObj.viscosity || '—';
    } catch(e) {
        gloss = p.desc || '—';
    }

    const summaryBoxes = `
        <div style="display: flex; gap: 20px; margin-bottom: 30px;">
            <div style="flex: 1; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; text-align: center; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);">
                <div style="font-size: 24px; font-weight: 800; color: #1e293b; margin-bottom: 4px;">Rs. ${totalCost.toFixed(2)}</div>
                <div style="font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px;">Total Material Cost</div>
            </div>
            <div style="flex: 1; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; text-align: center; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);">
                <div style="font-size: 24px; font-weight: 800; color: #1e293b; margin-bottom: 4px;">Rs. ${(totalCost / qtyKg).toFixed(2)}</div>
                <div style="font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px;">Cost Per KG</div>
            </div>
            <div style="flex: 1; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; text-align: center; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);">
                <div style="font-size: 24px; font-weight: 800; color: #1e293b; margin-bottom: 4px;">Rs. ${salePrice.toFixed(2)}</div>
                <div style="font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px;">Selling Price (${margin}%)</div>
            </div>
        </div>
    `;

    const tableRows = stageSummaries.map(s => {
        const items = s.items.map(it => {
            const vol = litreData ? (it.scaledQty / litreData.kgPerLitre).toFixed(2) + ' L' : '—';
            const ratePerLitre = litreData ? (it.price * litreData.kgPerLitre) : it.price;
            return `
            <tr>
                <td style="padding: 10px 0; font-size: 13px; color: #475569; border-bottom: 1px solid #f1f5f9; padding-left: 20px;">${esc(it.name)}</td>
                <td style="padding: 10px 0; font-size: 13px; color: #475569; border-bottom: 1px solid #f1f5f9;">${it.code ? esc(it.code) : '—'}</td>
                <td style="padding: 10px 0; font-size: 13px; color: #475569; border-bottom: 1px solid #f1f5f9; text-align: right;">${Math.round(it.scaledQty * 1000) / 1000} kg</td>
                <td style="padding: 10px 0; font-size: 13px; color: #475569; border-bottom: 1px solid #f1f5f9; text-align: right; padding-right: 20px;">Rs. ${ratePerLitre.toFixed(2)}</td>
                <td style="padding: 10px 0; font-size: 13px; font-weight: 600; color: #1e293b; border-bottom: 1px solid #f1f5f9; text-align: right;">Rs. ${it.cost.toFixed(2)}</td>
            </tr>
        `; }).join('');

        return `
            <tr style="background: #f8fafc;">
                <td style="padding: 12px 10px; font-size: 14px; font-weight: 800; color: #1e293b;">
                    ${esc(s.name)}
                    <span style="font-size:10px; font-weight:600; color:#64748b; margin-left:8px;">(${s.duration || 0} MINS)</span>
                </td>
                <td style="padding: 12px 10px; font-size: 13px; color: #64748b;">${s.items.length} ingredients</td>
                <td style="padding: 12px 10px;"></td>
                <td style="padding: 12px 10px;"></td>
                <td style="padding: 12px 10px; font-size: 14px; font-weight: 800; color: #1e293b; text-align: right;">Rs. ${s.cost.toFixed(2)}</td>
            </tr>
            ${items}
        `;
    }).join('');

    const html = `
    <!DOCTYPE html>
    <html>
    <head>
        <title>Price Estimate - ${esc(p.name)}</title>
        <style>
            body { font-family: 'Inter', -apple-system, sans-serif; padding: 40px; color: #1e293b; line-height: 1.5; position: relative; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th, td { border: 1px solid #e2e8f0; }
            th { text-align: left; font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; padding: 10px; border-bottom: 2px solid #e2e8f0; }
            .meta-label { font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px; }
            .meta-value { font-size: 16px; font-weight: 800; color: #1e293b; }
            .watermark {
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%) rotate(-45deg);
                font-size: 80px;
                font-weight: 900;
                color: rgba(128, 128, 128, 0.2);
                pointer-events: none;
                white-space: nowrap;
                z-index: 9999;
                font-family: sans-serif;
            }
            @media print { body { padding: 20px; } .no-print { display: none; } }
        </style>
    </head>
    <body>
        <div class="watermark">CONFIDENTIAL</div>
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10px;">
            <div>
                <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 4px;">
                    <img src="${window.location.origin}/Roalux_PNG.png" style="height: 40px;">
                    <div style="font-size: 28px; font-weight: 900; letter-spacing: -1px; color: #000;">MIXLAB</div>
                </div>
                <div style="font-size: 12px; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 1px;">Paint Recipe System</div>
            </div>
            <div style="text-align: right;">
                <div style="font-size: 28px; font-weight: 800; color: #1e293b;">Price Estimate</div>
                <div style="font-size: 14px; font-weight: 600; color: #64748b;">Modified: ${modifiedDate}</div>
            </div>
        </div>
        
        <div style="height: 3px; background: #1e293b; margin-bottom: 30px;"></div>

        <div style="display: flex; flex-wrap: wrap; gap: 30px; margin-bottom: 30px;">
            <div><div class="meta-label">Product</div><div class="meta-value">${esc(p.name)}</div></div>
            <div><div class="meta-label">Group</div><div class="meta-value">${esc(p.group_code || '---')}</div></div>
            <div><div class="meta-label">Batch</div><div class="meta-value">${p.batch} kg</div></div>
            <div><div class="meta-label">Required</div><div class="meta-value">${qtyLitres} L</div></div>
            <div><div class="meta-label">Margin</div><div class="meta-value">${margin}%</div></div>
            <div><div class="meta-label">Gloss</div><div class="meta-value">${esc(gloss)}</div></div>
            <div><div class="meta-label">Viscosity</div><div class="meta-value">${esc(viscosity)}</div></div>
        </div>

        ${summaryBoxes}

        <table>
            <thead>
                <tr>
                    <th style="width: 30%;">Stage / Ingredient</th>
                    <th style="width: 15%;">Code</th>
                    <th style="width: 15%; text-align: right;">Weight</th>
                    <th style="width: 25%; text-align: right; padding-right: 20px;">Rate/L</th>
                    <th style="width: 15%; text-align: right;">Cost</th>
                </tr>
            </thead>
            <tbody>
                ${tableRows}
                <tr style="border-top: 2px solid #e2e8f0;">
                    <td colspan="4" style="padding: 15px 0; font-size: 15px; font-weight: 700; color: #1e293b;">Total Material Cost</td>
                    <td style="padding: 15px 0; font-size: 15px; font-weight: 800; color: #1e293b; text-align: right;">Rs. ${totalCost.toFixed(2)}</td>
                </tr>
                <tr>
                    <td colspan="4" style="padding: 10px 0; font-size: 14px; color: #64748b;">Profit Margin (${margin}%)</td>
                    <td style="padding: 10px 0; font-size: 14px; color: #64748b; text-align: right; white-space: nowrap;">Rs. ${(salePrice - totalCost).toFixed(2)}</td>
                </tr>
                <tr style="background: #f0fdf4;">
                    <td colspan="4" style="padding: 15px 10px; font-size: 18px; font-weight: 800; color: #059669;">Estimated Selling Price</td>
                    <td style="padding: 15px 10px; font-size: 18px; font-weight: 900; color: #059669; text-align: right; white-space: nowrap;">Rs. ${salePrice.toFixed(2)}</td>
                </tr>
            </tbody>
        </table>

        <div style="margin-top: 60px; text-align: center; border-top: 1px solid #f1f5f9; padding-top: 20px; font-size: 12px; color: #94a3b8; font-weight: 500;">
            Roalux MixLab v3.0 — Confidential
        </div>
    </body>
    </html>`;

    const win = window.open('', '_blank');
    if (win) {
        win.document.write(html);
        win.document.close();
        setTimeout(() => win.print(), 500);
    }
}

function updateNavCounts() {
    const ic = document.getElementById('nav-item-count');
    const pc = document.getElementById('nav-prod-count');
    const sl = document.getElementById('nav-stock-low');
    if (ic) ic.textContent = items.length;
    if (pc) pc.textContent = products.length;
    if (sl) {
        const lowCount = items.filter(it => stockStatus(it.id) !== 'ok').length;
        sl.textContent = lowCount;
        sl.style.background = lowCount > 0 ? 'var(--danger)' : '';
    }
}

function populateAllSelects() {
    populateEstSelect();
    populateStockSelect();
    populatePurchSelect();
    initUserCalcDropdowns();
}

// PURCHASES MODULE
// ------------------------------------------
function populatePurchSelect() {
    initSearchableDropdown('purch-item-bulk', items, (it) => {
        const codeInput = document.getElementById('purch-code-bulk');
        if (codeInput) codeInput.value = it.code || '';
        const unitInput = document.getElementById('purch-unit');
        if (unitInput) unitInput.value = it.unit || 'kg';
    }, 'code');

    const codeInput = document.getElementById('purch-code-bulk');
    if (codeInput) {
        codeInput.addEventListener('input', () => {
            const code = codeInput.value.trim().toUpperCase();
            if (!code) return;
            const match = items.find(it => (it.code || '').toUpperCase() === code);
            if (match) {
                const itemInput = document.getElementById('purch-item-bulk');
                itemInput.value = match.name;
                itemInput.setAttribute('data-id', match.id);
                const unitInput = document.getElementById('purch-unit');
                if (unitInput) unitInput.value = match.unit || 'kg';
            }
        });
    }
}

function calculatePurchaseTotals() {
    const packSize = parseFloat(document.getElementById('purch-pack-size').value) || 0;
    const packs = parseFloat(document.getElementById('purch-packs').value) || 0;
    const unitPrice = parseFloat(document.getElementById('purch-price-bulk').value) || 0;
    
    const totalQty = packSize * packs;
    const totalPrice = totalQty * unitPrice;
    
    document.getElementById('purch-qty-bulk').value = totalQty.toFixed(2);
    document.getElementById('purch-total-price').value = totalPrice.toFixed(2);
}

async function renderPurchases() {
    const tb = document.getElementById('purch-tbody');
    if (!tb) return;
    try {
        const res = await fetch('/api/purchases');
        const data = await res.json();
        
        // Group by vendor/reference
        const groupedPurchases = {};
        data.forEach(p => {
            let vendor = p.vendor || 'Unknown Vendor';
            let ref = p.reference || '';
            
            // Backwards compatibility for old records with "vendor (Ref: ...)" format
            if (!ref && vendor.match(/^(.*?)\s*\(Ref:\s*(.*?)\)$/)) {
                const match = vendor.match(/^(.*?)\s*\(Ref:\s*(.*?)\)$/);
                vendor = match[1];
                ref = match[2];
            }
            
            const key = vendor + '|' + ref + '|' + new Date(p.created_at).getTime().toString().substring(0, 8); // group by approximate time
            
            if (!groupedPurchases[key]) {
                groupedPurchases[key] = {
                    vendor: vendor,
                    reference: ref,
                    created_at: p.created_at,
                    items: []
                };
            }
            
            const it = items.find(x => x.id == p.itemId);
            
            groupedPurchases[key].items.push({
                name: it ? it.name : `RM ${p.itemId}`,
                qty: parseFloat(p.qty),
                price: parseFloat(p.price),
                unit: it ? it.unit : 'kg',
                packSize: p.pack_size ? parseFloat(p.pack_size) : null,
                packs: p.packs ? parseFloat(p.packs) : null
            });
        });
        
        const purchasesSummary = Object.values(groupedPurchases);
        currentPurchases = purchasesSummary;
        
        if (!purchasesSummary.length) {
            tb.innerHTML = '<tr><td colspan="5" class="empty">No purchases yet.</td></tr>';
            return;
        }
        
        tb.innerHTML = purchasesSummary.map((p, i) => {
            const vendor = p.vendor;
            const ref = p.reference || '—';
            
            return `<tr onclick="showRecentPurchaseDetails(${i})" style="cursor:pointer;">
                <td>${formatDate(p.created_at)}</td>
                <td><strong>${esc(vendor)}</strong></td>
                <td>${esc(ref)}</td>
                <td>${p.items.length} items</td>
                <td onclick="event.stopPropagation()"><button class="btn btn-xs btn-ghost" onclick="printRecentPurchase(${i})" style="display:inline-flex; align-items:center; gap:4px; font-weight:700;"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>Print</button></td>
            </tr>`;
        }).join('');
    } catch (e) { }
}

function addPurchaseItemToDraft() {
    const input = document.getElementById('purch-item-bulk');
    const itemId = input.getAttribute('data-id');
    const qty = parseFloat(document.getElementById('purch-qty-bulk').value);
    const price = parseFloat(document.getElementById('purch-price-bulk').value);
    if (!itemId || isNaN(qty) || qty <= 0 || isNaN(price)) return;
    const it = items.find(x => x.id == itemId);
    if (!it) {
        alert("Selected material not found. Please re-select from the list.");
        return;
    }
    const packSize = parseFloat(document.getElementById('purch-pack-size').value) || 1;
    const packs = parseFloat(document.getElementById('purch-packs').value) || 0;
    
    draftPurchaseItems.push({ itemId, qty, price, name: it.name, unit: it.unit, code: it.code, packSize, packs });
    
    document.getElementById('purch-pack-size').value = '';
    document.getElementById('purch-packs').value = '';
    document.getElementById('purch-qty-bulk').value = '';
    document.getElementById('purch-price-bulk').value = '';
    document.getElementById('purch-total-price').value = '';
    
    renderDraftPurchaseItems();
}

function removePurchaseItemFromDraft(idx) {
    draftPurchaseItems.splice(idx, 1);
    renderDraftPurchaseItems();
}

function renderDraftPurchaseItems() {
    const cont = document.getElementById('purch-draft-container');
    const tb = document.getElementById('purch-draft-tbody');
    if (!cont || !tb) return;
    if (!draftPurchaseItems.length) { cont.style.display = 'none'; return; }
    cont.style.display = 'block';
    let total = 0;
    tb.innerHTML = draftPurchaseItems.map((p, i) => {
        const sub = p.qty * p.price;
        total += sub;
        return `<tr>
            <td><strong>${esc(p.name)}</strong> ${p.code ? `<span class="chip chip-blue">${esc(p.code)}</span>` : ''}</td>
            <td>${p.packSize ? p.packSize.toFixed(2) : '—'}</td>
            <td>${p.packs ? p.packs.toFixed(2) : '—'}</td>
            <td>${p.qty.toFixed(2)} ${esc(p.unit)}</td>
            <td>Rs. ${p.price.toFixed(2)}</td>
            <td>Rs. ${sub.toFixed(2)}</td>
            <td><button class="btn btn-xs btn-danger" onclick="removePurchaseItemFromDraft(${i})">Remove</button></td>
        </tr>`;
    }).join('');
    document.getElementById('purch-draft-total').textContent = 'Rs. ' + total.toFixed(2);
}

async function confirmBulkPurchase() {
    const vendor = document.getElementById('purch-vendor-bulk').value.trim();
    const reference = document.getElementById('purch-ref-bulk') ? document.getElementById('purch-ref-bulk').value.trim() : '';
    if (!vendor) { alert("Enter Vendor Name."); return; }
    if (!draftPurchaseItems.length) return;
    try {
        const res = await fetch('/api/purchases', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(draftPurchaseItems.map(item => ({ ...item, vendor, reference })))
        });
        if (res.ok) {
            draftPurchaseItems = [];
            document.getElementById('purch-vendor-bulk').value = '';
            if (document.getElementById('purch-ref-bulk')) document.getElementById('purch-ref-bulk').value = '';
            renderDraftPurchaseItems();
            await init();
            renderPurchases();
        }
    } catch (e) { }
}

// REPORTS MODULE
// ------------------------------------------
async function renderDailyReport(date) {
    try {
        const res = await fetch('/api/reports/daily?date=' + date);
        const data = await res.json();
        currentReportData = data;
        currentReportDate = date;
        const pt = document.getElementById('rep-prod-tbody');
        const totalProduced = data.productions.reduce((a, b) => a + parseFloat(b.quantity), 0);
        document.getElementById('rep-total-prod').textContent = totalProduced.toFixed(1) + ' kg';
        pt.innerHTML = data.productions.map(p => `<tr>
            <td>${new Date(p.created_at).toLocaleTimeString()}</td>
            <td><span class="chip chip-accent">${p.batch_number}</span></td>
            <td><strong>${esc(p.product_name)}</strong></td>
            <td>${p.quantity} kg</td>
        </tr>`).join('') || '<tr><td colspan="4" class="empty">No records.</td></tr>';

        const mt = document.getElementById('rep-mod-tbody');
        if (mt) {
            mt.innerHTML = (data.modifications || []).map(m => `<tr>
                <td>${new Date(m.created_at).toLocaleTimeString()}</td>
                <td><strong>${esc(m.product_name)}</strong></td>
                <td><span class="chip chip-blue">Updated</span></td>
            </tr>`).join('') || '<tr><td colspan="3" class="empty">No records.</td></tr>';
        }

        const put = document.getElementById('rep-purch-tbody');
        const totalSpend = data.purchases.reduce((a, p) => a + p.items.reduce((acc, it) => acc + (it.qty * it.price), 0), 0);
        document.getElementById('rep-total-spend').textContent = 'Rs. ' + totalSpend.toLocaleString();
        
        put.innerHTML = data.purchases.map((p, idx) => {
            let vendor = p.vendor || 'Unknown Vendor';
            let ref = p.reference || '';
            if (!ref && vendor.match(/^(.*?)\s*\(Ref:\s*(.*?)\)$/)) {
                const match = vendor.match(/^(.*?)\s*\(Ref:\s*(.*?)\)$/);
                vendor = match[1];
                ref = match[2];
            }
            if (!ref) ref = '—';
            
            return `<tr onclick="showPurchaseDetails(${idx})" style="cursor:pointer;">
                <td>${new Date(p.created_at).toLocaleTimeString()}</td>
                <td><strong>${esc(vendor)}</strong></td>
                <td>${esc(ref)}</td>
                <td>${p.items.length} items</td>
                <td onclick="event.stopPropagation()"><button class="btn btn-xs btn-ghost" onclick="printReportPurchase(${idx})" style="display:inline-flex; align-items:center; gap:4px; font-weight:700;"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2-2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>Print</button></td>
            </tr>`;
        }).join('') || '<tr><td colspan="5" class="empty">No records.</td></tr>';

        const ut = document.getElementById('rep-usage-tbody');
        if (!data.rmUsage || !data.rmUsage.length) {
            ut.innerHTML = '<tr><td colspan="3" class="empty">No consumption.</td></tr>';
        } else {
            ut.innerHTML = data.rmUsage.map(u => `<tr>
                <td><strong>${esc(u.name)}</strong></td>
                <td style="color:var(--brand)">${u.qty.toFixed(2)}</td>
                <td>${esc(u.unit)}</td>
            </tr>`).join('');
        }
    } catch (e) { }
}

function exportPurchasesPDF() {
    if (!currentReportData) { alert("No report data to export."); return; }
    const data = currentReportData;
    const dateStr = currentReportDate || new Date().toISOString().split('T')[0];
    const dateFormatted = formatDate(dateStr);

    const totalSpend = data.purchases.reduce((a, b) => a + b.items.reduce((sum, it) => sum + (it.qty * it.price), 0), 0);

    const purchasesHTML = data.purchases.map(p => {
        const totalAmount = p.items.reduce((a, b) => a + (b.qty * b.price), 0);
        let vendorName = p.vendor || 'Unknown Vendor';
        let ref = p.reference || '';
        if (!ref && vendorName.match(/^(.*?)\s*\(Ref:\s*(.*?)\)$/)) {
            const match = vendorName.match(/^(.*?)\s*\(Ref:\s*(.*?)\)$/);
            vendorName = match[1];
            ref = match[2];
        }
        
        const itemDetails = p.items.map(it => {
            const packStr = it.packSize ? `(${it.packs ? it.packs.toFixed(2) : 0} x ${it.packSize.toFixed(2)})` : '';
            return `${esc(it.name)} ${packStr}`.trim();
        }).join('<br>');
        
        return `
            <tr>
                <td style="padding: 8px; border-bottom: 1px solid #ddd;">
                    <strong>${esc(vendorName)}</strong>
                    ${ref ? `<div style="font-size:10px; color:#64748b;">Ref: ${esc(ref)}</div>` : ''}
                </td>
                <td style="padding: 8px; border-bottom: 1px solid #ddd; font-size:11px;">${itemDetails}</td>
                <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: right;">Rs. ${totalAmount.toFixed(2)}</td>
            </tr>
        `;
    }).join('') || '<tr><td colspan="3" style="padding: 8px; text-align: center;">No records.</td></tr>';

    const html = `
        <html>
        <head>
            <title>Purchases Report - ${dateStr}</title>
            <style>
                body { font-family: sans-serif; color: #333; line-height: 1.4; }
                table { width: 100%; border-collapse: collapse; margin-top: 10px; }
                th { background: #f8fafc; text-align: left; padding: 8px; font-size: 12px; text-transform: uppercase; color: #64748b; }
                .summary { display: flex; gap: 20px; margin-top: 15px; }
                .sum-box { flex: 1; border: 1px solid #e2e8f0; border-radius: 8px; padding: 15px; text-align: center; }
                .sum-val { font-size: 18px; font-weight: 700; color: #1e293b; }
                .sum-lbl { font-size: 11px; color: #64748b; text-transform: uppercase; }
            </style>
        </head>
        <body>
            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px;">
                <div>
                    <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 4px;">
                        <img src="${window.location.origin}/Roalux_PNG.png" style="height: 40px;">
                        <div style="font-size: 28px; font-weight: 900; letter-spacing: -1px; color: #000;">MIXLAB</div>
                    </div>
                    <div style="font-size: 12px; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 1px;">Paint Recipe System</div>
                </div>
                <div style="text-align: right;">
                    <div style="font-size: 24px; font-weight: 800; color: #1e293b;">Purchases Report</div>
                    <div style="font-size: 14px; font-weight: 600; color: #64748b;">${dateFormatted}</div>
                </div>
            </div>
            
            <div style="height: 2px; background: #1e293b; margin-bottom: 20px;"></div>

            <div class="summary">
                <div class="sum-box">
                    <div class="sum-val">Rs. ${totalSpend.toLocaleString()}</div>
                    <div class="sum-lbl">Total Spend</div>
                </div>
            </div>

            <table>
                <thead><tr><th>Vendor</th><th>Materials</th><th style="text-align:right;">Value</th></tr></thead>
                <tbody>${purchasesHTML}</tbody>
            </table>
        </body>
        </html>
    `;

    const win = window.open('', '_blank');
    win.document.write(html);
    win.document.close();
    setTimeout(() => win.print(), 500);
}

function printPurchaseSlip(p) {
    let vendor = p.vendor || 'Unknown Vendor';
    let ref = p.reference || '';
    
    if (!ref && vendor.match(/^(.*?)\s*\(Ref:\s*(.*?)\)$/)) {
        const match = vendor.match(/^(.*?)\s*\(Ref:\s*(.*?)\)$/);
        vendor = match[1];
        ref = match[2];
    }
    
    if (!ref) ref = '—';
    
    const dateFormatted = formatDate(p.created_at);
    let total = 0;
    
    const itemsHTML = p.items.map(it => {
        const sub = it.qty * it.price;
        total += sub;
        return `
            <tr>
                <td style="padding: 8px; border-bottom: 1px solid #ddd;">${esc(it.name)}</td>
                <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: right;">${it.packSize ? it.packSize.toFixed(2) : '—'}</td>
                <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: right;">${it.packs ? it.packs.toFixed(2) : '—'}</td>
                <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: right;">${it.qty.toFixed(2)} ${esc(it.unit)}</td>
                <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: right;">Rs. ${it.price.toFixed(2)}</td>
                <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: right;">Rs. ${sub.toFixed(2)}</td>
            </tr>
        `;
    }).join('');

    const html = `
        <html>
        <head>
            <title>Purchase Slip - ${vendor}</title>
            <style>
                body { font-family: sans-serif; color: #333; line-height: 1.4; }
                table { width: 100%; border-collapse: collapse; margin-top: 10px; }
                th, td { border: 1px solid #ddd; padding: 8px; }
                th { background: #f8fafc; text-align: left; padding: 8px; font-size: 12px; text-transform: uppercase; color: #64748b; }
            </style>
        </head>
        <body>
            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px;">
                <div>
                    <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 4px;">
                        <img src="${window.location.origin}/Roalux_PNG.png" style="height: 40px;">
                        <div style="font-size: 28px; font-weight: 900; letter-spacing: -1px; color: #000;">MIXLAB</div>
                    </div>
                    <div style="font-size: 12px; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 1px;">Paint Recipe System</div>
                </div>
                <div style="text-align: right;">
                    <div style="font-size: 24px; font-weight: 800; color: #1e293b;">Purchase Slip</div>
                    <div style="font-size: 14px; font-weight: 600; color: #64748b;">${dateFormatted}</div>
                </div>
            </div>
            
            <div style="height: 2px; background: #1e293b; margin-bottom: 20px;"></div>

            <div style="margin-bottom: 15px; font-size: 14px; color: #475569;">
                <div><strong>Vendor:</strong> ${esc(vendor)}</div>
                <div><strong>Reference:</strong> ${esc(ref)}</div>
            </div>

            <table>
                <thead><tr><th>Material</th><th style="text-align:right;">Pack Size</th><th style="text-align:right;">Packs</th><th style="text-align:right;">Total Qty</th><th style="text-align:right;">Unit Price</th><th style="text-align:right;">Total Price</th></tr></thead>
                <tbody>${itemsHTML}</tbody>
            </table>

            <div style="margin-top: 20px; text-align: right; font-size: 16px; font-weight: 700;">
                Grand Total: Rs. ${total.toFixed(2)}
            </div>
        </body>
        </html>
    `;

    const win = window.open('', '_blank');
    win.document.write(html);
    win.document.close();
    setTimeout(() => win.print(), 500);
}

function printReportPurchase(idx) {
    if (!currentReportData || !currentReportData.purchases[idx]) return;
    printPurchaseSlip(currentReportData.purchases[idx]);
}

function printRecentPurchase(idx) {
    if (!currentPurchases || !currentPurchases[idx]) return;
    printPurchaseSlip(currentPurchases[idx]);
}

function showPurchaseDetailsModal(p) {
    let vendor = p.vendor || 'Unknown Vendor';
    let ref = p.reference || '';
    
    if (!ref && vendor.match(/^(.*?)\s*\(Ref:\s*(.*?)\)$/)) {
        const match = vendor.match(/^(.*?)\s*\(Ref:\s*(.*?)\)$/);
        vendor = match[1];
        ref = match[2];
    }
    
    if (!ref) ref = '—';
    
    let total = 0;
    const itemsHTML = p.items.map(it => {
        const sub = it.qty * it.price;
        total += sub;
        return `<tr>
            <td>${esc(it.name)}</td>
            <td style="text-align: right;">${it.packSize ? it.packSize.toFixed(2) : '—'}</td>
            <td style="text-align: right;">${it.packs ? it.packs.toFixed(2) : '—'}</td>
            <td style="text-align: right;">${it.qty.toFixed(2)} ${esc(it.unit)}</td>
            <td style="text-align: right;">Rs. ${it.price.toFixed(2)}</td>
            <td style="text-align: right;">Rs. ${sub.toFixed(2)}</td>
        </tr>`;
    }).join('');

    const modalHTML = `
        <div id="purchase-modal" style="position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.4); backdrop-filter:blur(5px); -webkit-backdrop-filter:blur(5px); display:flex; justify-content:center; align-items:center; z-index:1000;">
            <div class="card" style="width:650px; max-width:90%; max-height:80vh; overflow-y:auto; background:var(--white); border:1px solid var(--slate2); box-shadow:var(--shadow-xl);">
                <div class="card-header" style="display:flex; justify-content:space-between; align-items:center;">
                    <div class="card-title">Purchase Details</div>
                    <button class="btn btn-xs btn-danger" onclick="closePurchaseModal()">✕</button>
                </div>
                <div style="padding:20px;">
                    <div style="margin-bottom:15px; font-size:14px; color:var(--muted);">
                        <div><strong>Vendor:</strong> ${esc(vendor)}</div>
                        <div><strong>Reference:</strong> ${esc(ref)}</div>
                        <div><strong>Time:</strong> ${new Date(p.created_at).toLocaleTimeString()}</div>
                    </div>
                    <div class="table-wrap">
                        <table>
                            <thead><tr><th>Material</th><th style="text-align:right;">Pack Size</th><th style="text-align:right;">Packs</th><th style="text-align:right;">Total Qty</th><th style="text-align:right;">Price</th><th style="text-align:right;">Total</th></tr></thead>
                            <tbody>${itemsHTML}</tbody>
                        </table>
                    </div>
                    <div style="margin-top:15px; text-align:right; font-weight:700; color:var(--brand);">
                        Grand Total: Rs. ${total.toFixed(2)}
                    </div>
                </div>
            </div>
        </div>
    `;
    
    const div = document.createElement('div');
    div.id = 'purchase-modal-container';
    div.innerHTML = modalHTML;
    document.body.appendChild(div);
}

function showPurchaseDetails(idx) {
    if (!currentReportData || !currentReportData.purchases[idx]) return;
    showPurchaseDetailsModal(currentReportData.purchases[idx]);
}

function showRecentPurchaseDetails(idx) {
    if (!currentPurchases || !currentPurchases[idx]) return;
    showPurchaseDetailsModal(currentPurchases[idx]);
}

function closePurchaseModal() {
    const el = document.getElementById('purchase-modal-container');
    if (el) el.remove();
}
function exportPurchaseSlipPDF() {
    const vendor = document.getElementById('purch-vendor-bulk').value.trim();
    const reference = document.getElementById('purch-ref-bulk') ? document.getElementById('purch-ref-bulk').value.trim() : '';
    
    if (!vendor) { alert("Enter Vendor Name."); return; }
    if (!draftPurchaseItems.length) { alert("No items in the purchase list."); return; }
    
    const dateFormatted = formatDate(new Date());
    let total = 0;
    
    const itemsHTML = draftPurchaseItems.map(p => {
        const sub = p.qty * p.price;
        total += sub;
        return `
            <tr>
                <td style="padding: 8px; border-bottom: 1px solid #ddd;">${esc(p.name)}</td>
                <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: right;">${p.packSize ? p.packSize.toFixed(2) : '—'}</td>
                <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: right;">${p.packs ? p.packs.toFixed(2) : '—'}</td>
                <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: right;">${p.qty.toFixed(2)} ${esc(p.unit)}</td>
                <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: right;">Rs. ${p.price.toFixed(2)}</td>
                <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: right;">Rs. ${sub.toFixed(2)}</td>
            </tr>
        `;
    }).join('');

    const html = `
        <html>
        <head>
            <title>Purchase Slip - ${vendor}</title>
            <style>
                body { font-family: sans-serif; color: #333; line-height: 1.4; }
                table { width: 100%; border-collapse: collapse; margin-top: 10px; }
                th, td { border: 1px solid #ddd; padding: 8px; }
                th { background: #f8fafc; text-align: left; padding: 8px; font-size: 12px; text-transform: uppercase; color: #64748b; }
            </style>
        </head>
        <body>
            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px;">
                <div>
                    <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 4px;">
                        <img src="${window.location.origin}/Roalux_PNG.png" style="height: 40px;">
                        <div style="font-size: 28px; font-weight: 900; letter-spacing: -1px; color: #000;">MIXLAB</div>
                    </div>
                    <div style="font-size: 12px; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 1px;">Paint Recipe System</div>
                </div>
                <div style="text-align: right;">
                    <div style="font-size: 24px; font-weight: 800; color: #1e293b;">Purchase Slip</div>
                    <div style="font-size: 14px; font-weight: 600; color: #64748b;">${dateFormatted}</div>
                </div>
            </div>
            
            <div style="height: 2px; background: #1e293b; margin-bottom: 20px;"></div>

            <div style="margin-bottom: 15px; font-size: 14px; color: #475569;">
                <div><strong>Vendor:</strong> ${esc(vendor)}</div>
                ${reference ? `<div><strong>Reference:</strong> ${esc(reference)}</div>` : ''}
            </div>

            <table>
                <thead><tr><th>Material</th><th style="text-align:right;">Pack Size</th><th style="text-align:right;">Packs</th><th style="text-align:right;">Total Qty</th><th style="text-align:right;">Unit Price</th><th style="text-align:right;">Total Price</th></tr></thead>
                <tbody>${itemsHTML}</tbody>
            </table>

            <div style="margin-top: 20px; text-align: right; font-size: 16px; font-weight: 700;">
                Grand Total: Rs. ${total.toFixed(2)}
            </div>
        </body>
        </html>
    `;

    const win = window.open('', '_blank');
    win.document.write(html);
    win.document.close();
    setTimeout(() => win.print(), 500);
}

function initSplitSearchDropdowns(groupId, productId, data, onSelect, codeKey = 'group_code') {
    const groupInput = document.getElementById(groupId);
    const prodInput = document.getElementById(productId);
    if (!groupInput || !prodInput) return;

    const groups = [...new Set(data.map(p => p[codeKey] || ''))]
        .filter(Boolean)
        .sort()
        .map(g => ({ id: g, name: g }));

    // Init Group Dropdown
    initSearchableDropdown(groupId, groups, (grp) => {
        // Clear product input when group changes
        prodInput.value = '';
        prodInput.removeAttribute('data-id');

        // Refresh product dropdown with filtered items
        const filtered = data.filter(p => (p[codeKey] || '') === grp.id);
        
        // Clean up old results/listeners for product input
        const clone = prodInput.cloneNode(true);
        prodInput.parentNode.replaceChild(clone, prodInput);
        
        initSearchableDropdown(productId, filtered, onSelect, codeKey);
        
        // Focus product input for better UX
        clone.focus();
    }, 'id');

    // Init Product Dropdown with full data initially
    initSearchableDropdown(productId, data, onSelect, codeKey);
}

// UTILS & COMPONENTS
// ------------------------------------------
function initSearchableDropdown(inputId, data, onSelect, codeKey = 'group_code') {
    const input = document.getElementById(inputId);
    if (!input) return;

    // Wrap input if not already wrapped
    let container = input.parentElement;
    if (!container.classList.contains('dropdown-container')) {
        container = document.createElement('div');
        container.className = 'dropdown-container';
        input.parentNode.insertBefore(container, input);
        container.appendChild(input);
    }

    // Create results div
    let resultsDiv = container.querySelector('.dropdown-results');
    if (!resultsDiv) {
        resultsDiv = document.createElement('div');
        resultsDiv.className = 'dropdown-results';
        container.appendChild(resultsDiv);
    }

    let activeIndex = -1;
    let filteredData = [];

    input.addEventListener('input', () => {
        const query = input.value.toLowerCase().trim();
        activeIndex = -1;

        if (!query) {
            filteredData = data;
            if (!document.activeElement || document.activeElement !== input) {
                resultsDiv.style.display = 'none';
                return;
            }
        } else {
            filteredData = data.filter(item => {
                const name = item.name.toLowerCase();
                const code = (item[codeKey] || '').toLowerCase();
                return name.includes(query) || code.includes(query);
            });

            // Sort: Code matches first, then name matches
            filteredData.sort((a, b) => {
                const aCode = (a[codeKey] || '').toLowerCase();
                const bCode = (b[codeKey] || '').toLowerCase();
                const aName = a.name.toLowerCase();
                const bName = b.name.toLowerCase();

                if (aCode.startsWith(query) && !bCode.startsWith(query)) return -1;
                if (!aCode.startsWith(query) && bCode.startsWith(query)) return 1;
                if (aName.startsWith(query) && !bName.startsWith(query)) return -1;
                if (!aName.startsWith(query) && bName.startsWith(query)) return 1;
                return 0;
            });
        }

        renderResults();
    });

    input.addEventListener('keydown', (e) => {
        if (!resultsDiv.style.display || resultsDiv.style.display === 'none') return;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            activeIndex = Math.min(activeIndex + 1, filteredData.length - 1);
            highlightItem();
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            activeIndex = Math.max(activeIndex - 1, 0);
            highlightItem();
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (activeIndex >= 0) selectItem(filteredData[activeIndex]);
            else if (filteredData.length > 0) selectItem(filteredData[0]);
        } else if (e.key === 'Escape') {
            resultsDiv.style.display = 'none';
        }
    });

    function renderResults() {
        if (filteredData.length === 0) {
            resultsDiv.innerHTML = '<div class="dropdown-no-results">No results found</div>';
        } else {
            resultsDiv.innerHTML = filteredData.map((item, i) => `
                <div class="dropdown-item ${i === activeIndex ? 'active' : ''}" data-index="${i}">
                    <span class="item-code">${item[codeKey] || ''}</span>
                    <span class="item-name">${esc(item.name)}</span>
                </div>
            `).join('');

            resultsDiv.querySelectorAll('.dropdown-item').forEach(el => {
                el.addEventListener('click', () => {
                    const idx = parseInt(el.getAttribute('data-index'));
                    selectItem(filteredData[idx]);
                });
            });
        }
        resultsDiv.style.display = 'block';
    }

    function highlightItem() {
        resultsDiv.querySelectorAll('.dropdown-item').forEach((el, i) => {
            el.classList.toggle('active', i === activeIndex);
            if (i === activeIndex) el.scrollIntoView({ block: 'nearest' });
        });
    }

    function selectItem(item) {
        input.value = item.name;
        input.setAttribute('data-id', item.id);
        resultsDiv.style.display = 'none';
        if (onSelect) onSelect(item);
    }

    input.addEventListener('blur', () => {
        setTimeout(() => {
            const val = input.value.trim().toLowerCase();
            if (!val) return;
            const match = data.find(item => (item[codeKey] || '').toLowerCase() === val);
            if (match) {
                selectItem(match);
            }
        }, 200);
    });

    // Close on outside click
    document.addEventListener('click', (e) => {
        if (!container.contains(e.target)) {
            resultsDiv.style.display = 'none';
        }
    });

    // Show on focus
    input.addEventListener('focus', () => {
        input.dispatchEvent(new Event('input'));
    });
}

function esc(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Enter key navigation between inputs
document.addEventListener('keydown', function(e) {
    if (e.key === 'Enter' && e.target.tagName === 'INPUT') {
        if (e.target.tagName === 'TEXTAREA') return;
        
        // Scope to closest form/container for better flow
        const container = e.target.closest('.form-grid') || e.target.closest('.card') || document.querySelector('.anim:not([style*="display:none"])') || document;
        
        const focusable = Array.from(container.querySelectorAll('input:not([readonly]):not([disabled]), button.btn-brand, button.btn-primary, button.btn-reduce-stock'));
        const index = focusable.indexOf(e.target);
        
        if (index > -1 && index < focusable.length - 1) {
            const next = focusable[index + 1];
            next.focus();
            e.preventDefault();
        }
    }
});

