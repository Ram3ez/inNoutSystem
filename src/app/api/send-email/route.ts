import { NextRequest, NextResponse } from "next/server";
export const dynamic = 'force-dynamic';

/**
 * Send Email API Route
 * Handles sending automated leave and extension notifications via SMTP.
 * Includes manual .env.local loading for standalone deployments and IPv4 strict lookup.
 */

import nodemailer from "nodemailer";
import { lookup } from "dns";
import fs from "fs";
import path from "path";

// Force load .env.local for standalone mode compatibility
if (!process.env.SMTP_USER) {
  try {
    const envPath = path.resolve(process.cwd(), ".env.local");
    if (fs.existsSync(envPath)) {
      const envContent = fs.readFileSync(envPath, "utf8");
      envContent.split("\n").forEach((line) => {
        const trimmedLine = line.trim();
        if (!trimmedLine || trimmedLine.startsWith("#")) return;
        const [key, ...valueParts] = trimmedLine.split("=");
        if (key && valueParts.length > 0) {
          const value = valueParts.join("=").trim().replace(/^["']|["']$/g, "");
          process.env[key.trim()] = value;
        }
      });
      console.log("SUCCESS: Manually loaded .env.local variables");
    }
  } catch (err) {
    console.error("FAILED: Could not manually load .env.local", err);
  }
}

// Custom dns lookup function that restricts resolution strictly to IPv4
const ipv4Lookup = (hostname: string, options: any, callback: any) => {
  return lookup(hostname, { family: 4 }, (err, address, family) => {
    callback(err, address, family);
  });
};

import { API_SECRET } from "@/lib/constants";

export async function POST(req: NextRequest) {
  try {
    const apiSecret = req.headers.get("X-API-Secret") || req.headers.get("x-api-secret");
    if (apiSecret !== API_SECRET) {
      return NextResponse.json(
        { success: false, message: "Unauthorized API access denied" },
        { status: 401 }
      );
    }

    const payload = await req.json();
    console.log("SEND-EMAIL API received payload:", payload);
    const {
      parentEmail,
      parentName,
      studentName,
      reason,
      place,
      dates,
      advisorName,
      advisorEmail,
      advisorPhone,
      type,
      studentRollNo,
      studentEmail,
      studentPhone,
      newInDate,
    } = payload;

    if (type === "extension") {
      if (!advisorEmail || !studentName) {
        return NextResponse.json(
          { success: false, message: "Missing required fields for extension" },
          { status: 400 },
        );
      }
    } else {
      if (!parentEmail || !studentName) {
        return NextResponse.json(
          { success: false, message: "Missing required fields" },
          { status: 400 },
        );
      }
    }

    // Explicitly cast as any to bypass ambiguous TypeScript type overloads in nodemailer
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || "smtp.gmail.com",
      port: parseInt(process.env.SMTP_PORT || "587"),
      secure: process.env.SMTP_SECURE === "true", // false for 587/STARTTLS, true for 465/SSL
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASSWORD,
      },
      lookup: ipv4Lookup, // Prevents any attempt to connect via IPv6
      tls: {
        rejectUnauthorized: true,
      },
    } as any);

    if (type === "extension") {
      await transporter.sendMail({
        from: `"Hostel Management System" <${process.env.SMTP_USER}>`,
        to: advisorEmail,
        subject: `Leave Extension Notification - ${studentName} (${studentRollNo})`,
        text:
          `Dear Advisor,\n\n` +
          `This is to inform you that your student, ${studentName}, has extended their leave.\n\n` +
          `Extension Details:\n` +
          `- Student Name: ${studentName}\n` +
          `- Roll Number: ${studentRollNo}\n` +
          `- Email: ${studentEmail || "N/A"}\n` +
          `- Phone: ${studentPhone || "N/A"}\n` +
          `- New Planned Return Date: ${newInDate}\n\n` +
          `Best regards,\n` +
          `Hostel Management System`,
        html: `
  <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #F8FAFC; padding: 40px 20px; color: #0F172A; text-align: center;">
    <div style="max-width: 580px; margin: 0 auto; background-color: #FFFFFF; border-radius: 16px; border: 1px solid #E2E8F0; overflow: hidden; text-align: left; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
      
      <!-- Header -->
      <div style="background-color: #003366; padding: 32px; text-align: center;">
        <h1 style="color: #FFFFFF; font-size: 20px; font-weight: 800; text-transform: uppercase; letter-spacing: 2px; margin: 0;">
          Leave Extension
        </h1>
        <p style="color: rgba(255, 255, 255, 0.7); font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 1.5px; margin: 6px 0 0 0;">
          Hostel Management System
        </p>
      </div>
  
      <!-- Content -->
      <div style="padding: 32px 32px 24px 32px;">
        <p style="font-size: 16px; line-height: 24px; color: #1E293B; margin: 0 0 20px 0;">
          Dear <strong>Advisor</strong>,
        </p>
        <p style="font-size: 15px; line-height: 24px; color: #334155; margin: 0 0 24px 0;">
          This is to inform you that your student, <strong style="color: #003366;">${studentName}</strong>, has extended their leave.
        </p>
  
        <!-- Details Box -->
        <div style="background-color: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 12px; padding: 24px; margin: 0 0 28px 0;">
          <h3 style="color: #003366; font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 1.5px; margin: 0 0 16px 0;">
            Extension Details
          </h3>
          
          <div style="margin-bottom: 14px;">
            <p style="font-size: 11px; font-weight: 700; color: #64748B; text-transform: uppercase; letter-spacing: 1px; margin: 0 0 4px 0;">Student Name</p>
            <p style="font-size: 14px; font-weight: 500; color: #0F172A; margin: 0;">${studentName}</p>
          </div>
  
          <div style="margin-bottom: 14px;">
            <p style="font-size: 11px; font-weight: 700; color: #64748B; text-transform: uppercase; letter-spacing: 1px; margin: 0 0 4px 0;">Roll Number</p>
            <p style="font-size: 14px; font-weight: 500; color: #0F172A; margin: 0;">${studentRollNo}</p>
          </div>
  
          <div style="margin-bottom: 14px;">
            <p style="font-size: 11px; font-weight: 700; color: #64748B; text-transform: uppercase; letter-spacing: 1px; margin: 0 0 4px 0;">Student Email</p>
            <p style="font-size: 14px; font-weight: 500; color: #0F172A; margin: 0;">${studentEmail || "N/A"}</p>
          </div>

          <div style="margin-bottom: 14px;">
            <p style="font-size: 11px; font-weight: 700; color: #64748B; text-transform: uppercase; letter-spacing: 1px; margin: 0 0 4px 0;">Student Phone</p>
            <p style="font-size: 14px; font-weight: 500; color: #0F172A; margin: 0;">${studentPhone || "N/A"}</p>
          </div>
  
          <div>
            <p style="font-size: 11px; font-weight: 700; color: #64748B; text-transform: uppercase; letter-spacing: 1px; margin: 0 0 4px 0;">New Planned Return</p>
            <p style="font-size: 14px; font-weight: 500; color: #0F172A; margin: 0;">${newInDate}</p>
          </div>
        </div>
  
        <!-- Signature -->
        <p style="font-size: 14px; line-height: 22px; color: #475569; margin: 0;">
          Best regards,<br>
          Hostel Management System
        </p>
      </div>
  
      <!-- Footer -->
      <div style="background-color: #F8FAFC; border-top: 1px solid #E2E8F0; padding: 18px 32px; text-align: center;">
        <p style="font-size: 11px; color: #94A3B8; margin: 0;">
          This is an automated notification. Please do not reply directly to this email.
        </p>
      </div>
    </div>
  </div>
  `,
      });

      return NextResponse.json({
        success: true,
        message: "Extension notification email sent directly via SMTP to advisor!",
      });
    }

    // Send the email directly
    await transporter.sendMail({
      from: `"Hostel Management System" <${process.env.SMTP_USER}>`,
      to: parentEmail,
      subject: `Leave Notification for your ward ${studentName}`,
      text:
        `Dear ${parentName},\n\n` +
        `This is to inform you that your ward, ${studentName}, has applied for leave.\n\n` +
        `Leave Details:\n` +
        `- Reason: ${reason}\n` +
        `- Place of Visit: ${place || "N/A"}\n` +
        `- Duration: ${dates}\n\n` +
        `Advisor Contact Information:\n` +
        `- Advisor Name: ${advisorName}\n` +
        `- Advisor Email: ${advisorEmail}\n` +
        `- Advisor Phone: ${advisorPhone || "N/A"}\n\n` +
        `Please feel free to contact the advisor if you have any issues or concerns.\n\n` +
        `Best regards,\n` +
        `${advisorName}\n` +
        `Hostel Management System`,
      html: `
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #F8FAFC; padding: 40px 20px; color: #0F172A; text-align: center;">
  <div style="max-width: 580px; margin: 0 auto; background-color: #FFFFFF; border-radius: 16px; border: 1px solid #E2E8F0; overflow: hidden; text-align: left; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
    
    <!-- Header -->
    <div style="background-color: #003366; padding: 32px; text-align: center;">
      <h1 style="color: #FFFFFF; font-size: 20px; font-weight: 800; text-transform: uppercase; letter-spacing: 2px; margin: 0;">
        Leave Notification
      </h1>
      <p style="color: rgba(255, 255, 255, 0.7); font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 1.5px; margin: 6px 0 0 0;">
        Hostel Management System
      </p>
    </div>

    <!-- Content -->
    <div style="padding: 32px 32px 24px 32px;">
      <p style="font-size: 16px; line-height: 24px; color: #1E293B; margin: 0 0 20px 0;">
        Dear <strong>${parentName || "Parent/Guardian"}</strong>,
      </p>
      <p style="font-size: 15px; line-height: 24px; color: #334155; margin: 0 0 24px 0;">
        This is to inform you that your ward, <strong style="color: #003366;">${studentName}</strong>, has applied for leave.
      </p>

      <!-- Details Box -->
      <div style="background-color: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 12px; padding: 24px; margin: 0 0 28px 0;">
        <h3 style="color: #003366; font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 1.5px; margin: 0 0 16px 0;">
          Leave Details
        </h3>
        
        <div style="margin-bottom: 14px;">
          <p style="font-size: 11px; font-weight: 700; color: #64748B; text-transform: uppercase; letter-spacing: 1px; margin: 0 0 4px 0;">Reason for Leave</p>
          <p style="font-size: 14px; font-weight: 500; color: #0F172A; margin: 0;">${reason}</p>
        </div>

        <div style="margin-bottom: 14px;">
          <p style="font-size: 11px; font-weight: 700; color: #64748B; text-transform: uppercase; letter-spacing: 1px; margin: 0 0 4px 0;">Place of Visit</p>
          <p style="font-size: 14px; font-weight: 500; color: #0F172A; margin: 0;">${place || "N/A"}</p>
        </div>

        <div>
          <p style="font-size: 11px; font-weight: 700; color: #64748B; text-transform: uppercase; letter-spacing: 1px; margin: 0 0 4px 0;">Duration</p>
          <p style="font-size: 14px; font-weight: 500; color: #0F172A; margin: 0;">${dates}</p>
        </div>
      </div>

      <!-- Advisor Box -->
      <div style="background-color: #F1F5F9; border-radius: 12px; padding: 20px; margin: 0 0 28px 0;">
        <h4 style="color: #8B0000; font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 1.5px; margin: 0 0 12px 0;">
          Advisor Contact Information
        </h4>
        <p style="font-size: 14px; color: #1E293B; margin: 0 0 6px 0;">
          <strong>Name:</strong> ${advisorName || "N/A"}
        </p>
        <p style="font-size: 14px; color: #1E293B; margin: 0 0 6px 0;">
          <strong>Email:</strong> ${advisorEmail || "N/A"}
        </p>
        <p style="font-size: 14px; color: #1E293B; margin: 0;">
          <strong>Phone:</strong> ${advisorPhone || "N/A"}
        </p>
      </div>

      <!-- Contact Notice -->
      <p style="font-size: 13px; line-height: 22px; color: #64748B; background-color: #F8FAFC; border: 1px solid #E2E8F0; border-left: 4px solid #8B0000; border-radius: 6px; padding: 12px 16px; margin: 0 0 28px 0; font-style: italic;">
        Please feel free to contact the advisor directly if you have any issues or concerns regarding this leave request.
      </p>

      <!-- Signature -->
      <p style="font-size: 14px; line-height: 22px; color: #475569; margin: 0;">
        Best regards,<br>
        <strong style="color: #0F172A;">${advisorName || "Faculty Advisor"}</strong><br>
        Hostel Management System
      </p>
    </div>

    <!-- Footer -->
    <div style="background-color: #F8FAFC; border-top: 1px solid #E2E8F0; padding: 18px 32px; text-align: center;">
      <p style="font-size: 11px; color: #94A3B8; margin: 0;">
        This is an automated notification. Please do not reply directly to this email.
      </p>
    </div>
  </div>
</div>
`,
    });

    return NextResponse.json({
      success: true,
      message: "Email sent directly via SMTP using TLS over IPv4 strictly!",
    });
  } catch (err: any) {
    console.error("Error sending email via API:", err);
    return NextResponse.json(
      { success: false, error: err.message || "Failed to send email" },
      { status: 500 },
    );
  }
}
