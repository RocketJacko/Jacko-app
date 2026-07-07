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
    const { email, code } = await req.json();

    if (!email || !code) {
      return new Response(
        JSON.stringify({ error: "Email y código son requeridos" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const cleanEmail = email.trim().toLowerCase();
    const cleanCode = code.trim();

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // 1. Verificar atómicamente el código OTP y controlar intentos fallidos vía RPC
    const { data: isValid, error: rpcError } = await supabaseAdmin
      .rpc("secure_verify_otp", {
        p_email: cleanEmail,
        p_code: cleanCode,
        p_max_attempts: 5,
      });

    if (rpcError) {
      console.error("Error al ejecutar secure_verify_otp:", rpcError);
      const isExceeded = rpcError.message?.includes("intentos fallidos") || 
                          rpcError.message?.includes("exceeded") ||
                          rpcError.details?.includes("otp_attempts_exceeded");
      return new Response(
        JSON.stringify({ 
          error: isExceeded 
            ? "Límite de intentos fallidos excedido. Código invalidado." 
            : "Error interno al verificar el código."
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!isValid) {
      console.warn("OTP incorrecto o expirado para:", cleanEmail);
      return new Response(
        JSON.stringify({ error: "Código inválido o expirado" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Obtener o crear el usuario en Supabase Auth
    let user;
    const { data: listData, error: listError } = await supabaseAdmin.auth.admin.listUsers({
      perPage: 1000
    });

    if (listError) {
      console.error("Error listing users:", listError);
      return new Response(
        JSON.stringify({ error: "Error al verificar la existencia del usuario" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const existingUser = listData?.users?.find(
      (u) => u.email?.toLowerCase() === cleanEmail
    );

    if (!existingUser) {
      // Crear nuevo usuario si no existe
      const { data: newUserData, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email: cleanEmail,
        email_confirm: true,
        user_metadata: { full_name: cleanEmail.split("@")[0] }
      });

      if (createError) {
        console.error("Error creating user:", createError);
        return new Response(
          JSON.stringify({ error: "Error al registrar el usuario en la autenticación" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      user = newUserData.user;
    } else {
      user = existingUser;
    }

    if (!user) {
      return new Response(
        JSON.stringify({ error: "No se pudo obtener o crear el usuario" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 4. Generar enlace de autenticación y verificarlo para obtener la sesión activa
    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: "magiclink",
      email: cleanEmail,
    });

    if (linkError || !linkData?.properties?.hashed_token) {
      console.error("Error generating magic link:", linkError);
      return new Response(
        JSON.stringify({ error: "Error al generar enlace de sesión" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: verifyData, error: verifyError } = await supabaseAdmin.auth.verifyOtp({
      token_hash: linkData.properties.hashed_token,
      type: "magiclink",
    });

    if (verifyError || !verifyData?.session) {
      console.error("Error verifying magic link token:", verifyError);
      return new Response(
        JSON.stringify({ error: "Error al verificar e iniciar sesión" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const authSessionData = verifyData;

    // 5. Retornar los datos de sesión al cliente
    return new Response(
      JSON.stringify({ ok: true, session: authSessionData.session }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("Unexpected error in verify-otp:", e);
    const errMsg = e instanceof Error ? `${e.name}: ${e.message}\n${e.stack}` : String(e);
    return new Response(
      JSON.stringify({ error: `Error inesperado del servidor: ${errMsg}` }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
