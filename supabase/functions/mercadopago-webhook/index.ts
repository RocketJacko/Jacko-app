import { createClient } from "@supabase/supabase-js";
import { MercadoPagoConfig, Payment } from "npm:mercadopago";

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
    const body = await req.json().catch(() => ({}));
    console.log("Mercado Pago Webhook payload:", JSON.stringify(body));

    // Verificar que sea un evento de pago
    if (body.type !== "payment" || !body.data?.id) {
      // Retornar 200 OK para confirmar recepción de otros eventos (ej. notificaciones de test)
      return new Response(JSON.stringify({ success: true, message: "Ignored non-payment event" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const paymentId = body.data.id;
    const mpAccessToken = Deno.env.get("MERCADOPAGO_ACCESS_TOKEN");
    if (!mpAccessToken) {
      console.error("Falta variable de entorno MERCADOPAGO_ACCESS_TOKEN");
      return new Response(JSON.stringify({ error: "Configuración del webhook incompleta" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // 1. Consultar detalles oficiales del pago en la API de Mercado Pago por seguridad (Idempotencia y Veracidad)
    const mpClient = new MercadoPagoConfig({ accessToken: mpAccessToken.trim() });
    const paymentInstance = new Payment(mpClient);

    let paymentData;
    try {
      paymentData = await paymentInstance.get({ id: paymentId });
    } catch (err) {
      console.error(`Error al consultar pago ${paymentId} en Mercado Pago:`, err);
      return new Response(JSON.stringify({ error: "Error consultando estado con el proveedor de pagos" }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    console.log(`Payment data recuperado para ${paymentId}: status = ${paymentData.status}, ref = ${paymentData.external_reference}`);

    // Si el pago no está aprobado, no hacemos nada más (puede estar pendiente o rechazado)
    if (paymentData.status !== "approved") {
      return new Response(JSON.stringify({ success: true, message: `El pago está en estado: ${paymentData.status}` }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const localOrderId = paymentData.external_reference;
    if (!localOrderId) {
      console.error(`El pago ${paymentId} de Mercado Pago no contiene external_reference.`);
      return new Response(JSON.stringify({ error: "Falta external_reference en el pago" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // 2. Conectar a Supabase con Service Role Key para hacer bypass a las RLS de escritura
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
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
      .eq("id", localOrderId)
      .maybeSingle();

    if (localOrderError || !localOrder) {
      console.error(`No se encontró la orden local ${localOrderId} en la base de datos:`, localOrderError);
      return new Response(JSON.stringify({ error: "Orden local no encontrada" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // Si ya está aprobada, retornamos éxito inmediatamente por idempotencia
    if (localOrder.status === "approved") {
      return new Response(JSON.stringify({ success: true, message: "La orden ya estaba aprobada previamente" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    if (localOrder.status === "cancelled" || localOrder.status === "rejected") {
      return new Response(JSON.stringify({ error: `La orden está en estado '${localOrder.status}' y no se puede aprobar` }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // 4. Entregar credenciales del Pool o estáticas
    let deliveredCredentials = null;

    // A) Llamar a la RPC atómica para reclamar credencial del pool de forma segura contra condiciones de carrera
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
      // B) Fallback a credenciales estáticas
      const staticCredentials = product?.credentials;
      if (staticCredentials) {
        deliveredCredentials = staticCredentials;
      }
    }

    const deliveredFilePath = product?.file_path || null;

    // 5. Aprobar la orden en base de datos local
    const { error: updateError } = await supabaseAdmin
      .from("orders")
      .update({
        status: "approved",
        approved_at: new Date().toISOString(),
        delivered_credentials: deliveredCredentials,
        delivered_file_path: deliveredFilePath,
        admin_note: `Aprobado por Webhook de Mercado Pago. Pago ID: ${paymentId}`
      })
      .eq("id", localOrder.id);

    if (updateError) {
      console.error(`Error actualizando orden local ${localOrder.id} a aprobada:`, updateError);
      return new Response(JSON.stringify({ error: "Error al actualizar el estado de la orden" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    console.log(`Orden ${localOrder.id} aprobada con éxito vía Webhook de Mercado Pago.`);
    return new Response(JSON.stringify({ success: true, message: "Orden aprobada y producto activado con éxito" }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Error interno del servidor";
    console.error("Error inesperado en webhook de Mercado Pago:", e);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
