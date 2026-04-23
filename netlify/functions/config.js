exports.handler = async () => {
  const url = process.env.SUPABASE_URL || "https://gxwukctgfrquureyerli.supabase.co";
  const anonKey = process.env.SUPABASE_ANON_KEY || "sb_publishable_SBwSuHSETeSd7mtl9-A7kQ_gS5Y2Y14";

  return {
    statusCode: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
    body: JSON.stringify({ url, anonKey }),
  };
};
