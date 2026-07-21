/* eslint-disable react-refresh/only-export-components */
import { useState, useEffect, useRef } from "react";
import { m } from "motion/react";
import { supabase } from "../../lib/supabaseClient";
import { invalidateCache } from "../../lib/queryCache";
import {
  Upload,
  Phone,
  Globe,
  RefreshCw,
  CheckCircle2,
  UserCircle2,
} from "lucide-react";
import { useGeoLocation } from "../../hooks/useGeoLocation";
import { BaseModal } from "../ui/BaseModal";
import "./ProfileCompletionModal.css";

// ─── Países con bandera, código ISO y prefijo telefónico ──────────────────────
export const COUNTRIES = [
  { code: 'CO', name: 'Colombia', dial: '+57', flag: '🇨🇴' },
  { code: 'MX', name: 'México', dial: '+52', flag: '🇲🇽' },
  { code: 'AR', name: 'Argentina', dial: '+54', flag: '🇦🇷' },
  { code: 'CL', name: 'Chile', dial: '+56', flag: '🇨🇱' },
  { code: 'PE', name: 'Perú', dial: '+51', flag: '🇵🇪' },
  { code: 'VE', name: 'Venezuela', dial: '+58', flag: '🇻🇪' },
  { code: 'EC', name: 'Ecuador', dial: '+593', flag: '🇪🇨' },
  { code: 'BO', name: 'Bolivia', dial: '+591', flag: '🇧🇴' },
  { code: 'PY', name: 'Paraguay', dial: '+595', flag: '🇵🇾' },
  { code: 'UY', name: 'Uruguay', dial: '+598', flag: '🇺🇾' },
  { code: 'BR', name: 'Brasil', dial: '+55', flag: '🇧🇷' },
  { code: 'PA', name: 'Panamá', dial: '+507', flag: '🇵🇦' },
  { code: 'CR', name: 'Costa Rica', dial: '+506', flag: '🇨🇷' },
  { code: 'GT', name: 'Guatemala', dial: '+502', flag: '🇬🇹' },
  { code: 'HN', name: 'Honduras', dial: '+504', flag: '🇬🇹' }, // corrected typo
  { code: 'SV', name: 'El Salvador', dial: '+503', flag: '🇸🇻' },
  { code: 'NI', name: 'Nicaragua', dial: '+505', flag: '🇳🇮' },
  { code: 'DO', name: 'Rep. Dominicana', dial: '+1809', flag: '🇩🇴' },
  { code: 'CU', name: 'Cuba', dial: '+53', flag: '🇨🇺' },
  { code: 'PR', name: 'Puerto Rico', dial: '+1787', flag: '🇵🇷' },
  { code: 'US', name: 'Estados Unidos', dial: '+1', flag: '🇺🇸' },
  { code: 'ES', name: 'España', dial: '+34', flag: '🇪🇸' },
  { code: 'CA', name: 'Canadá', dial: '+1', flag: '🇨🇦' },
  { code: 'GB', name: 'Reino Unido', dial: '+44', flag: '🇬🇧' },
  { code: 'DE', name: 'Alemania', dial: '+49', flag: '🇩🇪' },
  { code: 'FR', name: 'Francia', dial: '+33', flag: '🇫🇷' },
  { code: 'IT', name: 'Italia', dial: '+39', flag: '🇮🇹' },
  { code: 'PT', name: 'Portugal', dial: '+351', flag: '🇵🇹' },
  { code: 'AU', name: 'Australia', dial: '+61', flag: '🇦🇺' },
  { code: 'JP', name: 'Japón', dial: '+81', flag: '🇯🇵' },
];

// ─── Tipos ────────────────────────────────────────────────────────────────────
interface Props {
  userId: string;
  userEmail: string;
  onComplete: () => void;
}

const isProfileComplete = (p: Record<string, string | null | undefined>): boolean =>
  !!(
    p.full_name?.trim() &&
    p.alias?.trim() &&
    p.city?.trim() &&
    p.country_code?.trim() &&
    p.phone_number?.trim()
  );

// ─── Componente ───────────────────────────────────────────────────────────────
export function ProfileCompletionModal({ userId, userEmail, onComplete }: Props) {
  const [isChecking, setIsChecking] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Campos del formulario
  const [fullName, setFullName] = useState('');
  const [alias, setAlias] = useState('');
  const [city, setCity] = useState('');
  const [countryCode, setCountryCode] = useState('');
  const [dialCode, setDialCode] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');

  const avatarInputRef = useRef<HTMLInputElement>(null);

  const { detectedCountryCode, detectedCity, isLoading: isGeoLoading } = useGeoLocation();

  // Autodetectar y seleccionar el país y ciudad en base a IP si no hay datos persistidos
  useEffect(() => {
    if (!isGeoLoading) {
      if (!countryCode) {
        const finalCountry = detectedCountryCode || 'CO';
        setCountryCode(finalCountry);
        const country = COUNTRIES.find((c) => c.code === finalCountry);
        setDialCode(country?.dial ?? '+57');
      }
      if (!city) {
        setCity(detectedCity || 'Bogotá');
      }
    }
  }, [isGeoLoading, detectedCountryCode, detectedCity, countryCode, city]);

  // ── 1. Verificar perfil al montar ──────────────────────────────────────────
  useEffect(() => {
    let mounted = true;
    const check = async () => {
      try {
        const { data } = await supabase
          .from('profiles')
          .select('full_name, alias, city, country_code, dial_code, phone_number, avatar_url')
          .eq('id', userId)
          .maybeSingle();

        if (!mounted) return;
        if (data && isProfileComplete(data)) {
          onComplete(); // Ya está completo, pasar directo
          return;
        }

        // Pre-rellenar con datos existentes
        if (data) {
          setFullName(data.full_name ?? '');
          setAlias(data.alias ?? '');
          setCity(data.city ?? '');
          setCountryCode(data.country_code ?? '');
          setDialCode(data.dial_code ?? '');
          setPhoneNumber(data.phone_number ?? '');
          setAvatarUrl(data.avatar_url ?? '');
        }
      } catch (err) {
        console.error('[ProfileCompletionModal] Error checking profile:', err);
      } finally {
        if (mounted) setIsChecking(false);
      }
    };
    check();
    return () => {
      mounted = false;
    };
  }, [userId, onComplete]);


  // ── 3. Subir avatar al bucket ──────────────────────────────────────────────
  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!allowedTypes.includes(file.type)) {
      setErrorMsg('Solo se permiten imágenes JPG, PNG, WEBP o GIF.');
      return;
    }
    if (file.size > 3 * 1024 * 1024) {
      setErrorMsg('La imagen no debe superar 3 MB.');
      return;
    }

    setIsUploadingAvatar(true);
    setErrorMsg('');
    try {
      const ext = file.name.split('.').pop() ?? 'jpg';
      const path = `${userId}/avatar-${Date.now()}.${ext}`;

      const { error } = await supabase.storage
        .from('avatars')
        .upload(path, file, { upsert: true, contentType: file.type });
      if (error) throw error;

      const { data } = supabase.storage.from('avatars').getPublicUrl(path);
      setAvatarUrl(data.publicUrl);
    } catch (err) {
      setErrorMsg(
        'Error al subir la foto: ' + (err instanceof Error ? err.message : 'Desconocido')
      );
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  // ── 4. Guardar perfil ──────────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (!fullName.trim()) {
      setErrorMsg('El nombre completo es obligatorio.');
      return;
    }
    if (!alias.trim()) {
      setErrorMsg('El alias es obligatorio.');
      return;
    }
    if (!city.trim()) {
      setErrorMsg('La ciudad es obligatoria.');
      return;
    }
    if (!countryCode) {
      setErrorMsg('Selecciona tu país.');
      return;
    }
    if (!phoneNumber.trim()) {
      setErrorMsg('El número de WhatsApp es obligatorio.');
      return;
    }

    setIsSaving(true);
    try {
      // Validar si el número móvil ya está registrado en otra cuenta
      const { data: phoneExists, error: phoneCheckError } = await supabase.rpc(
        'check_phone_exists',
        {
          p_dial_code: dialCode,
          p_phone_number: phoneNumber.trim(),
          p_user_id: userId,
        }
      );

      if (phoneCheckError) {
        console.error('Error al verificar teléfono:', phoneCheckError);
      } else if (phoneExists) {
        setErrorMsg('Este número de celular/WhatsApp ya está registrado en otra cuenta.');
        setIsSaving(false);
        return;
      }

      const { error } = await supabase.from('profiles').upsert({
        full_name: fullName.trim(),
        alias: alias.trim(),
        city: city.trim(),
        country_code: countryCode,
        dial_code: dialCode,
        phone_number: phoneNumber.trim(),
        avatar_url: avatarUrl || null,
        updated_at: new Date().toISOString(),
      });

      if (error) throw error;

      invalidateCache('dashboard_data_' + userId);
      onComplete();
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : 'Error al guardar el perfil. Intenta de nuevo.'
      );
    } finally {
      setIsSaving(false);
    }
  };

  if (isChecking) return null;

  const selectedCountry = COUNTRIES.find((c) => c.code === countryCode);

  return (
    <BaseModal
      isOpen={true}
      onClose={() => {}}
      showCloseButton={false}
      isProcessing={isSaving}
      maxWidth="540px"
      ariaLabel="Completa tu perfil"
    >
      <m.div
        initial={{ scale: 0.88, opacity: 0, y: 40 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
        style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}
      >
        {/* Header */}
        <div className="custom-modal-header" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', width: '100%', gap: '8px' }}>
          <span className="brand-logo" style={{ fontSize: '0.7rem', fontWeight: 800, letterSpacing: '0.18em', color: '#b87c2a', background: 'rgba(184, 124, 42, 0.1)', border: '1px solid rgba(184, 124, 42, 0.25)', padding: '4px 14px', borderRadius: '999px', textTransform: 'uppercase' }}>JACKO™</span>
          <h4 className="custom-modal-title" style={{ fontSize: '1.5rem', fontWeight: 800 }}>Completa tu perfil</h4>
          <p style={{ fontSize: '0.9rem', color: '#5a4020', margin: 0, lineHeight: 1.5 }}>Para acceder a tu cuenta necesitamos unos datos básicos. Solo se hace una vez.</p>
          <div className="account-indicator" style={{ display: 'flex', gap: '6px', fontSize: '0.8rem', background: '#f5efe2', padding: '4px 10px', borderRadius: '8px', marginTop: '4px' }}>
            <span style={{ opacity: 0.6 }}>Cuenta:</span>
            <strong style={{ color: 'var(--brown-dark)' }}>{userEmail}</strong>
          </div>
        </div>

        <form onSubmit={handleSubmit} noValidate style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Avatar */}
          <div className="avatar-uploader-container" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
            <button
              type="button"
              className="avatar-btn"
              onClick={() => avatarInputRef.current?.click()}
              disabled={isUploadingAvatar}
              aria-label="Subir foto de perfil (opcional)"
            >
              {avatarUrl ? (
                <>
                  <img src={avatarUrl} alt="Avatar" />
                  <div className="avatar-hover-overlay">
                    {isUploadingAvatar ? <RefreshCw className="spin" size={20} /> : <Upload size={20} />}
                  </div>
                </>
              ) : (
                <div className="avatar-placeholder">
                  {isUploadingAvatar ? (
                    <RefreshCw className="spin" size={28} />
                  ) : (
                    <UserCircle2 size={40} strokeWidth={1.5} />
                  )}
                  <span>{isUploadingAvatar ? 'Subiendo…' : 'Subir foto'}</span>
                </div>
              )}
            </button>
            <input
              ref={avatarInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              style={{ display: 'none' }}
              onChange={handleAvatarUpload}
            />
            <p className="uploader-hint" style={{ fontSize: '0.75rem', opacity: 0.6, margin: 0 }}>Foto de perfil (opcional) · máx. 3 MB · JPG, PNG, WEBP</p>
          </div>

          {/* Nombre completo + Alias */}
          <div className="form-row-2col" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div className="custom-modal-field">
              <label htmlFor="pcm-fullname">
                Nombre completo <span className="required-star">*</span>
              </label>
              <input
                id="pcm-fullname"
                type="text"
                className="custom-modal-input"
                placeholder="Tu nombre real"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
              />
            </div>
            <div className="custom-modal-field">
              <label htmlFor="pcm-alias">
                Alias <span className="required-star">*</span>
              </label>
              <input
                id="pcm-alias"
                type="text"
                className="custom-modal-input"
                placeholder="Tu apodo en JACKO"
                value={alias}
                onChange={(e) => setAlias(e.target.value)}
                maxLength={30}
                required
              />
            </div>
          </div>



          {/* WhatsApp */}
          <div className="custom-modal-field">
            <label htmlFor="pcm-phone">
              <Phone size={13} style={{ marginRight: '4px', display: 'inline' }} /> WhatsApp <span className="required-star">*</span>
            </label>
            <div className="tel-input-wrapper" style={{ display: 'flex', gap: '8px' }}>
              <div className="tel-prefix-badge" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--beige-light)', border: '2px solid var(--beige-dark)', padding: '10px 14px', borderRadius: '16px', height: '44px', width: '56px' }}>
                {selectedCountry ? (
                  <img
                    src={`https://flagcdn.com/w40/${selectedCountry.code.toLowerCase()}.png`}
                    alt={selectedCountry.name}
                    style={{ width: '26px', height: 'auto', borderRadius: '3px', display: 'block', boxShadow: '0 1px 3px rgba(0,0,0,0.15)' }}
                  />
                ) : (
                  <Globe size={18} style={{ color: 'var(--brown-dark)' }} />
                )}
              </div>
              <input
                id="pcm-phone"
                type="tel"
                className="custom-modal-input"
                placeholder="Número sin prefijo"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value.replace(/[^\d\s\-()]/g, ''))}
                required
              />
            </div>
            <span className="field-hint" style={{ fontSize: '0.75rem', opacity: 0.6, display: 'block', marginTop: '2px' }}>El indicativo internacional se asocia automáticamente según tu país.</span>
          </div>

          {/* Error */}
          {errorMsg && (
            <m.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              className="error-msg-banner"
              style={{ padding: '10px 14px', background: 'rgba(239, 68, 68, 0.08)', border: '1.5px solid rgba(239, 68, 68, 0.3)', borderRadius: '12px', color: '#ef4444', fontSize: '0.85rem', fontWeight: 700 }}
            >
              {errorMsg}
            </m.div>
          )}

          {/* Submit */}
          <button type="submit" className="btn-modal-action primary" style={{ width: '100%', marginTop: '8px' }} disabled={isSaving || isUploadingAvatar}>
            {isSaving ? (
              <>
                <RefreshCw className="spin" size={16} style={{ marginRight: '6px' }} /> Guardando…
              </>
            ) : (
              <>
                <CheckCircle2 size={16} style={{ marginRight: '6px' }} /> Guardar y acceder
              </>
            )}
          </button>
          <p className="privacy-disclosure" style={{ textAlign: 'center', fontSize: '0.72rem', opacity: 0.5, margin: 0 }}>
            Esta información es privada y solo se usa para gestionar tu cuenta JACKO™.
          </p>
        </form>
      </m.div>
    </BaseModal>
  );
}
