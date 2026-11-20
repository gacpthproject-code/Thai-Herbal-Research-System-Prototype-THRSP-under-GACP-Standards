'use strict';

const fs = require('fs');
const path = require('path');

const ICON = { PASS: 'ผ่าน', FAIL: 'ไม่ผ่าน', 'NOT-YET': 'ยังไม่มี probe / ยังไม่เสร็จ' };
const cell = (s) => String(s ?? '').replace(/\|/g, '/').replace(/\n+/g, ' ');

function markdown(result) {
    const lines = [
        `# ผลเดินตรวจหลัง deploy · ${result.target} · ${result.startedAt}`,
        '',
        `- เครื่อง: ${result.base} (revision ${result.revision || 'อ่านไม่ได้'})`,
        `- เริ่ม ${result.startedAt} · จบ ${result.finishedAt}`,
        `- คำขอทดสอบของรอบนี้: ${result.testApplication || 'ไม่มี'}`,
        `- ผลรวม: ${result.verdict} (exit ${result.exitCode})`,
        '',
        '| แถว | ผล | ผ่าน | ไม่ผ่าน | ยังไม่มี |',
        '|---|---|---|---|---|',
        ...result.rows.map((r) => `| ${r.id} ${cell(r.title)} | ${r.status} | ${r.checks.filter((c) => c.status === 'PASS').length} | ${r.checks.filter((c) => c.status === 'FAIL').length} | ${r.checks.filter((c) => c.status === 'NOT-YET').length} |`),
        '',
    ];
    for (const r of result.rows) {
        lines.push(`## ${r.id} · ${r.status} (${ICON[r.status]})`, '', cell(r.title), '', ...(r.note ? [cell(r.note), ''] : []), '| ข้อ | ผล | รายละเอียด |', '|---|---|---|');
        for (const c of r.checks) { lines.push(`| ${c.id} ${cell(c.title)} | ${c.status} | ${cell(c.detail)} |`); }
        lines.push('');
    }
    return `${lines.join('\n')}\n`;
}

function writeResult(outDir, result) {
    fs.writeFileSync(path.join(outDir, 'result.json'), `${JSON.stringify(result, null, 2)}\n`);
    fs.writeFileSync(path.join(outDir, 'result.th.md'), markdown(result));
}

module.exports = { markdown, writeResult };
