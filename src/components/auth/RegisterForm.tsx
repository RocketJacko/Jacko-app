import { useState, useEffect } from 'react';
import { m, AnimatePresence } from 'motion/react';
import { supabase } from '../../lib/supabaseClient';
import { Turnstile } from './Turnstile';
import { useAuth } from '../../context/AuthContext';
import './RegisterForm.css';

interface GoogleDNSRecord {
  name: string;
  type: number;
  TTL: number;
  data: string;
}

// Helper para realizar peticiones fetch con límite de tiempo (timeout)
const fetchConTimeout = (url: string, timeoutMs = 2000): Promise<Response> => {
  return Promise.race([
    fetch(url),
    new Promise<Response>((_, reject) =>
      setTimeout(() => reject(new Error('Tiempo de espera agotado (Timeout)')), timeoutMs)
    ),
  ]);
};

// Función para comprobar si un dominio tiene registros de correo (MX) o registros de servidor (A)
const verificarDominioCorreoValido = async (domain: string): Promise<boolean> => {
  try {
    // 1. Consultar registros MX (Mail Exchange) usando el resolvedor DNS de Google con timeout de 2s
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
    console.warn('Error o Timeout al verificar registros DNS:', error);
    return true; // En caso de error de red o timeout, permitimos pasar
  }
};

export function RegisterForm() {
  // Cargar estado inicial persistido si existe
  const savedState = (() => {
    try {
      const saved = localStorage.getItem('jacko_register_pending');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.email && parsed.step === 2) {
          return parsed;
        }
      }
    } catch (e) {
      console.error('Error al parsear estado de registro guardado:', e);
    }
    return null;
  })();

  const [fullName, setFullName] = useState<string>(savedState?.fullName || '');
  const [email, setEmail] = useState<string>(savedState?.email || '');
  const [city, setCity] = useState<string>(savedState?.city || '');
  const [otpCode, setOtpCode] = useState('');

  // Por defecto Iniciar Sesión (false)
  const [isRegister, setIsRegister] = useState<boolean>(
    savedState?.isRegister !== undefined ? savedState.isRegister : false
  );
  const [step, setStep] = useState<1 | 2 | 3>(savedState?.step || 1); // 1: Form, 2: OTP, 3: Success
  const [isLoading, setIsLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState(
    savedState ? 'Por favor introduce el código recibido.' : ''
  );
  const [statusType, setStatusType] = useState<'error' | 'success' | ''>(
    savedState ? 'success' : ''
  );
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [turnstileKey, setTurnstileKey] = useState(0);

  const { session } = useAuth();

  useEffect(() => {
    let active = true;
    let resetTimer: ReturnType<typeof setTimeout> | null = null;
    if (session?.user) {
      // Sesión activa: ir al paso de éxito inmediatamente
      if (active) {
        const syncSession = async () => {
          await Promise.resolve();
          if (!active) return;
          setEmail(session.user.email || '');
          setStep(3);
        };
        syncSession();
        try {
          localStorage.removeItem('jacko_register_pending');
        } catch (e) {
          console.error(e);
        }
      }
    } else {
      // Sesión nula: esperar 600ms antes de resetear
      resetTimer = setTimeout(() => {
        if (!active) return;
        setEmail('');
        setStep(1);
        setFullName('');
        setCity('');
        setOtpCode('');
        setStatusMsg('');
        setStatusType('');
      }, 600);
    }
    return () => {
      active = false;
      if (resetTimer) clearTimeout(resetTimer);
    };
  }, [session]);

  const cardVariants = {
    hidden: { scale: 0.8, rotateY: -15, opacity: 0 },
    visible: {
      scale: 1,
      rotateY: 0,
      opacity: 1,
      transition: { duration: 0.8, ease: 'easeOut' },
    },
  } as const;

  // Paso 1: Enviar OTP al correo
  const handleRequestOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      setStatusMsg('Por favor introduce tu Email.');
      setStatusType('error');
      return;
    }
    if (isRegister && !fullName) {
      setStatusMsg('Por favor introduce tu Nombre Completo.');
      setStatusType('error');
      return;
    }
    if (!captchaToken) {
      setStatusMsg('Por favor verifica el CAPTCHA para continuar.');
      setStatusType('error');
      return;
    }

    const partesEmail = email.trim().split('@');
    if (partesEmail.length < 2) {
      setStatusMsg('Por favor introduce un correo válido.');
      setStatusType('error');
      return;
    }
    const dominio = partesEmail[1].toLowerCase();

    setIsLoading(true);
    setStatusMsg('Verificando correo...');
    setStatusType('success');

    // Validar si el dominio existe y tiene servidores de correo configurados (MX / A)
    const esDominioValido = await verificarDominioCorreoValido(dominio);
    if (!esDominioValido) {
      setStatusMsg('Correo inválido o inexistente.');
      setStatusType('error');
      setIsLoading(false);
      return;
    }

    setStatusMsg('Enviando código...');
    setStatusType('success');

    try {
      // Iniciar sesión con OTP de forma nativa en Supabase
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: {
          shouldCreateUser: true,
          captchaToken: captchaToken,
          data: isRegister
            ? {
                full_name: fullName.trim(),
                alias: fullName.trim(),
                city: city.trim(),
              }
            : undefined,
        },
      });

      if (error) {
        throw error;
      }

      // Guardar estado en localStorage
      try {
        localStorage.setItem(
          'jacko_register_pending',
          JSON.stringify({
            fullName: fullName.trim(),
            email: email.trim(),
            city: city.trim(),
            isRegister,
            step: 2,
          })
        );
      } catch (e) {
        console.error('Error al persistir el estado de registro:', e);
      }

      setStatusMsg('Código de verificación enviado al correo.');
      setStatusType('success');
      setStep(2);
    } catch (err: unknown) {
      console.error(err);
      let errMsg = err instanceof Error ? err.message : 'Ocurrió un error inesperado';
      if (errMsg.includes('Database error saving new user')) {
        errMsg =
          'No se permiten registros con correos temporales o se produjo un error de servidor. Por favor, verifica tu correo o intenta más tarde.';
      }
      setStatusMsg(errMsg);
      setStatusType('error');
      // Forzar el reinicio de Turnstile para generar un nuevo token
      setCaptchaToken(null);
      setTurnstileKey((prev) => prev + 1);
    } finally {
      setIsLoading(false);
    }
  };

  // Paso 2: Verificar OTP e iniciar sesión
  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otpCode || (otpCode.length !== 6 && otpCode.length !== 8)) {
      setStatusMsg('El código debe ser de 6 u 8 dígitos.');
      setStatusType('error');
      return;
    }
    setIsLoading(true);
    setStatusMsg('');
    setStatusType('');
    try {
      // Verificar OTP de forma nativa en Supabase
      const { data, error } = await supabase.auth.verifyOtp({
        email: email.trim(),
        token: otpCode.trim(),
        type: 'email',
      });

      if (error) {
        throw error;
      }

      // Actualizamos los datos del perfil si es registro
      if (isRegister && fullName.trim() && data.session?.user) {
        const { error: profileError } = await supabase
          .from('profiles')
          .update({
            full_name: fullName.trim(),
            alias: fullName.trim(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', data.session.user.id);
        if (profileError) {
          console.warn('No se pudo guardar el nombre en el perfil:', profileError.message);
        }
      }

      if (isRegister) {
        try {
          localStorage.setItem('jacko_just_registered', 'true');
        } catch (e) {
          console.error('Error guardando flag de registro:', e);
        }
      }

      // Limpiar estado persistido tras autenticación exitosa
      try {
        localStorage.removeItem('jacko_register_pending');
      } catch (e) {
        console.error(e);
      }
      setStatusMsg('¡Autenticado con éxito! Bienvenido a JACKO™.');
      setStatusType('success');
      setStep(3);
    } catch (err: unknown) {
      console.error(err);
      const errMsg = err instanceof Error ? err.message : 'Código inválido o expirado';
      setStatusMsg(errMsg);
      setStatusType('error');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="register-form-container">
      <div className="container">
        <m.div variants={cardVariants} initial="visible" className="register-card">
          <m.div
            animate={{ y: [0, -10, 0] }}
            transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
            className="jacko-tag"
          >
            JACKO™
          </m.div>
          <AnimatePresence mode="wait">
            {step === 1 && (
              <m.div
                key="step1"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ duration: 0.3 }}
              >
                <div className="auth-toggle-container">
                  <button
                    type="button"
                    className={`auth-toggle-btn${isRegister ? ' active' : ''}`}
                    onClick={() => {
                      setIsRegister(true);
                      setStatusMsg('');
                    }}
                    disabled={isLoading}
                  >
                    Registro
                  </button>
                  <button
                    type="button"
                    className={`auth-toggle-btn${!isRegister ? ' active' : ''}`}
                    onClick={() => {
                      setIsRegister(false);
                      setStatusMsg('');
                    }}
                    disabled={isLoading}
                  >
                    Iniciar Sesión
                  </button>
                </div>
                <h2>{isRegister ? 'Únete al movimiento' : 'Bienvenido de vuelta'}</h2>
                <p>
                  {isRegister
                    ? 'Registra tus datos para recibir acceso exclusivo a lanzamientos y eventos.'
                    : 'Ingresa tu email para recibir un código de acceso OTP.'}
                </p>
                <form onSubmit={handleRequestOtp} className="register-form">
                  {isRegister && (
                    <div className="form-group">
                      <label htmlFor="input-gen-ro5uj4">Nombre Completo</label>
                      <input
                        id="input-gen-ro5uj4"
                        aria-label="Nombre completo"
                        type="text"
                        placeholder="Ej. Juan Pérez"
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        required={isRegister}
                        disabled={isLoading}
                      />
                    </div>
                  )}
                  <div className="form-group">
                    <label htmlFor="input-gen-2sx3k0">Email</label>
                    <input
                      id="input-gen-2sx3k0"
                      aria-label="Email"
                      type="email"
                      placeholder="juan@ejemplo.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      disabled={isLoading}
                    />
                  </div>
                  {isRegister && (
                    <div className="form-group">
                      <label htmlFor="input-gen-xcatyj">Ciudad</label>
                      <input
                        id="input-gen-xcatyj"
                        aria-label="Ciudad"
                        type="text"
                        placeholder="Tu ciudad"
                        value={city}
                        onChange={(e) => setCity(e.target.value)}
                        disabled={isLoading}
                      />
                    </div>
                  )}
                  {/* Cloudflare Turnstile CAPTCHA */}
                  <div style={{ margin: '15px 0', display: 'flex', justifyContent: 'center' }}>
                    <Turnstile
                      key={turnstileKey}
                      sitekey={
                        import.meta.env.VITE_TURNSTILE_SITE_KEY || '1x00000000000000000000AA'
                      }
                      onSuccess={(token) => setCaptchaToken(token)}
                      onExpire={() => setCaptchaToken(null)}
                      onError={() => setCaptchaToken(null)}
                    />
                  </div>
                  {statusMsg && (
                    <div className={`form-status ${statusType}`}>
                      {statusMsg}
                    </div>
                  )}
                  <m.button
                    whileHover={
                      !isLoading
                        ? { scale: 1.05, boxShadow: '0 20px 40px rgba(212, 98, 26, 0.4)' }
                        : {}
                    }
                    whileTap={!isLoading ? { scale: 0.95 } : {}}
                    type="submit"
                    className="submit-btn"
                    disabled={isLoading}
                  >
                    {isLoading ? 'Enviando...' : isRegister ? 'Actívate Ya' : 'Enviar Código'}
                  </m.button>
                  <p className="form-note">
                    {isRegister
                      ? 'Al registrarte aceptas nuestros términos y políticas de privacidad.'
                      : 'Al ingresar aceptas nuestros términos y políticas de privacidad.'}
                  </p>
                </form>
              </m.div>
            )}
            {step === 2 && (
              <m.div
                key="step2"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ duration: 0.3 }}
              >
                <h2>Verifica tu cuenta</h2>
                <p>
                  Hemos enviado un código OTP a su correo <strong>{email}</strong>.
                </p>
                <form onSubmit={handleVerifyOtp} className="register-form">
                  <div className="form-group">
                    <label htmlFor="input-gen-ndmuid">Código OTP</label>
                    <input
                      id="input-gen-ndmuid"
                      aria-label="Código OTP"
                      className="otp-input"
                      type="text"
                      placeholder="Escribe el código recibido"
                      maxLength={8}
                      value={otpCode}
                      onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
                      required
                      disabled={isLoading}
                      autoFocus
                    />
                  </div>
                  {statusMsg && (
                    <div className={`form-status ${statusType}`}>
                      {statusMsg}
                    </div>
                  )}
                  <m.button
                    whileHover={
                      !isLoading
                        ? { scale: 1.05, boxShadow: '0 20px 40px rgba(212, 98, 26, 0.4)' }
                        : {}
                    }
                    whileTap={!isLoading ? { scale: 0.95 } : {}}
                    type="submit"
                    className="submit-btn"
                    disabled={isLoading}
                  >
                    {isLoading ? 'Verificando...' : 'Verificar Código'}
                  </m.button>
                  <button
                    type="button"
                    className="back-to-form-btn"
                    onClick={() => {
                      setStep(1);
                      setStatusMsg('');
                      setStatusType('');
                      try {
                        localStorage.removeItem('jacko_register_pending');
                      } catch (e) {
                        console.error(e);
                      }
                    }}
                    disabled={isLoading}
                  >
                    Volver al formulario
                  </button>
                </form>
              </m.div>
            )}
            {step === 3 && (
              <m.div
                key="step3"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.4 }}
                className="success-step-container"
              >
                <div className="success-step-icon">⚡</div>
                <h2>¡Ya eres parte de JACKO™!</h2>
                <p className="success-step-desc">
                  Te has registrado correctamente y tu sesión está activa.
                </p>
                <div className="session-active-badge">
                  Sesión iniciada como {email}
                </div>
              </m.div>
            )}
          </AnimatePresence>
        </m.div>
      </div>
    </div>
  );
}
