// Sends email through Amazon SES (same setup as WitGang).
// SES accepts "Name <address>" strings directly.
const { SESClient, SendEmailCommand } = require('@aws-sdk/client-ses');

const ses = new SESClient({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const FROM_VERIFY = `ClueMeIn Email Verification <${process.env.FROM_EMAIL}>`;
const FROM_RESET = `ClueMeIn Password Reset <${process.env.FROM_EMAIL}>`;

async function sendEmail({ from, to, subject, text, html }) {
  await ses.send(
    new SendEmailCommand({
      Source: from,
      Destination: { ToAddresses: [to] },
      Message: {
        Subject: { Data: subject, Charset: 'UTF-8' },
        Body: {
          Text: { Data: text, Charset: 'UTF-8' },
          Html: { Data: html, Charset: 'UTF-8' },
        },
      },
    })
  );
}

module.exports = { sendEmail, FROM_VERIFY, FROM_RESET };
