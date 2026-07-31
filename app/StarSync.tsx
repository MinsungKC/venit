"use client";

import { useEffect } from "react";
import { initTrackerSync } from "@/lib/stars-sync";

/**
 * Mounts once (in the root layout) and, for a signed-in student, syncs the local-first shortlist/
 * tracker with their account (BUILD_PROMPT §7 ★). Renders nothing. Signed-out sessions no-op.
 */
export default function StarSync() {
  useEffect(() => {
    void initTrackerSync();
  }, []);
  return null;
}
