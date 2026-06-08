/**
 * UDFondue - Google Apps Script Backend
 * รับข้อมูลจากหน้าเว็บ LIFF -> บันทึกรูปลง Google Drive -> บันทึกข้อมูลลง Google Sheets
 *
 * สำคัญ: หลังแก้โค้ดต้อง Deploy -> Manage deployments -> New version
 * การ Save อย่างเดียวไม่ทำให้ Web App URL ใช้โค้ดใหม่
 */

const API_VERSION = "v3-split";
const SPREADSHEET_ID = "19pIiTGsPMHbyTxULJDtiPbavmkCS07FBH2E5iHcd1KE";
const SHEET_NAME = "UDFondue_Database";
const LOG_SHEET_NAME = "UDFondue_Log";
const FOLDER_ID = "1zP6mUhrI7q-Qf-bgA5c4HJwIYU6LnpyJ";

const COL = {
  TIMESTAMP: 1,
  LINE_ID: 2,
  NAME: 3,
  CATEGORY: 4,
  DETAIL: 5,
  IMAGE_URL: 6,
  SUBMIT_ID: 7,
  DEBUG: 8
};

function doPost(e) {
  const timestamp = new Date();
  const payloadSize = getPayloadSize_(e);

  try {
    ensureLogSheet_();
    const data = parsePayload_(e);
    const action = data.action || "legacy";

    if (action === "submit") {
      return handleSubmit_(data, timestamp, payloadSize);
    }
    if (action === "uploadImage") {
      return handleUploadImage_(data, timestamp, payloadSize);
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
  let category = data.category || "ไม่ได้เลือก";
  const detail = data.detail || "";
  const submitId = data.submitId || "";
  const imageCount = data.imageCount || 0;

  if (category === "other") {
    category = "อื่นๆ: " + (data.otherCategory || "ไม่ระบุหัวข้อ");
  }

  const imageUrl = imageCount > 0 ? "กำลังอัปโหลด..." : "ไม่มีรูปภาพ";

  const sheet = getSheet_();
  ensureSheetHeaders_(sheet);
  sheet.appendRow([timestamp, lineId, name, category, detail, imageUrl, submitId, ""]);

  writeLog_(timestamp, payloadSize, "submit", imageCount, 0, 0, "", "success", submitId);
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
      const current = sheet.getRange(row, COL.IMAGE_URL).getValue();
      let newVal = url;
      if (current && current !== "ไม่มีรูปภาพ" && current !== "กำลังอัปโหลด...") {
        newVal = current + "\n" + url;
      }
      sheet.getRange(row, COL.IMAGE_URL).setValue(newVal);
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
  let category = data.category || "ไม่ได้เลือก";
  const detail = data.detail || "";

  let images = [];
  if (Array.isArray(data.images)) {
    images = data.images;
  } else if (data.image) {
    images = [data.image];
  }

  if (category === "other") {
    category = "อื่นๆ: " + (data.otherCategory || "ไม่ระบุหัวข้อ");
  }

  let imageUrl = "ไม่มีรูปภาพ";
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

  if (urls.length > 0) {
    imageUrl = urls.join("\n");
  } else if (uploadErrors.length > 0) {
    imageUrl = "อัปโหลดรูปไม่สำเร็จ: " + uploadErrors.join(" | ");
  }

  const sheet = getSheet_();
  ensureSheetHeaders_(sheet);
  sheet.appendRow([timestamp, lineId, name, category, detail, imageUrl, "", uploadErrors.join(" | ")]);

  writeLog_(timestamp, payloadSize, "legacy", images.length, urls.length, urls.length, uploadErrors.join(" | "), "success", "");

  return jsonResponse_({ status: "success", message: "บันทึกข้อมูลเรียบร้อยแล้ว" });
}

// ---------- Diagnostics (Run จาก editor) ----------

function testWriteSheet() {
  const timestamp = new Date();
  const submitId = "TEST-" + timestamp.getTime();

  try {
    const sheet = getSheet_();
    ensureSheetHeaders_(sheet);
    sheet.appendRow([
      timestamp,
      "TEST-LINE-ID",
      "ทดสอบจาก Editor",
      "ทดสอบ",
      "แถวทดสอบ " + API_VERSION,
      "ไม่มีรูปภาพ",
      submitId,
      "testWriteSheet"
    ]);
    writeLog_(timestamp, 0, "test", 0, 0, 0, "", "success", submitId);
    return "OK: เขียน Sheet + Log สำเร็จ (API " + API_VERSION + ")";
  } catch (err) {
    return "ERROR: " + err.toString();
  }
}

function pingDrive() {
  try {
    const folder = getDriveFolder_();
    const blob = Utilities.newBlob("UDFondue ping test " + API_VERSION, "text/plain", "UDFondue_ping_test.txt");
    const file = folder.createFile(blob);
    return "OK: สร้างไฟล์ " + file.getName() + " ใน Drive (API " + API_VERSION + ")";
  } catch (err) {
    return "ERROR: " + err.toString();
  }
}

// ---------- Helpers ----------

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

  const folder = getDriveFolder_();
  const splitData = base64Image.split(",");
  const contentType = splitData[0].match(/:(.*?);/)[1];
  const rawBase64 = splitData[1];

  const decodedImg = Utilities.base64Decode(rawBase64);
  const extension = contentType.split("/")[1];
  const fileName = "UDFondue_" + Utilities.formatDate(timestamp, "GMT+7", "yyyyMMdd_HHmmss") + "_" + index + "." + extension;
  const blob = Utilities.newBlob(decodedImg, contentType, fileName);

  const file = folder.createFile(blob);

  try {
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  } catch (shareErr) {
    // ข้ามได้
  }

  return file.getUrl();
}

function ensureSheetHeaders_(sheet) {
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(["วันที่/เวลา", "LINE User ID", "ชื่อผู้แจ้ง", "ประเภทเรื่อง", "รายละเอียด", "ลิงก์รูปภาพ", "Submit ID", "Debug"]);
    return;
  }
  const lastCol = Math.max(sheet.getLastColumn(), COL.DEBUG);
  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  if (!headers[COL.SUBMIT_ID - 1] || headers[COL.SUBMIT_ID - 1] !== "Submit ID") {
    sheet.getRange(1, COL.SUBMIT_ID).setValue("Submit ID");
  }
  if (!headers[COL.DEBUG - 1] || headers[COL.DEBUG - 1] !== "Debug") {
    sheet.getRange(1, COL.DEBUG).setValue("Debug");
  }
}

function findRowBySubmitId_(sheet, submitId) {
  if (!submitId) return -1;

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return -1;

  const ids = sheet.getRange(2, COL.SUBMIT_ID, lastRow, COL.SUBMIT_ID).getValues();
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
    ensureSheetHeaders_(sheet);
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
