// 使用 CDN 或絕對路徑來載入 JSON 檔案
// 注意：本檔案需要依賴 config.js，請確保它在腳本之前被載入。

let currentLang = localStorage.getItem("lang");
let currentMonthDate = new Date();
let translations = {};
let monthDataCache = {}; // 新增：用於快取月份打卡資料
let isApiCalled = false; // 新增：用於追蹤 API 呼叫狀態，避免重複呼叫
let userId = localStorage.getItem("sessionUserId");


// 載入語系檔
async function loadTranslations(lang) {
    try {
        const res = await fetch(`https://0rigind1865-bit.github.io/Attendance-System/i18n/${lang}.json`);
        if (!res.ok) {
            throw new Error(`HTTP 錯誤: ${res.status}`);
        }
        translations = await res.json();
        currentLang = lang;
        localStorage.setItem("lang", lang);
    } catch (err) {
        console.error("載入語系失敗:", err);
    }
}

// 翻譯函式
function t(code, params = {}) {
    let text = translations[code] || code;
    for (const key in params) {
        text = text.replace(`{${key}}`, params[key]);
    }
    return text;
}

/* ===== JSONP 呼叫 ===== */
function callApi(action, cb, loadingId = "loading") {
    const token = localStorage.getItem("sessionToken");
    const url = `${API_CONFIG.apiUrl}?action=${action}&token=${token}&callback=handleResponse`;
    const script = document.createElement("script");
    
    // 顯示指定 loading
    const loadingEl = document.getElementById(loadingId);
    if (loadingEl) loadingEl.style.display = "block";
    
    // 處理 JSONP 回應
    window.handleResponse = (res) => {
        if (loadingEl) loadingEl.style.display = "none";
        cb(res);
        if (script.parentNode) {
            script.parentNode.removeChild(script);
        }
    };
    
    script.src = url;
    script.onerror = () => showNotification(t("CONNECTION_FAILED"), "error");
    document.body.appendChild(script);
}

/* ===== 交換一次性 token ===== */
function exchangeToken(action, otoken, cb) {
    const url = `${API_CONFIG.apiUrl}?action=${action}&otoken=${otoken}&callback=handleExchange`;
    const script = document.createElement("script");
    window.handleExchange = cb;
    script.src = url;
    script.onerror = () => showNotification(t("CONNECTION_FAILED"), "error");
    document.body.appendChild(script);
}

/* ===== 補打卡 ===== */
function callApiAdjustPunch(type, datetime, cb) {
    const token = localStorage.getItem("sessionToken");
    const dateObj = new Date(datetime);
    const lat = 0;
    const lng = 0;
    
    const url = `${API_CONFIG.apiUrl}?action=adjustPunch&token=${token}&type=${encodeURIComponent(type)}&lat=${lat}&lng=${lng}&datetime=${dateObj.toISOString()}&callback=handleAdjustResponse&note=${encodeURIComponent(navigator.userAgent)}`;
    const script = document.createElement("script");
    const loadingEl = document.getElementById("loadingMsg");
    if (loadingEl) loadingEl.style.display = "block";
    
    window.handleAdjustResponse = (res) => {
        if (loadingEl) loadingEl.style.display = "none";
        cb(res);
    };
    
    script.src = url;
    script.onerror = () => showNotification(t("CONNECTION_FAILED"), "error");
    document.body.appendChild(script);
}

/* ===== 共用訊息顯示 ===== */
const showNotification = (message, type = 'success') => {
    const notification = document.getElementById('notification');
    const notificationMessage = document.getElementById('notification-message');
    notificationMessage.textContent = message;
    notification.className = 'notification'; // reset classes
    if (type === 'success') {
        notification.classList.add('bg-green-500', 'text-white');
    } else if (type === 'warning') {
        notification.classList.add('bg-yellow-500', 'text-white');
    } else {
        notification.classList.add('bg-red-500', 'text-white');
    }
    notification.classList.add('show');
    setTimeout(() => {
        notification.classList.remove('show');
    }, 3000);
};

// 確保登入
function ensureLogin() {
    return new Promise((resolve) => {
        if (localStorage.getItem("sessionToken")) {
            document.getElementById("status").textContent = t("CHECKING_LOGIN");
            callApi("checkSession", (res) => {
                res.msg = t(res.code);
                if (res.ok) {
                    document.getElementById("user-name").textContent = res.user.name;
                    document.getElementById("profile-img").src = res.user.picture || res.user.rate;
                    
                    localStorage.setItem("sessionUserId", res.user.userId);
                    showNotification(t("LOGIN_SUCCESS"));
                    
                    document.getElementById('login-section').style.display = 'none';
                    document.getElementById('user-header').style.display = 'flex';
                    document.getElementById('main-app').style.display = 'block';
                    
                    // 檢查異常打卡
                    checkAbnormal();
                    resolve(true);
                } else {
                    const errorMsg = t(res.code || "UNKNOWN_ERROR");
                    showNotification(`❌ ${errorMsg}`, "error");
                    document.getElementById("status").textContent = t("PLEASE_RELOGIN");
                    document.getElementById('login-btn').style.display = 'block';
                    document.getElementById('user-header').style.display = 'none';
                    document.getElementById('main-app').style.display = 'none';
                    resolve(false);
                }
            });
        } else {
            document.getElementById('login-btn').style.display = 'block';
            document.getElementById('user-header').style.display = 'none';
            document.getElementById('main-app').style.display = 'none';
            document.getElementById("status").textContent = t("SUBTITLE_LOGIN");
            resolve(false);
        }
    });
}

//檢查本月打卡異常
function checkAbnormal() {
    const now = new Date();
    const month = now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, "0");
    const userId = localStorage.getItem("sessionUserId");
    
    const recordsLoading = document.getElementById("records-loading");
    recordsLoading.style.display = 'block';
    
    callApi(`getAbnormalRecords&month=${month}&userId=${userId}`, (res) => {
        recordsLoading.style.display = 'none';
        if (res.ok) {
            const abnormalRecordsSection = document.getElementById("abnormal-records-section");
            const abnormalList = document.getElementById("abnormal-list");
            const recordsEmpty = document.getElementById("records-empty");
            
            if (res.records.length > 0) {
                abnormalRecordsSection.style.display = 'block';
                recordsEmpty.style.display = 'none';
                abnormalList.innerHTML = '';
                res.records.forEach(record => {
                    const li = document.createElement('li');
                    li.className = 'p-3 bg-gray-50 rounded-lg flex justify-between items-center';
                    li.innerHTML = `
                        <div>
                            <p class="font-medium text-gray-800">${record.date}</p>
                            <p class="text-sm text-red-600">${record.reason}</p>
                        </div>
                        <button data-date="${record.date}" data-reason="${record.reason}" class="adjust-btn text-sm font-semibold text-indigo-600 hover:text-indigo-800">補打卡</button>
                    `;
                    abnormalList.appendChild(li);
                });
            } else {
                abnormalRecordsSection.style.display = 'block';
                recordsEmpty.style.display = 'block';
                abnormalList.innerHTML = '';
            }
        } else {
            console.error("Failed to fetch abnormal records:", res.msg);
            showNotification(t("ERROR_FETCH_RECORDS"), "error");
        }
    });
}

// 渲染日曆的函式
function renderCalendar(date) {
    const monthTitle = document.getElementById('month-title');
    const calendarGrid = document.getElementById('calendar-grid');
    const year = date.getFullYear();
    const month = date.getMonth();
    const today = new Date();
    
    // 生成 monthKey
    const monthkey = currentMonthDate.getFullYear() + "-" + String(currentMonthDate.getMonth() + 1).padStart(2, "0");
    
    // 檢查快取中是否已有該月份資料
    if (monthDataCache[monthkey]) {
        // 如果有，直接從快取讀取資料並渲染
        const records = monthDataCache[monthkey];
        renderCalendarWithData(year, month, today, records, calendarGrid, monthTitle);
    } else {
        // 如果沒有，才發送 API 請求
        // 清空日曆，顯示載入狀態，並確保置中
        calendarGrid.innerHTML = '<div class="col-span-full text-center text-gray-500 py-4">正在載入...</div>';
        
        callApi(`getAttendanceDetails&month=${monthkey}&userId=${userId}`, (res) => {
            if (res.ok) {
                // 將資料存入快取
                monthDataCache[monthkey] = res.records;
                
                // 收到資料後，清空載入訊息
                calendarGrid.innerHTML = '';
                
                // 從快取取得本月資料
                const records = monthDataCache[monthkey] || [];
                renderCalendarWithData(year, month, today, records, calendarGrid, monthTitle);
            } else {
                console.error("Failed to fetch attendance records:", res.msg);
                showNotification(t("ERROR_FETCH_RECORDS"), "error");
            }
        });
    }
}

// 新增一個獨立的渲染函式，以便從快取或 API 回應中調用
function renderCalendarWithData(year, month, today, records, calendarGrid, monthTitle) {
    // 確保日曆網格在每次渲染前被清空
    calendarGrid.innerHTML = '';
    monthTitle.textContent = `${year} 年 ${month + 1} 月`;
    
    // 取得該月第一天是星期幾
    const firstDayOfMonth = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    
    // 填補月初的空白格子
    for (let i = 0; i < firstDayOfMonth; i++) {
        const emptyCell = document.createElement('div');
        emptyCell.className = 'day-cell';
        calendarGrid.appendChild(emptyCell);
    }
    
    // 根據資料渲染每一天的顏色
    for (let i = 1; i <= daysInMonth; i++) {
        const dayCell = document.createElement('div');
        const cellDate = new Date(year, month, i);
        dayCell.textContent = i;
        let dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
        let dateClass = 'normal-day';
        
        const todayRecords = records.filter(r => r.date === dateKey);
        
        if (todayRecords.length > 0) {
            const reason = todayRecords[0].reason;
            switch (reason) {
                case "未打上班卡":
                    dateClass = 'abnormal-day';
                    break;
                case "未打下班卡":
                    dateClass = 'abnormal-day';
                    break;
                case "休假":
                    dateClass = 'day-off';
                    break;
                case "補卡(審核中)":
                    dateClass = 'pending-virtual';
                    break;
                case "補卡通過":
                    dateClass = 'approved-virtual';
                    break;
                default:
                    if (reason && reason !== "") {
                        dateClass = 'pending-adjustment'; // 假設所有有備註的都算 pending
                    }
                    break;
            }
        }
        
        const isToday = (year === today.getFullYear() && month === today.getMonth() && i === today.getDate());
        if (isToday) {
            dayCell.classList.add('today');
        } else if (cellDate > today) {
            dayCell.classList.add('future-day');
            dayCell.style.pointerEvents = 'none'; // 未來日期不可點擊
        } else {
            dayCell.classList.add(dateClass);
        }
        
        dayCell.classList.add('day-cell');
        dayCell.dataset.date = dateKey;
        dayCell.dataset.records = JSON.stringify(todayRecords); // 儲存當天資料
        calendarGrid.appendChild(dayCell);
    }
}

// 新增：渲染每日紀錄的函式 (修正非同步問題)
function renderDailyRecords(dateKey) {
    const dailyRecordsCard = document.getElementById('daily-records-card');
    const dailyRecordsTitle = document.getElementById('daily-records-title');
    const dailyRecordsList = document.getElementById('daily-records-list');
    const dailyRecordsEmpty = document.getElementById('daily-records-empty');
    const recordsLoading = document.getElementById("records-loading");
    
    dailyRecordsTitle.textContent = `${dateKey} 打卡紀錄`;
    dailyRecordsList.innerHTML = '';
    dailyRecordsEmpty.style.display = 'none';
    recordsLoading.style.display = 'block';
    
    const dateObject = new Date(dateKey);
    const month = dateObject.getFullYear() + "-" + String(dateObject.getMonth() + 1).padStart(2, "0");
    const userId = localStorage.getItem("sessionUserId");
    
    // 檢查快取
    if (monthDataCache[month]) {
        renderRecords(monthDataCache[month]);
        recordsLoading.style.display = 'none';
    } else {
        // 否則從 API 取得資料
        callApi(`getAttendanceDetails&month=${month}&userId=${userId}`, (res) => {
            recordsLoading.style.display = 'none';
            if (res.ok) {
                // 將資料存入快取
                monthDataCache[month] = res.records;
                renderRecords(res.records);
            } else {
                console.error("Failed to fetch attendance records:", res.msg);
                showNotification(t("ERROR_FETCH_RECORDS"), "error");
            }
        });
    }
    
    function renderRecords(records) {
        // 從該月份的所有紀錄中，過濾出所選日期的紀錄
        const dailyRecords = records.filter(record =>{
            
            return record.date === dateKey
        });
        if (dailyRecords.length > 0) {
            dailyRecordsEmpty.style.display = 'none';
            dailyRecords.forEach(records => {
                const li = document.createElement('li');
                li.className = 'p-3 bg-gray-50 rounded-lg';
                const recordHtml = records.record.map(r => `
                  <p class="font-medium text-gray-800">${r.time} - ${r.type}</p>
                  <p class="text-sm text-gray-500">${r.location}</p>
                  <p class="text-sm text-gray-500">備註：${r.note}</p>
                `).join("");
                
                li.innerHTML = `
                  ${recordHtml}
                  <p class="text-sm text-gray-500">系統判斷：${records.reason}</p>
                `;
                dailyRecordsList.appendChild(li);
            });
        } else {
            dailyRecordsEmpty.style.display = 'block';
        }
        dailyRecordsCard.style.display = 'block';
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    const loginBtn = document.getElementById('login-btn');
    const logoutBtn = document.getElementById('logout-btn');
    const punchInBtn = document.getElementById('punch-in-btn');
    const punchOutBtn = document.getElementById('punch-out-btn');
    const tabDashboardBtn = document.getElementById('tab-dashboard-btn');
    const tabMonthlyBtn = document.getElementById('tab-monthly-btn');
    const tabLocationBtn = document.getElementById('tab-location-btn');
    const abnormalList = document.getElementById('abnormal-list');
    const adjustmentFormContainer = document.getElementById('adjustment-form-container');
    const calendarGrid = document.getElementById('calendar-grid');
    
    // UI切換邏輯
    const switchTab = (tabId) => {
        const tabs = ['dashboard-view', 'monthly-view', 'location-view'];
        const btns = ['tab-dashboard-btn', 'tab-monthly-btn', 'tab-location-btn'];
        
        tabs.forEach(id => document.getElementById(id).style.display = 'none');
        btns.forEach(id => document.getElementById(id).classList.replace('bg-indigo-600', 'bg-gray-200'));
        btns.forEach(id => document.getElementById(id).classList.replace('text-white', 'text-gray-600'));
        
        document.getElementById(tabId).style.display = 'block';
        document.getElementById(`tab-${tabId.replace('-view', '-btn')}`).classList.replace('bg-gray-200', 'bg-indigo-600');
        document.getElementById(`tab-${tabId.replace('-view', '-btn')}`).classList.replace('text-gray-600', 'text-white');
        
        // 如果切換到月份檢視，渲染日曆
        if (tabId === 'monthly-view') {
            renderCalendar(currentMonthDate);
        }
    };
    
    // 語系初始化
    const browserLang = navigator.language || navigator.userLanguage;
    if (browserLang.startsWith("zh")) {
        currentLang = "zh-TW";
    } else if (browserLang.startsWith("ja")) {
        currentLang = "ja-JP";
    } else if (browserLang.startsWith("vi")) {
        currentLang = "vi";
    } else if (browserLang.startsWith("id")) {
        currentLang = "id";
    } else {
        currentLang = "en-US";
    }
    localStorage.setItem("lang", currentLang);
    await loadTranslations(currentLang);
    
    // 初始文字設定
    document.getElementById("appTitle").textContent = t("APP_TITLE");
    document.getElementById("status").textContent = t("SUBTITLE_LOGIN");
    
    const params = new URLSearchParams(window.location.search);
    const otoken = params.get('code');
    
    if (otoken) {
        exchangeToken("getProfile", otoken, (res) => {
            if (res.ok && res.sToken) {
                localStorage.setItem("sessionToken", res.sToken);
                history.replaceState({}, '', window.location.pathname);
                ensureLogin();
            } else {
                showNotification(t("ERROR_LOGIN_FAILED", { msg: res.msg || t("UNKNOWN_ERROR") }), "error");
                loginBtn.style.display = 'block';
            }
        });
    } else {
        ensureLogin();
    }
    
    // 綁定按鈕事件
    loginBtn.onclick = () => {
        callApi("getLoginUrl", (res) => {
            if (res.url) window.location.href = res.url;
        });
    };
    
    logoutBtn.onclick = () => {
        localStorage.removeItem("sessionToken");
        window.location.href = "/Attendance-System"
    };
    
    /* ===== 打卡功能 ===== */
    function punchButtonState(buttonId, state) {
        const button = document.getElementById(buttonId);
        if (!button) return;
        
        if (state === 'processing') {
            button.disabled = true;
            button.textContent = '處理中...';
        } else {
            button.disabled = false;
            if (buttonId === 'punch-in-btn') {
                button.textContent = t('上班打卡');
            } else if (buttonId === 'punch-out-btn') {
                button.textContent = t('下班打卡');
            }
        }
    }
    
    function doPunch(type) {
        
        const punchButtonId = type === '上班' ? 'punch-in-btn' : 'punch-out-btn';
        punchButtonState(punchButtonId, 'processing');
        
        if (!navigator.geolocation) {
            showNotification(t("ERROR_GEOLOCATION", { msg: "您的瀏覽器不支援地理位置功能。" }), "error");
            punchButtonState(punchButtonId, 'complete');
            return;
        }
        
        navigator.geolocation.getCurrentPosition((pos) => {
            const lat = pos.coords.latitude;
            const lng = pos.coords.longitude;
            const action = `punch&type=${encodeURIComponent(type)}&lat=${lat}&lng=${lng}&note=${encodeURIComponent(navigator.userAgent)}`;
            callApi(action, (res) => {
                const msg = t(res.code || "UNKNOWN_ERROR", res.params || {});
                showNotification(msg, res.ok ? "success" : "error");
                punchButtonState(punchButtonId, 'complete');
            });
        }, (err) => {
            showNotification(t("ERROR_GEOLOCATION", { msg: err.message }), "error");
        });
    }
    
    punchInBtn.addEventListener('click', () => doPunch("上班"));
    punchOutBtn.addEventListener('click', () => doPunch("下班"));
    
    // 處理補打卡表單
    abnormalList.addEventListener('click', (e) => {
        if (e.target.classList.contains('adjust-btn')) {
            const date = e.target.dataset.date;
            const reason = e.target.dataset.reason;
            const formHtml = `
                <div class="p-4 border-t border-gray-200 fade-in">
                    <p class="font-semibold mb-2">補打卡：<span class="text-indigo-600">${date}</span></p>
                    <div class="form-group mb-3">
                        <label for="adjustDateTime" class="block text-sm font-medium text-gray-700 mb-1">選擇日期與時間：</label>
                        <input id="adjustDateTime" type="datetime-local" class="w-full p-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500">
                    </div>
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <button data-type="in" class="submit-adjust-btn w-full py-2 px-4 rounded-lg font-bold btn-secondary">補上班卡</button>
                        <button data-type="out" class="submit-adjust-btn w-full py-2 px-4 rounded-lg font-bold btn-secondary">補下班卡</button>
                    </div>
                </div>
            `;
            adjustmentFormContainer.innerHTML = formHtml;
            
            const adjustDateTimeInput = document.getElementById("adjustDateTime");
            let defaultTime = "09:00"; // 預設為上班時間
            if (reason.includes("下班")) {
                defaultTime = "18:00";
            }
            adjustDateTimeInput.value = `${date}T${defaultTime}`;
        }
    });
    
    function validateAdjustTime(value) {
        const selected = new Date(value);
        const now = new Date();
        const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        
        if (selected < monthStart) {
            showNotification(t("ERR_BEFORE_MONTH_START"), "error");
            return false;
        }
        if (selected > yesterday) {
            showNotification(t("ERR_AFTER_YESTERDAY"), "error");
            return false;
        }
        return true;
    }
    
    adjustmentFormContainer.addEventListener('click', (e) => {
        if (e.target.classList.contains('submit-adjust-btn')) {
            const datetime = document.getElementById("adjustDateTime").value;
            const type = e.target.dataset.type;
            if (!datetime) {
                showNotification("請選擇補打卡日期時間", "error");
                return;
            }
            if (!validateAdjustTime(datetime)) return;
            
            callApiAdjustPunch(type === 'in' ? "上班" : "下班", datetime, (res) => {
                const msg = t(res.code || "UNKNOWN_ERROR", res.params || {});
                showNotification(msg, res.ok ? "success" : "error");
                if (res.ok) {
                    adjustmentFormContainer.innerHTML = '';
                    checkAbnormal(); // 補打卡成功後，重新檢查異常紀錄
                }
            });
        }
    });
    
    // 頁面切換事件
    tabDashboardBtn.addEventListener('click', () => switchTab('dashboard-view'));
    
    tabLocationBtn.addEventListener('click', () => switchTab('location-view'));
    tabMonthlyBtn.addEventListener('click', () => switchTab('monthly-view'));
    // 月曆按鈕事件
    document.getElementById('prev-month').addEventListener('click', () => {
        currentMonthDate.setMonth(currentMonthDate.getMonth() - 1);
        renderCalendar(currentMonthDate);
    });
    
    document.getElementById('next-month').addEventListener('click', () => {
        currentMonthDate.setMonth(currentMonthDate.getMonth() + 1);
        renderCalendar(currentMonthDate);
    });
    
    // 點擊日曆日期的事件監聽器
    calendarGrid.addEventListener('click', (e) => {
        if (e.target.classList.contains('day-cell') && e.target.dataset.date) {
            const date = e.target.dataset.date;
            renderDailyRecords(date);
        }
    });
});
