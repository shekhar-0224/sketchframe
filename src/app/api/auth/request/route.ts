import { NextResponse } from "next/server";
import { z } from "zod";
import { handlePublic } from "@/lib/api";
import { issueLoginCode, normalizeEmail } from "@/lib/auth";
import { emailConfigured, sendLoginCode } from "@/lib/email";

/** Step 1 of sign-in: email a 6-digit code. Rate limited per address. */
export const POST = handlePublic(async (req: Request) => {
  const { email } = z.object({ email: z.string().trim().email("Enter a valid email") }).parse(await req.json());
  const addr = normalizeEmail(email);
  const code = await issueLoginCode(addr);
  await sendLoginCode(addr, code);
  return NextResponse.json({ ok: true, dev: !emailConfigured() && !process.env.VERCEL });
});
