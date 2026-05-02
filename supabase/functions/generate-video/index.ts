// Generates a short cinematic video clip using Lovable AI Veo gateway.
// Polls until ready, then uploads to Supabase Storage and returns public URL.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const { prompt, style, image_url, project_id, scene_id } = await req.json();
    if (!prompt) throw new Error("prompt required");
    if (!project_id || !scene_id) throw new Error("project_id and scene_id required");

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

    const fullPrompt = `Cinematic film clip, ${style || "high-end 3D animation"}, dramatic lighting, smooth camera motion. ${prompt}`;

    // Submit job to Lovable AI video endpoint
    const submitBody: any = {
      model: "google/veo-3-fast",
      prompt: fullPrompt,
      duration_seconds: 5,
      aspect_ratio: "16:9",
    };
    if (image_url) submitBody.image_url = image_url;

    const submitRes = await fetch("https://ai.gateway.lovable.dev/v1/video/generations", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify(submitBody),
    });

    if (submitRes.status === 429) return new Response(JSON.stringify({ error: "Rate limit, please retry shortly." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    if (submitRes.status === 402) return new Response(JSON.stringify({ error: "AI credits exhausted. Add credits in workspace settings." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    if (!submitRes.ok) {
      const t = await submitRes.text();
      console.error("Video submit error", submitRes.status, t);
      return new Response(JSON.stringify({ error: `Video submit failed: ${submitRes.status} ${t.slice(0, 300)}` }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const submitData = await submitRes.json();
    const jobId = submitData.id || submitData.job_id || submitData.task_id;
    let videoUrl: string | undefined =
      submitData.video_url || submitData.url || submitData.data?.[0]?.url;

    // Poll if needed
    if (!videoUrl && jobId) {
      const start = Date.now();
      const TIMEOUT_MS = 5 * 60 * 1000;
      while (Date.now() - start < TIMEOUT_MS) {
        await new Promise(r => setTimeout(r, 5000));
        const pollRes = await fetch(`https://ai.gateway.lovable.dev/v1/video/generations/${jobId}`, {
          headers: { Authorization: `Bearer ${LOVABLE_API_KEY}` },
        });
        if (!pollRes.ok) {
          console.warn("poll non-ok", pollRes.status);
          continue;
        }
        const pd = await pollRes.json();
        const status = pd.status || pd.state;
        videoUrl = pd.video_url || pd.url || pd.data?.[0]?.url || pd.output?.[0];
        if (videoUrl) break;
        if (status === "failed" || status === "error") {
          throw new Error(`Video generation failed: ${pd.error || "unknown"}`);
        }
      }
    }

    if (!videoUrl) throw new Error("Video generation timed out");

    // Download and re-upload to our storage for stable hosting
    const vRes = await fetch(videoUrl);
    if (!vRes.ok) throw new Error(`Could not fetch generated video: ${vRes.status}`);
    const bytes = new Uint8Array(await vRes.arrayBuffer());
    const path = `${userId}/${project_id}/scene-${scene_id}-${Date.now()}.mp4`;
    const { error: upErr } = await supabase.storage.from("media").upload(path, bytes, { contentType: "video/mp4", upsert: true });
    if (upErr) throw upErr;
    const { data: pub } = supabase.storage.from("media").getPublicUrl(path);

    return new Response(JSON.stringify({ video_url: pub.publicUrl }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
