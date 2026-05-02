// ElevenLabs TTS narration. Uploads MP3 to Supabase Storage and returns public URL.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const VOICE_PRESETS: Record<string, string> = {
  narrator: "JBFqnCBsd6RMkjVDRZzb", // George - warm narrator
  cinematic: "onwK4e9ZLuTAKqWW03F9", // Daniel - deep cinematic
  female: "EXAVITQu4vr4xnSDxMaL",    // Sarah
  male: "TX3LPaxmHKxFdv7VOQHJ",      // Liam
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const ELEVENLABS_API_KEY = Deno.env.get("ELEVENLABS_API_KEY");
    if (!ELEVENLABS_API_KEY) throw new Error("ELEVENLABS_API_KEY not configured");

    const { text, voice = "narrator", project_id, scene_id } = await req.json();
    if (!text) throw new Error("text is required");
    if (!scene_id || !project_id) throw new Error("scene_id and project_id required");

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

    const voiceId = VOICE_PRESETS[voice] || voice;
    const r = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`,
      {
        method: "POST",
        headers: { "xi-api-key": ELEVENLABS_API_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          model_id: "eleven_multilingual_v2",
          voice_settings: { stability: 0.55, similarity_boost: 0.75, style: 0.4, use_speaker_boost: true },
        }),
      }
    );

    if (!r.ok) {
      const t = await r.text();
      console.error("ElevenLabs TTS error", r.status, t);
      return new Response(JSON.stringify({ error: `TTS failed: ${r.status}` }), { status: r.status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const audio = new Uint8Array(await r.arrayBuffer());
    const path = `${userId}/${project_id}/narration-${scene_id}-${Date.now()}.mp3`;
    const { error: upErr } = await supabase.storage.from("media").upload(path, audio, { contentType: "audio/mpeg", upsert: true });
    if (upErr) throw upErr;
    const { data: pub } = supabase.storage.from("media").getPublicUrl(path);

    return new Response(JSON.stringify({ audio_url: pub.publicUrl }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
