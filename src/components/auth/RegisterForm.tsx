import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { m, AnimatePresence } from 'motion/react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../context/AuthContext';
import './RegisterForm.css';

import { verificarDominioCorreoValido } from '../../lib/emailValidator';

interface RegisterFormProps {
  defaultIsRegister?: boolean;
}

export function RegisterForm({ defaultIsRegister = true }: RegisterFormProps) {
  const navigate = useNavigate();
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

  // Por defecto Registro o lo especificado por prop
  const [isRegister, setIsRegister] = useState<boolean>(
    savedState?.isRegister !== undefined ? savedState.isRegister : defaultIsRegister
  );
  const [step, setStep] = useState<1 | 2 | 3>(savedState?.step || 1); // 1: Form, 2: OTP, 3: Success
  const [isLoading, setIsLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState(
    savedState ? 'Por favor introduce el código recibido.' : ''
  );
  const [statusType, setStatusType] = useState<'error' | 'success' | ''>(
    savedState ? 'success' : ''
  );

  // Sincronizar el estado interno si cambia el prop y no hay estado persistido
  useEffect(() => {
    if (savedState === null) {
      setIsRegister(defaultIsRegister);
    }
  }, [defaultIsRegister]);

  const { session, isSessionLoading } = useAuth();

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
      // No limpiar campos si el AuthProvider sigue cargando la sesión inicial (evita borrar savedState)
      if (isSessionLoading) return;

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
  }, [session, isSessionLoading]);

  // Redirección automática tras registro exitoso (Paso 3)
  useEffect(() => {
    if (step === 3) {
      const timer = setTimeout(() => {
        const pendingPlan = localStorage.getItem('jacko_trigger_checkout_slug');
        if (pendingPlan) {
          navigate('/checkout');
        } else {
          navigate('/dashboard');
        }
      }, 1500); // 1.5s de delay para una UX fluida
      return () => clearTimeout(timer);
    }
  }, [step, navigate]);

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
    const esDominioValido = await verificarDominioCorreoValido(dominio, email);
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
          emailRedirectTo: `${window.location.origin}/dashboard`,
          shouldCreateUser: isRegister,
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
      } else if (errMsg.toLowerCase().includes('signups not allowed for otp')) {
        errMsg =
          'No encontramos ninguna cuenta asociada a este correo. Verifica que esté bien escrito o regístrate en la pestaña de \'Registro\'.';
      }
      setStatusMsg(errMsg);
      setStatusType('error');
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
      setOtpCode(''); // Limpiar el código inválido por seguridad y para forzar nueva escritura
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
