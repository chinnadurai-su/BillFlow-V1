// notification.test.js — placeholder tests for the notification module (Spec Section 7.4).
// Notifications are worker-triggered (no HTTP routes); tests exercise the service directly.
// Uses it.todo so the suite is valid (won't fail) until the real tests land.

describe('notification module', () => {
  // TODO: test email sending
  it.todo('sendInvoiceEmail builds the message from the template and sends via Nodemailer');
  it.todo('attaches the generated PDF to the invoice email');
  it.todo('never includes secrets or payment card data in the email (Spec 7.3)');
});
