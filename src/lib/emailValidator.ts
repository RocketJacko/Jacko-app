import { supabase } from './supabaseClient';

interface GoogleDNSRecord {
  name: string;
  type: number;
  TTL: number;
  data: string;
}

const fetchConTimeout = (url: string, timeoutMs = 2000): Promise<Response> => {
  return Promise.race([
    fetch(url),
    new Promise<Response>((_, reject) =>
      setTimeout(() => reject(new Error('Tiempo de espera agotado (Timeout)')), timeoutMs)
    ),
  ]);
};

/**
 * Comprueba si un dominio tiene registros de correo (MX) o registros de servidor (A)
 * utilizando el resolvedor DNS de Google. Retorna true si es válido o si la API falla,
 * y false si el dominio es inexistente (Status 3 NXDOMAIN) o no tiene registros de correo.
 * También verifica primero contra la base de datos de dominios bloqueados en Supabase.
 */
export const verificarDominioCorreoValido = async (domain: string, fullEmail?: string): Promise<boolean> => {
  try {
    // 1. Validar primero contra la base de datos de correos bloqueados (RPC SECURITY DEFINER)
    const emailToCheck = fullEmail || `test@${domain}`;
    const { data: isAllowed, error } = await supabase.rpc('check_email_allowed', {
      p_email: emailToCheck,
    });

    if (error) {
      console.warn('[emailValidator] Error al consultar check_email_allowed en DB:', error);
    } else if (isAllowed === false) {
      return false; // Dominio/Correo bloqueado en base de datos
    }

    // 2. Consultar registros MX (Mail Exchange)
    const responseMX = await fetchConTimeout(
      `https://dns.google/resolve?name=${encodeURIComponent(domain)}&type=MX`,
      2000
    );
    if (!responseMX.ok) return true; // Si la API falla, permitimos por defecto
    const dataMX = await responseMX.json();

    // Status 3 significa NXDOMAIN (el dominio no existe en Internet)
    if (dataMX.Status === 3) {
      return false;
    }

    // Si tiene registros MX en el Answer, es un dominio de correo válido
    if (dataMX.Answer && Array.isArray(dataMX.Answer)) {
      const tieneMX = dataMX.Answer.some((record: GoogleDNSRecord) => record.type === 15);
      if (tieneMX) return true;
    }

    // 2. Si no tiene registros MX, verificar si al menos tiene un registro A (IP del servidor)
    const responseA = await fetchConTimeout(
      `https://dns.google/resolve?name=${encodeURIComponent(domain)}&type=A`,
      2000
    );
    if (!responseA.ok) return true;
    const dataA = await responseA.json();
    if (dataA.Status === 3) {
      return false;
    }
    if (dataA.Answer && Array.isArray(dataA.Answer)) {
      const tieneA = dataA.Answer.some((record: GoogleDNSRecord) => record.type === 1); // Tipo 1 es Registro A
      if (tieneA) return true;
    }
    return false;
  } catch (error) {
    console.warn('[emailValidator] Error o Timeout al verificar registros DNS:', error);
    return true; // En caso de error de red o timeout, permitimos pasar por seguridad
  }
};

/**
 * Valida la estructura básica sintáctica de un correo electrónico.
 */
export const validarEstructuraEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email.trim());
};
