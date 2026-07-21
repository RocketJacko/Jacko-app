import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { DashboardView } from "../components/views/DashboardView";

interface DashboardPageProps {
  activeTab?: 'panel' | 'history' | 'activities';
  setActiveTab?: (tab: 'panel' | 'history' | 'activities') => void;
}

export function DashboardPage({ activeTab, setActiveTab }: DashboardPageProps) {
  const { session } = useAuth();
  const navigate = useNavigate();
  const [localTab, setLocalTab] = useState<'panel' | 'history' | 'activities'>('panel');

  const currentTab = activeTab || localTab;
  const changeTab = setActiveTab || setLocalTab;

  if (!session) return null;

  return (
    <DashboardView
      userId={session.user.id}
      userEmail={session.user.email || ""}
      onNavigateToCatalog={() => navigate("/catalogo")}
      activeTab={currentTab}
      setActiveTab={changeTab}
    />
  );
}
export default DashboardPage;
