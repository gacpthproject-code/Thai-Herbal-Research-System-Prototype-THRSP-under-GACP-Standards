'use strict';

/**
 * วันหยุดพิเศษเป็นข้อมูลมีวันที่กำกับ (operator คำสั่ง 32, 2026-10-07) · ผู้ดูแลฝั่งกรมเพิ่มได้
 *
 * ตาราง special_holidays เป็น append-only (trigger ในมิเกรชัน: ห้าม UPDATE DELETE TRUNCATE) หนึ่งแถว
 * ต่อหนึ่งวัน · ตัวช่วยวันทำการ (utils/working-days.js) นับวันเหล่านี้เป็นวันหยุดเพิ่มจากปฏิทินในโค้ด
 *
 * วันหยุดที่เพิ่มทีหลังมีผลอย่างไร:
 *   - กำหนดที่ประทับลงแถวแล้ว (วันครบกำหนดแก้ไข, dueDate ของใบแจ้งหนี้ที่ออกแล้ว) คงค่าเดิม
 *   - งวดที่ยังไม่ชำระและยังไม่มีใบแจ้งหนี้ คำนวณกำหนดใหม่จากจุดเริ่มนาฬิกาทุกรอบของตัวเตือนและตัวปิด
 *     จึงเลื่อนตาม · มีใบแจ้งหนี้แล้ว ตัวเตือนและตัวปิดใช้ dueDate บนใบ (services/billing/unpaid-milestones.js)
 *
 * วันหยุดพิเศษเป็นของทั้งระบบ ไม่แยกองค์กร (กรมเดียว วันหยุดราชการเป็นของทั้งประเทศ)
 *
 * @module services/special-holiday-service
 */

const { setSpecialHolidays, parseLocalIsoDate, getZonedParts } = require('../utils/working-days');
const { auditLogger, AuditCategory, AuditSeverity, ResourceType } = require('../middleware/audit-logger');
const logger = require('../shared/logger');

const NAME_MAX = 200;
const REASON_MIN = 5;
const REASON_MAX = 1000;
/** Accepted years, relative to this Bangkok year: last year's late fixes … two years ahead. */
const YEARS_BACK = 1;
const YEARS_AHEAD = 2;

function db(client) {
    return client || require('./prisma-database').prisma;
}

// The calendar day as Postgres stores it, never re-read through a JavaScript clock.
function readRows(client) {
    return db(client).$queryRaw`SELECT id, to_char("date", 'YYYY-MM-DD') AS date, name, reason, "createdBy", "createdAt"
        FROM special_holidays ORDER BY "date" ASC`;
}

/** Load every special holiday into the working-day helper. Never throws. */
async function refreshSpecialHolidays({ client } = {}) {
    try {
        const rows = await readRows(client);
        setSpecialHolidays(rows.map((r) => r.date));
        return rows.length;
    } catch (err) {
        logger.error(`[special-holidays] refresh failed; the working-day calendar keeps its last set: ${err?.message}`);
        return null;
    }
}

async function listSpecialHolidays({ client } = {}) {
    return readRows(client);
}

function invalid(message) {
    return Object.assign(new Error(message), { code: 'SPECIAL_HOLIDAY_INVALID', statusCode: 400 });
}

function daysInMonth(year, month) {
    const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
    return [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
}

/** A real Bangkok calendar day inside the accepted years, or null. */
function parseHolidayDate(value, now) {
    const iso = String(value || '').trim();
    const parts = parseLocalIsoDate(iso);
    if (!parts || parts.month < 1 || parts.month > 12 || parts.day < 1 || parts.day > daysInMonth(parts.year, parts.month)) {
        return null;
    }
    const thisYear = getZonedParts(now).year;
    if (parts.year < thisYear - YEARS_BACK || parts.year > thisYear + YEARS_AHEAD) { return null; }
    return { iso, date: new Date(`${iso}T00:00:00.000Z`) };
}

/**
 * Inserts the day and its audit row in one transaction, then reloads the working-day calendar.
 *
 * @param {{ date: string, name: string, reason: string, actor: { id: string, role: string, organizationId?: string|null },
 *           now?: Date, client?: object }} args  date = YYYY-MM-DD, the Bangkok calendar day
 */
async function addSpecialHoliday({ date, name, reason, actor, now = new Date(), client }) {
    const day = parseHolidayDate(date, now);
    const cleanName = String(name || '').trim();
    const cleanReason = String(reason || '').trim();
    if (!day) {
        const thisYear = getZonedParts(now).year;
        throw invalid(`date must be a real YYYY-MM-DD day in ${thisYear - YEARS_BACK}-${thisYear + YEARS_AHEAD}`);
    }
    if (!cleanName || cleanName.length > NAME_MAX) { throw invalid(`name is required, at most ${NAME_MAX} characters`); }
    if (cleanReason.length < REASON_MIN || cleanReason.length > REASON_MAX) {
        throw invalid(`reason must be ${REASON_MIN}-${REASON_MAX} characters`);
    }
    let row;
    try {
        row = await db(client).$transaction(async (tx) => {
            const created = await tx.specialHoliday.create({
                data: { date: day.date, name: cleanName, reason: cleanReason, createdBy: actor.id },
            });
            await auditLogger.logWithin({
                category: AuditCategory.SYSTEM,
                action: 'SPECIAL_HOLIDAY_ADDED',
                severity: AuditSeverity.INFO,
                actorId: actor.id,
                actorType: 'USER',
                actorRole: actor.role,
                resourceType: ResourceType.SYSTEM,
                resourceId: created.id,
                organizationId: actor.organizationId || null,
                metadata: { date: day.iso, name: cleanName, reason: cleanReason },
            }, tx);
            return created;
        });
    } catch (err) {
        if (err?.code === 'P2002') {
            throw Object.assign(new Error(`${day.iso} is already a special holiday`), { code: 'SPECIAL_HOLIDAY_EXISTS', statusCode: 409 });
        }
        throw err;
    }
    await refreshSpecialHolidays({ client });
    return { ...row, date: day.iso };
}

module.exports = { refreshSpecialHolidays, listSpecialHolidays, addSpecialHoliday };
