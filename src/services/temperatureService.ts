import { supabase } from '../lib/supabase';
import type { TemperatureLog } from '../types';

export interface TemperatureLogPayload {
  id?: string;
  animal_id: string;
  recorded_by: string;
  recorded_at: string;
  created_by?: string | null;
  temp_ambient?: number | null;
  temp_basking?: number | null;
  temp_cool?: number | null;
  temp_average?: number | null;
  notes?: string | null;
}

export const temperatureService = {
  /**
   * Upserts a thermal telemetry record.
   * Auto-assigns client-side UUIDs for offline persistence queueing.
   */
  async insertTemperatureLog(payload: TemperatureLogPayload): Promise<TemperatureLog> {
    const recordId =
      payload.id ||
      (typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : Math.random().toString(36).substring(2));

    const { data, error } = await supabase
      .from('temperature_logs')
      .upsert({
        ...payload,
        id: recordId,
      })
      .select()
      .single();

    if (error) {
      console.warn('Temperature upsert deferred to offline queue:', error.message);
      throw error;
    }

    return data as TemperatureLog;
  },

  /**
   * Fetches latest environmental temperature for a specimen.
   */
  async getLatestTemperature(animalId: string): Promise<TemperatureLog | null> {
    if (!animalId) return null;

    const { data, error } = await supabase
      .from('temperature_logs')
      .select('*')
      .eq('animal_id', animalId)
      .order('recorded_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.warn('Temperature retrieval failed:', error.message);
      return null;
    }

    return (data || null) as TemperatureLog | null;
  },
};

export default temperatureService;