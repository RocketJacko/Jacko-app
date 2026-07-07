/**
 * nequi-gmail-webhook — Recibe push de Google Pub/Sub cuando llega email de Nequi
 *
 * Flujo:
 *  1. Google Pub/Sub envía POST con { message: { data: base64, messageId } }
 *  2. Decodificamos → obtenemos el emailAddress y historyId
 *  3. Consultamos Gmail API → obtenemos el email completo
 *  4. Verificamos remitente: notificaciones@nequi.com.co
 *  5. Parseamos los campos del cuerpo del email
 *  6. Algoritmo de matching contra órdenes 'pending_nequi'
 *  7. Aprobamos la orden si el score >= 0.75
 */

import { createClient } from "@supabase/supabase-js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ─────────────────────────────────────────────────────────────────────────────
// UTILIDADES
// ─────────────────────────────────────────────────────────────────────────────

/** Obtiene access_token de Google OAuth2 usando refresh_token */
async function getGoogleAccessToken(): Promise<string> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: Deno.env.get("GMAIL_CLIENT_ID")!,
      client_secret: Deno.env.get("GMAIL_CLIENT_SECRET")!,
      refresh_token: Deno.env.get("GMAIL_REFRESH_TOKEN")!,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) throw new Error(`OAuth2 error: ${await res.text()}`);
  const data = await res.json();
  return data.access_token;
}

/** Decodifica base64url a string UTF-8 */
function decodeBase64(b64: string): string {
  const standard = b64.replace(/-/g, "+").replace(/_/g, "/");
  return atob(standard);
}

/** Calcula la distancia de Levenshtein normalizada entre dos strings */
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

/** Normaliza el nombre de un banco para comparación */
function normalizeBank(bank: string): string {
  return bank
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")  // quita tildes
    .replace(/\s+/g, " ")
    .trim();
}

// ─────────────────────────────────────────────────────────────────────────────
// PARSER DEL EMAIL DE NEQUI
// ─────────────────────────────────────────────────────────────────────────────

interface NequiEmailData {
  amount: number | null;       // en pesos enteros, ej. 140000
  status: string | null;      // "Aprobada"
  emailDate: Date | null;    // fecha/hora del email de Nequi
  payer: string | null;
  bank: string | null;
  reference: string | null;
  transactionNumber: string | null;
  paymentMethod: string | null;
}

function parseNequiEmail(body: string): NequiEmailData {
  const clean = body.replace(/\r\n/g, "\n").replace(/\t/g, "\t");

  // Monto: "$ 140.000" o "$ 140.000,00"
  const montoMatch = clean.match(/Monto[:\s]+\$\s*([\d.,]+)/i);
  let amount: number | null = null;
  if (montoMatch) {
    const raw = montoMatch[1].replace(/\./g, "").replace(/,\d+$/, "");
    amount = parseInt(raw, 10);
  }

  // Estado: "Aprobada"
  const estadoMatch = clean.match(/Estado[:\s]+([^\n\r]+)/i);
  const status = estadoMatch ? estadoMatch[1].trim() : null;

  // Fecha: "30/05/2026 14:56:24"
  const fechaMatch = clean.match(/Fecha[:\s]+(\d{2}\/\d{2}\/\d{4})\s+(\d{2}:\d{2}:\d{2})/i);
  let emailDate: Date | null = null;
  if (fechaMatch) {
    const [, datePart, timePart] = fechaMatch;
    const [day, month, year] = datePart.split("/");
    // Colombia es UTC-5
    const isoStr = `${year}-${month}-${day}T${timePart}-05:00`;
    emailDate = new Date(isoStr);
  }

  // Pagador
  const pagadorMatch = clean.match(/Pagador[:\s]+([^\n\r]+)/i);
  const payer = pagadorMatch ? pagadorMatch[1].trim().toUpperCase() : null;

  // Banco
  const bancoMatch = clean.match(/Banco[:\s]+([^\n\r]+)/i);
  const bank = bancoMatch ? bancoMatch[1].trim() : null;

  // Referencia (Mxxxxxxxxxxx)
  const refMatch = clean.match(/Referencia[:\s]+([^\n\r]+)/i);
  const reference = refMatch ? refMatch[1].trim() : null;

  // Número de transacción
  const txnMatch = clean.match(/N[úu]mero de transacci[óo]n[:\s]+([^\n\r]+)/i);
  const transactionNumber = txnMatch ? txnMatch[1].trim() : null;

  // Método de pago
  const metodoMatch = clean.match(/M[ée]todo de pago[:\s]+([^\n\r]+)/i);
  const paymentMethod = metodoMatch ? metodoMatch[1].trim() : null;

  return { amount, status, emailDate, payer, bank, reference, transactionNumber, paymentMethod };
}

// ─────────────────────────────────────────────────────────────────────────────
// ALGORITMO DE MATCHING
// ─────────────────────────────────────────────────────────────────────────────

interface PendingOrder {
  id: string;
  amount_cop: number;
  nequi_payer_declared: string | null;
  nequi_bank_declared: string | null;
  nequi_date_declared: string | null;   // DATE string "2026-05-30"
  product_id: string;
  user_id: string;
  products: {
    credentials?: string | null;
    file_path?: string | null;
  } | {
    credentials?: string | null;
    file_path?: string | null;
  }[] | null;
}

interface MatchResult {
  order: PendingOrder | null;
  score: number;
  status: "auto_approved" | "pending_review" | "no_match";
}

function matchOrder(emailData: NequiEmailData, pendingOrders: PendingOrder[]): MatchResult {
  if (!emailData.amount || emailData.status?.toLowerCase() !== "aprobada") {
    return { order: null, score: 0, status: "no_match" };
  }

  let bestOrder: PendingOrder | null = null;
  let bestScore = 0;

  for (const order of pendingOrders) {
    // OBLIGATORIO: monto exacto
    if (order.amount_cop !== emailData.amount) continue;

    let score = 0;

    // Banco (40 pts)
    if (order.nequi_bank_declared && emailData.bank) {
      const bankA = normalizeBank(order.nequi_bank_declared);
      const bankB = normalizeBank(emailData.bank);
      if (bankA === bankB || bankA.includes(bankB) || bankB.includes(bankA)) {
        score += 0.40;
      }
    }

    // Nombre del pagador (40 pts) — fuzzy match
    if (order.nequi_payer_declared && emailData.payer) {
      const nameSim = similarityScore(order.nequi_payer_declared, emailData.payer);
      if (nameSim >= 0.80) {
        score += 0.40;
      } else if (nameSim >= 0.60) {
        score += 0.20; // match parcial
      }
    }

    // Fecha (20 pts) — mismo día
    if (order.nequi_date_declared && emailData.emailDate) {
      const emailDateStr = emailData.emailDate.toISOString().split("T")[0]; // "2026-05-30"
      if (order.nequi_date_declared === emailDateStr) {
        score += 0.20;
      }
    }

    console.log(`Order ${order.id}: score=${score.toFixed(3)} | banco=${order.nequi_bank_declared} vs ${emailData.bank} | pagador=${order.nequi_payer_declared} vs ${emailData.payer}`);

    if (score > bestScore) {
      bestScore = score;
      bestOrder = order;
    }
  }

  if (!bestOrder || bestScore === 0) {
    return { order: null, score: 0, status: "no_match" };
  }

  const status: "auto_approved" | "pending_review" | "no_match" =
    bestScore >= 0.75 ? "auto_approved" : "pending_review";

  return { order: bestOrder, score: bestScore, status };
}

// ─────────────────────────────────────────────────────────────────────────────
// HANDLER PRINCIPAL
// ─────────────────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

  try {
    // 1. Leer el mensaje de Google Pub/Sub
    const pubsubPayload = await req.json();
    console.log("Pub/Sub payload recibido:", JSON.stringify(pubsubPayload));

    const messageData = pubsubPayload?.message?.data;
    if (!messageData) {
      // Pub/Sub requiere 200 para confirmar recepción aunque ignoremos
      return new Response(JSON.stringify({ success: true, message: "No data" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. Decodificar el mensaje base64 → { emailAddress, historyId }
    const decoded = decodeBase64(messageData);
    const notification = JSON.parse(decoded);
    const historyId: string = notification.historyId;
    const gmailUser = Deno.env.get("GMAIL_USER_EMAIL") || "me";

    console.log(`Notificación Gmail: historyId=${historyId} | user=${gmailUser}`);

    // 3. Obtener access_token
    const accessToken = await getGoogleAccessToken();

    // 4. Obtener el historial de cambios recientes para encontrar el messageId
    const historyRes = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/${encodeURIComponent(gmailUser)}/history?startHistoryId=${historyId}&historyTypes=messageAdded`,
      { headers: { "Authorization": `Bearer ${accessToken}` } }
    );

    if (!historyRes.ok) {
      const historyErr = await historyRes.text();
      console.error("Error obteniendo history:", historyErr);
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    }

    const historyData = await historyRes.json();
    const histories = historyData.history || [];
    const messageIds: string[] = [];

    for (const h of histories) {
      for (const ma of (h.messagesAdded || [])) {
        if (ma.message?.id) messageIds.push(ma.message.id);
      }
    }

    if (messageIds.length === 0) {
      return new Response(JSON.stringify({ success: true, message: "No new messages" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 5. Procesar cada mensaje nuevo
    for (const msgId of messageIds) {
      // Verificar si ya procesamos este email (idempotencia)
      const { data: existing } = await supabaseAdmin
        .from("nequi_email_logs")
        .select("id")
        .eq("gmail_message_id", msgId)
        .maybeSingle();

      if (existing) {
        console.log(`Email ${msgId} ya procesado, ignorando.`);
        continue;
      }

      // Obtener el email completo
      const msgRes = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/${encodeURIComponent(gmailUser)}/messages/${msgId}?format=full`,
        { headers: { "Authorization": `Bearer ${accessToken}` } }
      );

      if (!msgRes.ok) {
        console.error(`Error obteniendo mensaje ${msgId}:`, await msgRes.text());
        continue;
      }

      const msgData = await msgRes.json();

      // Extraer cabeceras
      const headers = msgData.payload?.headers || [];
      const fromHeader = headers.find((h: { name: string }) => h.name.toLowerCase() === "from")?.value || "";
      const subjectHeader = headers.find((h: { name: string }) => h.name.toLowerCase() === "subject")?.value || "";

      // 6. Verificar remitente
      if (!fromHeader.includes("notificaciones@nequi.com.co")) {
        console.log(`Email ${msgId} ignorado: remitente no es Nequi (${fromHeader})`);
        continue;
      }

      // Verificar asunto
      if (!subjectHeader.toLowerCase().includes("venta exitosa")) {
        console.log(`Email ${msgId} ignorado: asunto no es 'venta exitosa' (${subjectHeader})`);
        continue;
      }

      // 7. Extraer el cuerpo del email
      let emailBody = "";
      const parts = msgData.payload?.parts || [];

      const extractBody = (p: { mimeType: string; body?: { data?: string }; parts?: unknown[] }): string => {
        if (p.mimeType === "text/plain" && p.body?.data) {
          return decodeBase64(p.body.data);
        }
        if (p.parts) {
          return (p.parts as typeof parts).map(extractBody).join("\n");
        }
        return "";
      };

      if (parts.length > 0) {
        emailBody = parts.map(extractBody).join("\n");
      } else if (msgData.payload?.body?.data) {
        emailBody = decodeBase64(msgData.payload.body.data);
      }

      console.log(`Cuerpo del email ${msgId}:\n${emailBody.substring(0, 500)}`);

      // 8. Parsear los campos del email de Nequi
      const emailData = parseNequiEmail(emailBody);
      console.log("Datos parseados del email:", JSON.stringify(emailData));

      // Si no hay monto o no está aprobada, guardamos el log y continuamos
      if (!emailData.amount) {
        await supabaseAdmin.from("nequi_email_logs").insert({
          gmail_message_id: msgId,
          email_subject: subjectHeader,
          email_from: fromHeader,
          amount: 0,
          status: emailData.status,
          raw_email_body: emailBody.substring(0, 5000),
          match_status: "no_match",
        });
        continue;
      }

      // 9. Buscar órdenes pendientes Nequi que coincidan en monto y fecha
      const emailDate = emailData.emailDate
        ? emailData.emailDate.toISOString().split("T")[0]
        : null;

      // Buscamos ±1 día por seguridad (zona horaria)
      let ordersQuery = supabaseAdmin
        .from("orders")
        .select(`
          id, amount_cop,
          nequi_payer_declared, nequi_bank_declared, nequi_date_declared,
          product_id, user_id,
          products ( credentials, file_path )
        `)
        .eq("status", "pending_nequi")
        .eq("amount_cop", emailData.amount);

      if (emailDate) {
        // Filtrar por fecha (misma fecha o día anterior por diferencia de zona horaria)
        ordersQuery = ordersQuery.gte("nequi_date_declared", emailDate)
          .lte("nequi_date_declared", emailDate);
      }

      const { data: pendingOrders, error: ordersError } = await ordersQuery;

      if (ordersError) {
        console.error("Error buscando órdenes pendientes:", ordersError);
      }

      const orders = (pendingOrders || []) as PendingOrder[];
      console.log(`Encontradas ${orders.length} órdenes pendientes con monto=${emailData.amount}`);

      // 10. Algoritmo de matching
      const { order: matchedOrder, score, status } = matchOrder(emailData, orders);

      // 11. Guardar el log del email
      const { data: logEntry } = await supabaseAdmin
        .from("nequi_email_logs")
        .insert({
          gmail_message_id: msgId,
          email_subject: subjectHeader,
          email_from: fromHeader,
          amount: emailData.amount,
          status: emailData.status,
          email_date: emailData.emailDate?.toISOString() || null,
          payer: emailData.payer,
          bank: emailData.bank,
          reference: emailData.reference,
          transaction_number: emailData.transactionNumber,
          payment_method: emailData.paymentMethod,
          matched_order_id: matchedOrder?.id || null,
          match_score: score,
          match_status: status,
          raw_email_body: emailBody.substring(0, 5000),
        })
        .select("id")
        .single();

      console.log(`Log guardado: ${logEntry?.id} | Match: ${status} | Score: ${score}`);

      // 12. Si auto_approved → aprobar la orden y entregar credenciales
      if (status === "auto_approved" && matchedOrder) {
        // Intentar entregar credenciales del pool
        let deliveredCredentials: string | null = null;

        const { data: claimedCreds, error: rpcError } = await supabaseAdmin
          .rpc("claim_product_credential_v2", {
            p_product_id: matchedOrder.product_id,
            p_order_id: matchedOrder.id,
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
          // Fallback a credenciales estáticas del producto
          const product = Array.isArray(matchedOrder.products)
            ? matchedOrder.products[0]
            : matchedOrder.products;
          deliveredCredentials = product?.credentials || null;
        }

        const product = Array.isArray(matchedOrder.products)
          ? matchedOrder.products[0]
          : matchedOrder.products;
        const deliveredFilePath = product?.file_path || null;

        // Aprobar la orden
        const { error: updateError } = await supabaseAdmin
          .from("orders")
          .update({
            status: "approved",
            approved_at: new Date().toISOString(),
            delivered_credentials: deliveredCredentials,
            delivered_file_path: deliveredFilePath,
            nequi_reference: emailData.reference,
            nequi_payer: emailData.payer,
            nequi_bank: emailData.bank,
            nequi_transaction_id: emailData.transactionNumber,
            nequi_payment_method: emailData.paymentMethod,
            nequi_match_score: score,
            nequi_match_status: status,
            admin_note: `Aprobado automáticamente por Gmail Webhook. Score: ${score.toFixed(2)} | Referencia: ${emailData.reference} | Pagador: ${emailData.payer}`,
          })
          .eq("id", matchedOrder.id);

        if (updateError) {
          console.error(`Error aprobando orden ${matchedOrder.id}:`, updateError);
        } else {
          console.log(`✅ Orden ${matchedOrder.id} aprobada automáticamente. Score: ${score.toFixed(2)}`);
        }
      }

      // 13. Si pending_review → marcar la orden para revisión manual
      if (status === "pending_review" && matchedOrder) {
        await supabaseAdmin
          .from("orders")
          .update({
            nequi_reference: emailData.reference,
            nequi_payer: emailData.payer,
            nequi_bank: emailData.bank,
            nequi_transaction_id: emailData.transactionNumber,
            nequi_match_score: score,
            nequi_match_status: "pending_review",
            admin_note: `Requiere revisión manual. Score: ${score.toFixed(2)} | Referencia: ${emailData.reference} | Pagador email: ${emailData.payer} | Pagador declarado: ${matchedOrder.nequi_payer_declared}`,
          })
          .eq("id", matchedOrder.id);

        console.log(`⚠️ Orden ${matchedOrder.id} marcada como pending_review. Score: ${score.toFixed(2)}`);
      }
    }

    // Confirmamos recepción a Google Pub/Sub
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Error interno";
    console.error("Error inesperado en nequi-gmail-webhook:", e);
    // Retornar 200 de todas formas para que Pub/Sub no reintente infinitamente
    return new Response(JSON.stringify({ error: message, success: false }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
