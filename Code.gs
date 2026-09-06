/**
 * UDFondue - Google Apps Script Backend
 * รับข้อมูลจากหน้าเว็บ LIFF -> บันทึกรูปลง Google Drive -> บันทึกข้อมูลลง Google Sheets
 *
 * สำคัญ: หลังแก้โค้ดต้อง Deploy -> Manage deployments -> New version
 * การ Save อย่างเดียวไม่ทำให้ Web App URL ใช้โค้ดใหม่
 */

const API_VERSION = "v7-submit-notify";
const SHEET_HEADERS_CACHE_KEY = "sheet_headers_v6";
const SPREADSHEET_ID = "19pIiTGsPMHbyTxULJDtiPbavmkCS07FBH2E5iHcd1KE";
const SHEET_NAME = "UDFondue_Database";
const LOG_SHEET_NAME = "UDFondue_Log";
const FOLDER_ID = "1zP6mUhrI7q-Qf-bgA5c4HJwIYU6LnpyJ";
const LINE_ACCESS_TOKEN = "1zQJQDz1un38gxqKc4Y91joSXB6oItmlQY9yG8EduB65R73XcMkHDkJ5pwBEkykFwWWgaRn4nv2sZer6yQglHR6UuJ/LE7Mqe1LsvhmUfKK/ABHu50jIpz6t8FxDuXcwNUo9q+RmWoXoqKUB9yZSIgdB04t89/1O/w1cDnyilFU=";
const LIFF_TRACK_URL = "https://liff.line.me/2010319415-VtukiTkR";
const LIFF_REPORT_URL = "https://liff.line.me/2010319415-epnUUdNV";
const ADMIN_PASSWORD = "UDFondue123WoWoWo";
const ADMIN_TOKEN_TTL_SEC = 28800;
const DEFAULT_STATUS = "รับเรื่องแล้ว";
const TZ = "GMT+7";

const STATUS_OPTIONS = [
  "รับเรื่องแล้ว",
  "กำลังดำเนินการ",
  "รอข้อมูลเพิ่ม",
  "เสร็จสิ้น",
  "ปิดเรื่อง"
];

const COL = {
  DATE: 1,
  TIME: 2,
  LINE_ID: 3,
  NAME: 4,
  ROOM: 5,
  STUDENT_NO: 6,
  CATEGORY: 7,
  DETAIL: 8,
  IMAGE_COUNT: 9,
  IMAGE_URL: 10,
  SUBMIT_ID: 11,
  DEBUG: 12,
  STATUS: 13,
  ADMIN_NOTE: 14,
  STATUS_UPDATED: 15
};

const SHEET_HEADERS = [
  "วันที่",
  "เวลา",
  "LINE User ID",
  "ชื่อผู้แจ้ง",
  "ห้อง",
  "เลขที่",
  "ประเภทเรื่อง",
  "รายละเอียด",
  "จำนวนรูป",
  "ลิงก์รูปภาพ",
  "Submit ID",
  "Debug",
  "สถานะ",
  "หมายเหตุเจ้าหน้าที่",
  "อัปเดตสถานะล่าสุด"
];

function doPost(e) {
  const timestamp = new Date();
  const payloadSize = getPayloadSize_(e);

  try {
    const data = parsePayload_(e);
    const action = data.action || "legacy";

    if (action === "submit") {
      return handleSubmit_(data, timestamp, payloadSize);
    }
    if (action === "uploadImage") {
      return handleUploadImage_(data, timestamp, payloadSize);
    }
    if (action === "trackList") {
      return handleTrackList_(data);
    }
    if (action === "trackDetail") {
      return handleTrackDetail_(data);
    }
    if (action === "adminAuth") {
      return handleAdminAuth_(data);
    }
    if (action === "adminBootstrap") {
      return handleAdminBootstrap_(data);
    }
    if (action === "adminList") {
      return handleAdminList_(data);
    }
    if (action === "adminUpdate") {
      return handleAdminUpdate_(data, timestamp);
    }

    return handleLegacy_(data, timestamp, payloadSize);

  } catch (error) {
    writeLog_(timestamp, payloadSize, "error", 0, 0, 0, error.toString(), "error", "");
    return jsonResponse_({ status: "error", message: error.toString() });
  }
}

function doOptions(e) {
  return ContentService.createTextOutput("").setMimeType(ContentService.MimeType.TEXT);
}

function doGet(e) {
  return jsonResponse_({
    status: "ok",
    version: API_VERSION,
    message: "UDFondue API is running"
  });
}

// ---------- Action handlers ----------

function handleSubmit_(data, timestamp, payloadSize) {
  const name = data.name || "ไม่ระบุชื่อ";
  const lineId = data.lineId || "ไม่ระบุ ID";
  const room = data.room || "ไม่ระบุห้อง";
  const studentNo = data.studentNo || "ไม่ระบุเลขที่";
  let category = data.category || "ไม่ได้เลือก";
  const detail = data.detail || "";
  const submitId = data.submitId || "";
  const imageCount = data.imageCount || 0;

  if (category === "other" || category === "อื่นๆ") {
    category = "อื่นๆ: " + (data.otherCategory || "ไม่ระบุหัวข้อ");
  }

  const imageUrl = imageCount > 0 ? "กำลังอัปโหลด..." : "";

  const sheet = getSheet_();
  ensureSheetHeaders_(sheet, true);
  sheet.appendRow(buildReportRow_({
    timestamp: timestamp,
    lineId: lineId,
    name: name,
    room: room,
    studentNo: studentNo,
    category: category,
    detail: detail,
    imageCount: imageCount,
    imageUrl: imageUrl,
    submitId: submitId,
    debug: "",
    status: DEFAULT_STATUS,
    adminNote: "",
    statusUpdated: formatDateTimeTh_(timestamp)
  }));
  fixTextColumnsAfterAppend_(sheet, sheet.getLastRow(), room, studentNo);

  writeLog_(timestamp, payloadSize, "submit", imageCount, 0, 0, "", "success", submitId);

  if (imageCount === 0) {
    sendLineThankYou_(lineId, submitId, category);
  }

  return jsonResponse_({ status: "success", message: "บันทึกข้อมูลเรียบร้อยแล้ว" });
}

function handleUploadImage_(data, timestamp, payloadSize) {
  const submitId = data.submitId || "";
  const imageIndex = data.imageIndex || 1;
  const image = data.image || "";

  let url = "";
  let errorMsg = "";

  try {
    url = uploadImage_(image, timestamp, imageIndex);
    if (!url) {
      errorMsg = "ข้อมูลรูปไม่ถูกต้อง";
    }
  } catch (err) {
    errorMsg = err.toString();
  }

  if (url) {
    const sheet = getSheet_();
    const row = findRowBySubmitId_(sheet, submitId);
    if (row > 0) {
      const rowData = getSingleRowRange_(sheet, row, 1, SHEET_HEADERS.length).getValues()[0];
      const current = rowData[COL.IMAGE_URL - 1];
      let newVal = url;
      if (current && current !== "กำลังอัปโหลด...") {
        newVal = current + "\n" + url;
      }
      sheet.getRange(row, COL.IMAGE_URL).setValue(newVal);

      const imageCount = Number(rowData[COL.IMAGE_COUNT - 1]) || 0;
      const lineId = rowData[COL.LINE_ID - 1];
      const category = rowData[COL.CATEGORY - 1];
      if (imageIndex >= imageCount && imageCount > 0) {
        sendLineThankYou_(lineId, submitId, category);
      }
    } else {
      errorMsg = "ไม่พบแถว submitId: " + submitId;
    }
  }

  writeLog_(timestamp, payloadSize, "uploadImage", 1, url ? 1 : 0, url ? 1 : 0, errorMsg, url ? "success" : "error", submitId);

  if (errorMsg) {
    writeDebugLog_(submitId, "uploadImage: " + errorMsg);
  }

  return jsonResponse_({
    status: url ? "success" : "error",
    message: url ? "อัปโหลดรูปสำเร็จ" : errorMsg
  });
}

function handleLegacy_(data, timestamp, payloadSize) {
  if (data.action === "submit") {
    return handleSubmit_(data, timestamp, payloadSize);
  }
  if (data.action === "uploadImage") {
    return handleUploadImage_(data, timestamp, payloadSize);
  }

  const name = data.name || "ไม่ระบุชื่อ";
  const lineId = data.lineId || "ไม่ระบุ ID";
  const room = data.room || "ไม่ระบุห้อง";
  const studentNo = data.studentNo || "ไม่ระบุเลขที่";
  let category = data.category || "ไม่ได้เลือก";
  const detail = data.detail || "";

  let images = [];
  if (Array.isArray(data.images)) {
    images = data.images;
  } else if (data.image) {
    images = [data.image];
  }

  if (category === "other" || category === "อื่นๆ") {
    category = "อื่นๆ: " + (data.otherCategory || "ไม่ระบุหัวข้อ");
  }

  const uploadErrors = [];
  const urls = [];

  for (let i = 0; i < images.length; i++) {
    try {
      const url = uploadImage_(images[i], timestamp, i + 1);
      if (url) {
        urls.push(url);
      } else {
        uploadErrors.push("รูป" + (i + 1) + ": ข้อมูลรูปไม่ถูกต้อง");
      }
    } catch (imgErr) {
      uploadErrors.push("รูป" + (i + 1) + ": " + imgErr.toString());
    }
  }

  let imageUrl = "";
  if (urls.length > 0) {
    imageUrl = urls.join("\n");
  } else if (uploadErrors.length > 0) {
    imageUrl = "อัปโหลดรูปไม่สำเร็จ: " + uploadErrors.join(" | ");
  }

  const sheet = getSheet_();
  ensureSheetHeaders_(sheet, true);
  sheet.appendRow(buildReportRow_({
    timestamp: timestamp,
    lineId: lineId,
    name: name,
    room: room,
    studentNo: studentNo,
    category: category,
    detail: detail,
    imageCount: images.length,
    imageUrl: imageUrl,
    submitId: "",
    debug: uploadErrors.join(" | "),
    status: DEFAULT_STATUS,
    adminNote: "",
    statusUpdated: formatDateTimeTh_(timestamp)
  }));
  fixTextColumnsAfterAppend_(sheet, sheet.getLastRow(), room, studentNo);

  writeLog_(timestamp, payloadSize, "legacy", images.length, urls.length, urls.length, uploadErrors.join(" | "), "success", "");

  sendLineThankYou_(lineId, "", category);

  return jsonResponse_({ status: "success", message: "บันทึกข้อมูลเรียบร้อยแล้ว" });
}

// ---------- Tracking (นักเรียน) ----------

function handleTrackList_(data) {
  const lineId = data.lineId || "";
  if (!lineId) {
    return jsonResponse_({ status: "error", message: "ไม่พบ LINE User ID" });
  }

  const sheet = getSheet_();
  const rows = getAllReportRows_(sheet);
  const reports = [];

  for (let i = 0; i < rows.length; i++) {
    const report = rowToReportObject_(rows[i]);
    if (String(report.lineId) === String(lineId)) {
      reports.push(report);
    }
  }

  reports.sort(function (a, b) {
    return String(b.submitId).localeCompare(String(a.submitId));
  });

  return jsonResponse_({ status: "success", reports: reports });
}

function handleTrackDetail_(data) {
  const lineId = data.lineId || "";
  const submitId = data.submitId || "";
  if (!lineId || !submitId) {
    return jsonResponse_({ status: "error", message: "ข้อมูลไม่ครบ" });
  }

  const sheet = getSheet_();
  const row = findRowBySubmitId_(sheet, submitId);
  if (row < 0) {
    return jsonResponse_({ status: "error", message: "ไม่พบเลขที่แจ้งนี้" });
  }

  const report = rowToReportObject_(getSingleRowRange_(sheet, row, 1, SHEET_HEADERS.length).getValues()[0]);
  if (String(report.lineId) !== String(lineId)) {
    return jsonResponse_({ status: "error", message: "ไม่มีสิทธิ์ดูเรื่องนี้" });
  }

  return jsonResponse_({ status: "success", report: report });
}

// ---------- Admin ----------

function handleAdminAuth_(data) {
  const auth = authenticateAdminPassword_(data.password || "");
  if (!auth.ok) {
    return jsonResponse_({ status: "error", message: auth.message });
  }
  return jsonResponse_({ status: "success", adminToken: auth.token });
}

function handleAdminBootstrap_(data) {
  let adminToken = data.adminToken || "";

  if (data.password) {
    const auth = authenticateAdminPassword_(data.password);
    if (!auth.ok) {
      return jsonResponse_({ status: "error", message: auth.message });
    }
    adminToken = auth.token;
  } else if (!verifyAdminToken_(adminToken)) {
    return jsonResponse_({ status: "error", message: "กรุณาเข้าสู่ระบบใหม่" });
  }

  const reports = getAdminReports_(data.filterStatus || "", data.search || "");
  return jsonResponse_({
    status: "success",
    adminToken: adminToken,
    reports: reports,
    statusOptions: STATUS_OPTIONS
  });
}

function handleAdminList_(data) {
  if (!verifyAdminToken_(data.adminToken)) {
    return jsonResponse_({ status: "error", message: "กรุณาเข้าสู่ระบบใหม่" });
  }

  const reports = getAdminReports_(data.filterStatus || "", data.search || "");
  return jsonResponse_({
    status: "success",
    reports: reports,
    statusOptions: STATUS_OPTIONS
  });
}

function authenticateAdminPassword_(password) {
  if (!ADMIN_PASSWORD || ADMIN_PASSWORD === "YOUR_ADMIN_PASSWORD") {
    return { ok: false, message: "ยังไม่ได้ตั้งรหัส Admin ใน Code.gs" };
  }
  if (password !== ADMIN_PASSWORD) {
    return { ok: false, message: "รหัสผ่านไม่ถูกต้อง" };
  }
  const token = Utilities.getUuid();
  CacheService.getScriptCache().put("admin_" + token, "1", ADMIN_TOKEN_TTL_SEC);
  return { ok: true, token: token };
}

function getAdminReports_(filterStatus, search) {
  const searchLower = String(search || "").toLowerCase().trim();
  const sheet = getSheet_();
  const rows = getAllReportRows_(sheet);
  const reports = [];

  for (let i = 0; i < rows.length; i++) {
    const report = rowToReportObject_(rows[i]);
    if (filterStatus && report.status !== filterStatus) continue;
    if (searchLower) {
      const haystack = [
        report.name,
        report.room,
        report.studentNo,
        report.category,
        report.submitId,
        report.detail
      ].join(" ").toLowerCase();
      if (haystack.indexOf(searchLower) === -1) continue;
    }
    reports.push(report);
  }

  reports.sort(function (a, b) {
    return String(b.submitId).localeCompare(String(a.submitId));
  });

  return reports;
}

function handleAdminUpdate_(data, timestamp) {
  if (!verifyAdminToken_(data.adminToken)) {
    return jsonResponse_({ status: "error", message: "กรุณาเข้าสู่ระบบใหม่" });
  }

  const submitId = data.submitId || "";
  const status = data.status || "";
  const adminNote = data.adminNote || "";

  if (!submitId) {
    return jsonResponse_({ status: "error", message: "ไม่พบ Submit ID" });
  }
  if (STATUS_OPTIONS.indexOf(status) === -1) {
    return jsonResponse_({ status: "error", message: "สถานะไม่ถูกต้อง" });
  }

  const sheet = getSheet_();
  const row = findRowBySubmitId_(sheet, submitId);
  if (row < 0) {
    return jsonResponse_({ status: "error", message: "ไม่พบเรื่องนี้" });
  }

  const updatedAt = formatDateTimeTh_(timestamp);
  getSingleRowRange_(sheet, row, COL.STATUS, COL.STATUS_UPDATED).setValues([[status, adminNote, updatedAt]]);

  const report = rowToReportObject_(getSingleRowRange_(sheet, row, 1, SHEET_HEADERS.length).getValues()[0]);
  return jsonResponse_({ status: "success", message: "อัปเดตสถานะเรียบร้อย", report: report });
}

function verifyAdminToken_(token) {
  if (!token) return false;
  return CacheService.getScriptCache().get("admin_" + token) === "1";
}

// ---------- LINE Messaging API ----------

function buildSubmitConfirmationMessage_(submitId, category, status) {
  const resolvedStatus = status || DEFAULT_STATUS;
  let statusLine = resolvedStatus;
  if (resolvedStatus === DEFAULT_STATUS) {
    statusLine = "🟡 " + resolvedStatus + " (รอเจ้าหน้าที่ตรวจสอบ)";
  }

  return [
    "🙏 ขอบคุณสำหรับการแจ้งเรื่องครับ/ค่ะ!",
    "ทางเราได้รับข้อมูลของท่านเรียบร้อยแล้ว",
    "📌 สรุปรายละเอียดการแจ้งเรื่อง",
    "• รหัสติดตาม: " + (submitId || "—"),
    "• หมวดหมู่: " + (category || "ไม่ได้เลือก"),
    "• สถานะปัจจุบัน: " + statusLine,
    "",
    "🔍 ติดตามสถานะหรือเช็กความคืบหน้าได้ที่:",
    "👉 " + LIFF_TRACK_URL,
    "📝 แจ้งปัญหา / ตามหาของหายเพิ่มเติมได้ที่:",
    "👉 " + LIFF_REPORT_URL
  ].join("\n");
}

function sendLineThankYou_(userId, submitId, category, status) {
  if (!userId || userId === "ไม่ระบุ ID" || String(userId).indexOf("TEST") !== -1) return;
  if (!LINE_ACCESS_TOKEN || LINE_ACCESS_TOKEN === "YOUR_LINE_CHANNEL_ACCESS_TOKEN") {
    Logger.log("LINE_ACCESS_TOKEN not configured, skip push message");
    return;
  }

  if (submitId) {
    const cache = CacheService.getScriptCache();
    const cacheKey = "line_sent_" + submitId;
    if (cache.get(cacheKey) === "1") return;
    cache.put(cacheKey, "1", 60);
  }

  const messageText = buildSubmitConfirmationMessage_(submitId, category, status);

  const payload = {
    to: userId,
    messages: [{ type: "text", text: messageText }]
  };

  const options = {
    method: "post",
    contentType: "application/json",
    headers: { Authorization: "Bearer " + LINE_ACCESS_TOKEN },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  try {
    const response = UrlFetchApp.fetch("https://api.line.me/v2/bot/message/push", options);
    const code = response.getResponseCode();

    if (code !== 200) {
      const errText = response.getContentText();
      Logger.log("LINE Push failed (" + code + "): " + errText);
      writeDebugLog_(submitId, "LINE push: " + errText);
    }
  } catch (err) {
    Logger.log("LINE Push error: " + err.toString());
    writeDebugLog_(submitId, "LINE push: " + err.toString());
  }
}

/** รันครั้งเดียวจาก Apps Script Editor เพื่อขอสิทธิ์ UrlFetchApp แล้ว Deploy New version */
function authorizeLinePush_() {
  const response = UrlFetchApp.fetch("https://api.line.me/v2/bot/info", {
    method: "get",
    headers: { Authorization: "Bearer " + LINE_ACCESS_TOKEN },
    muteHttpExceptions: true
  });
  return "LINE auth OK (HTTP " + response.getResponseCode() + "). Deploy New version แล้วลองส่งฟอร์มอีกครั้ง";
}

// ---------- Diagnostics (Run จาก editor) ----------

function testWriteSheet() {
  const timestamp = new Date();
  const submitId = "TEST-" + timestamp.getTime();

  try {
    const sheet = getSheet_();
    ensureSheetHeaders_(sheet, true);
    sheet.appendRow(buildReportRow_({
      timestamp: timestamp,
      lineId: "TEST-LINE-ID",
      name: "ทดสอบจาก Editor",
      room: "5/6",
      studentNo: "15",
      category: "ทดสอบ",
      detail: "แถวทดสอบ " + API_VERSION,
      imageCount: 0,
      imageUrl: "",
      submitId: submitId,
      debug: "testWriteSheet",
      status: DEFAULT_STATUS,
      adminNote: "",
      statusUpdated: formatDateTimeTh_(timestamp)
    }));
    writeLog_(timestamp, 0, "test", 0, 0, 0, "", "success", submitId);
    return "OK: เขียน Sheet (" + SHEET_NAME + ") + Log สำเร็จ (API " + API_VERSION + ")";
  } catch (err) {
    return "ERROR: " + err.toString();
  }
}

function pingDrive() {
  try {
    const timestamp = new Date();
    const rootFolder = getDriveFolder_();
    const dayFolder = getOrCreateDayFolder_(rootFolder, timestamp);
    const ext = "txt";
    const fileName = formatTimeFile_(timestamp, 1) + "." + ext;
    const blob = Utilities.newBlob("UDFondue ping test " + API_VERSION, "text/plain", fileName);
    const file = dayFolder.createFile(blob);
    return "OK: สร้างไฟล์ " + file.getName() + " ในโฟลเดอร์ " + dayFolder.getName() + " (API " + API_VERSION + ")";
  } catch (err) {
    return "ERROR: " + err.toString();
  }
}

// ---------- Helpers ----------

function formatDateTh_(date) {
  return Utilities.formatDate(date, TZ, "dd/MM/yyyy");
}

function formatTimeTh_(date) {
  return Utilities.formatDate(date, TZ, "HH:mm:ss");
}

function formatDateTimeTh_(date) {
  return Utilities.formatDate(date, TZ, "dd/MM/yyyy HH:mm:ss");
}

function formatSheetCell_(val, kind) {
  if (val instanceof Date) {
    if (kind === "date") return Utilities.formatDate(val, TZ, "dd/MM/yyyy");
    if (kind === "time") return Utilities.formatDate(val, TZ, "HH:mm:ss");
    if (kind === "room") return Utilities.formatDate(val, TZ, "d/M");
    return Utilities.formatDate(val, TZ, "dd/MM/yyyy HH:mm:ss");
  }
  return val === undefined || val === null ? "" : String(val);
}

function fixTextColumnsAfterAppend_(sheet, row, room, studentNo) {
  const textRange = getSingleRowRange_(sheet, row, COL.ROOM, COL.STUDENT_NO);
  textRange.setNumberFormat("@");
  textRange.setValues([[room, studentNo]]);
}

function getSingleRowRange_(sheet, row, startCol, endCol) {
  return sheet.getRange(row, startCol, 1, endCol - startCol + 1);
}

function getRectRange_(sheet, startRow, startCol, endRow, endCol) {
  return sheet.getRange(startRow, startCol, endRow - startRow + 1, endCol - startCol + 1);
}

function formatTimeFile_(date, index) {
  const base = Utilities.formatDate(date, TZ, "HH.mm.ss");
  if (index > 1) {
    return base + "_" + index;
  }
  return base;
}

function getOrCreateSubfolder_(parentFolder, name) {
  const folders = parentFolder.getFoldersByName(name);
  if (folders.hasNext()) {
    return folders.next();
  }
  return parentFolder.createFolder(name);
}

function getOrCreateDayFolder_(rootFolder, timestamp) {
  const year = Utilities.formatDate(timestamp, TZ, "yyyy");
  const month = Utilities.formatDate(timestamp, TZ, "MM");
  const day = Utilities.formatDate(timestamp, TZ, "dd");

  const yearFolder = getOrCreateSubfolder_(rootFolder, year);
  const monthFolder = getOrCreateSubfolder_(yearFolder, month);
  return getOrCreateSubfolder_(monthFolder, day);
}

function getSpreadsheet_() {
  try {
    return SpreadsheetApp.openById(SPREADSHEET_ID);
  } catch (err) {
    throw new Error("เปิด Spreadsheet ไม่ได้ (ID: " + SPREADSHEET_ID + "): " + err.toString());
  }
}

function getDriveFolder_() {
  try {
    return DriveApp.getFolderById(FOLDER_ID);
  } catch (err) {
    throw new Error("เปิดโฟลเดอร์ Drive ไม่ได้ (ID: " + FOLDER_ID + "): " + err.toString());
  }
}

function parsePayload_(e) {
  if (!e) {
    throw new Error("doPost ต้องเรียกผ่าน Web App URL ไม่สามารถ Run จาก editor ได้");
  }
  if (e.postData && e.postData.contents) {
    const contents = e.postData.contents;
    try {
      return JSON.parse(contents);
    } catch (parseErr) {
      if (e.parameter && e.parameter.payload) {
        return JSON.parse(e.parameter.payload);
      }
      throw parseErr;
    }
  }
  if (e.parameter && e.parameter.payload) {
    return JSON.parse(e.parameter.payload);
  }
  throw new Error("ไม่มีข้อมูล");
}

function getPayloadSize_(e) {
  if (!e) return 0;
  if (e.postData && e.postData.contents) {
    return e.postData.contents.length;
  }
  if (e.parameter && e.parameter.payload) {
    return e.parameter.payload.length;
  }
  return 0;
}

function uploadImage_(base64Image, timestamp, index) {
  if (!base64Image || base64Image.indexOf(",") === -1) return "";

  const rootFolder = getDriveFolder_();
  const dayFolder = getOrCreateDayFolder_(rootFolder, timestamp);
  const splitData = base64Image.split(",");
  const contentType = splitData[0].match(/:(.*?);/)[1];
  const rawBase64 = splitData[1];

  const decodedImg = Utilities.base64Decode(rawBase64);
  let extension = contentType.split("/")[1];
  if (extension === "jpeg") {
    extension = "jpg";
  }

  const fileName = formatTimeFile_(timestamp, index) + "." + extension;
  const blob = Utilities.newBlob(decodedImg, contentType, fileName);
  const file = dayFolder.createFile(blob);

  try {
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  } catch (shareErr) {
    // ข้ามได้
  }

  return "https://drive.google.com/thumbnail?id=" + file.getId() + "&sz=w1200";
}

function ensureSheetHeaders_(sheet, forWrite) {
  const cache = CacheService.getScriptCache();
  const cached = cache.get(SHEET_HEADERS_CACHE_KEY) === "1";

  if (cached && !forWrite) {
    return;
  }

  if (sheet.getLastRow() === 0) {
    sheet.appendRow(SHEET_HEADERS);
    sheet.setFrozenRows(1);
    cache.put(SHEET_HEADERS_CACHE_KEY, "1", 21600);
    return;
  }

  const lastCol = Math.max(sheet.getLastColumn(), 1);
  if (lastCol < SHEET_HEADERS.length) {
    for (let c = lastCol + 1; c <= SHEET_HEADERS.length; c++) {
      sheet.getRange(1, c).setValue(SHEET_HEADERS[c - 1]);
    }
  }

  if (!cached) {
    sheet.getRange(1, 1, 1, SHEET_HEADERS.length).setValues([SHEET_HEADERS]);
    sheet.setFrozenRows(1);
    if (forWrite) {
      backfillEmptyStatus_(sheet);
    }
    cache.put(SHEET_HEADERS_CACHE_KEY, "1", 21600);
  }
}

function backfillEmptyStatus_(sheet) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return;

  const statusRange = getRectRange_(sheet, 2, COL.STATUS, lastRow, COL.STATUS);
  const statuses = statusRange.getValues();
  let changed = false;

  for (let i = 0; i < statuses.length; i++) {
    if (!statuses[i][0]) {
      statuses[i][0] = DEFAULT_STATUS;
      changed = true;
    }
  }

  if (changed) {
    statusRange.setValues(statuses);
  }
}

function buildReportRow_(data) {
  const ts = data.timestamp || new Date();
  return [
    formatDateTh_(ts),
    formatTimeTh_(ts),
    data.lineId || "",
    data.name || "",
    data.room || "",
    data.studentNo || "",
    data.category || "",
    data.detail || "",
    data.imageCount || 0,
    data.imageUrl || "",
    data.submitId || "",
    data.debug || "",
    data.status || DEFAULT_STATUS,
    data.adminNote || "",
    data.statusUpdated || formatDateTimeTh_(ts)
  ];
}

function getAllReportRows_(sheet) {
  ensureSheetHeaders_(sheet, false);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  return getRectRange_(sheet, 2, 1, lastRow, SHEET_HEADERS.length).getValues();
}

function rowToReportObject_(row) {
  const get = function (col) {
    const val = row[col - 1];
    return val === undefined || val === null ? "" : val;
  };

  return {
    submitId: formatSheetCell_(get(COL.SUBMIT_ID), "text"),
    date: formatSheetCell_(get(COL.DATE), "date"),
    time: formatSheetCell_(get(COL.TIME), "time"),
    lineId: formatSheetCell_(get(COL.LINE_ID), "text"),
    name: formatSheetCell_(get(COL.NAME), "text"),
    room: formatSheetCell_(get(COL.ROOM), "room"),
    studentNo: formatSheetCell_(get(COL.STUDENT_NO), "text"),
    category: formatSheetCell_(get(COL.CATEGORY), "text"),
    detail: formatSheetCell_(get(COL.DETAIL), "text"),
    imageCount: Number(get(COL.IMAGE_COUNT)) || 0,
    imageUrl: formatSheetCell_(get(COL.IMAGE_URL), "text"),
    status: formatSheetCell_(get(COL.STATUS) || DEFAULT_STATUS, "text"),
    adminNote: formatSheetCell_(get(COL.ADMIN_NOTE), "text"),
    statusUpdated: formatSheetCell_(get(COL.STATUS_UPDATED), "datetime")
  };
}

function findRowBySubmitId_(sheet, submitId) {
  if (!submitId) return -1;

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return -1;

  const ids = getRectRange_(sheet, 2, COL.SUBMIT_ID, lastRow, COL.SUBMIT_ID).getValues();
  for (let i = ids.length - 1; i >= 0; i--) {
    if (String(ids[i][0]) === String(submitId)) {
      return i + 2;
    }
  }
  return -1;
}

function writeDebugLog_(submitId, message) {
  if (!submitId || !message) return;
  try {
    const sheet = getSheet_();
    ensureSheetHeaders_(sheet, true);
    const row = findRowBySubmitId_(sheet, submitId);
    if (row > 0) {
      const current = sheet.getRange(row, COL.DEBUG).getValue();
      const newVal = current ? current + " | " + message : message;
      sheet.getRange(row, COL.DEBUG).setValue(newVal);
    }
  } catch (err) {
    Logger.log("writeDebugLog_ error: " + err.toString());
  }
}

function getSheet_() {
  const ss = getSpreadsheet_();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
  }
  return sheet;
}

function ensureLogSheet_() {
  const ss = getSpreadsheet_();
  let sheet = ss.getSheetByName(LOG_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(LOG_SHEET_NAME);
    sheet.appendRow(["วันที่/เวลา", "ขนาด Payload", "Action", "จำนวนรูปที่ได้รับ", "จำนวนรูปที่อัปสำเร็จ", "Upload OK", "ข้อผิดพลาด", "สถานะ", "Submit ID"]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function getLogSheet_() {
  return ensureLogSheet_();
}

function setupLogSheet() {
  ensureLogSheet_();
  return "สร้างแท็บ " + LOG_SHEET_NAME + " เรียบร้อยแล้ว (API " + API_VERSION + ")";
}

function writeLog_(timestamp, payloadSize, action, imageCount, uploadedCount, uploadOk, errors, status, submitId) {
  try {
    getLogSheet_().appendRow([timestamp, payloadSize, action, imageCount, uploadedCount, uploadOk, errors || "", status, submitId || ""]);
  } catch (logErr) {
    Logger.log("writeLog_ error: " + logErr.toString());
    writeDebugLog_(submitId, "log: " + logErr.toString());
  }
}

function jsonResponse_(obj) {
  const payload = Object.assign({ version: API_VERSION }, obj || {});
  return ContentService.createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
