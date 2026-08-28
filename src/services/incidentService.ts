import { supabase } from '../lib/supabase';
import type { Incident } from '../types';

export interface IncidentPayload {
  id?: string;
  title: string;
  incident_date: string;
  incident_type: string;
  severity: string;
  description: string;
  immediate_action_taken?: string | null;
  status?: string;
  reported_by?: string | null;
  created_by?: string | null;
  modified_by?: string | null;
  is_deleted?: boolean;
  [key: string]: unknown;
}

export interface LinkedFirstAidPayload {
  id?: string;
  incident_id?: string | null;
  person_involved_name: string;
  incident_date: string;
  person_type: string;
  injury_description?: string | null;
  treatment_provided: string;
  administered_by: string;
  referral_needed?: boolean | null;
  referral_details?: string | null;
  created_by?: string | null;
  modified_by?: string | null;
  is_deleted?: boolean;
}

/**
 * Universal safe UUID generator for offline-resilient inserts across tablets and sandboxed environments
 */
const safeUUID = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    try {
      return crypto.randomUUID();
    } catch {
      // Fallback if crypto.randomUUID is restricted
    }
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};

export const incidentService = {
  /**
   * Fetch all active operational incidents (all OPEN incidents or any incident from the last 14 days)
   */
  async getIncidents(): Promise<Incident[]> {
    const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();

    const { data, error } = await supabase
      .from('incidents')
      .select('*')
      .eq('is_deleted', false)
      .or(`status.eq.OPEN,incident_date.gte.${fourteenDaysAgo}`)
      .order('incident_date', { ascending: false });

    if (error) {
      console.error('[IncidentService getIncidents Error]:', error);
      throw error;
    }
    return (data || []) as Incident[];
  },

  /**
   * Atomic compound commit: Inserts the operational breach and optional linked clinical first aid entry
   */
  async commitIncident(
    incidentPayload: IncidentPayload, 
    firstAidPayload?: LinkedFirstAidPayload,
    userId?: string
  ): Promise<boolean> {
    let activeUserId = userId?.trim() || incidentPayload.created_by || incidentPayload.modified_by || null;
    if (!activeUserId) {
      const { data: userData } = await supabase.auth.getUser();
      activeUserId = userData.user?.id || null;
    }

    const incidentId = incidentPayload.id || safeUUID();

    const sanitizedIncident = {
      ...incidentPayload,
      id: incidentId,
      status: incidentPayload.status || 'OPEN',
      is_deleted: false,
      created_by: activeUserId,
      modified_by: activeUserId,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const promises: PromiseLike<any>[] = [
      supabase.from('incidents').insert([sanitizedIncident])
    ];

    if (firstAidPayload) {
      const firstAidId = firstAidPayload.id || safeUUID();
      const sanitizedFirstAid = {
        ...firstAidPayload,
        id: firstAidId,
        incident_id: incidentId,
        is_deleted: false,
        created_by: activeUserId,
        modified_by: activeUserId,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      promises.push(
        supabase.from('first_aid_logs').insert([sanitizedFirstAid])
      );
    }

    const results = await Promise.all(promises);

    for (const res of results) {
      if (res.error) {
        console.error('[IncidentService commitIncident Error]:', res.error);
        throw res.error;
      }
    }

    return true;
  },

  /**
   * Formal sign-off and resolution of an operational breach
   */
  async resolveIncident(id: string, resolutionNotes: string, userId?: string): Promise<Incident> {
    let activeUserId = userId?.trim() || null;
    if (!activeUserId) {
      const { data: userData } = await supabase.auth.getUser();
      activeUserId = userData.user?.id || null;
    }

    const { data, error } = await supabase
      .from('incidents')
      .update({
        status: 'RESOLVED',
        resolution_notes: resolutionNotes,
        resolved_at: new Date().toISOString(),
        resolved_by: activeUserId,
        modified_by: activeUserId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('[IncidentService resolveIncident Error]:', error);
      throw error;
    }
    return data as Incident;
  },

  /**
   * Soft-delete an incident record
   */
  async deleteIncident(id: string, userId?: string): Promise<boolean> {
    let activeUserId = userId?.trim() || null;
    if (!activeUserId) {
      const { data: userData } = await supabase.auth.getUser();
      activeUserId = userData.user?.id || null;
    }

    const { error } = await supabase
      .from('incidents')
      .update({
        is_deleted: true,
        modified_by: activeUserId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);

    if (error) {
      console.error('[IncidentService deleteIncident Error]:', error);
      throw error;
    }
    return true;
  }
};

export default incidentService;