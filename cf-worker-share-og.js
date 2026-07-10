/* Cloudflare Worker — beatlast.app/r/* (route: "beatlast.app/r/*", zone proxied ORANGE for apex)
 *
 * WHY (2026-07-10): GitHub Pages is static, so the pretty path-form share link (beatlast.app/r/<code>)
 * has no file and answers HTTP 404 — link-preview crawlers (iMessage/WhatsApp/Slack) don't run the
 * 404.html JS redirect and showed a BLANK bubble. This worker sits in front of /r/* only and:
 *   1. serves the path form with the real receiver page + HTTP 200 (typable AND unfurlable —
 *      so the app mints beatlast.app/r/<code> again, no ?r= needed);
 *   2. injects PER-CODE OG tags (routine name + session/exercise counts) fetched from the public
 *      Firestore shares doc — a pasted link unfurls as "『Push Pull Legs』 — shared with you on
 *      BeatLast · 3 sessions · 15 exercises";
 *   3. injects window.__code for path-form loads so the receiver JS (which reads ?r=) still works.
 * Everything else on the zone passes through untouched (route is /r/* only). Rollback = flip the
 * apex DNS records back to DNS-only (grey cloud) — the worker simply stops being in the path and
 * 404.html keeps redirecting path links for human browsers.
 *
 * Deployed via the dashboard API (script name: beatlast-share-og). Keep this file in sync with the
 * deployed copy — it is the source of truth for future edits.
 */
const PROJECT = "imadtnforge";
const API_KEY = "AIzaSyDxNU8QFg6HoKMmyCM7M7OH-yCluUZhiks";   // public web API key (same one the receiver uses)

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const m = url.pathname.match(/^\/r\/([A-Za-z0-9]{3,16})\/?$/);
    const code = ((url.searchParams.get("r") || (m ? m[1] : "")) + "").toLowerCase();

    // path form has no static file at the origin — fetch the receiver index instead (same zone
    // subrequests go straight to the origin, they don't re-enter this worker)
    const originUrl = new URL(url);
    if (m) { originUrl.pathname = "/r/"; originUrl.search = ""; }
    const originResp = await fetch(originUrl.toString(), request);
    const ct = originResp.headers.get("content-type") || "";
    if (!ct.includes("text/html")) return originResp;

    // per-code preview facts from the public share doc (best-effort; generic tags stay on any failure)
    let og = null;
    if (code) {
      try {
        const fs = await fetch(
          `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/shares/${encodeURIComponent(code)}?key=${API_KEY}`,
          { cf: { cacheTtl: 300, cacheEverything: true } });
        if (fs.ok) {
          const doc = await fs.json();
          const j = doc && doc.fields && doc.fields.j && doc.fields.j.stringValue;
          if (j) {
            const rt = JSON.parse(j);
            const days = Array.isArray(rt.d) ? rt.d : [];
            const ex = days.reduce((a, d) => a + ((d && d.e && d.e.length) || 0), 0);
            og = {
              title: `${rt.n || "A workout routine"} — shared with you on BeatLast`,
              desc: `${days.length} session${days.length === 1 ? "" : "s"} · ${ex} exercise${ex === 1 ? "" : "s"} — preview it and add it to BeatLast, free.`,
            };
          }
        }
      } catch (e) { /* generic tags are fine */ }
    }

    let body = await originResp.text();
    if (og) {
      body = body
        .replace(/<title>[^<]*<\/title>/, `<title>${esc(og.title)}</title>`)
        .replace(/(<meta property="og:title" content=")[^"]*(")/, `$1${esc(og.title)}$2`)
        .replace(/(<meta property="og:description" content=")[^"]*(")/, `$1${esc(og.desc)}$2`)
        .replace(/(<meta name="twitter:title" content=")[^"]*(")/, `$1${esc(og.title)}$2`)
        .replace(/(<meta name="twitter:description" content=")[^"]*(")/, `$1${esc(og.desc)}$2`);
    }
    // path-form loads carry no ?r= — hand the code to the receiver JS (it checks window.__code)
    if (m && code) body = body.replace(/<head>/i, `<head><script>window.__code=${JSON.stringify(code)}</script>`);

    const h = new Headers(originResp.headers);
    h.delete("content-length");
    return new Response(body, { status: 200, headers: h });
  },
};
