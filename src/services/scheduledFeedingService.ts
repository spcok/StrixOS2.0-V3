import { supabase } from '../lib/supabase';
import type { Animal, DietOutcome, FeedLog, FeedingSchedule } from '../types';

export interface FeedingScheduleWithAnimal extends FeedingSchedule {
  animals: Pick<Animal, 'id' | 'name' | 'species' | 'category' | 'profile_image_url'> | null;
}

export interface ScheduledFeedResolutionPayload {
  id?: string;
  animal_id: string;
  recorded_by?: string | null;
  recorded_at: string;
  created_by?: string | null;
  food_item?: string | null;
  food_type?: string | null;
  feed_method?: string | null;
  quantity?: number | null;
  quantity_offered?: number | null;
  quantity_consumed?: number | null;
  unit?: string | null;
  quantity_unit?: string | null;
  calci_dust_added?: boolean | null;
  outcome?: DietOutcome | string | null;
  schedule_id?: string | null;
  notes?: string | null;
}

export interface CreateFeedingScheduleInput {
  id?: string;
  animal_id: string;
  scheduled_date: string;
  food_type?: string | null;
  quantity?: number | null;
  quantity_unit?: string | null;
  schedule_mode?: string | null;
  selected_days?: string[] | null;
  supplements?: string | null;
  presentation_method?: string | null;
  notes?: string | null;
  calci_dust?: boolean;
  requires_calcidust?: boolean;
  status?: string;
  is_deleted?: boolean;
  created_by?: string | null;
}

export const scheduledFeedingService = {
  /**
   * 1. THE TRIAGE RADAR (For Dashboard)
   * Fetches the oldest PENDING schedule per animal to drive status badges[cite: 3].
   */
  async getNextPendingFeeds(category?: string): Promise<FeedingScheduleWithAnimal[]> {
    let query = supabase
      .from('feeding_schedules')
      .select('*, animals!inner(id, name, species, category, profile_image_url)')
      .eq('is_deleted', false)
      .eq('status', 'PENDING')
      .order('scheduled_date', { ascending: true });

    if (category && category !== 'ALL') {
      query = query.eq('animals.category', category);
    }

    const { data, error } = await query;
    if (error) {
      console.warn('Pending schedule fetch notice:', error.message);
      return [];
    }

    // Client-side reduction: Keep only the single earliest pending schedule per specimen[cite: 3]
    const uniqueAnimalMap = new Map<string, FeedingScheduleWithAnimal>();

    (data as unknown as FeedingScheduleWithAnimal[] | null)?.forEach((row) => {
      if (!uniqueAnimalMap.has(row.animal_id)) {
        uniqueAnimalMap.set(row.animal_id, row);
      }
    });

    return Array.from(uniqueAnimalMap.values());
  },

  /**
   * 2. THE 1-TAP RESOLUTION ENGINE
   * Atomic handoff: Inserts the historical log AND marks the pending schedule completed[cite: 3].
   */
  async resolveScheduledFeed(
    scheduleId: string,
    outcome: DietOutcome,
    logPayload: ScheduledFeedResolutionPayload
  ): Promise<FeedLog> {
    const resolvedStatus = outcome === 'EATEN' ? 'COMPLETED' : outcome;
    const recordId =
      logPayload.id ||
      (typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : Math.random().toString(36).substring(2));

    // A. Insert the immutable historical diet log[cite: 3]
    const { data: logData, error: logError } = await supabase
      .from('feed_logs')
      .insert([
        {
          ...logPayload,
          id: recordId,
          outcome,
          schedule_id: scheduleId,
          food_type: logPayload.food_type || logPayload.food_item || null,
          quantity_unit: logPayload.quantity_unit || logPayload.unit || 'whole_item',
          quantity_offered: logPayload.quantity_offered ?? logPayload.quantity ?? 0,
          quantity_consumed:
            logPayload.quantity_consumed ?? (outcome === 'EATEN' ? logPayload.quantity ?? 0 : 0),
        },
      ])
      .select()
      .single();

    if (logError) throw logError;

    // B. Promote the schedule row out of PENDING[cite: 3]
    const { error: scheduleError } = await supabase
      .from('feeding_schedules')
      .update({
        status: resolvedStatus,
        logged_feed_id: logData.id,
        updated_at: new Date().toISOString(),
      })
      .eq('id', scheduleId);

    if (scheduleError) {
      // Rollback: delete orphan log if schedule update fails[cite: 3]
      await supabase.from('feed_logs').delete().eq('id', logData.id);
      throw scheduleError;
    }

    return logData as FeedLog;
  },

  /**
   * 3. BULK MULTI-DATE SCHEDULE GENERATOR
   * Persists projected recurring/interval feeding schedules.
   */
  async bulkCreateSchedules(
    schedules: CreateFeedingScheduleInput[],
    userId?: string | null
  ): Promise<FeedingSchedule[]> {
    if (!schedules || schedules.length === 0) return [];

    const payload = schedules.map((schedule) => ({
      ...schedule,
      id:
        schedule.id ||
        (typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : Math.random().toString(36).substring(2)),
      created_by: userId || schedule.created_by || null,
      status: schedule.status || 'PENDING',
      is_deleted: false,
      quantity_unit: schedule.quantity_unit === 'item' ? 'whole_item' : schedule.quantity_unit || 'whole_item',
      calci_dust: Boolean(schedule.calci_dust ?? schedule.requires_calcidust ?? false),
      requires_calcidust: Boolean(schedule.calci_dust ?? schedule.requires_calcidust ?? false),
    }));

    const { data, error } = await supabase
      .from('feeding_schedules')
      .insert(payload)
      .select();

    if (error) {
      console.error('Failed to create feeding schedules:', error.message);
      throw error;
    }

    return (data || []) as FeedingSchedule[];
  },

  /**
   * 4. CYCLE MUTATIONS (Soft-Deletes)
   * Safely cancels future recurring interval diets without deleting historical records[cite: 3].
   */
  async softDeleteFutureSchedules(scheduleIds: string[]): Promise<void> {
    if (!scheduleIds || scheduleIds.length === 0) return;

    const { error } = await supabase
      .from('feeding_schedules')
      .update({
        is_deleted: true,
        updated_at: new Date().toISOString(),
      })
      .in('id', scheduleIds)
      .eq('status', 'PENDING');

    if (error) {
      console.error('Failed to soft-delete future feeding schedules:', error.message);
      throw error;
    }
  },

  /**
   * 5. SPECIMEN SCHEDULE LEDGER
   * Fetches active pending and upcoming schedules for a specimen.
   */
  async getSchedulesByAnimal(animalId: string): Promise<FeedingSchedule[]> {
    if (!animalId) return [];

    const { data, error } = await supabase
      .from('feeding_schedules')
      .select('*')
      .eq('animal_id', animalId)
      .eq('is_deleted', false)
      .order('scheduled_date', { ascending: true });

    if (error) throw error;
    return (data || []) as FeedingSchedule[];
  },
};

export default scheduledFeedingService;