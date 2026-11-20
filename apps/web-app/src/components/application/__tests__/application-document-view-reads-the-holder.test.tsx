/**
 * Review F3 (holder single source): the staff document view and print page used to read
 * the step-2 copy (formData.applicantData) that step 2 no longer writes, so a new filing
 * printed "-" for its identity while กทล.1 and the certificate printed the holder record.
 * ส่วนที่ ๑ here is the holder record, the same rows step 2 shows the applicant.
 */

import { describe, expect, it } from '@jest/globals';
import { renderToStaticMarkup } from 'react-dom/server';

import { ApplicationDocumentView } from '../application-document-view';
import type { ApplicationData } from '../application-document-helpers';
import { holderPrintRows, type StaffHolder } from '@/lib/holder/holder-registry';

const COMPANY: StaffHolder = {
  id: 'ent-1',
  type: 'JURISTIC',
  typeLabelTh: 'บริษัท',
  identitySource: 'SELF_DECLARED',
  verified: false,
  legalName: 'บริษัท ผู้ถือจริง จำกัด',
  registrationNo: '0105568045932',
  person: null,
  signatory: { title: 'นาย', firstName: 'ผู้มีอำนาจ', lastName: 'ลงนาม', idCard: '1XXXXXXXX7030', nationality: 'ไทย' },
  contact: { address: '9 ถนนทะเบียนผู้ถือ', phone: '0899999999', email: '' },
  houseCode: '',
  missing: [],
  complete: true,
};

const STALE_STEP2_COPY = { applicantType: 'JURISTIC', companyName: 'บริษัท ชื่อเก่าในขั้นสอง จำกัด', address: 'ที่อยู่เก่าจากขั้นสอง', phone: '0800000000' };

function application(holder: StaffHolder | null | undefined): ApplicationData {
  return {
    id: 'app-1',
    applicationNumber: 'GACP-0001',
    status: 'ASSIGNED_FOR_REVIEW',
    createdAt: '2026-01-01T00:00:00.000Z',
    formData: { applicantData: STALE_STEP2_COPY, farmData: { farmName: 'ฟาร์ม' } },
    ...(holder === undefined ? {} : { holder }),
  };
}

describe('ApplicationDocumentView ส่วนที่ ๑ reads the holder record', () => {
  it('prints the holder record, not the step-2 copy, when the application carries one', () => {
    const markup = renderToStaticMarkup(<ApplicationDocumentView application={application(COMPANY)} />);
    expect(markup).toContain('holder-record-rows');
    expect(markup).toContain('ชื่อบริษัท');
    expect(markup).toContain('บริษัท ผู้ถือจริง จำกัด');
    expect(markup).toContain('0105568045932');
    expect(markup).toContain('ชื่อกรรมการผู้มีอำนาจลงนาม');
    expect(markup).toContain('ผู้มีอำนาจ');
    expect(markup).toContain('9 ถนนทะเบียนผู้ถือ');
    expect(markup).not.toContain('บริษัท ชื่อเก่าในขั้นสอง จำกัด');
    expect(markup).not.toContain('ที่อยู่เก่าจากขั้นสอง');
  });

  it('leaves the contact rows out for a role that may not read them, and offers no §1 edit grid', () => {
    const withheld = { ...COMPANY, contact: null };
    const markup = renderToStaticMarkup(<ApplicationDocumentView application={application(withheld)} editable />);
    expect(markup).toContain('บริษัท ผู้ถือจริง จำกัด');
    expect(markup).not.toContain('9 ถนนทะเบียนผู้ถือ');
    expect(markup).not.toContain('0899999999');
    expect(holderPrintRows(withheld).map((r) => r.label)).not.toContain('ที่อยู่');
  });

  it('a filing with no holder record still reads its own step-2 copy', () => {
    const markup = renderToStaticMarkup(<ApplicationDocumentView application={application(null)} />);
    expect(markup).not.toContain('holder-record-rows');
    expect(markup).toContain('บริษัท ชื่อเก่าในขั้นสอง จำกัด');
  });
});
