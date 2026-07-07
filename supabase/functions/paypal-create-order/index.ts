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
    // 1. Leer entrada del request
    const body = await req.json();
    const { productId, paymentMethodId, paymentMethodType, quantity, planId, guestEmail, guestName } = body;
    
    if (!productId) {
      return new Response(
        JSON.stringify({ success: false, error: "ID de producto faltante." }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const qty = quantity && Number(quantity) > 0 ? Math.floor(Number(quantity)) : 1;

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // 2. Verificar sesión o crear cuenta de invitado
    let userId = null;

    const authHeader = req.headers.get("Authorization");
    if (authHeader && authHeader.length > 20) {
      const supabaseClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
      if (!userError && user) {
        userId = user.id;
      }
    }

    if (!userId) {
      if (!guestEmail) {
        return new Response(
          JSON.stringify({ success: false, error: "No autorizado: Falta token de sesión o correo de invitado." }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      // Tratar de obtener el usuario por el RPC get_user_id_by_email
      const { data: existingUserId } = await supabaseAdmin.rpc('get_user_id_by_email', { p_email: guestEmail });
      
      if (existingUserId) {
        userId = existingUserId;
      } else {
        // Crear el usuario
        const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
          email: guestEmail,
          email_confirm: true,
          user_metadata: { name: guestName || "Invitado" }
        });
        if (authError || !authData.user) {
          return new Response(
            JSON.stringify({ success: false, error: "Error al registrar la cuenta de invitado." }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        userId = authData.user.id;
      }
    }

    const exchangeRate = parseFloat(
      Deno.env.get("EXCHANGE_RATE_COP") || 
      Deno.env.get("VITE_EXCHANGE_RATE_COP") || 
      "3700"
    );

    // 3. Consultar detalles oficiales del producto
    const { data: product, error: productError } = await supabaseAdmin
      .from("products_with_plans")
      .select("id, slug, title, price_cop, price_usd, plans")
      .eq("id", productId)
      .eq("is_active", true)
      .maybeSingle();

    if (productError || !product) {
      return new Response(
        JSON.stringify({ success: false, error: "El producto no existe o no está activo." }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let totalUsd = 0;
    let selectedPlan = null;

    if (product.plans && Array.isArray(product.plans) && planId) {
      selectedPlan = product.plans.find((p: { id: string }) => p.id === planId);
    }

    if (selectedPlan) {
      const basePriceUsd = selectedPlan.price_cop || 0;
      if (selectedPlan.bulk_pricing) {
        const qtyStr = String(qty);
        if (selectedPlan.bulk_pricing[qtyStr] !== undefined) {
          totalUsd = selectedPlan.bulk_pricing[qtyStr];
        } else if (selectedPlan.id === "pago-unico") {
          totalUsd = (qty * 60000) / exchangeRate;
        } else {
          totalUsd = basePriceUsd * qty;
        }
      } else {
        totalUsd = basePriceUsd * qty;
      }
    } else {
      const basePriceUsd = product.price_cop || 0;
      if (basePriceUsd <= 0) {
        return new Response(
          JSON.stringify({ success: false, error: "Este producto no tiene un precio válido en dinero." }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      totalUsd = basePriceUsd * qty;
      if (product.slug === "mini-curso-git-github") {
        let copVal = 0;
        if (qty === 1) copVal = 140000;
        else if (qty === 2) copVal = 220000;
        else if (qty === 3) copVal = 240000;
        else if (qty === 4) copVal = 240000;
        else copVal = qty * 60000;
        totalUsd = copVal / exchangeRate;
      }
    }

    const usdAmount = totalUsd.toFixed(2);
    const totalCop = Math.round(totalUsd * exchangeRate);

    // 5. Configurar credenciales de PayPal
    const paypalClientId = Deno.env.get("PAYPAL_CLIENT_ID");
    const paypalClientSecret = Deno.env.get("PAYPAL_CLIENT_SECRET");
    const paypalEnv = Deno.env.get("PAYPAL_ENVIRONMENT") || "sandbox";

    if (!paypalClientId || !paypalClientSecret) {
      console.error("Faltan variables de entorno PAYPAL_CLIENT_ID o PAYPAL_CLIENT_SECRET");
      return new Response(
        JSON.stringify({ success: false, error: "Configuración del servidor de pagos incompleta." }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const paypalBaseUrl = paypalEnv === "live" 
      ? "https://api-m.paypal.com" 
      : "https://api-m.sandbox.paypal.com";

    // 6. Obtener Token de Acceso de PayPal
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
        JSON.stringify({ success: false, error: "No se pudo autenticar con el portal de pagos de PayPal." }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { access_token } = await tokenResponse.json();

    // 7. Crear Orden en PayPal
    const origin = req.headers.get("origin") || "http://localhost:5173";
    const paypalOrderResponse = await fetch(`${paypalBaseUrl}/v2/checkout/orders`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        intent: "CAPTURE",
        purchase_units: [
          {
            amount: {
              currency_code: "USD",
              value: usdAmount,
            },
            description: `Compra de ${qty}x ${product.title}${selectedPlan ? ` (${selectedPlan.name})` : ''} en JACKO™`,
          },
        ],
        application_context: {
          brand_name: "JACKO™",
          locale: "es-CO",
          landing_page: "NO_PREFERENCE",
          user_action: "PAY_NOW",
          return_url: `${origin}/?paypal_status=success`,
          cancel_url: `${origin}/?paypal_status=cancel`,
        },
      }),
    });

    if (!paypalOrderResponse.ok) {
      const orderError = await paypalOrderResponse.text();
      console.error("Error creando orden en PayPal:", orderError);
      return new Response(
        JSON.stringify({ success: false, error: "Error al generar la orden de cobro en PayPal." }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const paypalOrder = await paypalOrderResponse.json();
    const approveLink = paypalOrder.links.find((l: { rel: string }) => l.rel === "approve")?.href;

    if (!approveLink) {
      return new Response(
        JSON.stringify({ success: false, error: "No se encontró enlace de aprobación de PayPal." }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 8. Crear Orden pendiente en base de datos local
    let resolvedPaymentMethodId = paymentMethodId || null;
    if (!resolvedPaymentMethodId) {
      const pmType = paymentMethodType || "paypal";
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
        user_id: userId,
        product_id: productId,
        payment_type: "money",
        amount_cop: totalCop,
        amount_usd: totalUsd,
        points_used: 0,
        payment_method_id: resolvedPaymentMethodId,
        status: "pending",
        quantity: qty,
        reference_note: paypalOrder.id, // Guardamos el ID de orden de PayPal para validación posterior
        plan_id: planId || null,
      })
      .select("id")
      .single();

    if (localOrderError || !localOrder) {
      console.error("Error insertando orden local:", localOrderError);
      return new Response(
        JSON.stringify({ success: false, error: "Error al registrar la orden pendiente de pago en el sistema." }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        paypalOrderId: paypalOrder.id,
        approveUrl: approveLink,
        localOrderId: localOrder.id,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (e) {
    console.error("Error inesperado en paypal-create-order:", e);
    return new Response(
      JSON.stringify({ success: false, error: "Error interno del servidor" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
