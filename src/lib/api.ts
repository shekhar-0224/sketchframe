import "server-only";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { currentUser, loadContext } from "@/lib/auth";
import { runWithContext } from "@/lib/context";

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

function toResponse(err: unknown) {
  if (err instanceof HttpError) return NextResponse.json({ error: err.message }, { status: err.status });
  if (err instanceof ZodError) return NextResponse.json({ error: err.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  console.error("[sketchframe] API error", err);
  return NextResponse.json({ error: (err as Error).message || "Something went wrong" }, { status: 500 });
}

/**
 * Wrap a route handler: requires a signed-in user, runs the handler inside that user's
 * context (keys + settings, see lib/context.ts), and turns thrown errors into JSON.
 */
export function handle<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A) => {
    try {
      const user = await currentUser();
      if (!user) throw new HttpError(401, "Please sign in");
      const ctx = await loadContext(user);
      return await runWithContext(ctx, () => fn(...args));
    } catch (err) {
      return toResponse(err);
    }
  };
}

/** Same error handling, no sign-in required (login endpoints). */
export function handlePublic<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A) => {
    try {
      return await fn(...args);
    } catch (err) {
      if (err instanceof HttpError) return NextResponse.json({ error: err.message }, { status: err.status });
      if (err instanceof ZodError) return NextResponse.json({ error: err.issues[0]?.message ?? "Invalid input" }, { status: 400 });
      console.error("[sketchframe] API error", err);
      return NextResponse.json({ error: (err as Error).message || "Something went wrong" }, { status: 500 });
    }
  };
}

export const notFound = (what = "Not found") => new HttpError(404, what);

export async function fileFromForm(req: Request, field = "file") {
  const form = await req.formData();
  const file = form.get(field);
  if (!(file instanceof File) || file.size === 0) throw new HttpError(400, "No file uploaded");
  if (file.size > 25 * 1024 * 1024) throw new HttpError(413, "File is larger than 25 MB");
  return { file, form };
}
