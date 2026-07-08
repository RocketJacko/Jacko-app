import { useState, useEffect, useRef } from "react";
import { supabase } from "../../lib/supabaseClient";
import { Check, ChevronDown, X, User, Plus } from "lucide-react";
import { m, AnimatePresence } from "motion/react";
import { COUNTRIES } from "../modals/ProfileCompletionModal";
import "./ProfileView.css";

/* ── Tipo que coincide exactamente con la tabla profiles ── */
interface Profile {
  id: string;
  full_name: string | null;
  alias: string | null;
  avatar_url: string | null;
  points: number;
  phone_number: string | null;
  dial_code: string | null;
  country_code: string | null;
  city: string | null;
  facebook_url: string | null;
  instagram_url: string | null;
  tiktok_url: string | null;
  linkedin_url: string | null;
  created_at: string;
  updated_at: string;
}

interface EditableFields {
  full_name: string;
  alias: string;
  phone_number: string;
  dial_code: string;
  country_code: string;
  city: string;
  facebook_url: string;
  instagram_url: string;
  tiktok_url: string;
  linkedin_url: string;
}

export interface ProfileViewProps {
  userId: string;
  userEmail: string;
  onClose: () => void;
}

/* ── Variantes de Animación ── */
const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.08, delayChildren: 0.05 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 15 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { type: "spring" as const, stiffness: 220, damping: 25 },
  },
};

export function ProfileView({ userId, userEmail, onClose }: ProfileViewProps) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [personalOpen, setPersonalOpen] = useState(true);
  const [socialOpen, setSocialOpen] = useState(true);
  const [fields, setFields] = useState<EditableFields>({
    full_name: "",
    alias: "",
    phone_number: "",
    dial_code: "",
    country_code: "",
    city: "",
    facebook_url: "",
    instagram_url: "",
    tiktok_url: "",
    linkedin_url: "",
  });

  const [isDialOpen, setIsDialOpen] = useState(false);
  const [dialSearch, setDialSearch] = useState("");
  const dialDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (dialDropdownRef.current && !dialDropdownRef.current.contains(e.target as Node)) {
        setIsDialOpen(false);
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  const filteredCountries = COUNTRIES.filter((c) =>
    c.name.toLowerCase().includes(dialSearch.toLowerCase()) ||
    c.dial.includes(dialSearch) ||
    c.code.toLowerCase().includes(dialSearch.toLowerCase())
  );
  const selectedCountry = COUNTRIES.find((c) => c.code === fields.country_code);

  /* ── Cargar perfil ── */
  useEffect(() => {
    if (!userId) return;
    let active = true;
    (async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .maybeSingle();

      if (!active) return;
      if (!error && data) {
        const p = data as Profile;
        setProfile(p);
        setFields({
          full_name: p.full_name ?? "",
          alias: p.alias ?? "",
          phone_number: p.phone_number ?? "",
          dial_code: p.dial_code ?? "",
          country_code: p.country_code ?? "",
          city: p.city ?? "",
          facebook_url: p.facebook_url ?? "",
          instagram_url: p.instagram_url ?? "",
          tiktok_url: p.tiktok_url ?? "",
          linkedin_url: p.linkedin_url ?? "",
        });
      }
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [userId]);

  const username = userEmail.split("@")[0];
  const avatarInitials = (profile?.full_name ?? username)
    .slice(0, 2)
    .toUpperCase();

  /* ── Calcular si hay cambios pendientes de guardar ── */
  const hasChanges = profile
    ? fields.full_name.trim() !== (profile.full_name ?? "") ||
      fields.alias.trim() !== (profile.alias ?? "") ||
      fields.city.trim() !== (profile.city ?? "") ||
      fields.phone_number.trim() !== (profile.phone_number ?? "") ||
      fields.dial_code.trim() !== (profile.dial_code ?? "") ||
      fields.country_code.trim() !== (profile.country_code ?? "") ||
      fields.facebook_url.trim() !== (profile.facebook_url ?? "") ||
      fields.instagram_url.trim() !== (profile.instagram_url ?? "") ||
      fields.tiktok_url.trim() !== (profile.tiktok_url ?? "") ||
      fields.linkedin_url.trim() !== (profile.linkedin_url ?? "")
    : false;

  const handleSave = async () => {
    if (!hasChanges) return;
    setSaving(true);
    setSaveMsg(null);
    try {
      /*  Validar si el teléfono cambió y si ya existe  */
      const phoneChanged =
        fields.phone_number.trim() !== (profile?.phone_number ?? "") ||
        fields.dial_code.trim() !== (profile?.dial_code ?? "");
      if (phoneChanged && fields.phone_number.trim()) {
        const { data: phoneExists, error: phoneCheckError } =
          await supabase.rpc("check_phone_exists", {
            p_dial_code: fields.dial_code,
            p_phone_number: fields.phone_number.trim(),
            p_user_id: userId,
          });
        if (phoneCheckError) {
          console.error("Error al verificar teléfono:", phoneCheckError);
        } else if (phoneExists) {
          setSaveMsg(
            "Este número de celular/WhatsApp ya está registrado en otra cuenta."
          );
          setSaving(false);
          return;
        }
      }

      const updatedFields = {
        full_name: fields.full_name.trim(),
        alias: fields.alias.trim(),
        city: fields.city.trim(),
        phone_number: fields.phone_number.trim() || null,
        dial_code: fields.dial_code || null,
        country_code: fields.country_code || null,
        facebook_url: fields.facebook_url.trim(),
        instagram_url: fields.instagram_url.trim(),
        tiktok_url: fields.tiktok_url.trim(),
        linkedin_url: fields.linkedin_url.trim(),
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase
        .from("profiles")
        .update(updatedFields)
        .eq("id", userId);
      if (error) throw error;

      setProfile((p) => (p ? { ...p, ...updatedFields } : p));
      setSaveMsg("Guardado ✓");
      setTimeout(() => setSaveMsg(null), 3000);
    } catch (err) {
      console.error(err);
      setSaveMsg("Error al guardar");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="pvm-overlay">
        <div className="pvm-card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '300px' }}>
          <div className="profile-loading">
            <div className="profile-spinner"></div>
            <p>Cargando perfil…</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="pvm-overlay" onClick={onClose}>
      <m.div 
        className="pvm-card" 
        onClick={(e) => e.stopPropagation()}
        variants={containerVariants} 
        initial="hidden" 
        animate="visible"
      >
        {/* Botón de cerrar */}
        <button type="button" className="pvm-close-btn" onClick={onClose} aria-label="Cerrar perfil">
          <X size={18} />
        </button>

        {/* Cabecera del Modal */}
        <div className="pvm-header">
          <h2 className="pvm-title">Mi Perfil</h2>
          <p className="pvm-subtitle">Gestiona tus datos personales y redes sociales conectadas.</p>
        </div>

        {/* ── Hero card ── */}
        <m.div className="profile-hero" variants={itemVariants} layout>
          <div className="profile-avatar-wrap">
            {profile?.avatar_url ? (
              <img src={profile.avatar_url} alt="Avatar" className="profile-avatar-img" />
            ) : (
              <div className="profile-avatar-initials">{avatarInitials}</div>
            )}
          </div>
          <div className="profile-hero-info">
            <h1 className="profile-display-name">{profile?.full_name || username}</h1>
            {profile?.alias && <span className="profile-alias">@{profile.alias}</span>}
            <p className="profile-email">{userEmail}</p>
          </div>
        </m.div>

        {/* ── Secciones de datos ── */}
        <div className="profile-sections">
          
          {/* Información personal */}
          <m.section className="profile-section" variants={itemVariants} layout>
            <h2 className="profile-section-title profile-section-title--collapsible" onClick={() => setPersonalOpen(!personalOpen)}>
              <span className="profile-section-title-left">
                <User size={16} />
                <span>Información personal</span>
              </span>
              <m.div
                className="profile-section-chevron"
                animate={{ rotate: personalOpen ? 0 : -90 }}
                transition={{ duration: 0.2 }}
              >
                <ChevronDown size={16} />
              </m.div>
            </h2>
            <AnimatePresence initial={false}>
              {personalOpen && (
                <m.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  style={{ overflow: "hidden" }}
                  transition={{ duration: 0.25, ease: "easeInOut" }}
                >
                  <div className="profile-fields" style={{ paddingTop: "16px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                    
                    <div className="profile-field">
                      <label htmlFor="input-full-name">Nombre completo</label>
                      <input
                        id="input-full-name"
                        className="profile-input"
                        value={fields.full_name}
                        onChange={(e) =>
                          setFields((f) => ({ ...f, full_name: e.target.value }))
                        }
                        placeholder="Tu nombre completo"
                      />
                    </div>

                    <div className="profile-field">
                      <label htmlFor="input-alias">Alias / apodo</label>
                      <input
                        id="input-alias"
                        className="profile-input"
                        value={fields.alias}
                        onChange={(e) =>
                          setFields((f) => ({ ...f, alias: e.target.value }))
                        }
                        placeholder="@tuapodo"
                      />
                    </div>

                    <div className="profile-field">
                      <label>Email</label>
                      <p className="profile-value profile-value--muted">{userEmail}</p>
                    </div>

                    <div className="profile-field">
                      <label>Teléfono / Celular (WhatsApp)</label>
                      <div className="profile-phone-row">
                        <div className="profile-dial-select-wrapper" ref={dialDropdownRef}>
                          <div className="profile-dial-trigger-wrap">
                            <input
                              type="text"
                              className="profile-input profile-dial-trigger-input"
                              placeholder="🌎 +?"
                              value={isDialOpen ? dialSearch : (selectedCountry ? `${selectedCountry.flag} ${selectedCountry.dial}` : '')}
                              onFocus={() => {
                                setIsDialOpen(true);
                                setDialSearch("");
                              }}
                              onChange={(e) => {
                                setDialSearch(e.target.value);
                              }}
                              aria-label="Prefijo de país"
                            />
                            <ChevronDown size={14} className={`profile-dial-chevron ${isDialOpen ? 'rotate' : ''}`} style={{ pointerEvents: 'none' }} />
                          </div>
                          {isDialOpen && (
                            <div className="profile-dial-dropdown">
                              <ul className="profile-dial-list">
                                {filteredCountries.map((c) => (
                                  <li
                                    key={c.code}
                                    className={`profile-dial-item ${fields.country_code === c.code ? 'active' : ''}`}
                                    onClick={() => {
                                      setFields((f) => ({
                                        ...f,
                                        country_code: c.code,
                                        dial_code: c.dial,
                                      }));
                                      setIsDialOpen(false);
                                      setDialSearch("");
                                    }}
                                  >
                                    <span className="profile-dial-flag">{c.flag}</span>
                                    <span className="profile-dial-country-name">{c.name}</span>
                                    <span className="profile-dial-code">{c.dial}</span>
                                  </li>
                                ))}
                                {filteredCountries.length === 0 && (
                                  <li className="profile-dial-no-results">
                                    No se encontraron resultados
                                  </li>
                                )}
                              </ul>
                            </div>
                          )}
                        </div>
                        <input
                          type="tel"
                          className="profile-input"
                          aria-label="Número de teléfono sin prefijo"
                          value={fields.phone_number}
                          onChange={(e) => {
                            const val = e.target.value.replace(/[^\d\s\-()]/g, "");
                            setFields((f) => ({ ...f, phone_number: val }));
                          }}
                          placeholder="Número sin prefijo"
                        />
                      </div>
                    </div>

                    <div className="profile-field">
                      <label htmlFor="input-city">Ciudad</label>
                      <input
                        id="input-city"
                        className="profile-input"
                        value={fields.city}
                        onChange={(e) =>
                          setFields((f) => ({ ...f, city: e.target.value }))
                        }
                        placeholder="Tu ciudad"
                      />
                    </div>

                    <div className="profile-field">
                      <label>País</label>
                      <p className="profile-value">
                        {COUNTRIES.find((c) => c.code === fields.country_code)?.name ||
                          fields.country_code || <em>No definido</em>}
                      </p>
                    </div>

                  </div>
                </m.div>
              )}
            </AnimatePresence>
          </m.section>

          {/* Redes sociales */}
          <m.section className="profile-section" variants={itemVariants} layout>
            <h2 className="profile-section-title profile-section-title--collapsible" onClick={() => setSocialOpen(!socialOpen)}>
              <span className="profile-section-title-left">
                <Plus size={16} />
                <span>Redes sociales</span>
              </span>
              <m.div
                className="profile-section-chevron"
                animate={{ rotate: socialOpen ? 0 : -90 }}
                transition={{ duration: 0.2 }}
              >
                <ChevronDown size={16} />
              </m.div>
            </h2>
            <AnimatePresence initial={false}>
              {socialOpen && (
                <m.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  style={{ overflow: "hidden" }}
                  transition={{ duration: 0.25, ease: "easeInOut" }}
                >
                  <div className="profile-fields" style={{ paddingTop: "16px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                    {(
                      [
                        {
                          key: "instagram_url" as const,
                          label: "Instagram",
                          placeholder: "https://instagram.com/tu_usuario",
                        },
                        {
                          key: "tiktok_url" as const,
                          label: "TikTok",
                          placeholder: "https://tiktok.com/@tu_usuario",
                        },
                        {
                          key: "facebook_url" as const,
                          label: "Facebook",
                          placeholder: "https://facebook.com/tu_usuario",
                        },
                        {
                          key: "linkedin_url" as const,
                          label: "LinkedIn",
                          placeholder: "https://linkedin.com/in/tu_perfil",
                        },
                      ] as const
                    ).map(({ key, label, placeholder }) => (
                      <div key={key} className="profile-field">
                        <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span>{label}</span>
                          {profile?.[key] && (
                            <a
                              href={profile[key]!}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="profile-social-link"
                              title={`Ver ${label}`}
                            >
                              Ver enlace ↗
                            </a>
                          )}
                        </label>
                        <input
                          className="profile-input"
                          aria-label={label}
                          value={fields[key]}
                          onChange={(e) =>
                            setFields((f) => ({ ...f, [key]: e.target.value }))
                          }
                          placeholder={placeholder}
                          type="url"
                        />
                      </div>
                    ))}
                  </div>
                </m.div>
              )}
            </AnimatePresence>
          </m.section>

        </div>

        {/* ── Botón de guardar al final ── */}
        <m.div className="profile-footer-actions" variants={itemVariants} layout>
          {saveMsg && <span className="profile-save-msg">{saveMsg}</span>}
          <m.button
            className="btn-profile-save"
            onClick={handleSave}
            disabled={saving || !hasChanges}
            whileHover={hasChanges && !saving ? { scale: 1.02 } : {}}
            whileTap={hasChanges && !saving ? { scale: 0.98 } : {}}
          >
            <Check size={15} /> {saving ? "Guardando…" : "Guardar cambios"}
          </m.button>
        </m.div>

      </m.div>
    </div>
  );
}
