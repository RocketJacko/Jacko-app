import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
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
        JSON.stringify({ error: "No autorizado: Debes iniciar sesión para realizar compras con Mercado Pago." }),
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

    // 5. Configurar Mercado Pago
    const mpAccessToken = Deno.env.get("MERCADOPAGO_ACCESS_TOKEN");

    if (!mpAccessToken) {
      console.error("Falta variable de entorno MERCADOPAGO_ACCESS_TOKEN");
      return new Response(
        JSON.stringify({ error: "Configuración del servidor de pagos incompleta." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 6. Crear Orden pendiente en base de datos local
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

    // 7. Configurar e instanciar cliente SDK de Mercado Pago
    const mpClient = new MercadoPagoConfig({ accessToken: mpAccessToken.trim() });
    const preferenceInstance = new Preference(mpClient);

    const origin = req.headers.get("origin") || "http://localhost:5173";

    let secureOrigin = origin;
    if (secureOrigin.startsWith("http://")) {
      secureOrigin = secureOrigin.replace("http://", "https://");
    }

    // 8. Crear Preferencia de Pago en Mercado Pago
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
          email: userEmail || "guest@jacko.com",
        },
        back_urls: {
          success: `${secureOrigin}/?mercadopago_status=success`,
          failure: `${secureOrigin}/?mercadopago_status=failure`,
          pending: `${secureOrigin}/?mercadopago_status=pending`,
        },
        auto_return: "approved",
        external_reference: localOrder.id,
        notification_url: `https://plybwnfnmvshroaottby.supabase.co/functions/v1/mercadopago-webhook`,
        metadata: {
          order_id: localOrder.id,
          user_id: userId,
          product_id: productId,
        }
      }
    });

    // 9. Guardar la referencia de la preferencia en la orden local
    const { error: updateOrderError } = await supabaseAdmin
      .from("orders")
      .update({
        reference_note: preference.id
      })
      .eq("id", localOrder.id);

    if (updateOrderError) {
      console.error("Error actualizando orden local con referencia MP:", updateOrderError);
    }

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
