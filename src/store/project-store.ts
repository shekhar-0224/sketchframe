"use client";

import { create } from "zustand";
import { toast } from "sonner";
import { api } from "@/components/ui";
import type { CharacterView, ProjectBundle, ShotView } from "@/lib/data";

type ShotPatch = Partial<
  Pick<
    ShotView,
    | "shotSize"
    | "cameraAngle"
    | "cameraMove"
    | "action"
    | "dialogue"
    | "speaker"
    | "notes"
    | "promptExtra"
    | "duration"
    | "characterIds"
    | "sceneId"
    | "tier"
    | "effects"
  >
>;

type State = {
  bundle: ProjectBundle | null;
  loading: boolean;
  error: string | null;
  selectedShotId: string | null;
  /** Unsaved field edits; overlaid on poll results so typing is never clobbered. */
  pending: Record<string, ShotPatch>;

  load: (id: string) => Promise<void>;
  refresh: () => Promise<void>;
  select: (id: string | null) => void;
  patchProject: (patch: Partial<ProjectBundle["project"]>) => Promise<void>;

  updateShot: (id: string, patch: ShotPatch) => void;
  addShot: (opts?: { afterShotId?: string; duplicateOf?: string }) => Promise<void>;
  deleteShot: (id: string) => Promise<void>;
  reorder: (ids: string[], movedId?: string) => Promise<void>;
  generate: (id: string, versions?: number) => Promise<void>;
  generateMany: (opts?: { force?: boolean; shotIds?: string[] }) => Promise<void>;
  setShotImage: (id: string, data: { imageUrl: string | null; layoutUrl?: string | null; imageVersion?: number }) => void;

  updateCharacter: (id: string, patch: Partial<CharacterView>) => Promise<void>;
  generateSheet: (id: string) => Promise<void>;
};

const timers = new Map<string, ReturnType<typeof setTimeout>>();
let pollTimer: ReturnType<typeof setTimeout> | null = null;
let loadedId: string | null = null;

function busy(b: ProjectBundle | null) {
  if (!b) return false;
  return (
    b.project.status === "breaking_down" ||
    b.shots.some((s) => s.imageStatus === "generating" || s.audioStatus === "generating" || s.clipStatus === "generating") ||
    b.characters.some((c) => c.sheetStatus === "generating")
  );
}

export const useProject = create<State>((set, get) => {
  const mutateShots = (fn: (shots: ShotView[]) => ShotView[]) =>
    set((s) => (s.bundle ? { bundle: { ...s.bundle, shots: fn(s.bundle.shots) } } : s));

  const schedulePoll = () => {
    if (pollTimer) clearTimeout(pollTimer);
    if (!busy(get().bundle)) return;
    pollTimer = setTimeout(() => void get().refresh(), 1500);
  };

  return {
    bundle: null,
    loading: false,
    error: null,
    selectedShotId: null,
    pending: {},

    async load(id) {
      if (loadedId !== id) set({ bundle: null, selectedShotId: null, pending: {} });
      loadedId = id;
      set({ loading: true, error: null });
      try {
        const bundle = await api<ProjectBundle>(`/api/projects/${id}`);
        if (loadedId !== id) return;
        set({ bundle, loading: false });
        schedulePoll();
      } catch (e) {
        set({ error: (e as Error).message, loading: false });
      }
    },

    async refresh() {
      const id = loadedId;
      if (!id) return;
      try {
        const fresh = await api<ProjectBundle>(`/api/projects/${id}`);
        if (loadedId !== id) return;
        const prev = get().bundle;
        const { pending } = get();
        // Toast transitions so background work is visible wherever the user is.
        if (prev) {
          for (const s of fresh.shots) {
            const before = prev.shots.find((p) => p.id === s.id);
            if (before?.imageStatus === "generating" && s.imageStatus === "error") toast.error(`Panel failed: ${s.imageError}`);
          }
          if (prev.project.status === "breaking_down" && fresh.project.status === "idle")
            toast.success(`Breakdown ready — ${fresh.shots.length} shots, ${fresh.characters.length} characters`);
          if (prev.project.status === "breaking_down" && fresh.project.status === "error")
            toast.error(`Breakdown failed: ${fresh.project.statusError}`);
        }
        fresh.shots = fresh.shots.map((s) => (pending[s.id] ? { ...s, ...pending[s.id] } : s));
        set({ bundle: fresh });
      } catch {
        /* transient; next poll retries */
      }
      schedulePoll();
    },

    select: (id) => set({ selectedShotId: id }),

    async patchProject(patch) {
      const b = get().bundle;
      if (!b) return;
      set({ bundle: { ...b, project: { ...b.project, ...patch } } });
      try {
        await api(`/api/projects/${b.project.id}`, { method: "PATCH", json: patch });
      } catch (e) {
        toast.error((e as Error).message);
      }
    },

    updateShot(id, patch) {
      mutateShots((shots) => shots.map((s) => (s.id === id ? { ...s, ...patch } : s)));
      set((s) => ({ pending: { ...s.pending, [id]: { ...s.pending[id], ...patch } } }));
      clearTimeout(timers.get(id));
      timers.set(
        id,
        setTimeout(async () => {
          const body = get().pending[id];
          if (!body) return;
          try {
            await api(`/api/shots/${id}`, { method: "PATCH", json: body });
            set((s) => {
              const next = { ...s.pending };
              // Only clear if nothing newer was typed during the request.
              if (next[id] === body) delete next[id];
              return { pending: next };
            });
          } catch (e) {
            toast.error(`Couldn't save shot: ${(e as Error).message}`);
          }
        }, 450),
      );
    },

    async addShot(opts) {
      const b = get().bundle;
      if (!b) return;
      try {
        const shot = await api<ShotView>(`/api/projects/${b.project.id}/shots`, { method: "POST", json: opts ?? {} });
        mutateShots((shots) => {
          const at = shots.findIndex((s) => s.id === (opts?.afterShotId ?? opts?.duplicateOf));
          const next = [...shots];
          next.splice(at >= 0 ? at + 1 : next.length, 0, shot);
          return next.map((s, i) => ({ ...s, position: i }));
        });
        set({ selectedShotId: shot.id });
      } catch (e) {
        toast.error((e as Error).message);
      }
    },

    async deleteShot(id) {
      const before = get().bundle?.shots;
      mutateShots((shots) => shots.filter((s) => s.id !== id));
      if (get().selectedShotId === id) set({ selectedShotId: null });
      try {
        await api(`/api/shots/${id}`, { method: "DELETE" });
      } catch (e) {
        if (before) mutateShots(() => before);
        toast.error((e as Error).message);
      }
    },

    async reorder(ids, movedId) {
      const b = get().bundle;
      if (!b) return;
      const byId = new Map(b.shots.map((s) => [s.id, s]));
      const next = ids.map((id) => byId.get(id)!).filter(Boolean);
      // A moved shot joins the scene of the shot it was dropped after (or before, at the very top).
      const sceneChanges: Record<string, string | null> = {};
      if (movedId) {
        const i = next.findIndex((s) => s.id === movedId);
        const neighbour = next[i - 1] ?? next[i + 1];
        if (neighbour && neighbour.sceneId !== next[i].sceneId) sceneChanges[movedId] = neighbour.sceneId;
      }
      mutateShots(() => next.map((s, i) => ({ ...s, position: i, sceneId: s.id in sceneChanges ? sceneChanges[s.id] : s.sceneId })));
      try {
        await api(`/api/projects/${b.project.id}/shots/reorder`, { method: "POST", json: { ids, sceneChanges } });
      } catch (e) {
        mutateShots(() => b.shots);
        toast.error((e as Error).message);
      }
    },

    async generate(id, versions = 1) {
      // Optimistic: the panel shows its "sketching" state before the request lands.
      mutateShots((shots) => shots.map((s) => (s.id === id ? { ...s, imageStatus: "generating", imageError: null } : s)));
      try {
        // Flush pending edits first so the server draws what the user just typed.
        if (get().pending[id]) {
          clearTimeout(timers.get(id));
          await api(`/api/shots/${id}`, { method: "PATCH", json: get().pending[id] });
          set((s) => {
            const next = { ...s.pending };
            delete next[id];
            return { pending: next };
          });
        }
        await api(`/api/shots/${id}/generate`, { method: "POST", json: { versions } });
      } catch (e) {
        mutateShots((shots) => shots.map((s) => (s.id === id ? { ...s, imageStatus: "error", imageError: (e as Error).message } : s)));
        toast.error((e as Error).message);
      }
      schedulePoll();
    },

    async generateMany(opts) {
      const b = get().bundle;
      if (!b) return;
      try {
        const { queued, remaining = 0 } = await api<{ queued: string[]; remaining?: number }>(`/api/projects/${b.project.id}/generate`, {
          method: "POST",
          json: opts ?? {},
        });
        const q = new Set(queued);
        mutateShots((shots) => shots.map((s) => (q.has(s.id) ? { ...s, imageStatus: "generating", imageError: null } : s)));
        if (!queued.length) toast("Every panel already has a drawing.");
        else if (remaining) toast(`Drawing ${queued.length} now with free AI (about a minute each). Press Draw all again for the other ${remaining}.`);
        else toast(`Sketching ${queued.length} panel${queued.length > 1 ? "s" : ""}…`);
      } catch (e) {
        toast.error((e as Error).message);
      }
      schedulePoll();
    },

    setShotImage(id, data) {
      mutateShots((shots) =>
        shots.map((s) =>
          s.id === id
            ? {
                ...s,
                imageUrl: data.imageUrl,
                imageStatus: data.imageUrl ? "ready" : "empty",
                imageError: null,
                ...(data.layoutUrl !== undefined && { layoutUrl: data.layoutUrl }),
                ...(data.imageVersion !== undefined && { imageVersion: data.imageVersion }),
              }
            : s,
        ),
      );
    },

    async updateCharacter(id, patch) {
      const b = get().bundle;
      if (!b) return;
      set({ bundle: { ...b, characters: b.characters.map((c) => (c.id === id ? { ...c, ...patch } : c)) } });
      try {
        await api(`/api/characters/${id}`, { method: "PATCH", json: patch });
      } catch (e) {
        toast.error((e as Error).message);
        void get().refresh();
      }
    },

    async generateSheet(id) {
      const b = get().bundle;
      if (!b) return;
      set({ bundle: { ...b, characters: b.characters.map((c) => (c.id === id ? { ...c, sheetStatus: "generating", sheetError: null } : c)) } });
      try {
        await api(`/api/characters/${id}/sheet`, { method: "POST" });
      } catch (e) {
        toast.error((e as Error).message);
      }
      void get().refresh();
    },
  };
});

