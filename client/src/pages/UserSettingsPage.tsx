import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { PageLayout } from '../components/PageLayout';import { buildApiUrl } from '../config';
export default function UserSettingsPage() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [profilePicPreview, setProfilePicPreview] = useState<string | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [apiKeys, setApiKeys] = useState<any[]>([]);
  const [loadingApiKeys, setLoadingApiKeys] = useState(false);
  const [generatingKey, setGeneratingKey] = useState(false);
  const [newKeyLabel, setNewKeyLabel] = useState('');
  const [showNewKeyPlaintext, setShowNewKeyPlaintext] = useState<string | null>(null);

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
      // loadApiKeys(); // TODO: user_api_keys table needs migration in production
    }
  }, [user]);

  const fetchProfile = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const response = await fetch(buildApiUrl('/api/user/profile'), {
        headers: { 'x-user-id': user.id }
      });
      if (response.ok) {
        const data = await response.json();
        const userData = data.user || data.profile || data;
        setProfile(userData);
        setFormData({
          full_name: userData.full_name || '',
          email: userData.email || '',
          phone_number: userData.phone_number || '',
        });
        if (userData.profile_pic_url) {
          setProfilePicPreview(userData.profile_pic_url);
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
        body: JSON.stringify({ image_data: logoPreview })
      });

      if (response.ok) {
        setMessage('Organization logo updated');
        setTimeout(() => setMessage(null), 3000);
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
          <p className="text-slate-400">Loading profile...</p>
        </div>
      </PageLayout>
    );
  }

  return (
    <PageLayout title="Account Settings" description="Manage your profile and preferences">
      <div className="max-w-4xl mx-auto space-y-6">
        {message && (
          <div className={`p-4 rounded-lg border ${
            message.includes('success') || message.includes('successfully') || message.includes('Copied') || message.includes('generated')
              ? 'bg-emerald-900/20 border-emerald-700 text-emerald-300'
              : 'bg-red-900/20 border-red-700 text-red-300'
          }`}>
            <p className="text-sm">{message}</p>
          </div>
        )}

        {/* Profile Picture */}
        <div className="bg-slate-900/80 rounded-xl p-6 ring-1 ring-slate-800">
          <h2 className="text-lg font-semibold text-white mb-6">Profile Picture</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <div className="w-32 h-32 rounded-lg bg-slate-800 border-2 border-dashed border-slate-700 flex items-center justify-center overflow-hidden">
                {profilePicPreview ? (
                  <img src={profilePicPreview} alt="Profile" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-slate-500">No photo</span>
                )}
              </div>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-white mb-2">Upload Picture</label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleProfilePicChange}
                  className="block w-full text-sm text-slate-400 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-slate-700 file:text-white hover:file:bg-slate-600"
                />
              </div>
              <button
                onClick={uploadProfilePic}
                disabled={!profilePicPreview || saving}
                className="w-full px-4 py-2 bg-cyan-600 hover:bg-cyan-700 disabled:bg-slate-600 text-white rounded-lg font-semibold transition"
              >
                {saving ? 'Uploading...' : 'Upload Picture'}
              </button>
            </div>
          </div>
        </div>

        {/* Basic Info */}
        <div className="bg-slate-900/80 rounded-xl p-6 ring-1 ring-slate-800">
          <h2 className="text-lg font-semibold text-white mb-6">Basic Information</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-semibold text-slate-300 mb-2">Full Name</label>
              <input
                type="text"
                value={formData.full_name}
                onChange={(e) => handleProfileChange('full_name', e.target.value)}
                className="w-full px-4 py-2 bg-slate-800/50 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/20"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-300 mb-2">Email</label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => handleProfileChange('email', e.target.value)}
                className="w-full px-4 py-2 bg-slate-800/50 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/20"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-300 mb-2">Phone Number</label>
              <input
                type="tel"
                value={formData.phone_number}
                onChange={(e) => handleProfileChange('phone_number', e.target.value)}
                className="w-full px-4 py-2 bg-slate-800/50 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/20"
              />
            </div>
          </div>
          <div className="mt-6">
            <button
              onClick={saveProfile}
              disabled={saving}
              className="px-6 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-600 text-white rounded-lg font-semibold transition"
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </div>

        {/* Organization Logo */}
        <div className="bg-slate-900/80 rounded-xl p-6 ring-1 ring-slate-800">
          <h2 className="text-lg font-semibold text-white mb-6">Organization Logo</h2>
          <p className="text-sm text-slate-400 mb-4">Upload a logo to display on your dashboard and reports</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <div className="w-32 h-32 rounded-lg bg-slate-800 border-2 border-dashed border-slate-700 flex items-center justify-center overflow-hidden">
                {logoPreview ? (
                  <img src={logoPreview} alt="Logo" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-slate-500">No logo</span>
                )}
              </div>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-white mb-2">Upload Logo</label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleLogoPicChange}
                  className="block w-full text-sm text-slate-400 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-slate-700 file:text-white hover:file:bg-slate-600"
                />
              </div>
              <button
                onClick={uploadOrgLogo}
                disabled={!logoPreview || saving}
                className="w-full px-4 py-2 bg-cyan-600 hover:bg-cyan-700 disabled:bg-slate-600 text-white rounded-lg font-semibold transition"
              >
                {saving ? 'Uploading...' : 'Upload Logo'}
              </button>
            </div>
          </div>
        </div>

        {/* API Keys Management - DISABLED: requires database migration */}
        {false && (
        <div className="bg-slate-900/80 rounded-xl p-6 ring-1 ring-slate-800">
          <h2 className="text-lg font-semibold text-white mb-6">API Keys</h2>
          <p className="text-sm text-slate-400 mb-6">Generate and manage API keys for programmatic access to your account</p>

          {/* Generate New Key */}
          <div className="mb-8 p-4 bg-slate-800/50 rounded-lg border border-slate-700">
            <label className="block text-sm font-semibold text-slate-300 mb-3">Generate New API Key</label>
            <div className="flex gap-3">
              <input
                type="text"
                placeholder="Label (e.g., 'Production', 'Testing')"
                value={newKeyLabel}
                onChange={(e) => setNewKeyLabel(e.target.value)}
                className="flex-1 px-4 py-2 bg-slate-800/50 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/20"
              />
              <button
                onClick={generateApiKey}
                disabled={generatingKey || !newKeyLabel}
                className="px-6 py-2 bg-cyan-600 hover:bg-cyan-700 disabled:bg-slate-600 text-white rounded-lg font-semibold transition whitespace-nowrap"
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
                  value={showNewKeyPlaintext}
                  readOnly
                  className="flex-1 px-4 py-2 bg-slate-900 border border-amber-700 rounded-lg text-amber-300 font-mono text-sm"
                />
                <button
                  onClick={() => copyToClipboard(showNewKeyPlaintext)}
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
            <h3 className="text-sm font-semibold text-slate-300 mb-4">Active Keys</h3>
            {loadingApiKeys ? (
              <p className="text-slate-400 text-sm">Loading keys...</p>
            ) : apiKeys.length === 0 ? (
              <p className="text-slate-400 text-sm">No API keys yet. Generate one above to get started.</p>
            ) : (
              <div className="space-y-2">
                {apiKeys.map((key) => (
                  <div
                    key={key.id}
                    className="flex items-center justify-between p-4 bg-slate-800/50 rounded-lg border border-slate-700"
                  >
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-white">{key.label}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="font-mono text-xs text-slate-400">
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
        <div className="bg-slate-900/80 rounded-xl p-6 ring-1 ring-slate-800">
          <h2 className="text-lg font-semibold text-white mb-6">Change Password</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-semibold text-slate-300 mb-2">Current Password</label>
              <input
                type="password"
                value={passwordData.currentPassword}
                onChange={(e) => handlePasswordChange('currentPassword', e.target.value)}
                className="w-full px-4 py-2 bg-slate-800/50 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/20"
              />
            </div>
            <div></div>
            <div>
              <label className="block text-sm font-semibold text-slate-300 mb-2">New Password</label>
              <input
                type="password"
                value={passwordData.newPassword}
                onChange={(e) => handlePasswordChange('newPassword', e.target.value)}
                className="w-full px-4 py-2 bg-slate-800/50 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/20"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-300 mb-2">Confirm Password</label>
              <input
                type="password"
                value={passwordData.confirmPassword}
                onChange={(e) => handlePasswordChange('confirmPassword', e.target.value)}
                className="w-full px-4 py-2 bg-slate-800/50 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/20"
              />
            </div>
          </div>
          <div className="mt-6">
            <button
              onClick={changePassword}
              disabled={saving || !passwordData.currentPassword || !passwordData.newPassword}
              className="px-6 py-2 bg-orange-600 hover:bg-orange-700 disabled:bg-slate-600 text-white rounded-lg font-semibold transition"
            >
              {saving ? 'Updating...' : 'Change Password'}
            </button>
          </div>
        </div>
      </div>
    </PageLayout>
  );
}
