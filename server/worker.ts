import { GET } from "./wallet";
import { adminPage } from "./admin";
import { collectUsage, readUsageStats } from "./usage";
import type { UsageEnv } from "./usage";

export { UsageAnalytics } from "./usage";

export interface Env extends UsageEnv {
  ASSETS: { fetch(request: Request): Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/api/usage") return collectUsage(request, env);
    if (url.pathname === "/api/admin/usage") return readUsageStats(request, env);
    if (url.pathname === "/admin" || url.pathname === "/admin/") {
      if (request.method !== "GET") return new Response("Method not allowed", { status: 405, headers: { Allow: "GET" } });
      return adminPage();
    }
    if (url.pathname.startsWith("/admin/")) return new Response("Not found", { status: 404 });
    if (url.pathname === "/api/wallet") {
      if (request.method !== "GET") {
        return Response.json({ error: "Method not allowed." }, {
          status: 405, headers: { Allow: "GET", "Cache-Control": "no-store" },
        });
      }
      return GET(request);
    }
    if (url.pathname === "/api/health") {
      return Response.json({ service: "flowlens", status: "ok", version: "1.1.0", usageTracking: Boolean(env.USAGE_ANALYTICS) }, {
        headers: { "Cache-Control": "no-store" },
      });
    }
    if (url.pathname.startsWith("/api/")) {
      return Response.json({ error: "Not found." }, { status: 404 });
    }
    return env.ASSETS.fetch(request);
  },
};
