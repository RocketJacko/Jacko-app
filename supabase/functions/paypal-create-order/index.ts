import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

    // 1. Leer entrada del request
    const body = await req.json();
    const { productId, paymentMethodId, quantity, planId } = body;
    if (!productId) {
      return new Response(
        JSON.stringify({ error: "ID de producto faltante." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const qty = quantity && Number(quantity) > 0 ? Math.floor(Number(quantity)) : 1;

    let userId: string | null = null;
    let userEmail: string | null = null;

    // 2. Verificar sesión del usuario si se proporciona token de Authorization
    const authHeader = req.headers.get("Authorization");
    if (authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.split(" ")[1];
      const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
      if (token && token !== anonKey) {
        const supabaseClient = createClient(supabaseUrl, anonKey, {
          global: { headers: { Authorization: authHeader } },
        });
        const { data: { user } } = await supabaseClient.auth.getUser();
        if (user) {
          userId = user.id;
          userEmail = user.email || null;
        }
      }
    }

    // 3. Si no hay sesión válida, rechazar la transacción
    if (!userId) {
      return new Response(
        JSON.stringify({ error: "No autorizado: Debes iniciar sesión para realizar compras con PayPal." }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 4. Consultar detalles oficiales del producto
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

    if (selectedPlan) {
      const basePrice = selectedPlan.price_cop || 0;
      if (selectedPlan.bulk_pricing) {
        const qtyStr = String(qty);
        if (selectedPlan.bulk_pricing[qtyStr] !== undefined) {
          totalCop = selectedPlan.bulk_pricing[qtyStr];
        } else if (selectedPlan.id === "pago-unico") {
          totalCop = qty * 60000;
        } else {
          totalCop = basePrice * qty;
        }
      } else {
        totalCop = basePrice * qty;
      }
    } else {
      if (!product.price_cop || product.price_cop <= 0) {
        return new Response(
          JSON.stringify({ error: "Este producto no tiene un precio válido en dinero." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      totalCop = product.price_cop * qty;
      if (product.slug === "mini-curso-git-github") {
        if (qty === 1) totalCop = 140000;
        else if (qty === 2) totalCop = 220000;
        else if (qty === 3) totalCop = 240000;
        else if (qty === 4) totalCop = 240000;
        else totalCop = qty * 60000;
      }
    }

    // 5. Calcular valor en USD para PayPal
    let usdAmountVal = 0;
    if (product.slug === "mini-curso-git-github") {
      const exchangeRate = parseFloat(
        Deno.env.get("EXCHANGE_RATE_COP") || 
        Deno.env.get("VITE_EXCHANGE_RATE_COP") || 
        "3700"
      );
      usdAmountVal = totalCop / exchangeRate;
    } else {
      usdAmountVal = totalCop;
    }

    if (usdAmountVal < 0.01) {
      usdAmountVal = 0.01;
    }
    const usdAmount = usdAmountVal.toFixed(2);

    // 6. Configurar credenciales de PayPal
    let paypalClientId = Deno.env.get("PAYPAL_CLIENT_ID");
    let paypalClientSecret = Deno.env.get("PAYPAL_CLIENT_SECRET");
    const paypalEnv = Deno.env.get("PAYPAL_ENVIRONMENT") || Deno.env.get("PAYPAL_MODE") || "live";

    if (!paypalClientId || !paypalClientSecret) {
      try {
        const { data: secrets } = await supabaseAdmin
          .rpc("get_system_secret", { p_name: "paypal_client_id" });
        if (secrets) paypalClientId = secrets;
        const { data: secretKey } = await supabaseAdmin
          .rpc("get_system_secret", { p_name: "paypal_client_secret" });
        if (secretKey) paypalClientSecret = secretKey;
      } catch (_e) {
        // Ignorar error de RPC si no existe y probar query directa
      }
    }

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

    // 7. Obtener Token de Acceso de PayPal
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
        JSON.stringify({ error: "No se pudo autenticar con el portal de pagos de PayPal." }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { access_token } = await tokenResponse.json();

    // 8. Crear Orden en PayPal
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
        JSON.stringify({ error: "Error al generar la orden de cobro en PayPal." }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const paypalOrder = await paypalOrderResponse.json();
    const approveLink = paypalOrder.links.find((l: { rel: string }) => l.rel === "approve")?.href;

    if (!approveLink) {
      return new Response(
        JSON.stringify({ error: "No se encontró enlace de aprobación de PayPal." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 9. Crear Orden pendiente en base de datos local
    const { data: localOrder, error: localOrderError } = await supabaseAdmin
      .from("orders")
      .insert({
        user_id: userId,
        product_id: productId,
        payment_type: "money",
        amount_cop: totalCop,
        points_used: 0,
        payment_method_id: paymentMethodId || null,
        status: "pending",
        quantity: qty,
        reference_note: paypalOrder.id,
        plan_id: planId || null,
        admin_note: null,
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

    return new Response(
      JSON.stringify({
        paypalOrderId: paypalOrder.id,
        approveUrl: approveLink,
        localOrderId: localOrder.id,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (e) {
    console.error("Error inesperado en paypal-create-order:", e);
    return new Response(
      JSON.stringify({ error: "Error interno del servidor" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
