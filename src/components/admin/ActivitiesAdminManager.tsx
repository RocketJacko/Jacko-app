import { useState, useEffect } from 'react';
import { 
  Plus, 
  Edit, 
  Trash2, 
  Calendar, 
  ListTodo, 
  ArrowLeft, 
  Save, 
  AlertCircle,
  Clock,
  CheckCircle2,
  HelpCircle
} from 'lucide-react';
import { activitiesService, type Activity, type Task, type TaskLink } from '../../services/activitiesService';

export function ActivitiesAdminManager() {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [selectedActivity, setSelectedActivity] = useState<Activity | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Form states for Activity
  const [activityTitle, setActivityTitle] = useState('');
  const [activityDesc, setActivityDesc] = useState('');
  const [activityStart, setActivityStart] = useState('');
  const [activityEnd, setActivityEnd] = useState('');
  const [activityStatus, setActivityStatus] = useState<'next' | 'active' | 'finished'>('next');
  const [editingActivityId, setEditingActivityId] = useState<string | null>(null);

  // Form states for Task
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDesc, setTaskDesc] = useState('');
  const [taskOrder, setTaskOrder] = useState<number>(1);
  const [taskPlaceholder, setTaskPlaceholder] = useState('');
  const [taskRequiresValidation, setTaskRequiresValidation] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [taskLinks, setTaskLinks] = useState<TaskLink[]>([]);

  const [mode, setMode] = useState<'list' | 'activity_form' | 'tasks_form'>('list');

  const loadActivities = async () => {
    setIsLoading(true);
    setErrorMsg('');
    try {
      const data = await activitiesService.getActivities();
      setActivities(data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMsg('Error al cargar actividades: ' + msg);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    let active = true;
    const load = async () => {
      await Promise.resolve();
      if (active) {
        loadActivities();
      }
    };
    load();
    return () => {
      active = false;
    };
  }, []);

  const loadTasks = async (activityId: string) => {
    setIsLoading(true);
    setErrorMsg('');
    try {
      const data = await activitiesService.getTasks(activityId);
      setTasks(data);
      // Auto-assign next sort order
      const nextOrder = data.length > 0 ? Math.max(...data.map(t => t.sort_order)) + 1 : 1;
      setTaskOrder(nextOrder);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMsg('Error al cargar tareas: ' + msg);
    } finally {
      setIsLoading(false);
    }
  };

  // Toast auto-clear
  useEffect(() => {
    if (successMsg || errorMsg) {
      const t = setTimeout(() => {
        setSuccessMsg('');
        setErrorMsg('');
      }, 4000);
      return () => clearTimeout(t);
    }
  }, [successMsg, errorMsg]);

  // Handle Activity Form Opening
  const handleOpenActivityForm = (activity?: Activity) => {
    if (activity) {
      setEditingActivityId(activity.id);
      setActivityTitle(activity.title);
      setActivityDesc(activity.description || '');
      
      // Convert timestamps to YYYY-MM-DDTHH:MM for datetime-local
      const formatLocal = (iso: string) => {
        const d = new Date(iso);
        const pad = (n: number) => n.toString().padStart(2, '0');
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
      };

      setActivityStart(formatLocal(activity.start_date));
      setActivityEnd(formatLocal(activity.end_date));
      setActivityStatus(activity.status);
    } else {
      setEditingActivityId(null);
      setActivityTitle('');
      setActivityDesc('');
      
      // Default dates: start now, end in 7 days
      const now = new Date();
      const nextWeek = new Date();
      nextWeek.setDate(now.getDate() + 7);
      
      const formatLocal = (d: Date) => {
        const pad = (n: number) => n.toString().padStart(2, '0');
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T00:00`;
      };
      
      setActivityStart(formatLocal(now));
      setActivityEnd(formatLocal(nextWeek));
      setActivityStatus('next');
    }
    setMode('activity_form');
  };

  // Handle Activity Save
  const handleSaveActivity = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activityTitle.trim()) {
      setErrorMsg('El título es requerido');
      return;
    }
    if (!activityStart || !activityEnd) {
      setErrorMsg('Las fechas de inicio y fin son requeridas');
      return;
    }

    setIsSaving(true);
    setErrorMsg('');
    try {
      const payload = {
        title: activityTitle.trim(),
        description: activityDesc.trim() || null,
        start_date: new Date(activityStart).toISOString(),
        end_date: new Date(activityEnd).toISOString(),
        status: activityStatus
      };

      if (editingActivityId) {
        await activitiesService.updateActivity(editingActivityId, payload);
        setSuccessMsg('Actividad actualizada con éxito');
      } else {
        await activitiesService.createActivity(payload);
        setSuccessMsg('Actividad creada con éxito');
      }
      
      setMode('list');
      loadActivities();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMsg('Error al guardar actividad: ' + msg);
    } finally {
      setIsSaving(false);
    }
  };

  // Handle Activity Delete
  const handleDeleteActivity = async (id: string) => {
    if (!window.confirm('¿Estás seguro de eliminar esta actividad? Esto eliminará también todas sus tareas y el progreso de los usuarios.')) {
      return;
    }

    try {
      await activitiesService.deleteActivity(id);
      setSuccessMsg('Actividad eliminada con éxito');
      loadActivities();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMsg('Error al eliminar actividad: ' + msg);
    }
  };
  // Handle Tasks Form Opening
  const handleOpenTasksForm = (activity: Activity) => {
    setSelectedActivity(activity);
    loadTasks(activity.id);
    setMode('tasks_form');
    // Clear task inputs
    setTaskTitle('');
    setTaskDesc('');
    setTaskPlaceholder('');
    setTaskRequiresValidation(false);
    setTaskLinks([]);
    setEditingTaskId(null);
  };

  // Handle Task Save
  const handleSaveTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedActivity) return;
    if (!taskTitle.trim()) {
      setErrorMsg('El título de la tarea es requerido');
      return;
    }

    setIsSaving(true);
    setErrorMsg('');
    try {
      const payload = {
        activity_id: selectedActivity.id,
        title: taskTitle.trim(),
        description: taskDesc.trim() || null,
        sort_order: taskOrder,
        button_url: taskLinks.find(l => l.is_active)?.url || null,
        button_label: taskLinks.find(l => l.is_active)?.label || null,
        input_placeholder: taskPlaceholder.trim() || null,
        requires_validation: taskRequiresValidation,
        links: taskLinks
      };

      if (editingTaskId) {
        await activitiesService.updateTask(editingTaskId, payload);
        setSuccessMsg('Tarea actualizada con éxito');
      } else {
        await activitiesService.createTask(payload);
        setSuccessMsg('Tarea agregada con éxito');
      }

      setTaskTitle('');
      setTaskDesc('');
      setTaskPlaceholder('');
      setTaskRequiresValidation(false);
      setTaskLinks([]);
      setEditingTaskId(null);
      loadTasks(selectedActivity.id);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMsg('Error al guardar tarea: ' + msg);
    } finally {
      setIsSaving(false);
    }
  };

  // Handle Task Edit Select
  const handleSelectEditTask = (task: Task) => {
    setEditingTaskId(task.id);
    setTaskTitle(task.title);
    setTaskDesc(task.description || '');
    setTaskOrder(task.sort_order);
    setTaskPlaceholder(task.input_placeholder || '');
    setTaskRequiresValidation(task.requires_validation || false);
    if (task.links && task.links.length > 0) {
      setTaskLinks(task.links);
    } else if (task.button_url) {
      setTaskLinks([{ url: task.button_url, label: task.button_label || 'Ir al enlace', is_active: true }]);
    } else {
      setTaskLinks([]);
    }
  };

  // Cancel Task Edit
  const handleCancelTaskEdit = () => {
    setEditingTaskId(null);
    setTaskTitle('');
    setTaskDesc('');
    setTaskPlaceholder('');
    setTaskRequiresValidation(false);
    setTaskLinks([]);
    if (tasks.length > 0) {
      setTaskOrder(Math.max(...tasks.map(t => t.sort_order)) + 1);
    } else {
      setTaskOrder(1);
    }
  };


  // Handle Task Delete
  const handleDeleteTask = async (taskId: string) => {
    if (!selectedActivity) return;
    if (!window.confirm('¿Estás seguro de eliminar esta tarea?')) return;

    try {
      await activitiesService.deleteTask(taskId);
      setSuccessMsg('Tarea eliminada con éxito');
      loadTasks(selectedActivity.id);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMsg('Error al eliminar tarea: ' + msg);
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'active':
        return <span className="badge badge-success"><Clock size={12} /> Activa</span>;
      case 'next':
        return <span className="badge badge-warning"><Calendar size={12} /> Próxima</span>;
      case 'finished':
        return <span className="badge badge-danger"><CheckCircle2 size={12} /> Finalizada</span>;
      default:
        return <span className="badge badge-secondary"><HelpCircle size={12} /> Desconocido</span>;
    }
  };

  return (
    <div className="admin-catalog-container">
      {successMsg && (
        <div className="alert-toast success">
          <span>✨ {successMsg}</span>
        </div>
      )}
      {errorMsg && (
        <div className="alert-toast error">
          <span>⚠️ {errorMsg}</span>
        </div>
      )}

      {/* --- LIST VIEW --- */}
      {mode === 'list' && (
        <>
          <div className="admin-action-bar">
            <div>
              <h3 style={{ fontFamily: 'var(--font-display)', margin: 0, fontSize: '1.4rem' }}>
                Gestión de Actividades
              </h3>
              <p style={{ fontSize: '0.85rem', opacity: 0.7, margin: '4px 0 0 0' }}>
                Crea desafíos interactivos con tareas completables. Al llegar al 100% se dispara webhook a n8n.
              </p>
            </div>
            <button 
              type="button" 
              className="btn-admin-action" 
              onClick={() => handleOpenActivityForm()}
            >
              <Plus size={16} /> Nueva Actividad
            </button>
          </div>

          {isLoading ? (
            <div style={{ textAlign: 'center', padding: '3rem' }}>
              <div className="loading-spinner" style={{ margin: '0 auto 1rem auto' }} />
              <p style={{ opacity: 0.7 }}>Cargando actividades...</p>
            </div>
          ) : activities.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '4rem 2rem', background: '#faf6f0', borderRadius: '24px', border: '1.5px dashed var(--beige-dark)' }}>
              <ListTodo size={40} style={{ color: 'var(--orange-base)', opacity: 0.6, marginBottom: '1rem' }} />
              <h4 style={{ margin: 0, fontFamily: 'var(--font-display)' }}>No hay actividades registradas</h4>
              <p style={{ fontSize: '0.85rem', opacity: 0.7, maxWidth: '400px', margin: '8px auto 16px auto' }}>
                Comienza agregando tu primer desafío interactivo para que los usuarios puedan completar tareas.
              </p>
              <button 
                type="button" 
                className="btn-admin-secondary" 
                onClick={() => handleOpenActivityForm()}
              >
                Crear Actividad
              </button>
            </div>
          ) : (
            <div className="admin-list">
              {activities.map((activity) => (
                <div key={activity.id} className="admin-card">
                  <div className="admin-card-row">
                    <div className="admin-card-info">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                        <h4 className="admin-card-title">{activity.title}</h4>
                        {getStatusLabel(activity.status)}
                      </div>
                      {activity.description && (
                        <p className="admin-card-desc" style={{ marginTop: '8px' }}>
                          {activity.description}
                        </p>
                      )}
                      <div className="admin-card-badges" style={{ marginTop: '12px' }}>
                        <span style={{ fontSize: '0.75rem', opacity: 0.6, display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <Calendar size={12} />
                          {new Date(activity.start_date).toLocaleDateString()} — {new Date(activity.end_date).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                    <div className="admin-card-actions">
                      <button 
                        type="button" 
                        className="btn-admin-secondary"
                        onClick={() => handleOpenTasksForm(activity)}
                        title="Ver y Gestionar Tareas"
                      >
                        <ListTodo size={14} /> Tareas
                      </button>
                      <button 
                        type="button" 
                        className="btn-admin-secondary"
                        onClick={() => handleOpenActivityForm(activity)}
                        title="Editar Actividad"
                      >
                        <Edit size={14} />
                      </button>
                      <button 
                        type="button" 
                        className="btn-admin-danger"
                        style={{ padding: '10px' }}
                        onClick={() => handleDeleteActivity(activity.id)}
                        title="Eliminar Actividad"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* --- CREATE / EDIT FORM VIEW --- */}
      {mode === 'activity_form' && (
        <div className="admin-editor-card">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '1.5rem' }}>
            <button 
              type="button" 
              className="btn-admin-secondary" 
              style={{ padding: '8px 12px' }}
              onClick={() => setMode('list')}
            >
              <ArrowLeft size={16} />
            </button>
            <h3 style={{ fontFamily: 'var(--font-display)', margin: 0, fontSize: '1.3rem' }}>
              {editingActivityId ? 'Editar Actividad' : 'Nueva Actividad'}
            </h3>
          </div>

          <form onSubmit={handleSaveActivity} className="admin-form">
            <div className="admin-field">
              <label>Título de la Actividad</label>
              <input 
                type="text" 
                className="admin-input"
                placeholder="Ej: Desafío Skate Life Vol.1"
                value={activityTitle}
                onChange={(e) => setActivityTitle(e.target.value)}
                required
              />
            </div>

            <div className="admin-field">
              <label>Descripción</label>
              <textarea 
                className="admin-textarea"
                rows={3}
                placeholder="Escribe una breve descripción del desafío y el premio que recibirán..."
                value={activityDesc}
                onChange={(e) => setActivityDesc(e.target.value)}
              />
            </div>

            <div className="form-grid-3">
              <div className="admin-field">
                <label>Fecha de Inicio</label>
                <input 
                  type="datetime-local" 
                  className="admin-input"
                  value={activityStart}
                  onChange={(e) => setActivityStart(e.target.value)}
                  required
                />
              </div>

              <div className="admin-field">
                <label>Fecha de Fin</label>
                <input 
                  type="datetime-local" 
                  className="admin-input"
                  value={activityEnd}
                  onChange={(e) => setActivityEnd(e.target.value)}
                  required
                />
              </div>

              <div className="admin-field">
                <label>Estado</label>
                <select 
                  className="admin-select"
                  value={activityStatus}
                  onChange={(e) => setActivityStatus(e.target.value as 'next' | 'active' | 'finished')}
                >
                  <option value="next">Próxima (Planificada)</option>
                  <option value="active">Activa</option>
                  <option value="finished">Finalizada</option>
                </select>
              </div>
            </div>



            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '1rem' }}>
              <button 
                type="button" 
                className="btn-admin-secondary" 
                onClick={() => setMode('list')}
                disabled={isSaving}
              >
                Cancelar
              </button>
              <button 
                type="submit" 
                className="btn-admin-action" 
                disabled={isSaving}
              >
                <Save size={16} /> {isSaving ? 'Guardando...' : 'Guardar Actividad'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* --- TASKS VIEW --- */}
      {mode === 'tasks_form' && selectedActivity && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button 
              type="button" 
              className="btn-admin-secondary" 
              style={{ padding: '8px 12px' }}
              onClick={() => setMode('list')}
            >
              <ArrowLeft size={16} /> Volver
            </button>
            <div>
              <h3 style={{ fontFamily: 'var(--font-display)', margin: 0, fontSize: '1.3rem' }}>
                Tareas: {selectedActivity.title}
              </h3>
              <p style={{ fontSize: '0.8rem', opacity: 0.7, margin: '2px 0 0 0' }}>
                Administra los pasos específicos del desafío. Los usuarios completarán esta lista en orden.
              </p>
            </div>
          </div>

          <div className="form-grid-2" style={{ alignItems: 'flex-start' }}>
            {/* Task Editor Form */}
            <div className="admin-editor-card" style={{ position: 'sticky', top: '20px' }}>
              <h4 style={{ fontFamily: 'var(--font-display)', margin: '0 0 1rem 0', fontSize: '1.1rem' }}>
                {editingTaskId ? 'Editar Tarea' : 'Agregar Tarea'}
              </h4>

              <form onSubmit={handleSaveTask} className="admin-form">
                <div className="admin-field">
                  <label>Título de la Tarea</label>
                  <input 
                    type="text" 
                    className="admin-input"
                    placeholder="Ej: Sigue a JACKO en Instagram"
                    value={taskTitle}
                    onChange={(e) => setTaskTitle(e.target.value)}
                    required
                  />
                </div>

                <div className="admin-field">
                  <label>Descripción Opcional / Instrucciones</label>
                  <textarea 
                    className="admin-textarea"
                    rows={2}
                    placeholder="Detalles sobre cómo completar la tarea..."
                    value={taskDesc}
                    onChange={(e) => setTaskDesc(e.target.value)}
                  />
                </div>

                <div className="admin-field">
                  <label>Orden de visualización</label>
                  <input 
                    type="number" 
                    className="admin-input"
                    min={1}
                    value={taskOrder}
                    onChange={(e) => setTaskOrder(parseInt(e.target.value) || 1)}
                    required
                  />
                </div>
                {/* Enlaces Múltiples */}
                <div style={{ marginTop: '1rem', borderTop: '1px solid var(--beige-dark)', paddingTop: '1rem', marginBottom: '1rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.8rem' }}>
                    <label style={{ fontWeight: 'bold', fontSize: '0.9rem', color: 'var(--brown-dark)' }}>
                      Enlaces de Redirección ({taskLinks.length})
                    </label>
                    <button
                      type="button"
                      className="btn-admin-secondary"
                      style={{ padding: '4px 8px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '4px' }}
                      onClick={() => setTaskLinks(prev => [...prev, { url: '', label: '', is_active: true }])}
                    >
                      <Plus size={12} /> Agregar Enlace
                    </button>
                  </div>

                  {taskLinks.length === 0 ? (
                    <p style={{ fontSize: '0.78rem', opacity: 0.6, fontStyle: 'italic', margin: '4px 0' }}>
                      No hay enlaces agregados a esta tarea.
                    </p>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {taskLinks.map((link, idx) => (
                        <div 
                          key={idx} 
                          style={{ 
                            background: 'var(--beige-light)', 
                            padding: '10px', 
                            borderRadius: '12px', 
                            border: '1px solid var(--beige-dark)',
                            display: 'flex', 
                            flexDirection: 'column', 
                            gap: '6px' 
                          }}
                        >
                          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                            <span style={{ fontSize: '0.78rem', fontWeight: 800, color: 'var(--brown-dark)', opacity: 0.6 }}>
                              #{idx + 1}
                            </span>
                            <input 
                              type="url" 
                              className="admin-input"
                              style={{ flex: 1, padding: '6px 10px', fontSize: '0.82rem' }}
                              placeholder="https://ejemplo.com"
                              value={link.url}
                              onChange={(e) => {
                                const newUrl = e.target.value;
                                setTaskLinks(prev => prev.map((l, i) => i === idx ? { ...l, url: newUrl } : l));
                              }}
                              required
                            />
                          </div>

                          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                            <input 
                              type="text" 
                              className="admin-input"
                              style={{ flex: 1, padding: '6px 10px', fontSize: '0.82rem' }}
                              placeholder="Etiqueta del botón (Ej: Registrarse aquí)"
                              value={link.label}
                              onChange={(e) => {
                                const newLabel = e.target.value;
                                setTaskLinks(prev => prev.map((l, i) => i === idx ? { ...l, label: newLabel } : l));
                              }}
                            />
                            
                            <label style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.78rem', userSelect: 'none', cursor: 'pointer', margin: 0 }}>
                              <input 
                                type="checkbox" 
                                checked={link.is_active}
                                onChange={(e) => {
                                  const active = e.target.checked;
                                  setTaskLinks(prev => prev.map((l, i) => i === idx ? { ...l, is_active: active } : l));
                                }}
                                style={{ width: 'auto', margin: 0 }}
                              />
                              Activo
                            </label>

                            <button
                              type="button"
                              className="btn-admin-danger"
                              style={{ padding: '6px 8px', borderRadius: '8px', fontSize: '0.75rem' }}
                              onClick={() => setTaskLinks(prev => prev.filter((_, i) => i !== idx))}
                            >
                              Eliminar
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="admin-field">
                  <label>Placeholder del Input de Texto (Opcional)</label>
                  <input 
                    type="text" 
                    className="admin-input"
                    placeholder="Ej: Ingresa tu email de v0"
                    value={taskPlaceholder}
                    onChange={(e) => setTaskPlaceholder(e.target.value)}
                  />
                </div>

                <div className="admin-field" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '0.5rem', marginBottom: '0.5rem' }}>
                  <input 
                    type="checkbox" 
                    id="taskRequiresValidation"
                    checked={taskRequiresValidation}
                    onChange={(e) => setTaskRequiresValidation(e.target.checked)}
                    style={{ width: 'auto', margin: 0, cursor: 'pointer' }}
                  />
                  <label htmlFor="taskRequiresValidation" style={{ margin: 0, fontWeight: 'normal', cursor: 'pointer', fontSize: '0.85rem' }}>
                    <strong>Requiere Validación de n8n:</strong> Despacha un webhook al marcar la tarea para que n8n verifique su autenticidad.
                  </label>
                </div>

                <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
                  {editingTaskId && (
                    <button 
                      type="button" 
                      className="btn-admin-secondary" 
                      onClick={handleCancelTaskEdit}
                      disabled={isSaving}
                    >
                      Cancelar
                    </button>
                  )}
                  <button 
                    type="submit" 
                    className="btn-admin-action" 
                    disabled={isSaving}
                  >
                    <Plus size={16} /> {editingTaskId ? 'Actualizar' : 'Agregar'}
                  </button>
                </div>
              </form>
            </div>

            {/* Tasks List */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <h4 style={{ fontFamily: 'var(--font-display)', margin: '0 0 0.5rem 0', fontSize: '1.1rem' }}>
                Lista de Tareas ({tasks.length})
              </h4>
              
              {isLoading ? (
                <div style={{ textAlign: 'center', padding: '2rem' }}>
                  <div className="loading-spinner" style={{ margin: '0 auto' }} />
                </div>
              ) : tasks.length === 0 ? (
                <div style={{ padding: '2rem', textAlign: 'center', background: '#faf6f0', borderRadius: '16px', border: '1.5px dashed var(--beige-dark)' }}>
                  <AlertCircle size={32} style={{ color: 'var(--orange-base)', opacity: 0.6, marginBottom: '0.5rem' }} />
                  <p style={{ margin: 0, fontSize: '0.85rem', opacity: 0.7 }}>Esta actividad aún no tiene tareas creadas.</p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {tasks.map((task) => (
                    <div 
                      key={task.id} 
                      style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        justifyContent: 'space-between', 
                        background: 'white', 
                        border: editingTaskId === task.id ? '2px solid var(--orange-base)' : '1.5px solid var(--beige-dark)', 
                        padding: '12px 16px', 
                        borderRadius: '16px',
                        boxShadow: '0 2px 8px rgba(42, 26, 10, 0.02)'
                      }}
                    >
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ 
                            background: 'var(--beige-light)', 
                            color: 'var(--brown-dark)', 
                            fontWeight: 800, 
                            fontSize: '0.75rem', 
                            padding: '2px 6px', 
                            borderRadius: '6px' 
                          }}>
                            #{task.sort_order}
                          </span>
                          <h5 style={{ margin: 0, fontWeight: 700, fontSize: '0.92rem', color: 'var(--brown-dark)' }}>
                            {task.title}
                          </h5>
                        </div>
                        {task.description && (
                          <p style={{ margin: '4px 0 0 0', fontSize: '0.8rem', opacity: 0.7, lineHeight: 1.3 }}>
                            {task.description}
                          </p>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: '4px', marginLeft: '12px' }}>
                        <button 
                          type="button" 
                          className="btn-admin-secondary"
                          style={{ padding: '6px 8px', borderRadius: '8px' }}
                          onClick={() => handleSelectEditTask(task)}
                          title="Editar Tarea"
                        >
                          <Edit size={12} />
                        </button>
                        <button 
                          type="button" 
                          className="btn-admin-danger"
                          style={{ padding: '6px 8px', borderRadius: '8px' }}
                          onClick={() => handleDeleteTask(task.id)}
                          title="Eliminar Tarea"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
