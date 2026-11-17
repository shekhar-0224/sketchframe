import { z } from "zod";

const str = z.union([z.string(), z.number()]).nullish().transform((v) => (v == null ? "" : String(v)));

/** Models (especially free ones) sometimes drop stray strings into lists — keep only the objects. */
const objects = (v: unknown) => (Array.isArray(v) ? v.filter((x) => x && typeof x === "object" && !Array.isArray(x)) : []);
const strings = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

export const breakdownSchema = z.object({
  title: str,
  logline: str,
  characters: z.preprocess(
    (v) => objects(v).filter((c) => typeof (c as { name?: unknown }).name === "string" && (c as { name: string }).name.trim()),
    z.array(
      z.object({
        name: z.string().trim().min(1),
        role: str,
        description: str,
        personality: str,
      }),
    ),
  ),
  scenes: z.preprocess(
    objects,
    z.array(
      z.object({
        heading: str,
        location: str,
        timeOfDay: str,
        summary: str,
        shots: z.preprocess(
          objects,
          z.array(
            z.object({
              shotSize: str,
              cameraAngle: str,
              cameraMove: str,
              action: str,
              speaker: str,
              dialogue: str,
              characters: z.preprocess(strings, z.array(z.string())),
              duration: z.coerce.number().catch(3),
              notes: str,
            }),
          ),
        ),
      }),
    ),
  ),
});

export type Breakdown = z.infer<typeof breakdownSchema>;

/** LLMs occasionally wrap JSON in fences or prose; pull out the first object. */
export function parseJsonLoose(text: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text);
  const body = fenced ? fenced[1] : text;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error("Model did not return JSON");
  return JSON.parse(body.slice(start, end + 1));
}
