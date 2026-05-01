import { Link, useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Film, LogOut } from "lucide-react";

export function Navbar() {
  const { user } = useAuth();
  const navigate = useNavigate();

  return (
    <header className="sticky top-0 z-40 backdrop-blur-xl bg-background/70 border-b border-border/50">
      <div className="container mx-auto flex h-16 items-center justify-between px-6">
        <Link to="/" className="flex items-center gap-2 group">
          <div className="size-8 rounded-md bg-gradient-cinema grid place-items-center shadow-glow">
            <Film className="size-4 text-primary-foreground" />
          </div>
          <span className="font-display text-lg font-bold tracking-tight">
            AnimAI <span className="text-gradient-cinema">Studio</span>
          </span>
        </Link>
        <nav className="flex items-center gap-2">
          {user ? (
            <>
              <Button asChild variant="ghost" size="sm">
                <Link to="/dashboard">Studio</Link>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={async () => {
                  await supabase.auth.signOut();
                  navigate({ to: "/" });
                }}
              >
                <LogOut className="size-4" />
              </Button>
            </>
          ) : (
            <>
              <Button asChild variant="ghost" size="sm">
                <Link to="/auth">Sign in</Link>
              </Button>
              <Button asChild size="sm" className="bg-gradient-ember text-primary-foreground border-0 shadow-glow hover:opacity-90">
                <Link to="/auth">Start creating</Link>
              </Button>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
