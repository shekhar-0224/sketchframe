import "server-only";

/** Turn an uploaded script (TXT / Fountain / FDX / PDF / DOCX) into plain screenplay text. */
export async function extractScriptText(file: File): Promise<string> {
  const name = file.name.toLowerCase();
  const buf = Buffer.from(await file.arrayBuffer());

  if (name.endsWith(".pdf") || file.type === "application/pdf") {
    const { extractText, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(new Uint8Array(buf));
    const { text } = await extractText(pdf, { mergePages: false });
    return (Array.isArray(text) ? text.join("\n\n") : text).trim();
  }

  if (name.endsWith(".docx")) {
    const mammoth = await import("mammoth");
    const { value } = await mammoth.extractRawText({ buffer: buf });
    return value.trim();
  }

  if (name.endsWith(".fdx")) {
    // Final Draft XML: one <Paragraph Type="..."><Text>..</Text></Paragraph> per line.
    const xml = buf.toString("utf8");
    const paras = [...xml.matchAll(/<Paragraph[^>]*Type="([^"]*)"[^>]*>([\s\S]*?)<\/Paragraph>/g)];
    return paras
      .map(([, type, inner]) => {
        const t = [...inner.matchAll(/<Text[^>]*>([\s\S]*?)<\/Text>/g)].map((m) => m[1]).join("");
        const clean = t.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"');
        return type === "Scene Heading" || type === "Character" ? clean.toUpperCase() : clean;
      })
      .join("\n\n")
      .trim();
  }

  if (name.endsWith(".doc")) throw new Error("Legacy .doc files aren't supported — save as .docx or PDF.");
  return buf.toString("utf8").replace(/\r\n?/g, "\n").trim();
}
