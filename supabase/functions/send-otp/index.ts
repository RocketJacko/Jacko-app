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
    const { email } = await req.json();

    if (!email || !email.includes("@")) {
      return new Response(
        JSON.stringify({ error: "Email inválido" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // 1. Generar código de 6 dígitos
    const code = Math.floor(100000 + Math.random() * 900000).toString();

    // 2. Guardarlo en la base de datos
    const { error: insertError } = await supabaseAdmin
      .from("otp_sessions")
      .insert({
        email: email.trim().toLowerCase(),
        code,
        created_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 10 * 60000).toISOString(), // 10 minutos
      });

    if (insertError) {
      console.error("Error inserting OTP:", insertError);
      return new Response(
        JSON.stringify({ error: "Error al generar el código en la base de datos" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[OTP] Código generado para ${email}: ${code}`);

    const resendApiKey = Deno.env.get("RESEND_API_KEY");

    // Si no hay API Key de Resend, devolvemos el código para pruebas locales
    if (!resendApiKey) {
      console.warn("RESEND_API_KEY no configurada. Retornando código en la respuesta para modo prueba.");
      return new Response(
        JSON.stringify({ ok: true, testMode: true, code }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Enviar con Resend
    const resendResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${resendApiKey}`,
      },
      body: JSON.stringify({
        from: "JACKO™ <onboarding@resend.dev>",
        to: email,
        subject: "Tu código de acceso - JACKO™",
        html: `
          <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto; background: #0b0b1a; color: white; padding: 40px; border-radius: 12px;">
            <h2 style="text-align: center; color: #d4621a; letter-spacing: 2px;">JACKO™</h2>
            <p style="text-align: center; font-size: 16px; color: #94a3b8;">Usa el siguiente código para iniciar sesión en la plataforma:</p>
            <div style="background: #1e1e3f; padding: 20px; border-radius: 8px; text-align: center; margin: 30px 0; border: 1px solid #d4621a;">
              <span style="font-size: 32px; font-weight: bold; letter-spacing: 6px; color: #ffffff;">${code}</span>
            </div>
            <p style="text-align: center; font-size: 14px; color: #64748b;">Este código expira en 10 minutos y es válido para un solo uso.</p>
          </div>
        `,
      }),
    });

    if (!resendResponse.ok) {
      const errorText = await resendResponse.text();
      console.error("Resend API error:", errorText);
      return new Response(
        JSON.stringify({ error: "Error al enviar el correo con Resend" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ ok: true }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("Unexpected error in send-otp:", e);
    return new Response(
      JSON.stringify({ error: "Error inesperado del servidor" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
