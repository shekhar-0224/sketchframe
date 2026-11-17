import { NextResponse } from "next/server";
import { handlePublic } from "@/lib/api";
import { destroySession } from "@/lib/auth";

export const POST = handlePublic(async () => {
  await destroySession();
  return NextResponse.json({ ok: true });
});
