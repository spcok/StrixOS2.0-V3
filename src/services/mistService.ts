import { supabase } from '../lib/supabase';
import type { MistLevel } from '../components/husbandry/MistModal';

export interface MistLogPayload {
  id?: string;
  animal_id: string;
  recorded_by: string;
  recorded_at: string;
  created_by?: string | null;
  am_pm: 'AM' | 'PM';
  mist_level: MistLevel;
  notes?: string | null;
}

export interface MistLogRecord extends MistLogPayload {
  id: string;
  created_at?: string;
  is_deleted?: boolean;
}

export const mistService = {
  /**
   * Upserts a misting telemetry record.
   * Auto-assigns client-side UUIDs for offline mutation persistence.
   */
  async insertMistLog(payload: MistLogPayload): Promise<MistLogRecord> {
    const recordId =
      payload.id ||
      (typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : Math.random().toString(36).substring(2));

    const { data, error } = await supabase
      .from('mist_logs')
      .upsert({
        ...payload,
        id: recordId,
      })
      .select()
      .single();

    if (error) {
      console.warn('[mistService] Misting log upsert failed / deferred:', error.message);
      throw error;
    }

    return data as MistLogRecord;
  },

  /**
   * Retrieves the most recent misting record for a specific animal.
   */
  async getLatestMistLog(animalId: string): Promise<MistLogRecord | null> {
    if (!animalId) return null;

    const { data, error } = await supabase
      .from('mist_logs')
      .select('*')
      .eq('animal_id', animalId)
      .order('recorded_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.warn('[mistService] Failed to fetch latest mist log:', error.message);
      return null;
    }

    return (data || null) as MistLogRecord | null;
  },

  /**
   * Fetches misting history within a specific date range.
   */
  async getMistLogsByRange(
    animalId: string,
    startDate: string,
    endDate: string
  ): Promise<MistLogRecord[]> {
    if (!animalId) return [];

    const { data, error } = await supabase
      .from('mist_logs')
      .select('*')
      .eq('animal_id', animalId)
      .gte('recorded_at', `${startDate}T00:00:00.000Z`)
      .lte('recorded_at', `${endDate}T23:59:59.999Z`)
      .order('recorded_at', { ascending: false });

    if (error) throw error;
    return (data || []) as MistLogRecord[];
  },
};

export default mistService;