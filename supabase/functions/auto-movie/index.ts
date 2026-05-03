// One-Prompt Movie orchestrator.
// Accepts: { prompt, duration_minutes, style }
// Returns immediately with { job_id }. Runs the full pipeline in background:
//   1) generate script (Lovable AI) -> N scenes (~8s each)
//   2) generate a video clip per scene via fal.ai (Kling 2.5 turbo, parallel batches)
//   3) generate narration per scene via ElevenLabs (parallel)
//   4) build a master playlist JSON (client plays seamlessly back-to-back)
// We do NOT stitch with ffmpeg (Workers can't run ffmpeg). The "final video"
// is delivered as an ordered playlist + per-scene audio, played continuously
// in the UI for a single uninterrupted experience.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
const FAL_KEY = Deno.env.get("FAL_KEY")!;
const ELEVENLABS_API_KEY = Deno.env.get("ELEVENLABS_API_KEY");

const SECONDS_PER_SCENE = 8; // Kling 2.5 outputs ~5–10s; we target 8.
const PARALLEL = 3;          // simultaneous fal.ai jobs (avoid rate limits)

// @ts-ignore EdgeRuntime is provided by Supabase
declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    const auth = req.headers.get("Authorization");
    if (!auth) return json({ error: "Unauthorized" }, 401);
    const userClient = createClient(SUPABASE_URL, SERVICE_KEY, {
      global: { headers: { Authorization: auth } },
    });
    const { data: u } = await userClient.auth.getUser(auth.replace("Bearer ", ""));
    const userId = u.user?.id;
    if (!userId) return json({ error: "Unauthorized" }, 401);

    const { prompt, duration_minutes = 5, style } = await req.json();
    if (!prompt) return json({ error: "prompt required" }, 400);

    const minutes = Math.max(1, Math.min(30, Number(duration_minutes) || 5));
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // Create an empty project to host the scenes
    const { data: project, error: projErr } = await admin
      .from("projects")
      .insert({
        user_id: userId,
        title: prompt.slice(0, 80),
        logline: prompt,
        visual_style: style || "cinematic, photorealistic, 35mm",
        status: "auto",
      })
      .select()
      .single();
    if (projErr) throw projErr;

    const { data: job, error: jobErr } = await admin
      .from("video_jobs")
      .insert({
        user_id: userId,
        project_id: project.id,
        prompt,
        duration_minutes: minutes,
        style: style || null,
        status: "queued",
        current_step: "Queued",
      })
      .select()
      .single();
    if (jobErr) throw jobErr;

    EdgeRuntime.waitUntil(runPipeline(job.id, project.id, userId, prompt, minutes, style));
    return json({ job_id: job.id, project_id: project.id });
  } catch (e) {
    console.error("auto-movie error", e);
    return json({ error: e instanceof Error ? e.message : "Unknown" }, 500);
  }
});

async function runPipeline(jobId: string, projectId: string, userId: string, prompt: string, minutes: number, style?: string) {
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  const update = (patch: Record<string, unknown>) =>
    admin.from("video_jobs").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", jobId);

  try {
    const targetSeconds = minutes * 60;
    const numScenes = Math.max(2, Math.ceil(targetSeconds / SECONDS_PER_SCENE));
    await update({ status: "scripting", current_step: `Writing ${numScenes}-scene script`, scenes_total: numScenes, progress: 2 });

    // 1) Script
    const scenes = await writeScript(prompt, style, numScenes);
    if (!scenes.length) throw new Error("Script generation returned no scenes");

    // Insert scene rows
    const sceneRows = scenes.map((s, i) => ({
      user_id: userId,
      project_id: projectId,
      scene_number: i + 1,
      title: s.title,
      prompt: s.prompt,
      narration: s.narration,
      status: "queued",
    }));
    const { data: inserted, error: insErr } = await admin.from("scenes").insert(sceneRows).select();
    if (insErr) throw insErr;
    const sceneIds = (inserted ?? []).sort((a: any, b: any) => a.scene_number - b.scene_number);

    await update({ status: "rendering", current_step: "Generating video clips", scenes_total: numScenes, progress: 8 });

    // 2) Render clips in parallel batches
    let done = 0;
    for (let i = 0; i < sceneIds.length; i += PARALLEL) {
      const batch = sceneIds.slice(i, i + PARALLEL);
      await Promise.all(batch.map(async (row: any) => {
        try {
          const videoUrl = await renderClip(row.prompt, style, userId, projectId, row.id);
          await admin.from("scenes").update({ video_url: videoUrl, status: "ready" }).eq("id", row.id);
        } catch (err) {
          console.error("scene render failed", row.id, err);
          await admin.from("scenes").update({ status: "error" }).eq("id", row.id);
        }
        done++;
        const prog = 8 + Math.floor((done / sceneIds.length) * 75);
        await update({ scenes_done: done, progress: prog, current_step: `Rendered ${done}/${sceneIds.length} clips` });
      }));
    }

    // 3) Narration in parallel (best effort)
    if (ELEVENLABS_API_KEY) {
      await update({ current_step: "Generating narration", progress: 86 });
      await Promise.all(sceneIds.map(async (row: any) => {
        if (!row.narration) return;
        try {
          const url = await renderNarration(row.narration, userId, projectId, row.id);
          await admin.from("scenes").update({ narration_url: url }).eq("id", row.id);
        } catch (e) {
          console.warn("narration failed", row.id, e);
        }
      }));
    }

    // 4) Build playlist (no ffmpeg — client plays back-to-back seamlessly)
    const { data: finalScenes } = await admin
      .from("scenes")
      .select("scene_number, video_url, narration_url, narration, title")
      .eq("project_id", projectId)
      .order("scene_number");
    const playlist = {
      kind: "playlist",
      total_seconds: numScenes * SECONDS_PER_SCENE,
      scenes: finalScenes ?? [],
    };
    const path = `${userId}/${projectId}/playlist-${jobId}.json`;
    await admin.storage.from("media").upload(path, new TextEncoder().encode(JSON.stringify(playlist)), {
      contentType: "application/json",
      upsert: true,
    });
    const { data: pub } = admin.storage.from("media").getPublicUrl(path);

    await update({
      status: "completed",
      current_step: "Done",
      progress: 100,
      final_video_url: pub.publicUrl,
    });
  } catch (e) {
    console.error("pipeline failed", e);
    await update({ status: "failed", error: e instanceof Error ? e.message : String(e) });
  }
}

async function writeScript(prompt: string, style: string | undefined, numScenes: number) {
  const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: "You are a senior film director. Break a prompt into a sequence of single-shot scenes. Each scene is ~8 seconds. Maintain visual continuity (same characters, same setting, consistent style) across all scenes. Be cinematic and concrete." },
        { role: "user", content: `Prompt: ${prompt}\nStyle: ${style || "cinematic, photorealistic"}\nGenerate exactly ${numScenes} scenes that flow as one continuous story.` },
      ],
      tools: [{
        type: "function",
        function: {
          name: "shot_list",
          parameters: {
            type: "object",
            properties: {
              scenes: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    title: { type: "string" },
                    prompt: { type: "string", description: "Detailed visual prompt for video generation including camera, lighting, action." },
                    narration: { type: "string", description: "Short narration line, 1 sentence." },
                  },
                  required: ["title", "prompt", "narration"],
                  additionalProperties: false,
                },
              },
            },
            required: ["scenes"],
            additionalProperties: false,
          },
        },
      }],
      tool_choice: { type: "function", function: { name: "shot_list" } },
    }),
  });
  if (!r.ok) throw new Error(`Script gen failed: ${r.status} ${(await r.text()).slice(0, 200)}`);
  const data = await r.json();
  const args = data.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
  const parsed = args ? JSON.parse(args) : { scenes: [] };
  return (parsed.scenes ?? []).slice(0, numScenes);
}

async function renderClip(prompt: string, style: string | undefined, userId: string, projectId: string, sceneId: string) {
  const model = "fal-ai/kling-video/v2.5-turbo/pro/text-to-video";
  const fullPrompt = `${prompt}. ${style || "cinematic, photorealistic, shallow DoF, dramatic lighting, smooth camera"}`;
  const submit = await fetch(`https://queue.fal.run/${model}`, {
    method: "POST",
    headers: { Authorization: `Key ${FAL_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt: fullPrompt,
      negative_prompt: "blurry, watermark, text, deformed, jittery",
      duration: "5",
      aspect_ratio: "16:9",
      cfg_scale: 0.5,
    }),
  });
  if (!submit.ok) throw new Error(`fal submit ${submit.status}: ${(await submit.text()).slice(0, 200)}`);
  const sd = await submit.json();
  const requestId = sd.request_id;
  const statusUrl = sd.status_url || `https://queue.fal.run/${model}/requests/${requestId}/status`;
  const responseUrl = sd.response_url || `https://queue.fal.run/${model}/requests/${requestId}`;

  const start = Date.now();
  const TIMEOUT = 8 * 60 * 1000;
  let result: any = null;
  while (Date.now() - start < TIMEOUT) {
    await new Promise((r) => setTimeout(r, 4000));
    const sr = await fetch(statusUrl, { headers: { Authorization: `Key ${FAL_KEY}` } });
    if (!sr.ok) continue;
    const s = await sr.json();
    if (s.status === "COMPLETED") {
      const rr = await fetch(responseUrl, { headers: { Authorization: `Key ${FAL_KEY}` } });
      result = await rr.json();
      break;
    }
    if (s.status === "FAILED" || s.status === "ERROR") throw new Error(`fal failed: ${JSON.stringify(s).slice(0, 200)}`);
  }
  if (!result) throw new Error("fal timeout");
  const videoUrl: string = result?.video?.url || result?.video_url || result?.url;
  if (!videoUrl) throw new Error("fal: no video URL");

  const v = await fetch(videoUrl);
  const bytes = new Uint8Array(await v.arrayBuffer());
  const path = `${userId}/${projectId}/scene-${sceneId}-${Date.now()}.mp4`;
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  const { error } = await admin.storage.from("media").upload(path, bytes, { contentType: "video/mp4", upsert: true });
  if (error) throw error;
  return admin.storage.from("media").getPublicUrl(path).data.publicUrl;
}

async function renderNarration(text: string, userId: string, projectId: string, sceneId: string) {
  const r = await fetch("https://api.elevenlabs.io/v1/text-to-speech/JBFqnCBsd6RMkjVDRZzb", {
    method: "POST",
    headers: { "xi-api-key": ELEVENLABS_API_KEY!, "Content-Type": "application/json" },
    body: JSON.stringify({ text, model_id: "eleven_turbo_v2_5", voice_settings: { stability: 0.45, similarity_boost: 0.75 } }),
  });
  if (!r.ok) throw new Error(`elevenlabs ${r.status}`);
  const bytes = new Uint8Array(await r.arrayBuffer());
  const path = `${userId}/${projectId}/narr-${sceneId}-${Date.now()}.mp3`;
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  const { error } = await admin.storage.from("media").upload(path, bytes, { contentType: "audio/mpeg", upsert: true });
  if (error) throw error;
  return admin.storage.from("media").getPublicUrl(path).data.publicUrl;
}
