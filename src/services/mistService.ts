import { supabase } from '../lib/supabase';
import type { MistLog } from '../types';

export interface MistLogPayload {
  id?: string;
  animal_id: string;
  recorded_by: string;
  recorded_at: string;
  created_by?: string | null;
  mist_level: 'LIGHT' | 'MEDIUM' | 'HEAVY' | string;
  am_pm: 'AM' | 'PM' | string;
  notes?: string | null;
  is_deleted?: boolean;
}

export const mistService = {
  /**
   * Fetch mist logs within a date-time window
   */
  async getMistLogsByDate(startDateISO: string, endDateISO: string): Promise<MistLog[]> {
    const { data, error } = await supabase
      .from('mist_logs')
      .select('*')
      .or('is_deleted.eq.false,is_deleted.is.null')
      .gte('recorded_at', startDateISO)
      .lte('recorded_at', endDateISO)
      .order('recorded_at', { ascending: false });

    if (error) {
      console.error('[MistService getMistLogsByDate Error]:', error);
      throw new Error(error.message || error.details || 'Failed to fetch mist logs');
    }
    return (data || []) as MistLog[];
  },

  /**
   * Insert or update a mist log entry without non-existent schema columns
   */
  async insertMistLog(payload: MistLogPayload): Promise<MistLog> {
    const sanitizedPayload = {
      animal_id: payload.animal_id,
      recorded_by: payload.recorded_by,
      recorded_at: payload.recorded_at,
      created_by: payload.created_by && payload.created_by.trim() ? payload.created_by : null,
      mist_level: payload.mist_level,
      am_pm: payload.am_pm,
      notes: payload.notes && payload.notes.trim() ? payload.notes.trim() : null,
      is_deleted: false,
    };

    if (payload.id) {
      // UPDATE EXISTING RECORD
      const { data, error } = await supabase
        .from('mist_logs')
        .update(sanitizedPayload)
        .eq('id', payload.id)
        .select()
        .single();

      if (error) {
        console.error('[MistService update Error]:', error);
        throw new Error(error.message || error.details || error.hint || 'Database update failed');
      }
      return data as MistLog;
    } else {
      // INSERT NEW RECORD
      const newRecord = {
        id: crypto.randomUUID(),
        ...sanitizedPayload,
      };

      const { data, error } = await supabase
        .from('mist_logs')
        .insert([newRecord])
        .select()
        .single();

      if (error) {
        console.error('[MistService insert Error]:', error);
        throw new Error(error.message || error.details || error.hint || 'Database insert failed');
      }
      return data as MistLog;
    }
  },

  /**
   * Soft-delete a mist log entry
   */
  async deleteMistLog(id: string): Promise<boolean> {
    const { error } = await supabase
      .from('mist_logs')
      .update({ 
        is_deleted: true 
      })
      .eq('id', id);

    if (error) {
      console.error('[MistService delete Error]:', error);
      throw new Error(error.message || error.details || 'Database delete failed');
    }
    return true;
  }
};

export default mistService;