const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'gmail', // or your email service
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

const sendEmail = (to, subject, html) => {
  const mailOptions = {
    from: process.env.EMAIL_USER,
    to,
    subject,
    html
  };

  return transporter.sendMail(mailOptions);
};

const sendBorrowStatusNotification = (userEmail, userName, itemName, status) => {
  const subject = `Borrow Status Update: ${itemName}`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #001C94;">THM System - Borrow Status Update</h2>
      <p>Dear ${userName},</p>
      <p>Your borrow request for <strong>${itemName}</strong> has been updated.</p>
      <p><strong>New Status:</strong> ${status}</p>
      <p>Please check your dashboard for more details.</p>
      <br>
      <p>Best regards,<br>THM System Team</p>
    </div>
  `;

  return sendEmail(userEmail, subject, html);
};

module.exports = {
  sendEmail,
  sendBorrowStatusNotification
};