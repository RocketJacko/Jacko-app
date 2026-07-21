import { useState, useEffect, useCallback } from 'react';
import { m, AnimatePresence } from 'motion/react';
import {
  Calendar,
  ChevronDown,
  ChevronUp,
  Check,
  Clock,
  AlertCircle,
  HelpCircle,
  Trophy
} from 'lucide-react';
import { activitiesService, type UserActivity, getActiveTaskLink } from '../../../services/activitiesService';
import { supabase } from '../../../lib/supabaseClient';
import { TaskRowItem } from './components/TaskRowItem';
import { ValidationModal } from './components/ValidationModal';
import { CustomAlertModal } from './components/CustomAlertModal';
import { CompletionsModal } from './components/CompletionsModal';
import './ActivitiesDashboard.css';

interface Props {
  userId: string;
}

export function ActivitiesDashboard({ userId }: Props) {
  const [activities, setActivities] = useState<UserActivity[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [expandedCards, setExpandedCards] = useState<Record<string, boolean>>({});
  const [taskInputs, setTaskInputs] = useState<Record<string, string>>({});
  const [clickedButtons, setClickedButtons] = useState<Record<string, boolean>>({});
  const [togglingTaskId, setTogglingTaskId] = useState<string | null>(null);

  // Custom Modals and Toast states
  const [modalType, setModalType] = useState<'alert' | 'validation' | 'completions' | null>(null);
  const [modalTitle, setModalTitle] = useState('');
  const [modalMessage, setModalMessage] = useState('');
  const [activeTaskObject, setActiveTaskObject] = useState<{ activity: UserActivity; task: UserActivity['tasks'][0]; currentCompleted: boolean } | null>(null);
  const [modalEmail, setModalEmail] = useState('');
  const [modalEmailError, setModalEmailError] = useState('');
  const [selectedCompletionsTask, setSelectedCompletionsTask] = useState<UserActivity['tasks'][0] | null>(null);

  const showCustomAlert = (title: string, message: string) => {
    setModalTitle(title);
    setModalMessage(message);
    setModalType('alert');
  };

  const fetchActivities = useCallback(async (silent = false) => {
    if (!silent) setIsLoading(true);
    setErrorMsg('');
    try {
      const data = await activitiesService.getUserActivities(userId);
      setActivities(data);

      // Populate task inputs state from backend values
      const initialInputs: Record<string, string> = {};
      data.forEach(act => {
        act.tasks.forEach(t => {
          if (t.input_placeholder && t.input_value) {
            initialInputs[t.id] = t.input_value;
          }
        });
      });
      setTaskInputs(prev => ({ ...initialInputs, ...prev }));

      // Auto expand the first active card if expand state is empty using functional state update
      setExpandedCards(prev => {
        if (Object.keys(prev).length === 0 && data.length > 0) {
          const firstActive = data.find(act => act.status === 'active');
          if (firstActive) {
            return { [firstActive.id]: true };
          } else {
            return { [data[0].id]: true };
          }
        }
        return prev;
      });
    } catch (err: unknown) {
      console.error(err);
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMsg('No se pudieron cargar los desafíos: ' + msg);
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    let active = true;
    const load = async () => {
      await Promise.resolve();
      if (active) {
        fetchActivities();
      }
    };
    load();
    return () => {
      active = false;
    };
  }, [fetchActivities]);

  useEffect(() => {
    const channel = supabase
      .channel(`activities-dashboard-realtime-${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'user_completed_tasks',
          filter: `user_id=eq.${userId}`
        },
        () => {
          fetchActivities(true); // Refrescar silenciosamente
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'user_task_validations',
          filter: `user_id=eq.${userId}`
        },
        () => {
          fetchActivities(true); // Refrescar silenciosamente
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, fetchActivities]);

  const toggleExpand = (activityId: string) => {
    setExpandedCards(prev => ({
      ...prev,
      [activityId]: !prev[activityId]
    }));
  };

  const handleToggleTask = async (activity: UserActivity, task: UserActivity['tasks'][0], currentCompleted: boolean) => {
    if (activity.status !== 'active') return; // Read-only unless active

    if (currentCompleted) {
      // Check if subsequent tasks are completed
      const isUncheckLocked = activity.tasks
        .filter(t => t.sort_order > task.sort_order)
        .some(t => t.is_completed);
      if (isUncheckLocked) {
        showCustomAlert('Tarea bloqueada', 'No puedes desmarcar esta tarea porque ya has completado tareas posteriores.');
        return;
      }

      // Normal unchecking
      setTogglingTaskId(task.id);
      try {
        await activitiesService.toggleTaskCompletion(userId, task.id, !currentCompleted, null);
        await fetchActivities(true);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        showCustomAlert('Error', 'Error al actualizar tarea: ' + msg);
      } finally {
        setTogglingTaskId(null);
      }
    } else {
      // Check if prior tasks are incomplete
      const isLocked = activity.tasks
        .filter(t => t.sort_order < task.sort_order)
        .some(t => !t.is_completed);
      if (isLocked) {
        showCustomAlert('Tarea bloqueada', 'Debes completar las tareas anteriores antes de poder completar esta tarea.');
        return;
      }
      const activeLink = getActiveTaskLink(task);

      // Check if button must be clicked first
      if (activeLink && !clickedButtons[task.id]) {
        showCustomAlert('Falta enlace', `Debes hacer clic en el botón "${activeLink.label || 'Ir al enlace'}" antes de poder marcar esta tarea.`);
        return;
      }

      // Prompt confirmation and email input if redirect task
      if (activeLink) {
        setActiveTaskObject({ activity, task, currentCompleted });
        setModalEmail('');
        setModalEmailError('');
        setModalType('validation');
        return;
      }

      const inputValue = taskInputs[task.id] || '';
      if (task.input_placeholder && !inputValue.trim()) {
        showCustomAlert('Entrada requerida', 'Por favor ingresa la información requerida antes de completar la tarea.');
        return;
      }

      setTogglingTaskId(task.id);
      try {
        await activitiesService.toggleTaskCompletion(userId, task.id, !currentCompleted, task.input_placeholder ? inputValue.trim() : null);
        await fetchActivities(true);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        showCustomAlert('Error', 'Error al actualizar tarea: ' + msg);
      } finally {
        setTogglingTaskId(null);
      }
    }
  };

  const handleConfirmValidation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeTaskObject) return;
    const { task } = activeTaskObject;

    setModalEmailError('');

    if (!modalEmail.trim()) {
      setModalEmailError('Debes ingresar un correo electrónico.');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(modalEmail.trim())) {
      setModalEmailError('Por favor ingresa un correo electrónico válido.');
      return;
    }

    setTogglingTaskId(task.id);
    try {
      await activitiesService.requestTaskValidation(userId, task.id, modalEmail.trim());
      // Si la inserción en 'pending' fue exitosa, cerramos el modal
      setModalType(null);
      await fetchActivities(true);
      setActiveTaskObject(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      // Mantener modal abierto y mostrar el error específico directamente abajo del input
      setModalEmailError(msg);
    } finally {
      setTogglingTaskId(null);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <span className="badge-status active"><Clock size={12} /> Activa</span>;
      case 'next':
        return <span className="badge-status next"><Calendar size={12} /> Próxima</span>;
      case 'finished':
        return <span className="badge-status finished"><Check size={12} /> Finalizada</span>;
      default:
        return <span className="badge-status finished"><HelpCircle size={12} /> Desconocido</span>;
    }
  };



  if (isLoading) {
    return (
      <div style={{ textAlign: 'center', padding: '3rem' }}>
        <div className="loading-spinner" style={{ margin: '0 auto 1rem auto' }} />
        <p style={{ opacity: 0.7 }}>Cargando tus desafíos interactivos...</p>
      </div>
    );
  }

  if (errorMsg) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', color: '#b91c1c', background: '#fef2f2', borderRadius: '20px' }}>
        <AlertCircle size={32} style={{ margin: '0 auto 12px auto' }} />
        <p>{errorMsg}</p>
        <button type="button" className="btn-admin-secondary" onClick={() => fetchActivities()}>
          Intentar de nuevo
        </button>
      </div>
    );
  }

  if (activities.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '4rem 2rem', background: '#faf6f0', borderRadius: '24px', border: '1.5px dashed var(--beige-dark)' }}>
        <Trophy size={48} style={{ color: 'var(--orange-base)', opacity: 0.5, marginBottom: '1rem' }} />
        <h4 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: '1.2rem' }}>Próximamente más desafíos</h4>
        <p style={{ fontSize: '0.85rem', opacity: 0.7, maxWidth: '400px', margin: '8px auto 0 auto' }}>
          Actualmente no hay desafíos activos planificados. Mantente atento para participar y ganar grandes recompensas.
        </p>
      </div>
    );
  }

  return (
    <div className="activities-dashboard-container">
      <div className="activities-header-section">
        <div>
          <h3>Mis Desafíos</h3>
          <p>Completa tareas interactivas para desbloquear recompensas exclusivas enviadas directamente.</p>
        </div>
      </div>

      <div className="activities-grid">
        {activities.map((activity) => {
          const isExpanded = !!expandedCards[activity.id];

          return (
            <div
              key={activity.id}
              className={`activity-dashboard-card ${activity.status} ${isExpanded ? 'expanded' : ''}`}
            >
              {/* Header Clickable Area */}
              <div
                className="activity-dashboard-card-header"
                onClick={() => toggleExpand(activity.id)}
              >
                <div className="activity-title-group">
                  <div className="activity-title-badge-row">
                    <h4 className="activity-dashboard-title">{activity.title}</h4>
                    {getStatusBadge(activity.status)}
                  </div>
                  {activity.description && (
                    <p className="activity-dashboard-desc">{activity.description}</p>
                  )}
                  <div className="activity-dashboard-dates">
                    <Calendar size={12} />
                    <span>
                      Fecha límite: {new Date(activity.end_date).toLocaleDateString('es-CO')}
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  className="btn-toggle-expand"
                  aria-label={isExpanded ? "Contraer" : "Expandir"}
                >
                  {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                </button>
              </div>

              {/* Progress Bar (Visible Always) */}
              <div className="activity-progress-section">
                <div className="progress-header-info">
                  <span>Progreso de tareas</span>
                  <span>{activity.progress_percentage}%</span>
                </div>
                <div className="progress-bar-container">
                  <m.div
                    className="progress-bar-fill"
                    initial={{ width: 0 }}
                    animate={{ width: `${activity.progress_percentage}%` }}
                    transition={{ type: 'spring', stiffness: 60, damping: 15 }}
                  />
                </div>
              </div>



              {/* Expanded Tasks Section */}
              <AnimatePresence initial={false}>
                {isExpanded && (
                  <m.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.25, ease: 'easeInOut' }}
                    className="tasks-drawer"
                  >
                    <div className="tasks-list">
                      {activity.tasks.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '1rem', opacity: 0.5 }}>
                          <p style={{ margin: 0, fontSize: '0.85rem' }}>No hay tareas asignadas a este desafío.</p>
                        </div>
                      ) : (
                        activity.tasks.map((task) => (
                          <TaskRowItem
                            key={task.id}
                            activity={activity}
                            task={task}
                            clickedButtons={clickedButtons}
                            setClickedButtons={setClickedButtons}
                            togglingTaskId={togglingTaskId}
                            taskInputs={taskInputs}
                            setTaskInputs={setTaskInputs}
                            handleToggleTask={handleToggleTask}
                            onShowCompletions={(t) => {
                              setSelectedCompletionsTask(t);
                              setModalType('completions');
                            }}
                          />
                        ))
                      )}
                    </div>
                  </m.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>

      {/* Custom Modals */}
      <AnimatePresence>
        {modalType === 'alert' && (
          <CustomAlertModal
            title={modalTitle}
            message={modalMessage}
            onClose={() => setModalType(null)}
          />
        )}

        {modalType === 'validation' && activeTaskObject && (
          <ValidationModal
            email={modalEmail}
            setEmail={setModalEmail}
            error={modalEmailError}
            setError={setModalEmailError}
            onClose={() => setModalType(null)}
            onSubmit={handleConfirmValidation}
          />
        )}

        {modalType === 'completions' && selectedCompletionsTask && (
          <CompletionsModal
            taskTitle={selectedCompletionsTask.title}
            completions={selectedCompletionsTask.completed_items || []}
            onClose={() => {
              setModalType(null);
              setSelectedCompletionsTask(null);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
