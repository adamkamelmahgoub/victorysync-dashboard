import React, { FC, useState, useEffect } from 'react';
import AdminTopNav from '../../components/AdminTopNav';
import { PageLayout } from '../../components/PageLayout';
import { useAuth } from '../../contexts/AuthContext';

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
      const response = await fetch('http://localhost:4000/api/admin/orgs', {
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
      const response = await fetch('http://localhost:4000/api/admin/number-requests', {
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
      const response = await fetch(`http://localhost:4000/api/admin/number-requests/${selectedRequest.id}`, {
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

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Requests List */}
          <div className="lg:col-span-1 bg-slate-900/80 ring-1 ring-slate-800 rounded-lg overflow-hidden flex flex-col">
            <div className="p-4 border-b border-slate-700/50 space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-2">Filter by Status:</label>
                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  className="w-full text-xs bg-slate-800 border border-slate-700 rounded px-2 py-1 text-slate-100 focus:outline-none focus:ring-1 focus:ring-emerald-400"
                >
                  <option value="all">All</option>
                  <option value="pending">Pending</option>
                  <option value="approved">Approved</option>
                  <option value="rejected">Rejected</option>
                  <option value="completed">Completed</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-2">Filter by Organization:</label>
                <select
                  value={filterOrg}
                  onChange={(e) => setFilterOrg(e.target.value)}
                  className="w-full text-xs bg-slate-800 border border-slate-700 rounded px-2 py-1 text-slate-100 focus:outline-none focus:ring-1 focus:ring-emerald-400"
                >
                  <option value="all">All</option>
                  {orgList.map(org => (
                    <option key={org} value={org}>{org}</option>
                  ))}
                </select>
              </div>
              <div className="text-xs text-slate-400">
                {filteredRequests.length} request{filteredRequests.length !== 1 ? 's' : ''}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto">
              {loading ? (
                <div className="p-4 text-slate-400 text-xs">Loading requests...</div>
              ) : filteredRequests.length === 0 ? (
                <div className="p-4 text-slate-400 text-xs">No requests found</div>
              ) : (
                filteredRequests.map(request => (
                  <button
                    key={request.id}
                    onClick={() => setSelectedRequest(request)}
                    className={`w-full text-left p-4 border-b border-slate-700/50 hover:bg-slate-800/50 transition ${
                      selectedRequest?.id === request.id ? 'bg-slate-800/50' : ''
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-xs text-white capitalize">{request.request_type}</div>
                        <div className="text-xs text-slate-400 mt-1 truncate">{request.org_id}</div>
                      </div>
                      <div className={`px-2 py-1 rounded text-xs font-semibold whitespace-nowrap ${
                        request.status === 'pending' ? 'bg-amber-900/50 text-amber-200 ring-1 ring-amber-800/50' :
                        request.status === 'approved' ? 'bg-emerald-900/50 text-emerald-200 ring-1 ring-emerald-800/50' :
                        request.status === 'rejected' ? 'bg-red-900/50 text-red-200 ring-1 ring-red-800/50' :
                        'bg-slate-700/50 text-slate-300'
                      }`}>
                        {request.status}
                      </div>
                    </div>
                    <div className="text-xs text-slate-500 mt-2">
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
              <div className="bg-slate-900/80 ring-1 ring-slate-800 rounded-lg p-6 space-y-6">
                <div>
                  <h2 className="text-lg font-semibold text-white capitalize">{selectedRequest.request_type} Request</h2>
                  <p className="text-xs text-slate-400 mt-1">Organization: {selectedRequest.org_id}</p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs text-slate-400 font-semibold">Status</label>
                    <select
                      value={selectedRequest.status}
                      onChange={(e) => {
                        handleStatusChange(e.target.value);
                      }}
                      className="mt-1 w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-slate-100 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-400"
                    >
                      <option value="pending">Pending</option>
                      <option value="approved">Approved</option>
                      <option value="rejected">Rejected</option>
                      <option value="completed">Completed</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 font-semibold">Type</label>
                    <div className="mt-1 px-3 py-2 rounded text-xs bg-slate-800 text-slate-100 capitalize">
                      {selectedRequest.request_type}
                    </div>
                  </div>
                </div>

                <div>
                  <label className="text-xs text-slate-400 font-semibold block mb-2">Request Details</label>
                  <div className="bg-slate-800/30 rounded-lg p-3 text-xs text-slate-100 whitespace-pre-wrap border border-slate-700/50 max-h-32 overflow-y-auto">
                    {selectedRequest.details}
                  </div>
                </div>

                <div className="text-xs text-slate-400 space-y-1 border-t border-slate-700/50 pt-4">
                  <div>Created: {new Date(selectedRequest.created_at).toLocaleString()}</div>
                  <div>Updated: {new Date(selectedRequest.updated_at).toLocaleString()}</div>
                </div>

                {selectedRequest.status === 'pending' && (
                  <div className="border-t border-slate-700/50 pt-4 flex gap-3">
                    <button
                      onClick={() => handleStatusChange('approved')}
                      className="flex-1 bg-gradient-to-r from-emerald-600 to-cyan-600 hover:from-emerald-500 hover:to-cyan-500 text-white font-semibold py-2 rounded-lg text-xs transition"
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => handleStatusChange('rejected')}
                      className="flex-1 bg-red-900/50 hover:bg-red-900/70 text-red-200 font-semibold py-2 rounded-lg text-xs transition ring-1 ring-red-800/50"
                    >
                      Reject
                    </button>
                  </div>
                )}

                {selectedRequest.status === 'approved' && (
                  <div className="border-t border-slate-700/50 pt-4">
                    <button
                      onClick={() => handleStatusChange('completed')}
                      className="w-full bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 text-white font-semibold py-2 rounded-lg text-xs transition"
                    >
                      Mark as Completed
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="bg-slate-900/80 ring-1 ring-slate-800 rounded-lg p-6 text-center text-slate-400">
                <p className="text-xs">Select a request to view details</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </PageLayout>
  );
};

export default AdminNumberChangeRequestsPage;
