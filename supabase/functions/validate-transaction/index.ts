import { createClient } from "@supabase/supabase-js";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-api-key",
};

interface ActivationDetail {
  first_name?: string;
  last_name?: string;
  email?: string;
  activated_at?: string;
}

interface RequestBody {
  apiKey?: string;
  uuid?: string;
  action?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
}

Deno.serve(async (req) => {
  // CORS Preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // 1. Validar la API Key
    const apiKeyHeader = req.headers.get("x-api-key");
    const bodyText = await req.text();
    let body: RequestBody = {};
    try {
      body = bodyText ? JSON.parse(bodyText) : {};
    } catch {
      // ignore
    }

    const requestApiKey = apiKeyHeader || body.apiKey;
    const configuredApiKey = Deno.env.get("API_KEY_N8N") || "ventus-secret-n8n-key-98765";

    if (!requestApiKey || requestApiKey !== configuredApiKey) {
      return new Response(
        JSON.stringify({ error: "No autorizado: API Key inválida o faltante." }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { uuid, action, firstName, lastName, email } = body;

    if (!uuid) {
      return new Response(
        JSON.stringify({ error: "Falta el parámetro UUID de la orden." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Consultar la orden correspondiente
    const { data: order, error: orderError } = await supabaseAdmin
      .from("orders")
      .select("id, status, quantity, activation_details, is_redeemed")
      .eq("id", uuid)
      .maybeSingle();

    if (orderError || !order) {
      return new Response(
        JSON.stringify({ error: "Orden no encontrada en el sistema." }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const currentActivations = Array.isArray(order.activation_details)
      ? order.activation_details
      : [];
    const quantity = order.quantity || 1;

    // ACCIÓN: VALIDATE
    if (action === "validate") {
      // Una orden es válida para canje si no ha sido completamente canjeada
      if (order.is_redeemed) {
        return new Response(
          JSON.stringify({ error: "La orden ya ha sido totalmente canjeada.", code: "ALREADY_REDEEMED" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (currentActivations.length >= quantity) {
        // Asegurar consistencia actualizando is_redeemed = true
        await supabaseAdmin.from("orders").update({ is_redeemed: true }).eq("id", order.id);
        return new Response(
          JSON.stringify({ error: "Límite máximo de activaciones alcanzado para esta orden.", code: "LIMIT_REACHED" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Marcar temporalmente como 'procesando' en el estado
      if (order.status !== "procesando") {
        await supabaseAdmin
          .from("orders")
          .update({ status: "procesando" })
          .eq("id", order.id);
      }

      return new Response(
        JSON.stringify({
          success: true,
          valid: true,
          message: "La transacción es válida y ha sido bloqueada como 'procesando'.",
          quantity,
          remainingActivations: quantity - currentActivations.length
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ACCIÓN: COMPLETE
    if (action === "complete") {
      if (!firstName || !lastName || !email) {
        return new Response(
          JSON.stringify({ error: "Faltan datos del usuario a registrar (firstName, lastName, email)." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Validar si ya se completaron los cupos
      if (currentActivations.length >= quantity) {
        await supabaseAdmin.from("orders").update({ is_redeemed: true, status: "procesado" }).eq("id", order.id);
        return new Response(
          JSON.stringify({ error: "Ya se han activado todos los cupos disponibles de esta orden.", code: "LIMIT_REACHED" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Verificar si el correo ya está registrado en este lote de activaciones
      const emailUsed = currentActivations.some((act: ActivationDetail) =>
        act.email && act.email.trim().toLowerCase() === email.trim().toLowerCase()
      );
      if (emailUsed) {
        return new Response(
          JSON.stringify({ error: `El correo '${email}' ya fue activado previamente en esta orden.` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Registrar los detalles de la activación
      const newActivation = {
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        email: email.trim().toLowerCase(),
        activated_at: new Date().toISOString()
      };

      const updatedActivations = [...currentActivations, newActivation];
      const isFullyRedeemed = updatedActivations.length >= quantity;

      const { error: updateError } = await supabaseAdmin
        .from("orders")
        .update({
          activated_at: new Date().toISOString(),
          activation_details: updatedActivations,
          is_redeemed: isFullyRedeemed,
          status: isFullyRedeemed ? "procesado" : "procesando"
        })
        .eq("id", order.id);

      if (updateError) {
        console.error("Error al actualizar orden en complete:", updateError);
        return new Response(
          JSON.stringify({ error: "Error de base de datos al registrar la activación." }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({
          success: true,
          message: "Activación registrada correctamente.",
          activatedCount: updatedActivations.length,
          totalQuantity: quantity,
          is_redeemed: isFullyRedeemed
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: "Acción inválida. Use 'validate' o 'complete'." }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err) {
    console.error("Error en validate-transaction:", err);
    return new Response(
      JSON.stringify({ error: "Error interno del servidor." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
