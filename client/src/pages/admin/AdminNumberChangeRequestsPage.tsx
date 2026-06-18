import React, { FC, useState, useEffect } from 'react';
import AdminTopNav from '../../components/AdminTopNav';
import { PageLayout } from '../../components/PageLayout';
import { useAuth } from '../../contexts/AuthContext';
import { buildApiUrl } from '../../config';
import { EmptyStatePanel, StatusBadge } from '../../components/DashboardPrimitives';

interface ChangeRequest {
  id: string;
  org_id: string;
  request_type: string;
  details: string;
  status: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

const AdminNumberChangeRequestsPage: FC = () => {
  const { user } = useAuth();
  const userId = user?.id;
  
  const [requests, setRequests] = useState<ChangeRequest[]>([]);
  const [selectedRequest, setSelectedRequest] = useState<ChangeRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterOrg, setFilterOrg] = useState('all');
  const [orgList, setOrgList] = useState<string[]>([]);

  useEffect(() => {
    fetchRequests();
    fetchOrgs();
  }, []);

  const fetchOrgs = async () => {
    try {
      const response = await fetch(buildApiUrl('/api/admin/orgs'), {
        headers: {
          'x-user-id': userId || '',
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        const orgs = data.orgs?.map((o: any) => o.id) || [];
        setOrgList(orgs);
      }
    } catch (error) {
      console.error('Error fetching orgs:', error);
    }
  };

  const fetchRequests = async () => {
    try {
      setLoading(true);
      const response = await fetch(buildApiUrl('/api/admin/number-requests'), {
        headers: {
          'x-user-id': userId || '',
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        console.error('Failed to fetch requests');
        setRequests([]);
        return;
      }

      const data = await response.json();
      setRequests(data.requests || []);
    } catch (error) {
      console.error('Error fetching requests:', error);
      setRequests([]);
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChange = async (newStatus: string) => {
    if (!selectedRequest) return;

    try {
      const response = await fetch(buildApiUrl(`/api/admin/number-requests/${selectedRequest.id}`), {
        method: 'PATCH',
        headers: {
          'x-user-id': userId || '',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ status: newStatus })
      });

      if (!response.ok) {
        alert('Failed to update request status');
        return;
      }

      setSelectedRequest({ ...selectedRequest, status: newStatus });
      fetchRequests();
    } catch (error) {
      console.error('Error updating status:', error);
      alert('Failed to update status');
    }
  };

  const filteredRequests = requests.filter(r => {
    if (filterStatus !== 'all' && r.status !== filterStatus) return false;
    if (filterOrg !== 'all' && r.org_id !== filterOrg) return false;
    return true;
  });

  return (
    <PageLayout title="Number Change Requests" description="Track and manage client phone number change requests">
      <div className="space-y-6">

        <AdminTopNav />

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Requests List */}
          <div className="vs-surface flex flex-col overflow-hidden lg:col-span-1">
            <div className="space-y-3 border-b border-slate-200 bg-slate-50 p-4">
              <div>
                <label className="mb-2 block text-xs font-semibold uppercase text-slate-600">Filter by Status</label>
                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  className="vs-input w-full"
                >
                  <option value="all">All</option>
                  <option value="pending">Pending</option>
                  <option value="approved">Approved</option>
                  <option value="rejected">Rejected</option>
                  <option value="completed">Completed</option>
                </select>
              </div>
              <div>
                <label className="mb-2 block text-xs font-semibold uppercase text-slate-600">Filter by Organization</label>
                <select
                  value={filterOrg}
                  onChange={(e) => setFilterOrg(e.target.value)}
                  className="vs-input w-full"
                >
                  <option value="all">All</option>
                  {orgList.map(org => (
                    <option key={org} value={org}>{org}</option>
                  ))}
                </select>
              </div>
              <div className="text-sm text-slate-600">
                {filteredRequests.length} request{filteredRequests.length !== 1 ? 's' : ''}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto">
              {loading ? (
                <div className="p-4 text-sm text-slate-600">Loading requests...</div>
              ) : filteredRequests.length === 0 ? (
                <div className="p-4"><EmptyStatePanel title="No requests found" description="No number change requests match the current filters." /></div>
              ) : (
                filteredRequests.map(request => (
                  <button
                    key={request.id}
                    onClick={() => setSelectedRequest(request)}
                    className={`w-full border-b border-slate-100 p-4 text-left transition hover:bg-violet-50/40 ${
                      selectedRequest?.id === request.id ? 'bg-violet-50' : 'bg-white'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold capitalize text-slate-950">{request.request_type}</div>
                        <div className="mt-1 truncate text-xs text-slate-600">{request.org_id}</div>
                      </div>
                      <StatusBadge tone={request.status === 'pending' ? 'warning' : request.status === 'approved' || request.status === 'completed' ? 'success' : request.status === 'rejected' ? 'danger' : 'neutral'}>{request.status}</StatusBadge>
                    </div>
                    <div className="mt-2 text-xs text-slate-600">
                      {new Date(request.created_at).toLocaleDateString()}
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>

          {/* Request Details */}
          <div className="lg:col-span-2">
            {selectedRequest ? (
              <div className="vs-surface space-y-6 p-6">
                <div>
                  <h2 className="text-lg font-semibold capitalize text-slate-950">{selectedRequest.request_type} Request</h2>
                  <p className="mt-1 text-sm text-slate-600">Organization: {selectedRequest.org_id}</p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-semibold uppercase text-slate-600">Status</label>
                    <select
                      value={selectedRequest.status}
                      onChange={(e) => {
                        handleStatusChange(e.target.value);
                      }}
                      className="vs-input mt-1 w-full"
                    >
                      <option value="pending">Pending</option>
                      <option value="approved">Approved</option>
                      <option value="rejected">Rejected</option>
                      <option value="completed">Completed</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-semibold uppercase text-slate-600">Type</label>
                    <div className="mt-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm capitalize text-slate-700">
                      {selectedRequest.request_type}
                    </div>
                  </div>
                </div>

                <div>
                  <label className="mb-2 block text-xs font-semibold uppercase text-slate-600">Request Details</label>
                  <div className="max-h-32 overflow-y-auto whitespace-pre-wrap rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                    {selectedRequest.details}
                  </div>
                </div>

                <div className="space-y-1 border-t border-slate-200 pt-4 text-sm text-slate-600">
                  <div>Created: {new Date(selectedRequest.created_at).toLocaleString()}</div>
                  <div>Updated: {new Date(selectedRequest.updated_at).toLocaleString()}</div>
                </div>

                {selectedRequest.status === 'pending' && (
                  <div className="flex gap-3 border-t border-slate-200 pt-4">
                    <button
                      onClick={() => handleStatusChange('approved')}
                      className="vs-button-primary flex-1"
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => handleStatusChange('rejected')}
                      className="vs-button-destructive flex-1"
                    >
                      Reject
                    </button>
                  </div>
                )}

                {selectedRequest.status === 'approved' && (
                  <div className="border-t border-slate-200 pt-4">
                    <button
                      onClick={() => handleStatusChange('completed')}
                      className="vs-button-primary w-full"
                    >
                      Mark as Completed
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="vs-surface p-6">
                <EmptyStatePanel title="Select a request" description="Choose a request from the queue to view details." />
              </div>
            )}
          </div>
        </div>
      </div>
    </PageLayout>
  );
};

export default AdminNumberChangeRequestsPage;
