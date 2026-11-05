# SEE KPI (ระบบเดิม): Feature & Function Catalogue

| รายการ | รายละเอียด |
|---|---|
| ระบบที่ศึกษา | `https://kpi.syntec.co.th/seekpi/` (Production) |
| วันที่ | 5 พฤศจิกายน 2569 |
| บัญชีที่ใช้ | `admin` (ผู้ใช้ Login เองในหน้าต่าง Browser แล้วจึงให้ทีมสำรวจต่อ) |
| วิธีเก็บข้อมูล | เปิดทุกเมนูแบบ **Read-only**: ติดตั้งตัวกันในหน้าเว็บให้บล็อกทุก Request ที่ไม่ใช่ GET (POST/PUT/PATCH/DELETE) ระหว่างสำรวจถูกบล็อก 1 ครั้ง คือการกดออกรายงาน Appraisal Summary (POST) ไม่มีการบันทึก แก้ไข ลบ หรืออนุมัติข้อมูลใด ๆ |
| ข้อมูลที่เก็บ | เฉพาะโครงสร้าง ได้แก่ ชื่อเมนู, คอลัมน์ตาราง, ช่อง Filter, ช่องฟอร์ม, ปุ่ม, Workflow stage, API endpoint และชื่อ Field ของ JSON (ไม่มีค่าข้อมูลหรือข้อมูลส่วนบุคคล) |

ข้อจำกัด
- เมนูที่บัญชี `admin` **ไม่มีสิทธิ์** (ระบบพากลับหน้า Home): Force Rank (Company), Branch Performance, Data Entry Status, Setting ทั้ง 4 เมนู (Password Policy, LDAP, E-mail Server, Data Integration) และ Adjust
- รายงาน (Report) สร้างที่ Server ด้วย POST แล้วส่งไฟล์กลับ จึงไม่ได้กดออกรายงานจริง คอลัมน์ของรายงานอ้างอิงจากการวิเคราะห์ Bundle (`columns.json`)
- Dashboard บางหน้าต้องเลือก Organization ก่อนจึงจะแสดงกราฟ จึงเห็นเฉพาะช่อง Filter

---

## 1. ภาพรวมการใช้งาน (Global)

| หัวข้อ | รายละเอียด |
|---|---|
| เมนูหลัก (admin) | Home, Manage User, Setup Data, Appraisal Item, Employee, Assignment, Appraisal, Vertical Force rank, Horizontal Force rank, Horizontal Force rank (Board), Import Salary, Dashboard, Report, Feedback, Feedback Report |
| หน้า Home | แสดงข้อมูลองค์กรจาก Company: **Core Value & Culture**, **SWOT Analysis**, **Vision**, **Mission** (มาจาก field `vision`, `mission`, `core_values`, `swot` ของ Company) |
| Profile | Username, First/Last Name, E-Mail, Role, Password (toggle visibility), LDAP, Active, ปุ่ม SAVE / CANCEL |
| รูปแบบหน้าจอรายการ | ตาราง + ช่อง Search + Per Page + Pagination (first / prev / pages / next / last) + ไอคอน Add / Edit / Delete ต่อแถว |
| ฟอร์มเพิ่มข้อมูล | Dialog พร้อมปุ่ม **SAVE**, **SAVE & ADD ANOTHER**, **CANCEL** และ Dropdown แบบค้นหาได้ (Autocomplete) |
| Filter | ปุ่ม FILTER เปิดแผงตัวกรอง (ช่องที่มี * คือบังคับ) พร้อมปุ่ม SEARCH / CANCEL / Clear |
| Import / Export | หลายหน้ามี EXPORT, IMPORT และ DOWNLOAD (Template) |
| ภาษา | ไทย / อังกฤษ (เลือกตอน Login) |
| Idle timeout | 30 นาที |

## 2. Manage User

### 2.1 Role
- รายการ: `# · Role Name · Company · Active · Action` และ Action ต่อแถวมี **Assign Role**, Edit, Delete
- ฟอร์ม Add Role: Role Name*, Company*, **Admin** (checkbox), Active
- **Assign Role** มี 4 แท็บ
  | แท็บ | เนื้อหา |
  |---|---|
  | Data Access | เมทริกซ์ตาม Appraisal Type (Corporate, Individual) × ขอบเขตข้อมูล: **All Company, Specific Company, Specific Org, Org Hierarchy, Own Org** |
  | Position Group Level Access | เลือกระดับกลุ่มตำแหน่งที่เห็นได้ (เช่น ระดับพนักงาน, ระดับผู้บริหาร) |
  | Page Access | หน้าระบบ 43 หน้า × สิทธิ์ **All / View / Add / Edit / Delete** |
  | Assign User | เลือกผู้ใช้ที่อยู่ใน Role นี้ |
- รายชื่อหน้าใน Page Access: Appraisal, Appraisal Criteria, Appraisal Item, Assignment, Company, Competency Score, Branch Performance, Overall Performance, Performance Comparison, Performance Trend, Employee, Feedback, Feedback Report, Force Rank Group, forcedRank, Form, Grade Criteria, horizontalBoard, horizontalForceRank, Import Salary, KPI Type, Level, Level Group, Organization, Perspective, Position, Position Group, Appraisal Summary, Appraisal Summary Report by Job KPI, Appraisal Summary By Level, Appraisal Summary By Org, Bonus Salary, Data Entry Status, KPI Summary, Performance Form, Role, Structure, Threshold Group, UOM, Usage Log, User, verticalForceRank

### 2.2 Users
- รายการ: `# · UserName · First Name · Last Name · Active · Action`
- ฟอร์ม: UserName*, First Name*, Last Name*, Email Address*, Password*, Confirm Password*, Role, **LDAP** (ใช้ AD แทนรหัสผ่านในระบบ), Active

## 3. Setup Data

| เมนู | คอลัมน์ในรายการ | ช่องในฟอร์ม Add / Edit |
|---|---|---|
| Appraisal Criteria | Criteria Name, Company, Effective Date (ไม่มี Add มีเฉพาะ Edit) | Criteria Name*, Company*, Appraisal Type*, Effective Date* และ **ตารางน้ำหนัก: Level Group × Structure** (Company Performance / Project Performance / Individual Performance / Competency) เช่น ระดับบริษัท 100/0/0/0, ระดับฝ่ายงาน 0/100/0/0 |
| Company | Company Code, Company Name, Line Business, Active | Company Code*, Company Name*, Line Business*, Parent company, Active (และข้อมูล Vision / Mission / Core Values / SWOT ซึ่งแสดงในหน้า Home) |
| Competency Score | แสดงหลังเลือก Filter: Company, Competency Score Group | คะแนนและคำอธิบายระดับของแต่ละกลุ่ม |
| Form | Form Name, Company, Appraisal Year, Start Date, End Date | Form Name*, Company*, Appraisal Year*, **Result Type***, Start Date*, End Date*, **Budget Salary**, **Budget Bonus**, **Is Force Rank** |
| KPI Type | KPI Type Name, Company Name, Active | KPI Type Name*, Company*, Active |
| Level | Seq No, Appraisal Level, Appraisal Type, Parent Name, Company Name, Active (ประมาณ 17 หน้า) | Seq No*, Level Name*, Appraisal Type*, Company*, Parent Level, **Level Group***, **Midpoint***, **Position Group***, **Tag***, **District**, Active |
| Level Group | Level Group Name, Company, Active, Is_VFR | Level Group Name*, Company*, **Appraisal Type***, Active, **Is_VFR** (ใช้ Vertical Force Rank) |
| Organization | Code, Organization Name, Company, Level, Effective Date (ประมาณ 27 หน้า) | Code*, Organization Name*, Company*, Parent Code, Level*, **Abbreviation**, **E-Mail**, Effective Date*, **Province**, **Channel**, **Force Rank Group Name** |
| Perspective | Perspective Name, Abbreviation, Company Name, Color, Active | Perspective Name*, Abbreviation*, Company*, Color*, Active |
| Position | Code, Position Name, Company, Effective Date (ประมาณ 49 หน้า) | Code*, Position Name*, Company*, Effective Date* |
| Position Group | Position Group Code, Position Group Name, Company, Active | Position Group Code*, Position Group Name*, Company*, **Position Group Level*** (ระดับพนักงาน / ผู้บริหาร), Active |
| Structure | Seq No, Structure Name, Company, Target Score, Structure Type, Active (มี 4 Structure) | Structure Name*, Company*, Structure Type*, Target Score*, **Stage** (Default stage), **Permission**, Order Seq*, **Self Delete Comment**, **Feedback**, Active และ Flag ใน API: `is_get_zero`, `is_unlimited`, `is_threshold`, `comment_score` |
| Threshold Group | Threshold Group, Company, Effective Date | Threshold Group*, Company*, **Result Type***, Effective Date* และตารางช่วงคะแนน **Start / End / Color** |
| UOM | UOM, Company, Is Date, Active | UOM*, Company*, Is Date, Active |
| Grade Criteria | Grade Criteria Name, Company, Effective Date | Appraisal Type, Grade Criteria Name*, Company*, Effective Date*, **Level Group** และตาราง **Grade · Grade Condition · Begin Score · End Score · % Salary Raise · Percent Budget (ต้องรวม 100) · Bonus Month** |
| Force Rank Group | Force Rank Group Name, Company, Effective Date | Force Rank Group Name*, Company*, Effective Date* และตาราง **Grade · Percent Budget** |

## 4. Appraisal Item (KPI Library)

- หน้าจอแบ่งเป็น 4 แผงตาม Structure: **Company Performance, Project Performance, Individual Performance, Competency** และแต่ละแผงมี Add / Edit / Delete
- ปุ่มระดับหน้า: EXPORT, IMPORT, DOWNLOAD (Template), FILTER และแสดง Line Business / Company ที่เลือก
- คอลัมน์: `# · Perspective · Item Code · Appraisal Item Name · Effective Date · Action` (แผง Competency ใช้ Competency Name)
- **ฟอร์ม KPI** (Company / Project / Individual Performance): Appraisal Item Code*, Appraisal Item Name*, KPI Type, **Parent KPI**, UOM*, Perspective*, **Function Type***, **Value Type***, **Performance Level***, Description, **Is Show Variance**, **Prorate**, **Sum Up**, Effective Date*
- **ฟอร์ม Competency**: Appraisal Item Code*, Appraisal Item Name*, **Competency Type***, **Proficiency Level***, Effective Date*

## 5. Employee
- Filter: Company, Employee Level, Organization, Position, Employee Name
- ปุ่ม: EXPORT, IMPORT, DOWNLOAD (Template), FILTER, Search และรองรับข้อมูลประมาณ 99 หน้า × 10 รายการ
- รายละเอียดพนักงานเปิดที่ `/employee/:id` และเพิ่มใหม่ที่ `/employee/add`

## 6. Assignment (มอบหมาย KPI)

### 6.1 รายการ (Individual / Corporate)
- Filter Individual: Company*, Form*, Structure, Status, Level Group, Organization, Position, Employee
- Filter Corporate: Company*, Form*, Structure, Status, Level Group, Organization
- แสดงเป็น **การ์ดต่อพนักงาน**: รูป, ชื่อ, รหัส, หน่วยงาน, Level (Level Group), ตำแหน่ง และ **Chip ของแต่ละ Structure ที่มีสีตามสถานะ**
- การ์ดมี Checkbox สำหรับเลือกหลายรายการ และเมนู ⋮ ที่มี **Edit, Copy, Delete**
- ปุ่มระดับหน้า: EXPORT, IMPORT, FILTER, SELECT ALL, ACTION (เปลี่ยนสถานะทีละหลายคน), ASSIGN, DELETE

### 6.2 หน้าแก้ไข Assignment (`/assignment/:id`)
- Header: ข้อมูลพนักงาน, Form และช่วงวันที่ และ **Total Score แสดงทั้งสเกล 100 และสเกล 5** เช่น `71.20 (3.56) / 100.00 (5.00)`
- **แท็บตาม Structure** ที่ใช้กับพนักงานคนนั้น (เช่น PROJECT PERFORMANCE / INDIVIDUAL PERFORMANCE) และแสดง Structure Weight ของแต่ละแท็บ
- Assign Date* / Assignment End Date*
- ตาราง KPI: `KPI Code · KPI Name (ไอคอน info) · Frequency (Monthly / Quarterly / Yearly) · UOM · %Weight · Deployable · Adoptable · Action (ลบ)`
- **ขยายแถว KPI แล้วกำหนดเป้าหมายรายงวด**: ตารางงวด (เช่น QTR 1–4 หรือ Jan–Dec) × **ระดับคะแนน 1–5** (แถบสีแดง → เขียวเข้ม) เช่น KPI "จำนวนรายการปรับปรุง Audit" มีระดับ 1 = 4, 2 = 3, 3 = 2, 4 = 1, 5 = 0 พร้อมปุ่ม **APPLY ALL** (ใช้ค่าเดียวกันทุกงวด) และช่อง **Reject Reason**
- Add KPI / Remove KPI, **Total %Weight**, **Action** (เปลี่ยน Stage), SAVE / CANCEL

## 7. Appraisal (ประเมินผล)

### 7.1 รายการ
- Filter: Appraisal Type* (Corporate / Individual), Company*, Form*, Structure, **Status**, Level Group, Organization, Position, Employee Name
- การ์ดพนักงานแบบเดียวกับ Assignment โดย Chip ของ Structure มีสีตามสถานะ และไอคอนดินสอใช้เปิดหน้าประเมิน
- ปุ่มระดับหน้า: SELECT ALL, ACTION (ทำรายการทีละหลายคน), FILTER

### 7.2 หน้าประเมิน (`/appraisal/:id`)
- Header: ข้อมูลพนักงาน, Form และ **Total Score (สเกล 100 และ 5)**
- แท็บตาม Structure แต่ละแท็บมี:
  - ปุ่ม **ACTION TO**: กำหนดลำดับผู้ประเมินหรือผู้อนุมัติ (Seq No*, Position Group*, Employee*, Position*, Organization*)
  - ปุ่ม **SUM UP**: ดึงหรือรวมผลจาก KPI ระดับล่างที่ Deploy ไว้
  - **Score ของ Structure** (สเกล 100 และ 5), Structure Weight, Assign Date และไอคอนเครื่องคิดเลข (Calculate)
  - ตาราง KPI: `Perspective · KPI Name · Frequency · Target Value · UOM · Actual Value · Score · %Weight · Weight Score · Waive`
  - **Waive** (สวิตช์ยกเว้น KPI ไม่ให้นับคะแนน)
  - ไอคอนต่อ KPI: ข้อมูล KPI (i) และเอกสาร
  - ขยายแถวแล้วเห็น **Actual Value รายเดือน Jan–Dec**
- ท้ายหน้า: **Action** (Dropdown ที่แสดงเฉพาะ Transition ที่ทำได้จาก Stage ปัจจุบัน), **Remark**, SAVE / CANCEL

### 7.3 Workflow Stage (จากตัวเลือก Status และ Action)
ทุก Structure ประเภท KPI (Company / Project / Individual Performance) มี 11 สถานะ:

| ลำดับ | สถานะ |
|---|---|
| 1 | อนุมัติหัวข้อ (Approve Item) |
| 2 | ทบทวนหัวข้อ (Reject Item) |
| 3 | บันทึกร่างผลการประเมิน (Save Draft Actual) |
| 4 | ส่งอนุมัติผลการประเมิน (Review Actual) |
| 5 | อนุมัติผลการประเมิน (Approve Actual) |
| 6 | ไม่อนุมัติผลการประเมิน (Reject Actual) |
| 7 | แอดมินอนุมัติผลการประเมิน (Admin Approve Actual) |
| 8 | แอดมินปฏิเสธผลการประเมิน (Admin Reject Actual) |
| 9 | แอดมินขอแก้ไขหัวข้อ (Admin Reject Item) |
| 10 | ขอปรับปรุงผลการประเมิน (Re-Work) |
| 11 | ปิดการประเมินผล (End to Vertical) |

- Competency มีสถานะแยก: รอการประเมิน (Appraisal), Save Draft Appraisal, Submit, Approve, Reject, Admin Reject Item, End to Vertical, Re-Work
- สถานะเพิ่มเติม: **End to Horizontal Director** ของแต่ละ Structure (ส่งเข้าขั้น Horizontal Force Rank)
- ค่าตั้งของ Stage ใน API: `approval_seq`, `to_stage_id`, `to_action`, `assessor_group_id`, `position_group_id`, `is_email` (ส่งอีเมล), `is_assign`, `is_appraisal`, `is_input_data` (ให้กรอกผลได้), `due_date`, `is_vfr`

## 8. Force Rank (Calibration)

| หน้า | Filter | การทำงาน |
|---|---|---|
| Vertical Force rank | Company*, Form*, **Force Rank Group*** (ผูกกับหน่วยงาน) | ตาราง **Grade · Budget (%) · Amount** (แก้ไขได้) + กราฟ 2 ชุด + ปุ่ม **FORCE RANK** (คำนวณ), SAVE, CANCEL |
| Horizontal Force rank (Director) | Company*, Form*, **Level Group***, Organization | เหมือน Vertical แต่จัดกลุ่มตาม Level Group (API `force_rank_horizon?...&groupBy`) |
| Horizontal Force rank (Board) | Company*, Form*, Level Group*, Organization | มุมมองบอร์ดสำหรับ Committee |

- **เกรดของระบบเดิมมี 5 ระดับ**: **FE‹S›, EE‹A›, FM‹B›, PM‹C›, NM‹D›** (Far Exceeds / Exceeds / Fully Meets / Partially Meets / Not Meet Expectation)
- API ที่เกี่ยวข้อง: `adjust/grade_and_count_force_rank`, `adjust?company_id&level_group_id&form_id`, `force_rank_vertical`, `force_rank_horizon`

## 9. Import Salary
- ส่วน **IMPORT**: Browse หรือลากไฟล์มาวาง
- ส่วน **EXPORT**: ส่งออกข้อมูลเงินเดือนหรือ Template

## 10. Dashboard

| หน้า | Filter (* = บังคับ) |
|---|---|
| Overall Performance | Company*, Appraisal Type*, Form*, Structure*, Level Group, Organization*(Corporate), Position, Employee Name |
| Performance Comparison | Company*, Appraisal Type*, Form*, Structure*, Level Group, Organization, Position, Employee Name |
| Performance Trend | Company*, Appraisal Type*, Form*, Structure*, Level Group, Organization*, Position, Employee, **KPI*** |
| Branch Performance | ไม่มีสิทธิ์เข้าถึงด้วยบัญชี admin |

## 11. Report (สร้างที่ Server แล้วส่งไฟล์กลับ)

| รายงาน | Filter | หมายเหตุ |
|---|---|---|
| Appraisal Summary | Company*, Form*, Level Group, Organization, Position, Employee | POST `report/report_appraisal_summary` (body: appraisal_type_id, parameters, format, locale) |
| Appraisal Summary By Org | Company*, Form*, Level Group, Organization, **Format*** | เลือกรูปแบบไฟล์ได้ |
| Appraisal Summary By Level | Company*, Form*, Level Group, Organization, Format* | |
| Appraisal Summary Report by Job KPI | Company*, Form*, Structure*, KPI, Format* | |
| KPI Summary | Appraisal Type*, Company*, Form*, Level Group, Organization, Position, Employee, Format* | |
| Performance Form | Appraisal Type*, Company*, Form*, Level Group, Organization, Position, Employee, Format* | |
| Bonus Salary | Company*, Form*, Level Group, Organization, Position, Employee | |
| Usage Log | Start Date, End Date, Action* | |
| Data Entry Status | ไม่มีสิทธิ์เข้าถึงด้วยบัญชี admin | |

## 12. Coaching & Feedback
- **Coaching and Feedback**: Filter Appraisal Year*, Form*, Employee*, Position*
- **Feedback Report**: Filter Appraisal Year*, Form*, Organization*
- Structure มี Flag `is_feedback` ที่กำหนดว่า Structure ไหนเปิดให้ Feedback ได้

## 13. API Catalogue (GET ที่พบระหว่างสำรวจ: 89 endpoints)
Base: `/syntec_api/public/api`

- **Master data:** `role`, `role/dropdown`, `role/{id}/assignment`, `user/search`, `user/dropdown`, `user/role/dropdown`, `company`, `company/{id}`, `company/dropdown`, `company/{id}/structures`, `company/{id}/structures/items`, `criteria`, `criteria/{id}`, `criteria/datatable?company_id&appraisal_type_id`, `form`, `form/dropdown`, `kpi_type`, `kpi_type/dropdown`, `level`, `level/dropdown`, `level/tags`, `level/org/dropdown`, `level/emp/dropdown`, `level_group`, `level_group/dropdown`, `org`, `org/dropdown`, `perspective`, `perspective/dropdown`, `position`, `position/dropdown`, `position_group`, `position_group/dropdown`, `structure`, `structure_type/dropdown`, `threshold_group`, `uom`, `uom/dropdown`, `grade_criteria`, `force_rank_group`, `employee`, `employee/dropdown`, `item/dropdown`, `item/tags`, `competency_score/dropdown`
- **Value lists:** `value_list/{access_type | position_group_level | appraisal_type | result_type | grade_list | value_type | function_type | competency_type | assessor_group | frequency_type}`, `dropdown/{channel | province | appraisal_type | company | structure | form | assignment_status | level_group | org | position | employee | force_rank_group}`
- **Settings dropdowns:** `ldap_server/dropdown`, `password_policy/dropdown`, `email_server/dropdown`
- **Assignment:** `assignment/individual`, `assignment/corporate`, `assignment/{id}`
- **Appraisal:** `appraisal`, `appraisal/{id}`, `appraisal/dropdown/{appraisal_type | company | form | structure | appraisal_status | level_group | org | position | employee}`
- **Force rank:** `adjust`, `adjust/grade_and_count_force_rank`, `force_rank_vertical`, `force_rank_horizon`
- **Dashboard:** `dashboard_performace_trend/item/dropdown`

**Data model ที่เห็นจาก JSON**
- `result` (1 แถวต่อพนักงานต่อ Form): result_score, total_score, force_rank_index, grade_id, threshold_group_id, criteria_id
- `result_structure` (ต่อ Structure): score, weight_percent, weight_score, sum_score, sum_weight_*, full_score, current_stage, stage[]
- `result_item`, `competency_score`, `assessor_stage`, `assessor_score`, `parent_score` (คะแนนจากระดับบนสำหรับ Adopt / Sum up)
- `emp_detail.action_to[]`: ลำดับผู้ประเมิน (assessor_group, seq_no, position group, employee)
- `form`: result_type, budget_salary, budget_bonus, is_force_rank

---

## 14. Gap Analysis: SEE KPI เดิม เทียบกับ seekpi-2

| # | ฟังก์ชันในระบบเดิม | seekpi-2 ตอนนี้ | ระดับ | สิ่งที่ต้องทำ |
|---|---|---|---|---|
| 1 | **เป้าหมาย 5 ระดับต่อ KPI ต่องวด** (คะแนน 1–5 ตามค่าเป้าแต่ละระดับ, APPLY ALL) | ใช้ Achievement % เทียบ Threshold Group กลาง | **สูงมาก** | เพิ่มตาราง `assignment_item_target(item, period, level 1–5)` และแก้สูตรคะแนนให้เทียบผลจริงกับ 5 ระดับ ส่วน Threshold Group ใช้เฉพาะ Structure ที่เปิด `is_threshold` |
| 2 | **เกรด 5 ระดับ FE / EE / FM / PM / NM** | A–E | สูง | ปรับ Seed และ UI ให้ใช้ชื่อเกรดตามระบบเดิม |
| 3 | **น้ำหนัก Structure แยกตาม Level Group** (4 Structure) | น้ำหนัก 70:30 แบบเดียว | สูง | ใช้ `criteria_structure_weight` ที่มีอยู่ใน Schema SQLite และทำหน้าจอเมทริกซ์ Level Group × Structure |
| 4 | **4 Structure**: Company / Project / Individual Performance + Competency | KPI / Competency / Deduct | สูง | ปรับ Seed และ Structure Type (ระบบเดิมของ Syntec ไม่ได้ใช้ Deduct ใน Config ปัจจุบัน แต่ระบบรองรับ) |
| 5 | **Workflow 11 สถานะต่อ Structure** + Competency + End to Horizontal Director, Action แสดงเฉพาะ Transition ที่ทำได้ | 5 สถานะแบบง่าย | สูง | ใช้ `workflow_stage` / `workflow_transition` และเพิ่ม Stage ต่อ Structure ให้ตรงกับรายการในข้อ 7.3 |
| 6 | **ACTION TO**: ลำดับผู้ประเมินหลายระดับ (assessor group) | ใช้ chief_employee_id | สูง | เพิ่มตาราง `assessor_chain` (result, seq, position_group, employee) |
| 7 | **Frequency** (Monthly / Quarterly / Yearly) + ผลรายเดือน Jan–Dec | มีเฉพาะผลรวม | สูง | ใช้ `assignment_item_actual` และเพิ่ม `frequency` ใน KPI |
| 8 | **Waive** KPI, **SUM UP**, **Deployable / Adoptable**, Parent KPI | มีเฉพาะใน Schema | กลาง | ทำ UI และ Logic |
| 9 | Total Score แสดง 2 สเกล (100 และ 5) | สเกล 100 | ต่ำ | เพิ่มการแสดงผล |
| 10 | Role: **Data Access 5 ระดับ** × Appraisal Type, Position Group Level Access, Admin flag, Assign User | Permission ต่อหน้าเท่านั้น | กลาง | เพิ่ม Data scope และ Position Group Level Access |
| 11 | ฟิลด์ Master data เพิ่มเติม (Level: Midpoint / Tag / District / Position Group; Org: Abbreviation / E-Mail / Province / Channel / Force Rank Group; Form: Result Type / Budget Salary / Budget Bonus / Is Force Rank; Item: Function Type / Value Type / Performance Level / Show Variance / Prorate / Sum Up; Competency: Competency Type / Proficiency Level; Threshold: Result Type + ช่วงสี; Grade: Level Group + Percent Budget) | ไม่มี | กลาง | เพิ่มฟิลด์ใน Schema และฟอร์ม |
| 12 | Force Rank: Budget (%) และ Amount ต่อเกรดแก้ไขได้, ปุ่ม FORCE RANK / SAVE, Vertical ตาม Force Rank Group ของหน่วยงาน | มีโหมดครบแต่ไม่มี Budget / Amount | กลาง | เพิ่มตาราง Budget และผูก Force Rank Group กับ Organization |
| 13 | หน้า Home: Vision / Mission / Core Values / SWOT | Tile เมนู | ต่ำ | เพิ่มฟิลด์ใน Company และแสดงที่ Home |
| 14 | EXPORT / IMPORT / DOWNLOAD Template (Item, Employee, Assignment) | มีเฉพาะ Salary CSV | กลาง | ทำ Import / Export Excel ตาม Template |
| 15 | รายงานเลือก Format (PDF / Excel) สร้างที่ Server | ตาราง + CSV | กลาง | สร้างไฟล์ด้วย ExcelJS / PDF |
| 16 | การ์ดพนักงาน + Chip สีตามสถานะ, Select All + ACTION แบบหลายรายการ, Copy Assignment | ตาราง | กลาง | ปรับ UI และเพิ่ม Bulk action และ Copy |
| 17 | Users: ฟิลด์ LDAP ต่อผู้ใช้ | ไม่มี | ต่ำ | ใช้ `auth_provider` ใน Schema |
| 18 | Coaching & Feedback ตาม Form / Position, ใช้ `is_feedback` ของ Structure | Feedback แบบง่าย | ต่ำ | ปรับ Filter และ Field |
| 19 | Usage Log Filter ตามช่วงวันที่ และ Action | แสดงล่าสุด 1,000 รายการ | ต่ำ | เพิ่ม Filter |
