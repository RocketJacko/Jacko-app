import React from 'react';
import { 
  Check, 
  Clock, 
  Lock,
  Info
} from 'lucide-react';
import { type UserActivity, getActiveTaskLink } from '../../../../services/activitiesService';

interface Props {
  activity: UserActivity;
  task: UserActivity['tasks'][0];
  clickedButtons: Record<string, boolean>;
  setClickedButtons: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  togglingTaskId: string | null;
  taskInputs: Record<string, string>;
  setTaskInputs: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  handleToggleTask: (activity: UserActivity, task: UserActivity['tasks'][0], currentCompleted: boolean) => void;
  onShowCompletions?: (task: UserActivity['tasks'][0]) => void;
}

export function TaskRowItem({
  activity,
  task,
  clickedButtons,
  setClickedButtons,
  togglingTaskId,
  taskInputs,
  setTaskInputs,
  handleToggleTask,
  onShowCompletions
}: Props) {
  const isLocked = activity.tasks
    .filter(t => t.sort_order < task.sort_order)
    .some(t => !t.is_completed);

  const isUncheckLocked = activity.tasks
    .filter(t => t.sort_order > task.sort_order)
    .some(t => t.is_completed);

  const activeLink = getActiveTaskLink(task);
  const isButtonNotClicked = !!activeLink && !clickedButtons[task.id] && !task.is_completed && !task.validation_status;

  const isDisabled = activity.status !== 'active' || 
                     togglingTaskId === task.id || 
                     isLocked || 
                     isButtonNotClicked || 
                     task.validation_status === 'pending' ||
                     (task.is_completed && isUncheckLocked);

  return (
    <div className={`task-row-item ${task.is_completed ? 'completed' : ''} ${isDisabled ? 'disabled' : ''} ${isLocked ? 'locked' : ''}`}>
      <button
        type="button"
        className={`task-checkbox-container ${task.is_completed ? 'checked' : ''} ${activity.status !== 'active' || isLocked || isButtonNotClicked ? 'disabled' : ''} ${isLocked ? 'locked' : ''} ${task.validation_status === 'pending' ? 'pending-val' : ''}`}
        disabled={isDisabled}
        onClick={(e) => {
          e.stopPropagation();
          handleToggleTask(activity, task, task.is_completed);
        }}
      >
        {isLocked ? (
          <Lock size={12} strokeWidth={2.5} />
        ) : task.is_completed ? (
          <Check size={14} strokeWidth={3} />
        ) : task.validation_status === 'pending' ? (
          <Clock size={12} strokeWidth={2.5} />
        ) : null}
      </button>

      <div className="task-info">
        <h5 className="task-title">{task.title}</h5>
        {task.description && (
          <p className="task-desc">{task.description}</p>
        )}

        {task.is_completed && (
          <div style={{ 
            margin: '6px 0', 
            display: 'flex', 
            alignItems: 'center', 
            gap: '6px',
            fontSize: '0.8rem', 
            color: '#4b5563', 
            fontWeight: 600 
          }}>
            <span>Registros totales: <strong style={{ color: 'var(--orange-deep)' }}>{task.completions_count}</strong></span>
            <button
              type="button"
              onClick={() => onShowCompletions?.(task)}
              style={{
                background: 'none',
                border: 'none',
                padding: '4px',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#9ca3af',
                borderRadius: '50%',
                transition: 'all 0.2s',
                outline: 'none'
              }}
              className="info-icon-btn"
              title="Ver detalles de correos registrados"
            >
              <Info size={14} />
            </button>
          </div>
        )}



        {activeLink && (
          <div className="task-link-section">
            {task.validation_status === 'pending' ? (
              <span className="task-validation-pending">
                ⏳ Verificación en progreso...
              </span>
            ) : task.validation_status === 'failed' ? (
              <div className="task-validation-failed-wrapper">
                <a 
                  href={activeLink.url} 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  className="btn-task-action"
                  onClick={() => {
                    setClickedButtons(prev => ({
                      ...prev,
                      [task.id]: true
                    }));
                  }}
                >
                  {activeLink.label}
                </a>
                <span className="task-validation-error-text">
                  ❌ Email no registrado. Valida que finalizaras el registro de manera correcta.
                </span>
              </div>
            ) : task.is_completed ? (
              <button
                type="button"
                className="btn-task-action alt"
                onClick={() => {
                  handleToggleTask(activity, task, false);
                }}
              >
                Registrar otro correo
              </button>
            ) : (
              <a 
                href={activeLink.url} 
                target="_blank" 
                rel="noopener noreferrer" 
                className="btn-task-action"
                onClick={() => {
                  setClickedButtons(prev => ({
                    ...prev,
                    [task.id]: true
                  }));
                }}
              >
                {activeLink.label}
              </a>
            )}
          </div>
        )}

        {task.input_placeholder && (
          <div className="task-input-section">
            <input 
              type="text"
              className="task-text-input"
              placeholder={task.input_placeholder}
              value={taskInputs[task.id] || ''}
              onChange={(e) => setTaskInputs(prev => ({
                ...prev,
                [task.id]: e.target.value
              }))}
              disabled={task.validation_status === 'pending' || togglingTaskId === task.id || isLocked || activity.status !== 'active'}
            />
          </div>
        )}
      </div>
    </div>
  );
}
