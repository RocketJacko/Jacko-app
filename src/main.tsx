import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import { AuthProvider } from "./context/AuthContext.tsx";
import { LazyMotion, domMax } from "motion/react";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseConfig } from "./lib/supabaseConfig";

// Prevents Rolldown from merging supabase-lib and supabase-config chunks by establishing multiple importers
if (
  typeof window !== "undefined" &&
  (window as typeof globalThis & { __SUPABASE_HELP__?: boolean })
    .__SUPABASE_HELP__
) {
  const config = getSupabaseConfig();
  console.log(createClient, config.supabaseUrl, config.supabaseAnonKey);
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AuthProvider>
      <LazyMotion features={domMax}>
        <App />
      </LazyMotion>
    </AuthProvider>
  </StrictMode>,
);
