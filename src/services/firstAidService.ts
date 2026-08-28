import { supabase } from '../lib/supabase';

export interface StaffMember {
  id: string;
  name?: string;
  initials?: string;
  email?: string;
  role?: string;
}

export const firstAidService = {
  async getFirstAidLogs() {
    const { data, error } = await supabase
      .from('first_aid_logs')
      .select('*')
      .order('incident_date', { ascending: false });
    if (error) {
      console.error('[FirstAidService getFirstAidLogs Error]:', error);
      return [];
    }
    return data || [];
  },

  async getStaffMembers(): Promise<StaffMember[]> {
    const { data, error } = await supabase
      .from('users')
      .select('id, name, initials, email, role')
      .eq('is_deleted', false)
      .order('name', { ascending: true });
    if (error) {
      console.error('[FirstAidService getStaffMembers Error]:', error);
      return [];
    }
    return data || [];
  },

  async commitFirstAidLog(firstAidPayload: any, incidentPayload?: any) {
    let incidentId = null;

    if (incidentPayload) {
      const { data: incidentData, error: incidentError } = await supabase
        .from('incidents')
        .insert([{
          ...incidentPayload,
          status: 'OPEN',
          is_deleted: false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }])
        .select()
        .single();

      if (incidentError) {
        console.error('[FirstAidService commitIncident Error]:', incidentError);
        throw incidentError;
      }
      incidentId = incidentData?.id;
    }

    const { data, error } = await supabase
      .from('first_aid_logs')
      .insert([{
        ...firstAidPayload,
        incident_id: incidentId,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }])
      .select()
      .single();

    if (error) {
      console.error('[FirstAidService commitFirstAidLog Error]:', error);
      throw error;
    }
    return data;
  }
};

export default firstAidService;
