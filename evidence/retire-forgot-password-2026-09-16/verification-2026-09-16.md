# ตรวจการทำงาน (functional verification) · 2026-09-15T23:52:12Z · main 00bb27b8 บน demo+staging · branch 1de927a5

## ระบบที่รันอยู่ (main 00bb27b8)
```
staging /api/health: revision=00bb27b8 db=connected version=3.0.0
demo /api/health: revision=00bb27b8 db=connected version=3.0.0
staging /api/webapp-version: {"revision":"00bb27b84f34a7dadf98ce57dc63169c85ea3fa2","builtAt":"2026-09-15T20:32:34Z"}
demo /api/webapp-version: {"revision":"00bb27b84f34a7dadf98ce57dc63169c85ea3fa2","builtAt":"2026-09-15T20:32:34Z"}

demo endpoint checks:
  GET  /auth/health/login             200
  GET  /register                      200
  GET  /api/auth/idp/providers        200
  GET  /api/mfa/status (no session)   401
  POST /api/mfa/email/setup           404
  POST /api/auth/health/reset-password/:token (bogus) 400

idp providers (demo): local=enabled healthid=coming_soon providerid=coming_soon thaid=coming_soon
```

## ฐานข้อมูล (prisma migrate status ด้วย image ที่รันอยู่)
```
staging: 143 migrations found · Database schema is up to date!
demo:    143 migrations found · Database schema is up to date!
```

## งานสำรองอัตโนมัติ
```
165260 2026-09-15_10:49:30 demo_20260915_104925.sql.gz
166876 2026-09-16_03:47:05 demo_20260916_034701.sql.gz
166744 2026-09-16_03:35:14 demo_pre-deploy_20260916-033511.sql.gz
129058 2026-09-15_10:49:27 staging_20260915_104925.sql.gz
130164 2026-09-16_03:47:03 staging_20260916_034701.sql.gz
82253983 2026-09-16_03:17:05 /opt/gacp-platform/backups/gacp-uploads-data_20260915_201701.tgz
```

## log ของ backend (4 ชั่วโมงหลัง deploy)
```
gacp-backend-demo: 0 error/exception lines
gacp-backend-staging: 0 error/exception lines
```

## ตารางเส้นทางจริงของ router ที่แก้ (branch 1de927a5, require จริงแล้วอ่าน router.stack)
```
[
 "POST /login",
 "POST /register",
 "POST /reset-password/:token",
 "POST /check-identifier",
 "POST /refresh",
 "POST /logout",
 "GET /me",
 "PATCH /me",
 "POST /change-password",
 "POST /me/avatar",
 "GET /verify",
 "GET /me/export",
 "DELETE /me/delete",
 "GET /me/notification-prefs",
 "PUT /me/notification-prefs"
]```

เส้นทางที่เกี่ยวกับรหัสผ่านเหลือเพียง POST /reset-password/:token (token ที่เจ้าหน้าที่ออกให้) และ POST /change-password
