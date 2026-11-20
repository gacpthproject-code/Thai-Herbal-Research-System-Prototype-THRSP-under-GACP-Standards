'use strict';

/**
 * Dataset domain registry — สัญญา C05F680149 ภาคผนวก 4 ข้อ 3
 * ชุดข้อมูลดิบ (API/CSV) + คู่มือการใช้ชุดข้อมูล สำหรับคลังข้อมูลวิจัยของโครงการ
 *
 * The single source for the export SELECT, the publishing rule of every cell,
 * the research basis each domain leaves under, and the data dictionary. Every
 * column of a source model is either a field below or a `withheld` entry with
 * its reason; scripts/datasets/check-dataset.js (K4) fails on any other.
 *
 * Field keys:
 *   field    column name in the file
 *   from     path into the source row (default: field), e.g. 'cycle.farmId'
 *   publish  how the value leaves (PUBLISH below); absent = as stored
 *   values   the closed set the write path enforces, for the dictionary
 *   joins    the domain.field the value joins to, for the dictionary
 */

const { HARVEST_BATCH_STATUSES } = require('../../shared/harvest-batch-statuses');
const { REGIONS, TARGET_GROUPS, QUESTION_TYPES } = require('../../shared/survey-vocabulary');
const { CULTIVATION_ACTIVITY_TYPES } = require('../../shared/cultivation-activity-types');

/** Why a domain may leave at all (operator order 49). */
const RESEARCH_BASIS = Object.freeze({
    // the applicant's working records: only while a dated ruling in research-use-bases.js is in force
    FARM_OPERATION: 'FARM_OPERATION',
    // survey answers: per row, consented under an accepted notice version and not withdrawn
    RESEARCH_CONSENT: 'RESEARCH_CONSENT',
    // questions written by staff: no personal data
    SURVEY_STRUCTURE: 'SURVEY_STRUCTURE',
});

const PUBLISH = Object.freeze({
    PSEUDONYM: 'pseudonym',
    ROUTE_TEMPLATE: 'routeTemplate',
    BANGKOK_DATE: 'bangkokDate',
    FREE_TEXT: 'freeText',
    REGION: 'region',
    PROVINCE: 'province',
    FREE_TEXT_LIST: 'freeTextList',
});

/**
 * Notice versions a survey answer may have been consented under to leave
 * (order 49 Q3: v3 only). A new notice version joins this list only with the
 * operator's approval; a unit test fails while the live notice is missing here.
 */
const ACCEPTED_RESEARCH_CONSENT_VERSIONS = Object.freeze(['research-survey-notice-th-v3']);

/**
 * Public trace doors that record a TraceQrScan (routes/api/trace). A scan's
 * stored path carries a real lot, batch or QR code; the export publishes the
 * template it matched instead. No two templates match the same path.
 */
const TRACE_SCAN_ROUTES = Object.freeze([
    '/api/trace/verify/:entityType/:entityId',
    '/api/trace/batch/:batchId',
    '/api/trace/lot/:lotId',
    '/api/trace/plot-cycle/:qrCode',
    '/api/trace/:qrCode',
]);

const W = Object.freeze({
    organization: 'รหัสองค์กรจริง ไฟล์ทั้งชุดมาจากองค์กรของผู้ส่งออกองค์กรเดียวอยู่แล้ว',
    updatedAt: 'เวลาแก้ไขรายการล่าสุด เป็นเวลาทำงานในระบบ ไม่ใช่ข้อมูลการผลิต',
    staffTime: 'เวลาทำงานของเจ้าหน้าที่ ไม่ใช่ข้อมูลวิจัย',
    actor: 'รหัสบัญชีผู้ใช้ที่บันทึกหรือแก้ไข ชี้ตัวบุคคล',
    notes: 'ข้อความอิสระยาวที่อาจมีชื่อคน ที่อยู่ หรือเบอร์โทร',
    file: 'ที่อยู่ไฟล์หรือรูปภาพ อาจเห็นหน้าคน ป้ายชื่อ หรือพิกัด',
    deletion: 'สถานะการลบในระบบ',
});

const DATASET_DOMAINS = [
    {
        key: 'cultivation-logs',
        model: 'CultivationLog',
        basis: RESEARCH_BASIS.FARM_OPERATION,
        thaiName: 'บันทึกกิจกรรมการเพาะปลูก',
        description: 'บันทึกกิจกรรมรายรอบปลูกหรือรายแปลงตาม GACP หมวดการจัดการการผลิต (ให้น้ำ ใส่ปุ๋ย กำจัดศัตรูพืช ฯลฯ) พร้อมสภาพอากาศขณะปฏิบัติงาน',
        rowMeaning: 'กิจกรรมหนึ่งครั้งที่ผู้ปลูกบันทึกในรอบปลูกหนึ่งรอบ ที่รอบปลูกและฟาร์มยังไม่ถูกลบ',
        where: { cycle: { isDeleted: false, farm: { isDeleted: false } } },
        fields: [
            { field: 'id', publish: PUBLISH.PSEUDONYM, thaiName: 'รหัสรายการ', unit: null, description: 'รหัสของบันทึก' },
            { field: 'createdAt', publish: PUBLISH.BANGKOK_DATE, thaiName: 'วันที่บันทึก', unit: 'YYYY-MM-DD (เวลาไทย)', description: 'วันที่สร้างรายการในระบบ ไม่มีเวลาของวัน' },
            { field: 'cycleId', publish: PUBLISH.PSEUDONYM, joins: 'harvest-batches.cycleId', thaiName: 'รหัสรอบปลูก', unit: null, description: 'รหัสรอบการปลูก' },
            { field: 'farmId', from: 'cycle.farmId', publish: PUBLISH.PSEUDONYM, joins: 'harvest-batches.farmId', thaiName: 'รหัสฟาร์ม', unit: null, description: 'รหัสฟาร์มของรอบปลูก' },
            { field: 'plotId', publish: PUBLISH.PSEUDONYM, thaiName: 'รหัสแปลงย่อย', unit: null, description: 'รหัสแปลงย่อย (ค่าว่าง = กิจกรรมทั้งรอบปลูก)' },
            { field: 'logDate', publish: PUBLISH.BANGKOK_DATE, thaiName: 'วันที่ทำกิจกรรม', unit: 'YYYY-MM-DD (เวลาไทย)', description: 'วันที่กิจกรรมเกิดขึ้นจริง ไม่มีเวลาของวัน' },
            { field: 'scope', publish: PUBLISH.FREE_TEXT, thaiName: 'ขอบเขต', unit: null, description: 'CYCLE = ทั้งรอบปลูก, PLOT = รายแปลง' },
            {
                field: 'logType',
                publish: PUBLISH.FREE_TEXT,
                thaiName: 'ประเภทกิจกรรม',
                unit: null,
                description: `ประตูบันทึกกิจกรรมของหน้าจอรับ ${CULTIVATION_ACTIVITY_TYPES.join(', ')} ส่วนประตูเก่า /api/cultivation-logs รับค่าอื่นได้ (ค่าเริ่มต้น OBSERVATION) คอลัมน์นี้จึงเป็นข้อความอิสระ`,
            },
            { field: 'productName', publish: PUBLISH.FREE_TEXT, thaiName: 'ชื่อผลิตภัณฑ์ที่ใช้', unit: null, description: 'ชื่อปุ๋ยหรือสารที่ใช้ในกิจกรรม' },
            { field: 'quantity', thaiName: 'ปริมาณ', unit: 'ตามคอลัมน์ unit', description: 'ปริมาณที่ใช้' },
            { field: 'unit', publish: PUBLISH.FREE_TEXT, thaiName: 'หน่วยของปริมาณ', unit: null, description: 'เช่น ลิตร, กก., ml' },
            { field: 'method', publish: PUBLISH.FREE_TEXT, thaiName: 'วิธีการ', unit: null, description: 'เช่น หยอด ฉีดพ่น รดน้ำ' },
            { field: 'area', thaiName: 'พื้นที่', unit: 'ไร่', description: 'พื้นที่ที่ทำกิจกรรม' },
            { field: 'temperature', thaiName: 'อุณหภูมิ', unit: '°C', description: 'อุณหภูมิขณะทำกิจกรรม' },
            { field: 'humidity', thaiName: 'ความชื้นสัมพัทธ์', unit: '%', description: 'ความชื้นขณะทำกิจกรรม' },
            { field: 'weather', publish: PUBLISH.FREE_TEXT, thaiName: 'สภาพอากาศ', unit: null, description: 'เช่น SUNNY, CLOUDY, RAINY' },
        ],
        withheld: [
            { column: 'CultivationLog.updatedAt', reason: W.updatedAt },
            { column: 'CultivationLog.notes', reason: W.notes },
            { column: 'CultivationLog.photoUrl', reason: W.file },
            { column: 'CultivationLog.attachmentIds', reason: 'รหัสไฟล์แนบจริง ชี้ไปยังรูปหรือเอกสารของผู้ปลูก' },
            { column: 'CultivationLog.recordedBy', reason: W.actor },
            { column: 'CultivationLog.performedBy', reason: 'ชื่อบุคคลผู้ลงมือทำงานในแปลง' },
            { column: 'CultivationLog.organizationId', reason: W.organization },
        ],
    },
    {
        key: 'harvest-batches',
        model: 'HarvestBatch',
        basis: RESEARCH_BASIS.FARM_OPERATION,
        thaiName: 'รุ่นเก็บเกี่ยว',
        description: 'ข้อมูลดิบการเก็บเกี่ยวและแปรรูปต่อรุ่นผลิต: น้ำหนักสด แห้ง สูญเสีย ความชื้น เกรด และค่าการอบแห้ง',
        rowMeaning: 'การเก็บเกี่ยวหนึ่งรุ่นของฟาร์มหนึ่งแห่ง ที่รุ่น ฟาร์ม และรอบปลูก (ถ้าผูกไว้) ยังไม่ถูกลบ',
        where: { isDeleted: false, farm: { isDeleted: false }, OR: [{ cycleId: null }, { cycle: { isDeleted: false } }] },
        fields: [
            { field: 'id', publish: PUBLISH.PSEUDONYM, joins: 'trace-scans.scannedEntityId', thaiName: 'รหัสรุ่น', unit: null, description: 'รหัสของรุ่นเก็บเกี่ยว' },
            { field: 'batchNumber', publish: PUBLISH.PSEUDONYM, thaiName: 'เลขรุ่นผลิต', unit: null, description: 'เลขรุ่นที่พิมพ์บนฉลากเพื่อตรวจสอบย้อนกลับ' },
            { field: 'cycleId', publish: PUBLISH.PSEUDONYM, joins: 'cultivation-logs.cycleId', thaiName: 'รหัสรอบปลูก', unit: null, description: 'รหัสรอบปลูกต้นทาง (ค่าว่าง = ไม่ได้ผูกรอบปลูก)' },
            { field: 'farmId', publish: PUBLISH.PSEUDONYM, joins: 'cultivation-logs.farmId', thaiName: 'รหัสฟาร์ม', unit: null, description: 'รหัสฟาร์ม' },
            { field: 'plantCode', thaiName: 'รหัสพืช', unit: null, description: 'รหัสชนิดสมุนไพรจากทะเบียนพืชของระบบ เช่น CAN (กัญชา)' },
            { field: 'harvestDate', publish: PUBLISH.BANGKOK_DATE, thaiName: 'วันที่เก็บเกี่ยว', unit: 'YYYY-MM-DD (เวลาไทย)', description: 'วันเก็บเกี่ยวจริง ไม่มีเวลาของวัน หน้าตรวจสอบย้อนกลับสาธารณะของรุ่นแสดงวันเดียวกันพร้อมน้ำหนักสด' },
            { field: 'freshWeight', thaiName: 'น้ำหนักสด', unit: 'กก.', description: 'น้ำหนักหลังเก็บเกี่ยวทันที ค่าเดียวกับที่หน้าตรวจสอบย้อนกลับสาธารณะของรุ่นแสดง' },
            { field: 'dryWeight', thaiName: 'น้ำหนักแห้ง', unit: 'กก.', description: 'น้ำหนักหลังอบหรือตากแห้ง' },
            { field: 'lossWeight', thaiName: 'น้ำหนักสูญเสีย', unit: 'กก.', description: 'ส่วนที่สูญเสียระหว่างแปรรูป' },
            { field: 'moistureContent', thaiName: 'ความชื้นผลผลิต', unit: '%', description: 'ความชื้นที่วัดได้หลังแปรรูป' },
            { field: 'qualityGrade', publish: PUBLISH.FREE_TEXT, thaiName: 'เกรดคุณภาพ', unit: null, description: 'เช่น A, B, C, REJECT' },
            { field: 'isDried', thaiName: 'อบแห้งแล้ว', unit: 'boolean', description: 'สถานะการอบแห้ง' },
            { field: 'dryingMethod', publish: PUBLISH.FREE_TEXT, thaiName: 'วิธีอบแห้ง', unit: null, description: 'เช่น SUN_DRY, OVEN_DRY, DEHUMIDIFIER' },
            { field: 'dryingTemp', thaiName: 'อุณหภูมิอบ', unit: '°C', description: 'อุณหภูมิที่ใช้อบแห้ง' },
            { field: 'dryingDuration', thaiName: 'ระยะเวลาอบ', unit: 'ชั่วโมง', description: 'จำนวนชั่วโมงที่อบ' },
            { field: 'qcPassed', thaiName: 'ผ่าน QC', unit: 'boolean', description: 'ผลตรวจคุณภาพภายในฟาร์ม' },
            { field: 'status', values: HARVEST_BATCH_STATUSES, thaiName: 'สถานะรุ่น', unit: null, description: 'สถานะของรุ่นในการแปรรูปและจำหน่าย' },
            { field: 'createdAt', publish: PUBLISH.BANGKOK_DATE, thaiName: 'วันที่บันทึก', unit: 'YYYY-MM-DD (เวลาไทย)', description: 'วันที่สร้างรายการในระบบ ไม่มีเวลาของวัน' },
        ],
        withheld: [
            { column: 'HarvestBatch.uuid', reason: 'รหัสจริงชุดที่สองของรุ่นเดียวกัน ใช้ id แบบรหัสแฝงแทน' },
            { column: 'HarvestBatch.updatedAt', reason: W.updatedAt },
            { column: 'HarvestBatch.qrCode', reason: 'รหัส QR จริงที่พิมพ์บนฉลาก สแกนแล้วพาไปยังฟาร์มได้' },
            { column: 'HarvestBatch.trackingUrl', reason: 'ที่อยู่หน้าสาธารณะที่มีรหัสจริงของรุ่น' },
            { column: 'HarvestBatch.qcNotes', reason: W.notes },
            { column: 'HarvestBatch.qcBy', reason: W.actor },
            { column: 'HarvestBatch.recordedBy', reason: W.actor },
            { column: 'HarvestBatch.notes', reason: W.notes },
            { column: 'HarvestBatch.isDeleted', reason: 'ใช้คัดแถวเท่านั้น แถวที่ลบแล้วอยู่ในรายการรุ่นที่ถูกลบ' },
            { column: 'HarvestBatch.organizationId', reason: W.organization },
            { column: 'HarvestBatch.backdatedCertificateId', reason: 'เครื่องหมายบันทึกย้อนหลังสำหรับเจ้าหน้าที่สุ่มตรวจ (คำสั่ง 129(5)(b)) ไม่ใช่ข้อมูลการผลิต' },
        ],
    },
    {
        key: 'trace-scans',
        model: 'TraceQrScan',
        basis: RESEARCH_BASIS.FARM_OPERATION,
        thaiName: 'เหตุการณ์สแกน QR ตรวจสอบย้อนกลับ',
        description: 'การสแกน QR สาธารณะต่อรายการตรวจสอบย้อนกลับ ตัดข้อมูลระบุตัวผู้สแกนออกทั้งหมด เก็บเฉพาะเหตุการณ์และผลการตรวจ',
        rowMeaning: 'การสแกน QR หนึ่งครั้งจากหน้าตรวจสอบสาธารณะ',
        where: {},
        fields: [
            { field: 'id', publish: PUBLISH.PSEUDONYM, thaiName: 'รหัสเหตุการณ์', unit: null, description: 'รหัสของการสแกน' },
            { field: 'createdAt', publish: PUBLISH.BANGKOK_DATE, thaiName: 'วันที่สแกน', unit: 'YYYY-MM-DD (เวลาไทย)', description: 'วันที่เกิดการสแกน ไม่มีเวลาของวัน' },
            { field: 'qrSecurityId', publish: PUBLISH.PSEUDONYM, thaiName: 'รหัส QR', unit: null, description: 'รหัสของรายการ QR ที่ถูกสแกน' },
            { field: 'scannedEntityType', from: 'qrSecurity.entityType', thaiName: 'ชนิดของสิ่งที่สแกน', unit: null, description: 'HARVEST_BATCH = รุ่นเก็บเกี่ยว, PACKAGING_LOT = ล็อตบรรจุ' },
            { field: 'scannedEntityId', from: 'qrSecurity.entityId', publish: PUBLISH.PSEUDONYM, joins: 'harvest-batches.id', thaiName: 'รหัสของสิ่งที่สแกน', unit: null, description: 'เมื่อชนิดเป็น HARVEST_BATCH ค่านี้ตรงกับ id ของรุ่นเก็บเกี่ยว' },
            {
                field: 'requestPath',
                publish: PUBLISH.ROUTE_TEMPLATE,
                values: TRACE_SCAN_ROUTES,
                thaiName: 'แม่แบบเส้นทางที่เรียก',
                unit: null,
                description: 'แม่แบบของ endpoint ที่ถูกเรียก ตัดรหัสล็อต รุ่น และ QR จริงออก (เส้นทางอื่นเป็นค่าว่าง)',
            },
            { field: 'verified', thaiName: 'ผลการตรวจลายเซ็น', unit: 'boolean', description: 'true = โซ่แฮชและลายเซ็นถูกต้อง ณ เวลาสแกน' },
        ],
        withheld: [
            { column: 'TraceQrScan.requestIp', reason: 'หมายเลข IP ของผู้สแกน ชี้ตัวบุคคลได้' },
            { column: 'TraceQrScan.userAgent', reason: 'ลายนิ้วมือของอุปกรณ์ผู้สแกน' },
            { column: 'TraceQrScan.verification', reason: 'รายละเอียดการตรวจที่มีรหัสจริงและค่าแฮชของรายการ ใช้ verified แทน' },
            { column: 'TraceQrScan.organizationId', reason: W.organization },
        ],
    },
    {
        key: 'survey-responses',
        model: 'SurveyAnswer',
        sourceModels: ['SurveyAnswer', 'SurveyResponse'],
        basis: RESEARCH_BASIS.RESEARCH_CONSENT,
        thaiName: 'คำตอบแบบสำรวจความต้องการ (1 แถวต่อ 1 คำตอบ)',
        description: 'คำตอบดิบจากแบบสำรวจความต้องการ 4 ภาค (ต้นแบบที่ 2) เฉพาะคำตอบที่ผู้ตอบยินยอมให้ใช้เพื่อการวิจัยตามข้อความรุ่นที่ยอมรับและยังไม่ถอนความยินยอม ไม่มีรหัสบัญชีผู้ตอบ',
        rowMeaning: 'คำตอบของผู้ตอบหนึ่งคนต่อคำถามหนึ่งข้อ',
        where: {
            response: {
                researchConsentAt: { not: null },
                researchConsentVersion: { in: [...ACCEPTED_RESEARCH_CONSENT_VERSIONS] },
                researchConsentWithdrawnAt: null,
            },
        },
        fields: [
            { field: 'responseId', publish: PUBLISH.PSEUDONYM, joins: 'survey-responses/withdrawn.responseId', thaiName: 'รหัสชุดคำตอบ', unit: null, description: 'รหัสของชุดคำตอบของผู้ตอบหนึ่งคน' },
            { field: 'templateId', from: 'response.templateId', publish: PUBLISH.PSEUDONYM, joins: 'survey-questions.templateId', thaiName: 'รหัสแบบสำรวจ', unit: null, description: 'รหัสของแบบสำรวจ' },
            { field: 'questionId', publish: PUBLISH.PSEUDONYM, joins: 'survey-questions.questionId', thaiName: 'รหัสคำถาม', unit: null, description: 'รหัสของคำถาม ข้อความคำถามอยู่ในชุด survey-questions' },
            { field: 'region', from: 'response.region', publish: PUBLISH.REGION, values: REGIONS, thaiName: 'ภูมิภาค', unit: null, description: '4 ภาคตามสัญญา นับผู้ตอบต่อแบบสำรวจ ค่าว่างตามกติกาช่องเล็กในคอลัมน์การปกปิด' },
            { field: 'province', from: 'response.province', publish: PUBLISH.PROVINCE, thaiName: 'จังหวัด', unit: null, description: 'จังหวัดของผู้ตอบ นับผู้ตอบต่อแบบสำรวจและภาค ค่าว่างเมื่อไม่ระบุ หรือตามกติกาช่องเล็กในคอลัมน์การปกปิด' },
            { field: 'respondentType', from: 'response.respondentType', values: TARGET_GROUPS, thaiName: 'กลุ่มผู้ตอบ', unit: null, description: 'กลุ่มเป้าหมายของแบบสำรวจ' },
            { field: 'submittedAt', from: 'response.submittedAt', publish: PUBLISH.BANGKOK_DATE, thaiName: 'วันที่ส่งคำตอบ', unit: 'YYYY-MM-DD (เวลาไทย)', description: 'วันที่ส่งคำตอบ ไม่มีเวลา เพื่อไม่ให้จับคู่กับเวลาใช้งานของผู้ตอบได้' },
            { field: 'valueText', publish: PUBLISH.FREE_TEXT, thaiName: 'คำตอบข้อความ', unit: null, description: 'คำตอบชนิดข้อความหรือตัวเลือก MULTI_CHOICE เป็น JSON array ในรูปข้อความ' },
            { field: 'valueNumber', thaiName: 'คำตอบตัวเลข', unit: 'ตามชนิดคำถาม', description: 'คำตอบชนิดคะแนน (1-5) หรือตัวเลข' },
        ],
        withheld: [
            { column: 'SurveyAnswer.id', reason: 'รหัสของคำตอบรายข้อ คู่ responseId กับ questionId ระบุแถวได้ครบแล้ว' },
            { column: 'SurveyAnswer.createdAt', reason: 'เวลาบันทึกละเอียดถึงวินาที ส่งเฉพาะวันที่ส่งคำตอบแทน' },
            { column: 'SurveyAnswer.organizationId', reason: W.organization },
            { column: 'SurveyResponse.id', reason: 'ส่งออกเป็นรหัสแฝงในคอลัมน์ responseId' },
            { column: 'SurveyResponse.createdAt', reason: 'เวลาบันทึกละเอียดถึงวินาที ส่งเฉพาะวันที่ส่งคำตอบแทน' },
            { column: 'SurveyResponse.updatedAt', reason: W.updatedAt },
            { column: 'SurveyResponse.respondentUserId', reason: 'รหัสบัญชีผู้ตอบ (คำสั่ง 34(5) ห้ามส่งออก)' },
            { column: 'SurveyResponse.respondentMarker', reason: 'รหัสกันตอบซ้ำที่คำนวณจากบัญชีผู้ตอบ' },
            { column: 'SurveyResponse.status', reason: 'คำตอบที่ส่งแล้วมีสถานะเดียว ไม่มีข้อมูลเพิ่ม' },
            { column: 'SurveyResponse.researchConsentVersion', reason: 'ใช้คัดแถว ทุกแถวที่ส่งออกยินยอมตามรุ่นที่ระบุใน manifest' },
            { column: 'SurveyResponse.researchConsentAt', reason: 'ใช้คัดแถว เวลายินยอมละเอียดถึงวินาที' },
            { column: 'SurveyResponse.researchConsentWithdrawnAt', reason: 'ใช้คัดแถว คำตอบที่ถอนแล้วหรือของบัญชีที่ถูกลบอยู่ในรายการคำตอบที่ถอน' },
            { column: 'SurveyResponse.organizationId', reason: W.organization },
        ],
    },
    {
        key: 'survey-questions',
        model: 'SurveyQuestion',
        sourceModels: ['SurveyQuestion', 'SurveyTemplate'],
        basis: RESEARCH_BASIS.SURVEY_STRUCTURE,
        thaiName: 'คำถามของแบบสำรวจ',
        description: 'ข้อความคำถาม ชนิด และตัวเลือกของทุกแบบสำรวจ ใช้แปลรหัสคำถามในชุดคำตอบ เป็นข้อความที่เจ้าหน้าที่เขียน ไม่มีข้อมูลส่วนบุคคล',
        rowMeaning: 'คำถามหนึ่งข้อของแบบสำรวจหนึ่งชุด',
        where: {},
        fields: [
            { field: 'questionId', from: 'id', publish: PUBLISH.PSEUDONYM, joins: 'survey-responses.questionId', thaiName: 'รหัสคำถาม', unit: null, description: 'รหัสของคำถาม' },
            { field: 'templateId', publish: PUBLISH.PSEUDONYM, joins: 'survey-responses.templateId', thaiName: 'รหัสแบบสำรวจ', unit: null, description: 'รหัสของแบบสำรวจ' },
            { field: 'templateCode', from: 'template.code', publish: PUBLISH.FREE_TEXT, thaiName: 'รหัสย่อแบบสำรวจ', unit: null, description: 'รหัสย่อที่เจ้าหน้าที่ตั้ง' },
            { field: 'templateTitle', from: 'template.title', publish: PUBLISH.FREE_TEXT, thaiName: 'ชื่อแบบสำรวจ', unit: null, description: 'ชื่อแบบสำรวจ' },
            { field: 'targetGroup', from: 'template.targetGroup', values: TARGET_GROUPS, thaiName: 'กลุ่มเป้าหมาย', unit: null, description: 'กลุ่มผู้ตอบของแบบสำรวจ' },
            { field: 'templateVersion', from: 'template.version', thaiName: 'รุ่นของแบบสำรวจ', unit: null, description: 'เลขรุ่นที่ระบบตั้ง' },
            { field: 'sortOrder', thaiName: 'ลำดับคำถาม', unit: null, description: 'ลำดับในแบบสำรวจ' },
            { field: 'section', publish: PUBLISH.FREE_TEXT, thaiName: 'หมวดคำถาม', unit: null, description: 'หมวดที่เจ้าหน้าที่จัดไว้ (ค่าว่าง = ไม่มีหมวด)' },
            { field: 'questionText', publish: PUBLISH.FREE_TEXT, thaiName: 'ข้อความคำถาม', unit: null, description: 'ข้อความคำถามตามที่แสดงต่อผู้ตอบ' },
            { field: 'questionType', values: QUESTION_TYPES, thaiName: 'ชนิดคำถาม', unit: null, description: 'ชนิดของคำตอบที่รับ' },
            { field: 'choices', publish: PUBLISH.FREE_TEXT_LIST, thaiName: 'ตัวเลือก', unit: null, description: 'ตัวเลือกของคำถามชนิดเลือกตอบ เป็น JSON array ในรูปข้อความ' },
            { field: 'isRequired', thaiName: 'บังคับตอบ', unit: 'boolean', description: 'คำถามที่ต้องตอบ' },
        ],
        withheld: [
            { column: 'SurveyQuestion.createdAt', reason: W.staffTime },
            { column: 'SurveyQuestion.updatedAt', reason: W.updatedAt },
            { column: 'SurveyQuestion.organizationId', reason: W.organization },
            { column: 'SurveyTemplate.id', reason: 'ส่งออกเป็นรหัสแฝงในคอลัมน์ templateId' },
            { column: 'SurveyTemplate.createdAt', reason: W.staffTime },
            { column: 'SurveyTemplate.updatedAt', reason: W.updatedAt },
            { column: 'SurveyTemplate.description', reason: 'คำอธิบายภายในของเจ้าหน้าที่' },
            { column: 'SurveyTemplate.status', reason: 'สถานะการเปิดรับคำตอบ เป็นข้อมูลการทำงาน' },
            { column: 'SurveyTemplate.activatedAt', reason: W.staffTime },
            { column: 'SurveyTemplate.closedAt', reason: W.staffTime },
            { column: 'SurveyTemplate.createdBy', reason: W.actor },
            { column: 'SurveyTemplate.isDeleted', reason: W.deletion },
            { column: 'SurveyTemplate.deletedAt', reason: W.deletion },
            { column: 'SurveyTemplate.deletedBy', reason: W.actor },
            { column: 'SurveyTemplate.organizationId', reason: W.organization },
        ],
    },
];

/**
 * Pseudonym lists the research data store deletes by: rows that may already
 * have been delivered and must no longer be held there.
 */
const DATASET_LISTS = [
    {
        key: 'cultivation-logs/deleted',
        domain: 'cultivation-logs',
        thaiName: 'รายการบันทึกกิจกรรมที่ถูกลบ',
        description: 'บันทึกกิจกรรมของรอบปลูกหรือฟาร์มที่ถูกลบหลังจากอาจส่งออกไปแล้ว คลังข้อมูลลบแถวใน cultivation-logs ที่มี id ตรงกัน',
        fields: [
            { field: 'id', thaiName: 'รหัสรายการ', unit: null, description: 'รหัสแฝงเดียวกับคอลัมน์ id ใน cultivation-logs' },
            { field: 'deletedOn', thaiName: 'วันที่ลบ', unit: 'YYYY-MM-DD (เวลาไทย)', description: 'วันที่ฟาร์มถูกลบ หรือวันที่รอบปลูกถูกลบเมื่อฟาร์มยังอยู่ ค่าว่างเมื่อระบบไม่ได้บันทึกวันที่ลบ' },
        ],
    },
    {
        key: 'harvest-batches/deleted',
        domain: 'harvest-batches',
        thaiName: 'รายการรุ่นเก็บเกี่ยวที่ถูกลบ',
        description: 'รุ่นที่ถูกลบ หรือฟาร์มหรือรอบปลูกของรุ่นถูกลบ หลังจากอาจส่งออกไปแล้ว คลังข้อมูลลบแถวใน harvest-batches ที่มี id ตรงกัน',
        fields: [
            { field: 'id', thaiName: 'รหัสรุ่น', unit: null, description: 'รหัสแฝงเดียวกับคอลัมน์ id ใน harvest-batches' },
            { field: 'deletedOn', thaiName: 'วันที่ลบ', unit: 'YYYY-MM-DD (เวลาไทย)', description: 'วันที่ฟาร์มถูกลบ หรือวันที่รอบปลูกถูกลบเมื่อฟาร์มยังอยู่ ค่าว่างเมื่อรุ่นถูกลบเอง เพราะระบบไม่มีคอลัมน์วันที่ลบของรุ่น' },
        ],
    },
    {
        key: 'survey-responses/withdrawn',
        domain: 'survey-responses',
        thaiName: 'รายการคำตอบที่ถอนความยินยอมแล้ว',
        description: 'ชุดคำตอบที่ผู้ตอบถอนความยินยอม หรือลบบัญชีของตัวเองตามสิทธิ์ PDPA หลังจากอาจส่งออกไปแล้ว คลังข้อมูลลบทุกแถวใน survey-responses ที่มี responseId ตรงกัน',
        fields: [
            { field: 'responseId', thaiName: 'รหัสชุดคำตอบ', unit: null, description: 'รหัสแฝงเดียวกับคอลัมน์ responseId ใน survey-responses' },
            { field: 'withdrawnOn', thaiName: 'วันที่ถอน', unit: 'YYYY-MM-DD (เวลาไทย)', description: 'วันที่ผู้ตอบถอนความยินยอมหรือลบบัญชี' },
        ],
    },
];

/**
 * What the research data store owes for the withdrawn list (order 56(4.2),
 * PDPC deletion-criteria notice 2567): delete within 90 days of receiving the
 * export that lists a pseudonym, copies and backups included. The manifest and
 * the data dictionary carry this sentence, and docs/data/README.md quotes it
 * word for word (check-dataset.js K13).
 */
const WITHDRAWN_DELETION_DUTY = 'คลังข้อมูลวิจัยของโครงการต้องลบข้อมูลของทุกรหัสแฝงที่อยู่ในรายการคำตอบที่ถอนความยินยอมแล้ว (survey-responses/withdrawn) '
    + 'ทั้งในคลัง ในสำเนา และในข้อมูลสำรอง ให้เสร็จภายใน 90 วันนับจากวันที่ได้รับชุดข้อมูลที่มีรหัสแฝงนั้นในรายการ '
    + 'ใช้ทั้งกับผู้ตอบที่ถอนความยินยอมและผู้ตอบที่ลบบัญชีตามกฎหมายคุ้มครองข้อมูลส่วนบุคคล '
    + 'ตามประกาศคณะกรรมการคุ้มครองข้อมูลส่วนบุคคล เรื่องหลักเกณฑ์การลบ ทำลาย หรือทำให้ไม่ระบุตัวบุคคล พ.ศ. 2567';

module.exports = {
    RESEARCH_BASIS,
    PUBLISH,
    ACCEPTED_RESEARCH_CONSENT_VERSIONS,
    TRACE_SCAN_ROUTES,
    DATASET_DOMAINS,
    DATASET_LISTS,
    WITHDRAWN_DELETION_DUTY,
};
