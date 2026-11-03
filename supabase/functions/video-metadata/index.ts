const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const cache = new Map<string, { at: number; value: Record<string, unknown> }>();
const TTL = 6 * 60 * 60 * 1000;

function youtubeUrl(input: unknown): string | null {
  if (typeof input !== "string" || input.length > 2048) return null;
  try {
    const url = new URL(input);
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    if (host === "youtu.be") {
      const id = url.pathname.split("/").filter(Boolean)[0];
      return id ? `https://www.youtube.com/watch?v=${encodeURIComponent(id)}` : null;
    }
    if (host === "youtube.com" || host === "m.youtube.com" || host === "youtube-nocookie.com") {
      const parts = url.pathname.split("/").filter(Boolean);
      const id = url.searchParams.get("v") || (["shorts", "embed", "live"].includes(parts[0]) ? parts[1] : "");
      return id ? `https://www.youtube.com/watch?v=${encodeURIComponent(id)}` : null;
    }
  } catch { /* invalid URL */ }
  return null;
}

async function getMetadata(input: string) {
  const canonical = youtubeUrl(input);
  if (!canonical) return { input, ok: false };
  const cached = cache.get(canonical);
  if (cached && Date.now() - cached.at < TTL) return { input, ...cached.value };

  try {
    const endpoint = new URL("https://www.youtube.com/oembed");
    endpoint.searchParams.set("url", canonical);
    endpoint.searchParams.set("format", "json");
    const response = await fetch(endpoint, { headers: { "Accept": "application/json" } });
    if (!response.ok) return { input, ok: false };
    const data = await response.json();
    let avatar = "";
    const authorUrl = typeof data.author_url === "string" ? data.author_url : "";
    if (authorUrl.startsWith("https://www.youtube.com/") || authorUrl.startsWith("https://youtube.com/")) {
      try {
        const page = await fetch(authorUrl, { headers: { "Accept": "text/html" } });
        if (page.ok) {
          const html = (await page.text()).slice(0, 2_000_000);
          const match = html.match(/<meta[^>]+(?:property|name)=["'](?:og:image|twitter:image)["'][^>]+content=["']([^"']+)["']/i)
            || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["'](?:og:image|twitter:image)["']/i);
          const candidate = match?.[1]?.replace(/&amp;/g, "&") || "";
          if (candidate.startsWith("https://")) avatar = candidate;
          if (!avatar) {
            const avatarMatch = html.match(/"avatar"\s*:\s*\{\s*"thumbnails"\s*:\s*\[\s*\{\s*"url"\s*:\s*"([^"]+)"/);
            const candidateAvatar = avatarMatch?.[1]?.replace(/\\u0026/g, "&").replace(/\\\\/g, "") || "";
            if (candidateAvatar.startsWith("https://")) avatar = candidateAvatar;
          }
        }
      } catch { /* Keep title and channel name even if avatar lookup is unavailable. */ }
    }
    const value = {
      ok: true,
      title: typeof data.title === "string" ? data.title : "",
      channelName: typeof data.author_name === "string" ? data.author_name : "",
      channelAvatarUrl: avatar,
      thumbnailUrl: typeof data.thumbnail_url === "string" ? data.thumbnail_url : "",
    };
    cache.set(canonical, { at: Date.now(), value });
    return { input, ...value };
  } catch {
    return { input, ok: false };
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405, headers: corsHeaders });
  try {
    const body = await req.json();
    const urls = Array.isArray(body?.urls) ? body.urls.slice(0, 50) : [];
    const results: Record<string, unknown>[] = [];
    for (let i = 0; i < urls.length; i += 5) {
      const batch = await Promise.all(urls.slice(i, i + 5).map((url: string) => getMetadata(url)));
      results.push(...batch);
    }
    return Response.json({ results }, { headers: { ...corsHeaders, "Cache-Control": "public, max-age=300" } });
  } catch {
    return Response.json({ error: "Invalid request" }, { status: 400, headers: corsHeaders });
  }
});
