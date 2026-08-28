import { supabase } from '../lib/supabase';
import type { MaintenanceTicket, UserProfile } from '../types';

export interface MaintenanceStaffMember {
  id: string;
  name: string | null;
  initials: string | null;
  email: string | null;
  is_active?: boolean;
  is_deleted?: boolean;
}

export type MaintenancePriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type MaintenanceStatus = 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';

export interface MaintenanceTicketPayload {
  id?: string;
  title: string;
  description: string;
  location: string;
  category?: string | null;
  priority: MaintenancePriority | string;
  status?: MaintenanceStatus | string;
  reported_by?: string | null;
  assigned_to?: string | null;
  resolution_notes?: string | null;
  resolved_at?: string | null;
  resolved_by?: string | null;
  created_by?: string | null;
  modified_by?: string | null;
  is_deleted?: boolean;
  [key: string]: unknown;
}

/**
 * Universal safe UUID generator for offline-resilient inserts across tablets and sandboxed environments
 */
const safeUUID = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    try {
      return crypto.randomUUID();
    } catch {
      // Fallback if crypto.randomUUID fails in restricted contexts
    }
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};

export const maintenanceService = {
  /**
   * Fetch all active maintenance tickets ordered by creation date descending
   */
  async getTickets(): Promise<MaintenanceTicket[]> {
    const { data, error } = await supabase
      .from('maintenance_tickets')
      .select('*')
      .or('is_deleted.eq.false,is_deleted.is.null')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[MaintenanceService getTickets Error]:', error);
      throw error;
    }
    return (data || []) as MaintenanceTicket[];
  },

  /**
   * Fetch all staff members (including inactive/archived) so historical tickets display correctly
   */
  async getStaffMembers(): Promise<MaintenanceStaffMember[]> {
    const { data, error } = await supabase
      .from('users')
      .select('id, name, initials, email, is_deleted, is_active')
      .order('name', { ascending: true });

    if (error) {
      console.error('[MaintenanceService getStaffMembers Error]:', error);
      throw error;
    }
    return (data || []) as MaintenanceStaffMember[];
  },

  /**
   * Save or update a maintenance ticket with safe UUID allocation and audit tracking
   */
  async saveTicket(payload: MaintenanceTicketPayload, userId?: string): Promise<MaintenanceTicket> {
    let activeUserId = userId?.trim() || payload.modified_by?.trim() || payload.created_by?.trim() || null;
    if (!activeUserId) {
      const { data: userData } = await supabase.auth.getUser();
      activeUserId = userData.user?.id || null;
    }

    const isUpdate = Boolean(payload.id);
    const ticketId = payload.id || safeUUID();

    const sanitizedPayload = {
      ...payload,
      id: ticketId,
      status: payload.status || 'OPEN',
      priority: payload.priority || 'MEDIUM',
      reported_by: payload.reported_by || activeUserId,
      is_deleted: false,
      created_by: payload.created_by?.trim() || activeUserId,
      modified_by: activeUserId,
      updated_at: new Date().toISOString(),
    };

    if (isUpdate) {
      const { data, error } = await supabase
        .from('maintenance_tickets')
        .update(sanitizedPayload)
        .eq('id', ticketId)
        .select()
        .single();

      if (error) {
        console.error('[MaintenanceService updateTicket Error]:', error);
        throw error;
      }
      return data as MaintenanceTicket;
    } else {
      const { data, error } = await supabase
        .from('maintenance_tickets')
        .insert([{
          ...sanitizedPayload,
          created_at: new Date().toISOString(),
        }])
        .select()
        .single();

      if (error) {
        console.error('[MaintenanceService insertTicket Error]:', error);
        throw error;
      }
      return data as MaintenanceTicket;
    }
  },

  /**
   * Quick status resolution update helper
   */
  async updateTicketStatus(
    id: string, 
    status: MaintenanceStatus, 
    resolutionNotes?: string, 
    userId?: string
  ): Promise<MaintenanceTicket> {
    let activeUserId = userId?.trim() || null;
    if (!activeUserId) {
      const { data: userData } = await supabase.auth.getUser();
      activeUserId = userData.user?.id || null;
    }

    const isResolved = status === 'RESOLVED' || status === 'CLOSED';

    const { data, error } = await supabase
      .from('maintenance_tickets')
      .update({
        status,
        resolution_notes: resolutionNotes || null,
        resolved_at: isResolved ? new Date().toISOString() : null,
        resolved_by: isResolved ? activeUserId : null,
        modified_by: activeUserId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('[MaintenanceService updateTicketStatus Error]:', error);
      throw error;
    }
    return data as MaintenanceTicket;
  },

  /**
   * Soft-delete a maintenance ticket
   */
  async deleteTicket(id: string, userId?: string): Promise<boolean> {
    let activeUserId = userId?.trim() || null;
    if (!activeUserId) {
      const { data: userData } = await supabase.auth.getUser();
      activeUserId = userData.user?.id || null;
    }

    const { error } = await supabase
      .from('maintenance_tickets')
      .update({
        is_deleted: true,
        modified_by: activeUserId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);

    if (error) {
      console.error('[MaintenanceService deleteTicket Error]:', error);
      throw error;
    }
    return true;
  }
};

export default maintenanceService;