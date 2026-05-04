import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Wand2, Film, Loader2, Download, PlayCircle } from "lucide-react";
import { toast } from "sonner";

type Job = {
  id: string;
  status: string;
  progress: number;
  current_step: string | null;
  scenes_total: number | null;
  scenes_done: number | null;
  final_video_url: string | null;
  error: string | null;
  project_id: string | null;
};

type PlaylistScene = { scene_number: number; video_url: string | null; narration_url: string | null; title: string | null };

export function OnePromptMovie() {
  const { user, session } = useAuth();
  const [prompt, setPrompt] = useState("");
  const [minutes, setMinutes] = useState(5);
  const [style, setStyle] = useState("Cinematic, photorealistic, 35mm film");
  const [submitting, setSubmitting] = useState(false);
  const [job, setJob] = useState<Job | null>(null);
  const [playlist, setPlaylist] = useState<PlaylistScene[]>([]);
  const [activeIdx, setActiveIdx] = useState(0);
  const [stitching, setStitching] = useState(false);
  const [stitchProgress, setStitchProgress] = useState(0);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  // Realtime updates for the active job
  useEffect(() => {
    if (!job?.id) return;
    const ch = supabase
      .channel(`job-${job.id}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "video_jobs", filter: `id=eq.${job.id}` },
        (payload) => setJob(payload.new as Job))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [job?.id]);

  // Load playlist when completed
  useEffect(() => {
    if (job?.status === "completed" && job.final_video_url) {
      fetch(job.final_video_url)
        .then(r => r.json())
        .then(d => { setPlaylist(d.scenes ?? []); setActiveIdx(0); })
        .catch(() => toast.error("Could not load final movie"));
    }
  }, [job?.status, job?.final_video_url]);

  const generate = async () => {
    if (!prompt.trim() || !user || !session) return;
    setSubmitting(true);
    try {
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/auto-movie`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ prompt, duration_minutes: minutes, style }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to start");
      const { data: j } = await supabase.from("video_jobs").select("*").eq("id", data.job_id).single();
      setJob(j as Job);
      setPlaylist([]);
      toast.success("Movie generation started");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  // When a clip ends, advance to the next
  const onClipEnded = () => {
    if (activeIdx < playlist.length - 1) setActiveIdx(activeIdx + 1);
  };

  useEffect(() => {
    if (!playlist.length) return;
    const v = videoRef.current; const a = audioRef.current;
    if (v) { v.load(); v.play().catch(() => {}); }
    if (a) { a.load(); a.play().catch(() => {}); }
  }, [activeIdx, playlist]);

  const active = playlist[activeIdx];
  const inProgress = job && !["completed", "failed"].includes(job.status);

  return (
    <div className="space-y-6">
      <Card className="p-6 bg-card/60 backdrop-blur border-border/60 shadow-cinema">
        <div className="flex items-center gap-2 mb-4">
          <div className="size-8 rounded-md bg-gradient-ember grid place-items-center shadow-glow">
            <Wand2 className="size-4 text-primary-foreground" />
          </div>
          <h2 className="font-display text-xl font-bold">One-Prompt Movie</h2>
        </div>
        <p className="text-sm text-muted-foreground mb-5">
          Describe your film in one prompt. We auto-write the script, render every scene with realistic AI video,
          generate narration, and play it back as one continuous movie up to 30 minutes.
        </p>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Prompt</Label>
            <Textarea
              rows={3}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="A lone astronaut wakes on an abandoned Mars colony and discovers it's not really empty…"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Length (minutes)</Label>
              <Input type="number" min={1} max={30} value={minutes} onChange={(e) => setMinutes(Math.max(1, Math.min(30, Number(e.target.value) || 1)))} />
            </div>
            <div className="space-y-2">
              <Label>Visual style</Label>
              <Input value={style} onChange={(e) => setStyle(e.target.value)} />
            </div>
          </div>
          <Button
            onClick={generate}
            disabled={submitting || !prompt.trim() || !!inProgress}
            className="w-full bg-gradient-ember border-0 text-primary-foreground shadow-glow hover:opacity-90"
          >
            {submitting ? <><Loader2 className="size-4 mr-2 animate-spin" /> Starting…</> : <><Film className="size-4 mr-2" /> Generate movie</>}
          </Button>
          <p className="text-xs text-muted-foreground">
            Heads up: a {minutes}-minute movie renders ~{Math.ceil(minutes * 60 / 8)} clips. Expect {Math.ceil(minutes * 2)}–{Math.ceil(minutes * 5)} minutes total render time.
          </p>
        </div>
      </Card>

      {job && (
        <Card className="p-6 bg-card/60 backdrop-blur border-border/60">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs uppercase tracking-widest text-primary">Status</span>
            <span className="text-xs text-muted-foreground">{job.status}</span>
          </div>
          <p className="text-sm mb-3">{job.current_step || "Working…"}</p>
          <Progress value={job.progress ?? 0} />
          {job.scenes_total ? (
            <p className="text-xs text-muted-foreground mt-2">{job.scenes_done ?? 0} / {job.scenes_total} clips rendered</p>
          ) : null}
          {job.error && <p className="text-sm text-destructive mt-3">Error: {job.error}</p>}
        </Card>
      )}

      {playlist.length > 0 && active && (
        <Card className="p-6 bg-card/60 backdrop-blur border-border/60 shadow-cinema">
          <h3 className="font-display text-lg font-bold mb-4">Your movie</h3>
          {active.video_url ? (
            <div className="relative rounded-lg overflow-hidden bg-black aspect-video">
              <video
                ref={videoRef}
                key={active.video_url}
                src={active.video_url}
                onEnded={onClipEnded}
                controls
                autoPlay
                className="w-full h-full"
              />
              {active.narration_url && (
                <audio ref={audioRef} key={active.narration_url} src={active.narration_url} autoPlay />
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Scene {active.scene_number} did not render.</p>
          )}
          <div className="mt-4 flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Scene {activeIdx + 1} / {playlist.length}{active.title ? ` — ${active.title}` : ""}</span>
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" disabled={activeIdx === 0} onClick={() => setActiveIdx(i => Math.max(0, i - 1))}>Prev</Button>
              <Button size="sm" variant="ghost" disabled={activeIdx >= playlist.length - 1} onClick={() => setActiveIdx(i => Math.min(playlist.length - 1, i + 1))}>Next</Button>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
