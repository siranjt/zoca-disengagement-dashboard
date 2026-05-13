import { NextRequest, NextResponse } from "next/server";
import { callHaiku, llmConfigured } from "@/lib/llm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/llm-test
 *   → end-to-end verify that ANTHROPIC_API_KEY is set and Haiku responds.
 *     Returns { ok, configured, latencyMs, sample } or { ok: false, error }.
 *     Gated by Basic Auth middleware (same as the rest of /api/*).
 */
export async function GET(_req: NextRequest) {
  if (!llmConfigured()) {
    return NextResponse.json(
      {
        ok: false,
        configured: false,
        error: "ANTHROPIC_API_KEY not set",
      },
      { status: 503 },
    );
  }
  const t0 = Date.now();
  try {
    const out = await callHaiku(
      {
        system: "You respond with exactly one word: 'pong'.",
        prompt: "ping",
        maxTokens: 10,
        temperature: 0,
        timeoutMs: 8_000,
      },
      "",
    );
    const latencyMs = Date.now() - t0;
    return NextResponse.json({
      ok: !!out,
      configured: true,
      latencyMs,
      sample: out.slice(0, 60),
    });
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        configured: true,
        latencyMs: Date.now() - t0,
        error: e instanceof Error ? e.message : String(e),
      },
      { status: 500 },
    );
  }
}
