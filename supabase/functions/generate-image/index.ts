// Generates a cinematic still from a prompt using Lovable AI image gen.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { prompt, style, character_refs = [] } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");
    if (!prompt) throw new Error("prompt is required");

    const fullPrompt = `Cinematic film still, ${style || "high-end 3D animation"}, dramatic lighting, anamorphic, depth of field, ultra detailed. ${prompt}`;

    const content: any[] = [{ type: "text", text: fullPrompt }];
    for (const url of character_refs.slice(0, 3)) {
      if (url) content.push({ type: "image_url", image_url: { url } });
    }

    const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-image",
        messages: [{ role: "user", content: content.length === 1 ? fullPrompt : content }],
        modalities: ["image", "text"],
      }),
    });

    if (r.status === 429) return new Response(JSON.stringify({ error: "Rate limit, please retry shortly." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    if (r.status === 402) return new Response(JSON.stringify({ error: "AI credits exhausted. Add credits in workspace settings." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    if (!r.ok) {
      const t = await r.text();
      console.error("Image AI error", r.status, t);
      return new Response(JSON.stringify({ error: "Image generation failed" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const data = await r.json();
    const url = data.choices?.[0]?.message?.images?.[0]?.image_url?.url;
    if (!url) return new Response(JSON.stringify({ error: "No image returned" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    return new Response(JSON.stringify({ image_url: url }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
