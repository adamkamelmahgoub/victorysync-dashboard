import type { FC } from "react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";

export const LoginPage: FC = () => {
  const navigate = useNavigate();
  const { signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const result = await signIn(email, password);
      if (result.error) {
        setError(result.error);
      } else {
        navigate("/");
      }
    } catch (err: any) {
      setError(err?.message || 'Sign in failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-stretch bg-gradient-to-b from-slate-900 to-slate-950 text-white">
      <div className="hidden md:flex md:flex-1 items-center justify-center bg-gradient-to-br from-blue-600 to-cyan-600 p-12">
        <div className="max-w-md text-center">
          <div className="w-20 h-20 mx-auto rounded-lg bg-white/10 flex items-center justify-center mb-6">
            <span className="text-white font-bold text-2xl">VS</span>
          </div>
          <h2 className="text-3xl font-bold mb-2">VictorySync</h2>
          <p className="text-slate-100/90">Welcome back — sign in to view your real-time call analytics and manage integrations.</p>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-lg">
          <div className="bg-slate-900/80 rounded-2xl p-8 shadow-xl ring-1 ring-slate-800">
            <div className="flex items-center justify-between mb-6">
              <div>
                <p className="text-xs font-semibold tracking-widest text-emerald-400 uppercase">VictorySync</p>
                <h1 className="mt-1 text-2xl font-semibold text-slate-50">Sign in</h1>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full rounded-lg border border-slate-700 bg-slate-950/80 px-4 py-3 text-sm text-slate-50 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-cyan-500 focus:border-cyan-500"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full rounded-lg border border-slate-700 bg-slate-950/80 px-4 py-3 text-sm text-slate-50 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-cyan-500 focus:border-cyan-500"
                  required
                />
              </div>

              {error && (
                <div className="rounded-lg bg-rose-500/10 border border-rose-500/20 p-3 text-sm text-rose-400">
                  {error}
                </div>
              )}

              <div className="flex items-center justify-between">
                <button
                  type="submit"
                  disabled={loading}
                  className="rounded-lg bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-600 hover:to-cyan-600 disabled:opacity-50 px-6 py-3 text-sm font-semibold text-slate-900 transition-colors"
                >
                  {loading ? 'Signing in...' : 'Sign in'}
                </button>
                <div className="text-xs text-slate-400">Need help? Contact your admin.</div>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};
