const { prisma } = require('../services/prisma-database');
const logger = require('../shared/logger');
const { respondError } = require('../shared/api-response');
const { SCRIPT_SET_CONFIG_KEYS } = require('../shared/script-set-config-keys');
const { ERROR_CODES } = require('../shared/error-codes');
const { descriptionTh, parseConfigValue, presentSystemConfig } = require('../shared/system-config-catalog');

const PUBLIC_CONFIG_KEYS = [
    'registration_open',
    'marketing_banner',
    'service_organic',
    'service_gacp',
    'relaxed_validation',
    // Feature flags — toggle ON/OFF จาก admin panel
    'feature.task_router',
    'feature.readiness_check',
    'feature.document_repo',
    'feature.sop_library',
    'feature.report_center',
    'feature.official_templates',
    'feature.export_documents',
];

/**
 * Get Public System Configurations
 * Returns simple key-value map for frontend context
 */
exports.getPublicConfigs = async (req, res) => {
    try {
        const configs = await prisma.systemConfig.findMany({
            where: { key: { in: PUBLIC_CONFIG_KEYS } },
        });

        // Transform to simple object: { key: value }
        const configMap = configs.reduce((acc, curr) => {
            acc[curr.key] = parseConfigValue(curr.value);
            return acc;
        }, {});

        // Canonical field for frontend runtime. Keep legacy alias fields for compatibility.
        const relaxedValidation = Boolean(configMap.relaxed_validation);
        configMap.relaxedValidation = relaxedValidation;
        configMap.enableRelaxedApplicationValidation = relaxedValidation;

        res.json({
            success: true,
            data: configMap,
        });
    } catch (error) {
        return respondError(res, req, error, { label: '[SystemConfig] get', message: 'Failed to fetch configurations' });
    }
};

/**
 * Get All Configurations (Admin View)
 * Returns full objects with metadata
 */
exports.getAllConfigs = async (req, res) => {
    try {
        // SystemConfig has columns (key, value, type, description, updatedBy,
        // updatedAt) — no `group` column. Earlier code ordered by a non-existent
        // field and silently 500'd on every admin GET /api/system-config.
        // The sister route at routes/api/admin/config.js orders by `key`;
        // mirror that for consistency.
        const configs = await prisma.systemConfig.findMany({
            orderBy: { key: 'asc' },
        });

        res.json({
            success: true,
            data: configs.map(presentSystemConfig),
        });
    } catch (error) {
        return respondError(res, req, error, { label: '[SystemConfig]' });
    }
};

/**
 * Update Configuration (Admin Only)
 */
exports.updateConfig = async (req, res) => {
    const { key } = req.params;
    const { value } = req.body;
    if (SCRIPT_SET_CONFIG_KEYS.has(key)) {
        const row = ERROR_CODES.CONFIG_KEY_SET_BY_SCRIPT_ONLY;
        return res.status(row.httpStatus).json({ success: false, code: row.code, error: row.messageTh });
    }

    try {
        const updated = await prisma.systemConfig.update({
            where: { key },
            data: {
                value,
                updatedBy: req.user ? req.user.id : 'ADMIN', // Assume Auth Middleware adds user
            },
        });

        res.json({
            success: true,
            message: 'Configuration updated',
            data: updated,
        });
    } catch (error) {
        return respondError(res, req, error, { label: '[SystemConfig]' });
    }
};

/**
 * Seed Default System Configurations
 * Used for initial setup and migrations
 */
exports.seedDefaultConfigs = async () => {
    const defaults = [
        { key: 'registration_open', value: 'true', description: descriptionTh('registration_open', 'Allow new user registrations'), type: 'BOOLEAN' },
        { key: 'marketing_banner', value: 'false', description: descriptionTh('marketing_banner', 'Show promotional banner on dashboard'), type: 'BOOLEAN' },
        { key: 'service_organic', value: 'false', description: descriptionTh('service_organic', 'Enable Organic Certification service'), type: 'BOOLEAN' },
        { key: 'service_gacp', value: 'true', description: descriptionTh('service_gacp', 'Enable GACP Certification service'), type: 'BOOLEAN' },
        { key: 'relaxed_validation', value: 'false', description: descriptionTh('relaxed_validation', 'Skip strict validation for testing'), type: 'BOOLEAN' },
        // Feature flags
        { key: 'feature.task_router', value: 'true', description: descriptionTh('feature.task_router', 'แสดงหน้า Task Router (เลือกงานที่ต้องการทำ)'), type: 'BOOLEAN' },
        { key: 'feature.readiness_check', value: 'true', description: descriptionTh('feature.readiness_check', 'แสดง Readiness Check ก่อนยื่นคำขอ'), type: 'BOOLEAN' },
        { key: 'feature.document_repo', value: 'true', description: descriptionTh('feature.document_repo', 'แสดงหน้าเอกสารของฉัน'), type: 'BOOLEAN' },
        { key: 'feature.sop_library', value: 'false', description: descriptionTh('feature.sop_library', 'แสดงหน้า SOP Library (ปิดไว้ก่อน)'), type: 'BOOLEAN' },
        { key: 'feature.report_center', value: 'true', description: descriptionTh('feature.report_center', 'แสดงหน้าศูนย์รายงาน'), type: 'BOOLEAN' },
        { key: 'feature.official_templates', value: 'true', description: descriptionTh('feature.official_templates', 'ใช้ระบบ template เอกสารทางการ'), type: 'BOOLEAN' },
        { key: 'feature.export_documents', value: 'false', description: descriptionTh('feature.export_documents', 'แสดงเอกสารส่งออก (ปิดไว้ก่อน)'), type: 'BOOLEAN' },
    ];

    for (const conf of defaults) {
        try {
            const existing = await prisma.systemConfig.findUnique({ where: { key: conf.key } });
            if (!existing) {
                await prisma.systemConfig.create({ data: conf });
                logger.info(`[SystemConfig] Seeded: ${conf.key}`);
            }
        } catch (error) {
            logger.error(`[SystemConfig] Failed to seed ${conf.key}:`, error.message);
        }
    }
};
