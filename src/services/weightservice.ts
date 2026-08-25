import { supabase } from '../lib/supabase';
import type { WeightLog } from '../types';

export interface WeightLogPayload {
  id?: string;
  animal_id: string;
  recorded_by?: string | null;
  weighed_by?: string | null;
  recorded_at: string;
  created_by?: string | null;
  weight_grams: number;
  am_pm?: 'AM' | 'PM' | string | null;
  has_cast?: boolean | null;
  notes?: string | null;
}

export const weightService = {
  /**
   * Inserts or updates a bio-weight record.
   * Auto-assigns client-side UUIDs to ensure stable record tracking during offline mutation queues.
   */
  async insertWeightLog(payload: WeightLogPayload): Promise<WeightLog> {
    const recordId =
      payload.id ||
      (typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
            const r = (Math.random() * 16) | 0;
            const v = c === 'x' ? r : (r & 0x3) | 0x8;
            return v.toString(16);
          }));

    const { data, error } = await supabase
      .from('weight_logs')
      .upsert({
        ...payload,
        id: recordId,
        weighed_by: payload.recorded_by || payload.weighed_by || null,
      })
      .select()
      .single();

    if (error) {
      console.warn('Network unreachable or weight upsert deferred. Preserved in offline queue:', error.message);
      throw error;
    }

    return data as WeightLog;
  },

  /**
   * Fetches the single latest recorded bio-weight for a specimen.
   */
  async getLatestWeight(animalId: string): Promise<WeightLog | null> {
    if (!animalId) return null;

    const { data, error } = await supabase
      .from('weight_logs')
      .select('*')
      .eq('animal_id', animalId)
      .order('recorded_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.warn('Weight fetch notice:', error.message);
      return null;
    }

    return (data || null) as WeightLog | null;
  },

  /**
   * Fetches bio-weight logs for a specific animal with a configurable limit.
   */
  async getWeightsByAnimal(animalId: string, limit = 50): Promise<WeightLog[]> {
    if (!animalId) return [];

    const { data, error } = await supabase
      .from('weight_logs')
      .select('*')
      .eq('animal_id', animalId)
      .order('recorded_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return (data || []) as WeightLog[];
  },

  /**
   * Fetches all weight logs across the collection for a specific calendar date range.
   */
  async getWeightsByDateRange(startDate: string, endDate: string): Promise<WeightLog[]> {
    const { data, error } = await supabase
      .from('weight_logs')
      .select('*')
      .gte('recorded_at', `${startDate}T00:00:00.000Z`)
      .lte('recorded_at', `${endDate}T23:59:59.999Z`)
      .order('recorded_at', { ascending: false });

    if (error) throw error;
    return (data || []) as WeightLog[];
  },

  /**
   * Deletes a weight log record by ID.
   */
  async deleteWeightLog(id: string): Promise<boolean> {
    const { error } = await supabase
      .from('weight_logs')
      .delete()
      .eq('id', id);

    if (error) throw error;
    return true;
  },
};

export default weightService;