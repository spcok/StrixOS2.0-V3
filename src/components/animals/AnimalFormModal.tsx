import { useState } from 'react';
import { useForm, type FieldApi } from '@tanstack/react-form';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import * as v from 'valibot';
import { X, Save, Loader2, AlertCircle, Users, User, ShieldAlert } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type { Animal } from '../../types';
import { ImageUploader } from '../ui/ImageUploader';
import { IUCNBadge } from './IUCNBadge';

// ------------------------------------------------------------------
// VALIBOT FIREWALL: ZLA 1981 SSSMZP COMPLIANCE AUDIT SCHEMA
// ------------------------------------------------------------------
const ZlaComplianceSchema = v.pipe(
  v.object({
    census_count: v.pipe(v.number(), v.minValue(1, 'Census count must be at least 1')),
    weight_unit: v.pipe(v.string(), v.minLength(1, 'Weight unit is required')),
    display_order: v.number(),

    // ZLA Mandatory Baseline Fields
    name: v.pipe(v.string(), v.minLength(1, 'ZLA COMPLIANCE: Animal Name is required.')),
    species: v.pipe(v.string(), v.minLength(1, 'ZLA COMPLIANCE: Common Species name is required.')),
    latin_name: v.pipe(v.string(), v.minLength(1, 'ZLA COMPLIANCE: Scientific/Latin name is required by SSSMZP.')),
    gender: v.pipe(v.string(), v.minLength(1, "ZLA COMPLIANCE: Sex must be recorded (Select 'Unknown' if not determinable).")),

    // Traceability & Acquisition
    acquisition_date: v.pipe(v.string(), v.minLength(1, 'ZLA COMPLIANCE: Arrival/Acquisition date is strictly required.')),
    acquisition_type: v.pipe(v.string(), v.minLength(1, 'ZLA COMPLIANCE: Acquisition method is required.')),
    origin: v.pipe(v.string(), v.minLength(1, 'ZLA COMPLIANCE: Previous holding/origin source is required for traceability.')),

    // Conditionals & Identifiers
    date_of_birth: v.optional(v.nullable(v.string())),
    is_dob_unknown: v.optional(v.boolean(), false),
    is_dob_estimated: v.optional(v.boolean(), false),
    has_no_id: v.optional(v.boolean(), false),
    microchip_id: v.optional(v.nullable(v.string())),
    ring_number: v.optional(v.nullable(v.string())),
    description: v.optional(v.nullable(v.string())),
    profile_image_url: v.optional(v.nullable(v.any())),
    distribution_map_url: v.optional(v.nullable(v.any())),

    // Husbandry & Logistics Pass-Throughs
    record_type: v.optional(v.string(), 'INDIVIDUAL'),
    parent_group_id: v.optional(v.nullable(v.string())),
    category: v.optional(v.nullable(v.string())),
    location: v.optional(v.nullable(v.string())),
    status: v.optional(v.nullable(v.string())),
    flying_weight: v.optional(v.nullable(v.union([v.number(), v.string(), v.literal('')]))),
    winter_weight: v.optional(v.nullable(v.union([v.number(), v.string(), v.literal('')]))),
    average_target_weight: v.optional(v.nullable(v.union([v.number(), v.string(), v.literal('')]))),
    ambient_temp_only: v.optional(v.boolean(), false),
    target_day_temp_c: v.optional(v.nullable(v.union([v.number(), v.string(), v.literal('')]))),
    target_night_temp_c: v.optional(v.nullable(v.union([v.number(), v.string(), v.literal('')]))),
    water_tipping_temp: v.optional(v.nullable(v.union([v.number(), v.string(), v.literal('')]))),
    target_humidity_min_percent: v.optional(v.nullable(v.union([v.number(), v.string(), v.literal('')]))),
    target_humidity_max_percent: v.optional(v.nullable(v.union([v.number(), v.string(), v.literal('')]))),
    misting_frequency: v.optional(v.nullable(v.string())),
    misting_not_required: v.optional(v.boolean(), false),
    special_requirements: v.optional(v.nullable(v.string())),
    critical_husbandry_notes: v.optional(v.nullable(v.string())),
    hazard_rating: v.optional(v.nullable(v.string()), 'LOW'),
    is_venomous: v.optional(v.boolean(), false),
    red_list_status: v.optional(v.nullable(v.string()), 'LC'),
    origin_location: v.optional(v.nullable(v.string())),
    is_boarding: v.optional(v.boolean(), false),
    is_quarantine: v.optional(v.boolean(), false),
    lineage_unknown: v.optional(v.boolean(), false),
    sire_id: v.optional(v.nullable(v.string())),
    dam_id: v.optional(v.nullable(v.string())),
  }),
  v.check((data) => {
    const hasFormalId = Boolean(
      (data.microchip_id && data.microchip_id.trim() !== '') ||
      (data.ring_number && data.ring_number.trim() !== '')
    );
    if (!data.has_no_id && !hasFormalId) return false;
    return true;
  }, "ZLA COMPLIANCE: Provide a Ring/Microchip number, or explicitly declare 'No Formal ID'."),
  v.check((data) => {
    if (data.has_no_id && (!data.description || data.description.trim() === '') && !data.profile_image_url) {
      return false;
    }
    return true;
  }, 'ZLA COMPLIANCE: If lacking formal ID, a visual description or profile photo is legally required.'),
  v.check((data) => {
    if (!data.is_dob_unknown && (!data.date_of_birth || String(data.date_of_birth).trim() === '')) {
      return false;
    }
    return true;
  }, 'ZLA COMPLIANCE: Date of Birth is required, or explicitly mark it as Approximate/Unknown.')
);

interface AnimalFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialData?: Animal | null;
}

const TABS = [
  { id: 'core', label: 'Core Details' },
  { id: 'id', label: 'ID & Weight' },
  { id: 'husbandry', label: 'Husbandry & Env' },
  { id: 'safety', label: 'Safety & Origin' },
  { id: 'notes', label: 'Notes & Meta' },
] as const;

type TabId = (typeof TABS)[number]['id'];

const extractFieldErrors = (errors: unknown): string | null => {
  if (!errors) return null;
  const errArray = Array.isArray(errors) ? errors : [errors];
  if (errArray.length === 0) return null;
  const msgs = errArray
    .map((e) => {
      if (typeof e === 'string') return e;
      if (e && typeof e === 'object' && 'message' in e && typeof (e as { message: unknown }).message === 'string') {
        return (e as { message: string }).message;
      }
      return null;
    })
    .filter(Boolean);
  return msgs.length > 0 ? msgs.join(', ') : null;
};

function FormInput({
  field,
  label,
  type = 'text',
  placeholder,
  disabled = false,
}: {
  field: FieldApi<any, any, any, any>;
  label: string;
  type?: string;
  placeholder?: string;
  disabled?: boolean;
}) {
  const errText = extractFieldErrors(field.state.meta.errors);
  const hasError = Boolean(errText);

  return (
    <div className="flex flex-col gap-1.5 w-full">
      <label
        className={`text-[10px] font-black uppercase tracking-widest ${
          disabled ? 'text-slate-300' : hasError ? 'text-rose-500' : 'text-slate-500'
        }`}
      >
        {label}
      </label>
      {type === 'textarea' ? (
        <textarea
          value={field.state.value ?? ''}
          onBlur={field.handleBlur}
          onChange={(e) => field.handleChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          className={`w-full p-2.5 rounded-xl outline-none transition-all text-sm font-medium shadow-xs h-24 custom-scrollbar resize-none ${
            disabled
              ? 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed'
              : hasError
                ? 'bg-rose-50 border-rose-300 focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 text-rose-900'
                : 'bg-white border-slate-200 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-slate-900'
          }`}
        />
      ) : (
        <input
          type={type}
          value={field.state.value ?? ''}
          onBlur={field.handleBlur}
          onChange={(e) =>
            field.handleChange(
              type === 'number'
                ? e.target.value === ''
                  ? ''
                  : Number(e.target.value)
                : e.target.value
            )
          }
          placeholder={placeholder}
          disabled={disabled}
          className={`w-full p-2.5 rounded-xl outline-none transition-all text-sm font-medium shadow-xs ${
            disabled
              ? 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed'
              : hasError
                ? 'bg-rose-50 border-rose-300 focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 text-rose-900'
                : 'bg-white border-slate-200 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-slate-900'
          }`}
        />
      )}
      {hasError && <span className="text-[10px] font-bold text-rose-500">{errText}</span>}
    </div>
  );
}

function FormSelect({
  field,
  label,
  options,
  disabled = false,
}: {
  field: FieldApi<any, any, any, any>;
  label: string;
  options: { value: string; label: string }[];
  disabled?: boolean;
}) {
  const errText = extractFieldErrors(field.state.meta.errors);
  const hasError = Boolean(errText);

  return (
    <div className="flex flex-col gap-1.5 w-full">
      <label
        className={`text-[10px] font-black uppercase tracking-widest ${
          disabled ? 'text-slate-300' : hasError ? 'text-rose-500' : 'text-slate-500'
        }`}
      >
        {label}
      </label>
      <select
        value={field.state.value ?? ''}
        onBlur={field.handleBlur}
        onChange={(e) => field.handleChange(e.target.value)}
        disabled={disabled}
        className={`w-full p-2.5 rounded-xl outline-none transition-all text-sm font-medium shadow-xs cursor-pointer ${
          disabled
            ? 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed'
            : hasError
              ? 'bg-rose-50 border-rose-300 focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 text-rose-900'
              : 'bg-white border-slate-200 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-slate-900'
        }`}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      {hasError && <span className="text-[10px] font-bold text-rose-500">{errText}</span>}
    </div>
  );
}

function FormCheckbox({
  field,
  label,
  disabled = false,
}: {
  field: FieldApi<any, any, any, any>;
  label: string;
  disabled?: boolean;
}) {
  return (
    <label
      className={`flex items-center gap-3 p-3 bg-slate-50 border border-slate-200 rounded-xl transition-colors ${
        disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:bg-slate-100'
      }`}
    >
      <input
        type="checkbox"
        disabled={disabled}
        checked={Boolean(field.state.value)}
        onBlur={field.handleBlur}
        onChange={(e) => field.handleChange(e.target.checked)}
        className="w-4 h-4 text-emerald-600 rounded-md border-slate-300 focus:ring-emerald-500 disabled:cursor-not-allowed cursor-pointer"
      />
      <span className="text-xs font-bold text-slate-700 tracking-wide">{label}</span>
    </label>
  );
}

export default function AnimalFormModal({ isOpen, onClose, initialData }: AnimalFormModalProps) {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<TabId>('core');
  const [systemError, setSystemError] = useState<string | null>(null);
  const [formHasErrors, setFormHasErrors] = useState(false);

  const { data: existingGroups = [] } = useQuery<{ id: string; name: string; species: string }[]>({
    queryKey: ['animal-groups'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('animals')
        .select('id, name, species')
        .eq('record_type', 'GROUP')
        .eq('archived', false);
      if (error) throw error;
      return (data || []) as { id: string; name: string; species: string }[];
    },
    staleTime: 1000 * 60 * 5,
  });

  const { data: locations = [] } = useQuery<{ id: string; name: string }[]>({
    queryKey: ['operational_lists', 'location'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('operational_lists')
        .select('id, name')
        .eq('category', 'location')
        .eq('is_deleted', false);
      if (error) throw error;
      return (data || []) as { id: string; name: string }[];
    },
    staleTime: 1000 * 60 * 15,
  });

  const uploadToSupabase = async (file: Blob | File, folder: string): Promise<string> => {
    const fileExt = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
    const uuid =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : Math.random().toString(36).substring(2);
    const fileName = `${folder}/${uuid}.${fileExt}`;
    const { error } = await supabase.storage
      .from('media')
      .upload(fileName, file, { contentType: file.type || 'image/jpeg' });
    if (error) throw error;
    const { data } = supabase.storage.from('media').getPublicUrl(fileName);
    return data.publicUrl;
  };

  const saveAnimalMutation = useMutation({
    mutationFn: async (payload: Partial<Animal>) => {
      if (initialData?.id) {
        const { data, error } = await supabase
          .from('animals')
          .update(payload)
          .eq('id', initialData.id)
          .select()
          .single();
        if (error) throw error;
        return data as Animal;
      }

      const recordId =
        payload.id ||
        (typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : Math.random().toString(36).substring(2));

      const { data, error } = await supabase
        .from('animals')
        .insert([{ ...payload, id: recordId }])
        .select()
        .single();
      if (error) throw error;
      return data as Animal;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['animals'] });
      queryClient.invalidateQueries({ queryKey: ['animal_profile'] });
      onClose();
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : 'Database mutation failed.';
      setSystemError(msg);
    },
  });

  const form = useForm({
    defaultValues: {
      record_type: initialData?.record_type || 'INDIVIDUAL',
      parent_group_id: initialData?.parent_group_id || '',
      census_count: initialData?.census_count ?? 1,
      name: initialData?.name || '',
      species: initialData?.species || '',
      latin_name: initialData?.latin_name || '',
      category: initialData?.category || 'OWL',
      location: initialData?.location || '',
      profile_image_url: (initialData?.profile_image_url || null) as string | Blob | null,
      distribution_map_url: (initialData?.distribution_map_url || null) as string | Blob | null,
      status: initialData?.status || 'ON_DISPLAY',
      gender: initialData?.gender || '',
      date_of_birth: initialData?.date_of_birth || '',
      is_dob_unknown: initialData?.is_dob_unknown || false,
      is_dob_estimated: (initialData as any)?.is_dob_estimated || false,
      microchip_id: initialData?.microchip_id || '',
      ring_number: initialData?.ring_number || '',
      has_no_id: initialData?.has_no_id || false,
      weight_unit: initialData?.weight_unit || 'g',
      flying_weight: initialData?.flying_weight ?? '',
      winter_weight: initialData?.winter_weight ?? '',
      average_target_weight: initialData?.average_target_weight ?? '',
      ambient_temp_only: initialData?.ambient_temp_only || false,
      target_day_temp_c: initialData?.target_day_temp_c ?? '',
      target_night_temp_c: initialData?.target_night_temp_c ?? '',
      water_tipping_temp: (initialData as any)?.water_tipping_temp ?? '',
      target_humidity_min_percent: initialData?.target_humidity_min_percent ?? '',
      target_humidity_max_percent: (initialData as any)?.target_humidity_max_percent ?? '',
      misting_frequency: (initialData as any)?.misting_frequency || '',
      misting_not_required: (initialData as any)?.misting_not_required || false,
      special_requirements: initialData?.special_requirements || '',
      critical_husbandry_notes: initialData?.critical_husbandry_notes || '',
      hazard_rating: initialData?.hazard_rating || 'LOW',
      is_venomous: initialData?.is_venomous || false,
      red_list_status: initialData?.red_list_status || 'LC',
      acquisition_date: (initialData as any)?.acquisition_date || '',
      acquisition_type: (initialData as any)?.acquisition_type || 'CAPTIVE_BRED',
      origin: (initialData as any)?.origin || '',
      origin_location: (initialData as any)?.origin_location || '',
      is_boarding: (initialData as any)?.is_boarding || false,
      is_quarantine: (initialData as any)?.is_quarantine || false,
      lineage_unknown: (initialData as any)?.lineage_unknown || false,
      sire_id: (initialData as any)?.sire_id || '',
      dam_id: (initialData as any)?.dam_id || '',
      description: initialData?.description || '',
      display_order: (initialData as any)?.display_order ?? '',
    },
    validators: {
      onSubmit: ({ value }) => {
        const result = v.safeParse(ZlaComplianceSchema, value);
        if (!result.success) {
          return result.issues[0]?.message || 'Please correct form validation errors';
        }
        return undefined;
      },
    },
    onSubmit: async ({ value }) => {
      setSystemError(null);
      setFormHasErrors(false);

      try {
        const rawPayload: Record<string, any> = { ...value };

        if (rawPayload.profile_image_url instanceof Blob || rawPayload.profile_image_url instanceof File) {
          rawPayload.profile_image_url = await uploadToSupabase(rawPayload.profile_image_url, 'profiles');
        }
        if (rawPayload.distribution_map_url instanceof Blob || rawPayload.distribution_map_url instanceof File) {
          rawPayload.distribution_map_url = await uploadToSupabase(rawPayload.distribution_map_url, 'maps');
        }

        // Numeric sanitization
        const numericKeys = [
          'flying_weight',
          'winter_weight',
          'average_target_weight',
          'target_day_temp_c',
          'target_night_temp_c',
          'water_tipping_temp',
          'target_humidity_min_percent',
          'target_humidity_max_percent',
        ];

        numericKeys.forEach((key) => {
          if (rawPayload[key] === '' || rawPayload[key] === null || rawPayload[key] === undefined) {
            rawPayload[key] = null;
          } else {
            rawPayload[key] = Number(rawPayload[key]);
          }
        });

        rawPayload.display_order =
          rawPayload.display_order === '' || rawPayload.display_order === null ? 0 : Number(rawPayload.display_order);
        rawPayload.census_count =
          rawPayload.census_count === '' || rawPayload.census_count === null ? 1 : Number(rawPayload.census_count);

        // Date & Lineage normalizations
        if (rawPayload.is_dob_unknown || rawPayload.date_of_birth === '') {
          rawPayload.date_of_birth = null;
        }
        if (rawPayload.acquisition_date === '') rawPayload.acquisition_date = null;
        if (rawPayload.parent_group_id === '' || rawPayload.record_type === 'GROUP') {
          rawPayload.parent_group_id = null;
        }
        if (rawPayload.sire_id === '') rawPayload.sire_id = null;
        if (rawPayload.dam_id === '') rawPayload.dam_id = null;
        if (rawPayload.location === '') rawPayload.location = null;
        if (rawPayload.latin_name === '') rawPayload.latin_name = null;
        if (rawPayload.has_no_id) {
          rawPayload.microchip_id = null;
          rawPayload.ring_number = null;
        }

        const savedAnimal = await saveAnimalMutation.mutateAsync(rawPayload);

        // Logistics Internal Movement Trigger
        if (initialData?.id && initialData.location !== rawPayload.location) {
          await supabase.from('internal_movements').insert([
            {
              animal_id: savedAnimal.id,
              from_location: initialData.location || 'Unassigned',
              to_location: rawPayload.location || 'Unassigned',
              reason: 'Location updated via profile configuration edit',
              movement_date: new Date().toISOString(),
              is_deleted: false,
            },
          ]);
          queryClient.invalidateQueries({ queryKey: ['internal_movements'] });
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'An error occurred during save execution.';
        setSystemError(msg);
      }
    },
    onSubmitInvalid: () => {
      setFormHasErrors(true);
    },
  });

  const handleSafeClose = () => {
    if (form.state.isDirty) {
      if (window.confirm('You have unsaved changes in this record. Discard?')) onClose();
    } else {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-6 font-sans">
      <div className="absolute inset-0 bg-slate-950/70 backdrop-blur-md" onClick={handleSafeClose} aria-hidden="true" />

      <div className="bg-white w-full max-w-4xl rounded-3xl shadow-2xl flex flex-col max-h-[88dvh] border border-slate-200 overflow-hidden relative z-10 animate-in fade-in zoom-in-95 duration-200">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50 shrink-0">
          <div>
            <h2 className="text-base sm:text-lg font-black text-slate-900 tracking-tight uppercase">
              {initialData ? 'Edit Database Record' : 'Provision New Animal'}
            </h2>
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mt-0.5">
              Specimen Configuration &amp; ZLA Compliance
            </p>
          </div>
          <button
            type="button"
            onClick={handleSafeClose}
            className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex px-4 pt-2 border-b border-slate-100 bg-slate-50 shrink-0 overflow-x-auto custom-scrollbar">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-3 text-xs font-black uppercase tracking-widest border-b-2 transition-colors whitespace-nowrap cursor-pointer ${
                activeTab === tab.id ? 'border-emerald-500 text-emerald-600' : 'border-transparent text-slate-400 hover:text-slate-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Form Body */}
        <div className="p-6 overflow-y-auto custom-scrollbar flex-1 bg-white">
          {systemError && (
            <div className="mb-6 p-4 bg-rose-50 border border-rose-200 rounded-2xl flex items-start gap-3 text-rose-700">
              <AlertCircle size={18} className="shrink-0 mt-0.5" />
              <div className="text-xs font-bold">{systemError}</div>
            </div>
          )}

          {formHasErrors && (
            <div className="mb-6 p-4 bg-rose-50 border-2 border-rose-300 rounded-2xl flex items-start gap-3 text-rose-900 shadow-sm animate-in fade-in slide-in-from-top-2">
              <ShieldAlert size={20} className="shrink-0 mt-0.5 text-rose-600" />
              <div className="flex flex-col">
                <span className="text-xs font-black uppercase tracking-widest text-rose-600">Compliance Audit Warning</span>
                <span className="text-xs font-bold mt-0.5">Please review the fields marked in red across the form tabs.</span>
              </div>
            </div>
          )}

          <form
            id="animal-mutation-form"
            onSubmit={(e) => {
              e.preventDefault();
              e.stopPropagation();
              form.handleSubmit();
            }}
            className="space-y-6"
          >
            {/* TAB 1: CORE */}
            <div className={activeTab === 'core' ? 'block' : 'hidden'}>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div className="sm:col-span-2 p-4 sm:p-5 bg-slate-50 border border-slate-200 rounded-2xl flex flex-col gap-3.5">
                  <form.Field name="record_type">
                    {(field: FieldApi<any, any, any, any>) => (
                      <div>
                        <span className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">
                          Record Scope
                        </span>
                        <div className="flex bg-white border border-slate-200 rounded-xl p-1 shadow-xs">
                          <button
                            type="button"
                            onClick={() => field.handleChange('INDIVIDUAL')}
                            className={`flex-1 flex justify-center items-center gap-2 py-2 rounded-lg text-xs font-bold uppercase tracking-widest transition-all cursor-pointer ${
                              field.state.value === 'INDIVIDUAL' ? 'bg-emerald-600 text-white shadow-xs' : 'text-slate-500 hover:bg-slate-50'
                            }`}
                          >
                            <User size={14} /> Individual
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              field.handleChange('GROUP');
                              form.setFieldValue('gender', '');
                            }}
                            className={`flex-1 flex justify-center items-center gap-2 py-2 rounded-lg text-xs font-bold uppercase tracking-widest transition-all cursor-pointer ${
                              field.state.value === 'GROUP' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-500 hover:bg-slate-50'
                            }`}
                          >
                            <Users size={14} /> Group / Mob
                          </button>
                        </div>
                      </div>
                    )}
                  </form.Field>

                  <form.Subscribe selector={(state) => state.values.record_type}>
                    {(recordType) =>
                      recordType === 'INDIVIDUAL' && (
                        <div className="pt-2 border-t border-slate-200 border-dashed">
                          <form.Field name="parent_group_id">
                            {(field: FieldApi<any, any, any, any>) => (
                              <FormSelect
                                field={field}
                                label="Assign to Parent Group / Mob"
                                options={[
                                  { value: '', label: '-- No Group Assignment --' },
                                  ...existingGroups.map((g) => ({
                                    value: g.id,
                                    label: `${g.name || 'Unnamed'} (${g.species || 'Unknown'})`,
                                  })),
                                ]}
                              />
                            )}
                          </form.Field>
                        </div>
                      )
                    }
                  </form.Subscribe>
                </div>

                <form.Field name="name">
                  {(field: FieldApi<any, any, any, any>) => (
                    <FormInput field={field} label="Animal Name *" placeholder="e.g. Barnaby" />
                  )}
                </form.Field>

                <form.Field name="location">
                  {(field: FieldApi<any, any, any, any>) => (
                    <FormSelect
                      field={field}
                      label="Enclosure Location"
                      options={[
                        { value: '', label: '-- Unassigned --' },
                        ...locations.map((l) => ({ value: l.name, label: l.name })),
                      ]}
                    />
                  )}
                </form.Field>

                <form.Field name="species">
                  {(field: FieldApi<any, any, any, any>) => (
                    <FormInput field={field} label="Common Species *" placeholder="e.g. Barn Owl" />
                  )}
                </form.Field>

                <form.Field name="latin_name">
                  {(field: FieldApi<any, any, any, any>) => (
                    <FormInput field={field} label="Latin / Scientific Name *" placeholder="e.g. Tyto alba" />
                  )}
                </form.Field>

                <form.Field name="category">
                  {(field: FieldApi<any, any, any, any>) => (
                    <FormSelect
                      field={field}
                      label="Category"
                      options={[
                        { value: 'OWL', label: 'Owl' },
                        { value: 'RAPTOR', label: 'Raptor' },
                        { value: 'MAMMAL', label: 'Mammal' },
                        { value: 'EXOTIC', label: 'Exotic' },
                        { value: 'INVERT', label: 'Invertebrate' },
                        { value: 'AQUATIC', label: 'Aquatic' },
                      ]}
                    />
                  )}
                </form.Field>

                <form.Field name="status">
                  {(field: FieldApi<any, any, any, any>) => (
                    <FormSelect
                      field={field}
                      label="System Status"
                      options={[
                        { value: 'ON_DISPLAY', label: 'On Display' },
                        { value: 'OFF_DISPLAY', label: 'Off Display' },
                        { value: 'QUARANTINE', label: 'Quarantine' },
                        { value: 'MEDICAL', label: 'Medical' },
                        { value: 'OFFSITE', label: 'Stored Offsite' },
                        { value: 'ARCHIVED', label: 'Archived' },
                      ]}
                    />
                  )}
                </form.Field>

                <form.Subscribe selector={(state) => state.values.record_type}>
                  {(recordType) => (
                    <form.Field name="gender">
                      {(field: FieldApi<any, any, any, any>) => (
                        <FormSelect
                          field={field}
                          label="Gender *"
                          disabled={recordType === 'GROUP'}
                          options={[
                            { value: '', label: '-- Select Gender --' },
                            { value: 'UNKNOWN', label: 'Unknown / Unsexed' },
                            { value: 'MALE', label: 'Male' },
                            { value: 'FEMALE', label: 'Female' },
                          ]}
                        />
                      )}
                    </form.Field>
                  )}
                </form.Subscribe>

                <form.Field name="census_count">
                  {(field: FieldApi<any, any, any, any>) => (
                    <FormInput field={field} label="Census Headcount *" type="number" />
                  )}
                </form.Field>

                {/* Date of Birth Cluster */}
                <form.Subscribe selector={(state) => state.values.is_dob_unknown}>
                  {(isUnknown) => (
                    <div className="sm:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <form.Field name="date_of_birth">
                        {(field: FieldApi<any, any, any, any>) => (
                          <FormInput field={field} label="Date of Birth / Est. Hatch *" type="date" disabled={isUnknown} />
                        )}
                      </form.Field>
                      <div className="flex flex-col sm:flex-row gap-3 sm:items-end pb-0.5">
                        <form.Field name="is_dob_estimated">
                          {(field: FieldApi<any, any, any, any>) => (
                            <FormCheckbox field={field} disabled={isUnknown} label="Approximate Date" />
                          )}
                        </form.Field>
                        <form.Field name="is_dob_unknown">
                          {(field: FieldApi<any, any, any, any>) => (
                            <FormCheckbox field={field} label="Unknown Date" />
                          )}
                        </form.Field>
                      </div>
                    </div>
                  )}
                </form.Subscribe>

                <div className="sm:col-span-2 pt-3 border-t border-slate-100">
                  <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">
                    Profile Photo (4:3) - Uploads to Storage Bucket
                  </label>
                  <form.Field name="profile_image_url">
                    {(field: FieldApi<any, any, any, any>) => (
                      <ImageUploader
                        value={field.state.value}
                        onChange={(file) => field.handleChange(file)}
                        requireCrop={true}
                        defaultAspect={4 / 3}
                        allowToggle={false}
                      />
                    )}
                  </form.Field>
                </div>
              </div>
            </div>

            {/* TAB 2: ID & WEIGHT */}
            <div className={activeTab === 'id' ? 'block' : 'hidden'}>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <form.Subscribe selector={(state) => state.values.has_no_id}>
                  {(hasNoId) => (
                    <>
                      <form.Field name="ring_number">
                        {(field: FieldApi<any, any, any, any>) => (
                          <FormInput field={field} disabled={hasNoId} label="Ring Number *" placeholder="e.g. A10-992" />
                        )}
                      </form.Field>
                      <form.Field name="microchip_id">
                        {(field: FieldApi<any, any, any, any>) => (
                          <FormInput field={field} disabled={hasNoId} label="Microchip ID *" placeholder="e.g. 981020002..." />
                        )}
                      </form.Field>
                    </>
                  )}
                </form.Subscribe>

                <div className="sm:col-span-2 pb-3 border-b border-slate-100">
                  <form.Field name="has_no_id">
                    {(field: FieldApi<any, any, any, any>) => (
                      <FormCheckbox field={field} label="Specimen holds no formal identification (Ring/Chip)" />
                    )}
                  </form.Field>
                </div>

                <form.Field name="flying_weight">
                  {(field: FieldApi<any, any, any, any>) => (
                    <FormInput field={field} label="Flying / Summer Target Weight" type="number" />
                  )}
                </form.Field>
                <form.Field name="winter_weight">
                  {(field: FieldApi<any, any, any, any>) => (
                    <FormInput field={field} label="Winter / Resting Target Weight" type="number" />
                  )}
                </form.Field>
                <form.Field name="average_target_weight">
                  {(field: FieldApi<any, any, any, any>) => (
                    <FormInput field={field} label="Mean Baseline Target Weight" type="number" />
                  )}
                </form.Field>
                <form.Field name="weight_unit">
                  {(field: FieldApi<any, any, any, any>) => (
                    <FormSelect
                      field={field}
                      label="Primary Weight Unit *"
                      options={[
                        { value: 'g', label: 'Grams (g)' },
                        { value: 'kg', label: 'Kilograms (kg)' },
                        { value: 'oz', label: 'Ounces (oz)' },
                        { value: 'lb', label: 'Pounds (lb)' },
                      ]}
                    />
                  )}
                </form.Field>
              </div>
            </div>

            {/* TAB 3: HUSBANDRY & ENV */}
            <div className={activeTab === 'husbandry' ? 'block' : 'hidden'}>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div className="sm:col-span-2 pb-3 border-b border-slate-100">
                  <form.Field name="ambient_temp_only">
                    {(field: FieldApi<any, any, any, any>) => (
                      <FormCheckbox field={field} label="Requires Ambient Temperature Only (No localized basking heat)" />
                    )}
                  </form.Field>
                </div>

                <form.Field name="target_day_temp_c">
                  {(field: FieldApi<any, any, any, any>) => (
                    <FormInput field={field} label="Target Day Temp (°C)" type="number" />
                  )}
                </form.Field>
                <form.Field name="target_night_temp_c">
                  {(field: FieldApi<any, any, any, any>) => (
                    <FormInput field={field} label="Target Night Temp (°C)" type="number" />
                  )}
                </form.Field>
                <form.Field name="target_humidity_min_percent">
                  {(field: FieldApi<any, any, any, any>) => (
                    <FormInput field={field} label="Min Humidity (%)" type="number" />
                  )}
                </form.Field>
                <form.Field name="target_humidity_max_percent">
                  {(field: FieldApi<any, any, any, any>) => (
                    <FormInput field={field} label="Max Humidity (%)" type="number" />
                  )}
                </form.Field>
                <form.Field name="water_tipping_temp">
                  {(field: FieldApi<any, any, any, any>) => (
                    <FormInput field={field} label="Water Tipping Threshold (°C)" type="number" />
                  )}
                </form.Field>

                <div className="sm:col-span-2 border-t border-slate-100 pt-3">
                  <span className="block text-[10px] font-black uppercase tracking-widest text-cyan-600 mb-3">
                    Enclosure Misting Protocol
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
                    <form.Subscribe selector={(state) => state.values.misting_not_required}>
                      {(notRequired) => (
                        <>
                          <form.Field name="misting_frequency">
                            {(field: FieldApi<any, any, any, any>) => (
                              <FormInput
                                field={field}
                                disabled={notRequired}
                                label="Frequency / Routine Details"
                                placeholder="e.g. Twice Daily, Medium spray"
                              />
                            )}
                          </form.Field>
                          <div className="pt-2 sm:pt-4">
                            <form.Field name="misting_not_required">
                              {(field: FieldApi<any, any, any, any>) => (
                                <FormCheckbox field={field} label="Misting Not Required" />
                              )}
                            </form.Field>
                          </div>
                        </>
                      )}
                    </form.Subscribe>
                  </div>
                </div>

                <div className="sm:col-span-2 pt-3 border-t border-slate-100">
                  <form.Field name="special_requirements">
                    {(field: FieldApi<any, any, any, any>) => (
                      <FormInput
                        field={field}
                        label="Special Dietary or Enclosure Parameters"
                        type="textarea"
                        placeholder="e.g. Pre-dusted calcium insects only..."
                      />
                    )}
                  </form.Field>
                </div>
                <div className="sm:col-span-2">
                  <form.Field name="critical_husbandry_notes">
                    {(field: FieldApi<any, any, any, any>) => (
                      <FormInput
                        field={field}
                        label="Critical Husbandry Warnings (Displays in Red on Profile)"
                        type="textarea"
                        placeholder="e.g. Aggressive feeding response, prone to dehydration..."
                      />
                    )}
                  </form.Field>
                </div>
              </div>
            </div>

            {/* TAB 4: SAFETY & ORIGIN */}
            <div className={activeTab === 'safety' ? 'block' : 'hidden'}>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <form.Field name="hazard_rating">
                  {(field: FieldApi<any, any, any, any>) => (
                    <FormSelect
                      field={field}
                      label="Staff Hazard Rating"
                      options={[
                        { value: 'LOW', label: 'Low Risk' },
                        { value: 'MEDIUM', label: 'Medium Risk' },
                        { value: 'HIGH', label: 'High Risk' },
                      ]}
                    />
                  )}
                </form.Field>

                <div className="flex gap-3 items-end">
                  <div className="flex-1">
                    <form.Field name="red_list_status">
                      {(field: FieldApi<any, any, any, any>) => (
                        <FormSelect
                          field={field}
                          label="IUCN Red List Status"
                          options={[
                            { value: 'NE', label: 'Not Evaluated (NE)' },
                            { value: 'DD', label: 'Data Deficient (DD)' },
                            { value: 'LC', label: 'Least Concern (LC)' },
                            { value: 'NT', label: 'Near Threatened (NT)' },
                            { value: 'VU', label: 'Vulnerable (VU)' },
                            { value: 'EN', label: 'Endangered (EN)' },
                            { value: 'CR', label: 'Critically Endangered (CR)' },
                            { value: 'EW', label: 'Extinct in Wild (EW)' },
                            { value: 'EX', label: 'Extinct (EX)' },
                          ]}
                        />
                      )}
                    </form.Field>
                  </div>
                  <form.Subscribe selector={(state) => state.values.red_list_status}>
                    {(status) => (
                      <div className="pb-1">
                        <IUCNBadge status={status} />
                      </div>
                    )}
                  </form.Subscribe>
                </div>

                <div className="sm:col-span-2 pb-3 border-b border-slate-100">
                  <form.Field name="is_venomous">
                    {(field: FieldApi<any, any, any, any>) => (
                      <FormCheckbox field={field} label="Species is Venomous / Toxic" />
                    )}
                  </form.Field>
                </div>

                <form.Field name="acquisition_date">
                  {(field: FieldApi<any, any, any, any>) => (
                    <FormInput field={field} label="Acquisition / Origin Date *" type="date" />
                  )}
                </form.Field>

                <form.Field name="acquisition_type">
                  {(field: FieldApi<any, any, any, any>) => (
                    <FormSelect
                      field={field}
                      label="Acquisition Type *"
                      options={[
                        { value: '', label: '-- Select Method --' },
                        { value: 'CAPTIVE_BRED', label: 'Captive Bred' },
                        { value: 'WILD_CAUGHT', label: 'Wild Caught / Rescue' },
                        { value: 'DONATION', label: 'Donated / Rehomed' },
                        { value: 'LOAN', label: 'On Breeding Loan' },
                      ]}
                    />
                  )}
                </form.Field>

                <form.Field name="origin">
                  {(field: FieldApi<any, any, any, any>) => (
                    <FormInput
                      field={field}
                      label="Breeder / Source Entity *"
                      placeholder="e.g. Scottish Owl Centre"
                    />
                  )}
                </form.Field>

                <form.Field name="origin_location">
                  {(field: FieldApi<any, any, any, any>) => (
                    <FormInput field={field} label="Origin Area / Country" placeholder="e.g. Kent, UK" />
                  )}
                </form.Field>

                <div className="sm:col-span-2 pt-3 border-t border-slate-100">
                  <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">
                    Species Distribution Map
                  </label>
                  <form.Field name="distribution_map_url">
                    {(field: FieldApi<any, any, any, any>) => (
                      <ImageUploader
                        value={field.state.value}
                        onChange={(file) => field.handleChange(file)}
                        requireCrop={true}
                        defaultAspect={4 / 3}
                        allowToggle={true}
                      />
                    )}
                  </form.Field>
                </div>

                <div className="sm:col-span-2 grid grid-cols-2 gap-4 pt-2 border-t border-slate-100">
                  <form.Field name="is_boarding">
                    {(field: FieldApi<any, any, any, any>) => (
                      <FormCheckbox field={field} label="Currently Boarding" />
                    )}
                  </form.Field>
                  <form.Field name="is_quarantine">
                    {(field: FieldApi<any, any, any, any>) => (
                      <FormCheckbox field={field} label="Requires Quarantine" />
                    )}
                  </form.Field>
                </div>
              </div>
            </div>

            {/* TAB 5: NOTES & LINEAGE */}
            <div className={activeTab === 'notes' ? 'block' : 'hidden'}>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div className="sm:col-span-2">
                  <form.Field name="lineage_unknown">
                    {(field: FieldApi<any, any, any, any>) => (
                      <FormCheckbox field={field} label="Lineage / Parentage is Unknown" />
                    )}
                  </form.Field>
                </div>

                <form.Subscribe selector={(state) => state.values.lineage_unknown}>
                  {(lineageUnknown) => (
                    <>
                      <form.Field name="sire_id">
                        {(field: FieldApi<any, any, any, any>) => (
                          <FormInput field={field} disabled={lineageUnknown} label="Sire Identifier / UUID" />
                        )}
                      </form.Field>
                      <form.Field name="dam_id">
                        {(field: FieldApi<any, any, any, any>) => (
                          <FormInput field={field} disabled={lineageUnknown} label="Dam Identifier / UUID" />
                        )}
                      </form.Field>
                    </>
                  )}
                </form.Subscribe>

                <div className="sm:col-span-2">
                  <form.Field name="description">
                    {(field: FieldApi<any, any, any, any>) => (
                      <FormInput
                        field={field}
                        label="General Description / Identifying Marks *"
                        type="textarea"
                        placeholder="Crucial physical characteristics if specimen lacks formal ID..."
                      />
                    )}
                  </form.Field>
                </div>

                <form.Field name="display_order">
                  {(field: FieldApi<any, any, any, any>) => (
                    <FormInput field={field} label="Display Priority Order" type="number" placeholder="0" />
                  )}
                </form.Field>
              </div>
            </div>
          </form>
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-between bg-slate-50 shrink-0 relative z-20">
          <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest hidden sm:block">
            {activeTab} configuration active
          </div>
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <button
              type="button"
              onClick={handleSafeClose}
              className="w-full sm:w-auto px-5 py-2.5 text-xs font-bold uppercase tracking-widest text-slate-500 hover:text-slate-900 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <form.Subscribe selector={(state) => [state.canSubmit, state.isSubmitting]}>
              {([canSubmit, isSubmitting]) => (
                <button
                  type="submit"
                  form="animal-mutation-form"
                  disabled={!canSubmit || isSubmitting || saveAnimalMutation.isPending}
                  className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-xl font-bold text-xs uppercase tracking-widest transition-all shadow-md active:scale-95 cursor-pointer"
                >
                  {isSubmitting || saveAnimalMutation.isPending ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <Save size={16} />
                  )}
                  {isSubmitting || saveAnimalMutation.isPending
                    ? 'Committing...'
                    : initialData
                      ? 'Update Record'
                      : 'Provision Record'}
                </button>
              )}
            </form.Subscribe>
          </div>
        </div>
      </div>
    </div>
  );
}