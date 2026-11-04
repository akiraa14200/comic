const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Content-Type": "application/json; charset=utf-8",
};

const PROJECT_KEYS = new Set([
  "sb_publishable_XrJYTYAGNjlfPsWlP1SfUg_-yr9HBrq",
  Deno.env.get("SUPABASE_ANON_KEY") || "",
  Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || "",
].filter(Boolean));

const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const memoryRate = new Map<string, { count: number; resetAt: number }>();

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

function allowed(req: Request) {
  const key = req.headers.get("apikey") || (req.method === "GET" ? new URL(req.url).searchParams.get("apikey") || "" : "");
  return PROJECT_KEYS.has(key);
}

function checkRate(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const now = Date.now();
  const current = memoryRate.get(ip);
  if (!current || current.resetAt <= now) {
    memoryRate.set(ip, { count: 1, resetAt: now + 60_000 });
    return true;
  }
  current.count += 1;
  return current.count <= 90;
}

function cookiesFromHeaders(headers: Headers) {
  const h = headers as Headers & { getSetCookie?: () => string[] };
  const values = typeof h.getSetCookie === "function"
    ? h.getSetCookie()
    : [headers.get("set-cookie")].filter(Boolean) as string[];
  return values.map(value => String(value).split(";")[0]).join("; ");
}

async function readJson(response: Response) {
  const raw = await response.text();
  try { return raw ? JSON.parse(raw) : null; } catch { return null; }
}

async function fetchOfficial(body: string) {
  let lastMessage = "AniList GraphQL endpoint did not respond.";
  for (let attempt = 0; attempt < 3; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12_000);
    try {
      const response = await fetch("https://graphql.anilist.co", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
          "User-Agent": USER_AGENT,
        },
        body,
        signal: controller.signal,
      });
      const payload = await readJson(response);
      clearTimeout(timer);
      if (response.ok && payload?.data) return { payload, route: "graphql.anilist.co" };
      lastMessage = payload?.errors?.map((e: { message?: string }) => e.message).filter(Boolean).join(" · ")
        || `AniList GraphQL returned HTTP ${response.status}`;
      if ((response.status === 429 || response.status >= 500) && attempt < 2) {
        const wait = Number(response.headers.get("Retry-After") || 0);
        await new Promise(resolve => setTimeout(resolve, wait ? Math.min(wait * 1000, 6000) : 700 * (attempt + 1)));
        continue;
      }
      break;
    } catch (error) {
      clearTimeout(timer);
      lastMessage = error instanceof Error ? error.message : String(error);
      if (attempt < 2) {
        await new Promise(resolve => setTimeout(resolve, 500 * (attempt + 1)));
        continue;
      }
    }
  }
  return { payload: null, route: "graphql.anilist.co", error: lastMessage };
}

async function fetchWebsiteFallback(body: string) {
  const home = await fetch("https://anilist.co/", {
    headers: {
      "User-Agent": USER_AGENT,
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    },
    signal: AbortSignal.timeout(12_000),
  });
  if (!home.ok) throw new Error(`AniList website returned HTTP ${home.status}`);
  const html = await home.text();
  const token = html.match(/window\.al_token\s*=\s*"([^"]+)"/)?.[1]
    || html.match(/window\.al_token\s*=\s*'([^']+)'/)?.[1];
  const cookie = cookiesFromHeaders(home.headers);
  if (!token || !cookie) throw new Error("AniList website did not provide its CSRF token or session cookie.");

  const response = await fetch("https://anilist.co/graphql", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json",
      "User-Agent": USER_AGENT,
      "Referer": "https://anilist.co/home",
      "Origin": "https://anilist.co",
      "x-csrf-token": token,
      "Cookie": cookie,
      "schema": "default",
    },
    body,
    signal: AbortSignal.timeout(12_000),
  });
  const payload = await readJson(response);
  if (!response.ok || !payload?.data) {
    const message = payload?.errors?.map((e: { message?: string }) => e.message).filter(Boolean).join(" · ")
      || `AniList website GraphQL returned HTTP ${response.status}`;
    throw new Error(message);
  }
  return { payload, route: "anilist.co/graphql" };
}

async function runQuery(query: string, variables: Record<string, unknown>) {
  const body = JSON.stringify({ query, variables });
  const official = await fetchOfficial(body);
  if (official.payload) return { ...official.payload, _meta: { route: official.route, fallback: false } };
  try {
    const fallback = await fetchWebsiteFallback(body);
    return { ...fallback.payload, _meta: { route: fallback.route, fallback: true, officialError: official.error } };
  } catch (error) {
    return {
      data: null,
      errors: [{ message: `AniList primary connection failed: ${official.error}. Website fallback failed: ${error instanceof Error ? error.message : String(error)}` }],
      _meta: { route: "unavailable", fallback: true },
    };
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST" && req.method !== "GET") return json({ errors: [{ message: "Method not allowed." }] }, 405);

  // The function is public catalogue metadata, not a privileged database API.
  // Verify the project's public API key ourselves because publishable keys are not JWTs.
  if (!allowed(req)) return json({ errors: [{ message: "Invalid project API key." }] }, 401);
  if (!checkRate(req)) return json({ errors: [{ message: "Too many AniList requests. Please wait one minute." }] }, 429);

  if (req.method === "GET") {
    const result = await runQuery("query RykoAniListHealth { Media(id: 1, type: ANIME) { id title { romaji english } coverImage { large } } }", {});
    return json({ ok: !!result.data?.Media, ...result });
  }

  try {
    const raw = await req.text();
    if (raw.length > 50_000) return json({ errors: [{ message: "Query payload is too large." }] }, 413);
    const body = JSON.parse(raw);
    const query = typeof body?.query === "string" ? body.query : "";
    const variables = body?.variables && typeof body.variables === "object" && !Array.isArray(body.variables) ? body.variables : {};
    if (!query || query.length > 30_000) return json({ errors: [{ message: "A valid GraphQL query is required." }] }, 400);
    return json(await runQuery(query, variables));
  } catch (error) {
    return json({ data: null, errors: [{ message: error instanceof Error ? error.message : "Invalid AniList request." }] });
  }
});
