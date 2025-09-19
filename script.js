// 使用 CDN 或絕對路徑來載入 JSON 檔案


let currentLang = localStorage.getItem("lang");
let translations = {};

// 載入語系檔
async function loadTranslations(lang) {
    try {
        const res = await fetch(`i18n/${lang}.json`);
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
    if(loadingEl) loadingEl.style.display = "block";
    
    window.handleResponse = (res) => {
        res.msg = t(res.code);
        if(loadingEl) loadingEl.style.display = "none";
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
    if(loadingEl) loadingEl.style.display = "block";

    window.handleAdjustResponse = (res) => {
        if(loadingEl) loadingEl.style.display = "none";
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

function ensureLogin() {
    return new Promise((resolve) => {
        if (localStorage.getItem("sessionToken")) {
            callApi("checkSession", (res) => {
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
                    document.getElementById('login-btn').style.display = 'block';
                    document.getElementById('user-header').style.display = 'none';
                    document.getElementById('main-app').style.display = 'none';
                    resolve(false);
                }
            });
        }
        else {
            document.getElementById('login-btn').style.display = 'block';
            document.getElementById('user-header').style.display = 'none';
            document.getElementById('main-app').style.display = 'none';
            resolve(false);
        }
    });
}

//檢查本月打卡異常
function checkAbnormal() {
    const now = new Date();
    const month = now.getFullYear() + "-" + String(now.getMonth()+1).padStart(2,"0");
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
                        <button data-date="${record.date}" class="adjust-btn text-sm font-semibold text-indigo-600 hover:text-indigo-800">補打卡</button>
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
    document.getElementById("status").textContent = t("CHECKING_LOGIN");

    const params = new URLSearchParams(window.location.search);
    const otoken = params.get('code');
    
    if (otoken) {
        exchangeToken("getProfile", otoken, (res) => {
            if (res.ok && res.sToken) {
                localStorage.setItem("sessionToken", res.sToken);
                // 成功登入後，移除網址中的 'code' 參數以避免重新整理錯誤
                history.replaceState({}, '', window.location.pathname);
                ensureLogin();
            } else {
                showNotification(t("ERROR_LOGIN_FAILED", {msg: res.msg || t("UNKNOWN_ERROR")}), "error");
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

    function doPunch(type) {
        if (!navigator.geolocation) {
            showNotification(t("ERROR_GEOLOCATION", {msg: "您的瀏覽器不支援地理位置功能。"}), "error");
            return;
        }
        
        navigator.geolocation.getCurrentPosition((pos) => {
            const lat = pos.coords.latitude;
            const lng = pos.coords.longitude;
            const action = `punch&type=${encodeURIComponent(type)}&lat=${lat}&lng=${lng}&note=${encodeURIComponent(navigator.userAgent)}`;
            callApi(action, (res) => {
                const msg = t(res.code || "UNKNOWN_ERROR", res.params || {});
                showNotification(msg, res.ok ? "success" : "error");
            });
        }, (err) => {
            showNotification(t("ERROR_GEOLOCATION", {msg: err.message}), "error");
        });
    }

    punchInBtn.addEventListener('click', () => doPunch("上班"));
    punchOutBtn.addEventListener('click', () => doPunch("下班"));

    // 處理補打卡表單
    abnormalList.addEventListener('click', (e) => {
        if (e.target.classList.contains('adjust-btn')) {
            const date = e.target.dataset.date;
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
        }
    });

    function validateAdjustTime(value) {
        const selected = new Date(value);
        const now = new Date();
        let yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
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
                }
            });
        }
    });
    
    // 頁面切換事件
    tabDashboardBtn.addEventListener('click', () => switchTab('dashboard-view'));
    tabMonthlyBtn.addEventListener('click', () => switchTab('monthly-view'));
    tabLocationBtn.addEventListener('click', () => switchTab('location-view'));
});
