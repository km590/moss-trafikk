import { NextResponse } from "next/server";
import { getTrafficData } from "@/lib/data-fetcher";

export const revalidate = 300;

export async function GET() {
  const { corridor } = await getTrafficData();

  return NextResponse.json({
    stations: corridor.stations,
    worstPoint: corridor.worstPoint,
    updatedAt: corridor.updatedAt,
  });
}
