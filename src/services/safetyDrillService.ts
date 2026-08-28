import { supabase } from '../lib/supabase';
import type { SafetyDrill, UserProfile } from '../types';

/**
 * Universal safe UUID generator for offline-resilient inserts across tablets and sandboxed environments
 */
const safeUUID = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    try {
      return crypto.randomUUID();
    } catch {
      // Fallback if crypto.randomUUID fails in restricted contexts
    }
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};

export interface SafetyDrillPayload {
  id?: string;
  drill_date: string;
  drill_type: string;
  scenario?: string | null;
  outcomes?: string | null;
  participants?: string[] | null;
  evacuation_time_seconds?: number | null;
  notes?: string | null;
  conducted_by?: string | null;
  created_by?: string | null;
  modified_by?: string | null;
  is_deleted?: boolean;
  [key: string]: unknown;
}

export const safetyDrillService = {
  /**
   * Fetch all active safety drills ordered by date descending
   */
  async getDrills(): Promise<SafetyDrill[]> {
    const { data, error } = await supabase
      .from('safety_drills')
      .select('*')
      .eq('is_deleted', false)
      .order('drill_date', { ascending: false });

    if (error) {
      console.error('[SafetyDrillService getDrills Error]:', error);
      throw error;
    }
    return (data || []) as SafetyDrill[];
  },

  /**
   * Fetch active staff members for attendance roll call
   */
  async getStaffMembers(): Promise<Pick<UserProfile, 'id' | 'name' | 'initials' | 'email'>[]> {
    const { data, error } = await supabase
      .from('users')
      .select('id, name, initials, email')
      .eq('is_deleted', false)
      .order('name', { ascending: true });

    if (error) {
      console.error('[SafetyDrillService getStaffMembers Error]:', error);
      throw error;
    }
    return (data || []) as Pick<UserProfile, 'id' | 'name' | 'initials' | 'email'>[];
  },

  /**
   * Fetch currently clocked-in staff user IDs for auto-populating active roll call
   */
  async getActiveTimesheets(): Promise<{ user_id: string }[]> {
    const { data, error } = await supabase
      .from('timesheets')
      .select('user_id')
      .is('clock_out_time', null)
      .eq('is_deleted', false);

    if (error) {
      console.error('[SafetyDrillService getActiveTimesheets Error]:', error);
      throw error;
    }
    return (data || []) as { user_id: string }[];
  },

  /**
   * Save or update a safety drill record with safe UUID allocation and audit tracking
   */
  async saveDrill(payload: SafetyDrillPayload, userId?: string): Promise<SafetyDrill> {
    let activeUserId = userId?.trim() || payload.modified_by?.trim() || payload.created_by?.trim() || null;
    if (!activeUserId) {
      const { data: userData } = await supabase.auth.getUser();
      activeUserId = userData.user?.id || null;
    }

    const isUpdate = Boolean(payload.id);
    const drillId = payload.id || safeUUID();

    const sanitizedPayload = {
      ...payload,
      id: drillId,
      is_deleted: false,
      created_by: payload.created_by?.trim() || activeUserId,
      modified_by: activeUserId,
      updated_at: new Date().toISOString(),
    };

    if (isUpdate) {
      const { data, error } = await supabase
        .from('safety_drills')
        .update(sanitizedPayload)
        .eq('id', drillId)
        .select()
        .single();

      if (error) {
        console.error('[SafetyDrillService updateDrill Error]:', error);
        throw error;
      }
      return data as SafetyDrill;
    } else {
      const { data, error } = await supabase
        .from('safety_drills')
        .insert([sanitizedPayload])
        .select()
        .single();

      if (error) {
        console.error('[SafetyDrillService insertDrill Error]:', error);
        throw error;
      }
      return data as SafetyDrill;
    }
  },

  /**
   * Soft-delete a safety drill record
   */
  async deleteDrill(id: string, userId?: string): Promise<boolean> {
    let activeUserId = userId?.trim() || null;
    if (!activeUserId) {
      const { data: userData } = await supabase.auth.getUser();
      activeUserId = userData.user?.id || null;
    }

    const { error } = await supabase
      .from('safety_drills')
      .update({
        is_deleted: true,
        modified_by: activeUserId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);

    if (error) {
      console.error('[SafetyDrillService deleteDrill Error]:', error);
      throw error;
    }
    return true;
  },
};

export default safetyDrillService;