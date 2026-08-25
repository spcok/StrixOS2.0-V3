import { type FormEvent, useState } from 'react';
import { Feather, Loader2, Lock, Mail, ShieldCheck } from 'lucide-react';
import { supabase } from '../../lib/supabase';

export function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const { error: authError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (authError) {
        setError(authError.message);
        setLoading(false);
        return;
      }

      // Supabase's onAuthStateChange in AuthProvider updates session state automatically[cite: 1]
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'An unexpected authentication error occurred.';
      setError(msg);
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4 relative overflow-hidden font-sans">
      {/* Dynamic Background Glows */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
        <div className="absolute -top-[40%] -left-[10%] w-[60%] h-[60%] rounded-full bg-emerald-500/10 blur-[120px] mix-blend-screen animate-pulse" />
        <div
          className="absolute top-[60%] -right-[15%] w-[70%] h-[70%] rounded-full bg-teal-600/10 blur-[140px] mix-blend-screen animate-pulse"
          style={{ animationDelay: '2s' }}
        />
      </div>

      <div className="max-w-md w-full relative z-10">
        {/* Brand Header */}
        <div className="text-center mb-8 animate-in slide-in-from-bottom-4 fade-in duration-500">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-3xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 mb-4 shadow-xl shadow-emerald-500/10">
            <Feather size={32} />
          </div>
          <h1 className="text-3xl font-black text-white tracking-tight">
            Strix<span className="text-emerald-400">OS</span>
          </h1>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1.5">
            Zoological &amp; Wildlife Management System[cite: 1, 2]
          </p>
        </div>

        {/* Auth Card */}
        <div className="bg-slate-900/80 backdrop-blur-xl rounded-3xl p-7 sm:p-8 border border-slate-800 shadow-2xl animate-in slide-in-from-bottom-6 fade-in duration-700">
          <form onSubmit={handleLogin} className="space-y-5">
            {error && (
              <div className="bg-rose-500/10 text-rose-400 p-3.5 rounded-xl text-xs font-bold border border-rose-500/20 text-center animate-in fade-in zoom-in-95">
                {error}
              </div>
            )}

            {/* Email Field */}
            <div className="space-y-1.5 group">
              <label
                htmlFor="login-email"
                className="text-[10px] font-black uppercase tracking-widest text-slate-400 group-focus-within:text-emerald-400 transition-colors block ml-1"
              >
                Staff Email Address
              </label>
              <div className="relative">
                <input
                  id="login-email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-slate-950/90 border border-slate-800 text-white pl-10 pr-4 py-3 rounded-xl focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition-all text-sm font-medium placeholder:text-slate-600"
                  placeholder="keeper@facility.com"
                  required
                />
                <Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-emerald-400 transition-colors pointer-events-none" />
              </div>
            </div>

            {/* Password Field */}
            <div className="space-y-1.5 group">
              <label
                htmlFor="login-password"
                className="text-[10px] font-black uppercase tracking-widest text-slate-400 group-focus-within:text-emerald-400 transition-colors block ml-1"
              >
                Security Password
              </label>
              <div className="relative">
                <input
                  id="login-password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-slate-950/90 border border-slate-800 text-white pl-10 pr-4 py-3 rounded-xl focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition-all text-sm font-medium placeholder:text-slate-600 font-mono"
                  placeholder="••••••••"
                  required
                />
                <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-emerald-400 transition-colors pointer-events-none" />
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-black uppercase tracking-widest text-xs p-3.5 rounded-xl transition-all active:scale-95 disabled:opacity-50 mt-2 shadow-lg shadow-emerald-600/20 flex items-center justify-center gap-2.5 cursor-pointer"
            >
              {loading ? (
                <>
                  <Loader2 size={16} className="animate-spin text-white" />
                  <span>Authenticating...</span>
                </>
              ) : (
                <>
                  <ShieldCheck size={16} />
                  <span>Secure Sign In</span>
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

export default LoginScreen;