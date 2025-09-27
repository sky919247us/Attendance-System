// Constants.gs

const LINE_CHANNEL_ID     = PropertiesService.getScriptProperties().getProperty("LINE_CHANNEL_ID");
const LINE_CHANNEL_SECRET = PropertiesService.getScriptProperties().getProperty("LINE_CHANNEL_SECRET");
// 新增你的前端回呼網址
const LINE_REDIRECT_URL   = "https://0rigind1865-bit.github.io/Attendance-System/";

const SHEET_EMPLOYEES = '員工名單';
const SHEET_ATTENDANCE = '打卡紀錄';
const SHEET_SESSION    = 'Session';
const SHEET_LOCATIONS  = '打卡地點表';

const SESSION_TTL_MS = 1000 * 60 * 60 * 24;
const TOKEN_LENGTH   = 36;
