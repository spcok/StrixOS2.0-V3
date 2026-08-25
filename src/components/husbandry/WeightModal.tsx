import React, { useEffect, useMemo } from 'react';
import { useForm } from '@tanstack/react-form';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { X, Save, Loader2, Scale, Sun, Moon, Check, Feather } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../../lib/auth';
import { supabase } from '../../lib/supabase';
import { weightService } from '../../services/weightService';
import { Animal } from '../../types';

export interface WeightModalProps {
  isOpen: boolean;
  animalId: string;
  initialData?: any;
  selectedDate?: string;
  onClose: () => void;
}

const extractErrorText = (errors: any): string | null => {
  if (!errors) return null;
  const errArray = Array.isArray(errors) ? errors : [errors];
  if (errArray.length === 0) return null;

  const messages = errArray
    .map((e: any) => {
      if (typeof e === 'string') return e;
      if (e && typeof e.message === 'string') return e.message;
      return null;
    })
    .filter(Boolean);

  return messages.length > 0 ? messages.join(', ') : null;
};

const FieldError = ({ meta }: { meta: any }) => {
  if (!meta?.errors || meta.errors.length === 0) return null;
  const text = extractErrorText(meta.errors);
  if (!text) return null;
  return <p className="text-[10px] text-rose-500 mt-0.5 font-bold">{text}</p>;
};

const formatLocalDatetime = (dateString?: string) => {
  const d = dateString ? new Date(dateString) : new Date();
  if (isNaN(d.getTime())) return new Date().toISOString().slice(0, 16);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
};

const getDefaultDateTime = (selectedDate?: string) => {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  const localTimeStr = now.toISOString().slice(11, 16);
  return selectedDate ? `${selectedDate}T${localTimeStr}` : now.toISOString().slice(0, 16);
};

const GRAMS_PER_OZ = 28.349523125;

const toGrams = (values: any, unit: string) => {
  const safeUnit = (unit || 'g').toLowerCase().trim();
  if (safeUnit === 'lb') {
    const totalOz = (Number(values.weight_lb) || 0) * 16 + (Number(values.weight_oz) || 0) + (Number(values.weight_eighths) || 0) / 8;
    return Math.round(totalOz * GRAMS_PER_OZ);
  }
  if (safeUnit === 'oz') {
    const totalOz = (Number(values.weight_oz) || 0) + (Number(values.weight_eighths) || 0) / 8;
    return Math.round(totalOz * GRAMS_PER_OZ);
  }
  if (safeUnit === 'kg') return Math.round((Number(values.weight_kg) || 0) * 1000);
  return Math.round(Number(values.weight_g) || 0);
};

const decomposeGrams = (grams: number | null | undefined, unit: string) => {
  if (!grams) return { g: '', kg: '', lb: '', oz: '', eighths: '0' };
  const safeUnit = (unit || 'g').toLowerCase().trim();

  if (safeUnit === 'kg') {
    return { g: '', kg: String(grams / 1000), lb: '', oz: '', eighths: '0' };
  }

  if (safeUnit === 'lb') {
    const totalOunces = grams / GRAMS_PER_OZ;
    let totalOzInt = Math.floor(totalOunces);
    let e = Math.round((totalOunces - totalOzInt) * 8);
    if (e >= 8) {
      totalOzInt += 1;
      e = 0;
    }
    const lb = Math.floor(totalOzInt / 16);
    const oz = totalOzInt % 16;
    return { g: '', kg: '', lb: String(lb), oz: String(oz), eighths: String(e) };
  }

  if (safeUnit === 'oz') {
    const totalOunces = grams / GRAMS_PER_OZ;
    let totalOzInt = Math.floor(totalOunces);
    let e = Math.round((totalOunces - totalOzInt) * 8);
    if (e >= 8) {
      totalOzInt += 1;
      e = 0;
    }
    return { g: '', kg: '', lb: '', oz: String(totalOzInt), eighths: String(e) };
  }

  return { g: String(Math.round(grams)), kg: '', lb: '', oz: '', eighths: '0' };
};

export function WeightModal({
  isOpen,
  animalId,
  initialData,
  selectedDate,
  onClose,
}: WeightModalProps) {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const isEditMode = !!initialData?.id;

  // 1. Fetch Animal Context
  const { data: animal } = useQuery({
    queryKey: ['animal_summary', animalId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('animals')
        .select('id, name, species, ring_number, weight_unit, flying_weight')
        .eq('id', animalId)
        .single();
      if (error) throw error;
      return data as Animal;
    },
    enabled: !!animalId && isOpen,
  });

  const targetUnit = (animal?.weight_unit || 'g').toLowerCase();

  // 2. Derive Initial Form Values
  const initialDecomposed = useMemo(() => {
    return decomposeGrams(initialData?.weight_grams, targetUnit);
  }, [initialData, targetUnit]);

  const defaultDateTime = useMemo(() => {
    if (initialData?.recorded_at) return formatLocalDatetime(initialData.recorded_at);
    return getDefaultDateTime(selectedDate);
  }, [initialData, selectedDate]);

  const defaultAmPm = useMemo(() => {
    if (initialData?.am_pm) return initialData.am_pm;
    const hour = new Date().getHours();
    return hour < 12 ? 'AM' : 'PM';
  }, [initialData]);

  // 3. Mutation Engine
  const submitMutation = useMutation({
    mutationFn: async (payload: any) => {
      return await weightService.insertWeightLog(payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['weights'] });
      queryClient.invalidateQueries({ queryKey: ['weight_logs'] });
      queryClient.invalidateQueries({ queryKey: ['animal_profile', animalId] });
      toast.success(isEditMode ? 'Weight entry updated.' : 'Weight successfully recorded.');
      onClose();
    },
    onError: (err: any) => {
      console.error('Weight submission error:', err);
      toast.error(err.message || 'Failed to record weight.');
    },
  });

  // 4. Form Initialization
  const form = useForm({
    defaultValues: {
      recorded_at: defaultDateTime,
      recorded_by: initialData?.recorded_by || initialData?.weighed_by || '',
      am_pm: defaultAmPm as 'AM' | 'PM',
      has_cast: Boolean(initialData?.has_cast),
      weight_g: initialDecomposed.g,
      weight_kg: initialDecomposed.kg,
      weight_lb: initialDecomposed.lb,
      weight_oz: initialDecomposed.oz,
      weight_eighths: initialDecomposed.eighths,
      notes: initialData?.notes || '',
    },
    onSubmit: async ({ value }) => {
      const calculatedGrams = toGrams(value, targetUnit);

      if (!calculatedGrams || calculatedGrams <= 0) {
        toast.error('Please enter a valid weight value greater than 0.');
        return;
      }

      if (!value.recorded_by || !value.recorded_by.trim()) {
        toast.error('Keeper initials / Weighed By is required for audit logs.');
        return;
      }

      const payload = {
        id: initialData?.id,
        animal_id: animalId,
        recorded_at: new Date(value.recorded_at).toISOString(),
        recorded_by: value.recorded_by.trim().toUpperCase(),
        weighed_by: value.recorded_by.trim().toUpperCase(),
        created_by: profile?.id || null,
        weight_grams: calculatedGrams,
        am_pm: value.am_pm,
        has_cast: value.has_cast,
        notes: value.notes?.trim() || null,
      };

      await submitMutation.mutateAsync(payload);
    },
  });

  useEffect(() => {
    if (isOpen) {
      form.reset({
        recorded_at: initialData?.recorded_at ? formatLocalDatetime(initialData.recorded_at) : getDefaultDateTime(selectedDate),
        recorded_by: initialData?.recorded_by || initialData?.weighed_by || '',
        am_pm: (initialData?.am_pm || (new Date().getHours() < 12 ? 'AM' : 'PM')) as 'AM' | 'PM',
        has_cast: Boolean(initialData?.has_cast),
        weight_g: initialDecomposed.g,
        weight_kg: initialDecomposed.kg,
        weight_lb: initialDecomposed.lb,
        weight_oz: initialDecomposed.oz,
        weight_eighths: initialDecomposed.eighths,
        notes: initialData?.notes || '',
      });
    }
  }, [isOpen, initialData, selectedDate, initialDecomposed]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-3 md:p-4 overflow-y-auto">
      <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl border border-slate-100 flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
        
        {/* MODAL HEADER */}
        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-emerald-50 rounded-2xl flex items-center justify-center text-emerald-600 border border-emerald-100 shrink-0">
              <Scale size={20} />
            </div>
            <div>
              <h3 className="text-base font-black text-slate-900 tracking-tight">
                {isEditMode ? 'Edit Weight Log' : 'Record Weight'}
              </h3>
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                {animal?.name || 'Loading specimen...'} {animal?.ring_number && `• ${animal.ring_number}`}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-all"
          >
            <X size={18} />
          </button>
        </div>

        {/* FORM CONTAINER */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            e.stopPropagation();
            form.handleSubmit();
          }}
          className="p-6 space-y-4 overflow-y-auto max-h-[calc(85vh-8rem)] custom-scrollbar"
        >
          {/* AM / PM SELECTOR TOUCH TARGETS */}
          <form.Field name="am_pm">
            {(field) => (
              <div>
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1.5">
                  Weigh Time Window
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => field.handleChange('AM')}
                    className={`flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all border ${
                      field.state.value === 'AM'
                        ? 'bg-amber-500 text-white border-amber-600 shadow-sm shadow-amber-500/20'
                        : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    <Sun size={15} /> AM Session
                  </button>
                  <button
                    type="button"
                    onClick={() => field.handleChange('PM')}
                    className={`flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all border ${
                      field.state.value === 'PM'
                        ? 'bg-indigo-600 text-white border-indigo-700 shadow-sm shadow-indigo-600/20'
                        : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    <Moon size={15} /> PM Session
                  </button>
                </div>
              </div>
            )}
          </form.Field>

          {/* DYNAMIC WEIGHT INPUTS BASED ON ANIMAL'S PROFILE UNIT */}
          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200/80 space-y-3">
            <div className="flex justify-between items-center">
              <label className="text-[10px] font-black text-slate-700 uppercase tracking-widest">
                Recorded Bio-Weight ({targetUnit.toUpperCase()})
              </label>
              {animal?.flying_weight && (
                <span className="text-[9px] font-bold text-slate-400 font-mono">
                  Target: {animal.flying_weight}g
                </span>
              )}
            </div>

            {/* GRAMS */}
            {targetUnit === 'g' && (
              <form.Field name="weight_g">
                {(field) => (
                  <div>
                    <div className="relative">
                      <input
                        type="number"
                        step="any"
                        placeholder="e.g. 850"
                        value={field.state.value}
                        onChange={(e) => field.handleChange(e.target.value)}
                        className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-base font-black text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all shadow-sm"
                      />
                      <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-black text-slate-400">
                        grams
                      </span>
                    </div>
                    <FieldError meta={field.state.meta} />
                  </div>
                )}
              </form.Field>
            )}

            {/* KILOGRAMS */}
            {targetUnit === 'kg' && (
              <form.Field name="weight_kg">
                {(field) => (
                  <div>
                    <div className="relative">
                      <input
                        type="number"
                        step="0.001"
                        placeholder="e.g. 1.250"
                        value={field.state.value}
                        onChange={(e) => field.handleChange(e.target.value)}
                        className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-base font-black text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all shadow-sm"
                      />
                      <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-black text-slate-400">
                        kg
                      </span>
                    </div>
                    <FieldError meta={field.state.meta} />
                  </div>
                )}
              </form.Field>
            )}

            {/* POUNDS & OUNCES & EIGHTHS */}
            {targetUnit === 'lb' && (
              <div className="grid grid-cols-3 gap-2">
                <form.Field name="weight_lb">
                  {(field) => (
                    <div>
                      <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1 block">
                        Lbs
                      </label>
                      <input
                        type="number"
                        min="0"
                        placeholder="0"
                        value={field.state.value}
                        onChange={(e) => field.handleChange(e.target.value)}
                        className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm font-black text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                      />
                    </div>
                  )}
                </form.Field>

                <form.Field name="weight_oz">
                  {(field) => (
                    <div>
                      <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1 block">
                        Oz
                      </label>
                      <input
                        type="number"
                        min="0"
                        max="15"
                        placeholder="0"
                        value={field.state.value}
                        onChange={(e) => field.handleChange(e.target.value)}
                        className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm font-black text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                      />
                    </div>
                  )}
                </form.Field>

                <form.Field name="weight_eighths">
                  {(field) => (
                    <div>
                      <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1 block">
                        Eighths (/8)
                      </label>
                      <select
                        value={field.state.value}
                        onChange={(e) => field.handleChange(e.target.value)}
                        className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-black text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                      >
                        <option value="0">0/8</option>
                        <option value="1">1/8</option>
                        <option value="2">2/8 (1/4)</option>
                        <option value="3">3/8</option>
                        <option value="4">4/8 (1/2)</option>
                        <option value="5">5/8</option>
                        <option value="6">6/8 (3/4)</option>
                        <option value="7">7/8</option>
                      </select>
                    </div>
                  )}
                </form.Field>
              </div>
            )}

            {/* OUNCES ONLY */}
            {targetUnit === 'oz' && (
              <div className="grid grid-cols-2 gap-2">
                <form.Field name="weight_oz">
                  {(field) => (
                    <div>
                      <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1 block">
                        Ounces
                      </label>
                      <input
                        type="number"
                        min="0"
                        placeholder="0"
                        value={field.state.value}
                        onChange={(e) => field.handleChange(e.target.value)}
                        className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm font-black text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                      />
                    </div>
                  )}
                </form.Field>

                <form.Field name="weight_eighths">
                  {(field) => (
                    <div>
                      <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1 block">
                        Eighths (/8)
                      </label>
                      <select
                        value={field.state.value}
                        onChange={(e) => field.handleChange(e.target.value)}
                        className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-black text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                      >
                        <option value="0">0/8</option>
                        <option value="1">1/8</option>
                        <option value="2">2/8 (1/4)</option>
                        <option value="3">3/8</option>
                        <option value="4">4/8 (1/2)</option>
                        <option value="5">5/8</option>
                        <option value="6">6/8 (3/4)</option>
                        <option value="7">7/8</option>
                      </select>
                    </div>
                  )}
                </form.Field>
              </div>
            )}
          </div>

          {/* CAST STATUS CHECKBOX */}
          <form.Field name="has_cast">
            {(field) => (
              <label className="flex items-center gap-3 p-3 bg-white border border-slate-200 rounded-2xl cursor-pointer hover:bg-slate-50 transition-colors shadow-sm">
                <input
                  type="checkbox"
                  checked={field.state.value}
                  onChange={(e) => field.handleChange(e.target.checked)}
                  className="hidden"
                />
                <div
                  className={`w-5 h-5 rounded-lg flex items-center justify-center border transition-all ${
                    field.state.value
                      ? 'bg-emerald-500 border-emerald-600 text-white'
                      : 'bg-white border-slate-300'
                  }`}
                >
                  {field.state.value && <Check size={14} strokeWidth={3} />}
                </div>
                <div className="flex items-center gap-1.5 text-xs font-black text-slate-800 uppercase tracking-tight">
                  <Feather size={14} className="text-slate-400" />
                  Bird has cast pellet prior to weigh-in
                </div>
              </label>
            )}
          </form.Field>

          {/* AUDIT & TIMESTAMPS */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <form.Field name="recorded_by">
              {(field) => (
                <div>
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1">
                    Weighed By (Initials) *
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. JD"
                    maxLength={10}
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value.toUpperCase())}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-black text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 uppercase"
                  />
                  <FieldError meta={field.state.meta} />
                </div>
              )}
            </form.Field>

            <form.Field name="recorded_at">
              {(field) => (
                <div>
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1">
                    Timestamp
                  </label>
                  <input
                    type="datetime-local"
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                  />
                  <FieldError meta={field.state.meta} />
                </div>
              )}
            </form.Field>
          </div>

          {/* NOTES */}
          <form.Field name="notes">
            {(field) => (
              <div>
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1">
                  Observations / Condition Notes
                </label>
                <textarea
                  rows={2}
                  placeholder="e.g. Sharp response, empty crop, clean cast."
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs font-medium text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 resize-none"
                />
              </div>
            )}
          </form.Field>

          {/* ACTION BUTTONS */}
          <div className="flex gap-2 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              disabled={submitMutation.isPending}
              className="flex-1 px-4 py-3 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-xs font-black uppercase tracking-widest transition-all disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitMutation.isPending}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-black uppercase tracking-widest shadow-sm shadow-emerald-600/20 transition-all active:scale-95 disabled:opacity-50"
            >
              {submitMutation.isPending ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <Save size={16} />
              )}
              {isEditMode ? 'Update Weight' : 'Save Weight'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default WeightModal;