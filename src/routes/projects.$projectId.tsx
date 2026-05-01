import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { useRequireAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { Navbar } from "@/components/navbar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { ArrowLeft, Wand2, Plus, Image as ImageIcon, RefreshCw, Trash2, Users, Film } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/projects/$projectId")({
  component: ProjectPage,
  head: () => ({ meta: [{ title: "Project — AnimAI Studio" }] }),
});

type Project = { id: string; title: string; logline: string | null; genre: string | null; visual_style: string | null };
type Scene = { id: string; scene_number: number; title: string | null; prompt: string | null; narration: string | null; image_url: string | null; status: string };
type Character = { id: string; name: string; description: string | null; reference_image: string | null };

const FN_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;
const FN_HEADERS = {
  "Content-Type": "application/json",
  Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
  apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
};

function ProjectPage() {
  const { user, loading } = useRequireAuth();
  const { projectId } = Route.useParams();
  const navigate = useNavigate();
  const [project, setProject] = useState<Project | null>(null);
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [generating, setGenerating] = useState(false);
  const [renderingAll, setRenderingAll] = useState(false);
  const [numScenes, setNumScenes] = useState(6);

  const refresh = useCallback(async () => {
    const [{ data: p }, { data: s }, { data: c }] = await Promise.all([
      supabase.from("projects").select("*").eq("id", projectId).maybeSingle(),
      supabase.from("scenes").select("*").eq("project_id", projectId).order("scene_number"),
      supabase.from("characters").select("*").eq("project_id", projectId).order("created_at"),
    ]);
    setProject(p);
    setScenes(s ?? []);
    setCharacters(c ?? []);
  }, [projectId]);

  useEffect(() => { if (user) refresh(); }, [user, refresh]);

  if (loading || !user) return <div className="min-h-screen grid place-items-center text-muted-foreground">Loading…</div>;
  if (!project) return <div className="min-h-screen grid place-items-center text-muted-foreground">Project not found.</div>;

  const generateScript = async () => {
    if (!project.logline) return toast.error("Add a logline first.");
    setGenerating(true);
    try {
      const res = await fetch(`${FN_BASE}/generate-script`, {
        method: "POST",
        headers: FN_HEADERS,
        body: JSON.stringify({
          logline: project.logline,
          genre: project.genre,
          visual_style: project.visual_style,
          num_scenes: numScenes,
          characters: characters.map(c => ({ name: c.name, description: c.description })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Generation failed");
      // Replace scenes
      await supabase.from("scenes").delete().eq("project_id", projectId);
      const rows = (data.scenes as any[]).map((s, i) => ({
        project_id: projectId, user_id: user.id, scene_number: i + 1,
        title: s.title, prompt: s.prompt, narration: s.narration, status: "pending",
      }));
      const { error } = await supabase.from("scenes").insert(rows);
      if (error) throw error;
      toast.success(`Generated ${rows.length} scenes`);
      refresh();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setGenerating(false);
    }
  };

  const renderScene = async (scene: Scene) => {
    if (!scene.prompt) return;
    await supabase.from("scenes").update({ status: "rendering" }).eq("id", scene.id);
    setScenes(prev => prev.map(s => s.id === scene.id ? { ...s, status: "rendering" } : s));
    try {
      const res = await fetch(`${FN_BASE}/generate-image`, {
        method: "POST",
        headers: FN_HEADERS,
        body: JSON.stringify({
          prompt: scene.prompt,
          style: project.visual_style,
          character_refs: characters.filter(c => c.reference_image).map(c => c.reference_image),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Render failed");
      await supabase.from("scenes").update({ image_url: data.image_url, status: "done" }).eq("id", scene.id);
      setScenes(prev => prev.map(s => s.id === scene.id ? { ...s, image_url: data.image_url, status: "done" } : s));
    } catch (e: any) {
      toast.error(e.message);
      await supabase.from("scenes").update({ status: "error" }).eq("id", scene.id);
      setScenes(prev => prev.map(s => s.id === scene.id ? { ...s, status: "error" } : s));
    }
  };

  const renderAll = async () => {
    setRenderingAll(true);
    for (const s of scenes) {
      if (!s.image_url) await renderScene(s);
    }
    setRenderingAll(false);
    toast.success("Storyboard complete.");
  };

  const deleteProject = async () => {
    if (!confirm("Delete this project and all scenes?")) return;
    await supabase.from("projects").delete().eq("id", projectId);
    navigate({ to: "/dashboard" });
  };

  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="container mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <Button asChild variant="ghost" size="sm"><Link to="/dashboard"><ArrowLeft className="size-4 mr-2" /> All projects</Link></Button>
          <Button onClick={deleteProject} variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive">
            <Trash2 className="size-4" />
          </Button>
        </div>

        <ProjectHeader project={project} onUpdate={refresh} />

        <Tabs defaultValue="storyboard" className="mt-10">
          <TabsList className="bg-card/60 backdrop-blur">
            <TabsTrigger value="storyboard"><Film className="size-4 mr-2" /> Storyboard</TabsTrigger>
            <TabsTrigger value="characters"><Users className="size-4 mr-2" /> Characters ({characters.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="storyboard" className="mt-6 space-y-6">
            <Card className="p-5 bg-card/60 backdrop-blur border-border/60 flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-2">
                <Label htmlFor="ns" className="text-sm">Scenes:</Label>
                <Input id="ns" type="number" min={1} max={12} value={numScenes} onChange={(e) => setNumScenes(parseInt(e.target.value) || 6)} className="w-20" />
              </div>
              <Button onClick={generateScript} disabled={generating} className="bg-gradient-ember border-0 text-primary-foreground shadow-glow">
                <Wand2 className="size-4 mr-2" /> {generating ? "Directing…" : scenes.length ? "Regenerate script" : "Generate script"}
              </Button>
              {scenes.length > 0 && (
                <Button onClick={renderAll} disabled={renderingAll} variant="outline">
                  <ImageIcon className="size-4 mr-2" /> {renderingAll ? "Rendering…" : "Render all stills"}
                </Button>
              )}
            </Card>

            {scenes.length === 0 ? (
              <Card className="p-16 text-center bg-card/40 border-dashed border-border/60">
                <Film className="size-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="font-display text-xl font-bold mb-2">No shots yet</h3>
                <p className="text-muted-foreground">Generate a script to start your storyboard.</p>
              </Card>
            ) : (
              <div className="space-y-5">
                {scenes.map(scene => (
                  <SceneCard key={scene.id} scene={scene} onRender={() => renderScene(scene)} onChange={refresh} />
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="characters" className="mt-6">
            <CharactersTab projectId={projectId} userId={user.id} characters={characters} onChange={refresh} />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}

function ProjectHeader({ project, onUpdate }: { project: Project; onUpdate: () => void }) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(project);
  useEffect(() => setForm(project), [project]);

  const save = async () => {
    await supabase.from("projects").update({
      title: form.title, logline: form.logline, genre: form.genre, visual_style: form.visual_style,
    }).eq("id", project.id);
    setEditing(false);
    onUpdate();
  };

  if (editing) {
    return (
      <Card className="p-6 bg-card/60 backdrop-blur border-border/60 space-y-3 shadow-cinema">
        <Input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} className="text-2xl font-display font-bold h-auto py-2" />
        <Textarea value={form.logline ?? ""} onChange={e => setForm({ ...form, logline: e.target.value })} rows={2} placeholder="Logline" />
        <div className="grid grid-cols-2 gap-3">
          <Input value={form.genre ?? ""} onChange={e => setForm({ ...form, genre: e.target.value })} placeholder="Genre" />
          <Input value={form.visual_style ?? ""} onChange={e => setForm({ ...form, visual_style: e.target.value })} placeholder="Visual style" />
        </div>
        <div className="flex gap-2">
          <Button onClick={save} className="bg-gradient-ember border-0 text-primary-foreground">Save</Button>
          <Button variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-6 bg-card/60 backdrop-blur border-border/60 shadow-cinema">
      <p className="text-xs uppercase tracking-widest text-primary mb-2">{project.genre || "Project"}</p>
      <h1 className="font-display text-3xl md:text-4xl font-bold mb-3">{project.title}</h1>
      <p className="text-muted-foreground max-w-3xl">{project.logline || "No logline yet."}</p>
      {project.visual_style && <p className="text-xs text-muted-foreground mt-3 italic">Style: {project.visual_style}</p>}
      <Button variant="ghost" size="sm" onClick={() => setEditing(true)} className="mt-3">Edit details</Button>
    </Card>
  );
}

function SceneCard({ scene, onRender, onChange }: { scene: Scene; onRender: () => void; onChange: () => void }) {
  const [editing, setEditing] = useState(false);
  const [prompt, setPrompt] = useState(scene.prompt ?? "");
  const [title, setTitle] = useState(scene.title ?? "");

  const save = async () => {
    await supabase.from("scenes").update({ prompt, title }).eq("id", scene.id);
    setEditing(false);
    onChange();
  };
  const del = async () => {
    if (!confirm("Delete this scene?")) return;
    await supabase.from("scenes").delete().eq("id", scene.id);
    onChange();
  };

  return (
    <Card className="overflow-hidden bg-card/60 backdrop-blur border-border/60 shadow-cinema">
      <div className="grid md:grid-cols-[2fr_3fr]">
        <div className="aspect-video bg-muted/40 grid place-items-center relative">
          {scene.image_url ? (
            <img src={scene.image_url} alt={scene.title || ""} className="w-full h-full object-cover" />
          ) : scene.status === "rendering" ? (
            <div className="text-muted-foreground text-sm flex items-center gap-2"><RefreshCw className="size-4 animate-spin" /> Rendering…</div>
          ) : (
            <div className="text-muted-foreground text-sm">No still yet</div>
          )}
          <div className="absolute top-3 left-3 px-2 py-1 rounded-md bg-background/80 backdrop-blur text-xs font-mono">
            #{String(scene.scene_number).padStart(2, "0")}
          </div>
        </div>
        <div className="p-5 space-y-3">
          {editing ? (
            <>
              <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Scene title" />
              <Textarea value={prompt} onChange={e => setPrompt(e.target.value)} rows={5} />
              <div className="flex gap-2">
                <Button size="sm" onClick={save} className="bg-gradient-ember border-0 text-primary-foreground">Save</Button>
                <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
              </div>
            </>
          ) : (
            <>
              <h3 className="font-display text-lg font-bold">{scene.title || `Scene ${scene.scene_number}`}</h3>
              {scene.narration && <p className="text-sm text-foreground/90 italic">"{scene.narration}"</p>}
              <p className="text-xs text-muted-foreground line-clamp-3">{scene.prompt}</p>
              <div className="flex flex-wrap gap-2 pt-2">
                <Button size="sm" onClick={onRender} disabled={scene.status === "rendering"} className="bg-gradient-ember border-0 text-primary-foreground">
                  <ImageIcon className="size-3.5 mr-1.5" /> {scene.image_url ? "Re-render" : "Render still"}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>Edit prompt</Button>
                <Button size="sm" variant="ghost" onClick={del} className="text-muted-foreground hover:text-destructive ml-auto"><Trash2 className="size-3.5" /></Button>
              </div>
            </>
          )}
        </div>
      </div>
    </Card>
  );
}

function CharactersTab({ projectId, userId, characters, onChange }: { projectId: string; userId: string; characters: Character[]; onChange: () => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", description: "" });
  const [generating, setGenerating] = useState<string | null>(null);

  const create = async () => {
    if (!form.name.trim()) return;
    await supabase.from("characters").insert({ project_id: projectId, user_id: userId, name: form.name, description: form.description });
    setForm({ name: "", description: "" });
    setOpen(false);
    onChange();
  };

  const generatePortrait = async (c: Character) => {
    setGenerating(c.id);
    try {
      const res = await fetch(`${FN_BASE}/generate-image`, {
        method: "POST",
        headers: FN_HEADERS,
        body: JSON.stringify({ prompt: `Character portrait, head and shoulders. ${c.name}: ${c.description ?? ""}`, style: "cinematic 3D animation character design" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      await supabase.from("characters").update({ reference_image: data.image_url }).eq("id", c.id);
      onChange();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setGenerating(null);
    }
  };

  const del = async (id: string) => {
    await supabase.from("characters").delete().eq("id", id);
    onChange();
  };

  return (
    <div>
      <div className="flex justify-end mb-5">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="bg-gradient-ember border-0 text-primary-foreground shadow-glow"><Plus className="size-4 mr-2" /> New character</Button>
          </DialogTrigger>
          <DialogContent className="bg-card/95 backdrop-blur border-border/60">
            <DialogHeader><DialogTitle className="font-display text-2xl">New character</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="space-y-2"><Label>Name</Label><Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
              <div className="space-y-2"><Label>Description</Label><Textarea rows={4} placeholder="Age, look, costume, defining traits…" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></div>
            </div>
            <DialogFooter><Button onClick={create} className="bg-gradient-ember border-0 text-primary-foreground">Create</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {characters.length === 0 ? (
        <Card className="p-16 text-center bg-card/40 border-dashed border-border/60">
          <Users className="size-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="font-display text-xl font-bold mb-2">No cast yet</h3>
          <p className="text-muted-foreground">Add characters so they stay consistent across every scene.</p>
        </Card>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {characters.map(c => (
            <Card key={c.id} className="overflow-hidden bg-card/60 backdrop-blur border-border/60 shadow-cinema">
              <div className="aspect-square bg-muted/40 grid place-items-center">
                {c.reference_image ? <img src={c.reference_image} alt={c.name} className="w-full h-full object-cover" />
                  : generating === c.id ? <RefreshCw className="size-6 animate-spin text-muted-foreground" />
                  : <Users className="size-12 text-muted-foreground" />}
              </div>
              <div className="p-4">
                <h4 className="font-display text-lg font-bold">{c.name}</h4>
                <p className="text-xs text-muted-foreground line-clamp-3 mt-1">{c.description}</p>
                <div className="flex gap-2 mt-3">
                  <Button size="sm" variant="outline" onClick={() => generatePortrait(c)} disabled={generating === c.id}>
                    <ImageIcon className="size-3.5 mr-1.5" /> {c.reference_image ? "Re-roll" : "Generate portrait"}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => del(c.id)} className="ml-auto text-muted-foreground hover:text-destructive"><Trash2 className="size-3.5" /></Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
