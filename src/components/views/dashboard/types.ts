export interface Profile {
  id: string;
  full_name: string | null;
  city?: string | null;
  points: number;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  points_reward: number;
  action_url?: string;
  action_label?: string;
}

export interface Completion {
  id: string;
  task_id: string;
  completed_at: string;
  points_awarded: number;
}

export interface Transaction {
  id: string;
  points: number;
  type: string;
  description: string;
  created_at: string;
}

export interface ActivationDetail {
  first_name: string;
  last_name: string;
  email: string;
  activated_at: string;
  /** Correo de la cuenta asignada por n8n (puede diferir del correo ingresado) */
  correo?: string;
}

export interface Order {
  id: string;
  created_at: string;
  status: string;
  points_used: number;
  amount_cop: number;
  payment_type?: 'money' | 'points';
  quantity?: number;
  activated_at?: string | null;
  activation_details?: ActivationDetail[] | null;
  delivered_credentials?: string;
  admin_note?: string | null;
  reference_note?: string | null;
  receipt_url?: string | null;
  /** true cuando se han consumido todas las activaciones compradas */
  is_redeemed?: boolean;
  redemption_code?: string | null;
  products?: {
    title: string;
    slug: string;
  } | null;
  payment_methods?: {
    type: string;
    name: string;
  } | null;
}
