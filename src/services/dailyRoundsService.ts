import { supabase } from '../lib/supabase';
import type { DailyRound } from '../types';

export const dailyRoundsService = {
  async getRoundsByDateAndShift(date: string, shift: 'MORNING' | 'AFTERNOON'): Promise<DailyRound[]> {
    const { data, error } = await supabase
      .from('daily_rounds')
      .select('*')
      .eq('date', date)
      .eq('shift', shift)
      .eq('is_deleted', false);

    if (error) throw error;
    return (data || []) as DailyRound[];
  },

  async bulkUpsertRounds(rounds: Partial<DailyRound>[]): Promise<DailyRound[]> {
    if (!rounds || rounds.length === 0) return [];

    const { data, error } = await supabase
      .from('daily_rounds')
      .upsert(rounds, { onConflict: 'id' })
      .select();

    if (error) throw error;
    return (data || []) as DailyRound[];
  },

  async updateRoundNotes(roundId: string, notes: string | null): Promise<DailyRound> {
    const { data, error } = await supabase
      .from('daily_rounds')
      .update({
        animal_issue_note: notes,
      })
      .eq('id', roundId)
      .select()
      .single();

    if (error) throw error;
    return data as DailyRound;
  },
};