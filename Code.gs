/**
 * UDFondue - Google Apps Script Backend
 * รับข้อมูลจากหน้าเว็บ LIFF -> บันทึกรูปลง Google Drive -> บันทึกข้อมูลลง Google Sheets
 *
 * วิธีตั้งค่า:
 *   1) เปิด Google Sheets ที่จะใช้เก็บข้อมูล -> เมนู ส่วนขยาย (Extensions) -> แอปส์สคริปต์ (Apps Script)
 *   2) ลบโค้ดเดิมทั้งหมด แล้ววางโค้ดนี้แทน
 *   3) แก้ค่า FOLDER_ID ให้เป็น ID โฟลเดอร์ Google Drive ที่ใช้เก็บรูปภาพ
 *   4) Deploy เป็น Web app (Anyone) แล้วคัดลอก URL ไปใส่ในไฟล์ index.html
 */

const SHEET_NAME = "UDFondue_Database"; // ชื่อแผ่นงานใน Google Sheets
const FOLDER_ID = "1zP6mUhrI7q-Qf-bgA5c4HJwIYU6LnpyJ"; // โฟลเดอร์ UDFondue_Images

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);

    const timestamp = new Date();
    const name = data.name || "ไม่ระบุชื่อ";
    const lineId = data.lineId || "ไม่ระบุ ID";
    let category = data.category || "ไม่ได้เลือก";
    const detail = data.detail || "";
    const base64Image = data.image || "";

    // ถ้าเลือก "อื่นๆ" ให้ใช้หัวข้อที่ผู้ใช้ระบุเอง
    if (category === "other") {
      category = "อื่นๆ: " + (data.otherCategory || "ไม่ระบุหัวข้อ");
    }

    let imageUrl = "ไม่มีรูปภาพ";

    // 1) อัปโหลดรูปเข้า Google Drive (ถ้ามีการแนบมา)
    if (base64Image && base64Image.indexOf(",") !== -1) {
      const folder = DriveApp.getFolderById(FOLDER_ID);

      const splitData = base64Image.split(",");
      const contentType = splitData[0].match(/:(.*?);/)[1]; // เช่น image/png
      const rawBase64 = splitData[1];

      const decodedImg = Utilities.base64Decode(rawBase64);
      const extension = contentType.split("/")[1];
      const fileName = "UDFondue_" + Utilities.formatDate(timestamp, "GMT+7", "yyyyMMdd_HHmmss") + "." + extension;
      const blob = Utilities.newBlob(decodedImg, contentType, fileName);

      const file = folder.createFile(blob);
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      imageUrl = file.getUrl();
    }

    // 2) บันทึกลง Google Sheets (สร้างหัวตารางอัตโนมัติถ้ายังว่าง)
    const sheet = getSheet_();
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(["วันที่/เวลา", "LINE User ID", "ชื่อผู้แจ้ง", "ประเภทเรื่อง", "รายละเอียด", "ลิงก์รูปภาพ"]);
    }
    sheet.appendRow([timestamp, lineId, name, category, detail, imageUrl]);

    return jsonResponse_({ status: "success", message: "บันทึกข้อมูลเรียบร้อยแล้ว" });

  } catch (error) {
    return jsonResponse_({ status: "error", message: error.toString() });
  }
}

// ตอบกลับคำขอ preflight (CORS)
function doOptions(e) {
  return ContentService.createTextOutput("").setMimeType(ContentService.MimeType.TEXT);
}

// ใช้ตรวจสอบว่า Web app ทำงาน (เปิด URL บนเบราว์เซอร์)
function doGet(e) {
  return jsonResponse_({ status: "ok", message: "UDFondue API is running" });
}

// ---------- Helpers ----------
function getSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
  }
  return sheet;
}

function jsonResponse_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
