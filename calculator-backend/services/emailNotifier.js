// utils/emailNotifier.js - Email notification utility for admin alerts
const nodemailer = require('nodemailer');

// Create reusable transporter using Microsoft 365 SMTP
const createTransporter = () => {
  try {
    return nodemailer.createTransport({
      host: process.env.SMTP_SERVER,           // smtp.office365.com
      port: parseInt(process.env.SMTP_PORT),   // 587
      secure: false,                           // false for TLS/STARTTLS
      auth: {
        user: process.env.EMAIL_USER,          // Notif@valerionhealth.in
        pass: process.env.EMAIL_PASS           // Your password
      },
      tls: {
        ciphers: 'SSLv3',
        rejectUnauthorized: false
      },
      requireTLS: true
    });
  } catch (error) {
    console.error('Error creating email transporter:', error);
    throw error;
  }
};

/**
 * Send delete request notification email to admin(s)
 */
const sendDeleteRequestNotification = async ({
  adminEmails,       // Array of admin email addresses
  resourceName,
  resourceEmail,
  clientName,
  allocationId,
  allocationDate,
  subprojectName,
  requestId,
  requestType,
  deleteReason,
  dashboardUrl
}) => {
  try {
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
      console.log('[EMAIL] SMTP not configured - skipping delete request notification');
      console.log('[EMAIL] Details:', { resourceName, clientName, allocationId, deleteReason });
      return { success: false, reason: 'SMTP not configured' };
    }

    if (!adminEmails || adminEmails.length === 0) {
      console.log('[EMAIL] No admin emails configured - skipping notification');
      return { success: false, reason: 'No admin emails' };
    }

    const transporter = createTransporter();

    const formattedDate = allocationDate 
      ? new Date(allocationDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
      : 'N/A';

    const reviewUrl = dashboardUrl || process.env.ADMIN_DASHBOARD_URL || '#';

    const htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: #dc2626; color: white; padding: 16px 20px; border-radius: 8px 8px 0 0;">
          <h2 style="margin: 0; font-size: 18px;"> Delete Request - Action Required</h2>
        </div>
        
        <div style="border: 1px solid #e5e7eb; border-top: none; padding: 20px; border-radius: 0 0 8px 8px;">
          <p style="color: #374151; font-size: 14px; margin-top: 0;">
            A resource has submitted a delete request that requires your review.
          </p>
          
          <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
            <tr>
              <td style="padding: 8px 12px; background: #f9fafb; border: 1px solid #e5e7eb; font-weight: 600; color: #374151; width: 140px; font-size: 13px;">Resource</td>
              <td style="padding: 8px 12px; border: 1px solid #e5e7eb; color: #111827; font-size: 13px;">${resourceName} (${resourceEmail})</td>
            </tr>
            <tr>
              <td style="padding: 8px 12px; background: #f9fafb; border: 1px solid #e5e7eb; font-weight: 600; color: #374151; font-size: 13px;">Client</td>
              <td style="padding: 8px 12px; border: 1px solid #e5e7eb; color: #111827; font-size: 13px;">${clientName}</td>
            </tr>
            <tr>
              <td style="padding: 8px 12px; background: #f9fafb; border: 1px solid #e5e7eb; font-weight: 600; color: #374151; font-size: 13px;">Location</td>
              <td style="padding: 8px 12px; border: 1px solid #e5e7eb; color: #111827; font-size: 13px;">${subprojectName || 'N/A'}</td>
            </tr>
            <tr>
              <td style="padding: 8px 12px; background: #f9fafb; border: 1px solid #e5e7eb; font-weight: 600; color: #374151; font-size: 13px;">Allocation Date</td>
              <td style="padding: 8px 12px; border: 1px solid #e5e7eb; color: #111827; font-size: 13px;">${formattedDate}</td>
            </tr>
            <tr>
              <td style="padding: 8px 12px; background: #f9fafb; border: 1px solid #e5e7eb; font-weight: 600; color: #374151; font-size: 13px;">Request ID</td>
              <td style="padding: 8px 12px; border: 1px solid #e5e7eb; color: #111827; font-size: 13px;">${requestId || 'N/A'}</td>
            </tr>
            <tr>
              <td style="padding: 8px 12px; background: #f9fafb; border: 1px solid #e5e7eb; font-weight: 600; color: #374151; font-size: 13px;">Request Type</td>
              <td style="padding: 8px 12px; border: 1px solid #e5e7eb; color: #111827; font-size: 13px;">${requestType || 'N/A'}</td>
            </tr>
            <tr>
              <td style="padding: 8px 12px; background: #fef2f2; border: 1px solid #e5e7eb; font-weight: 600; color: #991b1b; font-size: 13px;">Delete Reason</td>
              <td style="padding: 8px 12px; border: 1px solid #e5e7eb; color: #991b1b; font-size: 13px; font-weight: 500;">${deleteReason}</td>
            </tr>
          </table>
          
          <div style="margin-top: 20px; text-align: center;">
            <a href="${reviewUrl}" style="display: inline-block; background: #2563eb; color: white; padding: 10px 24px; border-radius: 6px; text-decoration: none; font-size: 14px; font-weight: 600;">
              Review on Dashboard
            </a>
          </div>
          
          <p style="color: #6b7280; font-size: 12px; margin-top: 20px; text-align: center;">
            This is an automated notification from the Billing Dashboard system.
          </p>
        </div>
      </div>
    `;

    const mailOptions = {
      from: `"Billing Dashboard" <${process.env.EMAIL_USER}>`,
      to: adminEmails.join(', '),
      subject: `🗑️ Delete Request: ${clientName} - ${subprojectName || 'Entry'} by ${resourceName}`,
      html: htmlContent
    };

    const info = await transporter.sendMail(mailOptions);
    console.log(`[EMAIL] Delete request notification sent: ${info.messageId}`);
    
    return { success: true, messageId: info.messageId };

  } catch (error) {
    console.error('[EMAIL] Failed to send delete request notification:', error.message);
    return { success: false, error: error.message };
  }
};


const sendDeleteRequestNotification_Development = async ({
  adminEmails,       // Array of admin email addresses
  resourceName,
  resourceEmail,
  clientName,
  allocationId,
  allocationDate,
  subprojectName,
  requestId,
  requestType,
  deleteReason,
  dashboardUrl
}) => {
  try {
    console.log('[EMAIL] Sending delete request notification to:', adminEmails);
    console.log('[EMAIL] Details:', { resourceName, clientName, allocationId, deleteReason });
    const formattedDate = allocationDate 
      ? new Date(allocationDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
      : 'N/A';

    const reviewUrl = dashboardUrl || process.env.ADMIN_DASHBOARD_URL || '#';

    const htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: #dc2626; color: white; padding: 16px 20px; border-radius: 8px 8px 0 0;">
          <h2 style="margin: 0; font-size: 18px;">🗑️ Delete Request - Action Required</h2>
        </div>
        
        <div style="border: 1px solid #e5e7eb; border-top: none; padding: 20px; border-radius: 0 0 8px 8px;">
          <p style="color: #374151; font-size: 14px; margin-top: 0;">
            A resource has submitted a delete request that requires your review.
          </p>
          
          <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
            <tr>
              <td style="padding: 8px 12px; background: #f9fafb; border: 1px solid #e5e7eb; font-weight: 600; color: #374151; width: 140px; font-size: 13px;">Resource</td>
              <td style="padding: 8px 12px; border: 1px solid #e5e7eb; color: #111827; font-size: 13px;">${resourceName} (${resourceEmail})</td>
            </tr>
            <tr>
              <td style="padding: 8px 12px; background: #f9fafb; border: 1px solid #e5e7eb; font-weight: 600; color: #374151; font-size: 13px;">Client</td>
              <td style="padding: 8px 12px; border: 1px solid #e5e7eb; color: #111827; font-size: 13px;">${clientName}</td>
            </tr>
            <tr>
              <td style="padding: 8px 12px; background: #f9fafb; border: 1px solid #e5e7eb; font-weight: 600; color: #374151; font-size: 13px;">Location</td>
              <td style="padding: 8px 12px; border: 1px solid #e5e7eb; color: #111827; font-size: 13px;">${subprojectName || 'N/A'}</td>
            </tr>
            <tr>
              <td style="padding: 8px 12px; background: #f9fafb; border: 1px solid #e5e7eb; font-weight: 600; color: #374151; font-size: 13px;">Allocation Date</td>
              <td style="padding: 8px 12px; border: 1px solid #e5e7eb; color: #111827; font-size: 13px;">${formattedDate}</td>
            </tr>
            <tr>
              <td style="padding: 8px 12px; background: #f9fafb; border: 1px solid #e5e7eb; font-weight: 600; color: #374151; font-size: 13px;">Request ID</td>
              <td style="padding: 8px 12px; border: 1px solid #e5e7eb; color: #111827; font-size: 13px;">${requestId || 'N/A'}</td>
            </tr>
            <tr>
              <td style="padding: 8px 12px; background: #f9fafb; border: 1px solid #e5e7eb; font-weight: 600; color: #374151; font-size: 13px;">Request Type</td>
              <td style="padding: 8px 12px; border: 1px solid #e5e7eb; color: #111827; font-size: 13px;">${requestType || 'N/A'}</td>
            </tr>
            <tr>
              <td style="padding: 8px 12px; background: #fef2f2; border: 1px solid #e5e7eb; font-weight: 600; color: #991b1b; font-size: 13px;">Delete Reason</td>
              <td style="padding: 8px 12px; border: 1px solid #e5e7eb; color: #991b1b; font-size: 13px; font-weight: 500;">${deleteReason}</td>
            </tr>
          </table>
          
          <div style="margin-top: 20px; text-align: center;">
            <a href="${reviewUrl}" style="display: inline-block; background: #2563eb; color: white; padding: 10px 24px; border-radius: 6px; text-decoration: none; font-size: 14px; font-weight: 600;">
              Review on Dashboard
            </a>
          </div>
          
          <p style="color: #6b7280; font-size: 12px; margin-top: 20px; text-align: center;">
            This is an automated notification from the Billing Dashboard system.
          </p>
        </div>
      </div>
    `;

    const mailOptions = {
      from: `"Billing Dashboard" <${process.env.EMAIL_USER}>`,
      to: adminEmails.join(', '),
      subject: `🗑️ Delete Request: ${clientName} - ${subprojectName || 'Entry'} by ${resourceName}`,
      html: htmlContent
    };

    console.log(mailOptions);

    return { success: true, messageId: 'dev-mode' };

  } catch (error) {
    console.error('[EMAIL] Failed to send delete request notification:', error.message);
    return { success: false, error: error.message };
  }
};
/**
 * Get admin emails from environment or database
 */
const getAdminEmails = async () => {
 
  // Fallback: query admin users from database
  try {
    const User = require('../models/User');
    const admins = await User.find({ role: 'user', status: 'active' }).select('email').lean();
    return admins.map(a => a.email);
  } catch (err) {
    console.log('[EMAIL] Could not fetch admin emails from DB:', err.message);
    return [];
  }
};

module.exports = {
  sendDeleteRequestNotification,
  sendDeleteRequestNotification_Development,
  getAdminEmails
};