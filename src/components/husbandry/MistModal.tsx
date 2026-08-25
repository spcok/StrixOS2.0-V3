import { useEffect, useMemo } from 'react';
import { useForm, type FieldApi } from '@tanstack/react-form';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import * as v from 'valibot';
import { X, Save, Loader2, Droplets, Sun, Moon } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../../lib/auth';
import { supabase } from '../../lib/supabase';
import { mistService } from '../../services/mistService';
import type { Animal } from '../../types';

interface ActiveStaffUser {
  id: string;
  name: string;
  initials?: string | null;
}

export type MistLevel = 'LIGHT' | 'MEDIUM' | 'HEAVY' | 'DRENCH';

interface MistFormValues {
  recorded_by: string;
  recorded_at: string;
  am_pm: 'AM' | 'PM';
  mist_level: MistLevel;
  notes?: string;
}

export interface MistModalProps {
  isOpen: boolean;
  onClose: () => void;
  animalId?: string | null;
  animal?: Animal | null;
  initialData?: {
    id?: string;
    animal_id?: string;
    recorded_by?: string;
    recorded_at?: string;
    log_date?: string;
    am_pm?: 'AM' | 'PM' | string;
    mist_level?: MistLevel | string;
    notes?: string;
  } | null;
  selectedDate?: string;
}

const extractErrorText = (errors: unknown): string | null => {
  if (!errors) return null;
  const errArray = Array.isArray(errors) ? errors : [errors];
  if (errArray.length === 0) return null;
  const messages = errArray
    .map((e) => {
      if (typeof e === 'string') return e;
      if (e && typeof e === 'object' && 'message' in e && typeof (e as { message: unknown }).message === 'string') {
        return (e as { message: string }).message;
      }
      return null;
    })
    .filter(Boolean);
  return messages.length > 0 ? messages.join(', ') : null;
};

const FieldError = ({ meta }: { meta: { errors?: unknown[] } }) => {
  if (!meta.errors || meta.errors.length === 0) return null;
  const text = extractErrorText(meta.errors);
  if (!text) return null;
  return <p className="text-[10px] text-rose-500 mt-0.5 font-bold">{text}</p>;
};

const formatLocalDatetime = (dateString?: string) => {
  const d = dateString ? new Date(dateString) : new Date();
  if (Number.isNaN(d.getTime())) return new Date().toISOString().slice(0, 16);
  const tzOffset = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - tzOffset).toISOString().slice(0, 16);
};

const getDefaultDateTime = (selectedDate?: string) => {
  const now = new Date();
  const tzOffset = now.getTimezoneOffset() * 60000;
  const localNow = new Date(now.getTime() - tzOffset);
  const localTimeStr = localNow.toISOString().slice(11, 16);

  if (!selectedDate) return localNow.toISOString().slice(0, 16);
  if (selectedDate.includes('T')) return formatLocalDatetime(selectedDate);
  return `${selectedDate}T${localTimeStr}`;
};

// --- VALIBOT COMPLIANCE SCHEMA ---
const MistSchema = v.object({
  recorded_by: v.pipe(v.string(), v.minLength(1, 'ZLA COMPLIANCE: An active staff member must be selected.')),
  recorded_at: v.pipe(v.string(), v.minLength(1, 'Date and time required')),
  am_pm: v.picklist(['AM', 'PM']),
  mist_level: v.picklist(['LIGHT', 'MEDIUM', 'HEAVY', 'DRENCH']),
  notes: v.optional(v.string()),
});

export function MistModal({
  isOpen,
  onClose,
  animalId,
  animal: propAnimal,
  initialData,
  selectedDate,
}: MistModalProps) {
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  const targetAnimalId = propAnimal?.id || animalId || initialData?.animal_id || '';

  const animal = useMemo(() => {
    if (propAnimal) return propAnimal;
    const cachedAnimals = queryClient.getQueryData<Animal[]>(['animals', 'husbandry']) || [];
    return cachedAnimals.find((a) => a.id === targetAnimalId);
  }, [propAnimal, queryClient, targetAnimalId]);

  const { data: activeStaff = [] } = useQuery<ActiveStaffUser[]>({
    queryKey: ['active-staff'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('users')
        .select('id, name, initials')
        .eq('is_active', true)
        .eq('is_deleted', false)
        .order('name');
      if (error) throw error;
      return (data || []) as ActiveStaffUser[];
    },
    staleTime: 0,
    gcTime: 1209600000,
    networkMode: 'offlineFirst',
  });

  const insertMistMutation = useMutation({
    mutationFn: async (values: MistFormValues) => {
      const result = v.safeParse(MistSchema, values);
      if (!result.success) {
        throw new Error(result.issues[0]?.message || 'Validation failed');
      }

      if (!targetAnimalId) {
        throw new Error('Target specimen identifier is missing.');
      }

      return await mistService.insertMistLog({
        id: initialData?.id,
        animal_id: targetAnimalId,
        recorded_by: values.recorded_by,
        recorded_at: new Date(values.recorded_at).toISOString(),
        created_by: profile?.id,
        am_pm: values.am_pm,
        mist_level: values.mist_level,
        notes: values.notes?.trim() || null,
      });
    },
    onSuccess: () => {
      toast.success(initialData?.id ? 'Misting log updated' : 'Misting routine recorded');
      queryClient.invalidateQueries({ queryKey: ['mist_logs'] });
      queryClient.invalidateQueries({ queryKey: ['daily_logs'] });
      onClose();
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : 'Failed to record misting log';
      toast.error(msg);
    },
  });

  const form = useForm<MistFormValues>({
    defaultValues: {
      recorded_by: initialData?.recorded_by || profile?.id || '',
      recorded_at: initialData?.recorded_at
        ? formatLocalDatetime(initialData.recorded_at)
        : initialData?.log_date
          ? getDefaultDateTime(initialData.log_date)
          : getDefaultDateTime(selectedDate),
      am_pm: (initialData?.am_pm?.toUpperCase() as 'AM' | 'PM') || (new Date().getHours() < 12 ? 'AM' : 'PM'),
      mist_level: (initialData?.mist_level?.toUpperCase() as MistLevel) || 'MEDIUM',
      notes: initialData?.notes || '',
    },
    validators: {
      onSubmit: ({ value }) => {
        const result = v.safeParse(MistSchema, value);
        if (!result.success) {
          return result.issues[0]?.message || 'Please complete all required fields';
        }
        return undefined;
      },
    },
    onSubmit: async ({ value }) => {
      await insertMistMutation.mutateAsync(value);
    },
  });

  useEffect(() => {
    if (isOpen) {
      form.reset();
      if (initialData) {
        form.setFieldValue('recorded_by', initialData.recorded_by || profile?.id || '');
        form.setFieldValue(
          'recorded_at',
          initialData.recorded_at
            ? formatLocalDatetime(initialData.recorded_at)
            : initialData.log_date
              ? getDefaultDateTime(initialData.log_date)
              : getDefaultDateTime(selectedDate)
        );
        form.setFieldValue(
          'am_pm',
          (initialData.am_pm?.toUpperCase() as 'AM' | 'PM') || (new Date().getHours() < 12 ? 'AM' : 'PM')
        );
        form.setFieldValue('mist_level', (initialData.mist_level?.toUpperCase() as MistLevel) || 'MEDIUM');
        form.setFieldValue('notes', initialData.notes || '');
      } else {
        form.setFieldValue('recorded_by', profile?.id || '');
        form.setFieldValue('recorded_at', getDefaultDateTime(selectedDate));
        form.setFieldValue('am_pm', new Date().getHours() < 12 ? 'AM' : 'PM');
        form.setFieldValue('mist_level', 'MEDIUM');
        form.setFieldValue('notes', '');
      }
    }
  }, [isOpen, initialData, selectedDate, profile?.id, form]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/70 backdrop-blur-md animate-in fade-in duration-200 font-sans">
      <div className="bg-white rounded-2xl sm:rounded-3xl shadow-2xl w-full max-w-sm sm:max-w-md max-h-[92vh] flex flex-col overflow-hidden border border-slate-200/80">
        {/* Header Bar */}
        <div className="px-4 py-3 sm:px-6 sm:py-3.5 border-b border-slate-100 bg-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5 sm:gap-3">
            <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl sm:rounded-2xl bg-cyan-50 text-cyan-600 border border-cyan-100 flex items-center justify-center font-black shadow-xs shrink-0">
              <Droplets size={16} className="sm:w-5 sm:h-5" />
            </div>
            <div>
              <h2 className="text-xs sm:text-sm font-black text-slate-900 uppercase tracking-tight leading-none">
                {initialData?.id ? 'Edit Misting Log' : 'Log Enclosure Misting'}
              </h2>
              <p className="text-[9px] sm:text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">
                Specimen • <span className="text-cyan-700 font-bold">{animal?.name || 'Collection Specimen'}</span>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>

        {/* Form Body */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            e.stopPropagation();
            form.handleSubmit();
          }}
          className="p-4 sm:p-5 space-y-3.5 sm:space-y-4 overflow-y-auto custom-scrollbar flex-1"
        >
          {/* Shift Time Window (AM/PM) */}
          <form.Field name="am_pm">
            {(field: FieldApi<MistFormValues, 'am_pm', any, any>) => (
              <div className="space-y-1">
                <span className="block text-[9px] sm:text-[10px] font-black uppercase tracking-widest text-slate-500">
                  Shift Routine Window
                </span>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => field.handleChange('AM')}
                    className={`py-2 px-2.5 rounded-xl border-2 font-black text-[10px] sm:text-xs uppercase tracking-widest transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                      field.state.value === 'AM'
                        ? 'bg-cyan-50 border-cyan-500 text-cyan-800 shadow-xs'
                        : 'border-slate-200 bg-slate-50 text-slate-400 hover:bg-slate-100 hover:text-slate-600'
                    }`}
                  >
                    <Sun size={12} className={field.state.value === 'AM' ? 'text-cyan-600' : 'text-slate-400'} />
                    AM Spray
                  </button>
                  <button
                    type="button"
                    onClick={() => field.handleChange('PM')}
                    className={`py-2 px-2.5 rounded-xl border-2 font-black text-[10px] sm:text-xs uppercase tracking-widest transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                      field.state.value === 'PM'
                        ? 'bg-indigo-50 border-indigo-500 text-indigo-800 shadow-xs'
                        : 'border-slate-200 bg-slate-50 text-slate-400 hover:bg-slate-100 hover:text-slate-600'
                    }`}
                  >
                    <Moon size={12} className={field.state.value === 'PM' ? 'text-indigo-600' : 'text-slate-400'} />
                    PM Spray
                  </button>
                </div>
              </div>
            )}
          </form.Field>

          {/* Keeper and Timestamp Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-3">
            <form.Field name="recorded_by">
              {(field: FieldApi<MistFormValues, 'recorded_by', any, any>) => (
                <div className="space-y-1">
                  <label
                    htmlFor="mist-recorded-by"
                    className="block text-[9px] sm:text-[10px] font-black uppercase tracking-widest text-slate-500"
                  >
                    Conducted By *
                  </label>
                  <select
                    id="mist-recorded-by"
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-2 sm:px-3 sm:py-2 text-xs font-bold text-slate-900 focus:outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20 cursor-pointer"
                  >
                    <option value="" disabled>-- Select Keeper --</option>
                    {activeStaff.map((staff) => (
                      <option key={staff.id} value={staff.id}>
                        {staff.name} {staff.initials ? `(${staff.initials})` : ''}
                      </option>
                    ))}
                  </select>
                  <FieldError meta={field.state.meta} />
                </div>
              )}
            </form.Field>

            <form.Field name="recorded_at">
              {(field: FieldApi<MistFormValues, 'recorded_at', any, any>) => (
                <div className="space-y-1">
                  <label
                    htmlFor="mist-recorded-at"
                    className="block text-[9px] sm:text-[10px] font-black uppercase tracking-widest text-slate-500"
                  >
                    Date &amp; Time
                  </label>
                  <input
                    id="mist-recorded-at"
                    type="datetime-local"
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 sm:px-3 sm:py-2 text-xs font-bold text-slate-900 focus:outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
                  />
                  <FieldError meta={field.state.meta} />
                </div>
              )}
            </form.Field>
          </div>

          <hr className="border-slate-100" />

          {/* Misting Saturation Intensity Selector */}
          <form.Field name="mist_level">
            {(field: FieldApi<MistFormValues, 'mist_level', any, any>) => {
              const levels: { value: MistLevel; label: string; desc: string }[] = [
                { value: 'LIGHT', label: 'Light', desc: 'Substrate spray' },
                { value: 'MEDIUM', label: 'Medium', desc: 'Hydration routine' },
                { value: 'HEAVY', label: 'Heavy', desc: 'Moss wet & soak' },
                { value: 'DRENCH', label: 'Drench', desc: 'Full soak down' },
              ];

              return (
                <div className="space-y-1.5 bg-cyan-50/40 p-3 sm:p-3.5 rounded-xl sm:rounded-2xl border border-cyan-100">
                  <span className="block text-[9px] sm:text-[10px] font-black uppercase tracking-widest text-cyan-950">
                    Misting Saturation Intensity *
                  </span>
                  <div className="grid grid-cols-2 gap-2">
                    {levels.map((lvl) => {
                      const isSelected = field.state.value === lvl.value;
                      return (
                        <button
                          key={lvl.value}
                          type="button"
                          onClick={() => field.handleChange(lvl.value)}
                          className={`p-2.5 rounded-xl border-2 text-left transition-all cursor-pointer flex flex-col justify-between ${
                            isSelected
                              ? 'bg-white border-cyan-500 shadow-xs ring-2 ring-cyan-500/20'
                              : 'bg-white/80 border-slate-200 hover:border-slate-300 hover:bg-white'
                          }`}
                        >
                          <div className="flex items-center justify-between w-full">
                            <span
                              className={`text-xs font-black uppercase tracking-wider ${
                                isSelected ? 'text-cyan-900' : 'text-slate-700'
                              }`}
                            >
                              {lvl.label}
                            </span>
                            <Droplets size={12} className={isSelected ? 'text-cyan-600' : 'text-slate-300'} />
                          </div>
                          <span className="text-[9px] font-medium text-slate-400 mt-1 leading-tight">
                            {lvl.desc}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  <FieldError meta={field.state.meta} />
                </div>
              );
            }}
          </form.Field>

          {/* Husbandry Notes */}
          <form.Field name="notes">
            {(field: FieldApi<MistFormValues, 'notes', any, any>) => (
              <div className="space-y-1">
                <label
                  htmlFor="mist-notes"
                  className="block text-[9px] sm:text-[10px] font-black uppercase tracking-widest text-slate-500"
                >
                  Notes / Observations
                </label>
                <textarea
                  id="mist-notes"
                  rows={2}
                  value={field.state.value || ''}
                  onChange={(e) => field.handleChange(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs font-medium text-slate-900 focus:outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20 resize-none"
                  placeholder="Enclosure moss saturated, water dish refilled..."
                />
              </div>
            )}
          </form.Field>

          {/* Action Buttons */}
          <div className="pt-2 flex items-center justify-end gap-2 sm:gap-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 bg-slate-100 text-slate-700 font-bold text-[10px] sm:text-xs uppercase tracking-widest rounded-xl hover:bg-slate-200 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <form.Subscribe
              selector={(state) => [state.isSubmitting]}
              children={([isSubmitting]) => (
                <button
                  type="submit"
                  disabled={insertMistMutation.isPending || isSubmitting}
                  className="flex items-center gap-1.5 px-4 sm:px-5 py-2 bg-cyan-600 hover:bg-cyan-500 text-white font-black text-[10px] sm:text-xs uppercase tracking-widest rounded-xl transition-all shadow-md active:scale-95 disabled:opacity-50 cursor-pointer"
                >
                  {insertMistMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                  {initialData?.id ? 'Update Mist Log' : 'Save Mist Log'}
                </button>
              )}
            />
          </div>
        </form>
      </div>
    </div>
  );
}

export default MistModal;