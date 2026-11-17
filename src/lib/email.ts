import "server-only";

/**
 * Login-code email. Senders, in order of preference:
 *   1. Resend (RESEND_API_KEY) — needs a verified domain for real users.
 *   2. Gmail SMTP (GMAIL_USER + GMAIL_APP_PASSWORD) — no domain needed; free, ~500/day.
 *   3. Local dev only: the code is printed to the server console.
 */
const subject = (code: string) => `${code} is your SketchFrame code`;
const text = (code: string) =>
  `Your SketchFrame sign-in code is ${code}\n\nIt expires in 10 minutes. If you didn't ask for it, ignore this email.`;
const html = (code: string) => `<div style="font-family:ui-monospace,Menlo,monospace;padding:24px;border:2px solid #000;max-width:420px">
<p style="margin:0 0 12px">Your SketchFrame sign-in code:</p>
<p style="font-size:32px;letter-spacing:8px;font-weight:700;margin:0 0 12px">${code}</p>
<p style="margin:0;color:#555">Expires in 10 minutes. Didn't ask for it? Ignore this email.</p></div>`;

/** True when real emails can be sent (used by the login page to describe what will happen). */
export const emailConfigured = () => !!(process.env.RESEND_API_KEY || (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD));

export async function sendLoginCode(email: string, code: string) {
  if (process.env.RESEND_API_KEY) return sendViaResend(email, code);
  if (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) return sendViaGmail(email, code);
  if (process.env.VERCEL) throw new Error("Email sign-in isn't set up on this server yet — use Continue with Google.");
  console.log(`\n[sketchframe] Login code for ${email}: ${code}\n`);
}

async function sendViaResend(email: string, code: string) {
  const from = process.env.AUTH_EMAIL_FROM || "SketchFrame <onboarding@resend.dev>";
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: email, subject: subject(code), text: text(code), html: html(code) }),
  });
  if (!res.ok) throw new Error(`Couldn't send the email (${res.status}). ${(await res.text()).slice(0, 200)}`);
}

async function sendViaGmail(email: string, code: string) {
  const nodemailer = await import("nodemailer");
  const user = process.env.GMAIL_USER!;
  const transport = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    // App passwords are shown with spaces; Gmail accepts them without.
    auth: { user, pass: process.env.GMAIL_APP_PASSWORD!.replace(/\s+/g, "") },
  });
  try {
    await transport.sendMail({
      // Gmail rewrites any other From address to the account itself, so use it directly.
      from: `SketchFrame <${user}>`,
      to: email,
      subject: subject(code),
      text: text(code),
      html: html(code),
    });
  } catch (err) {
    throw new Error(`Couldn't send the email via Gmail: ${(err as Error).message.slice(0, 160)}`);
  }
}
