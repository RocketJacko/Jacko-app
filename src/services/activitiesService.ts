import { supabase } from '../lib/supabaseClient';

export interface Activity {
  id: string;
  title: string;
  description: string | null;
  start_date: string;
  end_date: string;
  status: 'next' | 'active' | 'finished';
  created_at: string;
  updated_at: string;
}

export interface TaskLink {
  url: string;
  label: string;
  is_active: boolean;
}

export interface Task {
  id: string;
  activity_id: string;
  title: string;
  description: string | null;
  sort_order: number;
  button_url: string | null;
  button_label: string | null;
  input_placeholder: string | null;
  requires_validation: boolean;
  links?: TaskLink[] | null;
  created_at: string;
  updated_at: string;
}

export interface UserActivity extends Activity {
  tasks: (Task & { 
    is_completed: boolean; 
    input_value: string | null; 
    validation_status: 'pending' | 'verified' | 'failed' | null;
    completions_count?: number;
    completed_items?: { email: string; created_at: string }[];
  })[];
  reward_status: 'pending' | 'processing' | 'delivered' | 'failed' | null;
  progress_percentage: number;
}
export function getActiveTaskLink(task: { links?: TaskLink[] | null; button_url?: string | null; button_label?: string | null }): TaskLink | null {
  if (task.links && Array.isArray(task.links)) {
    const activeLink = task.links.find(l => l.is_active);
    if (activeLink) {
      return activeLink;
    }
  }
  if (task.button_url) {
    return {
      url: task.button_url,
      label: task.button_label || 'Ir al enlace',
      is_active: true
    };
  }
  return null;
}

export const activitiesService = {
  // Admin Methods: Activities
  async getActivities(): Promise<Activity[]> {
    const { data, error } = await supabase
      .from('activities')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  },

  async createActivity(activity: Omit<Activity, 'id' | 'created_at' | 'updated_at'>): Promise<Activity> {
    const { data, error } = await supabase
      .from('activities')
      .insert(activity)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async updateActivity(id: string, activity: Partial<Omit<Activity, 'id' | 'created_at' | 'updated_at'>>): Promise<Activity> {
    const { data, error } = await supabase
      .from('activities')
      .update(activity)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async deleteActivity(id: string): Promise<void> {
    const { error } = await supabase
      .from('activities')
      .delete()
      .eq('id', id);
    if (error) throw error;
  },

  // Admin Methods: Tasks
  async getTasks(activityId: string): Promise<Task[]> {
    const { data, error } = await supabase
      .from('tasks')
      .select('*')
      .eq('activity_id', activityId)
      .order('sort_order', { ascending: true });
    if (error) throw error;
    return data || [];
  },

  async createTask(task: Omit<Task, 'id' | 'created_at' | 'updated_at'>): Promise<Task> {
    const { data, error } = await supabase
      .from('tasks')
      .insert(task)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async updateTask(id: string, task: Partial<Omit<Task, 'id' | 'created_at' | 'updated_at'>>): Promise<Task> {
    const { data, error } = await supabase
      .from('tasks')
      .update(task)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async deleteTask(id: string): Promise<void> {
    const { error } = await supabase
      .from('tasks')
      .delete()
      .eq('id', id);
    if (error) throw error;
  },

  // User Methods
  async getUserActivities(userId: string): Promise<UserActivity[]> {
    // 1. Fetch all activities
    const { data: activities, error: actError } = await supabase
      .from('activities')
      .select('*')
      .order('created_at', { ascending: false });
    if (actError) throw actError;

    // 2. Fetch all tasks for those activities
    const { data: tasks, error: taskError } = await supabase
      .from('tasks')
      .select('*')
      .order('sort_order', { ascending: true });
    if (taskError) throw taskError;

    // 3. Fetch completed tasks for this user
    const { data: completedTasks, error: compError } = await supabase
      .from('user_completed_tasks')
      .select('task_id, input_value, completed_at')
      .eq('user_id', userId);
    if (compError) throw compError;

    // 4. Fetch rewards for this user
    const { data: rewards, error: rewError } = await supabase
      .from('user_rewards')
      .select('*')
      .eq('user_id', userId);
    if (rewError) throw rewError;

    // 5. Fetch validations for this user, ordered by created_at desc so the first one is the latest
    const { data: validations, error: valError } = await supabase
      .from('user_task_validations')
      .select('task_id, status')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    if (valError) throw valError;

    // Construct maps for fast lookup
    const completedTasksMap = new Map<string, { email: string; created_at: string }[]>();
    completedTasks?.forEach(t => {
      if (!completedTasksMap.has(t.task_id)) {
        completedTasksMap.set(t.task_id, []);
      }
      if (t.input_value) {
        completedTasksMap.get(t.task_id)!.push({
          email: t.input_value,
          created_at: t.completed_at
        });
      }
    });
    const latestValidationsMap = new Map<string, 'pending' | 'verified' | 'failed'>();
    validations?.forEach(v => {
      if (!latestValidationsMap.has(v.task_id)) {
        latestValidationsMap.set(v.task_id, v.status as 'pending' | 'verified' | 'failed');
      }
    });
    const rewardsMap = new Map<string, 'pending' | 'processing' | 'delivered' | 'failed'>();
    rewards?.forEach(r => {
      rewardsMap.set(r.activity_id, r.status as 'pending' | 'processing' | 'delivered' | 'failed');
    });

    // Group tasks by activity_id
    const tasksByActivity = new Map<string, Task[]>();
    tasks?.forEach(t => {
      if (!tasksByActivity.has(t.activity_id)) {
        tasksByActivity.set(t.activity_id, []);
      }
      tasksByActivity.get(t.activity_id)!.push(t);
    });

    // Map to UserActivity
    return (activities || []).map(act => {
      const actTasks = tasksByActivity.get(act.id) || [];
      const mappedTasks = actTasks.map(t => {
        const completions = completedTasksMap.get(t.id) || [];
        return {
          ...t,
          is_completed: completions.length > 0,
          input_value: completions.length > 0 ? completions[completions.length - 1].email : null,
          validation_status: latestValidationsMap.get(t.id) || null,
          completions_count: completions.length,
          completed_items: completions
        };
      });

      const completedCount = mappedTasks.filter(t => t.is_completed).length;
      const totalCount = mappedTasks.length;
      const progress_percentage = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
      const reward_status = rewardsMap.get(act.id) || null;

      return {
        ...act,
        tasks: mappedTasks,
        reward_status,
        progress_percentage
      };
    });
  },

  async toggleTaskCompletion(userId: string, taskId: string, completed: boolean, inputValue: string | null = null): Promise<void> {
    if (completed) {
      const { error } = await supabase
        .from('user_completed_tasks')
        .insert({ user_id: userId, task_id: taskId, input_value: inputValue });
      if (error && error.code !== '23505') { // Ignore unique constraint violation
        throw error;
      }
    } else {
      const { error } = await supabase
        .from('user_completed_tasks')
        .delete()
        .eq('user_id', userId)
        .eq('task_id', taskId);
      if (error) throw error;
    }
  },

  async requestTaskValidation(userId: string, taskId: string, email: string): Promise<void> {
    const cleanEmail = email.trim().toLowerCase();
    
    // Validar si el correo ya fue verificado o está pendiente para esta tarea específica
    const { data: existing, error: checkError } = await supabase
      .from('user_task_validations')
      .select('id, status')
      .eq('task_id', taskId)
      .eq('email', cleanEmail)
      .in('status', ['verified', 'pending'])
      .maybeSingle();

    if (checkError) throw checkError;

    if (existing) {
      if (existing.status === 'verified') {
        throw new Error('Este correo electrónico ya ha sido utilizado para completar esta tarea por otro usuario. Por favor, ingresa un correo diferente.');
      } else {
        throw new Error('Este correo electrónico ya tiene una verificación pendiente en curso. Por favor, ingresa uno diferente o espera a que termine.');
      }
    }

    const { error } = await supabase
      .from('user_task_validations')
      .insert({ user_id: userId, task_id: taskId, email: cleanEmail, status: 'pending' });
    if (error) throw error;
  }
};
