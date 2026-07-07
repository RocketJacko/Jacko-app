import { createClient, SupabaseClient } from "@supabase/supabase-js";

interface PendingOrder {
  id: string;
  product_id: string;
  reference_note: string | null;
  created_at: string;
  products: {
    id: string;
    title: string;
    credentials: string | null;
    file_path: string | null;
  } | {
    id: string;
    title: string;
    credentials: string | null;
    file_path: string | null;
  }[] | null;
}

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
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // 1. Validar autenticación con api_key de la base de datos
    const authHeader = req.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "No autorizado: Falta token de autenticación." }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const incomingToken = authHeader.substring(7).trim();
    
    // Obtener la llave autorizada usando la RPC de seguridad
    const { data: apiKey, error: configError } = await supabaseAdmin
      .rpc("get_reconciliation_api_key");

    if (configError || !apiKey || apiKey !== incomingToken) {
      console.warn("Intento de reconciliación no autorizado o llave incorrecta.");
      return new Response(
        JSON.stringify({ error: "No autorizado: Token de reconciliación inválido." }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Buscar órdenes de PayPal en estado 'pending' que tengan más de 5 minutos
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    
    const { data: pendingOrders, error: ordersError } = await supabaseAdmin
      .from("orders")
      .select(`
        id,
        product_id,
        reference_note,
        created_at,
        payment_methods!inner (
          type
        ),
        products (
          id,
          title,
          credentials,
          file_path
        )
      `)
      .eq("status", "pending")
      .eq("payment_type", "money")
      .eq("payment_methods.type", "paypal")
      .lt("created_at", fiveMinutesAgo);

    if (ordersError) {
      console.error("Error al consultar órdenes pendientes:", ordersError);
      return new Response(
        JSON.stringify({ error: "Error al consultar la base de datos." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!pendingOrders || pendingOrders.length === 0) {
      return new Response(
        JSON.stringify({ message: "No hay órdenes pendientes para reconciliar.", reconciledCount: 0 }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Reconciliador: Evaluando ${pendingOrders.length} orden(es) pendiente(s) de PayPal.`);

    // 3. Configurar credenciales de PayPal
    const paypalClientId = Deno.env.get("PAYPAL_CLIENT_ID");
    const paypalClientSecret = Deno.env.get("PAYPAL_CLIENT_SECRET");
    const paypalEnv = Deno.env.get("PAYPAL_ENVIRONMENT") || "sandbox";

    if (!paypalClientId || !paypalClientSecret) {
      console.error("Faltan variables de entorno PAYPAL_CLIENT_ID o PAYPAL_CLIENT_SECRET");
      return new Response(
        JSON.stringify({ error: "Configuración de PayPal incompleta en el servidor." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const paypalBaseUrl = paypalEnv === "live" 
      ? "https://api-m.paypal.com" 
      : "https://api-m.sandbox.paypal.com";

    // 4. Obtener Token de Acceso de PayPal
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
      console.error("Error obteniendo token de PayPal para reconciliación:", tokenError);
      return new Response(
        JSON.stringify({ error: "Error de autenticación con PayPal." }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { access_token } = await tokenResponse.json();
    const results = [];

    // 5. Procesar cada orden
    for (const order of pendingOrders) {
      const paypalOrderId = order.reference_note;
      if (!paypalOrderId) {
        results.push({ orderId: order.id, status: "skipped", reason: "Falta ID de referencia de PayPal." });
        continue;
      }

      try {
        // Consultar el estado real de la orden en PayPal
        const getOrderResponse = await fetch(`${paypalBaseUrl}/v2/checkout/orders/${paypalOrderId}`, {
          method: "GET",
          headers: {
            "Authorization": `Bearer ${access_token}`,
          },
        });

        if (!getOrderResponse.ok) {
          const errorText = await getOrderResponse.text();
          console.error(`Error consultando orden ${paypalOrderId} en PayPal:`, errorText);
          results.push({ orderId: order.id, paypalOrderId, status: "failed", reason: "Error al consultar PayPal." });
          continue;
        }

        const paypalOrder = await getOrderResponse.json();
        const paypalStatus = paypalOrder.status;

        console.log(`Orden Local ${order.id} (PayPal: ${paypalOrderId}) - Estado PayPal: ${paypalStatus}`);

        if (paypalStatus === "APPROVED") {
          // El pago fue aprobado por el cliente pero no capturado. Ejecutamos captura.
          const captureResponse = await fetch(`${paypalBaseUrl}/v2/checkout/orders/${paypalOrderId}/capture`, {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${access_token}`,
              "Content-Type": "application/json",
            },
          });

          let captured = false;
          if (captureResponse.ok) {
            const captureData = await captureResponse.json();
            if (captureData.status === "COMPLETED") {
              captured = true;
            }
          } else {
            const errorText = await captureResponse.text();
            let errorJson = null;
            try {
              errorJson = JSON.parse(errorText);
            } catch {
              // Ignore JSON parse errors for non-JSON or invalid responses from PayPal
            }
            
            const errorCode = errorJson?.details?.[0]?.issue || errorJson?.name || "";
            if (errorCode === "ORDER_ALREADY_CAPTURED") {
              captured = true;
            } else {
              console.error(`Reconciliador: Error capturando orden ${paypalOrderId}:`, errorText);
              results.push({ orderId: order.id, paypalOrderId, status: "failed", reason: `Error de captura: ${errorCode}` });
              continue;
            }
          }

          if (captured) {
            // Entregar producto
            const deliveryReport = await deliverProduct(supabaseAdmin, order);
            results.push({ orderId: order.id, paypalOrderId, status: "reconciled_captured", ...deliveryReport });
          }

        } else if (paypalStatus === "COMPLETED") {
          // El pago ya está completado en PayPal pero localmente sigue pendiente
          const deliveryReport = await deliverProduct(supabaseAdmin, order);
          results.push({ orderId: order.id, paypalOrderId, status: "reconciled_completed", ...deliveryReport });

        } else if (["VOIDED", "EXPIRED"].includes(paypalStatus)) {
          // Cancelar orden localmente
          const { error: updateError } = await supabaseAdmin
            .from("orders")
            .update({
              status: "cancelled",
              admin_note: `Reconciliación: Cancelado automáticamente. Estado PayPal: ${paypalStatus}`
            })
            .eq("id", order.id);

          if (updateError) {
            console.error(`Error al cancelar orden ${order.id}:`, updateError);
          }
          results.push({ orderId: order.id, paypalOrderId, status: "cancelled_local", paypalStatus });

        } else {
          // El pago sigue pendiente de aprobación por el usuario
          results.push({ orderId: order.id, paypalOrderId, status: "no_action", paypalStatus });
        }

      } catch (err) {
        console.error(`Error procesando orden ${order.id}:`, err);
        results.push({ orderId: order.id, paypalOrderId, status: "error", error: err instanceof Error ? err.message : String(err) });
      }
    }

    return new Response(
      JSON.stringify({ message: "Reconciliación completada.", reconciledCount: results.length, details: results }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (e) {
    console.error("Error inesperado en paypal-reconcile-orders:", e);
    return new Response(
      JSON.stringify({ error: "Error interno del servidor" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// Función auxiliar para realizar la entrega segura de credenciales e indicar estado
async function deliverProduct(supabaseAdmin: SupabaseClient, order: PendingOrder) {
  let deliveredCredentials = null;

  // A) Intentar reclamar credencial del pool atómicamente
  const { data: claimedCreds, error: rpcError } = await supabaseAdmin
    .rpc("claim_product_credential_v2", {
      p_product_id: order.product_id,
      p_order_id: order.id
    });

  if (rpcError) {
    console.error("Error al llamar a claim_product_credential_v2 en reconciliación:", rpcError);
  }

  // Resolver el producto (puede venir como objeto o como arreglo de 1 elemento)
  const product = Array.isArray(order.products)
    ? order.products[0]
    : order.products;

  if (claimedCreds && claimedCreds.length > 0) {
    const cred = claimedCreds[0];
    deliveredCredentials = `Usuario: ${cred.username}\nContraseña: ${cred.password}${
      cred.extra_data ? `\n\nDetalles: ${JSON.stringify(cred.extra_data)}` : ""
    }`;
  } else {
    // B) Fallback a credenciales estáticas si existen
    const staticCredentials = product?.credentials;
    if (staticCredentials) {
      deliveredCredentials = staticCredentials;
    }
  }

  const deliveredFilePath = product?.file_path || null;

  // Actualizar la orden local a aprobada y guardar credenciales
  const { error: updateError } = await supabaseAdmin
    .from("orders")
    .update({
      status: "approved",
      approved_at: new Date().toISOString(),
      delivered_credentials: deliveredCredentials,
      delivered_file_path: deliveredFilePath,
      admin_note: "Aprobado por el Reconciliador Automático de PayPal."
    })
    .eq("id", order.id);

  if (updateError) {
    console.error(`Error actualizando orden ${order.id} a aprobada:`, updateError);
    return { success: false, error: "Error al actualizar base de datos." };
  }

  return { success: true, credentialsDelivered: !!deliveredCredentials };
}
