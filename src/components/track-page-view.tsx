"use client";
import { useEffect } from "react";
import { trackEvent } from "@/lib/plausible";

export default function TrackPageView({ event }: { event: string }) {
  useEffect(() => {
    trackEvent(event);
  }, [event]);
  return null;
}
