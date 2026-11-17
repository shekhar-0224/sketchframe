import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { sharedMovie } from "@/lib/share";
import { Logo } from "@/components/ui";
import { PublicPlayer } from "@/components/movie/public-player";

type Props = { params: Promise<{ token: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const movie = await sharedMovie((await params).token);
  if (!movie) return { title: "Not found — SketchFrame" };
  return { title: `${movie.title} — a SketchFrame film`, description: movie.logline || "Made with SketchFrame." };
}

/** Public, read-only film. Every share is also an invitation to make one. */
export default async function SharedMoviePage({ params }: Props) {
  const movie = await sharedMovie((await params).token);
  if (!movie) notFound();
  return (
    <div className="mx-auto flex min-h-dvh max-w-5xl flex-col px-4 py-6 sm:px-8">
      <header className="mb-6 flex items-center justify-between">
        <Link href="/" aria-label="SketchFrame home"><Logo /></Link>
        <Link href="/" className="key key-dark flex h-9 items-center px-3.5 text-[13px] font-semibold">Make your own — free</Link>
      </header>
      <h1 className="mb-1 text-[32px] leading-tight sm:text-[42px]">{movie.title}</h1>
      {movie.logline && <p className="mb-5 max-w-2xl text-[15px] text-graphite">{movie.logline}</p>}
      <PublicPlayer shots={movie.shots} aspectRatio={movie.aspectRatio} />
      <footer className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t-2 border-dashed border-ink/30 pt-5">
        <p className="text-[14px] text-graphite">
          Made with <b className="text-ink">SketchFrame</b> — script or idea in; black-and-white film out.
        </p>
        <Link href="/" className="key flex h-9 items-center px-3.5 text-[13px] font-semibold">Try it free, no signup →</Link>
      </footer>
    </div>
  );
}
