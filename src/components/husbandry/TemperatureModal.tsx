import { useEffect, useMemo } from 'react';
import { useForm, type FieldApi } from '@tanstack/react-form';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import * as v from 'valibot';
import { X, Save, Loader2, ThermometerSun, Thermometer, Droplets } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../../lib/auth';
import { supabase } from '../../lib/supabase';
import type { Animal, TemperatureLog, User } from '../../types';

export interface TemperatureModalProps {
  isOpen: boolean;
  onClose: () => void;
  animalId?: string | null;
  animal?: Animal | null;
  ambientOnly?: boolean;
  initialData?: Partial<TemperatureLog> | null;
  selectedDate?: string;
}

interface TemperatureFormValues {
  recorded_by: string;
  recorded_at: string;
  temp_ambient?: number | string | null;
  temp_basking?: number | string | null;
  temp_cool?: number | string | null;
  humidity_percent?: number | string | null;
  notes?: string;
}

const TemperatureSchema = v.pipe(
  v.object({
    recorded_by: v.pipe(v.string(), v.minLength(1, 'ZLA COMPLIANCE: An active staff member must be selected.')),
    recorded_at: v.pipe(v.string(), v.minLength(1, 'Date and time required')),
    temp_ambient: v.optional(v.nullable(v.union([v.number(), v.string(), v.literal('')]))),
    temp_basking: v.optional(v.nullable(v.union([v.number(), v.string(), v.literal('')]))),
    temp_cool: v.optional(v.nullable(v.union([v.number(), v.string(), v.literal('')]))),
    humidity_percent: v.optional(v.nullable(v.union([v.number(), v.string(), v.literal('')]))),
    notes: v.optional(v.string()),
  }),
  v.check((data) => {
    const hasAmb = data.temp_ambient !== '' && data.temp_ambient !== null && data.temp_ambient !== undefined;
    const hasBask = data.temp_basking !== '' && data.temp_basking !== null && data.temp_basking !== undefined;
    const hasCool = data.temp_cool !== '' && data.temp_cool !== null && data.temp_cool !== undefined;
    return hasAmb || hasBask || hasCool;
  }, 'At least one temperature reading (Ambient, Basking, or Cool) is required.')
);

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

export function TemperatureModal({
  isOpen,
  onClose,
  animalId,
  animal: propAnimal,
  ambientOnly: propAmbientOnly,
  initialData,
  selectedDate,
}: TemperatureModalProps) {
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  const targetAnimalId = propAnimal?.id || animalId || initialData?.animal_id || '';

  const animal = useMemo(() => {
    if (propAnimal) return propAnimal;
    const cachedAnimals = queryClient.getQueryData<Animal[]>(['animals', 'dashboard']) || [];
    return cachedAnimals.find((a) => a.id === targetAnimalId);
  }, [propAnimal, queryClient, targetAnimalId]);

  const isAmbientOnly = propAmbientOnly ?? animal?.ambient_temp_only ?? (animal?.category !== 'EXOTIC');

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

  const insertTemperatureMutation = useMutation({
    mutationFn: async (values: TemperatureFormValues) => {
      const result = v.safeParse(TemperatureSchema, values);
      if (!result.success) {
        throw new Error(result.issues[0]?.message || 'Validation failed');
      }

      if (!targetAnimalId) {
        throw new Error('Target specimen identifier is missing.');
      }

      const baskingNum = values.temp_basking !== '' && values.temp_basking !== null && values.temp_basking !== undefined ? Number(values.temp_basking) : null;
      const coolNum = values.temp_cool !== '' && values.temp_cool !== null && values.temp_cool !== undefined ? Number(values.temp_cool) : null;
      const ambientNum = values.temp_ambient !== '' && values.temp_ambient !== null && values.temp_ambient !== undefined ? Number(values.temp_ambient) : null;
      const humidityNum = values.humidity_percent !== '' && values.humidity_percent !== null && values.humidity_percent !== undefined ? Number(values.humidity_percent) : null;

      let averageNum: number | null = null;
      if (baskingNum !== null && coolNum !== null) {
        averageNum = Number(((baskingNum + coolNum) / 2).toFixed(1));
      } else if (baskingNum !== null) {
        averageNum = baskingNum;
      } else if (ambientNum !== null) {
        averageNum = ambientNum;
      }

      const recordId =
        initialData?.id ||
        (typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : Math.random().toString(36).substring(2));

      const payload = {
        id: recordId,
        animal_id: targetAnimalId,
        recorded_by: values.recorded_by,
        recorded_at: new Date(values.recorded_at).toISOString(),
        created_by: profile?.id || null,
        temp_ambient: ambientNum,
        temp_basking: baskingNum,
        temp_cool: coolNum,
        temp_average: averageNum,
        humidity_percent: humidityNum,
        notes: values.notes?.trim() || null,
        is_deleted: false,
      };

      const { data, error } = await supabase
        .from('temperature_logs')
        .upsert(payload)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success(initialData?.id ? 'Thermal telemetry updated' : 'Thermal readings logged');
      queryClient.invalidateQueries({ queryKey: ['temperatures'] });
      queryClient.invalidateQueries({ queryKey: ['temperature_logs'] });
      queryClient.invalidateQueries({ queryKey: ['daily_logs'] });
      onClose();
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : 'Failed to log thermal reading';
      toast.error(msg);
    },
  });

  const form = useForm<TemperatureFormValues>({
    defaultValues: {
      recorded_by: initialData?.recorded_by || profile?.id || '',
      recorded_at: initialData?.recorded_at
        ? formatLocalDatetime(initialData.recorded_at)
        : getDefaultDateTime(selectedDate),
      temp_ambient: initialData?.temp_ambient ?? '',
      temp_basking: initialData?.temp_basking ?? '',
      temp_cool: initialData?.temp_cool ?? '',
      humidity_percent: initialData?.humidity_percent ?? '',
      notes: initialData?.notes || '',
    },
    validators: {
      onSubmit: ({ value }) => {
        const result = v.safeParse(TemperatureSchema, value);
        if (!result.success) {
          return result.issues[0]?.message || 'Please complete all required fields';
        }
        return undefined;
      },
    },
    onSubmit: async ({ value }) => {
      await insertTemperatureMutation.mutateAsync(value);
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
            : getDefaultDateTime(selectedDate)
        );
        form.setFieldValue('temp_ambient', initialData.temp_ambient ?? '');
        form.setFieldValue('temp_basking', initialData.temp_basking ?? '');
        form.setFieldValue('temp_cool', initialData.temp_cool ?? '');
        form.setFieldValue('humidity_percent', initialData.humidity_percent ?? '');
        form.setFieldValue('notes', initialData.notes || '');
      } else {
        form.setFieldValue('recorded_by', profile?.id || '');
        form.setFieldValue('recorded_at', getDefaultDateTime(selectedDate));
        form.setFieldValue('temp_ambient', '');
        form.setFieldValue('temp_basking', '');
        form.setFieldValue('temp_cool', '');
        form.setFieldValue('humidity_percent', '');
        form.setFieldValue('notes', '');
      }
    }
  }, [isOpen, initialData, selectedDate, profile?.id, form]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/70 backdrop-blur-md animate-in fade-in duration-200 font-sans">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm sm:max-w-md max-h-[92vh] flex flex-col overflow-hidden border border-slate-200/80">
        {/* Header Bar */}
        <div className="px-5 py-3.5 border-b border-slate-100 bg-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-2xl bg-orange-50 text-orange-600 border border-orange-100 flex items-center justify-center font-black shadow-xs shrink-0">
              <ThermometerSun size={18} />
            </div>
            <div>
              <h2 className="text-xs sm:text-sm font-black text-slate-900 uppercase tracking-tight leading-none">
                {initialData?.id ? 'Edit Thermal Telemetry' : 'Log Thermal Reading'}
              </h2>
              <p className="text-[9px] sm:text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">
                Specimen • <span className="text-orange-700 font-bold">{animal?.name || 'Collection Specimen'}</span>
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
          {/* Keeper and Date Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-3">
            <form.Field name="recorded_by">
              {(field: FieldApi<TemperatureFormValues, 'recorded_by', any, any>) => (
                <div className="space-y-1">
                  <label
                    htmlFor="temp-recorded-by"
                    className="block text-[9px] sm:text-[10px] font-black uppercase tracking-widest text-slate-500"
                  >
                    Conducted By *
                  </label>
                  <select
                    id="temp-recorded-by"
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-2 text-xs font-bold text-slate-900 focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 cursor-pointer"
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
              {(field: FieldApi<TemperatureFormValues, 'recorded_at', any, any>) => (
                <div className="space-y-1">
                  <label
                    htmlFor="temp-recorded-at"
                    className="block text-[9px] sm:text-[10px] font-black uppercase tracking-widest text-slate-500"
                  >
                    Date &amp; Time
                  </label>
                  <input
                    id="temp-recorded-at"
                    type="datetime-local"
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 sm:px-3 sm:py-2 text-xs font-bold text-slate-900 focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20"
                  />
                  <FieldError meta={field.state.meta} />
                </div>
              )}
            </form.Field>
          </div>

          <hr className="border-slate-100" />

          {/* Temperature Controls */}
          {isAmbientOnly ? (
            <div className="bg-orange-50/40 p-3.5 rounded-2xl border border-orange-100 space-y-2">
              <span className="block text-[9px] sm:text-[10px] font-black uppercase tracking-widest text-orange-950">
                Weathering / Ambient Enclosure Temperature
              </span>
              <form.Field name="temp_ambient">
                {(field: FieldApi<TemperatureFormValues, 'temp_ambient', any, any>) => (
                  <div className="relative">
                    <input
                      type="number"
                      step="0.1"
                      value={field.state.value ?? ''}
                      onChange={(e) => field.handleChange(e.target.value === '' ? '' : parseFloat(e.target.value))}
                      placeholder="e.g. 18.5"
                      className="w-full bg-white border border-orange-200 rounded-xl pl-3 pr-10 py-2.5 text-lg font-black text-slate-900 focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-black text-slate-400">
                      °C
                    </span>
                  </div>
                )}
              </form.Field>
            </div>
          ) : (
            <div className="bg-orange-50/40 p-3.5 rounded-2xl border border-orange-100 space-y-3">
              <span className="block text-[9px] sm:text-[10px] font-black uppercase tracking-widest text-orange-950">
                Dual-Zone Enclosure Thermal Gradient
              </span>
              <div className="grid grid-cols-2 gap-2.5">
                <form.Field name="temp_basking">
                  {(field: FieldApi<TemperatureFormValues, 'temp_basking', any, any>) => (
                    <div className="space-y-1">
                      <label className="block text-[9px] font-black uppercase tracking-widest text-orange-900">
                        Basking / Hot Zone
                      </label>
                      <div className="relative">
                        <input
                          type="number"
                          step="0.1"
                          value={field.state.value ?? ''}
                          onChange={(e) => field.handleChange(e.target.value === '' ? '' : parseFloat(e.target.value))}
                          placeholder="e.g. 32.0"
                          className="w-full bg-white border border-orange-200 rounded-xl pl-3 pr-8 py-2 text-sm font-black text-slate-900 focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20"
                        />
                        <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] font-black text-slate-400">
                          °C
                        </span>
                      </div>
                    </div>
                  )}
                </form.Field>

                <form.Field name="temp_cool">
                  {(field: FieldApi<TemperatureFormValues, 'temp_cool', any, any>) => (
                    <div className="space-y-1">
                      <label className="block text-[9px] font-black uppercase tracking-widest text-blue-900">
                        Cool / Hide Zone
                      </label>
                      <div className="relative">
                        <input
                          type="number"
                          step="0.1"
                          value={field.state.value ?? ''}
                          onChange={(e) => field.handleChange(e.target.value === '' ? '' : parseFloat(e.target.value))}
                          placeholder="e.g. 24.5"
                          className="w-full bg-white border border-blue-200 rounded-xl pl-3 pr-8 py-2 text-sm font-black text-slate-900 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                        />
                        <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] font-black text-slate-400">
                          °C
                        </span>
                      </div>
                    </div>
                  )}
                </form.Field>
              </div>

              {/* Dynamic Mean Calculation Preview */}
              <form.Subscribe
                selector={(state) => [state.values.temp_basking, state.values.temp_cool]}
                children={([bask, cool]) => {
                  const b = Number(bask);
                  const c = Number(cool);
                  if (Number.isNaN(b) || Number.isNaN(c) || bask === '' || cool === '') return null;
                  const avg = ((b + c) / 2).toFixed(1);
                  return (
                    <div className="flex items-center justify-between px-3 py-1.5 bg-white/80 rounded-xl border border-orange-200/60 text-[10px] font-bold text-slate-600">
                      <span className="uppercase tracking-widest text-slate-400">Calculated Mean</span>
                      <span className="font-black text-orange-700 font-mono text-xs">{avg}°C</span>
                    </div>
                  );
                }}
              />
            </div>
          )}

          {/* Enclosure Humidity */}
          <form.Field name="humidity_percent">
            {(field: FieldApi<TemperatureFormValues, 'humidity_percent', any, any>) => (
              <div className="space-y-1">
                <label
                  htmlFor="temp-humidity"
                  className="block text-[9px] sm:text-[10px] font-black uppercase tracking-widest text-slate-500 flex items-center gap-1"
                >
                  <Droplets size={11} className="text-cyan-600" /> Enclosure Humidity Level (%)
                </label>
                <div className="relative">
                  <input
                    id="temp-humidity"
                    type="number"
                    step="1"
                    min="0"
                    max="100"
                    value={field.state.value ?? ''}
                    onChange={(e) => field.handleChange(e.target.value === '' ? '' : parseInt(e.target.value, 10))}
                    placeholder="e.g. 65"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-3 pr-8 py-2 text-xs font-bold text-slate-900 focus:outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-black text-slate-400">
                    %
                  </span>
                </div>
                <FieldError meta={field.state.meta} />
              </div>
            )}
          </form.Field>

          {/* Husbandry Notes */}
          <form.Field name="notes">
            {(field: FieldApi<TemperatureFormValues, 'notes', any, any>) => (
              <div className="space-y-1">
                <label
                  htmlFor="temp-notes"
                  className="block text-[9px] sm:text-[10px] font-black uppercase tracking-widest text-slate-500"
                >
                  Notes / Observations
                </label>
                <textarea
                  id="temp-notes"
                  rows={2}
                  value={field.state.value || ''}
                  onChange={(e) => field.handleChange(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs font-medium text-slate-900 focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 resize-none"
                  placeholder="Basking lamp replaced, thermostat adjusted..."
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
                  disabled={insertTemperatureMutation.isPending || isSubmitting}
                  className="flex items-center gap-1.5 px-4 sm:px-5 py-2 bg-orange-600 hover:bg-orange-500 text-white font-black text-[10px] sm:text-xs uppercase tracking-widest rounded-xl transition-all shadow-md active:scale-95 disabled:opacity-50 cursor-pointer"
                >
                  {insertTemperatureMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                  {initialData?.id ? 'Update Telemetry' : 'Log Temperature'}
                </button>
              )}
            />
          </div>
        </form>
      </div>
    </div>
  );
}

export default TemperatureModal;