import { createBrowserClient } from "@supabase/ssr";

/** Browser-side Supabase client (auth only). Uses the public anon key. */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
