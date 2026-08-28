import { supabase } from '../lib/supabase';
import { FeedLogPayload, DietOutcome, FeedingScheduleWithAnimal } from '../types';

export const scheduledFeedingService = {
  /**
   * 1. THE TRIAGE RADAR (For Dashboard)
   * Fetches the single oldest PENDING schedule per animal to drive the colored badges.
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
    if (error) throw error;
    
    const uniqueAnimalMap = new Map<string, FeedingScheduleWithAnimal>();
    
    data?.forEach((row: any) => {
      if (!uniqueAnimalMap.has(row.animal_id)) {
        uniqueAnimalMap.set(row.animal_id, row as FeedingScheduleWithAnimal);
      }
    });

    return Array.from(uniqueAnimalMap.values());
  },

  /**
   * 2. THE 1-TAP RESOLUTION ENGINE
   * Atomic handoff: Inserts the historical log AND resolves the pending schedule.
   */
  async resolveScheduledFeed(
    scheduleId: string, 
    outcome: DietOutcome, 
    logPayload: FeedLogPayload
  ) {
    const resolvedStatus = outcome === 'EATEN' ? 'COMPLETED' : outcome;
    const activeUserId = (logPayload as any).created_by || (logPayload as any).recorded_by || null;

    // A. Insert the immutable historical log
    const { data: logData, error: logError } = await supabase
      .from('feed_logs') 
      .insert([{ 
        ...logPayload, 
        outcome: outcome,
        schedule_id: scheduleId,
        created_by: activeUserId,
        modified_by: activeUserId,
        is_deleted: false,
      }])
      .select()
      .single();

    if (logError) throw logError;

    // B. Promote the schedule row out of PENDING
    const { error: scheduleError } = await supabase
      .from('feeding_schedules')
      .update({ 
        status: resolvedStatus, 
        logged_feed_id: logData.id,
        modified_by: activeUserId,
        updated_at: new Date().toISOString() 
      })
      .eq('id', scheduleId);

    if (scheduleError) {
      await supabase.from('feed_logs').delete().eq('id', logData.id);
      throw scheduleError;
    }

    return logData;
  },

  /**
   * 3. CYCLE MUTATIONS (Soft-Deletes)
   */
  async softDeleteFutureSchedules(scheduleIds: string[], userId?: string) {
    if (!scheduleIds || scheduleIds.length === 0) return;

    const { error } = await supabase
      .from('feeding_schedules')
      .update({ 
        is_deleted: true, 
        modified_by: userId || null,
        updated_at: new Date().toISOString() 
      })
      .in('id', scheduleIds)
      .eq('status', 'PENDING');

    if (error) throw error;
  }
};

export default scheduledFeedingService;