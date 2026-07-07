/// <reference types="@types/deno" />
import { createClient } from "@supabase/supabase-js";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ActivationDetail {
  first_name: string;
  last_name: string;
  email: string;
  activated_at: string;
}

/**
 * Parses n8n's HTTP response.
 * 200 + { success: true } or message "Registro almacenado correctamente" → success
 * 422 or any other error body → failure with message
 */
async function checkN8nResponse(
  response: Response
): Promise<{ success: boolean; text: string; message?: string; correo?: string }> {
  try {
    const text = await response.text();

    try {
      let parsed = JSON.parse(text);
      if (Array.isArray(parsed) && parsed.length > 0) {
        parsed = parsed[0];
      }

      const isSuccess =
        parsed &&
        (parsed.success === true || parsed.message === "Registro almacenado correctamente");

      if (isSuccess) {
        const correo: string | undefined =
          parsed.correo || parsed.email || parsed.cuenta || undefined;
        return { success: true, text, correo };
      }

      if (parsed) {
        const errorMsg = parsed.message || parsed.error || parsed.msg;
        if (errorMsg) return { success: false, text, message: errorMsg };
        if (parsed.success === false) return { success: false, text };
      }
    } catch {
      if (text.includes("Registro almacenado correctamente")) {
        return { success: true, text };
      }
    }

    return { success: false, text };
  } catch (err) {
    return { success: false, text: String(err) };
  }
}

Deno.serve(async (req) => {
  // CORS Preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // ── 1. Auth ──────────────────────────────────────────────────────────────
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "No autorizado: Falta token de autenticación." }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabaseClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: userError,
    } = await supabaseClient.auth.getUser();

    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: "Sesión inválida o expirada." }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── 2. Parse request body ────────────────────────────────────────────────
    const {
      orderId,
      firstName,
      lastName,
      email,
      isTest,
      webhookUrl,
      getSettings,
    } = await req.json();

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // ── 3. Admin test / settings route ───────────────────────────────────────
    if (isTest) {
      const { data: isAdmin } = await supabaseAdmin.rpc("has_role", {
        _user_id: user.id,
        _role: "admin",
      });
      const { data: isSuperAdmin } = await supabaseAdmin.rpc("has_role", {
        _user_id: user.id,
        _role: "super_admin",
      });

      if (!isAdmin && !isSuperAdmin) {
        return new Response(
          JSON.stringify({
            error: "No autorizado: Se requieren privilegios de administrador para realizar simulaciones.",
          }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      let defaultUrl =
        Deno.env.get("N8N_WEBHOOK_URL") ||
        "https://ventusn8n.smartcontacts.cloud/webhook-test/8f448518-ab20-4aa7-a024-446ebb6e9c32";

      const { data: settingsData } = await supabaseAdmin
        .from("system_settings")
        .select("value")
        .eq("key", "n8n_webhook_url")
        .maybeSingle();

      if (settingsData?.value) defaultUrl = settingsData.value;

      if (getSettings) {
        return new Response(
          JSON.stringify({ success: true, webhookUrl: defaultUrl }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const apiKeyN8n = Deno.env.get("API_KEY_N8N") || "ventus-secret-n8n-key-98765";
      const n8nWebhookUrl = webhookUrl || defaultUrl;

      const n8nPayload = {
        isTest: true,
        orderId: orderId || "test-order-uuid-12345",
        userId: user.id,
        userEmail: user.email,
        productTitle: "Producto de Prueba (Simulación)",
        firstName: (firstName || "TestNombre").trim(),
        lastName: (lastName || "TestApellido").trim(),
        email: (email || "test@example.com").trim().toLowerCase(),
        activatedAt: new Date().toISOString(),
        activationIndex: 1,
        totalQuantity: 1,
        apiKey: apiKeyN8n,
        redemptionCode: "JK-TEST-CODE",
      };

      console.log("[SIMULACIÓN] Enviando webhook a n8n:", JSON.stringify(n8nPayload));

      const n8nResponse = await fetch(n8nWebhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": apiKeyN8n },
        body: JSON.stringify(n8nPayload),
      });

      const result = await checkN8nResponse(n8nResponse);

      if (!result.success) {
        const errorMsg =
          result.message ||
          `El servidor de activación externo retornó código ${n8nResponse.status}`;
        return new Response(
          JSON.stringify({ success: false, error: errorMsg, details: result.text, webhookUrl: n8nWebhookUrl }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({
          success: true,
          message: "Simulación de webhook enviada a n8n con éxito.",
          details: result.text,
          webhookUrl: n8nWebhookUrl,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── 4. Validate required fields ──────────────────────────────────────────
    if (!orderId || !firstName || !lastName || !email) {
      return new Response(
        JSON.stringify({ error: "Campos requeridos faltantes (orderId, firstName, lastName, email)." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── 5. Fetch the order ───────────────────────────────────────────────────
    const { data: localOrder, error: localOrderError } = await supabaseAdmin
      .from("orders")
      .select(`
        id,
        status,
        user_id,
        quantity,
        activation_details,
        is_redeemed,
        payment_type,
        redemption_code,
        products ( id, title )
      `)
      .eq("id", orderId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (localOrderError || !localOrder) {
      console.error("Error al consultar orden local:", localOrderError);
      return new Response(
        JSON.stringify({ error: "No se encontró la orden en el sistema o no te pertenece." }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── 6. Guard: orden aprobada y NO canjeada ───────────────────────────────
    if (localOrder.status !== "approved" && localOrder.status !== "procesando") {
      return new Response(
        JSON.stringify({ error: "La orden debe estar aprobada para poder activar servicios." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (localOrder.is_redeemed) {
      return new Response(
        JSON.stringify({ error: "Esta compra ya fue utilizada completamente. No quedan activaciones disponibles." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── 7. Guard: cupos disponibles ──────────────────────────────────────────
    const currentActivations: ActivationDetail[] = Array.isArray(localOrder.activation_details)
      ? localOrder.activation_details
      : [];
    const quantity: number = localOrder.quantity || 1;

    if (currentActivations.length >= quantity) {
      return new Response(
        JSON.stringify({
          error: `Ya se agotaron las ${quantity} activaciones disponibles para esta compra.`,
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── 8. Guard: sin correo duplicado ───────────────────────────────────────
    const emailLower = email.trim().toLowerCase();
    if (currentActivations.some((act) => act.email && act.email.trim().toLowerCase() === emailLower)) {
      return new Response(
        JSON.stringify({ error: `El correo '${email}' ya fue registrado en esta compra.` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── 9. Bloquear orden (race condition guard) ─────────────────────────────
    if (localOrder.status !== "procesando") {
      const { error: lockError } = await supabaseAdmin
        .from("orders")
        .update({ status: "procesando" })
        .eq("id", localOrder.id);
      if (lockError) console.error("Error al bloquear la orden:", lockError);
    }

    // ── 10. Resolver URL del webhook ─────────────────────────────────────────
    const apiKeyN8n = Deno.env.get("API_KEY_N8N") || "ventus-secret-n8n-key-98765";
    let n8nWebhookUrl =
      Deno.env.get("N8N_WEBHOOK_URL") ||
      "https://ventusn8n.smartcontacts.cloud/webhook-test/8f448518-ab20-4aa7-a024-446ebb6e9c32";

    const { data: settingsData, error: settingsError } = await supabaseAdmin
      .from("system_settings")
      .select("value")
      .eq("key", "n8n_webhook_url")
      .maybeSingle();

    if (!settingsError && settingsData?.value) {
      n8nWebhookUrl = settingsData.value;
    }

    // ── 11. Disparar webhook y esperar respuesta DIRECTA de n8n ──────────────
    // No hay polling, no hay timeout artificial.
    // n8n SIEMPRE debe responder: 200 = éxito, 422 = error.
    // El runtime de Deno Edge Functions aguanta hasta 150 segundos.
    const n8nPayload = {
      orderId: localOrder.id,
      userId: user.id,
      userEmail: user.email,
      productTitle: (Array.isArray(localOrder.products)
        ? localOrder.products[0]?.title
        : (localOrder.products as unknown as { title?: string })?.title) || "Producto",
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: emailLower,
      activatedAt: new Date().toISOString(),
      activationIndex: currentActivations.length + 1,
      totalQuantity: quantity,
      apiKey: apiKeyN8n,
      redemptionCode: localOrder.redemption_code,
    };

    console.log("[n8n] Enviando webhook, esperando respuesta directa:", JSON.stringify(n8nPayload));

    const n8nResponse = await fetch(n8nWebhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKeyN8n },
      body: JSON.stringify(n8nPayload),
    });

    console.log(`[n8n] Respondió con HTTP ${n8nResponse.status}`);

    // ── 12. Evaluar respuesta de n8n ─────────────────────────────────────────
    const result = await checkN8nResponse(n8nResponse);

    if (!result.success) {
      console.error("[n8n] Respuesta de error:", result.text);

      // Revertir bloqueo para que el usuario pueda reintentar
      await supabaseAdmin
        .from("orders")
        .update({ status: "approved" })
        .eq("id", localOrder.id);

      const displayError =
        result.message ||
        (n8nResponse.status === 422
          ? "La activación fue rechazada por el servidor externo (422)."
          : `El servidor de activación respondió con un error (HTTP ${n8nResponse.status}).`);

      return new Response(
        JSON.stringify({ error: displayError }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── 13. ÉXITO — el backend escribe autoritativamente en la BD ────────────
    // Usar el correo que n8n retornó en su respuesta (si lo incluye)
    const assignedEmail = result.correo
      ? result.correo.trim().toLowerCase()
      : emailLower;

    // Insertar atómicamente en la tabla relacional.
    // Esto disparará automáticamente:
    //   1. Validar límite (BEFORE INSERT trigger)
    //   2. Sincronizar campo JSONB, status y is_redeemed en la tabla orders (AFTER INSERT trigger)
    const { error: insertError } = await supabaseAdmin
      .from("order_activations")
      .insert({
        order_id: localOrder.id,
        email: assignedEmail,
        first_name: firstName.trim(),
        last_name: lastName.trim(),
      });

    if (insertError) {
      console.error("[DB] Error al insertar en order_activations:", insertError);

      // Revertir el estado de la orden a 'approved' para permitir reintentos
      await supabaseAdmin
        .from("orders")
        .update({ status: "approved" })
        .eq("id", localOrder.id);

      // Si es un error de duplicado (Postgres 23505)
      if (insertError.code === "23505") {
        return new Response(
          JSON.stringify({ error: `El correo '${assignedEmail}' ya fue registrado en esta compra.` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Si es un error personalizado del trigger BEFORE INSERT (límite alcanzado)
      if (insertError.message?.includes("Límite de activaciones alcanzado")) {
        return new Response(
          JSON.stringify({ error: "No quedan activaciones disponibles para esta compra." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ error: "Error al registrar la activación en la base de datos." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Consultar la orden de forma fresca para retornar el estado final correcto al frontend
    const { data: finalOrder } = await supabaseAdmin
      .from("orders")
      .select("status, is_redeemed, activation_details")
      .eq("id", localOrder.id)
      .maybeSingle();

    const finalActivations = Array.isArray(finalOrder?.activation_details)
      ? finalOrder.activation_details
      : [];

    const isFullyRedeemed = finalOrder?.is_redeemed || false;

    console.log(
      `[ACTIVACIÓN COMPLETA] Orden ${localOrder.id} | Slot ${finalActivations.length}/${quantity} | correo=${assignedEmail} | canjeado=${isFullyRedeemed}`
    );

    return new Response(
      JSON.stringify({
        success: true,
        activatedCount: finalActivations.length,
        totalQuantity: quantity,
        correo: assignedEmail,
        message: isFullyRedeemed
          ? "Activación completada. ¡Todas las cuentas han sido asignadas!"
          : `Activación completada con éxito. Quedan ${quantity - finalActivations.length} activación(es) disponible(s).`,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("Error inesperado en activate-order:", e);
    return new Response(
      JSON.stringify({ error: "Error interno del servidor" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
