import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useRequireAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { Navbar } from "@/components/navbar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Plus, Film, Trash2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/dashboard")({
  component: Dashboard,
  head: () => ({ meta: [{ title: "Studio — AnimAI" }] }),
});

type Project = { id: string; title: string; logline: string | null; genre: string | null; visual_style: string | null; status: string; created_at: string };

function Dashboard() {
  const { user, loading } = useRequireAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ title: "", logline: "", genre: "Sci-fi adventure", visual_style: "Cinematic 3D animation, dramatic lighting" });
  const navigate = useNavigate();

  useEffect(() => {
    if (!user) return;
    supabase.from("projects").select("*").order("created_at", { ascending: false })
      .then(({ data, error }) => {
        if (error) toast.error(error.message);
        else setProjects(data ?? []);
      });
  }, [user]);

  const create = async () => {
    if (!form.title.trim() || !user) return;
    setCreating(true);
    const { data, error } = await supabase.from("projects").insert({
      user_id: user.id,
      title: form.title,
      logline: form.logline || null,
      genre: form.genre || null,
      visual_style: form.visual_style || null,
    }).select().single();
    setCreating(false);
    if (error) return toast.error(error.message);
    setOpen(false);
    navigate({ to: "/projects/$projectId", params: { projectId: data.id } });
  };

  const del = async (id: string) => {
    if (!confirm("Delete this project?")) return;
    const { error } = await supabase.from("projects").delete().eq("id", id);
    if (error) toast.error(error.message);
    else setProjects(projects.filter(p => p.id !== id));
  };

  if (loading || !user) return <div className="min-h-screen grid place-items-center text-muted-foreground">Loading…</div>;

  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="container mx-auto px-6 py-12">
        <div className="flex items-end justify-between mb-10">
          <div>
            <p className="text-xs uppercase tracking-widest text-primary mb-2">Your studio</p>
            <h1 className="font-display text-4xl md:text-5xl font-bold">Projects</h1>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="bg-gradient-ember border-0 text-primary-foreground shadow-glow">
                <Plus className="size-4 mr-2" /> New project
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-card/95 backdrop-blur border-border/60">
              <DialogHeader><DialogTitle className="font-display text-2xl">New project</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Title</Label>
                  <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Episode 1: The Awakening" />
                </div>
                <div className="space-y-2">
                  <Label>Logline</Label>
                  <Textarea value={form.logline} onChange={(e) => setForm({ ...form, logline: e.target.value })} placeholder="A young engineer wakes alone in an abandoned space station orbiting a dying star…" rows={3} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Genre</Label>
                    <Input value={form.genre} onChange={(e) => setForm({ ...form, genre: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Visual style</Label>
                    <Input value={form.visual_style} onChange={(e) => setForm({ ...form, visual_style: e.target.value })} />
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button onClick={create} disabled={creating || !form.title.trim()} className="bg-gradient-ember border-0 text-primary-foreground">
                  {creating ? "Creating…" : "Create project"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {projects.length === 0 ? (
          <Card className="p-16 text-center bg-card/40 border-dashed border-border/60">
            <div className="mx-auto size-14 rounded-xl bg-gradient-ember grid place-items-center shadow-glow mb-4">
              <Film className="size-7 text-primary-foreground" />
            </div>
            <h2 className="font-display text-2xl font-bold mb-2">No projects yet</h2>
            <p className="text-muted-foreground mb-6">Start a new episode to roll camera.</p>
            <Button onClick={() => setOpen(true)} className="bg-gradient-ember border-0 text-primary-foreground shadow-glow">
              <Plus className="size-4 mr-2" /> Create your first project
            </Button>
          </Card>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
            {projects.map(p => (
              <Card key={p.id} className="group relative overflow-hidden bg-card/60 backdrop-blur border-border/60 hover:border-primary/50 transition-all shadow-cinema">
                <Link to="/projects/$projectId" params={{ projectId: p.id }} className="block p-6">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs uppercase tracking-widest text-primary">{p.genre || "Untitled genre"}</span>
                    <span className="text-xs text-muted-foreground">{new Date(p.created_at).toLocaleDateString()}</span>
                  </div>
                  <h3 className="font-display text-xl font-bold mb-2 group-hover:text-gradient-cinema">{p.title}</h3>
                  <p className="text-sm text-muted-foreground line-clamp-3">{p.logline || "No logline yet."}</p>
                </Link>
                <button onClick={() => del(p.id)} className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity p-2 rounded-md hover:bg-destructive/20 text-muted-foreground hover:text-destructive">
                  <Trash2 className="size-4" />
                </button>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
