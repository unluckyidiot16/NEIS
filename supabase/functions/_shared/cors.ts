// supabase/functions/_shared/cors.ts

// 배포 시 Supabase Edge Function 환경변수로 ALLOWED_ORIGIN 설정
// 예: https://neis-guide.pages.dev
const ALLOWED_ORIGIN = Deno.env.get("ALLOWED_ORIGIN") || "*";

export const corsHeaders: Record<string, string> = {
    "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
    "Access-Control-Allow-Headers":
        "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Expose-Headers": "retry-after",
};