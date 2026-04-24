import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({
    ok: true,
    time: new Date().toISOString(),
    chargebeeConfigured: !!process.env.CHARGEBEE_API_KEY,
    authConfigured: !!process.env.DASHBOARD_USER && !!process.env.DASHBOARD_PASSWORD,
    cronConfigured: !!process.env.CRON_SECRET,
    kvConfigured: !!process.env.KV_REST_API_URL && !!process.env.KV_REST_API_TOKEN,
  });
}
