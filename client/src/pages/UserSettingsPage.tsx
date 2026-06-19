import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { PageLayout } from '../components/PageLayout';
import StripePortalButton from '../components/StripePortalButton';
import { buildApiUrl } from '../config';
import { useTheme } from '../contexts/ThemeContext';
import {
  getSelectedLeadAlarmIds,
  LEAD_ALARM_OPTIONS,
  LeadAlarmId,
  playLeadAlarmSequence,
  setSelectedLeadAlarmIds,
} from '../lib/leadAlarm';
export default function UserSettingsPage() {
  const { user, selectedOrgId, refreshProfile } = useAuth();
  const { theme, setTheme } = useTheme();
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
  const [mfaCode, setMfaCode] = useState('');
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
  });

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
      if (!response.ok) throw new Error(payload.error || 'Unable to start 2FA setup');
      const factor = payload.factor || {};
      setMfaEnroll({
        factorId: factor.id,
        otpauthUri: factor.otpauth_uri,
        secret: factor.secret,
      });
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
      if (!response.ok) throw new Error(payload.error === 'invalid_mfa_code' ? 'Invalid 2FA code' : payload.error || 'Unable to verify 2FA code');
      setMfaEnroll(null);
      setMfaCode('');
      await loadMfaFactors();
      setMessage('2FA enabled successfully');
    } catch (err: any) {
      setMessage(err?.message || 'Invalid 2FA code');
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
    if (!user || !profilePicPreview) return;
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
        setMessage('Failed to upload profile picture');
      }
    } catch (err: any) {
      setMessage(err.message || 'Error uploading picture');
    } finally {
      setSaving(false);
    }
  };

  const uploadOrgLogo = async () => {
    if (!user || !logoPreview) return;
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
        setMessage('Failed to upload logo');
      }
    } catch (err: any) {
      setMessage(err.message || 'Error uploading logo');
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
          new_password: passwordData.newPassword
        })
      });

      if (response.ok) {
        setMessage('Password changed successfully');
        setPasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' });
        setTimeout(() => setMessage(null), 3000);
      } else {
        const error = await response.json();
        setMessage(error.error || 'Failed to change password');
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
          <h2 className="mb-6 text-lg font-semibold text-slate-950">Appearance</h2>
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="text-sm font-semibold text-slate-900">Theme</div>
              <div className="mt-1 text-sm text-slate-600">Choose the dashboard appearance for this browser and account.</div>
            </div>
            <div className="inline-flex rounded-xl bg-slate-100 p-1 ring-1 ring-slate-200">
              <button
                onClick={() => void setTheme('light')}
                className={`rounded-lg px-4 py-2 text-sm font-semibold shadow-sm transition ${theme === 'light' ? 'bg-violet-600 text-white hover:bg-violet-700' : 'text-slate-700 hover:bg-white'}`}
              >
                Light
              </button>
              <button
                onClick={() => void setTheme('dark')}
                className={`rounded-lg px-4 py-2 text-sm font-semibold shadow-sm transition ${theme === 'dark' ? 'bg-violet-600 text-white hover:bg-violet-700' : 'text-slate-700 hover:bg-white'}`}
              >
                Dark
              </button>
            </div>
          </div>
        </div>

        <div className="vs-surface p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-950">Two-factor authentication</h2>
              <p className="mt-1 text-sm text-slate-600">
                Add an authenticator app code requirement for stronger account security.
              </p>
            </div>
            <button onClick={startMfaEnroll} disabled={mfaLoading || !!mfaEnroll} className="vs-button-secondary">
              {mfaLoading ? 'Working...' : 'Enable 2FA'}
            </button>
          </div>

          {mfaEnroll && (
            <div className="mt-5 rounded-2xl border border-violet-200 bg-violet-50 p-4">
              <div className="grid gap-4 lg:grid-cols-[1fr,1fr] lg:items-start">
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
                    <div className="text-sm font-semibold text-slate-950">Authenticator app</div>
                    <div className="text-xs text-slate-500">
                      Status: {factor.verified ? 'enabled' : 'pending'}{factor.enabled_at ? ` · Enabled ${new Date(factor.enabled_at).toLocaleDateString()}` : ''}
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
                disabled={!profilePicPreview || saving}
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
                disabled={!logoPreview || saving || !selectedOrgId}
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

        {/* Change Password */}
        <div className="vs-surface p-6">
          <h2 className="mb-6 text-lg font-semibold text-slate-950">Change Password</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-700">Current Password</label>
              <input
                type="password"
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
                value={passwordData.newPassword}
                onChange={(e) => handlePasswordChange('newPassword', e.target.value)}
                className="vs-input w-full"
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-700">Confirm Password</label>
              <input
                type="password"
                value={passwordData.confirmPassword}
                onChange={(e) => handlePasswordChange('confirmPassword', e.target.value)}
                className="vs-input w-full"
              />
            </div>
          </div>
          <div className="mt-6">
            <button
              onClick={changePassword}
              disabled={saving || !passwordData.currentPassword || !passwordData.newPassword}
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
