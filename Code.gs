const SPREADSHEET_NAME = "Sheet1";
const FOLDER_ID = "YOUR_GOOGLE_DRIVE_FOLDER_ID";
const LINE_ACCESS_TOKEN = "YOUR_LINE_CHANNEL_ACCESS_TOKEN";
const TZ = "Asia/Bangkok";

function doPost(e) {
  try {
    const data = parsePayload_(e);
    const timestamp = new Date();

    const userId = data.userId || "ไม่ระบุ ID";
    const name = data.name || "ไม่ระบุชื่อ";
    let category = data.category || "ไม่ได้เลือก";
    const detail = data.detail || "";
    const base64Image = data.image || "";

    if (category === "อื่นๆ") {
      category = "อื่นๆ: " + (data.otherCategory || "ไม่ระบุหัวข้อ");
    }

    let imageUrl = "";
    if (base64Image) {
      imageUrl = saveImageToDrive_(base64Image, timestamp);
    }

    saveToSheet_(timestamp, userId, name, category, detail, imageUrl);
    sendLineReply_(userId, category);

    return jsonResponse_({ status: "success", message: "บันทึกข้อมูลเรียบร้อยแล้ว" });

  } catch (error) {
    return jsonResponse_({ status: "error", message: error.toString() });
  }
}

function doGet(e) {
  return jsonResponse_({ status: "ok", message: "Issue Report API is running" });
}

function doOptions(e) {
  return ContentService.createTextOutput("")
    .setMimeType(ContentService.MimeType.TEXT);
}

// ---------- LINE Messaging API ----------

function sendLineReply_(userId, category) {
  if (!userId || userId === "ไม่ระบุ ID" || userId.indexOf("TEST") !== -1) return;
  if (!LINE_ACCESS_TOKEN || LINE_ACCESS_TOKEN === "YOUR_LINE_CHANNEL_ACCESS_TOKEN") return;

  const message =
    "ขอบคุณที่แจ้งปัญหา\n\n" +
    "เราได้รับเรื่อง: " + category + " แล้ว\n" +
    "เจ้าหน้าที่จะรีบตรวจสอบและดำเนินการให้เร็วที่สุด";

  const payload = {
    to: userId,
    messages: [{ type: "text", text: message }]
  };

  const options = {
    method: "post",
    contentType: "application/json",
    headers: { Authorization: "Bearer " + LINE_ACCESS_TOKEN },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  const response = UrlFetchApp.fetch("https://api.line.me/v2/bot/message/push", options);
  const code = response.getResponseCode();

  if (code !== 200) {
    Logger.log("LINE Push failed (" + code + "): " + response.getContentText());
  }
}

// ---------- Google Drive ----------

function saveImageToDrive_(base64Image, timestamp) {
  if (!base64Image || base64Image.indexOf(",") === -1) return "";

  const folder = DriveApp.getFolderById(FOLDER_ID);
  const splitData = base64Image.split(",");
  const contentType = splitData[0].match(/:(.*?);/)[1];
  const rawBase64 = splitData[1];
  const decoded = Utilities.base64Decode(rawBase64);

  const fileName = "Report_" + Utilities.formatDate(timestamp, TZ, "yyyyMMdd_HHmmss") + ".png";
  const blob = Utilities.newBlob(decoded, contentType, fileName);
  const file = folder.createFile(blob);

  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return file.getUrl();
}

// ---------- Google Sheets ----------

function saveToSheet_(timestamp, userId, name, category, detail, imageUrl) {
  const sheet = getSheet_();

  if (sheet.getLastRow() === 0) {
    sheet.appendRow(["Timestamp", "Line User ID", "Name", "Category", "Detail", "Image URL"]);
    sheet.setFrozenRows(1);
  }

  sheet.appendRow([
    Utilities.formatDate(timestamp, TZ, "dd/MM/yyyy HH:mm:ss"),
    userId,
    name,
    category,
    detail,
    imageUrl || "ไม่มีรูปภาพ"
  ]);
}

function getSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SPREADSHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SPREADSHEET_NAME);
  }
  return sheet;
}

// ---------- Helpers ----------

function parsePayload_(e) {
  if (!e) {
    throw new Error("doPost ต้องเรียกผ่าน Web App URL");
  }
  if (e.postData && e.postData.contents) {
    return JSON.parse(e.postData.contents);
  }
  if (e.parameter && e.parameter.payload) {
    return JSON.parse(e.parameter.payload);
  }
  throw new Error("ไม่มีข้อมูลใน request");
}

function jsonResponse_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
