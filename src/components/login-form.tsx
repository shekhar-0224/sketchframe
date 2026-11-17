"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Fingerprint, Mail } from "lucide-react";
import { toast } from "sonner";
import { Button, Input, Label, Logo, api } from "@/components/ui";
import { passkeysSupported, signInWithPasskey } from "@/lib/passkey-client";

/**
 * Sign-in. Passkey (Face ID / fingerprint) first — it needs no email or setup — then
 * "Try free", then Google / email codes only where this server has them configured.
 */
export function LoginForm({ google, email: emailEnabled }: { google: boolean; email: boolean }) {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/";
  const error = params.get("error");
  useEffect(() => {
    if (error) toast.error(error === "google-off" ? "Google sign-in isn't set up yet." : error);
  }, [error]);
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [devHint, setDevHint] = useState(false);
  const codeRef = useRef<HTMLInputElement>(null);

  async function requestCode(e?: React.FormEvent) {
    e?.preventDefault();
    setBusy(true);
    try {
      const res = await api<{ dev: boolean }>("/api/auth/request", { method: "POST", json: { email } });
      setDevHint(res.dev);
      setStep("code");
      setCode("");
      setTimeout(() => codeRef.current?.focus(), 50);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function tryFree() {
    setBusy(true);
    try {
      await api("/api/auth/guest", { method: "POST" });
      router.replace(next.startsWith("/") ? next : "/");
      router.refresh();
    } catch (err) {
      toast.error((err as Error).message);
      setBusy(false);
    }
  }

  async function passkey() {
    if (!passkeysSupported()) return toast.error("This browser can't use passkeys. Try Chrome, Safari or Edge.");
    setBusy(true);
    try {
      await signInWithPasskey();
      router.replace(next.startsWith("/") ? next : "/");
      router.refresh();
    } catch (err) {
      toast((err as Error).message);
      setBusy(false);
    }
  }

  async function verify(e?: React.FormEvent) {
    e?.preventDefault();
    setBusy(true);
    try {
      await api("/api/auth/verify", { method: "POST", json: { email, code } });
      router.replace(next.startsWith("/") ? next : "/");
      router.refresh();
    } catch (err) {
      toast.error((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center px-4">
      <div className="paper-card w-full max-w-sm overflow-hidden shadow-[6px_6px_0_0_var(--ink)]">
        <div className="titlebar flex h-8 items-center justify-center border-b-2 border-ink">
          <span className="bg-card px-3 font-display text-[15px] leading-none">Welcome</span>
        </div>
        <div className="space-y-5 p-6">
          <Logo />
          {step === "email" ? (
            <form onSubmit={requestCode} className="space-y-4">
              <Button type="button" variant="ink" size="lg" className="w-full" onClick={tryFree} loading={busy}>
                Start free — no account needed
              </Button>
              {/* Passkeys only exist after "Save my work"; for anyone else the browser shows a confusing "scan / security key" prompt. */}
              <button
                type="button"
                onClick={passkey}
                disabled={busy}
                className="flex w-full items-center justify-center gap-1.5 text-[13px] font-semibold text-graphite underline-offset-2 hover:text-ink hover:underline"
              >
                <Fingerprint className="h-4 w-4" /> Saved your work before? Sign in with face or fingerprint
              </button>
              {google && (
                <a
                  href={`/api/auth/google?next=${encodeURIComponent(next)}`}
                  className="key flex h-11 w-full items-center justify-center gap-2.5 text-[14px] font-semibold"
                >
                  <GoogleIcon /> Continue with Google
                </a>
              )}
              {emailEnabled && (
                <>
                  <div className="flex items-center gap-2 pt-1 text-[12px] text-graphite">
                    <span className="h-px flex-1 bg-rule" /> or get a code by email <span className="h-px flex-1 bg-rule" />
                  </div>
                  <label className="block">
                    <Label>Email</Label>
                    <Input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@studio.com" />
                  </label>
                  <Button variant="outline" className="w-full" loading={busy} type="submit">
                    <Mail className="h-4 w-4" /> Email me a code
                  </Button>
                </>
              )}
            </form>
          ) : (
            <form onSubmit={verify} className="space-y-4">
              <p className="text-[14px] text-graphite">
                We sent a code to <b className="text-ink">{email}</b>.
                {devHint && " (Local mode: the code is printed in the server terminal.)"}
              </p>
              <label className="block">
                <Label>6-digit code</Label>
                <Input
                  ref={codeRef}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                  className="h-12 text-center font-mono text-2xl tracking-[0.5em]"
                />
              </label>
              <Button variant="primary" className="w-full" loading={busy} type="submit" disabled={code.length !== 6}>
                Sign in
              </Button>
              <div className="flex justify-between text-[12.5px]">
                <button type="button" onClick={() => setStep("email")} className="flex items-center gap-1 text-graphite hover:text-ink">
                  <ArrowLeft className="h-3 w-3" /> Different email
                </button>
                <button type="button" onClick={() => requestCode()} className="text-graphite underline hover:text-ink" disabled={busy}>
                  Resend code
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 48 48" className="h-5 w-5" aria-hidden>
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.6 5.4 2.7 13.3l7.9 6.1C12.5 13.6 17.8 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.1 5.5c4.2-3.9 7.2-9.6 7.2-16.9z" />
      <path fill="#FBBC05" d="M10.6 28.6c-.5-1.5-.8-3-.8-4.6s.3-3.1.8-4.6l-7.9-6.1C1 16.6 0 20.2 0 24s1 7.4 2.7 10.7l7.9-6.1z" />
      <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.1-5.5c-2 1.4-4.6 2.2-8.8 2.2-6.2 0-11.5-4.1-13.4-9.9l-7.9 6.1C6.6 42.6 14.6 48 24 48z" />
    </svg>
  );
}
