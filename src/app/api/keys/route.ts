import { NextResponse } from "next/server";
import { z } from "zod";
import { handle } from "@/lib/api";
import { KEY_NAMES, isOwner, listKeys, setKey } from "@/lib/auth";
import { requireContext } from "@/lib/context";

/**
 * The user's own provider keys. Values never come back to the browser — only which
 * keys are set, their last 4 characters, and whether the server's key covers it (owner).
 */
async function payload() {
  const ctx = requireContext();
  const saved = await listKeys(ctx.userId);
  return KEY_NAMES.map((name) => {
    const row = saved.find((k) => k.name === name);
    return {
      name,
      last4: row?.last4 ?? null,
      fromServer: !row && isOwner(ctx.email) && !!process.env[name],
    };
  });
}

export const GET = handle(async () => NextResponse.json(await payload()));

export const PUT = handle(async (req: Request) => {
  const body = z
    .object({ name: z.enum(KEY_NAMES), value: z.string().trim().max(500).nullable() })
    .parse(await req.json());
  await setKey(requireContext().userId, body.name, body.value || null);
  return NextResponse.json(await payload());
});
