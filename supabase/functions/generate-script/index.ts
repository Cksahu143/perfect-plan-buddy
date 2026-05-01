// Generates a structured cinematic script: scenes with prompt + narration.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { logline, genre, visual_style, num_scenes = 6, characters = [] } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const charBlock = characters.length
      ? `Recurring characters (must remain visually consistent):\n${characters.map((c: any) => `- ${c.name}: ${c.description ?? ""}`).join("\n")}\n`
      : "";

    const system = `You are a senior animation director. Break a logline into a cinematic shot list. Each scene is one shot. Be concrete, visual, and consistent. Use the same character descriptions every scene.`;
    const user = `Logline: ${logline}
Genre: ${genre || "n/a"}
Visual style: ${visual_style || "cinematic 3D animation, dramatic lighting"}
${charBlock}Generate exactly ${num_scenes} scenes.`;

    const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{ role: "system", content: system }, { role: "user", content: user }],
        tools: [{
          type: "function",
          function: {
            name: "shot_list",
            description: "Return scenes",
            parameters: {
              type: "object",
              properties: {
                scenes: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      title: { type: "string" },
                      prompt: { type: "string", description: "Detailed visual prompt for image generation. Include lighting, camera, character names, environment." },
                      narration: { type: "string", description: "1-2 sentence narration or dialogue" },
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

    if (r.status === 429) return new Response(JSON.stringify({ error: "Rate limit, please retry shortly." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    if (r.status === 402) return new Response(JSON.stringify({ error: "AI credits exhausted. Add credits in workspace settings." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    if (!r.ok) {
      const t = await r.text();
      console.error("AI error", r.status, t);
      return new Response(JSON.stringify({ error: "AI gateway error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const data = await r.json();
    const args = data.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    const parsed = args ? JSON.parse(args) : { scenes: [] };
    return new Response(JSON.stringify(parsed), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
