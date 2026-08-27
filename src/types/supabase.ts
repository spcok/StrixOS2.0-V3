export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      animals: {
        Row: {
          id: string
          parent_group_id: string | null
          census_count: number
          name: string | null
          species: string | null
          latin_name: string | null
          category: string | null
          location: string | null
          profile_image_url: string | null
          distribution_map_url: string | null
          hazard_rating: string | null
          is_venomous: boolean | null
          weight_unit: string
          flying_weight: number | null
          winter_weight: number | null
          average_target_weight: number | null
          date_of_birth: string | null
          is_dob_unknown: boolean | null
          gender: string | null
          microchip_id: string | null
          ring_number: string | null
          has_no_id: boolean | null
          red_list_status: string
          description: string | null
          special_requirements: string | null
          critical_husbandry_notes: string | null
          ambient_temp_only: boolean | null
          target_day_temp_c: number | null
          target_night_temp_c: number | null
          water_tipping_temp: number | null
          target_humidity_min_percent: number | null
          target_humidity_max_percent: number | null
          misting_frequency: string | null
          acquisition_date: string | null
          acquisition_type: string | null
          origin: string | null
          origin_location: string | null
          lineage_unknown: boolean | null
          sire_id: string | null
          dam_id: string | null
          is_boarding: boolean | null
          is_quarantine: boolean | null
          display_order: number
          is_deleted: boolean | null
          created_at: string | null
          updated_at: string | null
          created_by: string | null
          modified_by: string | null
          status: string | null
          record_type: string | null
          archive_reason: string | null
          is_dob_estimated: boolean | null
          misting_not_required: boolean | null
          archive_destination: string | null
          archived_at: string | null
          archived_by: string | null
        }
        Insert: {
          id?: string
          parent_group_id?: string | null
          census_count: number
          name?: string | null
          species?: string | null
          latin_name?: string | null
          category?: string | null
          location?: string | null
          profile_image_url?: string | null
          distribution_map_url?: string | null
          hazard_rating?: string | null
          is_venomous?: boolean | null
          weight_unit: string
          flying_weight?: number | null
          winter_weight?: number | null
          average_target_weight?: number | null
          date_of_birth?: string | null
          is_dob_unknown?: boolean | null
          gender?: string | null
          microchip_id?: string | null
          ring_number?: string | null
          has_no_id?: boolean | null
          red_list_status: string
          description?: string | null
          special_requirements?: string | null
          critical_husbandry_notes?: string | null
          ambient_temp_only?: boolean | null
          target_day_temp_c?: number | null
          target_night_temp_c?: number | null
          water_tipping_temp?: number | null
          target_humidity_min_percent?: number | null
          target_humidity_max_percent?: number | null
          misting_frequency?: string | null
          acquisition_date?: string | null
          acquisition_type?: string | null
          origin?: string | null
          origin_location?: string | null
          lineage_unknown?: boolean | null
          sire_id?: string | null
          dam_id?: string | null
          is_boarding?: boolean | null
          is_quarantine?: boolean | null
          display_order: number
          is_deleted?: boolean | null
          created_at?: string | null
          updated_at?: string | null
          created_by?: string | null
          modified_by?: string | null
          status?: string | null
          record_type?: string | null
          archive_reason?: string | null
          is_dob_estimated?: boolean | null
          misting_not_required?: boolean | null
          archive_destination?: string | null
          archived_at?: string | null
          archived_by?: string | null
        }
        Update: {
          id?: string
          parent_group_id?: string | null
          census_count?: number
          name?: string | null
          species?: string | null
          latin_name?: string | null
          category?: string | null
          location?: string | null
          profile_image_url?: string | null
          distribution_map_url?: string | null
          hazard_rating?: string | null
          is_venomous?: boolean | null
          weight_unit?: string
          flying_weight?: number | null
          winter_weight?: number | null
          average_target_weight?: number | null
          date_of_birth?: string | null
          is_dob_unknown?: boolean | null
          gender?: string | null
          microchip_id?: string | null
          ring_number?: string | null
          has_no_id?: boolean | null
          red_list_status?: string
          description?: string | null
          special_requirements?: string | null
          critical_husbandry_notes?: string | null
          ambient_temp_only?: boolean | null
          target_day_temp_c?: number | null
          target_night_temp_c?: number | null
          water_tipping_temp?: number | null
          target_humidity_min_percent?: number | null
          target_humidity_max_percent?: number | null
          misting_frequency?: string | null
          acquisition_date?: string | null
          acquisition_type?: string | null
          origin?: string | null
          origin_location?: string | null
          lineage_unknown?: boolean | null
          sire_id?: string | null
          dam_id?: string | null
          is_boarding?: boolean | null
          is_quarantine?: boolean | null
          display_order?: number
          is_deleted?: boolean | null
          created_at?: string | null
          updated_at?: string | null
          created_by?: string | null
          modified_by?: string | null
          status?: string | null
          record_type?: string | null
          archive_reason?: string | null
          is_dob_estimated?: boolean | null
          misting_not_required?: boolean | null
          archive_destination?: string | null
          archived_at?: string | null
          archived_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: animals_created_by_users_id_fk
            columns: [created_by]
            isOneToOne: false
            referencedRelation: users
            referencedColumns: [id]
          },
          {
            foreignKeyName: animals_modified_by_users_id_fk
            columns: [modified_by]
            isOneToOne: false
            referencedRelation: users
            referencedColumns: [id]
          },
          {
            foreignKeyName: animals_archived_by_fkey
            columns: [archived_by]
            isOneToOne: false
            referencedRelation: users
            referencedColumns: [id]
          },
        ]
      }
      clinical_attachments: {
        Row: {
          id: string
          record_id: string
          file_name: string
          file_type: string
          file_url: string
          is_deleted: boolean | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          record_id: string
          file_name: string
          file_type: string
          file_url: string
          is_deleted?: boolean | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          record_id?: string
          file_name?: string
          file_type?: string
          file_url?: string
          is_deleted?: boolean | null
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: [
        ]
      }
      clinical_records: {
        Row: {
          id: string
          animal_id: string
          record_type: string
          record_date: string
          soap_subjective: string
          soap_objective: string
          soap_assessment: string
          soap_plan: string
          conductor_role: string
          conducted_by: string
          external_vet_name: string | null
          external_vet_clinic: string | null
          is_deleted: boolean | null
          created_by: string
          modified_by: string
          created_at: string | null
          updated_at: string | null
          title: string
          weight_log_id: string | null
        }
        Insert: {
          id?: string
          animal_id: string
          record_type: string
          record_date: string
          soap_subjective: string
          soap_objective: string
          soap_assessment: string
          soap_plan: string
          conductor_role: string
          conducted_by?: string
          external_vet_name?: string | null
          external_vet_clinic?: string | null
          is_deleted?: boolean | null
          created_by?: string
          modified_by: string
          created_at?: string | null
          updated_at?: string | null
          title: string
          weight_log_id?: string | null
        }
        Update: {
          id?: string
          animal_id?: string
          record_type?: string
          record_date?: string
          soap_subjective?: string
          soap_objective?: string
          soap_assessment?: string
          soap_plan?: string
          conductor_role?: string
          conducted_by?: string
          external_vet_name?: string | null
          external_vet_clinic?: string | null
          is_deleted?: boolean | null
          created_by?: string
          modified_by?: string
          created_at?: string | null
          updated_at?: string | null
          title?: string
          weight_log_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: clinical_records_animal_id_animals_id_fk
            columns: [animal_id]
            isOneToOne: false
            referencedRelation: animals
            referencedColumns: [id]
          },
          {
            foreignKeyName: clinical_records_conducted_by_users_id_fk
            columns: [conducted_by]
            isOneToOne: false
            referencedRelation: users
            referencedColumns: [id]
          },
          {
            foreignKeyName: clinical_records_created_by_users_id_fk
            columns: [created_by]
            isOneToOne: false
            referencedRelation: users
            referencedColumns: [id]
          },
          {
            foreignKeyName: clinical_records_modified_by_users_id_fk
            columns: [modified_by]
            isOneToOne: false
            referencedRelation: users
            referencedColumns: [id]
          },
          {
            foreignKeyName: clinical_records_weight_log_id_fkey
            columns: [weight_log_id]
            isOneToOne: false
            referencedRelation: weight_logs
            referencedColumns: [id]
          },
        ]
      }
      clinical_schedule: {
        Row: {
          id: string
          animal_id: string
          schedule_type: string
          medication_name: string
          dosage: string
          frequency: string
          start_date: string
          end_date: string | null
          status: string
          is_deleted: boolean | null
          created_by: string
          modified_by: string
          created_at: string | null
          updated_at: string | null
          notes: string | null
          instructions: string | null
        }
        Insert: {
          id?: string
          animal_id: string
          schedule_type: string
          medication_name: string
          dosage: string
          frequency: string
          start_date: string
          end_date?: string | null
          status: string
          is_deleted?: boolean | null
          created_by?: string
          modified_by: string
          created_at?: string | null
          updated_at?: string | null
          notes?: string | null
          instructions?: string | null
        }
        Update: {
          id?: string
          animal_id?: string
          schedule_type?: string
          medication_name?: string
          dosage?: string
          frequency?: string
          start_date?: string
          end_date?: string | null
          status?: string
          is_deleted?: boolean | null
          created_by?: string
          modified_by?: string
          created_at?: string | null
          updated_at?: string | null
          notes?: string | null
          instructions?: string | null
        }
        Relationships: [
          {
            foreignKeyName: clinical_schedule_animal_id_animals_id_fk
            columns: [animal_id]
            isOneToOne: false
            referencedRelation: animals
            referencedColumns: [id]
          },
          {
            foreignKeyName: clinical_schedule_created_by_users_id_fk
            columns: [created_by]
            isOneToOne: false
            referencedRelation: users
            referencedColumns: [id]
          },
          {
            foreignKeyName: clinical_schedule_modified_by_users_id_fk
            columns: [modified_by]
            isOneToOne: false
            referencedRelation: users
            referencedColumns: [id]
          },
        ]
      }
      daily_rounds: {
        Row: {
          id: string
          animal_id: string
          date: string
          shift: string
          section: string | null
          completed_by: string | null
          completed_at: string | null
          status: string
          animal_issue_note: string | null
          is_deleted: boolean | null
          created_by: string | null
          modified_by: string | null
          created_at: string | null
          updated_at: string | null
          requires_followup: boolean | null
          followup_notes: string | null
          is_alive: boolean | null
          water_checked: boolean | null
          locks_secured: boolean | null
        }
        Insert: {
          id?: string
          animal_id: string
          date: string
          shift: string
          section?: string | null
          completed_by?: string | null
          completed_at?: string | null
          status: string
          animal_issue_note?: string | null
          is_deleted?: boolean | null
          created_by?: string | null
          modified_by?: string | null
          created_at?: string | null
          updated_at?: string | null
          requires_followup?: boolean | null
          followup_notes?: string | null
          is_alive?: boolean | null
          water_checked?: boolean | null
          locks_secured?: boolean | null
        }
        Update: {
          id?: string
          animal_id?: string
          date?: string
          shift?: string
          section?: string | null
          completed_by?: string | null
          completed_at?: string | null
          status?: string
          animal_issue_note?: string | null
          is_deleted?: boolean | null
          created_by?: string | null
          modified_by?: string | null
          created_at?: string | null
          updated_at?: string | null
          requires_followup?: boolean | null
          followup_notes?: string | null
          is_alive?: boolean | null
          water_checked?: boolean | null
          locks_secured?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: daily_rounds_animal_id_animals_id_fk
            columns: [animal_id]
            isOneToOne: false
            referencedRelation: animals
            referencedColumns: [id]
          },
          {
            foreignKeyName: daily_rounds_created_by_users_id_fk
            columns: [created_by]
            isOneToOne: false
            referencedRelation: users
            referencedColumns: [id]
          },
          {
            foreignKeyName: daily_rounds_modified_by_users_id_fk
            columns: [modified_by]
            isOneToOne: false
            referencedRelation: users
            referencedColumns: [id]
          },
        ]
      }
      death_logs: {
        Row: {
          id: string
          animal_id: string
          date_of_death: string
          manner_of_death: string
          cause_of_death: string | null
          necropsy_notes: string | null
          logged_by: string | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          animal_id: string
          date_of_death: string
          manner_of_death: string
          cause_of_death?: string | null
          necropsy_notes?: string | null
          logged_by?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          animal_id?: string
          date_of_death?: string
          manner_of_death?: string
          cause_of_death?: string | null
          necropsy_notes?: string | null
          logged_by?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: death_logs_animal_id_fkey
            columns: [animal_id]
            isOneToOne: false
            referencedRelation: animals
            referencedColumns: [id]
          },
          {
            foreignKeyName: death_logs_logged_by_fkey
            columns: [logged_by]
            isOneToOne: false
            referencedRelation: users
            referencedColumns: [id]
          },
        ]
      }
      event_commercials: {
        Row: {
          id: string
          event_id: string
          client_full_name: string
          client_email: string | null
          client_billing_address: string | null
          payment_status: Database['public']['Enums']['event_payment_phase']
          total_amount: number | null
          deposit_amount: number | null
          deposit_paid_at: string | null
          deposit_due_date: string | null
          balance_due_date: string | null
          balance_paid_at: string | null
          xero_invoice_number: string | null
          xero_invoice_id: string | null
          billing_notes: string | null
          created_at: string | null
          updated_at: string | null
          created_by: string | null
          modified_by: string | null
        }
        Insert: {
          id?: string
          event_id: string
          client_full_name: string
          client_email?: string | null
          client_billing_address?: string | null
          payment_status?: Database['public']['Enums']['event_payment_phase']
          total_amount?: number | null
          deposit_amount?: number | null
          deposit_paid_at?: string | null
          deposit_due_date?: string | null
          balance_due_date?: string | null
          balance_paid_at?: string | null
          xero_invoice_number?: string | null
          xero_invoice_id?: string | null
          billing_notes?: string | null
          created_at?: string | null
          updated_at?: string | null
          created_by?: string | null
          modified_by?: string | null
        }
        Update: {
          id?: string
          event_id?: string
          client_full_name?: string
          client_email?: string | null
          client_billing_address?: string | null
          payment_status?: Database['public']['Enums']['event_payment_phase']
          total_amount?: number | null
          deposit_amount?: number | null
          deposit_paid_at?: string | null
          deposit_due_date?: string | null
          balance_due_date?: string | null
          balance_paid_at?: string | null
          xero_invoice_number?: string | null
          xero_invoice_id?: string | null
          billing_notes?: string | null
          created_at?: string | null
          updated_at?: string | null
          created_by?: string | null
          modified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: event_commercials_modified_by_fkey
            columns: [modified_by]
            isOneToOne: false
            referencedRelation: users
            referencedColumns: [id]
          },
          {
            foreignKeyName: event_commercials_event_id_fkey
            columns: [event_id]
            isOneToOne: false
            referencedRelation: events_calendar
            referencedColumns: [id]
          },
          {
            foreignKeyName: event_commercials_created_by_fkey
            columns: [created_by]
            isOneToOne: false
            referencedRelation: users
            referencedColumns: [id]
          },
        ]
      }
      event_staff_allocations: {
        Row: {
          id: string
          event_id: string
          user_id: string
          role_at_event: string | null
          assigned_at: string | null
          created_by: string | null
        }
        Insert: {
          id?: string
          event_id: string
          user_id: string
          role_at_event?: string | null
          assigned_at?: string | null
          created_by?: string | null
        }
        Update: {
          id?: string
          event_id?: string
          user_id?: string
          role_at_event?: string | null
          assigned_at?: string | null
          created_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: event_staff_allocations_event_id_fkey
            columns: [event_id]
            isOneToOne: false
            referencedRelation: events_calendar
            referencedColumns: [id]
          },
          {
            foreignKeyName: event_staff_allocations_user_id_fkey
            columns: [user_id]
            isOneToOne: false
            referencedRelation: users
            referencedColumns: [id]
          },
          {
            foreignKeyName: event_staff_allocations_created_by_fkey
            columns: [created_by]
            isOneToOne: false
            referencedRelation: users
            referencedColumns: [id]
          },
        ]
      }
      events_animals: {
        Row: {
          id: string
          event_id: string
          animal_id: string
          role_description: string | null
          assigned_at: string | null
          created_by: string | null
        }
        Insert: {
          id?: string
          event_id: string
          animal_id: string
          role_description?: string | null
          assigned_at?: string | null
          created_by?: string | null
        }
        Update: {
          id?: string
          event_id?: string
          animal_id?: string
          role_description?: string | null
          assigned_at?: string | null
          created_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: events_animals_event_id_fkey
            columns: [event_id]
            isOneToOne: false
            referencedRelation: events_calendar
            referencedColumns: [id]
          },
          {
            foreignKeyName: events_animals_animal_id_fkey
            columns: [animal_id]
            isOneToOne: false
            referencedRelation: animals
            referencedColumns: [id]
          },
          {
            foreignKeyName: events_animals_created_by_fkey
            columns: [created_by]
            isOneToOne: false
            referencedRelation: users
            referencedColumns: [id]
          },
        ]
      }
      events_calendar: {
        Row: {
          id: string
          title: string
          event_type: string
          description: string | null
          start_time: string
          end_time: string
          rehearsal_time: string | null
          venue_address: string | null
          wedding_ring_delivery_only: boolean | null
          wedding_flying_participant: string | null
          school_talk_curriculum: string | null
          party_type: string | null
          site_contact_name: string
          site_contact_phone: string | null
          voucher_id: string | null
          is_deleted: boolean | null
          created_at: string | null
          updated_at: string | null
          created_by: string | null
          modified_by: string | null
          rehearsal_at_centre_date: string | null
          rehearsal_at_centre_time: string | null
        }
        Insert: {
          id?: string
          title: string
          event_type?: string
          description?: string | null
          start_time: string
          end_time: string
          rehearsal_time?: string | null
          venue_address?: string | null
          wedding_ring_delivery_only?: boolean | null
          wedding_flying_participant?: string | null
          school_talk_curriculum?: string | null
          party_type?: string | null
          site_contact_name: string
          site_contact_phone?: string | null
          voucher_id?: string | null
          is_deleted?: boolean | null
          created_at?: string | null
          updated_at?: string | null
          created_by?: string | null
          modified_by?: string | null
          rehearsal_at_centre_date?: string | null
          rehearsal_at_centre_time?: string | null
        }
        Update: {
          id?: string
          title?: string
          event_type?: string
          description?: string | null
          start_time?: string
          end_time?: string
          rehearsal_time?: string | null
          venue_address?: string | null
          wedding_ring_delivery_only?: boolean | null
          wedding_flying_participant?: string | null
          school_talk_curriculum?: string | null
          party_type?: string | null
          site_contact_name?: string
          site_contact_phone?: string | null
          voucher_id?: string | null
          is_deleted?: boolean | null
          created_at?: string | null
          updated_at?: string | null
          created_by?: string | null
          modified_by?: string | null
          rehearsal_at_centre_date?: string | null
          rehearsal_at_centre_time?: string | null
        }
        Relationships: [
          {
            foreignKeyName: events_calendar_voucher_id_fkey
            columns: [voucher_id]
            isOneToOne: false
            referencedRelation: vouchers
            referencedColumns: [id]
          },
          {
            foreignKeyName: events_calendar_created_by_fkey
            columns: [created_by]
            isOneToOne: false
            referencedRelation: users
            referencedColumns: [id]
          },
          {
            foreignKeyName: events_calendar_modified_by_fkey
            columns: [modified_by]
            isOneToOne: false
            referencedRelation: users
            referencedColumns: [id]
          },
        ]
      }
      external_directory: {
        Row: {
          id: string
          name: string
          role: string
          phone: string | null
          email: string | null
          address: string | null
          is_deleted: boolean | null
          created_at: string | null
          updated_at: string | null
          _modified: string | null
        }
        Insert: {
          id?: string
          name: string
          role: string
          phone?: string | null
          email?: string | null
          address?: string | null
          is_deleted?: boolean | null
          created_at?: string | null
          updated_at?: string | null
          _modified?: string | null
        }
        Update: {
          id?: string
          name?: string
          role?: string
          phone?: string | null
          email?: string | null
          address?: string | null
          is_deleted?: boolean | null
          created_at?: string | null
          updated_at?: string | null
          _modified?: string | null
        }
        Relationships: [
        ]
      }
      external_transfers: {
        Row: {
          id: string
          animal_id: string | null
          transfer_type: string
          transfer_date: string
          entity_name: string
          entity_contact: string | null
          reason: string | null
          notes: string | null
          is_deleted: boolean | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          animal_id?: string | null
          transfer_type: string
          transfer_date: string
          entity_name: string
          entity_contact?: string | null
          reason?: string | null
          notes?: string | null
          is_deleted?: boolean | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          animal_id?: string | null
          transfer_type?: string
          transfer_date?: string
          entity_name?: string
          entity_contact?: string | null
          reason?: string | null
          notes?: string | null
          is_deleted?: boolean | null
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: external_transfers_animal_id_animals_id_fk
            columns: [animal_id]
            isOneToOne: false
            referencedRelation: animals
            referencedColumns: [id]
          },
        ]
      }
      feed_logs: {
        Row: {
          id: string
          animal_id: string
          recorded_by: string
          recorded_at: string
          created_by: string | null
          created_at: string | null
          modified_by: string | null
          modified_at: string | null
          is_deleted: boolean | null
          notes: string | null
          food_item: string
          feed_method: string | null
          quantity: number
          unit: string
          calci_dust_added: boolean | null
          schedule_id: string | null
          outcome: string | null
        }
        Insert: {
          id?: string
          animal_id: string
          recorded_by: string
          recorded_at: string
          created_by?: string | null
          created_at?: string | null
          modified_by?: string | null
          modified_at?: string | null
          is_deleted?: boolean | null
          notes?: string | null
          food_item: string
          feed_method?: string | null
          quantity: number
          unit: string
          calci_dust_added?: boolean | null
          schedule_id?: string | null
          outcome?: string | null
        }
        Update: {
          id?: string
          animal_id?: string
          recorded_by?: string
          recorded_at?: string
          created_by?: string | null
          created_at?: string | null
          modified_by?: string | null
          modified_at?: string | null
          is_deleted?: boolean | null
          notes?: string | null
          food_item?: string
          feed_method?: string | null
          quantity?: number
          unit?: string
          calci_dust_added?: boolean | null
          schedule_id?: string | null
          outcome?: string | null
        }
        Relationships: [
          {
            foreignKeyName: feed_logs_animal_id_fkey
            columns: [animal_id]
            isOneToOne: false
            referencedRelation: animals
            referencedColumns: [id]
          },
        ]
      }
      feeding_schedules: {
        Row: {
          id: string
          animal_id: string
          scheduled_date: string
          food_type: string
          quantity: number
          quantity_unit: string
          status: string
          completed_at: string | null
          completed_by: string | null
          is_deleted: boolean | null
          created_by: string
          modified_by: string
          created_at: string | null
          updated_at: string | null
          notes: string | null
          supplements: string | null
          presentation_method: string | null
          logged_feed_id: string | null
        }
        Insert: {
          id?: string
          animal_id: string
          scheduled_date: string
          food_type: string
          quantity: number
          quantity_unit: string
          status: string
          completed_at?: string | null
          completed_by?: string | null
          is_deleted?: boolean | null
          created_by?: string
          modified_by: string
          created_at?: string | null
          updated_at?: string | null
          notes?: string | null
          supplements?: string | null
          presentation_method?: string | null
          logged_feed_id?: string | null
        }
        Update: {
          id?: string
          animal_id?: string
          scheduled_date?: string
          food_type?: string
          quantity?: number
          quantity_unit?: string
          status?: string
          completed_at?: string | null
          completed_by?: string | null
          is_deleted?: boolean | null
          created_by?: string
          modified_by?: string
          created_at?: string | null
          updated_at?: string | null
          notes?: string | null
          supplements?: string | null
          presentation_method?: string | null
          logged_feed_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: feeding_schedules_animal_id_animals_id_fk
            columns: [animal_id]
            isOneToOne: false
            referencedRelation: animals
            referencedColumns: [id]
          },
          {
            foreignKeyName: feeding_schedules_created_by_users_id_fk
            columns: [created_by]
            isOneToOne: false
            referencedRelation: users
            referencedColumns: [id]
          },
          {
            foreignKeyName: feeding_schedules_modified_by_users_id_fk
            columns: [modified_by]
            isOneToOne: false
            referencedRelation: users
            referencedColumns: [id]
          },
        ]
      }
      first_aid_logs: {
        Row: {
          id: string
          incident_id: string | null
          person_involved_name: string
          incident_date: string
          person_type: string
          treatment_provided: string
          administered_by: string
          is_deleted: boolean | null
          created_at: string | null
          updated_at: string | null
          _modified: string | null
          injury_description: string | null
          referral_needed: boolean | null
          referral_details: string | null
        }
        Insert: {
          id?: string
          incident_id?: string | null
          person_involved_name: string
          incident_date: string
          person_type: string
          treatment_provided: string
          administered_by?: string
          is_deleted?: boolean | null
          created_at?: string | null
          updated_at?: string | null
          _modified?: string | null
          injury_description?: string | null
          referral_needed?: boolean | null
          referral_details?: string | null
        }
        Update: {
          id?: string
          incident_id?: string | null
          person_involved_name?: string
          incident_date?: string
          person_type?: string
          treatment_provided?: string
          administered_by?: string
          is_deleted?: boolean | null
          created_at?: string | null
          updated_at?: string | null
          _modified?: string | null
          injury_description?: string | null
          referral_needed?: boolean | null
          referral_details?: string | null
        }
        Relationships: [
        ]
      }
      incidents: {
        Row: {
          id: string
          title: string
          incident_date: string
          incident_type: string
          severity: string
          description: string
          immediate_action_taken: string | null
          reported_by: string | null
          is_deleted: boolean | null
          created_at: string | null
          updated_at: string | null
          _modified: string | null
          status: string | null
          resolution_notes: string | null
        }
        Insert: {
          id?: string
          title: string
          incident_date: string
          incident_type: string
          severity: string
          description: string
          immediate_action_taken?: string | null
          reported_by?: string | null
          is_deleted?: boolean | null
          created_at?: string | null
          updated_at?: string | null
          _modified?: string | null
          status?: string | null
          resolution_notes?: string | null
        }
        Update: {
          id?: string
          title?: string
          incident_date?: string
          incident_type?: string
          severity?: string
          description?: string
          immediate_action_taken?: string | null
          reported_by?: string | null
          is_deleted?: boolean | null
          created_at?: string | null
          updated_at?: string | null
          _modified?: string | null
          status?: string | null
          resolution_notes?: string | null
        }
        Relationships: [
        ]
      }
      internal_movements: {
        Row: {
          id: string
          animal_id: string | null
          movement_date: string
          from_location: string | null
          to_location: string
          reason: string | null
          notes: string | null
          is_deleted: boolean | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          animal_id?: string | null
          movement_date: string
          from_location?: string | null
          to_location: string
          reason?: string | null
          notes?: string | null
          is_deleted?: boolean | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          animal_id?: string | null
          movement_date?: string
          from_location?: string | null
          to_location?: string
          reason?: string | null
          notes?: string | null
          is_deleted?: boolean | null
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: internal_movements_animal_id_animals_id_fk
            columns: [animal_id]
            isOneToOne: false
            referencedRelation: animals
            referencedColumns: [id]
          },
        ]
      }
      isolation_logs: {
        Row: {
          id: string
          animal_id: string
          isolation_type: string
          start_date: string
          end_date: string | null
          reason: string
          notes: string | null
          is_deleted: boolean | null
          created_by: string
          modified_by: string
          created_at: string | null
          updated_at: string | null
          authorized_by: string | null
        }
        Insert: {
          id?: string
          animal_id: string
          isolation_type: string
          start_date: string
          end_date?: string | null
          reason: string
          notes?: string | null
          is_deleted?: boolean | null
          created_by?: string
          modified_by: string
          created_at?: string | null
          updated_at?: string | null
          authorized_by?: string | null
        }
        Update: {
          id?: string
          animal_id?: string
          isolation_type?: string
          start_date?: string
          end_date?: string | null
          reason?: string
          notes?: string | null
          is_deleted?: boolean | null
          created_by?: string
          modified_by?: string
          created_at?: string | null
          updated_at?: string | null
          authorized_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: isolation_logs_animal_id_animals_id_fk
            columns: [animal_id]
            isOneToOne: false
            referencedRelation: animals
            referencedColumns: [id]
          },
          {
            foreignKeyName: isolation_logs_created_by_users_id_fk
            columns: [created_by]
            isOneToOne: false
            referencedRelation: users
            referencedColumns: [id]
          },
          {
            foreignKeyName: isolation_logs_modified_by_users_id_fk
            columns: [modified_by]
            isOneToOne: false
            referencedRelation: users
            referencedColumns: [id]
          },
          {
            foreignKeyName: isolation_logs_authorized_by_fkey
            columns: [authorized_by]
            isOneToOne: false
            referencedRelation: users
            referencedColumns: [id]
          },
        ]
      }
      leave_requests: {
        Row: {
          id: string
          user_id: string | null
          start_date: string
          end_date: string
          status: string
          leave_type: string
          reason: string | null
          is_deleted: boolean | null
          created_at: string | null
          updated_at: string | null
          _modified: string | null
          approved_by: string | null
        }
        Insert: {
          id?: string
          user_id?: string | null
          start_date: string
          end_date: string
          status: string
          leave_type: string
          reason?: string | null
          is_deleted?: boolean | null
          created_at?: string | null
          updated_at?: string | null
          _modified?: string | null
          approved_by?: string | null
        }
        Update: {
          id?: string
          user_id?: string | null
          start_date?: string
          end_date?: string
          status?: string
          leave_type?: string
          reason?: string | null
          is_deleted?: boolean | null
          created_at?: string | null
          updated_at?: string | null
          _modified?: string | null
          approved_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: leave_requests_user_id_users_id_fk
            columns: [user_id]
            isOneToOne: false
            referencedRelation: users
            referencedColumns: [id]
          },
        ]
      }
      maintenance_tickets: {
        Row: {
          id: string
          title: string
          description: string | null
          category: string
          status: string
          priority: string
          reported_by: string | null
          assigned_to: string | null
          is_deleted: boolean | null
          created_at: string | null
          updated_at: string | null
          _modified: string | null
          resolution_notes: string | null
          due_date: string | null
          location: string | null
        }
        Insert: {
          id?: string
          title: string
          description?: string | null
          category: string
          status: string
          priority: string
          reported_by?: string | null
          assigned_to?: string | null
          is_deleted?: boolean | null
          created_at?: string | null
          updated_at?: string | null
          _modified?: string | null
          resolution_notes?: string | null
          due_date?: string | null
          location?: string | null
        }
        Update: {
          id?: string
          title?: string
          description?: string | null
          category?: string
          status?: string
          priority?: string
          reported_by?: string | null
          assigned_to?: string | null
          is_deleted?: boolean | null
          created_at?: string | null
          updated_at?: string | null
          _modified?: string | null
          resolution_notes?: string | null
          due_date?: string | null
          location?: string | null
        }
        Relationships: [
          {
            foreignKeyName: maintenance_tickets_assigned_to_users_id_fk
            columns: [assigned_to]
            isOneToOne: false
            referencedRelation: users
            referencedColumns: [id]
          },
        ]
      }
      medication_administrations: {
        Row: {
          id: string
          prescription_id: string
          animal_id: string
          administered_at: string
          administered_by: string
          status: Database['public']['Enums']['admin_status']
          actual_dose_given: string | null
          notes: string | null
          created_at: string | null
          created_by: string | null
        }
        Insert: {
          id?: string
          prescription_id: string
          animal_id: string
          administered_at?: string
          administered_by: string
          status: Database['public']['Enums']['admin_status']
          actual_dose_given?: string | null
          notes?: string | null
          created_at?: string | null
          created_by?: string | null
        }
        Update: {
          id?: string
          prescription_id?: string
          animal_id?: string
          administered_at?: string
          administered_by?: string
          status?: Database['public']['Enums']['admin_status']
          actual_dose_given?: string | null
          notes?: string | null
          created_at?: string | null
          created_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: medication_administrations_prescription_id_fkey
            columns: [prescription_id]
            isOneToOne: false
            referencedRelation: prescriptions
            referencedColumns: [id]
          },
          {
            foreignKeyName: medication_administrations_animal_id_fkey
            columns: [animal_id]
            isOneToOne: false
            referencedRelation: animals
            referencedColumns: [id]
          },
        ]
      }
      mist_logs: {
        Row: {
          id: string
          animal_id: string
          recorded_by: string
          recorded_at: string
          mist_level: string
          am_pm: string
          notes: string | null
          is_deleted: boolean | null
          created_by: string | null
          created_at: string | null
          modified_by: string | null
          modified_at: string | null
        }
        Insert: {
          id?: string
          animal_id: string
          recorded_by: string
          recorded_at?: string
          mist_level: string
          am_pm: string
          notes?: string | null
          is_deleted?: boolean | null
          created_by?: string | null
          created_at?: string | null
          modified_by?: string | null
          modified_at?: string | null
        }
        Update: {
          id?: string
          animal_id?: string
          recorded_by?: string
          recorded_at?: string
          mist_level?: string
          am_pm?: string
          notes?: string | null
          is_deleted?: boolean | null
          created_by?: string | null
          created_at?: string | null
          modified_by?: string | null
          modified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: mist_logs_animal_id_fkey
            columns: [animal_id]
            isOneToOne: false
            referencedRelation: animals
            referencedColumns: [id]
          },
          {
            foreignKeyName: mist_logs_recorded_by_fkey
            columns: [recorded_by]
            isOneToOne: false
            referencedRelation: users
            referencedColumns: [id]
          },
          {
            foreignKeyName: mist_logs_created_by_fkey
            columns: [created_by]
            isOneToOne: false
            referencedRelation: users
            referencedColumns: [id]
          },
          {
            foreignKeyName: mist_logs_modified_by_fkey
            columns: [modified_by]
            isOneToOne: false
            referencedRelation: users
            referencedColumns: [id]
          },
        ]
      }
      operational_lists: {
        Row: {
          id: string
          name: string
          animal_category: string | null
          category: string | null
          is_deleted: boolean | null
          created_at: string | null
          updated_at: string | null
          _modified: string | null
          status: string | null
        }
        Insert: {
          id?: string
          name: string
          animal_category?: string | null
          category?: string | null
          is_deleted?: boolean | null
          created_at?: string | null
          updated_at?: string | null
          _modified?: string | null
          status?: string | null
        }
        Update: {
          id?: string
          name?: string
          animal_category?: string | null
          category?: string | null
          is_deleted?: boolean | null
          created_at?: string | null
          updated_at?: string | null
          _modified?: string | null
          status?: string | null
        }
        Relationships: [
        ]
      }
      organization_profile: {
        Row: {
          id: string
          org_name: string
          logo_url: string | null
          contact_email: string | null
          contact_phone: string | null
          address: string | null
          is_deleted: boolean | null
          created_at: string | null
          updated_at: string | null
          _modified: string | null
          website: string | null
          license_number: string | null
          adoptionurl: string | null
        }
        Insert: {
          id?: string
          org_name: string
          logo_url?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          address?: string | null
          is_deleted?: boolean | null
          created_at?: string | null
          updated_at?: string | null
          _modified?: string | null
          website?: string | null
          license_number?: string | null
          adoptionurl?: string | null
        }
        Update: {
          id?: string
          org_name?: string
          logo_url?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          address?: string | null
          is_deleted?: boolean | null
          created_at?: string | null
          updated_at?: string | null
          _modified?: string | null
          website?: string | null
          license_number?: string | null
          adoptionurl?: string | null
        }
        Relationships: [
        ]
      }
      prescriptions: {
        Row: {
          id: string
          animal_id: string
          order_type: Database['public']['Enums']['medication_order_type']
          drug_name: string
          concentration: string | null
          dosage: string
          route: Database['public']['Enums']['clinical_route']
          frequency: Database['public']['Enums']['clinical_frequency']
          is_prn: boolean | null
          indication: string | null
          special_instructions: string | null
          start_date: string
          end_date: string | null
          status: Database['public']['Enums']['prescription_status'] | null
          prescribing_vet_name: string | null
          prescribing_clinic: string | null
          internal_authorizing_user: string | null
          is_deleted: boolean | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          animal_id: string
          order_type?: Database['public']['Enums']['medication_order_type']
          drug_name: string
          concentration?: string | null
          dosage: string
          route: Database['public']['Enums']['clinical_route']
          frequency: Database['public']['Enums']['clinical_frequency']
          is_prn?: boolean | null
          indication?: string | null
          special_instructions?: string | null
          start_date?: string
          end_date?: string | null
          status?: Database['public']['Enums']['prescription_status'] | null
          prescribing_vet_name?: string | null
          prescribing_clinic?: string | null
          internal_authorizing_user?: string | null
          is_deleted?: boolean | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          animal_id?: string
          order_type?: Database['public']['Enums']['medication_order_type']
          drug_name?: string
          concentration?: string | null
          dosage?: string
          route?: Database['public']['Enums']['clinical_route']
          frequency?: Database['public']['Enums']['clinical_frequency']
          is_prn?: boolean | null
          indication?: string | null
          special_instructions?: string | null
          start_date?: string
          end_date?: string | null
          status?: Database['public']['Enums']['prescription_status'] | null
          prescribing_vet_name?: string | null
          prescribing_clinic?: string | null
          internal_authorizing_user?: string | null
          is_deleted?: boolean | null
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: prescriptions_animal_id_fkey
            columns: [animal_id]
            isOneToOne: false
            referencedRelation: animals
            referencedColumns: [id]
          },
        ]
      }
      rbac_matrix: {
        Row: {
          role: string
          permissions: Json
        }
        Insert: {
          role: string
          permissions?: Json
        }
        Update: {
          role?: string
          permissions?: Json
        }
        Relationships: [
        ]
      }
      role_permissions: {
        Row: {
          id: string
          role: string
          resource: string
          can_select: boolean | null
          can_insert: boolean | null
          can_update: boolean | null
          can_delete: boolean | null
        }
        Insert: {
          id?: string
          role: string
          resource: string
          can_select?: boolean | null
          can_insert?: boolean | null
          can_update?: boolean | null
          can_delete?: boolean | null
        }
        Update: {
          id?: string
          role?: string
          resource?: string
          can_select?: boolean | null
          can_insert?: boolean | null
          can_update?: boolean | null
          can_delete?: boolean | null
        }
        Relationships: [
        ]
      }
      safety_drills: {
        Row: {
          id: string
          drill_date: string
          drill_type: string | null
          scenario_description: string | null
          areas_involved: string | null
          duration_seconds: number | null
          roll_call_completed: boolean | null
          issues_observed: string | null
          corrective_actions: string | null
          status: string | null
          is_simulation: boolean | null
          created_at: string | null
          updated_at: string | null
          is_deleted: boolean | null
        }
        Insert: {
          id?: string
          drill_date: string
          drill_type?: string | null
          scenario_description?: string | null
          areas_involved?: string | null
          duration_seconds?: number | null
          roll_call_completed?: boolean | null
          issues_observed?: string | null
          corrective_actions?: string | null
          status?: string | null
          is_simulation?: boolean | null
          created_at?: string | null
          updated_at?: string | null
          is_deleted?: boolean | null
        }
        Update: {
          id?: string
          drill_date?: string
          drill_type?: string | null
          scenario_description?: string | null
          areas_involved?: string | null
          duration_seconds?: number | null
          roll_call_completed?: boolean | null
          issues_observed?: string | null
          corrective_actions?: string | null
          status?: string | null
          is_simulation?: boolean | null
          created_at?: string | null
          updated_at?: string | null
          is_deleted?: boolean | null
        }
        Relationships: [
        ]
      }
      shift_patterns: {
        Row: {
          id: string
          user_id: string | null
          monday: boolean | null
          tuesday: boolean | null
          wednesday: boolean | null
          thursday: boolean | null
          friday: boolean | null
          saturday: boolean | null
          sunday: boolean | null
          is_deleted: boolean | null
          created_at: string | null
          updated_at: string | null
          _modified: string | null
          pattern_name: string | null
          effective_from: string | null
        }
        Insert: {
          id?: string
          user_id?: string | null
          monday?: boolean | null
          tuesday?: boolean | null
          wednesday?: boolean | null
          thursday?: boolean | null
          friday?: boolean | null
          saturday?: boolean | null
          sunday?: boolean | null
          is_deleted?: boolean | null
          created_at?: string | null
          updated_at?: string | null
          _modified?: string | null
          pattern_name?: string | null
          effective_from?: string | null
        }
        Update: {
          id?: string
          user_id?: string | null
          monday?: boolean | null
          tuesday?: boolean | null
          wednesday?: boolean | null
          thursday?: boolean | null
          friday?: boolean | null
          saturday?: boolean | null
          sunday?: boolean | null
          is_deleted?: boolean | null
          created_at?: string | null
          updated_at?: string | null
          _modified?: string | null
          pattern_name?: string | null
          effective_from?: string | null
        }
        Relationships: [
          {
            foreignKeyName: shift_patterns_user_id_users_id_fk
            columns: [user_id]
            isOneToOne: false
            referencedRelation: users
            referencedColumns: [id]
          },
        ]
      }
      shifts: {
        Row: {
          id: string
          user_id: string | null
          start_time: string
          end_time: string
          assigned_area: string | null
          status: string | null
          is_deleted: boolean | null
          created_at: string | null
          updated_at: string | null
          _modified: string | null
          notes: string | null
        }
        Insert: {
          id?: string
          user_id?: string | null
          start_time: string
          end_time: string
          assigned_area?: string | null
          status?: string | null
          is_deleted?: boolean | null
          created_at?: string | null
          updated_at?: string | null
          _modified?: string | null
          notes?: string | null
        }
        Update: {
          id?: string
          user_id?: string | null
          start_time?: string
          end_time?: string
          assigned_area?: string | null
          status?: string | null
          is_deleted?: boolean | null
          created_at?: string | null
          updated_at?: string | null
          _modified?: string | null
          notes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: shifts_user_id_users_id_fk
            columns: [user_id]
            isOneToOne: false
            referencedRelation: users
            referencedColumns: [id]
          },
        ]
      }
      system_error_logs: {
        Row: {
          id: string
          user_id: string | null
          user_name: string | null
          user_role: string | null
          error_type: string
          message: string
          stack_trace: string | null
          route_path: string | null
          device_os: string | null
          user_agent: string | null
          screen_resolution: string | null
          is_online: boolean | null
          created_at: string | null
        }
        Insert: {
          id?: string
          user_id?: string | null
          user_name?: string | null
          user_role?: string | null
          error_type: string
          message: string
          stack_trace?: string | null
          route_path?: string | null
          device_os?: string | null
          user_agent?: string | null
          screen_resolution?: string | null
          is_online?: boolean | null
          created_at?: string | null
        }
        Update: {
          id?: string
          user_id?: string | null
          user_name?: string | null
          user_role?: string | null
          error_type?: string
          message?: string
          stack_trace?: string | null
          route_path?: string | null
          device_os?: string | null
          user_agent?: string | null
          screen_resolution?: string | null
          is_online?: boolean | null
          created_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: system_error_logs_user_id_fkey
            columns: [user_id]
            isOneToOne: false
            referencedRelation: users
            referencedColumns: [id]
          },
        ]
      }
      tasks: {
        Row: {
          id: string
          animal_id: string | null
          title: string
          description: string | null
          assigned_to: string | null
          due_date: string | null
          status: string
          priority: string
          is_deleted: boolean | null
          created_at: string | null
          updated_at: string | null
          _modified: string | null
          completed_at: string | null
          completed_by: string | null
          task_type: string | null
          recurrence_rule: string | null
        }
        Insert: {
          id?: string
          animal_id?: string | null
          title: string
          description?: string | null
          assigned_to?: string | null
          due_date?: string | null
          status: string
          priority: string
          is_deleted?: boolean | null
          created_at?: string | null
          updated_at?: string | null
          _modified?: string | null
          completed_at?: string | null
          completed_by?: string | null
          task_type?: string | null
          recurrence_rule?: string | null
        }
        Update: {
          id?: string
          animal_id?: string | null
          title?: string
          description?: string | null
          assigned_to?: string | null
          due_date?: string | null
          status?: string
          priority?: string
          is_deleted?: boolean | null
          created_at?: string | null
          updated_at?: string | null
          _modified?: string | null
          completed_at?: string | null
          completed_by?: string | null
          task_type?: string | null
          recurrence_rule?: string | null
        }
        Relationships: [
          {
            foreignKeyName: tasks_animal_id_animals_id_fk
            columns: [animal_id]
            isOneToOne: false
            referencedRelation: animals
            referencedColumns: [id]
          },
          {
            foreignKeyName: tasks_assigned_to_users_id_fk
            columns: [assigned_to]
            isOneToOne: false
            referencedRelation: users
            referencedColumns: [id]
          },
        ]
      }
      temperature_logs: {
        Row: {
          id: string
          animal_id: string
          recorded_by: string
          recorded_at: string
          created_by: string | null
          created_at: string | null
          modified_by: string | null
          modified_at: string | null
          is_deleted: boolean | null
          notes: string | null
          temp_basking: number | null
          temp_cool: number | null
          temp_average: number | null
          temp_ambient: number | null
        }
        Insert: {
          id?: string
          animal_id: string
          recorded_by: string
          recorded_at: string
          created_by?: string | null
          created_at?: string | null
          modified_by?: string | null
          modified_at?: string | null
          is_deleted?: boolean | null
          notes?: string | null
          temp_basking?: number | null
          temp_cool?: number | null
          temp_average?: number | null
          temp_ambient?: number | null
        }
        Update: {
          id?: string
          animal_id?: string
          recorded_by?: string
          recorded_at?: string
          created_by?: string | null
          created_at?: string | null
          modified_by?: string | null
          modified_at?: string | null
          is_deleted?: boolean | null
          notes?: string | null
          temp_basking?: number | null
          temp_cool?: number | null
          temp_average?: number | null
          temp_ambient?: number | null
        }
        Relationships: [
          {
            foreignKeyName: temperature_logs_animal_id_fkey
            columns: [animal_id]
            isOneToOne: false
            referencedRelation: animals
            referencedColumns: [id]
          },
        ]
      }
      timesheets: {
        Row: {
          id: string
          user_id: string | null
          shift_date: string
          clock_in_time: string
          clock_out_time: string | null
          total_hours: number | null
          status: string | null
          is_deleted: boolean | null
          created_at: string | null
          updated_at: string | null
          _modified: string | null
          approved_by: string | null
          notes: string | null
          anomaly_reason: string | null
          hr_resolution_notes: string | null
        }
        Insert: {
          id?: string
          user_id?: string | null
          shift_date: string
          clock_in_time: string
          clock_out_time?: string | null
          total_hours?: number | null
          status?: string | null
          is_deleted?: boolean | null
          created_at?: string | null
          updated_at?: string | null
          _modified?: string | null
          approved_by?: string | null
          notes?: string | null
          anomaly_reason?: string | null
          hr_resolution_notes?: string | null
        }
        Update: {
          id?: string
          user_id?: string | null
          shift_date?: string
          clock_in_time?: string
          clock_out_time?: string | null
          total_hours?: number | null
          status?: string | null
          is_deleted?: boolean | null
          created_at?: string | null
          updated_at?: string | null
          _modified?: string | null
          approved_by?: string | null
          notes?: string | null
          anomaly_reason?: string | null
          hr_resolution_notes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: timesheets_user_id_users_id_fk
            columns: [user_id]
            isOneToOne: false
            referencedRelation: users
            referencedColumns: [id]
          },
        ]
      }
      users: {
        Row: {
          id: string
          email: string | null
          name: string | null
          initials: string | null
          role: string | null
          is_deleted: boolean | null
          created_at: string | null
          phone: string | null
          address: string | null
          signature_url: string | null
          pin: string | null
          updated_at: string | null
          cv_url: string | null
          emergency_contact_name: string | null
          emergency_contact_phone: string | null
          start_date: string | null
          hr_notes: string | null
          avatar_url: string | null
          dob: string | null
          end_date: string | null
          is_active: boolean | null
          requires_password_change: boolean | null
        }
        Insert: {
          id?: string
          email?: string | null
          name?: string | null
          initials?: string | null
          role?: string | null
          is_deleted?: boolean | null
          created_at?: string | null
          phone?: string | null
          address?: string | null
          signature_url?: string | null
          pin?: string | null
          updated_at?: string | null
          cv_url?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          start_date?: string | null
          hr_notes?: string | null
          avatar_url?: string | null
          dob?: string | null
          end_date?: string | null
          is_active?: boolean | null
          requires_password_change?: boolean | null
        }
        Update: {
          id?: string
          email?: string | null
          name?: string | null
          initials?: string | null
          role?: string | null
          is_deleted?: boolean | null
          created_at?: string | null
          phone?: string | null
          address?: string | null
          signature_url?: string | null
          pin?: string | null
          updated_at?: string | null
          cv_url?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          start_date?: string | null
          hr_notes?: string | null
          avatar_url?: string | null
          dob?: string | null
          end_date?: string | null
          is_active?: boolean | null
          requires_password_change?: boolean | null
        }
        Relationships: [
        ]
      }
      vouchers: {
        Row: {
          id: string
          transaction_id: string
          voucher_code: string
          experience_type: string
          purchaser_name: string
          purchaser_email: string
          purchaser_mobile: string | null
          participants: number
          guests: number
          purchase_date: string | null
          status: string
          redeemed_at: string | null
          redeemed_by: string | null
          expires_at: string | null
          item_name: string | null
          booked_in_at: string | null
          booking_notes: string | null
        }
        Insert: {
          id?: string
          transaction_id: string
          voucher_code: string
          experience_type: string
          purchaser_name: string
          purchaser_email: string
          purchaser_mobile?: string | null
          participants?: number
          guests?: number
          purchase_date?: string | null
          status?: string
          redeemed_at?: string | null
          redeemed_by?: string | null
          expires_at?: string | null
          item_name?: string | null
          booked_in_at?: string | null
          booking_notes?: string | null
        }
        Update: {
          id?: string
          transaction_id?: string
          voucher_code?: string
          experience_type?: string
          purchaser_name?: string
          purchaser_email?: string
          purchaser_mobile?: string | null
          participants?: number
          guests?: number
          purchase_date?: string | null
          status?: string
          redeemed_at?: string | null
          redeemed_by?: string | null
          expires_at?: string | null
          item_name?: string | null
          booked_in_at?: string | null
          booking_notes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: vouchers_redeemed_by_fkey
            columns: [redeemed_by]
            isOneToOne: false
            referencedRelation: users
            referencedColumns: [id]
          },
        ]
      }
      weight_logs: {
        Row: {
          id: string
          animal_id: string
          recorded_by: string
          recorded_at: string
          created_by: string | null
          created_at: string | null
          modified_by: string | null
          modified_at: string | null
          is_deleted: boolean | null
          notes: string | null
          weight_grams: number
          am_pm: string
          has_cast: boolean | null
        }
        Insert: {
          id?: string
          animal_id: string
          recorded_by: string
          recorded_at: string
          created_by?: string | null
          created_at?: string | null
          modified_by?: string | null
          modified_at?: string | null
          is_deleted?: boolean | null
          notes?: string | null
          weight_grams: number
          am_pm: string
          has_cast?: boolean | null
        }
        Update: {
          id?: string
          animal_id?: string
          recorded_by?: string
          recorded_at?: string
          created_by?: string | null
          created_at?: string | null
          modified_by?: string | null
          modified_at?: string | null
          is_deleted?: boolean | null
          notes?: string | null
          weight_grams?: number
          am_pm?: string
          has_cast?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: weight_logs_animal_id_fkey
            columns: [animal_id]
            isOneToOne: false
            referencedRelation: animals
            referencedColumns: [id]
          },
        ]
      }
      zla_documents: {
        Row: {
          id: string
          name: string
          category: string
          file_url: string
          upload_date: string
          is_deleted: boolean | null
          created_at: string | null
          updated_at: string | null
          _modified: string | null
        }
        Insert: {
          id?: string
          name: string
          category: string
          file_url: string
          upload_date: string
          is_deleted?: boolean | null
          created_at?: string | null
          updated_at?: string | null
          _modified?: string | null
        }
        Update: {
          id?: string
          name?: string
          category?: string
          file_url?: string
          upload_date?: string
          is_deleted?: boolean | null
          created_at?: string | null
          updated_at?: string | null
          _modified?: string | null
        }
        Relationships: [
        ]
      }
    }
    Views: {
      latest_animal_feeds: {
        Row: {
          id: string | null
          animal_id: string | null
          food_item: string | null
          quantity: number | null
          unit: string | null
          feed_method: string | null
          recorded_at: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      scrub_expired_vouchers: {
        Args: Record<PropertyKey, never>
        Returns: unknown
      }
      purge_system_error_logs: {
        Args: Record<PropertyKey, never>
        Returns: unknown
      }
      rls_auto_enable: {
        Args: Record<PropertyKey, never>
        Returns: unknown
      }
      authorize: {
        Args: Record<PropertyKey, never>
        Returns: unknown
      }
      auto_clock_out_forgotten_shifts: {
        Args: Record<PropertyKey, never>
        Returns: unknown
      }
      update_modified_at_column: {
        Args: Record<PropertyKey, never>
        Returns: unknown
      }
    }
    Enums: {
      admin_status: GIVEN | PARTIAL | REFUSED | VOMITED | DROPPED | NOT_AVAILABLE | OMITTED
      clinical_frequency: SID | BID | TID | QID | EOD | PRN | STAT | WEEKLY | MONTHLY
      clinical_route: PO | IM | SC | IV | TOPICAL | OPHTH | INHAL
      event_payment_phase: UNPAID | DEPOSIT_PAID | PAID_IN_FULL | NOT_APPLICABLE | REFUNDED
      medication_order_type: PRESCRIPTION | OTC | SUPPLEMENT
      prescription_status: ACTIVE | COMPLETED | DISCONTINUED
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type PublicSchema = Database[Extract<keyof Database, public>]

export type Tables<
  PublicTableNameOrOptions extends
    | keyof (PublicSchema[Tables] & PublicSchema[Views])
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof (Database[PublicTableNameOrOptions[schema]][Tables] &
        Database[PublicTableNameOrOptions[schema]][Views])
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? (Database[PublicTableNameOrOptions[schema]][Tables] &
      Database[PublicTableNameOrOptions[schema]][Views])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : PublicTableNameOrOptions extends keyof (PublicSchema[Tables] &
        PublicSchema[Views])
    ? (PublicSchema[Tables] &
        PublicSchema[Views])[PublicTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  PublicTableNameOrOptions extends
    | keyof PublicSchema[Tables]
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions[schema]][Tables]
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? Database[PublicTableNameOrOptions[schema]][Tables][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : PublicTableNameOrOptions extends keyof PublicSchema[Tables]
    ? PublicSchema[Tables][PublicTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  PublicTableNameOrOptions extends
    | keyof PublicSchema[Tables]
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions[schema]][Tables]
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? Database[PublicTableNameOrOptions[schema]][Tables][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : PublicTableNameOrOptions extends keyof PublicSchema[Tables]
    ? PublicSchema[Tables][PublicTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  PublicEnumNameOrOptions extends
    | keyof PublicSchema[Enums]
    | { schema: keyof Database },
  EnumName extends PublicEnumNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicEnumNameOrOptions[schema]][Enums]
    : never = never,
> = PublicEnumNameOrOptions extends { schema: keyof Database }
  ? Database[PublicEnumNameOrOptions[schema]][Enums][EnumName]
  : PublicEnumNameOrOptions extends keyof PublicSchema[Enums]
    ? PublicSchema[Enums][PublicEnumNameOrOptions]
    : never
