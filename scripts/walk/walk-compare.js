#!/usr/bin/env node
// walk-compare — เทียบผลเดินตรวจก่อน deploy (baseline) กับหลัง deploy บนเครื่องเดียวกันในรอบเดียวกัน
//
//   node scripts/walk/walk-compare.js <baseline result.json> <post result.json>
//
// FAIL ใหม่ = แถวที่ baseline เป็น PASS แล้วหลัง deploy เป็น FAIL หรือหายไป
// baseline ที่เป็น NOT-YET หรือไม่มีแถวนั้น = ไม่มีฐานให้เทียบ แถวนั้นจึงไม่นับเป็น FAIL ใหม่ (แต่พิมพ์ให้เห็น)
// PASS → NOT-YET = ครอบคลุมหาย ไม่ใช่ FAIL ใหม่ แต่ต้องรายงาน (มักเป็นบัญชีเดินตรวจหายหลัง baseline)
// exit: 0 ไม่มี FAIL ใหม่ · 1 มี FAIL ใหม่ (ต้อง rollback ตาม deploy-demo.md) · 2 อ่านไม่ได้หรือเทียบกันไม่ได้
'use strict';
const fs = require('fs');

const KNOWN = new Set(['PASS', 'FAIL', 'NOT-YET']);

function load(file) {
    let r;
    try { r = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { throw new Error(`อ่าน ${file} ไม่ได้: ${e.message.split('\n')[0]}`); }
    if (!Array.isArray(r.rows) || !r.rows.length) { throw new Error(`${file} ไม่มีแถวผล เดินตรวจรอบนั้นไม่ได้วัดอะไร`); }
    for (const row of r.rows) {
        if (!row || typeof row.id !== 'string' || !KNOWN.has(row.status)) { throw new Error(`${file} มีแถวที่สถานะไม่รู้จัก: ${JSON.stringify(row && { id: row.id, status: row.status })}`); }
    }
    return r;
}

function compare(base, post) {
    if (base.target !== post.target || base.base !== post.base) {
        throw new Error(`เทียบคนละเครื่อง: baseline ${base.target} ${base.base} · หลัง deploy ${post.target} ${post.base}`);
    }
    const before = new Map(base.rows.map((r) => [r.id, r.status]));
    const after = new Map(post.rows.map((r) => [r.id, r.status]));
    const lines = [];
    const newFails = [];
    const lost = [];
    const unbasedFails = [];
    for (const id of new Set([...before.keys(), ...after.keys()])) {
        const was = before.get(id) || 'ไม่มี';
        const now = after.get(id) || 'ไม่มี';
        const isNew = was === 'PASS' && now !== 'PASS' && now !== 'NOT-YET';
        const isLost = was === 'PASS' && now === 'NOT-YET';
        if (isNew) { newFails.push(id); }
        if (isLost) { lost.push(id); }
        const unbased = now === 'FAIL' && was !== 'PASS' && was !== 'FAIL';
        if (unbased) { unbasedFails.push(id); }
        lines.push(`${id.padEnd(14)} ${was.padEnd(8)} → ${now.padEnd(8)}${isNew ? ' FAIL ใหม่' : isLost ? ' ครอบคลุมหาย' : unbased ? ' FAIL โดยไม่มีฐาน (ต้องรายงาน)' : ''}`);
    }
    return { lines, newFails, lost, unbasedFails };
}

function main(argv) {
    if (argv.length !== 2) { console.error('ใช้: node scripts/walk/walk-compare.js <baseline result.json> <post result.json>'); return 2; }
    let r;
    try { r = compare(load(argv[0]), load(argv[1])); } catch (e) { console.error(`walk-compare: ${e.message}`); return 2; }
    console.log('แถว           ก่อน       หลัง');
    r.lines.forEach((l) => console.log(l));
    if (r.lost.length) { console.log(`ครอบคลุมหาย ${r.lost.length} แถว (${r.lost.join(', ')}): PASS ใน baseline แต่หลัง deploy วัดไม่ได้ · ต้องรายงานพร้อมผล`); }
    if (r.newFails.length) {
        console.log(`ผล: FAIL ใหม่ ${r.newFails.length} แถว (${r.newFails.join(', ')}) · ต้อง rollback ด้วย scripts/deploy/demo-rollback.sh`);
        return 1;
    }
    const notes = [r.unbasedFails.length && `มี FAIL โดยไม่มีฐาน ${r.unbasedFails.length} แถว (${r.unbasedFails.join(', ')}) ต้องรายงาน`,
        r.lost.length && `ครอบคลุมหาย ${r.lost.length} แถว ต้องรายงาน`].filter(Boolean);
    console.log(`ผล: ไม่มี FAIL ใหม่${notes.length ? ` · ${notes.join(' · ')}` : ''}`);
    return 0;
}

if (require.main === module) { process.exit(main(process.argv.slice(2))); }
module.exports = { compare };
