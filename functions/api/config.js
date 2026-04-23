export async function onRequest(context) {
  const url = context.env.SUPABASE_URL || "https://gxwukctgfrquureyerli.supabase.co";
  const anonKey = context.env.SUPABASE_ANON_KEY || "sb_publishable_SBwSuHSETeSd7mtl9-A7kQ_gS5Y2Y14";

  return new Response(JSON.stringify({ url, anonKey }), {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}
