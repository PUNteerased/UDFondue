# UDFondue — ระบบแจ้งเรื่องและติดตามปัญหาผ่าน LINE LIFF

ระบบ LINE Official Account สำหรับให้นักเรียนแจ้งเรื่องผ่านฟอร์มบน LINE ติดตามสถานะ และให้เจ้าหน้าที่อัปเดตสถานะผ่านหน้า Admin โดยข้อมูลบันทึกลง Google Sheets และรูปภาพเก็บใน Google Drive

**ประเภทเรื่องที่แจ้งได้:**
1. ปัญหาที่พบ
2. ตามหาของหาย
3. เสนอความคิดเห็นต่อสภานักเรียน
4. อื่นๆ (+ หมวดหมู่เพิ่มเติม)

---

## โครงสร้างไฟล์

| ไฟล์ | หน้าที่ |
| --- | --- |
| `index.html` | ฟอร์มแจ้งเรื่อง (LIFF) |
| `track.html` | ติดตามสถานะเรื่อง (LIFF) |
| `nimda.html` | หน้า Admin สำหรับเจ้าหน้าที่ (URL ซ่อน) |
| `Code.gs` | Backend Google Apps Script |
| `README.md` | คู่มือนี้ |

---

## ขั้นตอนการติดตั้ง

### 1) เตรียม Google Drive / Sheets

1. สร้าง **Google Sheets** และเชื่อมกับ Apps Script
2. สร้าง **โฟลเดอร์ Google Drive** สำหรับเก็บรูป → คัดลอก `FOLDER_ID`
3. แท็บ `UDFondue_Database` จะถูกสร้างอัตโนมัติ พร้อมคอลัมน์สถานะ

### 2) ติดตั้ง Code.gs

1. วางโค้ดจาก `Code.gs` ใน Apps Script Editor
2. ตั้งค่าที่จำเป็น:
   ```js
   const FOLDER_ID = "โฟลเดอร์ Drive ID";
   const ADMIN_PASSWORD = "รหัสผ่าน Admin ของคุณ";
   ```
3. Deploy → Web app → Execute as **Me**, Access **Anyone**
4. คัดลอก **Web app URL**

> **สำคัญ:** หลังแก้ `Code.gs` ทุกครั้ง ต้อง Deploy → Manage deployments → **New version**

ทดสอบ: เปิด Web app URL ควรเห็น `"version":"v6-perf"`

### 3) Host หน้าเว็บ

อัปโหลด `index.html`, `track.html`, `nimda.html` ขึ้น GitHub Pages / Netlify / Vercel

แก้ `GAS_WEB_APP_URL` ในทุกไฟล์ให้ตรงกับ Web app URL:

```js
const GAS_WEB_APP_URL = "https://script.google.com/macros/s/.../exec";
```

### 4) ตั้งค่า LINE LIFF (2 ตัว)

| LIFF App | Endpoint URL | ใช้กับ |
| --- | --- | --- |
| UDFondue Report | `https://your-host/index.html` | แจ้งปัญหา |
| UDFondue Track | `https://your-host/track.html` | ติดตามปัญหา |

1. [LINE Developers Console](https://developers.line.biz/console/) → LIFF → Add
2. Size: **Full**, Scopes: **profile**
3. ใส่ LIFF ID ในไฟล์:
   - `index.html` → `LIFF_ID`
   - `track.html` → `LIFF_ID` (LIFF ตัวที่ 2)

### 5) Rich Menu (Banner 2500×1686)

| ปุ่ม | Action |
| --- | --- |
| ซ้าย — ติดตามปัญหา | LIFF URL ของ `track.html` |
| กลาง — แจ้งปัญหา | LIFF URL ของ `index.html` |
| ขวา — เหตุด่วน/ฉุกเฉิน | URI `tel:` หรือข้อความเบอร์ฉุกเฉิน |

พื้นที่กด (2500×1686, 3 คอลัมน์):

| ปุ่ม | x, y, width, height |
| --- | --- |
| ซ้าย | 0, 0, 833, 1686 |
| กลาง | 834, 0, 833, 1686 |
| ขวา | 1667, 0, 833, 1686 |

---

## การใช้งาน

### นักเรียน — แจ้งเรื่อง
1. เปิด LIFF แจ้งปัญหา
2. กรอกฟอร์มและส่ง
3. จด **เลขที่แจ้ง (Submit ID)** ที่แสดงหลังส่งสำเร็จ

### นักเรียน — ติดตามเรื่อง
1. เปิด LIFF ติดตามปัญหา
2. **เรื่องของฉัน** — ดูรายการอัตโนมัติจาก LINE
3. **ค้นหาเลขที่แจ้ง** — กรอก Submit ID เพื่อค้นหา

### เจ้าหน้าที่ — Admin
1. เปิด `nimda.html` (เก็บ URL ไว้เฉพาะเจ้าหน้าที่)
2. Login ด้วยรหัส `ADMIN_PASSWORD`
3. Filter / ค้นหาเรื่อง → กดเรื่อง → อัปเดตสถานะ + หมายเหตุ

**สถานะที่ใช้ได้:**
- รับเรื่องแล้ว
- กำลังดำเนินการ
- รอข้อมูลเพิ่ม
- เสร็จสิ้น
- ปิดเรื่อง

---

## ข้อมูลใน Google Sheets

| คอลัมน์ | คำอธิบาย |
| --- | --- |
| วันที่ / เวลา | เวลาที่ส่งเรื่อง |
| LINE User ID | รหัสผู้ใช้ LINE |
| ชื่อผู้แจ้ง | Display Name |
| ห้อง / เลขที่ | ข้อมูลนักเรียน |
| ประเภทเรื่อง | หมวดหมู่ที่เลือก |
| รายละเอียด | ข้อความที่กรอก |
| ลิงก์รูปภาพ | URL รูปใน Drive |
| Submit ID | เลขที่แจ้ง (ใช้ติดตาม) |
| สถานะ | สถานะปัจจุบัน |
| หมายเหตุเจ้าหน้าที่ | ข้อความจาก Admin |
| อัปเดตสถานะล่าสุด | เวลาที่ Admin แก้ล่าสุด |

---

## API Actions (Code.gs)

| Action | คำอธิบาย |
| --- | --- |
| `submit` | บันทึกเรื่องใหม่ |
| `uploadImage` | อัปโหลดรูป |
| `trackList` | ดึงรายการตาม lineId |
| `trackDetail` | ดึงรายละเอียด (ตรวจสิทธิ์ lineId) |
| `adminAuth` | Login Admin |
| `adminBootstrap` | Login + โหลดรายการครั้งเดียว (หรือ refresh ด้วย token) |
| `adminList` | รายการทั้งหมด + filter |
| `adminUpdate` | อัปเดตสถานะ |

---

## หมายเหตุ / การแก้ปัญหา

- แก้ `Code.gs` แล้วต้อง **Deploy New version** ทุกครั้ง
- รูปภาพเก็บใน Drive แบบ `ปี/เดือน/วัน/`
- Admin token หมดอายุ 8 ชั่วโมง — login ใหม่ได้
- อย่าเผยแพร่ URL `nimda.html` และ `ADMIN_PASSWORD` สาธารณะ
