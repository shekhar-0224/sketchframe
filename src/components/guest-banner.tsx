"use client";

import { useEffect, useState } from "react";
import { Fingerprint } from "lucide-react";
import { toast } from "sonner";
import { passkeysSupported, savePasskey } from "@/lib/passkey-client";
import { Spinner } from "@/components/ui";

let me: Promise<{ guest: boolean }> | null = null;

/**
 * Guests' work lives in this browser only. One tap saves it with a passkey
 * (Face ID / fingerprint / screen lock) — no email, no password.
 */
export function GuestBanner() {
  const [guest, setGuest] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    (me ??= fetch("/api/auth/me").then((r) => (r.ok ? r.json() : { guest: false })).catch(() => ({ guest: false })))
      .then((m) => setGuest(!!m.guest));
  }, []);
  if (!guest) return null;

  async function save() {
    if (!passkeysSupported()) return toast.error("This browser can't save passkeys. Try Chrome, Safari or Edge.");
    setBusy(true);
    try {
      await savePasskey();
      me = null;
      setGuest(false);
      toast.success("Saved! Next time, just tap “Sign in” and use your face or fingerprint.");
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center justify-center gap-3 border-b-2 border-ink bg-ink px-3 py-1.5 text-[13px] text-white">
      {/* One line on phones: every pixel of height counts there. */}
      <span className="min-w-0 truncate sm:hidden">Only saved in this browser.</span>
      <span className="hidden sm:inline">You&apos;re trying SketchFrame. Save your work so it&apos;s never lost — no email needed.</span>
      <button onClick={save} disabled={busy} className="flex shrink-0 items-center gap-1.5 rounded-[4px] bg-white px-3 py-1 font-semibold text-ink">
        {busy ? <Spinner className="h-3.5 w-3.5" /> : <Fingerprint className="h-4 w-4" />} Save my work
      </button>
    </div>
  );
}
