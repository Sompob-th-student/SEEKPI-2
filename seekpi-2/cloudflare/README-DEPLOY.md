# SEEKPI-2 · Deploy to Cloudflare

คู่มือนำ SEEKPI-2 ขึ้น Cloudflare เป็นแอปเดียว ประกอบด้วย:

| ส่วน | บริการ Cloudflare | ไฟล์ในโฟลเดอร์นี้ |
|---|---|---|
| หน้าเว็บ (React) | Workers Static Assets | `public/` (build แล้ว พร้อม deploy) |
| API (`/api/*`) | Workers (Hono) | `src/worker.js`, `src/d1.js`, `src/scoring-d1.js`, `src/password.js` |
| ฐานข้อมูล | D1 (SQLite) | `migrations/0001_init.sql` (schema + ข้อมูลตัวอย่าง Syntec) |
| กติกาคำนวณคะแนน / Workflow | ใช้ไฟล์เดียวกับเวอร์ชัน Node | `../server/scoring-core.js`, `../server/workflow.js`, `../server/resources.js` |

ทดสอบแล้วบนเครื่องด้วย `wrangler dev` และ D1 แบบ local: Login, รายการประเมิน, Workflow และการตรวจสิทธิ์, Waive, SUM UP, ACTION TO, รายงาน 9 ฉบับ, Dashboard 4 หน้า และ Force Rank ให้ผลตรงกับเวอร์ชัน Node ทุกค่า

## ข้อควรทราบก่อน Deploy

- **ขัดกับการตัดสินใจเดิม:** เอกสาร Spec v1.3 กำหนดให้ติดตั้ง **On-premise** ส่วนการขึ้น Cloudflare ข้อมูลจะอยู่บน Cloud ของ Cloudflare ถ้าจะใช้ข้อมูลพนักงาน เงินเดือน หรือผลประเมินจริง ต้องให้ฝ่าย IT / DPO ประเมินตาม PDPA ก่อน (แนะนำสร้าง D1 ด้วย `--location apac` และเปิด Cloudflare Access)
- **ใช้ข้อมูลตัวอย่างเท่านั้น:** ฐานข้อมูลใน migration เป็นข้อมูลสมมุติ (24 พนักงาน, 2 รอบประเมิน)
- **แผนการใช้งาน:** แนะนำ **Workers Paid ($5/เดือน)** เพราะการตรวจรหัสผ่านแบบ PBKDF2 และการคำนวณคะแนนใช้ CPU เกินโควตา 10 ms ของแผน Free ได้
- **Schema:** D1 ใช้ตารางของ Prototype (32 ตาราง) ไม่ใช่ schema production 58 ตาราง (`../database/schema.sql`) ซึ่งเป็นงาน Phase 1

## สิ่งที่ต้องมี

- บัญชี Cloudflare (ใช้งาน Workers และ D1 ได้)
- Node.js 20 ขึ้นไป และ npm

## ขั้นตอน Deploy (ครั้งแรก)

รันทุกคำสั่งในโฟลเดอร์ `seekpi-2/cloudflare`

1. ติดตั้ง dependency และ Login เข้า Cloudflare
   ```bash
   npm install
   npx wrangler login
   ```
2. สร้างฐานข้อมูล D1 แล้วคัดลอก `database_id` ที่ได้ไปใส่แทน `REPLACE_WITH_YOUR_D1_DATABASE_ID` ใน `wrangler.jsonc`
   ```bash
   npx wrangler d1 create seekpi2 --location apac
   ```
3. สร้างตารางและข้อมูลตัวอย่างบน D1
   ```bash
   npx wrangler d1 migrations apply seekpi2 --remote
   ```
4. ตั้งค่า Secret สำหรับลงนาม Token (ใส่ค่าสุ่มยาว ๆ เมื่อระบบถาม)
   ```bash
   npx wrangler secret put JWT_SECRET
   ```
5. Deploy
   ```bash
   npx wrangler deploy
   ```
   ระบบจะแสดง URL เช่น `https://seekpi-2.<subdomain>.workers.dev`
6. เปิด URL แล้ว Login ด้วย `admin` / `admin123` จากนั้น **เปลี่ยนรหัสผ่านทุกบัญชีตัวอย่างทันที** (เมนู Profile และ Manage User > Users)

## บัญชีตัวอย่างใน migration

| ผู้ใช้ | รหัสผ่าน | บทบาท |
|---|---|---|
| `admin` | `admin123` | System Administrator |
| `hr` | `hr123` | HR Appraisal Officer |
| `E0002` | `demo123` | พนักงาน (เจ้าของ Scorecard) |
| `E0001` | `demo123` | หัวหน้าของ E0002 (ผู้ประเมิน) |

## ทดสอบบนเครื่องก่อน Deploy

```bash
npm install
cp .dev.vars.example .dev.vars
npx wrangler d1 migrations apply seekpi2 --local
npx wrangler dev
```
เปิด http://127.0.0.1:8787

## อัปเดตเวอร์ชันถัดไป

| เปลี่ยนอะไร | ทำอย่างไร |
|---|---|
| หน้าเว็บ (`../client`) | `npm run build:web` แล้ว `npx wrangler deploy` |
| API หรือกติกาคำนวณ (`src/`, `../server/scoring-core.js`, `../server/workflow.js`) | `npx wrangler deploy` |
| ข้อมูลตัวอย่างหรือโครงสร้างตาราง | อย่าแก้ `0001_init.sql` ที่ใช้ไปแล้ว ให้สร้างไฟล์ใหม่ เช่น `migrations/0002_xxx.sql` แล้วรัน `npx wrangler d1 migrations apply seekpi2 --remote` |
| สร้าง `0001_init.sql` ใหม่ทั้งหมด (เฉพาะฐานข้อมูลใหม่) | `npm run build:seed` |

## ใช้โดเมนของบริษัท (ไม่บังคับ)

ใน Cloudflare Dashboard ไปที่ Workers & Pages > seekpi-2 > Settings > Domains & Routes > Add Custom Domain (เช่น `seekpi2.syntec.co.th` ซึ่งต้องจัดการ DNS ของโดเมนนั้นใน Cloudflare) และถ้าต้องการจำกัดให้ใช้ได้เฉพาะพนักงาน ให้เปิด **Cloudflare Access** กับโดเมนนั้น

## ความแตกต่างจากเวอร์ชัน Node (on-prem)

| เรื่อง | Node + SQLite | Cloudflare Workers + D1 |
|---|---|---|
| Path ของเว็บ | `/seekpi-2/` | `/` (root ของโดเมน) |
| Hash รหัสผ่าน | bcrypt | PBKDF2-SHA256 100,000 รอบ (WebCrypto) |
| Token | jsonwebtoken | `hono/jwt` (HS256, หมดอายุ 8 ชั่วโมง) |
| Transaction | BEGIN / COMMIT | `D1.batch()` (atomic ต่อชุด) และสร้าง Assignment หลายคนใช้การลบย้อนกลับเมื่อเกิดข้อผิดพลาด |
| ข้อมูลตั้งต้น | สร้างตอนเปิด Server ครั้งแรก | อยู่ใน `migrations/0001_init.sql` (คำนวณคะแนนไว้แล้ว) |
