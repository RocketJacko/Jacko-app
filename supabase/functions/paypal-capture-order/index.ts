import { createClient } from "@supabase/supabase-js";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  // CORS Preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // 1. Verificar sesión del usuario
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

    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: "Sesión inválida o expirada." }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Leer entrada del request
    const { paypalOrderId } = await req.json();
    if (!paypalOrderId) {
      return new Response(
        JSON.stringify({ error: "ID de orden de PayPal faltante." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Cliente admin para actualizar de forma segura e invalidar políticas de RLS restrictivas para escritura
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // 3. Consultar la orden local correspondiente
    const { data: localOrder, error: localOrderError } = await supabaseAdmin
      .from("orders")
      .select(`
        id, 
        status, 
        product_id, 
        delivered_credentials,
        products (
          id,
          title,
          credentials, 
          file_path
        )
      `)
      .eq("reference_note", paypalOrderId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (localOrderError || !localOrder) {
      console.error("Error al consultar orden local:", localOrderError);
      return new Response(
        JSON.stringify({ error: "No se encontró la orden en el sistema o no te pertenece." }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Si ya fue aprobada, retornamos de inmediato con éxito para evitar capturas repetidas
    if (localOrder.status === "approved") {
      return new Response(
        JSON.stringify({
          success: true,
          status: "approved",
          credentials: localOrder.delivered_credentials,
          message: "Esta orden ya había sido capturada y aprobada con éxito.",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (localOrder.status === "cancelled" || localOrder.status === "rejected") {
      return new Response(
        JSON.stringify({ error: `La orden está en estado '${localOrder.status}' y no se puede capturar.` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 4. Configurar credenciales de PayPal
    const paypalClientId = Deno.env.get("PAYPAL_CLIENT_ID");
    const paypalClientSecret = Deno.env.get("PAYPAL_CLIENT_SECRET");
    const paypalEnv = Deno.env.get("PAYPAL_ENVIRONMENT") || "sandbox";

    if (!paypalClientId || !paypalClientSecret) {
      console.error("Faltan variables de entorno PAYPAL_CLIENT_ID o PAYPAL_CLIENT_SECRET");
      return new Response(
        JSON.stringify({ error: "Configuración del servidor de pagos incompleta." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const paypalBaseUrl = paypalEnv === "live" 
      ? "https://api-m.paypal.com" 
      : "https://api-m.sandbox.paypal.com";

    // 5. Obtener Token de Acceso de PayPal
    const authString = btoa(`${paypalClientId.trim()}:${paypalClientSecret.trim()}`);
    const tokenResponse = await fetch(`${paypalBaseUrl}/v1/oauth2/token`, {
      method: "POST",
      headers: {
        "Authorization": `Basic ${authString}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
    });

    if (!tokenResponse.ok) {
      const tokenError = await tokenResponse.text();
      console.error("Error obteniendo token de PayPal:", tokenError);
      return new Response(
        JSON.stringify({ error: "Error de autenticación con el portal de pagos de PayPal." }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { access_token } = await tokenResponse.json();

    // 6. Capturar Pago en PayPal
    let paymentSuccess = false;
    const captureResponse = await fetch(`${paypalBaseUrl}/v2/checkout/orders/${paypalOrderId}/capture`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${access_token}`,
        "Content-Type": "application/json",
      },
    });

    let captureData = null;
    if (captureResponse.ok) {
      captureData = await captureResponse.json();
      if (captureData.status === "COMPLETED") {
        paymentSuccess = true;
      }
    } else {
      // Manejar el caso si la orden ya fue capturada (por ejemplo, si se llamó dos veces consecutivas)
      const errorText = await captureResponse.text();
      let errorJson = null;
      try {
        errorJson = JSON.parse(errorText);
      } catch (err) {
        console.warn("Failed to parse PayPal error response:", err);
      }

      const errorCode = errorJson?.details?.[0]?.issue || errorJson?.name || "";
      if (errorCode === "ORDER_ALREADY_CAPTURED") {
        console.log(`La orden de PayPal ${paypalOrderId} ya había sido capturada. Verificando estado actual...`);
        // Consultar el estado real de la orden en PayPal
        const getOrderResponse = await fetch(`${paypalBaseUrl}/v2/checkout/orders/${paypalOrderId}`, {
          method: "GET",
          headers: {
            "Authorization": `Bearer ${access_token}`,
          },
        });
        if (getOrderResponse.ok) {
          const getOrderData = await getOrderResponse.json();
          if (getOrderData.status === "COMPLETED") {
            paymentSuccess = true;
          }
        }
      } else {
        console.error("Error al capturar la orden en PayPal:", errorText);
        return new Response(
          JSON.stringify({ error: `PayPal rechazó la captura: ${errorJson?.message || errorText}` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    if (!paymentSuccess) {
      return new Response(
        JSON.stringify({ error: "La orden no ha sido pagada o autorizada correctamente en PayPal." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 7. Entregar credenciales del Pool o estáticas
    let deliveredCredentials = null;

    // A) Llamar a la RPC atómica para reclamar una credencial del pool
    const { data: claimedCreds, error: rpcError } = await supabaseAdmin
      .rpc("claim_product_credential_v2", {
        p_product_id: localOrder.product_id,
        p_order_id: localOrder.id
      });

    if (rpcError) {
      console.error("Error al llamar a claim_product_credential_v2:", rpcError);
    }

    // Resolver el producto (puede venir como objeto o como arreglo de 1 elemento)
    const product = Array.isArray(localOrder.products)
      ? localOrder.products[0]
      : localOrder.products;

    if (claimedCreds && claimedCreds.length > 0) {
      const cred = claimedCreds[0];
      deliveredCredentials = `Usuario: ${cred.username}\nContraseña: ${cred.password}${
        cred.extra_data ? `\n\nDetalles: ${JSON.stringify(cred.extra_data)}` : ""
      }`;
    } else {
      // B) Fallback a credenciales estáticas del producto si existen
      const staticCredentials = product?.credentials;
      if (staticCredentials) {
        deliveredCredentials = staticCredentials;
      }
    }

    const deliveredFilePath = product?.file_path || null;

    // 8. Aprobar Orden localmente
    const { data: updatedOrder, error: updateError } = await supabaseAdmin
      .from("orders")
      .update({
        status: "approved",
        approved_at: new Date().toISOString(),
        delivered_credentials: deliveredCredentials,
        delivered_file_path: deliveredFilePath,
      })
      .eq("id", localOrder.id)
      .select("redemption_code")
      .single();

    if (updateError) {
      console.error("Error al actualizar la orden a aprobada:", updateError);
      return new Response(
        JSON.stringify({ error: "El pago se cobró pero ocurrió un error al actualizar la base de datos." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        status: "approved",
        credentials: deliveredCredentials,
        redemptionCode: updatedOrder?.redemption_code,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (e) {
    console.error("Error inesperado en paypal-capture-order:", e);
    return new Response(
      JSON.stringify({ error: "Error interno del servidor" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
