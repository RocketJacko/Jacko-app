import { createClient } from "@supabase/supabase-js";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-region",
};

// Web Crypto HMAC SHA-256 helper for signing requests
async function hmacSha256(keyStr: string, messageStr: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyBuffer = encoder.encode(keyStr);
  const messageBuffer = encoder.encode(messageStr);
  
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyBuffer,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  
  const signatureBuffer = await crypto.subtle.sign(
    "HMAC",
    cryptoKey,
    messageBuffer
  );
  
  return Array.from(new Uint8Array(signatureBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // 1. Read request body parameters
    const body = await req.json();
    const {
      productId,
      paymentMethodId,
      paymentMethodType,
      quantity,
      planId,
      binanceOrderId,
      binanceAmount,
      guestEmail,
      guestName,
    } = body;

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // 2. Authenticate user session or create guest account
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
      const { data: existingUserId } = await supabaseAdmin.rpc('get_user_id_by_email', { p_email: guestEmail });
      
      if (existingUserId) {
        userId = existingUserId;
      } else {
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

    if (!productId) {
      return new Response(
        JSON.stringify({ success: false, error: "ID de producto requerido." }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    if (!binanceOrderId || binanceOrderId.trim().length < 10) {
      return new Response(
        JSON.stringify({ success: false, error: "ID de orden de Binance inválido." }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const qty = quantity && Number(quantity) > 0 ? Math.floor(Number(quantity)) : 1;

    // 3. Prevent reuse of the same Binance Order ID
    const { data: existingOrder } = await supabaseAdmin
      .from("orders")
      .select("id")
      .eq("binance_order_id", binanceOrderId.trim())
      .maybeSingle();

    if (existingOrder) {
      return new Response(
        JSON.stringify({ success: false, error: "Este ID de orden de Binance ya fue utilizado para activar otro producto." }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 4. Retrieve product and calculate total price in COP
    const { data: product, error: productError } = await supabaseAdmin
      .from("products_with_plans")
      .select("id, title, price_cop, price_usd, slug, plans")
      .eq("id", productId)
      .eq("is_active", true)
      .maybeSingle();

    if (productError || !product) {
      return new Response(
        JSON.stringify({ success: false, error: "Producto no encontrado o inactivo." }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const exchangeRate = Number(Deno.env.get("VITE_EXCHANGE_RATE_COP")) || Number(Deno.env.get("EXCHANGE_RATE_COP")) || 3700;
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
          JSON.stringify({ success: false, error: "Este producto no tiene precio configurado." }),
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

    const totalCop = Math.round(totalUsd * exchangeRate);

    // 6. Connect to Binance Pay API
    const binanceApi = Deno.env.get("BINANCE_API");
    const binanceSecret = Deno.env.get("BINANCE_SECRET");

    if (!binanceApi || !binanceSecret) {
      return new Response(
        JSON.stringify({ success: false, error: "Las credenciales de Binance no están configuradas." }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const timestamp = Date.now();
    const recvWindow = 60000;
    const queryString = `recvWindow=${recvWindow}&timestamp=${timestamp}`;
    const signature = await hmacSha256(binanceSecret, queryString);

    const binanceUrl = `https://api.binance.com/sapi/v1/pay/transactions?${queryString}&signature=${signature}`;

    const binanceRes = await fetch(binanceUrl, {
      method: "GET",
      headers: {
        "X-MBX-APIKEY": binanceApi,
      },
    });

    if (!binanceRes.ok) {
      const errText = await binanceRes.text();
      console.error("Error calling Binance API:", errText);
      return new Response(
        JSON.stringify({ success: false, error: "No se pudo comunicar con Binance para verificar el pago." }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    interface BinanceTransaction {
      orderId: string | number;
      amount: string | number;
      currency: string;
      orderType?: string;
    }

    const payResult = await binanceRes.json();
    const transactions = (payResult.data as BinanceTransaction[]) || [];

    // Find a matching transaction in the history
    const matchedTx = transactions.find((tx: BinanceTransaction) => 
      String(tx.orderId) === String(binanceOrderId.trim())
    );

    if (!matchedTx) {
      return new Response(
        JSON.stringify({ success: false, error: "La transacción no fue encontrada en Binance o aún está pendiente." }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (matchedTx.currency !== "USDT") {
      return new Response(
        JSON.stringify({ success: false, error: "La transacción de Binance debe ser en USDT." }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify transaction amount
    const txAmount = Number(matchedTx.amount) || 0;
    const diff = Math.abs(txAmount - totalUsd);
    if (diff > 0.05) {
      return new Response(
        JSON.stringify({ 
          success: false,
          error: "El monto verificado no coincide con el costo esperado de tu compra." 
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validación adicional sólo para el Plan Mensual
    if (product.slug === 'plan-mensual') {
      if (!binanceAmount) {
        return new Response(
          JSON.stringify({ success: false, error: "El monto de la transacción es requerido para validar el pago mensual." }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const userAmount = Number(binanceAmount);
      const diffUser = Math.abs(txAmount - userAmount);
      if (diffUser > 0.05) {
        return new Response(
          JSON.stringify({ 
            success: false,
            error: "El monto declarado no coincide con la transacción de Binance." 
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // 7. Insert approved order in orders table
    let resolvedPaymentMethodId = paymentMethodId || null;
    if (!resolvedPaymentMethodId) {
      const pmType = paymentMethodType || "binance";
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

    const { data: order, error: orderError } = await supabaseAdmin
      .from("orders")
      .insert({
        user_id: userId,
        product_id: productId,
        amount_cop: totalCop,
        amount_usd: totalUsd,
        points_used: 0,
        status: "approved",
        approved_at: new Date().toISOString(),
        payment_type: "money",
        payment_method_id: resolvedPaymentMethodId,
        quantity: qty,
        binance_order_id: binanceOrderId.trim(),
        reference_note: selectedPlan ? `Plan: ${selectedPlan.name}` : null,
        plan_id: planId || null,
      })
      .select("id, redemption_code")
      .single();

    if (orderError || !order) {
      console.error("Error creating approved Binance order:", orderError);
      return new Response(
        JSON.stringify({ success: false, error: "Error al registrar la orden aprobada." }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 8. Deliver credentials/file pathways
    let deliveredCredentials: string | null = null;
    const { data: claimedCreds, error: rpcError } = await supabaseAdmin
      .rpc("claim_product_credential_v2", {
        p_product_id: productId,
        p_order_id: order.id,
      });

    if (rpcError) {
      console.error("Error en claim_product_credential_v2:", rpcError);
    }

    if (claimedCreds && claimedCreds.length > 0) {
      const cred = claimedCreds[0];
      deliveredCredentials = `Usuario: ${cred.username}\nContraseña: ${cred.password}${
        cred.extra_data ? `\n\nDetalles: ${JSON.stringify(cred.extra_data)}` : ""
      }`;
    } else {
      const { data: prodData } = await supabaseAdmin
        .from("products")
        .select("credentials")
        .eq("id", productId)
        .single();
      deliveredCredentials = prodData?.credentials || null;
    }

    const { data: prodData } = await supabaseAdmin
      .from("products")
      .select("file_path")
      .eq("id", productId)
      .single();
    const deliveredFilePath = prodData?.file_path || null;

    // Update order with delivered info
    await supabaseAdmin
      .from("orders")
      .update({
        delivered_credentials: deliveredCredentials,
        delivered_file_path: deliveredFilePath,
      })
      .eq("id", order.id);

    console.log(`Pago verificado exitosamente. Orden ${order.id} aprobada. Transacción Binance: ${binanceOrderId}`);

    return new Response(
      JSON.stringify({
        success: true,
        orderId: order.id,
        redemptionCode: order.redemption_code,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Error interno del servidor";
    console.error("Error inesperado en binance-verify-payment:", e);
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
