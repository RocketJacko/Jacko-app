import { createClient } from "@supabase/supabase-js";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ─── Helpers para matching fuzzy ──────────────────────────────────────────────
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
    .replace(/[\u0300-\u036f]/g, "")  // quita tildes
    .replace(/\s+/g, " ")
    .trim();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // 1. Leer y validar el cuerpo del request
    const body = await req.json();
    const {
      productId,
      paymentMethodId,
      paymentMethodType,
      payerName,     // Nombre del pagador declarado por el usuario
      bankName,      // Banco declarado (Davivienda, Bancolombia, etc.)
      paymentDate,   // Fecha del pago en ISO string (YYYY-MM-DD)
      quantity,      // Cantidad (opcional)
      guestEmail,
      guestName,
      exchangeRate,  // TRM enviada por el cliente
    } = body;

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
      const { data: existingUserId } = await supabaseAdmin.rpc('get_user_id_by_email', { p_email: guestEmail });
      
      if (existingUserId) {
        userId = existingUserId;
      } else {
        const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
          email: guestEmail,
          email_confirm: true,
          user_metadata: { name: guestName || payerName || "Invitado" }
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
    if (!payerName || payerName.trim().length < 3) {
      return new Response(
        JSON.stringify({ success: false, error: "Nombre del pagador requerido (mínimo 3 caracteres)." }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    if (!bankName) {
      return new Response(
        JSON.stringify({ success: false, error: "Banco/entidad de pago requerida." }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    if (!paymentDate) {
      return new Response(
        JSON.stringify({ success: false, error: "Fecha del pago requerida." }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const qty = quantity && Number(quantity) > 0 ? Math.floor(Number(quantity)) : 1;

    // 3. Verificar que el producto existe y está activo
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

    const planId = body.planId;
    let totalCop = 0;
    let totalUsd = 0;
    let selectedPlan = null;

    if (product.plans && Array.isArray(product.plans) && planId) {
      selectedPlan = product.plans.find((p: { id: string }) => p.id === planId);
    }

    const rate = exchangeRate && Number(exchangeRate) > 0 ? Number(exchangeRate) : 3700.0;

    if (selectedPlan) {
      const baseUsd = selectedPlan.price_cop || 0;
      if (selectedPlan.bulk_pricing) {
        const qtyStr = String(qty);
        if (selectedPlan.bulk_pricing[qtyStr] !== undefined) {
          totalUsd = selectedPlan.bulk_pricing[qtyStr];
          totalCop = Math.round(totalUsd * rate);
        } else if (selectedPlan.id === "pago-unico") {
          totalCop = qty * 60000;
          totalUsd = totalCop / rate;
        } else {
          totalUsd = baseUsd * qty;
          totalCop = Math.round(totalUsd * rate);
        }
      } else {
        totalUsd = baseUsd * qty;
        totalCop = Math.round(totalUsd * rate);
      }
    } else {
      if (!product.price_cop || product.price_cop <= 0) {
        return new Response(
          JSON.stringify({ success: false, error: "Este producto no tiene precio configurado." }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const baseUsd = product.price_cop || 0;
      totalUsd = baseUsd * qty;
      totalCop = Math.round(totalUsd * rate);
      if (product.slug === "mini-curso-git-github") {
        if (qty === 1) totalCop = 140000;
        else if (qty === 2) totalCop = 220000;
        else if (qty === 3) totalCop = 240000;
        else if (qty === 4) totalCop = 240000;
        else totalCop = qty * 60000;
        totalUsd = totalCop / rate;
      }
    }

    // 4. Crear la orden pendiente con status 'pending_nequi'
    let resolvedPaymentMethodId = paymentMethodId || null;
    if (!resolvedPaymentMethodId && (paymentMethodType || bankName)) {
      const pmType = paymentMethodType || (bankName === 'Nequi App' || bankName?.toLowerCase().includes('nequi') ? 'nequi' : 'bre_b');
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
        amount_usd: Number(totalUsd.toFixed(2)),
        points_used: 0,
        status: "pending_nequi",
        payment_type: "money",
        payment_method_id: resolvedPaymentMethodId,
        quantity: qty,
        // Datos declarados por el usuario para el matching posterior
        nequi_payer_declared: payerName.trim().toUpperCase(),
        nequi_bank_declared: bankName.trim(),
        nequi_date_declared: paymentDate,
        reference_note: selectedPlan ? `Plan: ${selectedPlan.name}` : null,
        plan_id: planId || null,
      })
      .select("id")
      .single();

    if (orderError || !order) {
      console.error("Error creando orden Nequi:", orderError);
      return new Response(
        JSON.stringify({ success: false, error: "Error al registrar la orden de pago." }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 4b. Buscar coincidencia retroactiva con algún email de Nequi sin asociar de las últimas 48 horas
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

          // Banco (40 pts)
          if (bankName && log.bank) {
            const bankA = normalizeBank(bankName);
            const bankB = normalizeBank(log.bank);
            if (bankA === bankB || bankA.includes(bankB) || bankB.includes(bankA)) {
              score += 0.40;
            }
          }

          // Nombre del pagador (40 pts) — fuzzy match
          if (payerName && log.payer) {
            const nameSim = similarityScore(payerName, log.payer);
            if (nameSim >= 0.80) {
              score += 0.40;
            } else if (nameSim >= 0.60) {
              score += 0.20;
            }
          }

          // Fecha (20 pts) — mismo día
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

        // Si la coincidencia es lo suficientemente alta (>= 0.75), auto-aprobar inmediatamente
        if (bestLog && bestScore >= 0.75) {
          console.log(`Coincidencia retroactiva encontrada: log ID ${bestLog.id} con score ${bestScore.toFixed(2)}`);

          // Intentar reclamar credenciales del pool
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
            // Fallback a credenciales estáticas
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

          // Aprobar la orden directamente
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
              admin_note: `Aprobado automáticamente por coincidencia retroactiva al crear la orden. Score: ${bestScore.toFixed(2)} | Referencia: ${bestLog.reference}`,
            })
            .eq("id", order.id);

          if (updateOrderError) {
            console.error("Error al aprobar orden por coincidencia retroactiva:", updateOrderError);
          } else {
            // Vincular el log del email
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

    // 5. Generar URL pre-firmada para que el frontend suba el comprobante a Storage
    //    El archivo se guarda en: nequi-comprobantes/{userId}/{order_id}.jpg
    const filePath = `${userId}/${order.id}.jpg`;
    const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
      .from("nequi-comprobantes")
      .createSignedUploadUrl(filePath, { upsert: true });

    if (uploadError || !uploadData) {
      console.error("Error generando URL de upload:", uploadError);
      // No falla la creación de la orden, solo no tendremos URL de comprobante
    }

    // 6. Guardar la URL pública del comprobante en la orden (para mostrar en admin)
    const comprobanteUrl = uploadData
      ? `${supabaseUrl}/storage/v1/object/public/nequi-comprobantes/${filePath}`
      : null;

    if (comprobanteUrl) {
      await supabaseAdmin
        .from("orders")
        .update({ receipt_url: comprobanteUrl })
        .eq("id", order.id);
    }

    console.log(`Orden Nequi creada: ${order.id} | Usuario: ${userId} | Producto: ${productId} | Pagador: ${payerName} | Banco: ${bankName} | Auto-aprobada retroactiva: ${alreadyApproved}`);

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
      JSON.stringify({ success: false, error: message }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
