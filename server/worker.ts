import { GET } from "./wallet";

export interface Env {
  ASSETS: { fetch(request: Request): Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/api/wallet") {
      if (request.method !== "GET") {
        return Response.json({ error: "Method not allowed." }, {
          status: 405, headers: { Allow: "GET", "Cache-Control": "no-store" },
        });
      }
      return GET(request);
    }
    if (url.pathname === "/api/health") {
      return Response.json({ service: "flowlens", status: "ok", version: "1.0.0" }, {
        headers: { "Cache-Control": "no-store" },
      });
    }
    if (url.pathname.startsWith("/api/")) {
      return Response.json({ error: "Not found." }, { status: 404 });
    }
    return env.ASSETS.fetch(request);
  },
};
