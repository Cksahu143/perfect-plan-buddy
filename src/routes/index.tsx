import { createFileRoute, Link } from "@tanstack/react-router";
import { Navbar } from "@/components/navbar";
import { Button } from "@/components/ui/button";
import heroImg from "@/assets/hero.jpg";
import { Sparkles, Film, Users, Wand2, Layers, Clapperboard } from "lucide-react";

export const Route = createFileRoute("/")({
  component: Index,
  head: () => ({
    meta: [
      { title: "AnimAI Studio — Cinematic AI animation engine" },
      { name: "description", content: "Direct full episodes from a single logline. Consistent characters, cinematic storyboards, and a real director's workspace — powered by AI." },
      { property: "og:title", content: "AnimAI Studio" },
      { property: "og:description", content: "Cinematic AI animation engine. Logline → episode." },
    ],
  }),
});

function Index() {
  return (
    <div className="min-h-screen">
      <Navbar />

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0">
          <img src={heroImg} alt="" width={1920} height={1080} className="w-full h-full object-cover opacity-40" />
          <div className="absolute inset-0 bg-gradient-to-b from-background/40 via-background/70 to-background" />
        </div>
        <div className="relative container mx-auto px-6 pt-24 pb-32 text-center max-w-5xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-primary/30 bg-primary/5 text-xs uppercase tracking-widest text-primary mb-8">
            <Sparkles className="size-3" /> Level 5 cinematic engine
          </div>
          <h1 className="font-display text-5xl md:text-7xl lg:text-8xl font-bold leading-[0.95] tracking-tight mb-6">
            Direct episodes,<br />
            <span className="text-gradient-cinema">not clips.</span>
          </h1>
          <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto mb-10 leading-relaxed">
            AnimAI Studio is a cinematic operating system for AI-generated animation.
            Build a story, lock your characters, and render a full storyboard a real
            animation director would accept.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-4">
            <Button asChild size="lg" className="bg-gradient-ember border-0 text-primary-foreground shadow-glow hover:opacity-90 h-12 px-8">
              <Link to="/auth">Open the studio</Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="h-12 px-8 bg-background/40 backdrop-blur">
              <a href="#how">See how it works</a>
            </Button>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="how" className="container mx-auto px-6 py-24">
        <div className="text-center mb-16">
          <p className="text-xs uppercase tracking-widest text-primary mb-3">The pipeline</p>
          <h2 className="font-display text-4xl md:text-5xl font-bold">A real director's workflow</h2>
        </div>
        <div className="grid md:grid-cols-3 gap-6">
          {[
            { Icon: Wand2, title: "Logline → Shot list", body: "Drop a one-line idea. The director model breaks it into cinematic shots with prompts and narration." },
            { Icon: Users, title: "Character Lock", body: "Build your cast once. Every scene reuses the same descriptions so faces stay consistent." },
            { Icon: Film, title: "Storyboard render", body: "Each scene generates a film still — anamorphic, lit, framed. Re-roll any shot you don't love." },
            { Icon: Layers, title: "Scene editor", body: "Reorder, rewrite, and refine prompts shot by shot like a real animatic." },
            { Icon: Clapperboard, title: "Style presets", body: "Pick a visual language — Pixar, anime, noir, painterly — and the whole episode honors it." },
            { Icon: Sparkles, title: "Free to start", body: "Powered by Lovable AI. Generous free credits, no API keys to configure." },
          ].map(({ Icon, title, body }) => (
            <div key={title} className="group relative rounded-2xl border border-border/60 bg-card/50 backdrop-blur p-6 hover:border-primary/40 transition-colors shadow-cinema">
              <div className="size-10 rounded-lg bg-gradient-ember grid place-items-center mb-4 shadow-glow">
                <Icon className="size-5 text-primary-foreground" />
              </div>
              <h3 className="font-display text-xl font-semibold mb-2">{title}</h3>
              <p className="text-muted-foreground text-sm leading-relaxed">{body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Manifesto */}
      <section className="container mx-auto px-6 py-24">
        <div className="rounded-3xl border border-border/60 bg-gradient-to-br from-card/80 to-card/30 backdrop-blur p-10 md:p-16 grain shadow-cinema">
          <p className="text-xs uppercase tracking-widest text-primary mb-4">The prime directive</p>
          <p className="font-display text-2xl md:text-4xl font-medium leading-tight max-w-4xl">
            "Would a real animation director at a professional studio accept this output?"
          </p>
          <p className="text-muted-foreground mt-6 max-w-2xl">
            Every shot is gated against that question. AnimAI Studio is not a prompt-to-clip
            wrapper. It is a stage, a cast, and a director — all yours.
          </p>
        </div>
      </section>

      {/* CTA */}
      <section className="container mx-auto px-6 py-24 text-center">
        <h2 className="font-display text-4xl md:text-6xl font-bold mb-6">Roll camera.</h2>
        <p className="text-muted-foreground text-lg mb-8">Your first episode is one logline away.</p>
        <Button asChild size="lg" className="bg-gradient-ember border-0 text-primary-foreground shadow-glow hover:opacity-90 h-12 px-10">
          <Link to="/auth">Enter the studio</Link>
        </Button>
      </section>

      <footer className="border-t border-border/40 py-8 text-center text-sm text-muted-foreground">
        © {new Date().getFullYear()} AnimAI Studio
      </footer>
    </div>
  );
}
