'use client';

import { useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { apiClient } from '@/lib/api/api-client';
import { Button } from '@/components/ui/primitives/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/primitives/dialog';
import { Input } from '@/components/ui/primitives/input';
// ดรอปดาวน์บทบาทอ่านจาก staffRoleOptionsAssignableBy ไม่ได้เก็บรายการของตัวเอง:
// ผู้ดูแลแพลตฟอร์มสร้างได้เฉพาะเจ้าหน้าที่ฝั่งบริษัท (คำสั่ง 13, 34(2)) เจ้าหน้าที่ฝั่งกรม
// รวมทั้งผู้อนุมัติใบรับรอง สร้างโดยผู้ดูแลกรมที่ /provider/management
import { Label } from '@/components/ui/primitives/label';
import { staffRoleOptionsAssignableBy } from '@/lib/constants/admin-role-options';
import { useAuth } from '@/lib/services/auth-provider';
import { CROSS_SIDE_USER_CHANGE_FORBIDDEN_CODE, CROSS_SIDE_USER_CHANGE_FORBIDDEN_TH } from '@/lib/i18n/error-code-map';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/primitives/select';
import type { CreatedUserPayload, Organization } from './types';

export function CreateUserDialog({
  org,
  onClose,
}: {
  org: Organization | null;
  onClose: () => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [created, setCreated] = useState<CreatedUserPayload | null>(null);

  const [email, setEmail] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const { user: viewer } = useAuth();
  const roleOptions = useMemo(() => staffRoleOptionsAssignableBy(viewer?.role), [viewer?.role]);
  const [pickedRole, setRole] = useState<string>('');
  // `?? ''`: an empty list leaves an empty dropdown that refuses to submit, never a value
  // pointing at a row that does not exist.
  const role = roleOptions.some((option) => option.value === pickedRole)
    ? pickedRole
    : (roleOptions[0]?.value ?? '');
  // เลขบัตรประจำตัวประชาชน — เดิมระบบสร้างรหัสสังเคราะห์ให้เอง แล้วประตูล็อกอินปฏิเสธมัน
  // บัญชีที่สร้างจึงใช้ไม่ได้ทุกใบ (เจอตอนสร้างบัญชี demo ผ่าน UI จริง 2026-09-12)
  const [providerId, setProviderId] = useState('');

  function reset() {
    setEmail('');
    setFirstName('');
    setLastName('');
    setRole('');
    setFormError(null);
    setCreated(null);
    setProviderId('');
  }

  async function handleSubmit(e: React.FormEvent) {
    if (!org) return;
    e.preventDefault();
    setSubmitting(true);
    setFormError(null);
    try {
      const result = await apiClient.post<CreatedUserPayload>(
        `/api/platform-admin/organizations/${org.id}/users`,
        {
          email: email.trim().toLowerCase(),
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          role,
          providerId: providerId.replace(/\D/g, ''),
        }
      );
      if (result.success && result.data) {
        setCreated(result.data);
      } else {
        setFormError(result.errorCode === CROSS_SIDE_USER_CHANGE_FORBIDDEN_CODE
          ? CROSS_SIDE_USER_CHANGE_FORBIDDEN_TH
          : (result.error || 'ไม่สามารถสร้างผู้ใช้ได้'));
      }
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'ไม่สามารถสร้างผู้ใช้ได้');
    } finally {
      setSubmitting(false);
    }
  }

  function handleClose() {
    reset();
    onClose();
  }

  return (
    <Dialog open={!!org} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>เพิ่มผู้ใช้ใน {org?.name}</DialogTitle>
          <DialogDescription>
            เพิ่มพนักงานฝั่งบริษัท กรอกเลขบัตรประจำตัวประชาชนเพื่อใช้เป็นรหัสเข้าสู่ระบบ
          </DialogDescription>
        </DialogHeader>

        {created ? <CreatedView created={created} onClose={handleClose} /> : (
          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <Label htmlFor="user-provider-id">เลขบัตรประจำตัวประชาชน (13 หลัก) *</Label>
              <Input
                id="user-provider-id"
                inputMode="numeric"
                autoComplete="off"
                maxLength={13}
                placeholder="เลข 13 หลักบนบัตรประจำตัวประชาชน"
                value={providerId}
                onChange={(e) => setProviderId(e.target.value.replace(/\D/g, '').slice(0, 13))}
                required
              />
              <p className="mt-1 text-xs text-muted-foreground">
                เจ้าหน้าที่จะใช้เลขนี้เข้าสู่ระบบ ไม่ใช่อีเมล
              </p>
            </div>
            <div>
              <Label htmlFor="user-email">อีเมล *</Label>
              <Input
                id="user-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="user-fn">ชื่อ *</Label>
                <Input
                  id="user-fn"
                  autoComplete="given-name"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  required
                />
              </div>
              <div>
                <Label htmlFor="user-ln">นามสกุล *</Label>
                <Input
                  id="user-ln"
                  autoComplete="family-name"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  required
                />
              </div>
            </div>
            <div>
              <Label htmlFor="user-role">บทบาท</Label>
              <Select value={role} onValueChange={setRole}>
                <SelectTrigger id="user-role" aria-label="บทบาทผู้ใช้">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {roleOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {formError && (
              <div className="rounded border border-destructive bg-destructive/5 px-3 py-2 text-sm text-destructive" role="alert" aria-live="polite">
                {formError}
              </div>
            )}

            <DialogFooter>
              <Button type="button" variant="ghost" onClick={handleClose} disabled={submitting}>
                ยกเลิก
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting && <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden="true" />}
                {submitting ? 'กำลังสร้าง...' : 'สร้างผู้ใช้'}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function CreatedView({
  created,
  onClose,
}: {
  created: CreatedUserPayload;
  onClose: () => void;
}) {
  return (
    <div className="space-y-3">
      <div className="rounded border border-green-600 bg-green-50 p-3 text-sm">
        <div className="font-medium text-green-800">สร้างผู้ใช้สำเร็จ</div>
        <dl className="mt-2 space-y-1 text-sm">
          <div className="flex justify-between gap-2">
            <dt className="text-muted-foreground">รหัสเจ้าหน้าที่ (Provider ID)</dt>
            <dd className="font-mono">{created.user.providerId}</dd>
          </div>
          {created.generatedPassword && (
            <div>
              <dt className="text-muted-foreground">รหัสผ่านชั่วคราว (แสดงครั้งเดียว)</dt>
              <dd className="mt-1 break-all rounded bg-yellow-100 p-2 font-mono text-base">
                {created.generatedPassword}
              </dd>
              <p className="mt-1 text-xs text-yellow-800">
                ⚠️ คัดลอกและส่งให้ผู้ใช้ทันที จะแสดงไม่ได้อีก
              </p>
            </div>
          )}
          {created.loginHint && (
            <div className="pt-1 text-xs text-muted-foreground">
              เข้าสู่ระบบได้ที่ {created.loginHint.loginPath} ({created.loginHint.portal})
            </div>
          )}
        </dl>
      </div>
      <DialogFooter>
        <Button onClick={onClose}>เสร็จสิ้น</Button>
      </DialogFooter>
    </div>
  );
}
