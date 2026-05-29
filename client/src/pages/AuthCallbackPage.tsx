import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { buildApiUrl } from '../config';

/**
 * Google OAuth (and any Supabase OAuth provider) lands here after redirect.
 * Supabase exchanges the auth code → session automatically via the JS SDK.
 *
 * After confirming the session:
 *  - If the user already has an org → /dashboard
 *  - If the user has no org yet  → /auth/invite  (enter invite code)
 */
export default function AuthCallbackPage() {
  const navigate = useNavigate();
  const handled = useRef(false);

  useEffect(() => {
    if (handled.current) return;
    handled.current = true;

    supabase.auth.getSession().then(async ({ data: { session }, error }) => {
      if (error || !session) {
        console.error('[AuthCallback] session exchange failed:', error?.message);
        navigate('/login?error=oauth_failed', { replace: true });
        return;
      }

      // Check if this user already has an org assignment
      try {
        const resp = await fetch(buildApiUrl('/api/user/orgs'), {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        const json = resp.ok ? await resp.json().catch(() => ({})) : {};
        const orgs: any[] = json?.orgs || [];
        if (orgs.length > 0) {
          navigate('/dashboard', { replace: true });
        } else {
          // New Google OAuth user with no org — they need an invite code
          navigate('/auth/invite', { replace: true });
        }
      } catch {
        // On any network error, fall through to dashboard — AuthContext will handle it
        navigate('/dashboard', { replace: true });
      }
    });
  }, [navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-50">
      Signing you in…
    </div>
  );
}
