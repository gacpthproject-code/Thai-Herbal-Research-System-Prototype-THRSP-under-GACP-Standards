import { MINISTRY_CONTACT, ministryTelHref } from '../ministry-contact';

describe('MINISTRY_CONTACT', () => {
  it('phone matches DTAM-confirmed value 0-2591-7007', () => {
    expect(MINISTRY_CONTACT.phone).toBe('0-2591-7007');
  });

  it('carries no mailbox: contact@gacpth.com is the platform\'s, not the department\'s', () => {
    expect(MINISTRY_CONTACT).not.toHaveProperty('email');
  });

  it('ministry name + website match official DTAM strings', () => {
    expect(MINISTRY_CONTACT.ministry).toBe(
      'กรมการแพทย์แผนไทยและการแพทย์ทางเลือก',
    );
    expect(MINISTRY_CONTACT.website).toBe('https://dtam.moph.go.th');
  });

  it('ministryTelHref converts dashed local format to E.164 +66', () => {
    expect(ministryTelHref()).toBe('tel:+6625917007');
  });

  it('the constant object is frozen against accidental mutation at runtime', () => {
    expect(Object.isFrozen(MINISTRY_CONTACT)).toBe(true);
  });
});
