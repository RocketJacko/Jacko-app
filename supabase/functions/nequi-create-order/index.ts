import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function similarityScore(a: string, b: string): number {
  if (!a || !b) return 0;
  const la = a.toUpperCase().trim();
  const lb = b.toUpperCase().trim();
  if (la === lb) return 1.0;

  const m = la.length, n = lb.length;
  if (m === 0 || n === 0) return 0;

  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = la[i - 1] === lb[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j - 1], dp[i][j - 1], dp[i - 1][j]);
    }
  }

  const maxLen = Math.max(m, n);
  return 1 - dp[m][n] / maxLen;
}

function normalizeBank(bank: string): string {
  return bank
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // 1. Leer y validar el cuerpo del request
    const body = await req.json();
    const {
      productId,
      paymentMethodId,
      payerName,
      bankName,
      paymentDate,
      quantity,
      planId,
      guestEmail,
      guestName,
    } = body;

    if (!productId) {
      return new Response(
        JSON.stringify({ error: "ID de producto requerido." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    if (!payerName || payerName.trim().length < 3) {
      return new Response(
        JSON.stringify({ error: "Nombre del pagador requerido (mínimo 3 caracteres)." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    if (!bankName) {
      return new Response(
        JSON.stringify({ error: "Banco/entidad de pago requerida." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    if (!paymentDate) {
      return new Response(
        JSON.stringify({ error: "Fecha del pago requerida." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const qty = quantity && Number(quantity) > 0 ? Math.floor(Number(quantity)) : 1;

    let userId: string | null = null;
    let userEmail: string | null = null;

    // 2. Verificar sesión del usuario
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
        JSON.stringify({ error: "No autorizado: Debes iniciar sesión para realizar compras." }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 4. Verificar que el producto existe y está activo
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

    // 5. Crear la orden pendiente con status 'pending_nequi'
    const { data: order, error: orderError } = await supabaseAdmin
      .from("orders")
      .insert({
        user_id: userId,
        product_id: productId,
        amount_cop: totalCop,
        points_used: 0,
        status: "pending_nequi",
        payment_type: "money",
        payment_method_id: paymentMethodId || null,
        quantity: qty,
        nequi_payer_declared: payerName.trim().toUpperCase(),
        nequi_bank_declared: bankName.trim(),
        nequi_date_declared: paymentDate,
        reference_note: selectedPlan ? `Plan: ${selectedPlan.name}` : null,
        plan_id: planId || null,
        admin_note: null,
      })
      .select("id")
      .single();

    if (orderError || !order) {
      console.error("Error creando orden Nequi:", orderError);
      return new Response(
        JSON.stringify({ error: "Error al registrar la orden de pago." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let alreadyApproved = false;
    try {
      const limitDate = new Date();
      limitDate.setHours(limitDate.getHours() - 48);

      const { data: emailLogs, error: logsError } = await supabaseAdmin
        .from("nequi_email_logs")
        .select("*")
        .eq("amount", totalCop)
        .is("matched_order_id", null)
        .gte("email_date", limitDate.toISOString());

      if (logsError) {
        console.error("Error al consultar logs de email para matching retroactivo:", logsError);
      } else if (emailLogs && emailLogs.length > 0) {
        interface NequiEmailLog {
          id: string;
          reference: string | null;
          payer: string | null;
          bank: string | null;
          transaction_number: string | null;
          payment_method: string | null;
          email_date: string | null;
        }
        let bestLog: NequiEmailLog | null = null;
        let bestScore = 0;

        for (const log of emailLogs as NequiEmailLog[]) {
          let score = 0;

          if (bankName && log.bank) {
            const bankA = normalizeBank(bankName);
            const bankB = normalizeBank(log.bank);
            if (bankA === bankB || bankA.includes(bankB) || bankB.includes(bankA)) {
              score += 0.40;
            }
          }

          if (payerName && log.payer) {
            const nameSim = similarityScore(payerName, log.payer);
            if (nameSim >= 0.80) {
              score += 0.40;
            } else if (nameSim >= 0.60) {
              score += 0.20;
            }
          }

          if (paymentDate && log.email_date) {
            const emailDateStr = new Date(log.email_date).toISOString().split("T")[0];
            if (paymentDate === emailDateStr) {
              score += 0.20;
            }
          }

          if (score > bestScore) {
            bestScore = score;
            bestLog = log;
          }
        }

        if (bestLog && bestScore >= 0.75) {
          console.log(`Coincidencia retroactiva encontrada: log ID ${bestLog.id} con score ${bestScore.toFixed(2)}`);

          let deliveredCredentials: string | null = null;
          const { data: claimedCreds, error: rpcError } = await supabaseAdmin
            .rpc("claim_product_credential_v2", {
              p_product_id: productId,
              p_order_id: order.id,
            });

          if (rpcError) {
            console.error("Error en claim_product_credential_v2 en matching retroactivo:", rpcError);
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

          const { error: updateOrderError } = await supabaseAdmin
            .from("orders")
            .update({
              status: "approved",
              approved_at: new Date().toISOString(),
              delivered_credentials: deliveredCredentials,
              delivered_file_path: deliveredFilePath,
              nequi_reference: bestLog.reference,
              nequi_payer: bestLog.payer,
              nequi_bank: bestLog.bank,
              nequi_transaction_id: bestLog.transaction_number,
              nequi_payment_method: bestLog.payment_method,
              nequi_match_score: bestScore,
              nequi_match_status: "auto_approved",
              // El trigger BEFORE UPDATE en orders interceptará esta actualización a 'approved'
              // y transferirá la propiedad del placeholder 0000...0000 al usuario real aprovisionado
            })
            .eq("id", order.id);

          if (updateOrderError) {
            console.error("Error al aprobar orden por coincidencia retroactiva:", updateOrderError);
          } else {
            const { error: updateLogError } = await supabaseAdmin
              .from("nequi_email_logs")
              .update({
                matched_order_id: order.id,
                match_score: bestScore,
                match_status: "auto_approved",
              })
              .eq("id", bestLog.id);

            if (updateLogError) {
              console.error("Error al vincular log de email:", updateLogError);
            } else {
              alreadyApproved = true;
            }
          }
        }
      }
    } catch (matchErr) {
      console.error("Error inesperado en algoritmo de matching retroactivo:", matchErr);
    }

    // 6. Generar URL pre-firmada para subir comprobante a Storage
    const filePath = `${userId}/${order.id}.jpg`;
    const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
      .from("nequi-comprobantes")
      .createSignedUploadUrl(filePath, { upsert: true });

    if (uploadError || !uploadData) {
      console.error("Error generando URL de upload:", uploadError);
    }

    const comprobanteUrl = uploadData
      ? `${supabaseUrl}/storage/v1/object/public/nequi-comprobantes/${filePath}`
      : null;

    if (comprobanteUrl) {
      await supabaseAdmin
        .from("orders")
        .update({ receipt_url: comprobanteUrl })
        .eq("id", order.id);
    }

    return new Response(
      JSON.stringify({
        success: true,
        orderId: order.id,
        uploadUrl: uploadData?.signedUrl || null,
        uploadPath: uploadData ? filePath : null,
        alreadyApproved,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Error interno del servidor";
    console.error("Error inesperado en nequi-create-order:", e);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
