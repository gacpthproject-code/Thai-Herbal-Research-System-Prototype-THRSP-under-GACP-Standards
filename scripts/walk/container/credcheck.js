const bcrypt = require('bcryptjs');
const { identityLookupColumns, hmacLookupEnabled } = require('./services/auth/identity-lookup-columns');
const { canAccountHoldSession } = require('./shared/account-status');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const out = [];
try {
    for (const { role, kind, identifier, password } of input) {
        const authType = kind === 'staff' ? 'PROVIDER_ID' : 'HEALTH_ID';
        const cleaned = String(identifier || '').replace(/-/g, '').trim();
        const cols = identityLookupColumns(cleaned, authType);
        const suffix = hmacLookupEnabled() ? 'Hmac' : 'Hash';
        const portalCol = `${kind === 'staff' ? 'providerId' : 'healthId'}${suffix}`;
        const u = /^\d{13}$/.test(cleaned)
            ? await prisma.user.findFirst({ where: { OR: [{ [portalCol]: cols[portalCol] }, { [`idCard${suffix}`]: cols[`idCard${suffix}`] }] } })
            : null;
        out.push({
            role,
            found: !!u,
            active: canAccountHoldSession(u),
            userRole: u ? u.role : null,
            passwordMatches: u ? await bcrypt.compare(password, u.password) : false,
            locked: !!(u && u.lockedUntil && u.lockedUntil > new Date()),
            failedAttempts: u ? u.loginAttempts : null,
        });
    }
} finally { await prisma.$disconnect(); }
return out;
