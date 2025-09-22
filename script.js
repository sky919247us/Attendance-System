// 使用 CDN 或絕對路徑來載入 JSON 檔案
// 注意：本檔案需要依賴 config.js，請確保它在腳本之前被載入。

let currentLang = localStorage.getItem("lang");
let currentMonthDate = new Date();
let translations = {};
let monthDataCache = {}; // 新增：用於快取月份打卡資料
let isApiCalled = false; // 新增：用於追蹤 API 呼叫狀態，避免重複呼叫


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
    script.src = url;
    document.body.appendChild(script);

    // 等待 API 回應，並在回應後移除 script 標籤
    window.handleResponse = (res) => {
        cb(res);
        document.body.removeChild(script);
        delete window.handleResponse;
    };
}

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
    const punchButtonId = type === 'in' ? 'punch-in-btn' : 'punch-out-btn';
    punchButtonState(punchButtonId, 'processing');

    if (!navigator.geolocation) {
        showNotification(t("GPS_NOT_SUPPORTED"), "error");
        punchButtonState(punchButtonId, 'complete');
        return;
    }

    navigator.geolocation.getCurrentPosition(
        (position) => {
            const params = {
                type: type,
                latitude: position.coords.latitude,
                longitude: position.coords.longitude,
                userAgent: navigator.userAgent
            };
            callApi("doPunch", (res) => {
                const msg = t(res.code || "UNKNOWN_ERROR", res.params || {});
                showNotification(msg, res.ok ? "success" : "error");
                punchButtonState(punchButtonId, 'complete');
                if (res.ok) {
                    checkAbnormal();
                }
            }, punchButtonId);
        },
        (error) => {
            let errorMsg = "UNKNOWN_ERROR";
            switch (error.code) {
                case error.PERMISSION_DENIED:
                    errorMsg = "GPS_PERMISSION_DENIED";
                    break;
                case error.POSITION_UNAVAILABLE:
                    errorMsg = "GPS_UNAVAILABLE";
                    break;
                case error.TIMEOUT:
                    errorMsg = "GPS_TIMEOUT";
                    break;
                case error.UNKNOWN_ERROR:
                    errorMsg = "UNKNOWN_ERROR";
                    break;
            }
            showNotification(t(errorMsg), "error");
            punchButtonState(punchButtonId, 'complete');
        }, {
            enableHighAccuracy: true,
            timeout: 5000,
            maximumAge: 0
        }
    );
}

/* ===== 通知功能 ===== */
function showNotification(message, type) {
    const notification = document.getElementById("notification");
    const notificationMessage = document.getElementById("notification-message");
    notificationMessage.textContent = message;
    notification.classList.remove("success", "error");
    notification.classList.add(type);
    notification.classList.add("show");
    setTimeout(() => {
        notification.classList.remove("show");
    }, 3000);
}

/* ===== 登入與身份驗證 ===== */
function ensureLogin() {
    showLoading();
    const token = localStorage.getItem("sessionToken");
    if (token) {
        callApi("checkSession", (res) => {
            if (res.ok) {
                updateUserUI(res.user);
            } else {
                localStorage.removeItem("sessionToken");
                showLoginView();
            }
            hideLoading();
        });
    } else {
        const otoken = new URLSearchParams(window.location.search).get("otoken");
        if (otoken) {
            exchangeToken(otoken);
        } else {
            showLoginView();
            hideLoading();
        }
    }
}

function exchangeToken(otoken) {
    showLoading();
    callApi("getProfile", (res) => {
        if (res.ok) {
            localStorage.setItem("sessionToken", res.token);
            updateUserUI(res.user);
        } else {
            showNotification(t("LOGIN_FAILED"), "error");
            showLoginView();
        }
        hideLoading();
    }, `getProfile&otoken=${otoken}&redirectUrl=${encodeURIComponent(API_CONFIG.redirectUrl)}`);
}

function showLoginView() {
    document.getElementById("login-view").style.display = "block";
    document.getElementById("app-content").style.display = "none";
    document.getElementById("loading").style.display = "none";
}

function showAppContent() {
    document.getElementById("login-view").style.display = "none";
    document.getElementById("app-content").style.display = "block";
    document.getElementById("loading").style.display = "none";
}

function showLoading() {
    document.getElementById("loading").style.display = "block";
}

function hideLoading() {
    document.getElementById("loading").style.display = "none";
}

function updateUserUI(user) {
    showAppContent();
    document.getElementById("user-name").textContent = user.displayName;
    document.getElementById("profile-img").src = user.pictureUrl;
    document.getElementById("profile-img").alt = user.displayName;
    document.getElementById("user-header").style.display = "flex";
    if (user.isAdmin) {
        document.getElementById("admin-tab").style.display = "block";
        document.getElementById("user-tabs").classList.add('grid-cols-4');
    }
    checkAbnormal();
}

/* ===== 異常紀錄 ===== */
function checkAbnormal() {
    callApi("checkAbnormal", (res) => {
        if (res.ok && res.data.length > 0) {
            const abnormalRecordsList = document.getElementById("abnormal-records-list");
            abnormalRecordsList.innerHTML = '';
            document.getElementById("abnormal-records-container").style.display = 'block';

            res.data.forEach(record => {
                const li = document.createElement("li");
                li.className = 'flex justify-between items-center bg-yellow-50 p-3 rounded-lg';
                li.innerHTML = `
                    <p class="text-sm text-yellow-800">
                        ${record.date} - ${t(record.type === 'in' ? '上班缺卡' : '下班缺卡')}
                    </p>
                    <button class="btn-warning btn-sm" data-date="${record.date}" data-type="${record.type}">補打卡</button>
                `;
                abnormalRecordsList.appendChild(li);
            });
        } else {
            document.getElementById("abnormal-records-container").style.display = 'none';
        }
    });
}

function callApiAdjustPunch(type, datetime, cb) {
    const token = localStorage.getItem("sessionToken");
    const url = `${API_CONFIG.apiUrl}?action=adjustPunch&token=${token}&type=${type}&datetime=${encodeURIComponent(datetime)}&callback=handleResponse`;
    const script = document.createElement("script");
    script.src = url;
    document.body.appendChild(script);

    window.handleResponse = (res) => {
        cb(res);
        document.body.removeChild(script);
        delete window.handleResponse;
    };
}

document.getElementById('abnormal-records-list').addEventListener('click', (e) => {
    if (e.target.tagName === 'BUTTON' && e.target.textContent === '補打卡') {
        const date = e.target.dataset.date;
        const type = e.target.dataset.type;
        const adjustmentFormContainer = document.getElementById("adjustment-form-container");
        adjustmentFormContainer.innerHTML = `
            <div class="card p-4 space-y-4">
                <h3 class="font-semibold text-gray-800">補打卡申請 - ${t(type === 'in' ? '上班' : '下班')}</h3>
                <input type="datetime-local" id="adjustment-datetime" class="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500">
                <div class="flex justify-end space-x-2">
                    <button id="cancel-adjustment" class="btn-secondary">取消</button>
                    <button id="submit-adjustment" class="btn-primary" data-type="${type}">送出</button>
                </div>
            </div>
        `;
        document.getElementById('cancel-adjustment').addEventListener('click', () => {
            adjustmentFormContainer.innerHTML = '';
        });
        document.getElementById('submit-adjustment').addEventListener('click', () => {
            const datetimeInput = document.getElementById('adjustment-datetime');
            const datetime = datetimeInput.value;
            if (!datetime) {
                showNotification("請選擇補打卡日期時間", "error");
                return;
            }
            if (!validateAdjustTime(datetime)) return;
            callApiAdjustPunch(type, datetime, (res) => {
                const msg = t(res.code || "UNKNOWN_ERROR", res.params || {});
                showNotification(msg, res.ok ? "success" : "error");
                if (res.ok) {
                    adjustmentFormContainer.innerHTML = '';
                    checkAbnormal();
                }
            });
        });
    }
});


function validateAdjustTime(datetime) {
    const selectedDate = new Date(datetime);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // 檢查日期是否在當月
    if (selectedDate.getMonth() !== currentMonthDate.getMonth()) {
        showNotification("補打卡日期必須在當月", "error");
        return false;
    }

    // 檢查日期是否晚於今天
    if (selectedDate.getTime() > today.getTime() + 86400000) {
        showNotification("補打卡日期不能晚於今天", "error");
        return false;
    }
    return true;
}

/* ===== 月份檢視與日曆 ===== */
function renderCalendar(date) {
    const year = date.getFullYear();
    const month = date.getMonth();
    document.getElementById("current-month-year").textContent = t("DATE_MONTH_YEAR", {
        month: month + 1,
        year: year
    });

    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const calendarGrid = document.getElementById("calendar-grid");
    calendarGrid.innerHTML = '';

    // 填補上個月的空白
    for (let i = 0; i < firstDay.getDay(); i++) {
        calendarGrid.appendChild(document.createElement("div"));
    }

    for (let day = 1; day <= lastDay.getDate(); day++) {
        const dayCell = document.createElement("div");
        dayCell.className = "day-cell";
        dayCell.textContent = day;
        dayCell.dataset.date = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        
        const cellDate = new Date(year, month, day);
        if (cellDate > today) {
            dayCell.classList.add('future-day');
        } else {
            dayCell.classList.add('normal-day');
        }
        
        calendarGrid.appendChild(dayCell);
    }
    
    // 渲染打卡紀錄
    renderDailyRecords(date);
}

function renderDailyRecords(date) {
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const cacheKey = `${year}-${month}`;

    if (monthDataCache[cacheKey]) {
        updateCalendarWithData(monthDataCache[cacheKey]);
    } else {
        callApi("getAttendanceDetails", (res) => {
            if (res.ok) {
                monthDataCache[cacheKey] = res.data;
                updateCalendarWithData(res.data);
            }
        }, `getAttendanceDetails&month=${cacheKey}`);
    }
}

function updateCalendarWithData(data) {
    const calendarGrid = document.getElementById("calendar-grid");
    const dayCells = calendarGrid.querySelectorAll('.day-cell');
    
    dayCells.forEach(cell => {
        const date = cell.dataset.date;
        const dayRecord = data.find(rec => rec.date === date);
        if (dayRecord) {
            const hasIn = dayRecord.inPunch;
            const hasOut = dayRecord.outPunch;

            if (dayRecord.status === '異常' || !hasIn || !hasOut) {
                cell.classList.remove('normal-day');
                cell.classList.add('abnormal-day');
            } else {
                cell.classList.remove('abnormal-day');
                cell.classList.add('normal-day');
            }

            if (dayRecord.adjustStatus === '待處理') {
                cell.classList.add('pending-adjustment');
            }
            if (dayRecord.adjustStatus === '已核准') {
                cell.classList.add('approved-adjustment');
            }
            if (dayRecord.virtualStatus === '待處理') {
                cell.classList.add('pending-virtual');
            }
            if (dayRecord.virtualStatus === '已核准') {
                cell.classList.add('approved-virtual');
            }
        }
    });
}

function getDailyRecord(date) {
    const dateStr = date.toISOString().split('T')[0];
    const cacheKey = `${date.getFullYear()}-${date.getMonth() + 1}`;
    const records = monthDataCache[cacheKey] || [];
    return records.find(record => record.date === dateStr);
}

// 處理月份切換
document.getElementById('prev-month').addEventListener('click', () => {
    currentMonthDate.setMonth(currentMonthDate.getMonth() - 1);
    renderCalendar(currentMonthDate);
});

document.getElementById('next-month').addEventListener('click', () => {
    currentMonthDate.setMonth(currentMonthDate.getMonth() + 1);
    renderCalendar(currentMonthDate);
});


/* ===== 初始化 ===== */
document.addEventListener("DOMContentLoaded", () => {
    // 頁面切換事件
    document.getElementById('tab-dashboard-btn').addEventListener('click', () => switchTab('dashboard-view'));
    document.getElementById('tab-monthly-btn').addEventListener('click', () => switchTab('monthly-view'));
    document.getElementById('tab-admin-btn').addEventListener('click', () => switchTab('admin-view'));
    document.getElementById('tab-location-btn').addEventListener('click', () => {
        switchTab('location-view');
        checkLocationPermission();
    });

    // 登出按鈕
    document.getElementById('logout-btn').addEventListener('click', () => {
        localStorage.removeItem("sessionToken");
        showLoginView();
    });

    // 登入按鈕
    document.getElementById('login-btn').addEventListener('click', () => {
        callApi("getLoginUrl", (res) => {
            if (res.ok) {
                window.location.href = res.url;
            } else {
                showNotification(t("LOGIN_FAILED"), "error");
            }
        });
    });

    // 打卡按鈕
    document.getElementById("punch-in-btn").addEventListener("click", () => doPunch("in"));
    document.getElementById("punch-out-btn").addEventListener("click", () => doPunch("out"));

    // 載入語系並檢查登入狀態
    loadTranslations(currentLang || "zh-TW").then(ensureLogin);
});

function switchTab(tabId) {
    const tabs = ['dashboard-view', 'monthly-view', 'admin-view', 'location-view'];
    tabs.forEach(id => {
        const tab = document.getElementById(id);
        if (tab) {
            tab.style.display = (id === tabId) ? 'block' : 'none';
        }
    });

    const tabButtons = document.querySelectorAll('.tab-btn');
    tabButtons.forEach(btn => btn.classList.remove('tab-btn-active'));
    document.getElementById(`tab-${tabId}-btn`).classList.add('tab-btn-active');
}

function checkLocationPermission() {
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            (position) => {
                document.getElementById('location-status').textContent = '已偵測';
                document.getElementById('location-status').classList.remove('text-red-500');
                document.getElementById('location-status').classList.add('text-green-500');
                document.getElementById('location-coords').textContent = `緯度: ${position.coords.latitude.toFixed(6)}, 經度: ${position.coords.longitude.toFixed(6)}`;
            },
            (error) => {
                let status = '未偵測';
                let errorMessage = '';
                switch(error.code) {
                    case error.PERMISSION_DENIED:
                        status = '權限被拒絕';
                        errorMessage = '請允許瀏覽器使用您的位置資訊來進行打卡。';
                        break;
                    case error.POSITION_UNAVAILABLE:
                        status = '位置不可用';
                        errorMessage = '您的位置資訊無法取得，請檢查您的 GPS 設定。';
                        break;
                    case error.TIMEOUT:
                        status = '超時';
                        errorMessage = '取得位置資訊超時，請稍後再試。';
                        break;
                    default:
                        status = '未知錯誤';
                        errorMessage = '取得位置資訊時發生未知錯誤。';
                }
                document.getElementById('location-status').textContent = status;
                document.getElementById('location-status').classList.remove('text-green-500');
                document.getElementById('location-status').classList.add('text-red-500');
                document.getElementById('location-coords').textContent = errorMessage;
                showNotification(t("LOCATION_PERMISSION_DENIED"), "error");
            }
        );
    } else {
        document.getElementById('location-status').textContent = '不支援';
        document.getElementById('location-status').classList.remove('text-green-500');
        document.getElementById('location-status').classList.add('text-red-500');
        document.getElementById('location-coords').textContent = '您的瀏覽器不支援地理位置功能，無法進行打卡。';
        showNotification(t("GPS_NOT_SUPPORTED"), "error");
    }
}
