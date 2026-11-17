import { NextResponse } from "next/server";
import { fileFromForm, handle, HttpError } from "@/lib/api";
import { extractScriptText } from "@/lib/pipeline/extract-text";

export const POST = handle(async (req: Request) => {
  const { file } = await fileFromForm(req);
  const text = await extractScriptText(file);
  if (!text) throw new HttpError(422, "Couldn't find any text in that file");
  return NextResponse.json({ text, name: file.name.replace(/\.[^.]+$/, "") });
});
