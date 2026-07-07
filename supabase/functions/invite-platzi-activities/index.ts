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
    // 1. Verificar sesión del administrador
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "No autorizado: Faltan credenciales de acceso." }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    
    // Cliente Supabase con los permisos del usuario para verificar su identidad
    const supabaseClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: "Sesión inválida o expirada. Por favor, inicia sesión de nuevo." }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Cliente admin para consultar roles de forma segura y escribir en las tablas protegidas
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // 2. Verificar rol en public.user_roles
    const { data: rolesData, error: rolesError } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id);

    if (rolesError) {
      console.error("Error al consultar roles de usuario:", rolesError);
      return new Response(
        JSON.stringify({ error: "Error de servidor al validar los permisos del usuario." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const isSuperAdmin = (rolesData || []).some(
      (r) => r.role === "super_admin"
    );

    if (!isSuperAdmin) {
      return new Response(
        JSON.stringify({ error: "Acceso denegado: Se requiere rol de super_admin." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Leer email del request body
    const { email } = await req.json();
    if (!email || !email.includes("@")) {
      return new Response(
        JSON.stringify({ error: "Email inválido o vacío." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const cleanEmail = email.trim().toLowerCase();

    // 4. Insertar/Actualizar correo en public.invited_users
    const { error: insertError } = await supabaseAdmin
      .from("invited_users")
      .upsert({ 
        email: cleanEmail, 
        created_at: new Date().toISOString(),
        invited_by: user?.email || "Sistema"
      });

    if (insertError) {
      console.error("Error al registrar invitado en base de datos:", insertError);
      return new Response(
        JSON.stringify({ error: `Error de base de datos: ${insertError.message}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 5. Enviar correo usando Resend
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    const siteUrl = Deno.env.get("SITE_URL") || "http://localhost:3000";

    if (!resendApiKey) {
      console.warn("RESEND_API_KEY no configurada. Registrando en base de datos y omitiendo envío de correo en modo prueba.");
      return new Response(
        JSON.stringify({ ok: true, testMode: true }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const resendResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${resendApiKey}`,
      },
      body: JSON.stringify({
        from: "JACKO™ <onboarding@resend.dev>",
        to: cleanEmail,
        subject: "¡Has sido invitado a JACKO™! - Acceso Exclusivo",
        html: `
          <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto; background: #0b0b1a; color: white; padding: 40px; border-radius: 12px;">
            <h2 style="text-align: center; color: #d4621a; letter-spacing: 2px; margin-bottom: 20px;">JACKO™</h2>
            <p style="font-size: 16px; color: #e2e8f0; line-height: 1.6; text-align: center;">
              ¡Felicidades! Has recibido una invitación exclusiva para acceder a actividades y productos especiales en la plataforma de <strong>JACKO™</strong>.
            </p>
            <div style="background: #1e1e3f; padding: 25px; border-radius: 8px; text-align: center; margin: 30px 0; border: 1px solid #d4621a;">
              <p style="font-size: 14px; color: #94a3b8; margin: 0 0 15px 0;">Tu correo electrónico ya ha sido habilitado para acceder:</p>
              <span style="font-size: 18px; font-weight: bold; color: #ffffff; display: block; margin-bottom: 20px;">${cleanEmail}</span>
              <a href="${siteUrl}/" style="display: inline-block; background: #d4621a; color: white; text-decoration: none; padding: 12px 24px; font-weight: bold; border-radius: 6px; transition: background 0.2s;">
                Ingresar a la Plataforma
              </a>
            </div>
            <p style="text-align: center; font-size: 12px; color: #64748b; margin-top: 20px;">
              Inicia sesión con tu correo para ver y canjear tus recompensas exclusivas automáticamente.
            </p>
          </div>
        `,
      }),
    });

    if (!resendResponse.ok) {
      const errorText = await resendResponse.text();
      console.error("Resend API error:", errorText);
      // Retornar ok: true ya que el registro en BD fue exitoso, pero con advertencia de correo
      return new Response(
        JSON.stringify({ ok: true, emailError: "El correo no se pudo enviar, pero el usuario fue invitado correctamente en la base de datos." }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 6. Registrar en logs de auditoría
    await supabaseAdmin.rpc("admin_log_action", {
      _action: "invite_user_platzi_activities",
      _target_table: "public.invited_users",
      _target_id: null,
      _payload: { email: cleanEmail }
    });

    return new Response(
      JSON.stringify({ ok: true }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (e: unknown) {
    console.error("Error inesperado en invite-platzi-activities:", e);
    const message = e instanceof Error ? e.message : String(e);
    return new Response(
      JSON.stringify({ error: `Error inesperado: ${message}` }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
