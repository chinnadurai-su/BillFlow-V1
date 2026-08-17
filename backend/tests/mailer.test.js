// mailer.test.js — socket-free unit tests for the SendGrid mailer (utils/mailer.js).
//
// These need neither the @sendgrid/mail package installed nor a network connection: buildSendGridMessage
// is pure, and sendMail with no SENDGRID_API_KEY takes the dry-run path (never requires the SDK).

const { buildSendGridMessage, sendMail, _resetForTests } = require('../src/utils/mailer');

describe('mailer.buildSendGridMessage (SendGrid payload shape)', () => {
  it('maps to/subject/html/text and defaults from to EMAIL_FROM', () => {
    const prev = process.env.EMAIL_FROM;
    process.env.EMAIL_FROM = 'BillFlow <billing@billflow.test>';
    const msg = buildSendGridMessage({
      to: 'c@x.com',
      subject: 'Invoice INV-1',
      html: '<p>hi</p>',
      text: 'hi',
    });
    expect(msg.to).toBe('c@x.com');
    expect(msg.subject).toBe('Invoice INV-1');
    expect(msg.html).toBe('<p>hi</p>');
    expect(msg.text).toBe('hi');
    expect(msg.from).toBe('BillFlow <billing@billflow.test>');
    process.env.EMAIL_FROM = prev;
  });

  it('converts a Buffer attachment to base64 with SendGrid fields', () => {
    const msg = buildSendGridMessage({
      to: 'c@x.com',
      subject: 'S',
      attachments: [{ filename: 'INV-1.pdf', content: Buffer.from('hello') }],
    });
    expect(msg.attachments).toHaveLength(1);
    const att = msg.attachments[0];
    expect(att.content).toBe(Buffer.from('hello').toString('base64')); // "aGVsbG8="
    expect(att.filename).toBe('INV-1.pdf');
    expect(att.type).toBe('application/pdf');
    expect(att.disposition).toBe('attachment');
  });

  it('omits attachments when none are given', () => {
    const msg = buildSendGridMessage({ to: 'c@x.com', subject: 'S', text: 't' });
    expect(msg.attachments).toBeUndefined();
  });
});

describe('mailer.sendMail dry-run (no API key)', () => {
  const prevKey = process.env.SENDGRID_API_KEY;
  beforeEach(() => {
    delete process.env.SENDGRID_API_KEY;
    _resetForTests();
  });
  afterAll(() => {
    if (prevKey !== undefined) process.env.SENDGRID_API_KEY = prevKey;
  });

  it('returns a dry-run stub (composes but does not send, never requires the SDK)', async () => {
    const result = await sendMail({ to: 'c@x.com', subject: 'S', text: 'body' });
    expect(result.dryRun).toBe(true);
    expect(result.message.to).toBe('c@x.com');
    expect(result.message.subject).toBe('S');
  });
});
