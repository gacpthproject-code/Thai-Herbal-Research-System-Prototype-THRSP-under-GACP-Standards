'use strict';

const { APPEAL_SETUP_KEY } = require('../shared/appeal-setup');

const TEST_APPEAL_SETUP = Object.freeze({
    effectiveFrom: '2026-01-01',
    channel: 'ข้อความทดสอบ: ช่องทางยื่นอุทธรณ์ตามที่ระบุในคำตอบของนิติกร',
    timeLimitDays: 15,
    sourceRef: 'ทดสอบ-คำตอบนิติกร',
});

function setAppealSetup(prisma, entries = [TEST_APPEAL_SETUP]) {
    const stored = JSON.stringify(entries);
    return prisma.systemConfig.upsert({
        where: { key: APPEAL_SETUP_KEY },
        update: { value: stored, type: 'JSON' },
        create: { key: APPEAL_SETUP_KEY, value: stored, type: 'JSON' },
    });
}

function clearAppealSetup(prisma) {
    return prisma.systemConfig.deleteMany({ where: { key: APPEAL_SETUP_KEY } });
}

module.exports = { TEST_APPEAL_SETUP, setAppealSetup, clearAppealSetup };
