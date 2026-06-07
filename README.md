# UDFondue — ระบบแจ้งเรื่องผ่าน LINE LIFF

ระบบ LINE Official Account สำหรับให้นักเรียนแจ้งเรื่องผ่านฟอร์มบน LINE โดยข้อมูลจะถูกบันทึกลง Google Sheets และรูปภาพเก็บไว้ใน Google Drive

**ประเภทเรื่องที่แจ้งได้:**
1. ปัญหาที่พบ
2. ตามหาของหาย
3. เสนอความเห็นต่อสภานักเรียน

แต่ละเรื่องสามารถใส่รายละเอียด และแนบรูปภาพได้ (ไม่บังคับ)

---

## โครงสร้างไฟล์

| ไฟล์ | หน้าที่ |
| --- | --- |
| `index.html` | หน้าบ้าน (LIFF) ที่ผู้ใช้กรอกฟอร์มบน LINE |
| `Code.gs` | โค้ดหลังบ้าน (Google Apps Script) รับข้อมูล + บันทึกลง Sheets/Drive |
| `README.md` | คู่มือนี้ |

---

## ขั้นตอนการติดตั้ง

### 1) เตรียม Google Drive / Sheets

1. สร้าง **Google Sheets** เปล่า ตั้งชื่อว่า `UDFondue_Database` (หัวตารางจะถูกสร้างให้อัตโนมัติเมื่อมีข้อมูลแถวแรก)
2. สร้าง **โฟลเดอร์ใน Google Drive** ตั้งชื่อว่า `UDFondue_Images` สำหรับเก็บรูปภาพ
3. เปิดโฟลเดอร์นั้น แล้วคัดลอก `FOLDER_ID` จาก URL
   - ตัวอย่าง URL: `https://drive.google.com/drive/folders/1AbCdEfGhIjKlMnOpQrStUvWxYz`
   - `FOLDER_ID` คือ `1AbCdEfGhIjKlMnOpQrStUvWxYz`

### 2) ติดตั้งโค้ดหลังบ้าน (Apps Script)

1. เปิด Google Sheets ที่สร้างไว้ → เมนู **ส่วนขยาย (Extensions)** → **แอปส์สคริปต์ (Apps Script)**
2. ลบโค้ดเดิมใน `Code.gs` ทั้งหมด แล้วคัดลอกเนื้อหาจากไฟล์ `Code.gs` ในโปรเจกต์นี้ไปวาง
3. แก้ค่า `FOLDER_ID` ให้เป็น ID โฟลเดอร์ที่ได้จากขั้นตอนก่อนหน้า
4. กด **การทำให้ใช้งานได้ (Deploy)** → **การทำให้ใช้งานได้ใหม่ (New deployment)**
5. กดรูปเฟือง เลือกประเภท **เว็บแอป (Web app)** แล้วตั้งค่า:
   - คำอธิบาย: `v1`
   - ผู้ดำเนินการแอป: **ฉัน (Me)**
   - ผู้มีสิทธิ์เข้าถึง: **ทุกคน (Anyone)** ← สำคัญมาก
6. กด **Deploy** → อนุญาตสิทธิ์ (Authorize access → เลือกบัญชี → Advanced → Go to project (unsafe) → Allow)
7. คัดลอก **Web app URL** เก็บไว้

> ทดสอบได้โดยเปิด Web app URL บนเบราว์เซอร์ ควรเห็นข้อความ `{"status":"ok","message":"UDFondue API is running"}`

### 3) ตั้งค่าและอัปโหลดหน้าบ้าน

1. เปิดไฟล์ `index.html` แก้ไข 2 ค่านี้ในส่วน `<script>`:
   ```js
   const GAS_WEB_APP_URL = "วาง Web app URL จากขั้นตอนที่ 2";
   const LIFF_ID = "วาง LIFF ID จากขั้นตอนที่ 4";
   ```
2. อัปโหลดไฟล์ `index.html` ขึ้นโฮสติ้งฟรี เช่น **GitHub Pages**, **Vercel** หรือ **Netlify**
   - จะได้ลิงก์ เช่น `https://yourusername.github.io/udfondue/`

### 4) ลงทะเบียน LINE LIFF

1. เข้า [LINE Developers Console](https://developers.line.biz/console/)
2. เข้าไปใน Provider → **Messaging API Channel** ของคุณ
3. ไปที่แท็บ **LIFF** → **Add**
4. ตั้งค่า:
   - **LIFF app name:** UDFondue
   - **Size:** Full หรือ Tall
   - **Endpoint URL:** ลิงก์หน้าเว็บจากขั้นตอนที่ 3
   - **Scopes:** ติ๊ก `profile`
   - **Bot link feature:** On (ถ้าต้องการ)
5. กด **Save** จะได้ **LIFF ID** (เช่น `2001234567-abc123Xy`)
6. นำ **LIFF ID** ไปใส่ในไฟล์ `index.html` (ขั้นตอนที่ 3) แล้วอัปโหลดไฟล์ขึ้นใหม่อีกครั้ง
7. คัดลอก **LIFF URL** (`https://liff.line.me/...`) ไปใช้ใน Rich Menu หรือ Flex Message

---

## การทดสอบ

- **บนเบราว์เซอร์ปกติ:** เปิด `index.html` ได้เลย ระบบจะใช้ชื่อผู้ใช้จำลองและส่งข้อมูลได้ (ใช้ตรวจว่า Sheets บันทึกถูกต้อง)
- **บน LINE:** เปิดผ่าน LIFF URL ระบบจะดึงชื่อ/รหัสผู้ใช้จาก LINE อัตโนมัติ

## ข้อมูลที่บันทึกลง Google Sheets

| คอลัมน์ | คำอธิบาย |
| --- | --- |
| วันที่/เวลา | เวลาที่ส่งเรื่อง |
| LINE User ID | รหัสผู้ใช้ LINE |
| ชื่อผู้แจ้ง | ชื่อโปรไฟล์ LINE |
| ประเภทเรื่อง | ปัญหาที่พบ / ตามหาของหาย / เสนอความเห็นต่อสภานักเรียน |
| รายละเอียด | ข้อความที่ผู้ใช้กรอก |
| ลิงก์รูปภาพ | ลิงก์รูปใน Google Drive (หรือ "ไม่มีรูปภาพ") |

---

## หมายเหตุ / การแก้ปัญหา

- ถ้าแก้โค้ด `Code.gs` แล้ว ต้อง **Deploy ใหม่** (Manage deployments → แก้ deployment เดิม → Version: New version) ไม่งั้นการเปลี่ยนแปลงจะไม่มีผล
- รูปภาพถูกตั้งสิทธิ์เป็น "ทุกคนที่มีลิงก์ดูได้" เพื่อให้เปิดดูจากในชีตได้
- ขนาดรูปจำกัด 5MB (ปรับได้ที่ฟังก์ชัน `previewImage` ใน `index.html`)
