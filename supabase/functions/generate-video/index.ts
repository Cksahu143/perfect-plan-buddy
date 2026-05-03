// Generates a realistic short video clip using fal.ai (Kling v2.5 Turbo Pro).
// Supports text-to-video and image-to-video. Polls the queue, then re-uploads
// the result to Supabase Storage and returns a stable public URL.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

// Models we support. Default is Kling 2.5 Turbo Pro — best quality/$ for realism.
// image-to-video uses the i2v variant when an image_url is provided.
function pickModel(image_url?: string, model?: string) {
  if (model) return model;
  return image_url
    ? "fal-ai/kling-video/v2.5-turbo/pro/image-to-video"
    : "fal-ai/kling-video/v2.5-turbo/pro/text-to-video";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const FAL_KEY = Deno.env.get("FAL_KEY");
    if (!FAL_KEY) throw new Error("FAL_KEY not configured");

    const { prompt, style, image_url, project_id, scene_id, model, duration } = await req.json();
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

    const fullPrompt = `${prompt}. ${style || "Cinematic, photorealistic, shallow depth of field, dramatic natural lighting, smooth camera motion, ultra-detailed, 35mm film grain"}.`;
    const negative = "blurry, low quality, distorted, watermark, text, logo, deformed faces, extra limbs, jittery motion";

    const chosen = pickModel(image_url, model);
    const body: Record<string, unknown> = {
      prompt: fullPrompt,
      negative_prompt: negative,
      duration: String(duration || 5), // Kling accepts "5" or "10"
      aspect_ratio: "16:9",
      cfg_scale: 0.5,
    };
    if (image_url) body.image_url = image_url;

    // 1) Submit to fal queue
    const submitRes = await fetch(`https://queue.fal.run/${chosen}`, {
      method: "POST",
      headers: {
        Authorization: `Key ${FAL_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!submitRes.ok) {
      const t = await submitRes.text();
      console.error("fal submit error", submitRes.status, t);
      if (submitRes.status === 401 || submitRes.status === 403) {
        return json({ error: "Invalid FAL_KEY. Check the secret in project settings." }, 401);
      }
      if (submitRes.status === 402) {
        return json({ error: "fal.ai credits exhausted. Top up at fal.ai/dashboard/billing." }, 402);
      }
      return json({ error: `fal submit failed: ${submitRes.status} ${t.slice(0, 400)}` }, 500);
    }

    const submitData = await submitRes.json();
    const requestId: string = submitData.request_id;
    const statusUrl: string = submitData.status_url || `https://queue.fal.run/${chosen}/requests/${requestId}/status`;
    const responseUrl: string = submitData.response_url || `https://queue.fal.run/${chosen}/requests/${requestId}`;
    if (!requestId) throw new Error("fal did not return a request_id");

    // 2) Poll status until COMPLETED
    const TIMEOUT_MS = 8 * 60 * 1000;
    const start = Date.now();
    let result: any = null;
    while (Date.now() - start < TIMEOUT_MS) {
      await new Promise(r => setTimeout(r, 4000));
      const sRes = await fetch(statusUrl, { headers: { Authorization: `Key ${FAL_KEY}` } });
      if (!sRes.ok) {
        console.warn("status non-ok", sRes.status);
        continue;
      }
      const s = await sRes.json();
      const status = s.status;
      if (status === "COMPLETED") {
        const rRes = await fetch(responseUrl, { headers: { Authorization: `Key ${FAL_KEY}` } });
        if (!rRes.ok) throw new Error(`fal result fetch failed: ${rRes.status}`);
        result = await rRes.json();
        break;
      }
      if (status === "FAILED" || status === "ERROR") {
        throw new Error(`fal job failed: ${JSON.stringify(s).slice(0, 400)}`);
      }
      // IN_QUEUE / IN_PROGRESS — keep polling
    }

    if (!result) throw new Error("Video generation timed out after 8 minutes");

    const videoUrl: string | undefined =
      result?.video?.url || result?.video_url || result?.url || result?.output?.url;
    if (!videoUrl) {
      console.error("Unexpected fal result", JSON.stringify(result).slice(0, 600));
      throw new Error("fal returned no video URL");
    }

    // 3) Re-upload to our storage so the URL is stable
    const vRes = await fetch(videoUrl);
    if (!vRes.ok) throw new Error(`Could not fetch generated video: ${vRes.status}`);
    const bytes = new Uint8Array(await vRes.arrayBuffer());
    const path = `${userId}/${project_id}/scene-${scene_id}-${Date.now()}.mp4`;
    const { error: upErr } = await supabase.storage
      .from("media")
      .upload(path, bytes, { contentType: "video/mp4", upsert: true });
    if (upErr) throw upErr;
    const { data: pub } = supabase.storage.from("media").getPublicUrl(path);

    // Persist on the scene row
    await supabase.from("scenes").update({ video_url: pub.publicUrl }).eq("id", scene_id);

    return json({ video_url: pub.publicUrl, model: chosen });
  } catch (e) {
    console.error(e);
    return json({ error: e instanceof Error ? e.message : "Unknown" }, 500);
  }
});
