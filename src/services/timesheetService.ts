import { supabase } from '../lib/supabase';
import type { Timesheet } from '../types';

export const timesheetService = {
  async getTimesheets(userIdFilter?: string): Promise<Timesheet[]> {
    const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();

    let query = supabase
      .from('timesheets')
      .select('*')
      .eq('is_deleted', false)
      .gte('shift_date', fourteenDaysAgo.split('T')[0])
      .order('clock_in_time', { ascending: false });

    if (userIdFilter && userIdFilter !== 'ALL') {
      query = query.eq('user_id', userIdFilter);
    }

    const { data, error } = await query;
    if (error) throw error;
    return (data || []) as Timesheet[];
  },

  async getStaffMembers() {
    const { data, error } = await supabase
      .from('users')
      .select('id, name, initials, email, role')
      .eq('is_deleted', false)
      .order('name');

    if (error) throw error;
    return data || [];
  },

  async getMyActiveShift(userId: string): Promise<Timesheet | null> {
    if (!userId) return null;
    const { data, error } = await supabase
      .from('timesheets')
      .select('*')
      .eq('user_id', userId)
      .is('clock_out_time', null)
      .eq('is_deleted', false)
      .maybeSingle();

    if (error) {
      console.error('[Timesheet Service] Error checking active shift:', error.message);
      return null;
    }
    return (data || null) as Timesheet | null;
  },

  async clockIn(payload: {
    id?: string;
    user_id?: string;
    shift_date: string;
    clock_in_time: string;
  }): Promise<Timesheet> {
    let activeUserId = payload.user_id;

    if (!activeUserId) {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      activeUserId = user?.id;
    }

    if (!activeUserId) throw new Error('Authentication required to clock in');

    const recordId =
      payload.id ||
      (typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : Math.random().toString(36).substring(2));

    const { data, error } = await supabase
      .from('timesheets')
      .insert([
        {
          id: recordId,
          user_id: activeUserId,
          shift_date: payload.shift_date,
          clock_in_time: payload.clock_in_time,
          status: 'ACTIVE',
          is_deleted: false,
        },
      ])
      .select()
      .single();

    if (error) throw error;
    return data as Timesheet;
  },

  async clockOut(id: string, clockOutTime: string): Promise<Timesheet> {
    const { data, error } = await supabase
      .from('timesheets')
      .update({
        clock_out_time: clockOutTime,
        status: 'APPROVED',
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data as Timesheet;
  },
};

export default timesheetService;