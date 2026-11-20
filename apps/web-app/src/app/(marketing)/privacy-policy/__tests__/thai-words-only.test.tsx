import { renderToStaticMarkup } from 'react-dom/server';
import PrivacyPolicyPage, { metadata } from '../page';

const ALLOWED = [
  { latin: 'GACP', why: 'the name of the standard the certificate is issued under, as the certificate and every other page print it' },
  { latin: 'TLS 1.2', why: 'the number of the encryption standard, after its Thai description; encryption-claim-accuracy pins the claim' },
  { latin: 'contact@gacpth.com', why: 'an email address the reader types to use their rights' },
];

function shownText(): string {
  const root = document.createElement('div');
  root.innerHTML = renderToStaticMarkup(<PrivacyPolicyPage />);
  return [metadata.title, metadata.description, root.textContent].join('\n');
}

describe('the privacy notice prints Thai words (order 51)', () => {
  const text = shownText();

  it('has no English word outside the allowlist', () => {
    const rest = ALLOWED.reduce((left, { latin }) => left.split(latin).join(' '), text);
    expect(rest.match(/[A-Za-z][\w./@-]*/g) ?? []).toEqual([]);
  });

  it('claims no ISO/IEC 27001 certification in any script, bare number included: none is on record (review F-7)', () => {
    expect(text).not.toMatch(/27001|ไอเอสโอ|ISO/i);
  });

  it.each(ALLOWED)('allows $latin: $why', ({ latin }) => {
    expect(text).toContain(latin);
  });
});
