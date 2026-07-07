/**
 * nequi-gmail-watch — Registra/Renueva el "watch" de Gmail
 *
 * Llama a gmail.users.watch() para que Google notifique via Pub/Sub
 * cuando llega un email nuevo. El watch dura máx. 7 días, por eso
 * el cron de pg_cron lo llama cada 6 días automáticamente.
 *
 * Invocar manualmente la primera vez para configurar:
 *   curl -X POST https://<project>.supabase.co/functions/v1/nequi-gmail-watch \
 *     -H "Authorization: Bearer <api_key_from_reconciliation_config>"
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/** Obtiene un access_token de Google usando el refresh_token (OAuth2) */
async function getGoogleAccessToken(): Promise<string> {
  const clientId = Deno.env.get("GMAIL_CLIENT_ID");
  const clientSecret = Deno.env.get("GMAIL_CLIENT_SECRET");
  const refreshToken = Deno.env.get("GMAIL_REFRESH_TOKEN");

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error("Faltan variables de entorno: GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN");
  }

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!tokenRes.ok) {
    const err = await tokenRes.text();
    throw new Error(`Error obteniendo access_token de Google: ${err}`);
  }

  const tokenData = await tokenRes.json();
  return tokenData.access_token;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Validación básica de autorización (usa la api_key de reconciliation_config)
    const authHeader = req.headers.get("Authorization") || "";
    const apiKey = Deno.env.get("NEQUI_WATCH_API_KEY") || "";
    if (apiKey && !authHeader.includes(apiKey)) {
      return new Response(JSON.stringify({ error: "No autorizado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const pubsubTopic = Deno.env.get("GMAIL_PUBSUB_TOPIC");
    const gmailUser = Deno.env.get("GMAIL_USER_EMAIL") || "me";

    if (!pubsubTopic) {
      throw new Error("Falta variable de entorno GMAIL_PUBSUB_TOPIC");
    }

    // Obtener access_token fresco
    const accessToken = await getGoogleAccessToken();

    // Registrar watch en Gmail API
    // El watch notifica cuando llega cualquier email nuevo al inbox
    const watchRes = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/${encodeURIComponent(gmailUser)}/watch`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          topicName: pubsubTopic,
          labelIds: ["INBOX"],           // Solo monitorea el inbox
          labelFilterBehavior: "INCLUDE",
        }),
      }
    );

    if (!watchRes.ok) {
      const watchErr = await watchRes.text();
      throw new Error(`Error registrando Gmail watch: ${watchErr}`);
    }

    const watchData = await watchRes.json();
    const expiresAt = new Date(parseInt(watchData.expiration)).toISOString();

    console.log(`Gmail watch registrado. Expira: ${expiresAt} | historyId: ${watchData.historyId}`);

    return new Response(
      JSON.stringify({
        success: true,
        historyId: watchData.historyId,
        expiresAt,
        message: `Watch activo hasta ${expiresAt}`,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Error interno";
    console.error("Error en nequi-gmail-watch:", e);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
