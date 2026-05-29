import { type FormEvent, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { buildApiUrl } from '../config';

/**
 * Shown after a successful Google OAuth sign-in when the user has no org yet.
 * Email is already known from the session — the user only needs to enter their
 * invite code.  The server resolves the org from the invite automatically.
 */
export default function OAuthInvitePage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) { navigate('/login', { replace: true }); return; }
      setEmail(session.user.email ?? null);
    });
  }, [navigate]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!email) return;
    setError(null);
    setLoading(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { navigate('/login', { replace: true }); return; }

      // Look up invite by email + code — org is resolved server-side
      const res = await fetch(buildApiUrl('/api/auth/validate-invite-by-email'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ email, inviteCode: code.trim().toUpperCase() }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.detail || json.error || 'Invalid invite code');
        return;
      }

      // Assign membership server-side then send to dashboard
      navigate('/dashboard', { replace: true });
    } catch (err: any) {
      setError(err?.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  const inputClass =
    'w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/60';

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 px-4">
      <div className="w-full max-w-sm rounded-3xl border border-white/[0.06] bg-white/[0.03] p-8 shadow-2xl">
        <h1 className="text-xl font-semibold text-white mb-1">Enter your invite code</h1>
        <p className="text-sm text-slate-400 mb-6">
          Your account was created with <span className="text-slate-200">{email || '…'}</span>.
          Enter the invite code sent to that email to finish joining your organization.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="text"
            placeholder="Invite code (e.g. ABC123)"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            className={inputClass}
            required
            autoFocus
          />
          {error && (
            <p className="text-sm text-rose-400">{error}</p>
          )}
          <button
            type="submit"
            disabled={loading || !code.trim()}
            className="w-full rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            {loading ? 'Verifying…' : 'Join organization'}
          </button>
        </form>

        <button
          onClick={async () => { await supabase.auth.signOut(); navigate('/login', { replace: true }); }}
          className="mt-4 w-full text-center text-xs text-slate-500 hover:text-slate-300"
        >
          Sign out and use a different account
        </button>
      </div>
    </div>
  );
}
