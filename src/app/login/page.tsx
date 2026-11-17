import { Suspense } from "react";
import { LoginForm } from "@/components/login-form";
import { googleEnabled } from "@/lib/google";
import { emailConfigured } from "@/lib/email";

export const metadata = { title: "Sign in — SketchFrame" };

export default function LoginPage() {
  // Email codes need a sender; locally they print to the terminal instead.
  const email = emailConfigured() || !process.env.VERCEL;
  return (
    <Suspense>
      <LoginForm google={googleEnabled()} email={email} />
    </Suspense>
  );
}
