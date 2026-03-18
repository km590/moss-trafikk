import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    hasSupabaseUrl: !!process.env.SUPABASE_URL,
    hasServiceKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    hasAdminKey: !!process.env.ADMIN_API_KEY,
    adminKeyLength: process.env.ADMIN_API_KEY?.length ?? 0,
    adminKeyPrefix: process.env.ADMIN_API_KEY?.slice(0, 4) ?? "none",
  });
}
