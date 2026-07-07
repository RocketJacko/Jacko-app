import { useState, useEffect } from "react";
import { supabase } from "../../lib/supabaseClient";
import { Check, ChevronDown } from "lucide-react";
import { m, AnimatePresence } from "motion/react";
import { COUNTRIES } from "../modals/ProfileCompletionModal";
import "./ProfileView.css";
/* ── Tipo que coincide exactamente con la tabla profiles ── */ interface Profile {
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
interface Props {
  userId: string;
  userEmail: string;
}
/* ── Variantes de Animación ── */ const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.08, delayChildren: 0.05 },
  },
};
const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { type: "spring" as const, stiffness: 220, damping: 25 },
  },
};
export function ProfileView({ userId, userEmail }: Props) {
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
  /* ── Cargar perfil ── */ useEffect(() => {
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
  /* ── Calcular si hay cambios pendientes de guardar ── */ const hasChanges =
    profile
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
      /*  Validar si el teléfono cambió y si ya existe  */ const phoneChanged =
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
            "Este número de celular/WhatsApp ya está registrado en otra cuenta.",
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
  if (loading)
    return (
      <div>
        {" "}
        <div /> <p>Cargando perfil…</p>{" "}
      </div>
    );
  return (
    <m.div variants={containerVariants} initial="hidden" animate="visible">
      {" "}
      {/* ── Hero card ── */}{" "}
      <m.div variants={itemVariants} layout>
        {" "}
        <div>
          {" "}
          {profile?.avatar_url ? (
            <img src={profile.avatar_url} alt="Avatar" />
          ) : (
            <div>{avatarInitials}</div>
          )}{" "}
        </div>{" "}
        <div>
          {" "}
          <h1> {profile?.full_name || username} </h1>{" "}
          {profile?.alias && <span>@{profile.alias}</span>}{" "}
          <p>{userEmail}</p>{" "}
        </div>{" "}
      </m.div>{" "}
      {/* ── Secciones de datos ── */}{" "}
      <div>
        {" "}
        {/* Información personal */}{" "}
        <m.section variants={itemVariants} layout>
          {" "}
          <h2 onClick={() => setPersonalOpen(!personalOpen)}>
            {" "}
            <span> Información personal </span>{" "}
            <m.div
              animate={{ rotate: personalOpen ? 0 : -90 }}
              transition={{ duration: 0.2 }}
            >
              {" "}
              <ChevronDown size={16} />{" "}
            </m.div>{" "}
          </h2>{" "}
          <AnimatePresence initial={false}>
            {" "}
            {personalOpen && (
              <m.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                style={{ overflow: "hidden" }}
                transition={{ duration: 0.25, ease: "easeInOut" }}
              >
                {" "}
                <div style={{ paddingTop: "16px" }}>
                  {" "}
                  <div>
                    {" "}
                    <label htmlFor="input-gen-sco8xz">
                      Nombre completo
                    </label>{" "}
                    <input
                      id="input-gen-sco8xz"
                      aria-label="Control"
                      value={fields.full_name}
                      onChange={(e) =>
                        setFields((f) => ({ ...f, full_name: e.target.value }))
                      }
                      placeholder="Tu nombre completo"
                    />{" "}
                  </div>{" "}
                  <div>
                    {" "}
                    <label htmlFor="input-gen-kftdlv">Alias / apodo</label>{" "}
                    <input
                      id="input-gen-kftdlv"
                      aria-label="Control"
                      value={fields.alias}
                      onChange={(e) =>
                        setFields((f) => ({ ...f, alias: e.target.value }))
                      }
                      placeholder="@tuapodo"
                    />{" "}
                  </div>{" "}
                  <div>
                    {" "}
                    <label htmlFor="input-gen-354tmr">Email</label>{" "}
                    <p>{userEmail}</p>{" "}
                  </div>{" "}
                  <div>
                    {" "}
                    <label htmlFor="input-gen-ya4amz">
                      Teléfono / Celular (WhatsApp)
                    </label>{" "}
                    <div>
                      {" "}
                      <select
                        value={fields.country_code}
                        onChange={(e) => {
                          const code = e.target.value;
                          const country = COUNTRIES.find(
                            (c) => c.code === code,
                          );
                          setFields((f) => ({
                            ...f,
                            country_code: code,
                            dial_code: country?.dial ?? "",
                          }));
                        }}
                      >
                        {" "}
                        <option value="">🌎 +?</option>{" "}
                        {COUNTRIES.map((c) => (
                          <option key={c.code} value={c.code}>
                            {" "}
                            {c.flag} {c.name} ({c.dial}){" "}
                          </option>
                        ))}{" "}
                      </select>{" "}
                      <input
                        type="tel"
                        aria-label="Número de teléfono sin prefijo"
                        value={fields.phone_number}
                        onChange={(e) => {
                          const val = e.target.value.replace(
                            /[^\d\s\-()]/g,
                            "",
                          );
                          setFields((f) => ({ ...f, phone_number: val }));
                        }}
                        placeholder="Número sin prefijo"
                      />{" "}
                    </div>{" "}
                  </div>{" "}
                  <div>
                    {" "}
                    <label htmlFor="input-gen-1l71sh">Ciudad</label>{" "}
                    <input
                      id="input-gen-1l71sh"
                      aria-label="Control"
                      value={fields.city}
                      onChange={(e) =>
                        setFields((f) => ({ ...f, city: e.target.value }))
                      }
                      placeholder="Tu ciudad"
                    />{" "}
                  </div>{" "}
                  <div>
                    {" "}
                    <label htmlFor="input-gen-097bui">País</label>{" "}
                    <p>
                      {" "}
                      {COUNTRIES.find((c) => c.code === fields.country_code)
                        ?.name ||
                        fields.country_code || <em>No definido</em>}{" "}
                    </p>{" "}
                  </div>{" "}
                </div>{" "}
              </m.div>
            )}{" "}
          </AnimatePresence>{" "}
        </m.section>{" "}
        {/* Redes sociales */}{" "}
        <m.section variants={itemVariants} layout>
          {" "}
          <h2 onClick={() => setSocialOpen(!socialOpen)}>
            {" "}
            <span> Redes sociales </span>{" "}
            <m.div
              animate={{ rotate: socialOpen ? 0 : -90 }}
              transition={{ duration: 0.2 }}
            >
              {" "}
              <ChevronDown size={16} />{" "}
            </m.div>{" "}
          </h2>{" "}
          <AnimatePresence initial={false}>
            {" "}
            {socialOpen && (
              <m.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                style={{ overflow: "hidden" }}
                transition={{ duration: 0.25, ease: "easeInOut" }}
              >
                {" "}
                <div style={{ paddingTop: "16px" }}>
                  {" "}
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
                    <div key={key}>
                      {" "}
                      <label
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "8px",
                        }}
                      >
                        {" "}
                        {label}{" "}
                        {profile?.[key] && (
                          <a
                            href={profile[key]!}
                            target="_blank"
                            rel="noopener noreferrer"
                            title={`Ver ${label}`}
                          >
                            {" "}
                            Ver{" "}
                          </a>
                        )}{" "}
                      </label>{" "}
                      <input
                        aria-label="Control"
                        value={fields[key]}
                        onChange={(e) =>
                          setFields((f) => ({ ...f, [key]: e.target.value }))
                        }
                        placeholder={placeholder}
                        type="url"
                      />{" "}
                    </div>
                  ))}{" "}
                </div>{" "}
              </m.div>
            )}{" "}
          </AnimatePresence>{" "}
        </m.section>{" "}
      </div>{" "}
      {/* ── Botón de guardar al final ── */}{" "}
      <m.div variants={itemVariants} layout>
        {" "}
        {saveMsg && <span>{saveMsg}</span>}{" "}
        <m.button
          onClick={handleSave}
          disabled={saving || !hasChanges}
          whileHover={hasChanges && !saving ? { scale: 1.02 } : {}}
          whileTap={hasChanges && !saving ? { scale: 0.98 } : {}}
        >
          {" "}
          <Check size={15} /> {saving ? "Guardando…" : "Guardar cambios"}{" "}
        </m.button>{" "}
      </m.div>{" "}
    </m.div>
  );
}
