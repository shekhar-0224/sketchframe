"use client";

import { forwardRef, useEffect, useId, useRef, useState } from "react";
import { X } from "lucide-react";

export const cn = (...c: Array<string | false | null | undefined>) => c.filter(Boolean).join(" ");

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ink" | "outline" | "ghost" | "danger";
  size?: "sm" | "md" | "lg" | "icon";
  loading?: boolean;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "outline", size = "md", loading, className, children, disabled, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        "inline-flex select-none items-center justify-center gap-1.5 font-semibold whitespace-nowrap disabled:cursor-not-allowed disabled:opacity-45",
        size === "sm" && "h-8 px-2.5 text-[13px]",
        size === "md" && "h-9 px-3.5 text-sm",
        size === "lg" && "h-11 px-5 text-[15px]",
        size === "icon" && "h-8 w-8 text-sm",
        // Keycaps: dark keys for primary actions, light keys for the rest.
        (variant === "primary" || variant === "ink") && "key key-dark",
        variant === "outline" && "key text-ink",
        variant === "danger" && "key text-ink underline decoration-2 underline-offset-2",
        variant === "ghost" && "rounded-[4px] text-graphite hover:bg-paper-2 hover:text-ink active:bg-paper-3",
        className,
      )}
      {...props}
    >
      {loading && <Spinner className="h-3.5 w-3.5" />}
      {children}
    </button>
  );
});

export function Spinner({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={cn("animate-spin", className ?? "h-4 w-4")} aria-hidden>
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

const fieldBase =
  "w-full rounded-[3px] border-[1.5px] border-ink/40 shadow-[inset_1.5px_1.5px_0_0_rgba(0,0,0,.12)] bg-card px-2.5 text-sm text-ink placeholder:text-pencil transition-colors focus:border-ink focus:outline-none";

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className, ...props },
  ref,
) {
  return <input ref={ref} className={cn(fieldBase, "h-9", className)} {...props} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, ...props }, ref) {
    return <textarea ref={ref} className={cn(fieldBase, "resize-y py-2 leading-relaxed", className)} {...props} />;
  },
);

/** Free-text input with suggestion chips (vocabulary is a guide, not a cage). */
export function SuggestInput({
  value,
  onChange,
  options,
  className,
  ...props
}: Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange"> & {
  value: string;
  onChange: (v: string) => void;
  options: readonly string[];
}) {
  const id = useId();
  return (
    <>
      <Input list={id} value={value} onChange={(e) => onChange(e.target.value)} className={className} {...props} />
      <datalist id={id}>
        {options.map((o) => (
          <option key={o} value={o} />
        ))}
      </datalist>
    </>
  );
}

export function Label({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={cn("mb-1 block font-mono text-[10.5px] font-medium tracking-[0.08em] text-graphite uppercase", className)}>
      {children}
    </span>
  );
}

export function Stamp({ children, className, tone = "ink" }: { children: React.ReactNode; className?: string; tone?: "ink" | "accent" | "blue" | "soft" }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-[3px] border px-1.5 py-[1px] font-mono text-[10.5px] leading-4 font-semibold tracking-wide uppercase",
        tone === "ink" && "border-ink bg-card text-ink shadow-[0_1.5px_0_0_var(--ink)]",
        tone === "accent" && "border-ink bg-ink text-white",
        tone === "blue" && "border-ink border-dashed bg-card text-ink",
        tone === "soft" && "border-rule bg-paper-2 text-graphite",
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
  wide,
  className,
  sheet,
}: {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  children: React.ReactNode;
  wide?: boolean;
  className?: string;
  /** On phones, slide up from the bottom (full width) instead of floating in the middle. */
  sheet?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    ref.current?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div
      className={cn(
        "fixed inset-0 z-50 flex justify-center bg-ink/40 backdrop-blur-[2px]",
        sheet ? "items-end p-0 sm:items-center sm:p-4" : "items-center p-4",
      )}
      onMouseDown={onClose}
    >
      <div
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal
        onMouseDown={(e) => e.stopPropagation()}
        className={cn(
          "paper-card flex max-h-[92dvh] w-full flex-col overflow-hidden shadow-[6px_6px_0_0_var(--ink)] outline-none",
          sheet && "max-h-[88dvh] rounded-b-none border-b-0 shadow-none sm:rounded-b-[4px] sm:border-b-2 sm:shadow-[6px_6px_0_0_var(--ink)]",
          wide ? "max-w-5xl" : "max-w-xl",
          className,
        )}
      >
        {title && (
          <div className="titlebar relative flex h-9 shrink-0 items-center justify-center border-b-2 border-ink px-10">
            <button
              onClick={onClose}
              aria-label="Close"
              className="absolute left-3 flex h-4 w-4 items-center justify-center border-[1.5px] border-ink bg-card hover:bg-ink hover:text-white"
            >
              <X className="h-3 w-3" strokeWidth={3} />
            </button>
            <h2 className="truncate bg-card px-3 text-[17px] leading-none">{title}</h2>
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-auto">{children}</div>
      </div>
    </div>
  );
}

/** Two keycaps — the product mark — plus the wordmark in the pixel face. */
export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <span className="flex gap-[3px] pb-[3px]" aria-hidden>
        <span className="key key-dark flex h-7 w-7 items-center justify-center font-display text-[15px] leading-none">S</span>
        <span className="key flex h-7 w-7 items-center justify-center font-display text-[15px] leading-none">F</span>
      </span>
      <span className="font-display text-[20px] leading-none tracking-[0.02em] uppercase">SketchFrame</span>
    </span>
  );
}


export async function api<T = unknown>(url: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const { json, ...rest } = init ?? {};
  const res = await fetch(url, {
    ...rest,
    ...(json !== undefined && {
      body: JSON.stringify(json),
      headers: { "Content-Type": "application/json", ...(rest.headers || {}) },
    }),
  });
  if (res.status === 401 && typeof window !== "undefined") {
    // Session expired: back to sign-in, then return here.
    window.location.replace(`/login?next=${encodeURIComponent(window.location.pathname)}`);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || `Request failed (${res.status})`);
  return data as T;
}

export type MenuItem = { label: string; icon?: React.ElementType; onSelect: () => void; danger?: boolean; disabled?: boolean } | "divider";

/** "⋯" overflow menu: keeps frames clean by tucking rare actions behind one button. */
export function Menu({ items, label = "More", children, note, down }: { items: MenuItem[]; label?: string; children?: React.ReactNode; note?: string; /** Open below the button (for top bars). */ down?: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", close);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", close);
    };
  }, [open]);
  return (
    <div ref={ref} className="relative" onClick={(e) => e.stopPropagation()}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="key flex h-9 min-w-9 items-center justify-center px-2"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        title={label}
      >
        {children ?? <span className="text-[18px] leading-none font-bold tracking-tighter">⋯</span>}
      </button>
      {open && (
        <div role="menu" className={cn("paper-card absolute right-0 z-40 min-w-[200px] py-1 shadow-[4px_4px_0_0_var(--ink)]", down ? "top-11" : "bottom-11")}>
          {items.map((it, i) =>
            it === "divider" ? (
              <div key={i} className="my-1 h-px bg-rule" />
            ) : (
              <button
                key={it.label}
                role="menuitem"
                disabled={it.disabled}
                onClick={() => {
                  setOpen(false);
                  it.onSelect();
                }}
                className={cn(
                  "flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-[14px] hover:bg-paper-2 disabled:opacity-40",
                  it.danger && "font-semibold",
                )}
              >
                {it.icon && <it.icon className="h-4 w-4 shrink-0" />}
                {it.label}
              </button>
            ),
          )}
          {note && <p className="border-t border-rule px-3 pt-1.5 pb-1 font-mono text-[10px] text-pencil uppercase">{note}</p>}
        </div>
      )}
    </div>
  );
}
