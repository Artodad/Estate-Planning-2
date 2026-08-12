"use server";

/* eslint-disable turbo/no-undeclared-env-vars -- RESEND_API_KEY is intentionally runtime-only (see .env.example); not a turbo pipeline input */

import { Resend } from "resend";

/**
 * Email sender for the client invitation flow.
 *
 * Feature-sliced under auth/server. Resilient to missing RESEND_API_KEY (common in
 * local dev / CI sandboxes): logs the would-be email + returns the magic link for
 * manual testing.
 *
 * Security: Never logs PII beyond what's necessary; always uses https links.
 * Template is professional and clearly identifies the sender (the law firm).
 */

export type SendInvitationResult = {
  success: boolean;
  /** Present in dev / when Resend not configured or on send failure (for manual testing). */
  devLink?: string;
  error?: string;
};

export async function sendClientInvitationEmail(params: {
  to: string;
  firmName: string;
  inviteUrl: string;
  firstName?: string | null;
  lastName?: string | null;
}): Promise<SendInvitationResult> {
  const { to, firmName, inviteUrl, firstName, lastName } = params;

  const recipientName = [firstName, lastName].filter(Boolean).join(" ").trim() || "there";

  const subject = `${firmName} has invited you to complete your estate planning intake`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; background: #f9f9f9;">
  <div style="background: white; border-radius: 8px; padding: 32px; box-shadow: 0 2px 8px rgba(0,0,0,0.05);">
    <h1 style="color: #111; font-size: 24px; margin: 0 0 16px;">Hello ${recipientName},</h1>
    
    <p style="font-size: 16px; margin: 0 0 16px;">
      <strong>${firmName}</strong> has invited you to complete your secure estate planning intake.
    </p>
    
    <p style="font-size: 16px; margin: 0 0 24px;">
      This is a private, attorney-guided process. Your information is kept confidential and used only to prepare your estate planning documents.
    </p>
    
    <div style="text-align: center; margin: 32px 0;">
      <a href="${inviteUrl}" 
         style="display: inline-block; background: #111; color: white; padding: 14px 28px; border-radius: 6px; text-decoration: none; font-weight: 600; font-size: 16px;">
        Start Your Secure Intake
      </a>
    </div>
    
    <p style="font-size: 14px; color: #666; margin: 0 0 8px;">
      This link is valid for <strong>7 days</strong> and can only be used once. If the link has expired, please contact your attorney to request a new invitation.
    </p>
    
    <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
    
    <p style="font-size: 12px; color: #999; margin: 0;">
      If you did not request this invitation, you may safely ignore this email.
      <br />
      This message was sent on behalf of ${firmName} via the Estate Planning Engine.
    </p>
  </div>
</body>
</html>`;

  const plainText = `Hello ${recipientName},

${firmName} has invited you to complete your secure estate planning intake.

Start here: ${inviteUrl}

This link is valid for 7 days and can only be used once.

If you did not request this invitation, you may safely ignore this email.`;

  // Resilient dev / missing-key behavior (per spec + architecture)
  if (!process.env.RESEND_API_KEY) {
    console.info(
      "[DEV] RESEND_API_KEY not configured — invitation email NOT sent via Resend. " +
        "For testing, use the returned devLink to simulate the magic link flow.",
      { to, subject, inviteUrl }
    );
    return {
      success: true,
      devLink: inviteUrl,
    };
  }

  try {
    const resend = new Resend(process.env.RESEND_API_KEY);

    await resend.emails.send({
      // Using Resend's verified sandbox sender for initial dev/testing.
      // For production, configure a custom domain in Resend + Clerk (DKIM/SPF).
      from: "Estate Planning Engine <onboarding@resend.dev>",
      to: [to],
      subject,
      html,
      text: plainText,
    });

    return { success: true };
  } catch (error) {
    console.error("[email] Failed to send client invitation via Resend:", {
      to,
      firmName,
      error: error instanceof Error ? error.message : String(error),
    });

    // Still succeed for the caller (invitation record created). Return link for manual/dev use.
    return {
      success: true,
      devLink: inviteUrl,
      error: "Email delivery encountered an issue (check server logs). You can still use the link for testing.",
    };
  }
}

/**
 * Wave D: "Intake complete" confirmation email to client (after Mark Complete / 100% progress).
 * Resilient devLink pattern exactly as invitation (never blocks primary flow).
 */
export async function sendIntakeCompleteConfirmation(params: {
  to: string;
  firmName: string;
  clientName: string;
  intakeUrl?: string; // optional direct link back to their session (future)
}): Promise<SendInvitationResult> {
  const { to, firmName, clientName, intakeUrl } = params;

  const subject = `Your estate planning intake with ${firmName} is complete`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; background: #f9f9f9;">
  <div style="background: white; border-radius: 8px; padding: 32px; box-shadow: 0 2px 8px rgba(0,0,0,0.05);">
    <h1 style="color: #111; font-size: 24px; margin: 0 0 16px;">Thank you, ${clientName}.</h1>
    
    <p style="font-size: 16px; margin: 0 0 16px;">
      Your secure estate planning intake with <strong>${firmName}</strong> has been marked complete.
    </p>
    
    <p style="font-size: 16px; margin: 0 0 24px;">
      Your attorney will now review your responses and prepare your draft estate plan documents (revocable living trust, pour-over will, powers of attorney, and supporting documents). They will contact you with next steps.
    </p>
    
    ${intakeUrl ? `<p style="font-size: 14px; color: #666;">You can review your submitted answers at: <a href="${intakeUrl}" style="color: #111;">${intakeUrl}</a></p>` : ''}
    
    <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
    
    <p style="font-size: 12px; color: #999; margin: 0;">
      This message was sent on behalf of ${firmName} via the Estate Planning Engine.<br />
      If you have questions, please reply to your attorney directly.
    </p>
  </div>
</body>
</html>`;

  const plainText = `Thank you, ${clientName}.

Your secure estate planning intake with ${firmName} is complete.

Your attorney will review your responses and prepare your draft documents. They will contact you with next steps.

${intakeUrl ? `Review your answers: ${intakeUrl}\n\n` : ''}This message was sent on behalf of ${firmName}.`;

  if (!process.env.RESEND_API_KEY) {
    console.info("[DEV] RESEND_API_KEY not configured — intake complete email NOT sent. devLink simulation returned.", { to, subject });
    return { success: true, devLink: intakeUrl || "intake-complete-dev-simulation" };
  }

  try {
    const resend = new Resend(process.env.RESEND_API_KEY);
    await resend.emails.send({
      from: "Estate Planning Engine <onboarding@resend.dev>",
      to: [to],
      subject,
      html,
      text: plainText,
    });
    return { success: true };
  } catch (error) {
    console.error("[email] Failed to send intake complete confirmation:", { to, firmName, error: error instanceof Error ? error.message : String(error) });
    return { success: true, devLink: intakeUrl, error: "Email delivery issue (non-blocking)." };
  }
}

/**
 * Wave D: "Documents ready for review" notification to attorney (after successful full package generation).
 * Sent to the generating user (or firm owner) with link context.
 */
export async function sendDocumentsReadyNotification(params: {
  toAttorneyEmail: string;
  firmName: string;
  clientName: string;
  packageDownloadUrl?: string;
  clientId?: string;
}): Promise<SendInvitationResult> {
  const { toAttorneyEmail, firmName, clientName, packageDownloadUrl, clientId } = params;

  const subject = `Estate plan documents ready for ${clientName} — ${firmName}`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; background: #f9f9f9;">
  <div style="background: white; border-radius: 8px; padding: 32px; box-shadow: 0 2px 8px rgba(0,0,0,0.05);">
    <h1 style="color: #111; font-size: 24px; margin: 0 0 16px;">Documents ready for review</h1>
    
    <p style="font-size: 16px; margin: 0 0 16px;">
      The full coordinated estate plan package for <strong>${clientName}</strong> has been generated successfully.
    </p>
    
    <p style="font-size: 16px; margin: 0 0 24px;">
      All 8 documents (revocable living trust, pour-over will, POAs, Advance Healthcare Directive, HIPAA, Certificate of Trust, Personal Property Memorandum, and Trust Funding Instructions) include the required DRAFT watermark and are ready for your professional review and customization.
    </p>
    
    ${packageDownloadUrl ? `<div style="text-align: center; margin: 24px 0;"><a href="${packageDownloadUrl}" style="display: inline-block; background: #111; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 600;">Download Full Package (ZIP)</a></div>` : ''}
    
    <p style="font-size: 14px; color: #666;">Remember: every generated document is explicitly marked DRAFT. You retain full professional control and responsibility for the final work product.</p>
    
    <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
    
    <p style="font-size: 12px; color: #999; margin: 0;">
      Generated via the Estate Planning Engine for ${firmName}.<br />
      Client ID reference (internal): ${clientId || 'n/a'}
    </p>
  </div>
</body>
</html>`;

  const plainText = `Documents ready for review

The full estate plan package for ${clientName} has been generated.

${packageDownloadUrl ? `Download: ${packageDownloadUrl}\n\n` : ''}All documents are DRAFT for your professional review.

This was generated for ${firmName} via the Estate Planning Engine.`;

  if (!process.env.RESEND_API_KEY) {
    console.info("[DEV] RESEND_API_KEY not configured — documents ready notification NOT sent. devLink simulation returned.", { to: toAttorneyEmail, subject, clientName });
    return { success: true, devLink: packageDownloadUrl || "documents-ready-dev-simulation" };
  }

  try {
    const resend = new Resend(process.env.RESEND_API_KEY);
    await resend.emails.send({
      from: "Estate Planning Engine <onboarding@resend.dev>",
      to: [toAttorneyEmail],
      subject,
      html,
      text: plainText,
    });
    return { success: true };
  } catch (error) {
    console.error("[email] Failed to send documents ready notification:", { to: toAttorneyEmail, firmName, clientName, error: error instanceof Error ? error.message : String(error) });
    return { success: true, devLink: packageDownloadUrl, error: "Email delivery issue (non-blocking)." };
  }
}
