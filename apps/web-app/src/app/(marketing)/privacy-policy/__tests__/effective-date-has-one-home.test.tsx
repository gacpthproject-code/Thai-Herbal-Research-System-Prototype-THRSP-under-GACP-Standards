import * as fs from 'fs';
import * as path from 'path';
import { renderToStaticMarkup } from 'react-dom/server';
import PrivacyPolicyPage from '../page';

const source = fs.readFileSync(path.join(__dirname, '..', 'page.tsx'), 'utf8');
const effective = /const POLICY_EFFECTIVE = '([^']+)';/.exec(source)?.[1] ?? '';

describe('the effective date comes from POLICY_EFFECTIVE', () => {
  const root = document.createElement('div');
  root.innerHTML = renderToStaticMarkup(<PrivacyPolicyPage />);
  const label = Array.from(root.querySelectorAll('dt')).find((dt) => dt.textContent === 'วันที่มีผลบังคับใช้:');

  it('shows POLICY_EFFECTIVE as the effective date', () => {
    expect(effective).not.toBe('');
    expect(label?.nextElementSibling?.textContent).toBe(effective);
  });

  it('prints that date nowhere else on the page', () => {
    expect((root.textContent ?? '').split(effective)).toHaveLength(2);
  });
});
