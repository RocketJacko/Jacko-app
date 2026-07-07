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
    // 1. Obtener y validar cabecera de Autorización
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Cabecera de autorización no encontrada." }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // 2. Inicializar cliente y obtener usuario
    const supabaseUser = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user: verifiedUser }, error: userError } = await supabaseUser.auth.getUser();
    if (userError || !verifiedUser) {
      return new Response(
        JSON.stringify({ error: "Sesión inválida o JWT expirado." }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const user = verifiedUser;

    // 3. Verificar que el usuario tenga la etiqueta de invitado (Guest Status)
    const { data: invitedRes, error: inviteError } = await supabaseUser.rpc("is_current_user_invited");
    if (inviteError) {
      console.error("Error al verificar estado de invitado:", inviteError);
      return new Response(
        JSON.stringify({ error: "Error de validación de estado de invitado." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!invitedRes) {
      return new Response(
        JSON.stringify({ error: "El usuario debe tener la etiqueta de invitado para asignar correos de este pool." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 4. Leer cuerpo de la petición
    const body = await req.json();
    const { order_id, user_id, plan_id } = body;

    if (!order_id) {
      return new Response(
        JSON.stringify({ error: "El ID de la orden (order_id) es obligatorio." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 5. Inicializar cliente administrador para realizar la asignación
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    // Verificar si es administrador para permitir especificar otro user_id
    const { data: isAdmin } = await supabaseAdmin.rpc("has_role", {
      _user_id: user.id,
      _role: "admin",
    });
    const { data: isSuperAdmin } = await supabaseAdmin.rpc("has_role", {
      _user_id: user.id,
      _role: "super_admin",
    });

    const targetUserId = (isAdmin || isSuperAdmin) ? (user_id || user.id) : user.id;

    // 6. Invocar función SQL transaccional para evitar condiciones de carrera (Race Conditions)
    const { data: assignmentResult, error: assignError } = await supabaseAdmin.rpc(
      "assign_pool_email_to_order_v2",
      {
        p_order_id: order_id,
        p_user_id: targetUserId,
        p_plan_id: plan_id || null,
      }
    );

    if (assignError) {
      console.error("Error al ejecutar assign_pool_email_to_order_v2:", assignError);
      return new Response(
        JSON.stringify({ error: "Error interno al asignar el correo del pool." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const assigned = !!assignmentResult;

    console.log(`[Edge Function] Asignación completada. Orden: ${order_id} | Usuario: ${targetUserId} | Plan: ${plan_id} | Resultado: ${assigned ? "Asignado con éxito" : "No asignado (pool vacío)"}`);

    return new Response(
      JSON.stringify({
        success: true,
        assigned,
        message: assigned ? "Correo del pool asignado correctamente." : "No hay correos disponibles en el pool para esta orden.",
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Error interno del servidor";
    console.error("Error inesperado en assign-pool-email:", err);
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
