import React, { useState, useEffect } from 'react';
import QRCode from 'qrcode';
import { useAuth } from '../contexts/AuthContext';
import { PageLayout } from '../components/PageLayout';
import StripePortalButton from '../components/StripePortalButton';
import { buildApiUrl } from '../config';
import {
  getSelectedLeadAlarmIds,
  LEAD_ALARM_OPTIONS,
  LeadAlarmId,
  playLeadAlarmSequence,
  setSelectedLeadAlarmIds,
} from '../lib/leadAlarm';

const MAX_ACCOUNT_IMAGE_BYTES = 2 * 1024 * 1024;
const SECURITY_QUESTION_OPTIONS = [
  'What was the name of your first school?',
  'What city were you born in?',
  'What was your first job?',
  'What is the name of your favorite teacher?',
  'What was your childhood nickname?',
  'What is the name of your first pet?',
];

function isUploadableImageData(value?: string | null) {
  return /^data:image\/(png|jpe?g|webp|gif);base64,/i.test(String(value || ''));
}

export default function UserSettingsPage() {
  const { user, selectedOrgId, refreshProfile } = useAuth();
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [profilePicPreview, setProfilePicPreview] = useState<string | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [orgInfo, setOrgInfo] = useState<any>(null);
  const [apiKeys, setApiKeys] = useState<any[]>([]);
  const [loadingApiKeys, setLoadingApiKeys] = useState(false);
  const [generatingKey, setGeneratingKey] = useState(false);
  const [newKeyLabel, setNewKeyLabel] = useState('');
  const [showNewKeyPlaintext, setShowNewKeyPlaintext] = useState<string | null>(null);
  const [leadAlarmIds, setLeadAlarmIds] = useState<LeadAlarmId[]>([]);
  const [mfaFactors, setMfaFactors] = useState<any[]>([]);
  const [mfaEnroll, setMfaEnroll] = useState<{ factorId: string; otpauthUri?: string; secret?: string } | null>(null);
  const [mfaQrDataUrl, setMfaQrDataUrl] = useState<string | null>(null);
  const [mfaCode, setMfaCode] = useState('');
  const [emailMfaPending, setEmailMfaPending] = useState<{ factorId?: string; email?: string; expiresAt?: string } | null>(null);
  const [emailMfaCode, setEmailMfaCode] = useState('');
  const [mfaLoading, setMfaLoading] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    full_name: '',
    email: '',
    phone_number: '',
  });
  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
    authCode: '',
  });
  const [passwordCodeSentTo, setPasswordCodeSentTo] = useState<string | null>(null);
  const [passwordCodeExpiresAt, setPasswordCodeExpiresAt] = useState<string | null>(null);
  const [securityQuestions, setSecurityQuestions] = useState([
    { question: SECURITY_QUESTION_OPTIONS[0], answer: '' },
    { question: SECURITY_QUESTION_OPTIONS[1], answer: '' },
    { question: SECURITY_QUESTION_OPTIONS[2], answer: '' },
  ]);
  const [savedSecurityQuestions, setSavedSecurityQuestions] = useState<any[]>([]);

  useEffect(() => {
    if (user) {
      fetchProfile();
      loadMfaFactors();
      // loadApiKeys(); // TODO: user_api_keys table needs migration in production
    }
  }, [user, selectedOrgId]);

  useEffect(() => {
    setLeadAlarmIds(getSelectedLeadAlarmIds());
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!mfaEnroll?.otpauthUri) {
      setMfaQrDataUrl(null);
      return;
    }
    QRCode.toDataURL(mfaEnroll.otpauthUri, {
      margin: 1,
      width: 220,
      color: {
        dark: '#111827',
        light: '#ffffff',
      },
    })
      .then((url) => {
        if (!cancelled) setMfaQrDataUrl(url);
      })
      .catch(() => {
        if (!cancelled) setMfaQrDataUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [mfaEnroll?.otpauthUri]);

  const fetchProfile = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const suffix = selectedOrgId ? `?org_id=${encodeURIComponent(selectedOrgId)}` : '';
      const response = await fetch(buildApiUrl(`/api/user/profile${suffix}`), {
        headers: { 'x-user-id': user.id }
      });
      if (response.ok) {
        const data = await response.json();
        const userData = data.user || data.profile || data;
        setProfile(userData);
        setOrgInfo(data.organization || null);
        setFormData({
          full_name: userData.full_name || '',
          email: userData.email || '',
          phone_number: userData.phone_number || '',
        });
        if (userData.profile_pic_url) {
          setProfilePicPreview(userData.profile_pic_url);
        }
        if (data.organization?.logo_url) {
          setLogoPreview(data.organization.logo_url);
        }
        const savedQuestions = data.security_questions || [];
        setSavedSecurityQuestions(savedQuestions);
        if (savedQuestions.length > 0) {
          setSecurityQuestions((previous) => previous.map((item, index) => ({
            ...item,
            question: savedQuestions[index]?.question || item.question,
            answer: '',
          })));
        }
      } else {
        setMessage('Failed to load profile');
      }
    } catch (err: any) {
      setMessage(err?.message || 'Failed to load profile');
    } finally {
      setLoading(false);
    }
  };

  const loadApiKeys = async () => {
    if (!user) return;
    setLoadingApiKeys(true);
    try {
      const response = await fetch(buildApiUrl(`/api/admin/users/${user.id}/api-keys`), {
        headers: { 'x-user-id': user.id }
      });
      if (response.ok) {
        const data = await response.json();
        setApiKeys(data.api_keys || []);
      }
    } catch (err: any) {
      console.error('Failed to load API keys:', err);
    } finally {
      setLoadingApiKeys(false);
    }
  };

  const generateApiKey = async () => {
    if (!user || !newKeyLabel) {
      setMessage('Please enter a label for the API key');
      return;
    }
    setGeneratingKey(true);
    setMessage(null);
    try {
      const response = await fetch(buildApiUrl(`/api/admin/users/${user.id}/api-keys`), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': user.id
        },
        body: JSON.stringify({ label: newKeyLabel })
      });
      if (response.ok) {
        const data = await response.json();
        setShowNewKeyPlaintext(data.plaintext);
        setNewKeyLabel('');
        setMessage('API key generated! Copy it now - it won\'t be shown again.');
        loadApiKeys();
      } else {
        const error = await response.json();
        setMessage(error.error || 'Failed to generate API key');
      }
    } catch (err: any) {
      setMessage(err.message || 'Error generating API key');
    } finally {
      setGeneratingKey(false);
    }
  };

  const revokeApiKey = async (keyId: string) => {
    if (!user) return;
    if (!confirm('Are you sure you want to revoke this API key?')) return;
    
    try {
      const response = await fetch(buildApiUrl(`/api/admin/users/${user.id}/api-keys/${keyId}`), {
        method: 'DELETE',
        headers: { 'x-user-id': user.id }
      });
      if (response.ok) {
        setMessage('API key revoked');
        loadApiKeys();
      } else {
        setMessage('Failed to revoke API key');
      }
    } catch (err: any) {
      setMessage(err.message || 'Error revoking API key');
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setMessage('Copied to clipboard!');
    setTimeout(() => setMessage(null), 2000);
  };

  const loadMfaFactors = async () => {
    try {
      if (!user?.id) return;
      const response = await fetch(buildApiUrl('/api/user/mfa/factors'), {
        headers: { 'x-user-id': user.id },
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Unable to load 2FA factors');
      setMfaFactors(payload.factors || []);
    } catch {
      setMfaFactors([]);
    }
  };

  const startMfaEnroll = async () => {
    if (!user?.id) return;
    setMfaLoading(true);
    setMessage(null);
    try {
      const response = await fetch(buildApiUrl('/api/user/mfa/enroll'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-id': user.id },
        body: JSON.stringify({}),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const fallback =
          payload.error === 'mfa_migration_required'
            ? '2FA setup is not ready yet. Apply the MFA database migration, then try again.'
            : payload.error === 'invalid_user_session'
              ? 'Sign out and sign back in before enabling 2FA.'
              : payload.error === 'unauthenticated'
                ? 'Your session expired. Sign in again before enabling 2FA.'
                : 'Unable to start 2FA setup';
        throw new Error(payload.detail || fallback);
      }
      const factor = payload.factor || {};
      setMfaEnroll({
        factorId: factor.id,
        otpauthUri: factor.otpauth_uri,
        secret: factor.secret,
      });
      setMfaCode('');
      setMessage('Add the setup key to your authenticator app, then enter the 6-digit code to finish enabling 2FA.');
    } catch (err: any) {
      setMessage(err?.message || 'Unable to start 2FA setup.');
    } finally {
      setMfaLoading(false);
    }
  };

  const verifyMfaEnroll = async () => {
    if (!mfaEnroll) return;
    setMfaLoading(true);
    setMessage(null);
    try {
      if (!user?.id) return;
      const response = await fetch(buildApiUrl(`/api/user/mfa/${encodeURIComponent(mfaEnroll.factorId)}/verify`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-id': user.id },
        body: JSON.stringify({ code: mfaCode.trim() }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.detail || (payload.error === 'invalid_mfa_code' ? 'Invalid 2FA code. Scan the latest QR code and make sure your phone time is automatic.' : payload.error || 'Unable to verify 2FA code'));
      setMfaEnroll(null);
      setMfaCode('');
      setMfaQrDataUrl(null);
      await loadMfaFactors();
      setMessage('2FA enabled successfully');
    } catch (err: any) {
      setMessage(err?.message || 'Invalid 2FA code');
    } finally {
      setMfaLoading(false);
    }
  };

  const startEmailMfaEnroll = async () => {
    if (!user?.id) return;
    setMfaLoading(true);
    setMessage(null);
    try {
      const response = await fetch(buildApiUrl('/api/user/mfa/email/enroll'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-id': user.id },
        body: JSON.stringify({}),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const fallback =
          payload.error === 'mfa_email_migration_required'
            ? 'Email 2FA setup is not ready yet. Apply the email MFA database migration, then try again.'
            : payload.error === 'invalid_user_session'
              ? 'Sign out and sign back in before enabling email 2FA.'
              : payload.error === 'email_required'
                ? 'Your account needs an email address before email 2FA can be enabled.'
                : 'Unable to send email 2FA code';
        throw new Error(payload.detail || fallback);
      }
      const factor = payload.factor || {};
      setEmailMfaPending({ factorId: factor.id, email: factor.email, expiresAt: factor.code_expires_at });
      setEmailMfaCode('');
      setMessage(`We sent a 6-digit code to ${factor.email || 'your email address'}. Enter it to enable email 2FA.`);
    } catch (err: any) {
      setMessage(err?.message || 'Unable to send email 2FA code.');
    } finally {
      setMfaLoading(false);
    }
  };

  const verifyEmailMfaEnroll = async () => {
    if (!emailMfaPending || !user?.id) return;
    setMfaLoading(true);
    setMessage(null);
    try {
      const response = await fetch(buildApiUrl('/api/user/email-mfa/verify'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-id': user.id },
        body: JSON.stringify({ code: emailMfaCode.trim() }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.detail || payload.error || 'Unable to verify email code');
      setEmailMfaPending(null);
      setEmailMfaCode('');
      await loadMfaFactors();
      setMessage('Email 2FA enabled successfully');
    } catch (err: any) {
      setMessage(err?.message || 'Invalid email code');
    } finally {
      setMfaLoading(false);
    }
  };

  const removeMfaFactor = async (factorId: string) => {
    if (!confirm('Disable this 2FA factor?')) return;
    setMfaLoading(true);
    try {
      if (!user?.id) return;
      const response = await fetch(buildApiUrl(`/api/user/mfa/${encodeURIComponent(factorId)}`), {
        method: 'DELETE',
        headers: { 'x-user-id': user.id },
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Unable to disable 2FA');
      await loadMfaFactors();
      setMessage('2FA factor disabled');
    } catch (err: any) {
      setMessage(err?.message || 'Unable to disable 2FA');
    } finally {
      setMfaLoading(false);
    }
  };

  const toggleLeadAlarm = (id: LeadAlarmId) => {
    setLeadAlarmIds((current) => {
      const next = current.includes(id) ? current.filter((item) => item !== id) : [...current, id];
      const saved = next.length ? next : [id];
      setSelectedLeadAlarmIds(saved);
      return saved;
    });
  };

  const handleProfileChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handlePasswordChange = (field: string, value: string) => {
    setPasswordData(prev => ({ ...prev, [field]: value }));
  };

  const handleProfilePicChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.type.startsWith('image/')) {
        setMessage('Choose an image file for your profile picture');
        e.target.value = '';
        return;
      }
      if (file.size > MAX_ACCOUNT_IMAGE_BYTES) {
        setMessage('Profile picture must be 2 MB or smaller');
        e.target.value = '';
        return;
      }
      const reader = new FileReader();
      reader.onload = (event) => {
        setProfilePicPreview(event.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleLogoPicChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.type.startsWith('image/')) {
        setMessage('Choose an image file for the organization logo');
        e.target.value = '';
        return;
      }
      if (file.size > MAX_ACCOUNT_IMAGE_BYTES) {
        setMessage('Organization logo must be 2 MB or smaller');
        e.target.value = '';
        return;
      }
      const reader = new FileReader();
      reader.onload = (event) => {
        setLogoPreview(event.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const saveProfile = async () => {
    if (!user) return;
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch(buildApiUrl('/api/user/profile'), {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': user.id
        },
        body: JSON.stringify(formData)
      });

      if (response.ok) {
        setMessage('Profile updated successfully');
        setTimeout(() => setMessage(null), 3000);
        fetchProfile();
        await refreshProfile();
      } else {
        setMessage('Failed to update profile');
      }
    } catch (err: any) {
      setMessage(err.message || 'Error saving profile');
    } finally {
      setSaving(false);
    }
  };

  const uploadProfilePic = async () => {
    if (!user || !isUploadableImageData(profilePicPreview)) {
      setMessage('Choose a new profile picture before uploading');
      return;
    }
    setSaving(true);
    try {
      const response = await fetch(buildApiUrl('/api/user/upload-profile-pic'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': user.id
        },
        body: JSON.stringify({ image_data: profilePicPreview })
      });

      if (response.ok) {
        setMessage('Profile picture updated');
        setTimeout(() => setMessage(null), 3000);
        fetchProfile();
        await refreshProfile();
      } else {
        const error = await response.json().catch(() => ({}));
        setMessage(error.error === 'invalid_image_data' ? 'Choose a PNG, JPG, WebP, or GIF image up to 2 MB.' : 'Failed to upload profile picture');
      }
    } catch (err: any) {
      setMessage(err.message || 'Error uploading picture');
    } finally {
      setSaving(false);
    }
  };

  const uploadOrgLogo = async () => {
    if (!user || !isUploadableImageData(logoPreview)) {
      setMessage('Choose a new organization logo before uploading');
      return;
    }
    setSaving(true);
    try {
      const response = await fetch(buildApiUrl('/api/user/upload-org-logo'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': user.id
        },
        body: JSON.stringify({ image_data: logoPreview, org_id: selectedOrgId })
      });

      if (response.ok) {
        setMessage('Organization logo updated');
        setTimeout(() => setMessage(null), 3000);
        fetchProfile();
        await refreshProfile();
      } else {
        const error = await response.json().catch(() => ({}));
        setMessage(error.error === 'invalid_image_data' ? 'Choose a PNG, JPG, WebP, or GIF image up to 2 MB.' : 'Failed to upload logo');
      }
    } catch (err: any) {
      setMessage(err.message || 'Error uploading logo');
    } finally {
      setSaving(false);
    }
  };

  const sendPasswordCode = async () => {
    if (!user) return;
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch(buildApiUrl('/api/user/password-code'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': user.id
        },
        body: JSON.stringify({})
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const fallback = payload.error === 'account_security_migration_required'
          ? 'Account security setup needs the latest database migration before password codes can be sent.'
          : 'Failed to send password code';
        throw new Error(payload.detail || fallback);
      }
      setPasswordCodeSentTo(payload.email || formData.email || 'your email');
      setPasswordCodeExpiresAt(payload.expires_at || null);
      setMessage(`Password change code sent to ${payload.email || formData.email || 'your email'}`);
      setTimeout(() => setMessage(null), 4000);
    } catch (err: any) {
      setMessage(err.message || 'Error sending password code');
    } finally {
      setSaving(false);
    }
  };

  const handleSecurityQuestionChange = (index: number, field: 'question' | 'answer', value: string) => {
    setSecurityQuestions((previous) => previous.map((item, itemIndex) => (
      itemIndex === index ? { ...item, [field]: value } : item
    )));
  };

  const saveSecurityQuestions = async () => {
    if (!user) return;
    const completed = securityQuestions.filter((item) => item.question.trim() && item.answer.trim());
    if (completed.length < 2) {
      setMessage('Set at least two security questions and answers');
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch(buildApiUrl('/api/user/security-questions'), {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': user.id
        },
        body: JSON.stringify({ questions: completed })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const fallback = payload.error === 'account_security_migration_required'
          ? 'Account security setup needs the latest database migration before security questions can be saved.'
          : payload.error || 'Failed to save security questions';
        throw new Error(payload.detail || fallback);
      }
      setMessage('Security questions updated successfully');
      setSecurityQuestions((previous) => previous.map((item) => ({ ...item, answer: '' })));
      await fetchProfile();
      setTimeout(() => setMessage(null), 3000);
    } catch (err: any) {
      setMessage(err.message || 'Error saving security questions');
    } finally {
      setSaving(false);
    }
  };

  const changePassword = async () => {
    if (!user) return;
    if (passwordData.newPassword !== passwordData.confirmPassword) {
      setMessage('Passwords do not match');
      return;
    }
    if (passwordData.newPassword.length < 8) {
      setMessage('Password must be at least 8 characters');
      return;
    }
    if (!/^\d{6}$/.test(passwordData.authCode)) {
      setMessage('Enter the 6-digit password change code');
      return;
    }

    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch(buildApiUrl('/api/user/change-password'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': user.id
        },
        body: JSON.stringify({
          current_password: passwordData.currentPassword,
          new_password: passwordData.newPassword,
          auth_code: passwordData.authCode
        })
      });

      if (response.ok) {
        setMessage('Password changed successfully');
        setPasswordData({ currentPassword: '', newPassword: '', confirmPassword: '', authCode: '' });
        setPasswordCodeSentTo(null);
        setPasswordCodeExpiresAt(null);
        setTimeout(() => setMessage(null), 3000);
      } else {
        const error = await response.json();
        const friendly =
          error.error === 'invalid_current_password' ? 'Current password is incorrect' :
          error.error === 'password_code_required' ? 'Enter the 6-digit password change code' :
          error.error === 'invalid_password_code' ? 'Password change code is incorrect' :
          error.error === 'password_code_expired' ? 'Password change code expired. Send a new code and try again.' :
          error.error === 'account_security_migration_required' ? 'Account security setup needs the latest database migration before password codes can be verified.' :
          error.detail || error.error || 'Failed to change password';
        setMessage(friendly);
      }
    } catch (err: any) {
      setMessage(err.message || 'Error changing password');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <PageLayout title="Account Settings" description="Manage your profile and preferences">
        <div className="p-8 text-center">
          <p className="text-slate-600">Loading profile...</p>
        </div>
      </PageLayout>
    );
  }

  return (
    <PageLayout title="Account Settings" description="Manage your profile and preferences">
      <div className="max-w-4xl mx-auto space-y-6">
        {message && (
          <div className={`rounded-2xl border p-4 ${
            message.includes('success') || message.includes('successfully') || message.includes('Copied') || message.includes('generated')
              ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
              : 'border-red-200 bg-red-50 text-red-700'
          }`}>
            <p className="text-sm">{message}</p>
          </div>
        )}

        <div className="vs-surface p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-950">Two-factor authentication</h2>
              <p className="mt-1 text-sm text-slate-600">
                Add an authenticator app or email code requirement for stronger account security.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button onClick={startMfaEnroll} disabled={mfaLoading || !!mfaEnroll} className="vs-button-secondary">
                {mfaLoading ? 'Working...' : 'Enable app 2FA'}
              </button>
              <button onClick={startEmailMfaEnroll} disabled={mfaLoading || !!emailMfaPending} className="vs-button-secondary">
                {mfaLoading ? 'Working...' : 'Enable email 2FA'}
              </button>
            </div>
          </div>

          {mfaEnroll && (
            <div className="mt-5 rounded-2xl border border-violet-200 bg-violet-50 p-4">
              <div className="grid gap-4 lg:grid-cols-[260px,1fr,1fr] lg:items-start">
                <div className="rounded-xl border border-violet-200 bg-white p-4 text-center">
                  <div className="text-xs font-bold uppercase tracking-[0.16em] text-violet-700">Scan QR code</div>
                  {mfaQrDataUrl ? (
                    <img src={mfaQrDataUrl} alt="Authenticator app QR code" className="mx-auto mt-3 h-[220px] w-[220px] rounded-xl border border-slate-200 bg-white p-2" />
                  ) : (
                    <div className="mt-3 flex h-[220px] w-full items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 text-sm text-slate-500">
                      Generating QR...
                    </div>
                  )}
                  <p className="mt-3 text-xs leading-5 text-slate-600">Open your authenticator app and scan this QR code.</p>
                </div>
                <div className="rounded-xl border border-violet-200 bg-white p-4">
                  <div className="text-xs font-bold uppercase tracking-[0.16em] text-violet-700">Setup key</div>
                  {mfaEnroll.secret && (
                    <div className="mt-3 break-all rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 font-mono text-sm font-semibold text-slate-900">
                      {mfaEnroll.secret}
                    </div>
                  )}
                  <p className="mt-3 text-sm leading-6 text-slate-700">
                    Add this setup key in Google Authenticator, 1Password, Microsoft Authenticator, Authy, or another TOTP app.
                  </p>
                  {mfaEnroll.otpauthUri && (
                    <button
                      onClick={() => copyToClipboard(mfaEnroll.otpauthUri || '')}
                      className="vs-button-secondary mt-3"
                    >
                      Copy authenticator URI
                    </button>
                  )}
                </div>
                <div>
                  <label className="mb-2 block text-sm font-semibold text-slate-700">Authenticator code</label>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <input
                      className="vs-input tracking-[0.22em]"
                      inputMode="numeric"
                      value={mfaCode}
                      onChange={(event) => setMfaCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                      placeholder="000000"
                    />
                    <button onClick={verifyMfaEnroll} disabled={mfaLoading || mfaCode.length < 6} className="vs-button-primary">
                      Verify and enable
                    </button>
                  </div>
                  <p className="mt-2 text-xs leading-5 text-slate-600">
                    If the code is rejected, remove any old VictorySync entry from your authenticator app, scan this latest QR code again, and make sure your phone time is set automatically.
                  </p>
                </div>
              </div>
            </div>
          )}

          {emailMfaPending && (
            <div className="mt-5 rounded-2xl border border-sky-200 bg-sky-50 p-4">
              <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                <div>
                  <div className="text-xs font-bold uppercase tracking-[0.16em] text-sky-700">Email code</div>
                  <p className="mt-2 text-sm text-slate-700">
                    Enter the 6-digit code sent to <span className="font-semibold">{emailMfaPending.email || 'your email'}</span>.
                    {emailMfaPending.expiresAt ? ` It expires at ${new Date(emailMfaPending.expiresAt).toLocaleTimeString()}.` : ''}
                  </p>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <input
                    className="vs-input tracking-[0.22em]"
                    inputMode="numeric"
                    value={emailMfaCode}
                    onChange={(event) => setEmailMfaCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="000000"
                  />
                  <button onClick={verifyEmailMfaEnroll} disabled={mfaLoading || emailMfaCode.length < 6} className="vs-button-primary">
                    Verify email code
                  </button>
                  <button onClick={startEmailMfaEnroll} disabled={mfaLoading} className="vs-button-secondary">
                    Resend
                  </button>
                </div>
              </div>
            </div>
          )}

          <div className="mt-5 space-y-2">
            {mfaFactors.length === 0 ? (
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                No 2FA factors are enabled yet.
              </div>
            ) : (
              mfaFactors.map((factor) => (
                <div key={factor.id} className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3">
                  <div>
                    <div className="text-sm font-semibold text-slate-950">{factor.label || (factor.type === 'email' ? 'Email code' : 'Authenticator app')}</div>
                    <div className="text-xs text-slate-500">
                      Status: {factor.verified ? 'enabled' : 'pending'}{factor.email ? ` · ${factor.email}` : ''}{factor.enabled_at ? ` · Enabled ${new Date(factor.enabled_at).toLocaleDateString()}` : ''}
                    </div>
                  </div>
                  <button onClick={() => removeMfaFactor(factor.id)} disabled={mfaLoading} className="vs-button-secondary !px-3 !py-1.5 !text-xs">
                    Disable
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="vs-surface p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-950">Billing & Payments</h2>
              <p className="mt-1 text-sm text-slate-600">
                Open Stripe to update saved cards, manage payment methods, and view Stripe-hosted billing details for this account.
              </p>
            </div>
            <StripePortalButton
              orgId={selectedOrgId}
              label="Open Stripe billing"
              className="vs-button-primary whitespace-nowrap"
              onError={(nextMessage) => setMessage(nextMessage || null)}
            />
          </div>
          <div className="mt-4 rounded-2xl border border-violet-100 bg-violet-50 px-4 py-3 text-sm text-violet-800">
            Payment details are handled directly by Stripe. VictorySync never stores raw card numbers.
          </div>
        </div>

        <div className="vs-surface p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-950">Lead Alarm</h2>
              <p className="mt-1 text-sm text-slate-600">
                Choose one or more sounds for incoming lead alerts on this device.
              </p>
            </div>
            <button
              className="vs-button-destructive"
              onClick={() => void playLeadAlarmSequence(leadAlarmIds)}
              data-log="Preview lead alarm"
            >
              Preview Alarm
            </button>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-2">
            {LEAD_ALARM_OPTIONS.map((option) => (
              <label
                key={option.id}
                className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition ${
                  leadAlarmIds.includes(option.id)
                    ? 'border-rose-400/50 bg-rose-400/10'
                    : 'border-slate-200 bg-white hover:border-violet-200 hover:bg-violet-50/40'
                }`}
              >
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4 rounded border-slate-300 bg-white text-rose-500"
                  checked={leadAlarmIds.includes(option.id)}
                  onChange={() => toggleLeadAlarm(option.id)}
                />
                <span>
                  <span className="block text-sm font-semibold text-slate-900">{option.name}</span>
                  <span className="mt-1 block text-xs text-slate-600">{option.description}</span>
                </span>
              </label>
            ))}
          </div>
          <p className="mt-4 text-xs text-slate-500">
            Browsers may require one click or keypress before they allow alarm audio.
          </p>
        </div>

        {/* Profile Picture */}
        <div className="vs-surface p-6">
          <h2 className="mb-6 text-lg font-semibold text-slate-950">Profile Picture</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <div className="flex h-32 w-32 items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50">
                {profilePicPreview ? (
                  <img src={profilePicPreview} alt="Profile" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-slate-600">No photo</span>
                )}
              </div>
            </div>
            <div className="space-y-4">
              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-700">Upload Picture</label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleProfilePicChange}
                  className="block w-full text-sm text-slate-700 file:mr-4 file:rounded-xl file:border file:border-slate-200 file:bg-white file:px-4 file:py-2 file:text-sm file:font-semibold file:text-slate-700 file:shadow-sm hover:file:bg-slate-50"
                />
              </div>
              <button
                onClick={uploadProfilePic}
                disabled={!isUploadableImageData(profilePicPreview) || saving}
                className="vs-button-secondary w-full"
              >
                {saving ? 'Uploading...' : 'Upload Picture'}
              </button>
            </div>
          </div>
        </div>

        {/* Basic Info */}
        <div className="vs-surface p-6">
          <h2 className="mb-6 text-lg font-semibold text-slate-950">Basic Information</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-700">Full Name</label>
              <input
                type="text"
                value={formData.full_name}
                onChange={(e) => handleProfileChange('full_name', e.target.value)}
                className="vs-input w-full"
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-700">Email</label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => handleProfileChange('email', e.target.value)}
                className="vs-input w-full"
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-700">Phone Number</label>
              <input
                type="tel"
                value={formData.phone_number}
                onChange={(e) => handleProfileChange('phone_number', e.target.value)}
                className="vs-input w-full"
              />
            </div>
          </div>
          <div className="mt-6">
            <button
              onClick={saveProfile}
              disabled={saving}
              className="vs-button-primary"
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </div>

        {/* Organization Logo */}
        <div className="vs-surface p-6">
          <h2 className="mb-6 text-lg font-semibold text-slate-950">Organization Logo</h2>
          <p className="mb-4 text-sm text-slate-600">
            {selectedOrgId ? `Upload a logo for ${orgInfo?.name || 'the selected organization'}` : 'Select an organization first to upload an organization logo.'}
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <div className="flex h-32 w-32 items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50">
                {logoPreview ? (
                  <img src={logoPreview} alt="Logo" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-slate-600">No logo</span>
                )}
              </div>
            </div>
            <div className="space-y-4">
              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-700">Upload Logo</label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleLogoPicChange}
                  className="block w-full text-sm text-slate-700 file:mr-4 file:rounded-xl file:border file:border-slate-200 file:bg-white file:px-4 file:py-2 file:text-sm file:font-semibold file:text-slate-700 file:shadow-sm hover:file:bg-slate-50"
                />
              </div>
              <button
                onClick={uploadOrgLogo}
                disabled={!isUploadableImageData(logoPreview) || saving || !selectedOrgId}
                className="vs-button-secondary w-full"
              >
                {saving ? 'Uploading...' : 'Upload Logo'}
              </button>
            </div>
          </div>
        </div>

        {/* API Keys Management - DISABLED: requires database migration */}
        {false && (
        <div className="vs-surface p-6">
          <h2 className="mb-6 text-lg font-semibold text-slate-950">API Keys</h2>
          <p className="mb-6 text-sm text-slate-600">Generate and manage API keys for programmatic access to your account</p>

          {/* Generate New Key */}
          <div className="mb-8 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <label className="mb-3 block text-sm font-semibold text-slate-700">Generate New API Key</label>
            <div className="flex gap-3">
              <input
                type="text"
                placeholder="Label (e.g., 'Production', 'Testing')"
                value={newKeyLabel}
                onChange={(e) => setNewKeyLabel(e.target.value)}
                className="vs-input flex-1"
              />
              <button
                onClick={generateApiKey}
                disabled={generatingKey || !newKeyLabel}
                className="vs-button-primary whitespace-nowrap"
              >
                {generatingKey ? 'Generating...' : 'Generate'}
              </button>
            </div>
          </div>

          {/* Show New Key Plaintext */}
          {showNewKeyPlaintext && (
            <div className="mb-8 p-4 bg-amber-900/30 border border-amber-700 rounded-lg">
              <p className="text-sm font-semibold text-amber-300 mb-3">⚠️ Save Your API Key</p>
              <p className="text-sm text-amber-200 mb-3">This is the only time you'll see this key. Copy it and store it securely.</p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={showNewKeyPlaintext || ''}
                  readOnly
                  className="vs-input flex-1 font-mono"
                />
                <button
                  onClick={() => copyToClipboard(showNewKeyPlaintext || '')}
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-semibold transition"
                >
                  Copy
                </button>
              </div>
              <button
                onClick={() => setShowNewKeyPlaintext(null)}
                className="mt-3 text-sm text-amber-300 hover:text-amber-200"
              >
                I've saved it safely
              </button>
            </div>
          )}

          {/* API Keys List */}
          <div>
            <h3 className="mb-4 text-sm font-semibold text-slate-700">Active Keys</h3>
            {loadingApiKeys ? (
              <p className="text-sm text-slate-600">Loading keys...</p>
            ) : apiKeys.length === 0 ? (
              <p className="text-sm text-slate-600">No API keys yet. Generate one above to get started.</p>
            ) : (
              <div className="space-y-2">
                {apiKeys.map((key) => (
                  <div
                    key={key.id}
                    className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-4"
                  >
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-slate-900">{key.label}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="font-mono text-xs text-slate-600">
                          {key.key_prefix}...
                        </span>
                        <span className="text-xs text-slate-500">
                          Created: {new Date(key.created_at).toLocaleDateString()}
                        </span>
                      </div>
                      {key.last_used_at && (
                        <p className="text-xs text-slate-500 mt-1">
                          Last used: {new Date(key.last_used_at).toLocaleDateString()}
                        </p>
                      )}
                    </div>
                    <button
                      onClick={() => revokeApiKey(key.id)}
                      className="ml-4 px-3 py-1 text-sm bg-red-600 hover:bg-red-700 text-white rounded transition"
                    >
                      Revoke
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        )}

        {/* Security Questions */}
        <div className="vs-surface p-6">
          <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-950">Security Questions</h2>
              <p className="mt-1 text-sm text-slate-600">
                Set at least two questions for extra account verification. Answers are saved securely and are not displayed later.
              </p>
            </div>
            {savedSecurityQuestions.length > 0 && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700">
                {savedSecurityQuestions.length} saved
              </div>
            )}
          </div>
          {savedSecurityQuestions.length > 0 && (
            <div className="mt-4 space-y-2">
              {savedSecurityQuestions.map((item, index) => (
                <div key={item.id || index} className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                  {index + 1}. {item.question}
                </div>
              ))}
            </div>
          )}
          <div className="mt-5 grid gap-4">
            {securityQuestions.map((item, index) => (
              <div key={index} className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 md:grid-cols-[1fr,1fr]">
                <div>
                  <label className="mb-2 block text-sm font-semibold text-slate-700">Question {index + 1}</label>
                  <select
                    value={item.question}
                    onChange={(event) => handleSecurityQuestionChange(index, 'question', event.target.value)}
                    className="vs-input w-full"
                  >
                    {SECURITY_QUESTION_OPTIONS.map((question) => (
                      <option key={question} value={question}>{question}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-2 block text-sm font-semibold text-slate-700">Answer</label>
                  <input
                    type="password"
                    value={item.answer}
                    onChange={(event) => handleSecurityQuestionChange(index, 'answer', event.target.value)}
                    className="vs-input w-full"
                    autoComplete="off"
                    placeholder={savedSecurityQuestions[index] ? 'Enter a new answer to replace' : 'Answer'}
                  />
                </div>
              </div>
            ))}
          </div>
          <div className="mt-5">
            <button onClick={saveSecurityQuestions} disabled={saving} className="vs-button-primary">
              {saving ? 'Saving...' : 'Save Security Questions'}
            </button>
          </div>
        </div>

        {/* Change Password */}
        <div className="vs-surface p-6">
          <h2 className="mb-6 text-lg font-semibold text-slate-950">Change Password</h2>
          <div className="mb-5 rounded-2xl border border-violet-100 bg-violet-50 px-4 py-3 text-sm text-violet-800">
            Password changes require your current password and a fresh 6-digit code sent to your account email.
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-700">Current Password</label>
              <input
                type="password"
                autoComplete="current-password"
                value={passwordData.currentPassword}
                onChange={(e) => handlePasswordChange('currentPassword', e.target.value)}
                className="vs-input w-full"
              />
            </div>
            <div></div>
            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-700">New Password</label>
              <input
                type="password"
                autoComplete="new-password"
                value={passwordData.newPassword}
                onChange={(e) => handlePasswordChange('newPassword', e.target.value)}
                className="vs-input w-full"
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-700">Confirm Password</label>
              <input
                type="password"
                autoComplete="new-password"
                value={passwordData.confirmPassword}
                onChange={(e) => handlePasswordChange('confirmPassword', e.target.value)}
                className="vs-input w-full"
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-700">Verification Code</label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={passwordData.authCode}
                  onChange={(e) => handlePasswordChange('authCode', e.target.value.replace(/\D/g, '').slice(0, 6))}
                  className="vs-input w-full tracking-[0.22em]"
                  placeholder="000000"
                />
                <button
                  type="button"
                  onClick={sendPasswordCode}
                  disabled={saving}
                  className="vs-button-secondary whitespace-nowrap"
                >
                  Send Code
                </button>
              </div>
              {passwordCodeSentTo && (
                <p className="mt-2 text-xs leading-5 text-slate-600">
                  Code sent to {passwordCodeSentTo}{passwordCodeExpiresAt ? ` and expires at ${new Date(passwordCodeExpiresAt).toLocaleTimeString()}` : ''}.
                </p>
              )}
            </div>
          </div>
          <div className="mt-6">
            <button
              onClick={changePassword}
              disabled={saving || !passwordData.currentPassword || !passwordData.newPassword || passwordData.authCode.length < 6}
              className="vs-button-outline"
            >
              {saving ? 'Updating...' : 'Change Password'}
            </button>
          </div>
        </div>
      </div>
    </PageLayout>
  );
}
