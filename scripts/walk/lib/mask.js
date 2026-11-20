'use strict';

const SECRETS = new Set();
const NAMES = new Set();

const NAME_KEYS = /^(fullName|firstName|lastName|firstNameTh|lastNameTh|firstNameEn|lastNameEn|displayName|companyName|holderName|applicantName|inspectorName|auditorName|reviewerName|approverName|ownerName|contactName|payerName|customerName|buyerName|farmerName|userName|nameTh|nameEn|legalName|email|phone|phoneNumber|mobile|taxId|nationalId|idCard|juristicId|siteContactName|directorName|authorizedSignatory|signatoryName|signatoryFirstName|signatoryLastName|registrationNumber)$/;
const ISSUER = /พรีดิคทีฟ|Predictive|กรมการแพทย์แผนไทย|^GACP|ผู้ตรวจ$|ทดสอบ ผู้|^ทดสอบ$/i;

function addSecret(value) { if (value && String(value).length >= 4) { SECRETS.add(String(value)); } }

function harvestNames(obj, depth = 0) {
    if (!obj || typeof obj !== 'object' || depth > 12) { return; }
    if (Array.isArray(obj)) { for (const x of obj) { harvestNames(x, depth + 1); } return; }
    const holderish = ['type', 'entityType', 'holderType'].some((k) => /INDIVIDUAL|JURISTIC|COMPANY|PARTNERSHIP|COMMUNITY|PERSON/.test(String(obj[k] || '')));
    for (const [k, v] of Object.entries(obj)) {
        if (typeof v === 'string') {
            const val = v.trim();
            if (val.length < 3 || val.length > 120 || ISSUER.test(val) || /^[-–—\s.]+$/.test(val)) { continue; }
            if (NAME_KEYS.test(k) || (k === 'name' && holderish)) { NAMES.add(val); }
        } else { harvestNames(v, depth + 1); }
    }
    if (typeof obj.firstName === 'string' && typeof obj.lastName === 'string' && obj.firstName && obj.lastName) { NAMES.add(`${obj.firstName} ${obj.lastName}`.trim()); }
}

function scrub(s) {
    let t = String(s);
    for (const x of SECRETS) { t = t.split(x).join('<masked>'); }
    for (const n of [...NAMES].filter((x) => x.length >= 3).sort((a, b) => b.length - a.length)) { t = t.split(n).join('[ปิดชื่อ]'); }
    return t.replace(/\b\d{13}\b/g, '<13d>')
        .replace(/\b\d-\d{4}-\d{5}-\d{2}-\d\b/g, '<13d>')
        .replace(/\b0\d{8,9}\b/g, '<phone>')
        .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, '<email>')
        .replace(/eyJ[\w-]{8,}(\.[\w-]*){0,2}/g, '<jwt>')
        .replace(/(sk|rk|pk|whsec)_(test|live)_[A-Za-z0-9]+/g, '<stripe-key>')
        .replace(/pi_[A-Za-z0-9]+_secret_[A-Za-z0-9]+/g, '<client_secret>')
        .replace(/postgres(ql)?:\/\/[^\s"']+/g, '<db-url>')
        .replace(/"(password|token|accessToken|refreshToken|laserCode|csrfToken|totpSecret|secret|code)"\s*:\s*"[^"]*"/g, '"$1":"<masked>"');
}

function piiFound(text) {
    const t = String(text);
    const hits = [];
    if (/\b\d{13}\b/.test(t)) { hits.push('เลข 13 หลัก'); }
    if (/\b0\d{8,9}\b/.test(t)) { hits.push('เบอร์โทร'); }
    if (/[\w.+-]+@[\w-]+\.[\w.]+/.test(t)) { hits.push('อีเมล'); }
    for (const x of SECRETS) { if (x.length >= 6 && t.includes(x)) { hits.push('ข้อมูลบัญชีเดินตรวจ'); break; } }
    return hits;
}

module.exports = { SECRETS, NAMES, addSecret, harvestNames, scrub, piiFound };
