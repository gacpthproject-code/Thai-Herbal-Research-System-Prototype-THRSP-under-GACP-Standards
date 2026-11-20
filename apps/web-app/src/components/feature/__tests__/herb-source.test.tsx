import * as React from 'react';
import { describe, expect, it } from '@jest/globals';
import { renderToStaticMarkup } from 'react-dom/server';

import { HerbSource } from '../herb-source';

const render = (source: string | null) => {
  const host = document.createElement('div');
  host.innerHTML = renderToStaticMarkup(<HerbSource source={source} />);
  return host;
};

describe('HerbSource', () => {
  it('links a cited entry to its document and shows the Buddhist-era date it was read', () => {
    const host = render('ตำรามาตรฐานยาสมุนไพรไทย 2021 ขิง · https://bdn-thp.dmsc.moph.go.th/ebook/x · เข้าถึง 2026-10-28');
    const link = host.querySelector('a');
    expect(link?.textContent).toBe('ตำรามาตรฐานยาสมุนไพรไทย 2021 ขิง');
    expect(link?.getAttribute('href')).toBe('https://bdn-thp.dmsc.moph.go.th/ebook/x');
    expect(link?.getAttribute('rel')).toBe('noopener noreferrer');
    expect(host.textContent).toMatch(/เปิดอ่านเมื่อ .*2569/);
  });

  it('labels an AI draft as unchecked and never renders it as a citation', () => {
    const host = render('AI_DRAFT: ร่าง ต้องตรวจสอบ · https://example.org · เข้าถึง 2026-10-28');
    expect(host.querySelector('a')).toBeNull();
    expect(host.textContent).toMatch(/ยังไม่ได้ตรวจกับแหล่งอ้างอิง/);
  });

  it('shows a plain source as text and nothing for an empty one', () => {
    expect(render('บันทึกเจ้าหน้าที่').textContent).toBe('ที่มา: บันทึกเจ้าหน้าที่');
    expect(render(null).innerHTML).toBe('');
  });
});
