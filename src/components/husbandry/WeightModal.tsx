import { useEffect, useMemo } from 'react';
import { useForm, type FieldApi } from '@tanstack/react-form';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import * as v from 'valibot';
import { X, Save, Loader2, Scale, Sun, Moon, Check, Feather } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../../lib/auth';
import { supabase } from '../../lib/supabase';
import { weightService } from '../../services/weightService';
import type { Animal, WeightLog, User } from '../../types';

export interface WeightModalProps {
  isOpen: boolean;
  onClose: () => void;
  animalId: string;
  initialData?: Partial<WeightLog> | null;
  selectedDate?: string;
}

interface WeightFormValues {
  weight_g?: number | '';
  weight_kg?: number | '';
  weight_lb?: number | '';
  weight_oz?: number | '';
  weight_eighths?: number | '';
  am_pm: 'AM' | 'PM';
  has_cast: boolean;
  recorded_by: string;
  recorded_at: string;
  notes?: string;
}

const GRAMS_PER_OZ = 28.349523125;

const toGrams = (values: Partial<WeightFormValues>, unit: string): number => {
  const safeUnit = (unit || 'g').toLowerCase().trim();
  if (safeUnit === 'lb') {
    const totalOz =
      (Number(values.weight_lb) || 0) * 16 +
      (Number(values.weight_oz) || 0) +
      (Number(values.weight_eighths) || 0) / 8;
    return Math.round(totalOz * GRAMS_PER_OZ);
  }
  if (safeUnit === 'oz') {
    const totalOz =
      (Number(values.weight_oz) || 0) + (Number(values.weight_eighths) || 0) / 8;
    return Math.round(totalOz * GRAMS_PER_OZ);
  }
  if (safeUnit === 'kg') return Math.round((Number(values.weight_kg) || 0) * 1000);
  return Math.round(Number(values.weight_g) || 0);
};

const fromGrams = (grams: number | null | undefined, unit: string) => {
  if (grams === null || grams === undefined) {
    return {
      weight_g: '' as const,
      weight_kg: '' as const,
      weight_lb: '' as const,
      weight_oz: '' as const,
      weight_eighths: '' as const,
    };
  }

  let weight_lb = 0;
  let weight_oz = 0;
  let weight_eighths = 0;
  const weight_g = Math.round(grams);
  const weight_kg = Number((grams / 1000).toFixed(3));

  const totalOunces = grams / GRAMS_PER_OZ;
  let totalOzInt = Math.floor(totalOunces);
  let e = Math.round((totalOunces - totalOzInt) * 8);

  if (e >= 8) {
    totalOzInt += 1;
    e = 0;
  }

  const safeUnit = (unit || 'g').toLowerCase().trim();
  if (safeUnit === 'lb') {
    weight_lb = Math.floor(totalOzInt / 16);
    weight_oz = totalOzInt % 16;
    weight_eighths = e;
  } else if (safeUnit === 'oz') {
    weight_oz = totalOzInt;
    weight_eighths = e;
  }

  return { weight_g, weight_kg, weight_lb, weight_oz, weight_eighths };
};

const WeightSchema = v.pipe(
  v.object({
    weight_g: v.optional(v.union([v.number(), v.literal('')])),
    weight_kg: v.optional(v.union([v.number(), v.literal('')])),
    weight_lb: v.optional(v.union([v.number(), v.literal('')])),
    weight_oz: v.optional(v.union([v.number(), v.literal('')])),
    weight_eighths: v.optional(v.union([v.number(), v.literal('')])),
    am_pm: v.picklist(['AM', 'PM']),
    has_cast: v.boolean(),
    recorded_by: v.pipe(
      v.string(),
      v.minLength(1, 'ZLA COMPLIANCE: An active staff member must be selected.')
    ),
    recorded_at: v.pipe(v.string(), v.minLength(1, 'Date and time required')),
    notes: v.optional(v.string()),
  }),
  v.check((data) => {
    return (
      toGrams(data, 'lb') > 0 ||
      toGrams(data, 'oz') > 0 ||
      toGrams(data, 'g') > 0 ||
      toGrams(data, 'kg') > 0
    );
  }, 'Total calculated weight must be greater than 0')
);

const extractErrorText = (errors: unknown): string | null => {
  if (!errors) return null;
  const errArray = Array.isArray(errors) ? errors : [errors];
  if (errArray.length === 0) return null;
  const messages = errArray
    .map((e) => {
      if (typeof e === 'string') return e;
      if (
        e &&
        typeof e === 'object' &&
        'message' in e &&
        typeof (e as { message: unknown }).message === 'string'
      ) {
        return (e as { message: string }).message;
      }
      return null;
    })
    .filter(Boolean);
  return messages.length > 0 ? messages.join(', ') : null;
};

const FieldError = ({ meta }: { meta: { errors?: unknown[] } }) => {
  if (!meta?.errors || meta.errors.length === 0) return null;
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

export function WeightModal({
  isOpen,
  onClose,
  animalId,
  initialData,
  selectedDate,
}: WeightModalProps) {
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  const { data: activeStaff = [] } = useQuery<User[]>({
    queryKey: ['active-staff'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('users')
        .select('id, name, initials')
        .eq('is_active', true)
        .eq('is_deleted', false)
        .order('name');
      if (error) throw error;
      return (data || []) as User[];
    },
    staleTime: 1000 * 60 * 15,
    gcTime: 1000 * 60 * 60 * 24 * 14,
    networkMode: 'offlineFirst',
  });

  const animalUnit = useMemo(() => {
    const cachedAnimals =
      queryClient.getQueryData<Animal[]>(['animals', 'dashboard']) ||
      queryClient.getQueryData<Animal[]>(['animals', 'husbandry']) ||
      [];
    const animal = cachedAnimals.find((a) => a.id === animalId);
    return animal?.preferred_weight_unit || animal?.weight_unit || 'g';
  }, [queryClient, animalId]);

  const insertWeightMutation = useMutation({
    mutationFn: async (values: WeightFormValues) => {
      const result = v.safeParse(WeightSchema, values);
      if (!result.success) {
        throw new Error(result.issues[0]?.message || 'Validation failed');
      }

      const calculatedGrams = toGrams(values, animalUnit);
      if (calculatedGrams <= 0) {
        throw new Error('Total calculated bio-weight must be greater than 0');
      }

      const payload = {
        id: initialData?.id || undefined,
        animal_id: animalId,
        recorded_by: values.recorded_by,
        recorded_at: new Date(values.recorded_at).toISOString(),
        created_by: profile?.id || null,
        weight_grams: calculatedGrams,
        am_pm: values.am_pm,
        has_cast: values.has_cast,
        notes: values.notes?.trim() || null,
        is_deleted: false,
      };

      return await weightService.insertWeightLog(payload);
    },
    onSuccess: () => {
      toast.success(
        initialData?.id ? 'Bio-weight updated successfully' : 'Bio-weight logged successfully'
      );
      queryClient.invalidateQueries({ queryKey: ['weights'] });
      queryClient.invalidateQueries({ queryKey: ['weight_logs'] });
      queryClient.invalidateQueries({ queryKey: ['daily_logs'] });
      onClose();
    },
    onError: (error: unknown) => {
      const msg = error instanceof Error ? error.message : 'Failed to log bio-weight';
      toast.error(msg);
    },
  });

  const form = useForm<WeightFormValues>({
    defaultValues: {
      ...fromGrams(initialData?.weight_grams, animalUnit),
      am_pm: (initialData?.am_pm as 'AM' | 'PM') || (new Date().getHours() < 12 ? 'AM' : 'PM'),
      has_cast: Boolean(initialData?.has_cast),
      recorded_by:
        initialData?.recorded_by || (initialData as any)?.weighed_by || profile?.id || '',
      recorded_at: initialData?.recorded_at
        ? formatLocalDatetime(initialData.recorded_at)
        : getDefaultDateTime(selectedDate),
      notes: initialData?.notes || '',
    },
    validators: {
      onSubmit: ({ value }) => {
        const result = v.safeParse(WeightSchema, value);
        if (!result.success) {
          return result.issues[0]?.message || 'Please complete all required fields';
        }
        return undefined;
      },
    },
    onSubmit: async ({ value }) => {
      await insertWeightMutation.mutateAsync(value);
    },
  });

  useEffect(() => {
    if (isOpen) {
      form.reset();
      const decomp = fromGrams(initialData?.weight_grams, animalUnit);
      form.setFieldValue('weight_g', decomp.weight_g);
      form.setFieldValue('weight_kg', decomp.weight_kg);
      form.setFieldValue('weight_lb', decomp.weight_lb);
      form.setFieldValue('weight_oz', decomp.weight_oz);
      form.setFieldValue('weight_eighths', decomp.weight_eighths);

      form.setFieldValue(
        'am_pm',
        (initialData?.am_pm as 'AM' | 'PM') || (new Date().getHours() < 12 ? 'AM' : 'PM')
      );
      form.setFieldValue('has_cast', Boolean(initialData?.has_cast));
      form.setFieldValue(
        'recorded_by',
        initialData?.recorded_by || (initialData as any)?.weighed_by || profile?.id || ''
      );
      form.setFieldValue(
        'recorded_at',
        initialData?.recorded_at
          ? formatLocalDatetime(initialData.recorded_at)
          : getDefaultDateTime(selectedDate)
      );
      form.setFieldValue('notes', initialData?.notes || '');
    }
  }, [isOpen, initialData, animalUnit, selectedDate, profile?.id, form]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/70 backdrop-blur-md animate-in fade-in duration-200 font-sans">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm sm:max-w-md max-h-[92vh] flex flex-col overflow-hidden border border-slate-200/80">
        {/* Header Bar */}
        <div className="px-5 py-3.5 border-b border-slate-100 bg-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-2xl bg-emerald-50 text-emerald-600 border border-emerald-100 flex items-center justify-center font-black shadow-xs shrink-0">
              <Scale size={18} />
            </div>
            <div>
              <h2 className="text-xs sm:text-sm font-black text-slate-900 uppercase tracking-tight leading-none">
                {initialData?.id ? 'Edit Bio-Weight' : 'Log Specimen Weight'}
              </h2>
              <p className="text-[9px] sm:text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">
                Protocol Target •{' '}
                <span className="text-emerald-600 font-mono font-black">{animalUnit.toUpperCase()}</span>
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
          {/* Shift Time of Day Selector */}
          <form.Field name="am_pm">
            {(field: FieldApi<WeightFormValues, 'am_pm', any, any>) => (
              <div className="space-y-1">
                <label className="block text-[9px] sm:text-[10px] font-black uppercase tracking-widest text-slate-500">
                  Shift Weigh Window
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => field.handleChange('AM')}
                    className={`py-2 px-2.5 rounded-xl border-2 font-black text-[10px] sm:text-xs uppercase tracking-widest transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                      field.state.value === 'AM'
                        ? 'bg-emerald-50 border-emerald-500 text-emerald-800 shadow-xs'
                        : 'border-slate-200 bg-slate-50 text-slate-400 hover:bg-slate-100 hover:text-slate-600'
                    }`}
                  >
                    <Sun
                      size={12}
                      className={field.state.value === 'AM' ? 'text-emerald-600' : 'text-slate-400'}
                    />
                    AM Weight
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
                    <Moon
                      size={12}
                      className={field.state.value === 'PM' ? 'text-indigo-600' : 'text-slate-400'}
                    />
                    PM Weight
                  </button>
                </div>
              </div>
            )}
          </form.Field>

          {/* Conducted By & Recorded At */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-3">
            <form.Field name="recorded_by">
              {(field: FieldApi<WeightFormValues, 'recorded_by', any, any>) => (
                <div className="space-y-1">
                  <label
                    htmlFor="weight-recorded-by"
                    className="block text-[9px] sm:text-[10px] font-black uppercase tracking-widest text-slate-500"
                  >
                    Conducted By *
                  </label>
                  <select
                    id="weight-recorded-by"
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-2 text-xs font-bold text-slate-900 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 cursor-pointer"
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
              {(field: FieldApi<WeightFormValues, 'recorded_at', any, any>) => (
                <div className="space-y-1">
                  <label
                    htmlFor="weight-recorded-at"
                    className="block text-[9px] sm:text-[10px] font-black uppercase tracking-widest text-slate-500"
                  >
                    Date &amp; Time
                  </label>
                  <input
                    id="weight-recorded-at"
                    type="datetime-local"
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 sm:px-3 sm:py-2 text-xs font-bold text-slate-900 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                  />
                  <FieldError meta={field.state.meta} />
                </div>
              )}
            </form.Field>
          </div>

          {/* Unit-Specific Weight Input Cards */}
          <div className="space-y-1 bg-emerald-50/40 p-3 sm:p-3.5 rounded-2xl border border-emerald-100">
            <div className="flex items-center justify-between mb-1">
              <span className="block text-[9px] sm:text-[10px] font-black uppercase tracking-widest text-emerald-800">
                Measured Scale Reading
              </span>
              <span className="text-[8px] sm:text-[9px] font-mono bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full font-black">
                {animalUnit.toUpperCase()}
              </span>
            </div>

            {animalUnit === 'lb' && (
              <div className="grid grid-cols-3 gap-1.5 sm:gap-2">
                <form.Field name="weight_lb">
                  {(field: FieldApi<WeightFormValues, 'weight_lb', any, any>) => (
                    <div className="relative">
                      <input
                        type="number"
                        step="1"
                        min="0"
                        value={field.state.value ?? ''}
                        onChange={(e) =>
                          field.handleChange(
                            e.target.value === '' ? '' : parseFloat(e.target.value)
                          )
                        }
                        className="w-full bg-white pl-2 pr-6 py-2 border border-emerald-200 rounded-xl text-sm sm:text-base font-black text-slate-900 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 text-center"
                        placeholder="0"
                      />
                      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-[10px] uppercase">
                        lb
                      </span>
                    </div>
                  )}
                </form.Field>

                <form.Field name="weight_oz">
                  {(field: FieldApi<WeightFormValues, 'weight_oz', any, any>) => (
                    <div className="relative">
                      <input
                        type="number"
                        step="1"
                        min="0"
                        max="15"
                        value={field.state.value ?? ''}
                        onChange={(e) =>
                          field.handleChange(
                            e.target.value === '' ? '' : parseFloat(e.target.value)
                          )
                        }
                        className="w-full bg-white pl-2 pr-6 py-2 border border-emerald-200 rounded-xl text-sm sm:text-base font-black text-slate-900 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 text-center"
                        placeholder="0"
                      />
                      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-[10px] uppercase">
                        oz
                      </span>
                    </div>
                  )}
                </form.Field>

                <form.Field name="weight_eighths">
                  {(field: FieldApi<WeightFormValues, 'weight_eighths', any, any>) => (
                    <div className="relative">
                      <input
                        type="number"
                        step="1"
                        min="0"
                        max="7"
                        value={field.state.value ?? ''}
                        onChange={(e) =>
                          field.handleChange(
                            e.target.value === '' ? '' : parseFloat(e.target.value)
                          )
                        }
                        className="w-full bg-white pl-2 pr-6 py-2 border border-emerald-200 rounded-xl text-sm sm:text-base font-black text-slate-900 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 text-center"
                        placeholder="0"
                      />
                      <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-400 font-black text-[9px]">
                        1/8
                      </span>
                    </div>
                  )}
                </form.Field>
              </div>
            )}

            {animalUnit === 'oz' && (
              <div className="grid grid-cols-2 gap-1.5 sm:gap-2">
                <form.Field name="weight_oz">
                  {(field: FieldApi<WeightFormValues, 'weight_oz', any, any>) => (
                    <div className="relative">
                      <input
                        type="number"
                        step="1"
                        min="0"
                        value={field.state.value ?? ''}
                        onChange={(e) =>
                          field.handleChange(
                            e.target.value === '' ? '' : parseFloat(e.target.value)
                          )
                        }
                        className="w-full bg-white pl-2 pr-7 py-2 border border-emerald-200 rounded-xl text-sm sm:text-base font-black text-slate-900 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 text-center"
                        placeholder="0"
                      />
                      <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-[10px] uppercase">
                        oz
                      </span>
                    </div>
                  )}
                </form.Field>

                <form.Field name="weight_eighths">
                  {(field: FieldApi<WeightFormValues, 'weight_eighths', any, any>) => (
                    <div className="relative">
                      <input
                        type="number"
                        step="1"
                        min="0"
                        max="7"
                        value={field.state.value ?? ''}
                        onChange={(e) =>
                          field.handleChange(
                            e.target.value === '' ? '' : parseFloat(e.target.value)
                          )
                        }
                        className="w-full bg-white pl-2 pr-7 py-2 border border-emerald-200 rounded-xl text-sm sm:text-base font-black text-slate-900 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 text-center"
                        placeholder="0"
                      />
                      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 font-black text-[9px]">
                        1/8
                      </span>
                    </div>
                  )}
                </form.Field>
              </div>
            )}

            {animalUnit === 'g' && (
              <form.Field name="weight_g">
                {(field: FieldApi<WeightFormValues, 'weight_g', any, any>) => (
                  <div className="relative">
                    <input
                      type="number"
                      step="1"
                      min="0"
                      value={field.state.value ?? ''}
                      onChange={(e) =>
                        field.handleChange(
                          e.target.value === '' ? '' : parseFloat(e.target.value)
                        )
                      }
                      className="w-full bg-white pl-3 pr-8 py-2 border border-emerald-200 rounded-xl text-base sm:text-lg font-black text-slate-900 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                      placeholder="0"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 font-black text-xs uppercase">
                      g
                    </span>
                  </div>
                )}
              </form.Field>
            )}

            {animalUnit === 'kg' && (
              <form.Field name="weight_kg">
                {(field: FieldApi<WeightFormValues, 'weight_kg', any, any>) => (
                  <div className="relative">
                    <input
                      type="number"
                      step="0.001"
                      min="0"
                      value={field.state.value ?? ''}
                      onChange={(e) =>
                        field.handleChange(
                          e.target.value === '' ? '' : parseFloat(e.target.value)
                        )
                      }
                      className="w-full bg-white pl-3 pr-9 py-2 border border-emerald-200 rounded-xl text-base sm:text-lg font-black text-slate-900 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                      placeholder="0.000"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 font-black text-xs uppercase">
                      kg
                    </span>
                  </div>
                )}
              </form.Field>
            )}
          </div>

          {/* Cast Pellet Checkbox Card */}
          <form.Field name="has_cast">
            {(field: FieldApi<WeightFormValues, 'has_cast', any, any>) => (
              <label className="flex items-center gap-2.5 p-2.5 bg-slate-50 border border-slate-200 rounded-xl cursor-pointer hover:bg-slate-100/80 transition-colors">
                <input
                  type="checkbox"
                  checked={field.state.value}
                  onChange={(e) => field.handleChange(e.target.checked)}
                  className="w-3.5 h-3.5 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500 cursor-pointer shrink-0"
                />
                <span className="text-[11px] sm:text-xs font-bold text-slate-700 uppercase tracking-wide flex items-center gap-1.5">
                  <Feather size={12} className="text-slate-400 shrink-0" />
                  Bird has cast pellet prior to weighing
                </span>
              </label>
            )}
          </form.Field>

          {/* Husbandry Notes */}
          <form.Field name="notes">
            {(field: FieldApi<WeightFormValues, 'notes', any, any>) => (
              <div className="space-y-1">
                <label
                  htmlFor="weight-notes"
                  className="block text-[9px] sm:text-[10px] font-black uppercase tracking-widest text-slate-500"
                >
                  Notes / Observations
                </label>
                <textarea
                  id="weight-notes"
                  rows={2}
                  value={field.state.value || ''}
                  onChange={(e) => field.handleChange(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs font-medium text-slate-900 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 resize-none"
                  placeholder="Flying performance, condition, keeling..."
                />
              </div>
            )}
          </form.Field>

          {/* Actions */}
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
                  disabled={insertWeightMutation.isPending || isSubmitting}
                  className="flex items-center gap-1.5 px-4 sm:px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-black text-[10px] sm:text-xs uppercase tracking-widest rounded-xl transition-all shadow-md active:scale-95 disabled:opacity-50 cursor-pointer"
                >
                  {insertWeightMutation.isPending ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Check size={14} />
                  )}
                  {initialData?.id ? 'Update' : 'Confirm'}
                </button>
              )}
            />
          </div>
        </form>
      </div>
    </div>
  );
}

export default WeightModal; 