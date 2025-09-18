let currentLang = localStorage.getItem("lang");
console.log("現在語言:", currentLang);
if (true) {
  // 取瀏覽器語言，例如 zh-TW, en-US
  const browserLang = navigator.language || navigator.userLanguage;
  console.log("瀏覽器語言:", browserLang);
  // 簡單處理：只取前兩碼 (zh, en, ja...)
  if (browserLang.startsWith("zh")) {
    console.log("瀏覽器語言:", currentLang);
    currentLang = "zh-TW";
  } else if (browserLang.startsWith("ja")) {
    currentLang = "ja-JP";
  }
  else if (browserLang.startsWith("vi")) {
    currentLang = "vi";
  }
  else if (browserLang.startsWith("id")) {
    currentLang = "id";
  }
  else {
    currentLang = "en-US"; // 預設英文
  }

  // 記錄下來，之後就用 localStorage 優先
  localStorage.setItem("lang", currentLang);
}
   
let translations = {};
console.log("初始語言:", currentLang);

// 載入語系檔
async function loadTranslations(lang) {
  console.log("開始載入語系:", lang);
  try {
    const res = await fetch(`i18n/${lang}.json`);
    if (!res.ok) {
      throw new Error(`HTTP 錯誤: ${res.status}`);
    }
    translations = await res.json();
    currentLang = lang;
    localStorage.setItem("lang", lang);
    console.log("語系載入成功:", translations);
  } catch (err) {
    console.error("載入語系失敗:", err);
  }
}

// 翻譯函式

function t(code, params = {}) {
  let text = translations[code] || code;
  console.log(`翻譯查詢: code='${code}' → '${text}'`);
  for (const key in params) {
    console.log(`參數: params='${params}'`);
    text = text.replace(`{${key}}`, params[key]);
  }
  return text;
}
const API_URL = API_CONFIG.apiUrl;
/* ===== 共用訊息顯示 ===== */
function showMessage(text, type="ok", msgId="message") {
  const el = document.getElementById(msgId);
  if (!text) {
    el.textContent = "";
    el.style.display = "none";
    return;
  }
  el.textContent = text;
  el.className = "msg " + type;
  el.style.display = "block";
}

/* ===== JSONP 呼叫 ===== */
function callApi(action, cb, loadingId="loading") {
  const token = localStorage.getItem("sessionToken");
  const url = `${API_URL}?action=${action}&token=${token}&callback=handleResponse`;
  //window.handleResponse = cb;
   
  // 顯示指定 loading
  document.getElementById(loadingId).style.display = "block";
   
  window.handleResponse = (res) => {
    // 統一翻譯
    console.log("API 回傳：", res);
    res.msg = t(res.code);
    // 關閉 loading
    document.getElementById(loadingId).style.display = "none";
    cb(res);
    // 清理 script，避免累積
    if (script.parentNode) {
      script.parentNode.removeChild(script);
    }
  };
   
  const script = document.createElement("script");
  script.src = url;
  script.onerror = () => showMessage("連線失敗","error");
  document.body.appendChild(script);
}

/* ===== 交換一次性 token ===== */
function exchangeToken(action, otoken, cb) {
  const url = `${API_URL}?action=${action}&otoken=${otoken}&callback=handleExchange`;
  window.handleExchange = cb;
  const script = document.createElement("script");
  script.src = url;
  script.onerror = () => showMessage("連線失敗","error");
  document.body.appendChild(script);
}
/* ===== 補打卡 ===== */
function callApiAdjustPunch(type, datetime, cb) {
  const token = localStorage.getItem("sessionToken");
  const dateObj = new Date(datetime);
  const lat = 0; // 補打卡不檢查 GPS
  const lng = 0;

  const url = `${API_URL}?action=adjustPunch&token=${token}&type=${encodeURIComponent(type)}&lat=${lat}&lng=${lng}&datetime=${dateObj.toISOString()}&callback=handleAdjustResponse&note=${encodeURIComponent(navigator.userAgent)}`;
  document.getElementById("loadingMsg").style.display = "block";
   
  window.handleAdjustResponse = (res) => {
    // 關閉 loading
    document.getElementById("loadingMsg").style.display = "none";
    cb(res);
  };

  const script = document.createElement("script");
  script.src = url;
  script.onerror = () => showMessage("連線失敗", "error", "adjustMessage");
  document.body.appendChild(script);
}
function ensureLogin() {
  return new Promise((resolve) => {
    callApi("checkSession", (res) => {
      if (res.ok) {
        const Msg = t(res.code,res.params || "UNKNOWN_ERROR");
        document.getElementById("userName").textContent = Msg;
        localStorage.setItem("sessionUserId", res.user.userId);
        let img = document.getElementById("profileImg");
        img.src = res.user.picture || res.user.rate;
        img.style.display = "inline-block";
        document.getElementById("actions").style.display = "block";

        // 檢查異常打卡
        checkAbnormal();
        resolve(true);

      } else {
        // ✅ 使用代碼翻譯
        const errorMsg = t(res.code || "UNKNOWN_ERROR");

        if (res.code === "ACCOUNT_NOT_ENABLED") {
          document.getElementById("status").textContent = errorMsg;
          showMessage("❌ " + errorMsg, "error");
        } else {
          document.getElementById("status").textContent = t("PLEASE_RELOGIN");
          document.getElementById("login").style.display = "block";
          document.getElementById("btnLogin").textContent = t("BTN_RELOGIN");
          showMessage("❌ " + errorMsg, "error");
        }
        resolve(false);
      }
    });
  });
}

window.addEventListener("DOMContentLoaded", () => {
  const input = document.getElementById("adjustDateTime");
  const now = new Date();

  const toLocal = (d) => {
    const pad = (n) => n.toString().padStart(2,'0');
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  // max = 昨天
  let yesterday = new Date();
  console.log(yesterday.getDate());
  yesterday.setDate(yesterday.getDate() - 1);
  input.max = toLocal(yesterday);
  console.log(yesterday.getDate());

  // min = 前一個月第一天 00:00
  const monthStart = new Date(now.getFullYear(), now.getMonth()-1, 1, 0, 0);
  input.min = toLocal(monthStart);

  // 如果 input.value 不存在 或 超過 max，就把 value 設成 max（昨天）
  if (!input.value || new Date(input.value) > new Date(input.max)) {
    input.value = input.max;
  }
});
/* ===== 登入流程 ===== */
window.addEventListener('DOMContentLoaded', async () => {
  console.log("初始化語系…");
  await loadTranslations(currentLang); // 先載入語系
   
  // 自動替換文字
  document.getElementById("appTitle").textContent = t("APP_TITLE");
  document.getElementById("userName").textContent = t("CHECKING_LOGIN");
  document.getElementById("footerNotice").textContent = t("FOOTER_NOTICE");
   
   
  document.getElementById("adjustPunchTitle").textContent = t("ADJUST_PUNCH_TITLE");
  document.getElementById("adjustPunchDateTimeLabel").textContent = t("ADJUST_PUNCH_DATETIME_LABEL");
  // 初始化按鈕文字
  document.getElementById("btnLogin").textContent = t("BTN_RELOGIN");
  document.getElementById("btnIn").textContent = t("BTN_PUNCH_IN");
  document.getElementById("btnOut").textContent = t("BTN_PUNCH_OUT");
  document.getElementById("btnLogout").textContent = t("BTN_LOGOUT");
  document.getElementById("btnAdjustIn").textContent = t("BTN_ADJUST_IN");
  document.getElementById("btnAdjustOut").textContent = t("BTN_ADJUST_OUT");
  document.getElementById("btnViewAbnormal").textContent = t("BTN_VIEW_ABNORMAL");
  document.getElementById("loading").textContent = t("LOADING");
  document.getElementById("loadingMsg").textContent = t("LOADING");
   
  const params = new URLSearchParams(window.top.location.search);
  const otoken = params.get('code');

  if (otoken) {
    // 剛登入完，交換 token
    exchangeToken("getProfile", otoken, (res) => {
      if (res.ok && res.sToken) {
        localStorage.setItem("sessionToken", res.sToken);
        
        
        showMessage(t("LOGIN_SUCCESS"));

        ensureLogin();
      } else {
        showMessage(t("ERROR_LOGIN_FAILED", {msg: res.msg || t("UNKNOWN_ERROR")}), "error");

        const container = document.getElementById("login");
        container.style.display = "block";
        container.innerHTML = ""; // 清空原本內容

        const btn = document.createElement("button");
        btn.id = "btnRelogin";
        btn.textContent = t("BTN_RELOGIN");
        btn.className = "primary";
        btn.onclick = () => { window.location.href = API_CONFIG.redirectUrl; };

        container.appendChild(btn);
      }
    });
  } else {
    // 沒有 otoken → 檢查登入狀態
    ensureLogin();
  }

  /* ===== 綁定按鈕 ===== */
  document.getElementById("btnLogin").onclick = () => {
    callApi("getLoginUrl", (res) => {
      if (res.url) window.location.href = res.url;
    });
  };

  document.getElementById("btnLogout").onclick = () => {
    localStorage.removeItem("sessionToken");
    //location.reload();
    window.location.href = "/index.html"
  };

  function doPunch(type, cb) {
    navigator.geolocation.getCurrentPosition((pos) => {
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      const action = `punch&type=${encodeURIComponent(type)}&lat=${lat}&lng=${lng}&note=${encodeURIComponent(navigator.userAgent)}`;
      callApi(action, (res) => { if (cb) cb(res, lat, lng); });
    }, (err) => {
      showMessage(t("ERROR_GEOLOCATION", {msg: err.message}), "error");
    });
  }


  document.getElementById("btnIn").onclick = () => {
    showMessage("");
    doPunch("上班", (res, lat, lng) => {
      // 取得訊息文字，若 res.code 或 translations 缺失，給預設訊息
      const msg = t(res.code || "UNKNOWN_ERROR", res.params || {});

      // 顯示訊息，根據 ok 狀態決定樣式
      showMessage(msg, res.ok ? "ok" : "error");
    });
  };

  document.getElementById("btnOut").onclick = () => {
    showMessage(""); // 先清空訊息

    doPunch("下班", (res, lat, lng) => {
      // 取得訊息文字，若 res.code 或 translations 缺失，給預設訊息
      const msg = t(res.code || "UNKNOWN_ERROR", res.params || {});

      // 顯示訊息，根據 ok 狀態決定樣式
      showMessage(msg, res.ok ? "ok" : "error");
    });
  };
});
function validateAdjustTime() {
  const input = document.getElementById("adjustDateTime");
  const value = input.value;
  if (!value) return false;

  const selected = new Date(value);
  const now = new Date();
  let yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  if (selected < monthStart) {
    alert(t("ERR_BEFORE_MONTH_START"));
    return false;
  }
  if (selected > yesterday) {
    alert(t("ERR_AFTER_YESTERDAY"));
    return false;
  }
  return true;
}
// 綁定補打卡按鈕
document.getElementById("btnAdjustIn").onclick = () => {
    if (!validateAdjustTime()) return;
  const datetime = document.getElementById("adjustDateTime").value;
  if (!datetime) return showMessage("請選擇補打卡日期時間", "error", "adjustMessage");
  showMessage("", "ok", "adjustMessage");
  callApiAdjustPunch("上班", datetime, (res) => {
    // 取得訊息文字，若 res.code 或 translations 缺失，給預設訊息
    const msg = t(res.code || "UNKNOWN_ERROR", res.params || {});

    // 顯示訊息，根據 ok 狀態決定樣式
    showMessage(msg, res.ok ? "ok" : "error","adjustMessage");
  });
};

document.getElementById("btnAdjustOut").onclick = () => {
    if (!validateAdjustTime()) return;
  const datetime = document.getElementById("adjustDateTime").value;
  if (!datetime) return showMessage("請選擇補打卡日期時間", "error", "adjustMessage");
  showMessage("", "ok", "adjustMessage");
  callApiAdjustPunch("下班", datetime, (res) => {
    // 取得訊息文字，若 res.code 或 translations 缺失，給預設訊息
    const msg = t(res.code || "UNKNOWN_ERROR", res.params || {});

    // 顯示訊息，根據 ok 狀態決定樣式
    showMessage(msg, res.ok ? "ok" : "error","adjustMessage");
  });
};

//檢查本月打卡異常
function checkAbnormal() {
  const now = new Date();
  const month = now.getFullYear() + "-" + String(now.getMonth()+1).padStart(2,"0");
  const userId = localStorage.getItem("sessionUserId");

  document.getElementById("loadingMsg").style.display = "block";
  callApi(`getAbnormalRecords&month=${month}&userId=${userId}`, (res) => {
    if (res.ok) {
      const hasAbnormal = res.records.some(r => r.abnormal);
      const btn = document.getElementById("btnViewAbnormal");
      const di = document.getElementById("adjustPunchCard");
      
      if (hasAbnormal) {
        di.style.display = "block";
        btn.onclick = () => {
          window.location.href = `punchCalendar.html?type=abnormal&month=${month}&userId=${userId}`;
        };
      } else {
        btn.style.display = "none";
      }
    }
  }, "loadingMsg");
}
