"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Brush, Eraser, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import type { ShotView } from "@/lib/data";
import { Button, Modal, Spinner, cn } from "@/components/ui";
import { saveEditedImage } from "./actions";

type Tool = "brush" | "eraser";

/**
 * Deliberately tiny editor: brush, eraser (paints paper white), clear, save.
 * No layers — it's for quick touch-ups, not illustration.
 */
export function PanelEditor({ shot, index, onClose }: { shot: ShotView | null; index: number; onClose: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const drawing = useRef<{ x: number; y: number } | null>(null);
  const [tool, setTool] = useState<Tool>("brush");
  const [size, setSize] = useState(4);
  const [ready, setReady] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [useAsLayout, setUseAsLayout] = useState(true);
  const [saving, setSaving] = useState(false);

  const paintOriginal = useCallback(() => {
    const c = canvasRef.current;
    const img = imgRef.current;
    if (!c || !img) return;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(img, 0, 0, c.width, c.height);
    setDirty(false);
  }, []);

  useEffect(() => {
    if (!shot?.imageUrl) return;
    const img = new Image();
    img.onload = () => {
      imgRef.current = img;
      const c = canvasRef.current!;
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      paintOriginal();
      setReady(true);
    };
    img.onerror = () => toast.error("Couldn't load the panel image");
    img.src = shot.imageUrl;
  }, [shot?.imageUrl, paintOriginal]);

  const pos = (e: React.PointerEvent) => {
    const c = canvasRef.current!;
    const r = c.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * c.width, y: ((e.clientY - r.top) / r.height) * c.height };
  };
  // Brush width is specified in display pixels; scale to the image's resolution.
  const scale = () => {
    const c = canvasRef.current!;
    return c.width / c.getBoundingClientRect().width;
  };

  const stroke = (from: { x: number; y: number }, to: { x: number; y: number }, pressure: number) => {
    const ctx = canvasRef.current!.getContext("2d")!;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = tool === "brush" ? "#000000" : "#ffffff";
    const base = tool === "brush" ? size : size * 4;
    ctx.lineWidth = base * scale() * (pressure > 0 && pressure !== 0.5 ? 0.4 + pressure : 1);
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
  };

  const onDown = (e: React.PointerEvent) => {
    if (!ready) return;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const p = pos(e);
    drawing.current = p;
    stroke(p, { x: p.x + 0.01, y: p.y }, e.pressure);
    setDirty(true);
  };
  const onMove = (e: React.PointerEvent) => {
    if (!drawing.current) return;
    const p = pos(e);
    stroke(drawing.current, p, e.pressure);
    drawing.current = p;
  };
  const onUp = () => (drawing.current = null);

  async function save() {
    if (!shot) return;
    setSaving(true);
    try {
      await saveEditedImage(shot.id, canvasRef.current!.toDataURL("image/png"), useAsLayout);
      toast.success(`Panel ${index + 1} saved`);
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const close = () => {
    if (dirty && !confirm("Discard your marks?")) return;
    onClose();
  };

  return (
    <Modal open={!!shot} onClose={close} title={`Edit panel ${index + 1}`} wide>
      <div className="flex flex-wrap items-center gap-2 border-b border-rule bg-paper px-4 py-2">
        <div className="flex gap-1.5 pb-1">
          {([
            ["brush", Brush, "Brush"],
            ["eraser", Eraser, "Eraser"],
          ] as const).map(([id, Icon, label]) => (
            <button
              key={id}
              onClick={() => setTool(id)}
              className={cn("key flex h-8 items-center gap-1.5 px-2.5 text-[13px] font-semibold", tool === id && "key-dark key-down")}
              aria-pressed={tool === id}
            >
              <Icon className="h-3.5 w-3.5" /> {label}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 font-mono text-[11px] text-graphite uppercase">
          Size
          <input type="range" min={1} max={16} value={size} onChange={(e) => setSize(Number(e.target.value))} className="w-24 accent-[var(--accent)]" />
          <span className="w-5">{size}</span>
        </label>
        <Button variant="ghost" size="sm" onClick={paintOriginal} disabled={!dirty}>
          <RotateCcw className="h-3.5 w-3.5" /> Clear
        </Button>
      </div>
      <div className="flex items-center justify-center bg-paper-2 p-4">
        {!ready && <Spinner />}
        <canvas
          ref={canvasRef}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          className={cn("max-h-[64dvh] max-w-full touch-none border-[1.5px] border-ink bg-white shadow-lift", !ready && "hidden", tool === "brush" ? "cursor-crosshair" : "cursor-cell")}
        />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t-[1.5px] border-ink bg-paper px-4 py-3">
        <label className="flex items-center gap-2 text-[13px]">
          <input type="checkbox" checked={useAsLayout} onChange={(e) => setUseAsLayout(e.target.checked)} className="accent-[var(--accent)]" />
          Use as the layout reference when this shot is regenerated
        </label>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={close}>Cancel</Button>
          <Button variant="primary" onClick={save} loading={saving} disabled={!ready || !dirty}>Save panel</Button>
        </div>
      </div>
    </Modal>
  );
}
