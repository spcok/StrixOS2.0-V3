import { supabase } from '../lib/supabase';
import type { FeedLog, FeedingSchedule } from '../types';

export const feedingService = {
  async insertFeedLog(payloads: FeedLog | FeedLog[]): Promise<FeedLog[]> {
    const rawArray = Array.isArray(payloads) ? payloads : [payloads];
    const cleanPayloads = rawArray.map((p) => ({
      ...p,
      id:
        p.id ||
        (typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : Math.random().toString(36).substring(2)),
      is_deleted: false,
    }));

    const { data, error } = await supabase
      .from('feed_logs')
      .insert(cleanPayloads)
      .select();

    if (error) throw error;
    return (data || []) as FeedLog[];
  },

  async bulkCreateSchedules(
    schedules: Partial<FeedingSchedule>[],
    userId?: string
  ): Promise<FeedingSchedule[]> {
    const payload = schedules.map((s) => ({
      ...s,
      id: s.id || crypto.randomUUID(),
      created_by: userId || s.created_by,
      is_deleted: false,
      status: s.status || 'PENDING',
    }));

    const { data, error } = await supabase
      .from('feeding_schedules')
      .insert(payload)
      .select();

    if (error) throw error;
    return (data || []) as FeedingSchedule[];
  },
};

export default feedingService;