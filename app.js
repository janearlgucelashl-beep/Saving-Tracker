import { Store } from './store.js';

// --- State & Constants ---
let state = Store.load();
let currentPlanId = null;
let globalChart = null;
let planChart = null;

// Initialize missing state props
state.history = state.history || [];
state.plans = state.plans || [];
state.totalSavings = state.totalSavings || 0;

// --- Helper Functions ---
function getTodayStr() {
    // Strictly uses Philippines Time (Asia/Manila)
    return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
}

function getManilaDate() {
    // Robust way to get the current date in Philippines Time (UTC+8)
    const now = new Date();
    const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
    return new Date(utc + (3600000 * 8));
}

function countCalculationDays(start, end) {
    // Counts only Monday to Friday (Mon-Fri) specifically in Manila Time
    let count = 0;
    let cur = new Date(start);
    const last = new Date(end);
    cur.setHours(0, 0, 0, 0);
    last.setHours(0, 0, 0, 0);

    while (cur <= last) {
        const dayName = cur.toLocaleDateString('en-US', { timeZone: 'Asia/Manila', weekday: 'short' });
        if (!['Sat', 'Sun'].includes(dayName)) {
            count++;
        }
        cur.setDate(cur.getDate() + 1);
    }
    return count;
}

function calculateRequiredDaily(plan, allowance) {
    if (!plan.goal) return 0;
    
    const today = getManilaDate();
    today.setHours(0, 0, 0, 0);
    const end = new Date(plan.endDate);
    end.setHours(0, 0, 0, 0);
    
    if (today > end) return 0;
    
    // Remaining days counting Monday to Friday only
    const daysLeft = countCalculationDays(today, end);
    if (daysLeft <= 0) return allowance; // Should save everything if it's the last day
    
    // The Formula: (Goal - Total Savings) / Days Left
    // We include penalty debt if the user missed previous goals and has Penalty Mode on
    const currentSavings = plan.totalSaved || 0;
    const remainingNeeded = plan.goal - currentSavings;
    
    let target = Math.max(0, remainingNeeded / daysLeft);
    
    // The target is capped by what you actually have today (today's allowance)
    return Math.min(allowance, target);
}

function saveState() {
    Store.save(state);
}

// --- Daily Logic ---
function checkDailyReset() {
    const todayStr = getTodayStr();
    if (state.lastLoginDate !== todayStr) {
        state.plans.forEach(plan => {
            if (plan.dayActive) {
                // Actual savings for the day is whatever was left from the allowance
                const actualSavings = (plan.dailyAllowance || 0) - (plan.dailySpent || 0);
                const target = plan.dailySavingsGoal || 0;
                
                // Track debt in penalty mode if actual savings didn't meet the target
                if (plan.penaltyMode && (plan.estimateMode || plan.manualSavingsMode)) {
                    if (actualSavings < target) {
                        plan.penaltyDebt = (plan.penaltyDebt || 0) + (target - actualSavings);
                    }
                }

                // Update totals (actualSavings can be negative if overspent)
                state.totalSavings += actualSavings;
                plan.totalSaved = (plan.totalSaved || 0) + actualSavings;
                plan.totalSpent = (plan.totalSpent || 0) + (plan.dailySpent || 0);
                
                // Reset daily
                plan.dayActive = false;
                plan.dailyAllowance = 0;
                plan.dailySpent = 0;
                plan.dailySavingsGoal = 0;
            }
        });

        state.history.push({
            date: state.lastLoginDate || todayStr,
            savings: state.totalSavings
        });
        if (state.history.length > 30) state.history.shift();

        state.lastLoginDate = todayStr;
        saveState();
    }
}

// --- Navigation ---
function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    
    document.getElementById(screenId).classList.add('active');
    const navItem = document.querySelector(`.nav-item[data-screen="${screenId}"]`);
    if (navItem) navItem.classList.add('active');

    checkDailyReset(); // Ensure reset whenever switching views
    if (screenId === 'home-screen') renderPlans();
    if (screenId === 'reports-screen') renderGlobalReports();
}

function openPlanHub(planId) {
    currentPlanId = planId;
    const plan = state.plans.find(p => p.id === planId);
    document.getElementById('detail-plan-name').innerText = plan.name;
    
    // Set settings UI values
    document.getElementById('toggle-estimate').checked = plan.estimateMode;
    document.getElementById('toggle-manual').checked = plan.manualSavingsMode;
    document.getElementById('toggle-penalty').checked = plan.penaltyMode;
    document.getElementById('edit-plan-name').value = plan.name;
    document.getElementById('edit-start-date').value = plan.startDate;
    document.getElementById('edit-end-date').value = plan.endDate;
    document.getElementById('edit-goal').value = plan.goal || '';

    updatePlanHubUI();
    showScreen('plan-detail-screen');
    // Default to 'This' tab
    switchTab('this-tab');
}

function switchTab(tabId) {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tabId));
    document.querySelectorAll('.tab-pane').forEach(p => p.classList.toggle('active', p.id === tabId));
    
    if (tabId === 'reports-tab') renderPlanReports();
}

// --- Rendering ---
function renderPlans() {
    const list = document.getElementById('plans-list');
    if (state.plans.length === 0) {
        list.innerHTML = `<div class="card" style="text-align:center; color:var(--text-light)">No plans yet. Create one!</div>`;
        return;
    }

    const today = new Date();
    list.innerHTML = state.plans.map(p => {
        const startDate = new Date(p.startDate);
        const isPending = today < startDate;
        const progress = p.goal ? Math.min(100, ((p.totalSaved || 0) / p.goal) * 100) : 0;
        
        return `
            <div class="plan-card ${isPending ? 'pending' : ''}" onclick="window.openPlanHub('${p.id}')">
                <div>
                    <h3>${p.name}</h3>
                    <p>${isPending ? 'Starts ' + p.startDate : 'Active until ' + p.endDate}</p>
                    <small>Saved: ₱${(p.totalSaved || 0).toFixed(2)}</small>
                </div>
                <div style="text-align:right">
                    <i data-lucide="chevron-right"></i>
                    ${p.goal ? `<div style="font-size:10px; margin-top:4px">${progress.toFixed(0)}%</div>` : ''}
                </div>
            </div>
        `;
    }).join('');
    lucide.createIcons();
}

function updatePlanHubUI() {
    const plan = state.plans.find(p => p.id === currentPlanId);
    const today = new Date();
    const startDate = new Date(plan.startDate);
    const isStarted = today >= startDate;

    // "This" tab state
    const banner = document.getElementById('not-started-msg');
    const actionCard = document.getElementById('daily-action-card');
    
    if (!isStarted) {
        banner.classList.remove('hidden');
        document.getElementById('start-date-status').innerText = `Plan starts on ${plan.startDate}`;
        actionCard.classList.add('hidden');
    } else {
        banner.classList.add('hidden');
        actionCard.classList.remove('hidden');
        
        if (plan.dayActive) {
            document.getElementById('allowance-setup-ui').classList.add('hidden');
            document.getElementById('day-active-ui').classList.remove('hidden');
            
            const remaining = plan.dailyAllowance - plan.dailySpent;
            const target = plan.dailySavingsGoal || 0;
            
            document.getElementById('ui-remaining').innerText = `₱${remaining.toFixed(2)}`;
            document.getElementById('ui-savings').innerText = `₱${target.toFixed(2)}`;
            document.getElementById('ui-spent').innerText = `₱${(plan.dailySpent || 0).toFixed(2)}`;
        } else {
            document.getElementById('allowance-setup-ui').classList.remove('hidden');
            document.getElementById('day-active-ui').classList.add('hidden');
            document.getElementById('manual-savings-group').classList.toggle('hidden', !plan.manualSavingsMode);
            // Clear inputs for new day
            document.getElementById('input-allowance').value = '';
            document.getElementById('input-manual-savings').value = '';
        }
    }

    renderProducts();
}

function renderProducts() {
    const plan = state.plans.find(p => p.id === currentPlanId);
    const container = document.getElementById('products-grid');
    
    if (!plan.products || plan.products.length === 0) {
        container.innerHTML = `<p style="grid-column: 1/-1; text-align:center; color:var(--text-light)">No products.</p>`;
        return;
    }

    container.innerHTML = plan.products.map((prod, idx) => `
        <div class="product-item">
            <button class="btn-del-prod btn-icon" onclick="window.deleteProduct(${idx})"><i data-lucide="x" size="12"></i></button>
            <h4>${prod.name}</h4>
            <p>₱${prod.price.toFixed(2)}</p>
            <button class="btn-buy-mini" onclick="window.buyProduct(${idx})" ${!plan.dayActive ? 'disabled' : ''}>Buy</button>
        </div>
    `).join('');
    lucide.createIcons();
}

function renderPlanReports() {
    const plan = state.plans.find(p => p.id === currentPlanId);
    const progress = plan.goal ? Math.min(100, ((plan.totalSaved || 0) / plan.goal) * 100) : 0;
    
    document.getElementById('plan-progress-bar').style.width = `${progress}%`;
    
    // Calculate real calendar days left for visual report
    const today = new Date();
    today.setHours(0,0,0,0);
    const end = new Date(plan.endDate);
    end.setHours(0,0,0,0);
    const diffTime = end - today;
    const realDaysLeft = Math.max(0, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
    
    document.getElementById('stat-days-left').innerText = realDaysLeft;
    document.getElementById('stat-debt').innerText = `₱${(plan.penaltyDebt || 0).toFixed(2)}`;
    
    // Check if there's a custom display for saved amount
    const savedEl = document.getElementById('stat-total-saved') || null;
    if (savedEl) savedEl.innerText = `₱${(plan.totalSaved || 0).toFixed(2)}`;

    if (plan.dayActive) {
        const rec = plan.dailySavingsGoal || 0;
        document.getElementById('plan-recommendation').innerText = `Today's Target: ₱${rec.toFixed(2)}`;
    } else {
        document.getElementById('plan-recommendation').innerText = "Set today's allowance to see target.";
    }

    const ctx = document.getElementById('plan-mini-chart');
    if (planChart) planChart.destroy();
    planChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Saved', 'Remaining'],
            datasets: [{
                data: [plan.totalSaved || 0, Math.max(0, (plan.goal || 0) - (plan.totalSaved || 0))],
                backgroundColor: ['#2ecc71', '#eee']
            }]
        },
        options: { cutout: '70%', plugins: { legend: { display: false } } }
    });
}

function renderGlobalReports() {
    document.getElementById('total-savings-amount').innerText = `₱${state.totalSavings.toFixed(2)}`;
    
    const ctx = document.getElementById('savings-chart');
    if (globalChart) globalChart.destroy();
    
    const labels = state.history.map(h => h.date.split(' ').slice(1,3).join(' '));
    const data = state.history.map(h => h.savings);
    
    if (labels.length === 0) { labels.push('Today'); data.push(state.totalSavings); }

    globalChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [{
                label: 'Savings Trend',
                data,
                borderColor: '#2ecc71',
                tension: 0.3,
                fill: true,
                backgroundColor: 'rgba(46, 204, 113, 0.1)'
            }]
        },
        options: { maintainAspectRatio: false, plugins: { legend: { display: false } } }
    });

    const list = document.getElementById('global-reports-list');
    list.innerHTML = state.plans.map(p => `
        <div class="card">
            <div style="display:flex; justify-content:space-between">
                <strong>${p.name}</strong>
                <span>₱${(p.totalSaved || 0).toFixed(2)}</span>
            </div>
            <div class="progress-container">
                <div class="progress-bar" style="width: ${p.goal ? (p.totalSaved / p.goal * 100) : 0}%"></div>
            </div>
        </div>
    `).join('');
}

// --- Event Handlers ---
function setupEvents() {
    document.getElementById('agree-tos-btn').onclick = () => {
        state.tosAgreed = true;
        saveState();
        document.getElementById('tos-overlay').classList.add('hidden');
        document.getElementById('main-content').classList.remove('hidden');
    };

    document.querySelectorAll('.nav-item').forEach(b => {
        b.onclick = () => showScreen(b.dataset.screen);
    });

    document.querySelectorAll('.tab-btn').forEach(b => {
        b.onclick = () => switchTab(b.dataset.tab);
    });

    document.getElementById('back-to-home').onclick = () => showScreen('home-screen');

    // Create Plan
    document.getElementById('add-plan-btn').onclick = () => {
        document.getElementById('plan-modal').classList.remove('hidden');
    };
    document.getElementById('close-plan-modal').onclick = () => {
        document.getElementById('plan-modal').classList.add('hidden');
    };
    document.getElementById('save-new-plan').onclick = () => {
        const name = document.getElementById('new-plan-name').value;
        const start = document.getElementById('new-plan-start').value;
        const end = document.getElementById('new-plan-end').value;
        const goal = parseFloat(document.getElementById('new-plan-goal').value);

        if (!name || !start || !end) return alert('Name and Dates are required');

        const newPlan = {
            id: Date.now().toString(),
            name, startDate: start, endDate: end, goal: goal || 0,
            products: [], totalSaved: 0, totalSpent: 0, penaltyDebt: 0,
            estimateMode: true, manualSavingsMode: false, penaltyMode: true,
            dayActive: false
        };
        state.plans.push(newPlan);
        saveState();
        renderPlans();
        document.getElementById('plan-modal').classList.add('hidden');
    };

    // Update Plan
    document.getElementById('update-plan-btn').onclick = () => {
        const plan = state.plans.find(p => p.id === currentPlanId);
        plan.name = document.getElementById('edit-plan-name').value;
        plan.startDate = document.getElementById('edit-start-date').value;
        plan.endDate = document.getElementById('edit-end-date').value;
        plan.goal = parseFloat(document.getElementById('edit-goal').value) || 0;
        saveState();
        updatePlanHubUI();
        alert('Plan updated');
    };

    // Toggles
    document.getElementById('toggle-estimate').onchange = (e) => {
        const plan = state.plans.find(p => p.id === currentPlanId);
        plan.estimateMode = e.target.checked;
        if (plan.estimateMode) {
            plan.manualSavingsMode = false;
            document.getElementById('toggle-manual').checked = false;
        }
        saveState();
        updatePlanHubUI();
    };
    document.getElementById('toggle-manual').onchange = (e) => {
        const plan = state.plans.find(p => p.id === currentPlanId);
        plan.manualSavingsMode = e.target.checked;
        if (plan.manualSavingsMode) {
            plan.estimateMode = false;
            document.getElementById('toggle-estimate').checked = false;
        }
        saveState();
        updatePlanHubUI();
    };
    document.getElementById('toggle-penalty').onchange = (e) => {
        const plan = state.plans.find(p => p.id === currentPlanId);
        plan.penaltyMode = e.target.checked;
        saveState();
    };

    // Daily Actions
    document.getElementById('start-day-btn').onclick = () => {
        const plan = state.plans.find(p => p.id === currentPlanId);
        const allowanceInput = document.getElementById('input-allowance').value;
        if (allowanceInput === "") return alert('Please enter today\'s allowance');
        
        const allowance = parseFloat(allowanceInput) || 0;
        let target = 0;

        if (plan.manualSavingsMode) {
            target = parseFloat(document.getElementById('input-manual-savings').value) || 0;
        } else if (plan.estimateMode) {
            // Formula updated: includes goal, total savings, and days remaining (M-F)
            target = calculateRequiredDaily(plan, allowance);
        }

        plan.dayActive = true;
        plan.dailyAllowance = allowance;
        plan.dailySavingsGoal = target;
        plan.dailySpent = 0;
        saveState();
        updatePlanHubUI();
    };

    document.getElementById('buy-other-btn').onclick = () => {
        const plan = state.plans.find(p => p.id === currentPlanId);
        const costInput = document.getElementById('other-purchase-amount').value;
        const cost = parseFloat(costInput) || 0;
        if (cost <= 0) return;

        const remaining = plan.dailyAllowance - plan.dailySpent;
        if (cost > remaining) {
            if (!confirm('This exceeds your remaining allowance. Continue?')) return;
        }
        plan.dailySpent += cost;
        saveState();
        updatePlanHubUI();
        document.getElementById('other-purchase-amount').value = '';
    };

    // Product Modal
    document.getElementById('open-add-product-btn').onclick = () => document.getElementById('product-modal').classList.remove('hidden');
    document.getElementById('close-prod-modal').onclick = () => document.getElementById('product-modal').classList.add('hidden');
    document.getElementById('save-prod-btn').onclick = () => {
        const name = document.getElementById('prod-name').value;
        const price = parseFloat(document.getElementById('prod-price').value);
        if (!name || isNaN(price)) return;
        const plan = state.plans.find(p => p.id === currentPlanId);
        plan.products.push({ name, price });
        saveState();
        renderProducts();
        document.getElementById('product-modal').classList.add('hidden');
    };

    // Delete Plan
    document.getElementById('delete-plan-btn').onclick = () => {
        document.getElementById('confirm-title').innerText = "Delete Plan?";
        document.getElementById('confirm-msg').innerText = "This will permanently remove this savings plan and all its data.";
        document.getElementById('confirm-modal').classList.remove('hidden');
        document.getElementById('confirm-ok').onclick = () => {
            state.plans = state.plans.filter(p => p.id !== currentPlanId);
            saveState();
            showScreen('home-screen');
            document.getElementById('confirm-modal').classList.add('hidden');
        };
    };
    document.getElementById('confirm-cancel').onclick = () => document.getElementById('confirm-modal').classList.add('hidden');
}

// Global window helpers for dynamic HTML
window.openPlanHub = openPlanHub;
window.deleteProduct = (idx) => {
    const plan = state.plans.find(p => p.id === currentPlanId);
    plan.products.splice(idx, 1);
    saveState();
    renderProducts();
};
window.buyProduct = (idx) => {
    const plan = state.plans.find(p => p.id === currentPlanId);
    const prod = plan.products[idx];
    const remaining = plan.dailyAllowance - plan.dailySpent;
    // Allow overspending if they really want to, which will affect savings
    if (prod.price > remaining) {
        if (!confirm('This exceeds your remaining allowance. Continue?')) return;
    }
    plan.dailySpent += prod.price;
    saveState();
    updatePlanHubUI();
};

// --- Start ---
function init() {
    lucide.createIcons();
    checkDailyReset();
    
    // Auto-refresh when app comes back to focus to catch 12AM flips
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
            checkDailyReset();
            if (currentPlanId) updatePlanHubUI();
        }
    });

    if (state.tosAgreed) {
        document.getElementById('tos-overlay').classList.add('hidden');
        document.getElementById('main-content').classList.remove('hidden');
    }
    renderPlans();
    setupEvents();
}

init();