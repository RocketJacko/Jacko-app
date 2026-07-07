import { createClient } from "@supabase/supabase-js";
import { MercadoPagoConfig, Preference } from "npm:mercadopago";

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
    const body = await req.json();
    const { productId, paymentMethodId, paymentMethodType, quantity, planId } = body;
    if (!productId) {
      return new Response(
        JSON.stringify({ error: "ID de producto faltante." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const qty = quantity && Number(quantity) > 0 ? Math.floor(Number(quantity)) : 1;

    // Cliente admin para consultar tablas sin restricciones de RLS restrictivas de lectura directa
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // 3. Consultar detalles oficiales del producto
    const { data: product, error: productError } = await supabaseAdmin
      .from("products_with_plans")
      .select("id, slug, title, price_cop, plans")
      .eq("id", productId)
      .eq("is_active", true)
      .maybeSingle();

    if (productError || !product) {
      return new Response(
        JSON.stringify({ error: "El producto no existe o no está activo." }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let totalCop = 0;
    let selectedPlan = null;

    if (product.plans && Array.isArray(product.plans) && planId) {
      selectedPlan = product.plans.find((p: { id: string }) => p.id === planId);
    }

    // Obtener la TRM actual para convertir de USD a COP
    let rate = 3700.0;
    try {
      const rateRes = await fetch("https://v6.exchangerate-api.com/v6/21378afd98e8b0ad85068412/latest/USD");
      if (rateRes.ok) {
        const rateData = await rateRes.json();
        if (rateData.result === "success" && rateData.conversion_rates?.COP) {
          rate = Number(rateData.conversion_rates.COP);
        }
      }
    } catch (err) {
      console.warn("Error fetching exchange rate in Mercado Pago function:", err);
    }

    if (selectedPlan) {
      const basePriceUsd = selectedPlan.price_cop || 0;
      if (selectedPlan.bulk_pricing) {
        const qtyStr = String(qty);
        if (selectedPlan.bulk_pricing[qtyStr] !== undefined) {
          totalCop = Math.round(selectedPlan.bulk_pricing[qtyStr] * rate);
        } else if (selectedPlan.id === "pago-unico") {
          totalCop = qty * 60000;
        } else {
          totalCop = Math.round(basePriceUsd * qty * rate);
        }
      } else {
        totalCop = Math.round(basePriceUsd * qty * rate);
      }
    } else {
      if (!product.price_cop || product.price_cop <= 0) {
        return new Response(
          JSON.stringify({ error: "Este producto no tiene un precio válido en dinero." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const basePriceUsd = product.price_cop || 0;
      totalCop = Math.round(basePriceUsd * qty * rate);
      if (product.slug === "mini-curso-git-github") {
        if (qty === 1) totalCop = 140000;
        else if (qty === 2) totalCop = 220000;
        else if (qty === 3) totalCop = 240000;
        else if (qty === 4) totalCop = 240000;
        else totalCop = qty * 60000;
      }
    }

    // 4. Configurar Mercado Pago
    const mpAccessToken = Deno.env.get("MERCADOPAGO_ACCESS_TOKEN");

    if (!mpAccessToken) {
      console.error("Falta variable de entorno MERCADOPAGO_ACCESS_TOKEN");
      return new Response(
        JSON.stringify({ error: "Configuración del servidor de pagos incompleta." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let resolvedPaymentMethodId = paymentMethodId || null;
    if (!resolvedPaymentMethodId) {
      const pmType = paymentMethodType || "mercadopago";
      const { data: pm } = await supabaseAdmin
        .from("payment_methods")
        .select("id")
        .eq("type", pmType)
        .eq("is_active", true)
        .limit(1)
        .maybeSingle();
      if (pm) {
        resolvedPaymentMethodId = pm.id;
      }
    }

    const { data: localOrder, error: localOrderError } = await supabaseAdmin
      .from("orders")
      .insert({
        user_id: user.id,
        product_id: productId,
        payment_type: "money",
        amount_cop: totalCop,
        points_used: 0,
        payment_method_id: resolvedPaymentMethodId,
        status: "pending",
        quantity: qty,
        plan_id: planId || null,
      })
      .select("id")
      .single();

    if (localOrderError || !localOrder) {
      console.error("Error insertando orden local:", localOrderError);
      return new Response(
        JSON.stringify({ error: "Error al registrar la orden pendiente de pago en el sistema." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 6. Configurar e instanciar cliente SDK de Mercado Pago
    const mpClient = new MercadoPagoConfig({ accessToken: mpAccessToken.trim() });
    const preferenceInstance = new Preference(mpClient);

    const origin = req.headers.get("origin") || "http://localhost:5173";

    // Mercado Pago exige estrictamente HTTPS para las back_urls (incluso para localhost) para permitir auto_return
    let secureOrigin = origin;
    if (secureOrigin.startsWith("http://")) {
      secureOrigin = secureOrigin.replace("http://", "https://");
    }

    // 7. Crear Preferencia de Pago en Mercado Pago
    const preference = await preferenceInstance.create({
      body: {
        items: [
          {
            id: productId,
            title: qty > 1 
              ? `${qty}x ${product.title}${selectedPlan ? ` (${selectedPlan.name})` : ''}` 
              : `${product.title}${selectedPlan ? ` (${selectedPlan.name})` : ''}`,
            quantity: 1,
            unit_price: Number(totalCop),
            currency_id: "COP",
          }
        ],
        payer: {
          email: user.email,
        },
        back_urls: {
          success: `${secureOrigin}/?mercadopago_status=success`,
          failure: `${secureOrigin}/?mercadopago_status=failure`,
          pending: `${secureOrigin}/?mercadopago_status=pending`,
        },
        auto_return: "approved",
        external_reference: localOrder.id,
        // URL del webhook remoto para notificaciones asíncronas
        notification_url: `https://plybwnfnmvshroaottby.supabase.co/functions/v1/mercadopago-webhook`,
        metadata: {
          order_id: localOrder.id,
          user_id: user.id,
          product_id: productId,
        }
      }
    });

    // 8. Guardar la referencia de la preferencia en la orden local para consistencia/reconciliación
    const { error: updateOrderError } = await supabaseAdmin
      .from("orders")
      .update({
        reference_note: preference.id // Guardamos el ID de la preferencia
      })
      .eq("id", localOrder.id);

    if (updateOrderError) {
      console.error("Error actualizando orden local con referencia MP:", updateOrderError);
    }

    // 9. Siempre usar init_point (Mercado Pago detecta de forma nativa Sandbox/Producción según las credenciales)
    const approveUrl = preference.init_point;

    return new Response(
      JSON.stringify({
        preferenceId: preference.id,
        approveUrl: approveUrl,
        localOrderId: localOrder.id,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Error interno del servidor";
    console.error("Error inesperado en mercadopago-create-preference:", e);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
