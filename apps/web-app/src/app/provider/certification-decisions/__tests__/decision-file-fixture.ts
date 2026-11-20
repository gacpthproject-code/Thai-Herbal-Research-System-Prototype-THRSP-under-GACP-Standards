import type { DecisionFile } from '../[id]/decision-file-types';

export const FILE: DecisionFile = {
    application: {
        id: 'app-1', applicationNumber: 'APP-9001', status: 'AUDIT_PASSED', applicantName: 'สมชาย ใจดี',
        submittedAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z', scheduledDate: null,
        farmName: 'ไร่ทดสอบ', farmAddress: '1 หมู่ 2 ต.ทดสอบ', farmLatitude: 13.7, farmLongitude: 100.5,
        holder: { name: 'บริษัท ทดสอบ จำกัด', typeLabel: 'นิติบุคคล' },
        scope: { cultivationTypes: ['กลางแจ้ง'], plantName: 'กัญชา' },
        purposes: ['ศึกษาวิจัย (ภ.ท. 09)'],
    },
    decidable: true,
    actions: ['APPROVE', 'REFUSE', 'RETURN'],
    decision: null,
    refusalReasons: [{ code: 'FALSE_INFORMATION', label: 'ข้อมูลหรือเอกสารที่ยื่นไม่ตรงกับความจริง' }],
    documents: [
        { slotId: 'ID_CARD', labelTH: 'สำเนาบัตรประชาชน', required: true, satisfied: true, fileUrl: '/uploads/application-drafts/1.pdf', fileName: 'idcard.pdf', verdict: 'ACCEPTED', reviewReason: null },
        { slotId: 'LAND', labelTH: 'เอกสารสิทธิ์ที่ดิน', required: true, satisfied: false, fileUrl: null, fileName: null, verdict: null, reviewReason: null },
    ],
    onsite: {
        audit: { id: 'audit-1' },
        checklist: [
            { itemCode: '1.1', section: 'SITE_SELECTION', prompt: 'พื้นที่ปลอดจากแหล่งปนเปื้อน', isCritical: true, response: 'PASS', notes: null },
            { itemCode: '1.2', section: 'SITE_SELECTION', prompt: 'แปลงปลูกห่างจากแหล่งน้ำเสีย', isCritical: false, response: 'FAIL', notes: 'ขาดป้ายเตือน' },
            { itemCode: '2.1', section: 'WATER_SOURCE', prompt: 'แหล่งน้ำมีผลตรวจคุณภาพ', isCritical: true, response: null, notes: null },
        ],
        photos: [
            {
                photoId: 'p1', uploadedBy: 'u', uploadedAt: '2026-10-01T01:00:00.000Z', capturedAt: '2026-10-01T01:00:00.000Z',
                fileHash: 'abcdef0123456789'.repeat(4), gps: { latitude: 13.7, longitude: 100.5 },
                place: { status: 'MEASURED', distanceMeters: 12, toleranceMeters: 500, beyondTolerance: false },
                time: { capturedAtSource: 'CALLER_SUPPLIED_UNVERIFIED', windowSource: 'INSPECTION_START', status: 'INSIDE', offsetSeconds: 30 },
                appearance: { perceptualHash: 'ff', algorithm: 'dhash64' },
                flags: ['NEAR_DUPLICATE'], caption: 'ทางเข้า', fileUrl: '/uploads/audits/audit-1/p1.jpg', fileName: 'p1.jpg',
            },
            {
                photoId: 'p2', uploadedBy: 'u', uploadedAt: '2026-10-01T01:05:00.000Z', capturedAt: '2026-10-01T01:05:00.000Z',
                fileHash: '0123456789abcdef'.repeat(4), gps: { latitude: 13.7, longitude: 100.5 },
                place: { status: 'MEASURED', distanceMeters: 9000, toleranceMeters: 500, beyondTolerance: true },
                time: { capturedAtSource: 'CALLER_SUPPLIED_UNVERIFIED', windowSource: 'INSPECTION_START', status: 'INSIDE', offsetSeconds: 60 },
                appearance: { perceptualHash: 'ff', algorithm: 'dhash64' },
                flags: ['PLACE_BEYOND_TOLERANCE', 'NEAR_DUPLICATE'], caption: null, fileUrl: null, fileName: null,
            },
        ],
        nearDuplicatePairs: [{ photoIds: ['p1', 'p2'], distanceBits: 0, sameFileHash: false, algorithm: 'dhash64' }],
        notRecorded: { place: 0, time: 0, appearance: 0 },
        needsAttention: 2,
        toleranceMeters: 500,
        gps: {
            checkIn: { latitude: 13.7, longitude: 100.5, accuracy: 8, at: '2026-10-01T00:30:00.000Z' },
            withinTolerance: true, distanceMeters: 15, farmLatitude: 13.7, farmLongitude: 100.5, toleranceMeters: 500, unknownFarmLocation: false,
        },
        evidenceGate: { sufficient: false, code: 'INCOMPLETE_CHECKLIST', messageTh: 'แบบตรวจแปลงยังตอบไม่ครบทุกข้อ' },
    },
    inspectorSummary: { inspectorName: 'ผู้ตรวจ หนึ่ง', decision: 'PASS', notes: 'ผ่านทุกข้อสำคัญ', reasonCode: null, decidedAt: '2026-10-01T02:00:00.000Z', findings: [] },
    carHistory: {
        rounds: [{ roundNo: 1, decidedAt: '2026-09-10T00:00:00.000Z', dueAt: '2026-09-17T00:00:00.000Z' }],
        decisions: [{ decision: 'MINOR', notes: 'ป้ายเตือนไม่ครบ', reasonCode: null, decidedAt: '2026-09-10T00:00:00.000Z', findings: [{ nonConformity: 'ไม่มีป้ายเตือน', correctiveAction: 'ติดป้าย', category: null }] }],
        applicantDocuments: [{ name: 'ภาพป้าย.jpg', path: '/uploads/car/x.jpg', uploadedAt: '2026-09-20T00:00:00.000Z' }],
    },
};
