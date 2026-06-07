/**

 * UDFondue - Google Apps Script Backend

 * รับข้อมูลจากหน้าเว็บ LIFF -> บันทึกรูปลง Google Drive -> บันทึกข้อมูลลง Google Sheets

 */



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

  SUBMIT_ID: 7

};



function doPost(e) {

  const timestamp = new Date();

  const payloadSize = (e && e.postData && e.postData.contents) ? e.postData.contents.length : 0;

  ensureLogSheet_();

  try {

    const data = JSON.parse(e.postData.contents);

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

  return jsonResponse_({ status: "ok", message: "UDFondue API is running" });

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

  sheet.appendRow([timestamp, lineId, name, category, detail, imageUrl, submitId]);



  writeLog_(timestamp, payloadSize, "submit", 0, imageCount, 0, "", "success", submitId);

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



  writeLog_(

    timestamp,

    payloadSize,

    "uploadImage",

    1,

    url ? 1 : 0,

    url ? 1 : 0,

    errorMsg,

    url ? "success" : "error",

    submitId

  );



  return jsonResponse_({

    status: url ? "success" : "error",

    message: url ? "อัปโหลดรูปสำเร็จ" : errorMsg

  });

}



function handleLegacy_(data, timestamp, payloadSize) {

  const name = data.name || "ไม่ระบุชื่อ";

  const lineId = data.lineId || "ไม่ระบุ ID";

  let category = data.category || "ไม่ได้เลือก";

  const detail = data.detail || "";



  let images = [];

  const imagesType = typeof data.images;

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

  sheet.appendRow([timestamp, lineId, name, category, detail, imageUrl, ""]);



  writeLog_(timestamp, payloadSize, "legacy", images.length, urls.length, urls.length, uploadErrors.join(" | "), "success", "");



  return jsonResponse_({ status: "success", message: "บันทึกข้อมูลเรียบร้อยแล้ว" });

}



// ---------- Helpers ----------



function uploadImage_(base64Image, timestamp, index) {

  if (!base64Image || base64Image.indexOf(",") === -1) return "";



  const folder = DriveApp.getFolderById(FOLDER_ID);



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

    sheet.appendRow(["วันที่/เวลา", "LINE User ID", "ชื่อผู้แจ้ง", "ประเภทเรื่อง", "รายละเอียด", "ลิงก์รูปภาพ", "Submit ID"]);

    return;

  }

  const lastCol = Math.max(sheet.getLastColumn(), COL.SUBMIT_ID);

  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];

  if (!headers[COL.SUBMIT_ID - 1] || headers[COL.SUBMIT_ID - 1] !== "Submit ID") {

    sheet.getRange(1, COL.SUBMIT_ID).setValue("Submit ID");

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



function getSheet_() {

  const ss = SpreadsheetApp.getActiveSpreadsheet();

  let sheet = ss.getSheetByName(SHEET_NAME);

  if (!sheet) {

    sheet = ss.insertSheet(SHEET_NAME);

  }

  return sheet;

}



function ensureLogSheet_() {

  const ss = SpreadsheetApp.getActiveSpreadsheet();

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

// รันฟังก์ชันนี้จาก Apps Script editor (Run) ครั้งเดียวเพื่อสร้างแท็บ Log ทันที
function setupLogSheet() {

  ensureLogSheet_();

  return "สร้างแท็บ " + LOG_SHEET_NAME + " เรียบร้อยแล้ว";

}

function writeLog_(timestamp, payloadSize, action, imageCount, uploadedCount, uploadOk, errors, status, submitId) {

  try {

    getLogSheet_().appendRow([timestamp, payloadSize, action, imageCount, uploadedCount, uploadOk, errors || "", status, submitId || ""]);

  } catch (logErr) {

    Logger.log("writeLog_ error: " + logErr.toString());

  }

}



function jsonResponse_(obj) {

  return ContentService.createTextOutput(JSON.stringify(obj))

    .setMimeType(ContentService.MimeType.JSON);

}


