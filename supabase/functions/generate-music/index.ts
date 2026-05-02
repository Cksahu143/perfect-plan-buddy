// ElevenLabs Music. Uploads MP3 soundtrack to Supabase Storage and returns public URL.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const ELEVENLABS_API_KEY = Deno.env.get("ELEVENLABS_API_KEY");
    if (!ELEVENLABS_API_KEY) throw new Error("ELEVENLABS_API_KEY not configured");

    const { prompt, duration_seconds = 30, project_id } = await req.json();
    if (!prompt) throw new Error("prompt is required");
    if (!project_id) throw new Error("project_id required");

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing auth");
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: userData } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    const userId = userData.user?.id;
    if (!userId) throw new Error("Unauthorized");

    const r = await fetch("https://api.elevenlabs.io/v1/music", {
      method: "POST",
      headers: { "xi-api-key": ELEVENLABS_API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: `Cinematic film score. ${prompt}`,
        music_length_ms: Math.max(10000, Math.min(120000, duration_seconds * 1000)),
      }),
    });

    if (!r.ok) {
      const t = await r.text();
      console.error("ElevenLabs Music error", r.status, t);
      return new Response(JSON.stringify({ error: `Music gen failed: ${r.status} ${t.slice(0, 200)}` }), { status: r.status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const audio = new Uint8Array(await r.arrayBuffer());
    const path = `${userId}/${project_id}/soundtrack-${Date.now()}.mp3`;
    const { error: upErr } = await supabase.storage.from("media").upload(path, audio, { contentType: "audio/mpeg", upsert: true });
    if (upErr) throw upErr;
    const { data: pub } = supabase.storage.from("media").getPublicUrl(path);

    return new Response(JSON.stringify({ music_url: pub.publicUrl }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
