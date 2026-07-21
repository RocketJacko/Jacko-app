import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-region",
};

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
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // 1. Leer cuerpo de la petición
    const body = await req.json();
    const {
      productId,
      paymentMethodId,
      quantity,
      planId,
      binanceOrderId,
    } = body;

    if (!productId) {
      return new Response(
        JSON.stringify({ error: "ID de producto requerido." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    if (!binanceOrderId || binanceOrderId.trim().length < 10) {
      return new Response(
        JSON.stringify({ error: "ID de orden de Binance inválido." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const qty = quantity && Number(quantity) > 0 ? Math.floor(Number(quantity)) : 1;

    let userId: string | null = null;
    let userEmail: string | null = null;

    // 2. Autenticar sesión del usuario si se provee token de Authorization
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
        JSON.stringify({ error: "No autorizado: Debes iniciar sesión para verificar compras con Binance." }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 4. Prevenir reutilización del mismo Binance Order ID
    const { data: existingOrder } = await supabaseAdmin
      .from("orders")
      .select("id")
      .eq("binance_order_id", binanceOrderId.trim())
      .maybeSingle();

    if (existingOrder) {
      return new Response(
        JSON.stringify({ error: "Este ID de orden de Binance ya fue utilizado para activar otro producto." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 5. Consultar producto y precio total en COP
    const { data: product, error: productError } = await supabaseAdmin
      .from("products_with_plans")
      .select("id, title, price_cop, slug, plans")
      .eq("id", productId)
      .eq("is_active", true)
      .maybeSingle();

    if (productError || !product) {
      return new Response(
        JSON.stringify({ error: "Producto no encontrado o inactivo." }),
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
          JSON.stringify({ error: "Este producto no tiene precio en COP." }),
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

    // 6. Conectarse a Binance Pay API
    const binanceApi = Deno.env.get("BINANCE_API");
    const binanceSecret = Deno.env.get("BINANCE_SECRET");

    if (!binanceApi || !binanceSecret) {
      return new Response(
        JSON.stringify({ error: "Las credenciales BINANCE_API o BINANCE_SECRET no están configuradas." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
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
      
      let detailedError = "No se pudo comunicar con Binance.";
      try {
        const errObj = JSON.parse(errText);
        if (errObj.msg) {
          detailedError = `Error de Binance: ${errObj.msg} (Código: ${errObj.code})`;
        } else {
          detailedError = `Error de Binance: ${errText}`;
        }
      } catch {
        detailedError = `Error de Binance (HTTP ${binanceRes.status}): ${errText}`;
      }

      return new Response(
        JSON.stringify({ error: detailedError }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
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

    const matchedTx = transactions.find((tx: BinanceTransaction) => 
      String(tx.orderId) === String(binanceOrderId.trim())
    );

    if (!matchedTx) {
      return new Response(
        JSON.stringify({ error: "Transacción no encontrada en Binance o aún está pendiente. Verifica el ID." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (matchedTx.currency !== "USDT") {
      return new Response(
        JSON.stringify({ error: "La transacción de Binance debe ser en USDT." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 7. Insertar orden aprobada en la base de datos (se auto-transfiere en el trigger BEFORE INSERT si es invitado)
    const { data: order, error: orderError } = await supabaseAdmin
      .from("orders")
      .insert({
        user_id: userId,
        product_id: productId,
        amount_cop: totalCop,
        points_used: 0,
        status: "approved",
        approved_at: new Date().toISOString(),
        payment_type: "money",
        payment_method_id: paymentMethodId || null,
        quantity: qty,
        binance_order_id: binanceOrderId.trim(),
        reference_note: selectedPlan ? `Plan: ${selectedPlan.name}` : null,
        plan_id: planId || null,
        admin_note: null,
      })
      .select("id")
      .single();

    if (orderError || !order) {
      console.error("Error creando orden Binance aprobada:", orderError);
      return new Response(
        JSON.stringify({ error: "Error al registrar la orden aprobada." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 8. Entregar credenciales del pool
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

    await supabaseAdmin
      .from("orders")
      .update({
        delivered_credentials: deliveredCredentials,
        delivered_file_path: deliveredFilePath,
      })
      .eq("id", order.id);

    return new Response(
      JSON.stringify({
        success: true,
        orderId: order.id,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Error interno del servidor";
    console.error("Error inesperado en binance-verify-payment:", e);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
