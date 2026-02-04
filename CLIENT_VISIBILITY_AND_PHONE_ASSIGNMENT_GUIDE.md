# VictorySync Dashboard - Client Visibility & Phone Assignment Features

## Overview

This document describes the fixes and new features added to resolve client data visibility issues, enable recording playback/download, implement phone-based filtering, and add organization-level phone assignments.

## Issues Fixed

### 1. **Clients Cannot See Recordings** ✅
**Problem**: Non-admin users (org members) could not see recordings even if they were part of the organization.

**Root Cause**: The `/api/recordings` endpoint was returning an empty array for org members without explicit phone assignments.

**Solution**: 
- Modified access control logic to check if user is an org member
- Org members without assigned phones now see ALL org recordings
- Non-org members still cannot access data

**Code Location**: [server/src/index.ts](server/src/index.ts) - GET `/api/recordings` endpoint

### 2. **Recording Download/Playback Failed** ✅
**Problem**: Users received "failed" message when trying to play or download recordings.

**Root Cause**: The `/api/recordings/:id/download` endpoint was querying the `calls` table which has null `recording_url` values. Actual recordings are in `mightycall_recordings`.

**Solution**:
- Reordered lookup to check `mightycall_recordings` table FIRST
- Falls back to `calls` table if not found in primary source
- Properly handles both table schemas

**Code Location**: [server/src/index.ts](server/src/index.ts) - GET `/api/recordings/:id/download` endpoint

### 3. **Phone Numbers Not Displayed** ✅
**Problem**: Recordings showed "null" for caller and recipient numbers.

**Solution** (Already Fixed Earlier):
- Extract phone numbers from recording metadata
- Fallback to calls table join when available
- Display both `from_number` and `to_number` for all recordings

### 4. **Filters Don't Work** ✅
**Problem**: Clients and admins had limited filtering capabilities on recordings.

**Solution**:
- Added new `/api/recordings/filter` endpoint with support for:
  - **Date range filtering** (start_date, end_date)
  - **Phone number filtering** (specific phone number)
  - **Call direction filtering** (inbound/outbound/all)
  - **Minimum duration filtering** (calls longer than X seconds)
  - **Limit and offset** for pagination

- Updated frontend RecordingsPage to:
  - Provide enhanced filter UI
  - Show direction (inbound/outbound) for each recording
  - Apply filters on demand
  - Display number of results found

**Code Locations**: 
- Backend: [server/src/index.ts](server/src/index.ts) - GET `/api/recordings/filter`
- Frontend: [client/src/pages/RecordingsPage.tsx](client/src/pages/RecordingsPage.tsx)

### 5. **No Phone Assignment per Organization** ✅
**Problem**: No way to restrict an org to specific phone numbers for call monitoring.

**Solution**:
- Org phone assignment already exists via `/api/admin/orgs/:orgId/phone-numbers` (POST)
- Created new **PhoneAssignmentsPage** UI for easy management
- Admins can select which phone numbers belong to each organization
- Assigned phones filter recordings shown to org members

**Code Locations**:
- Backend: POST `/api/admin/orgs/:orgId/phone-numbers` (existing, enhanced)
- Frontend: [client/src/pages/PhoneAssignmentsPage.tsx](client/src/pages/PhoneAssignmentsPage.tsx) (NEW)

---

## API Endpoints

### GET /api/recordings
Returns recordings for an organization with full metadata.

**Parameters**:
- `org_id` (required): Organization ID
- `limit` (optional): Max results (default: 10000)

**Access Control**:
- Admins: See all org recordings
- Org members WITHOUT assigned phones: See all org recordings
- Org members WITH assigned phones: See only recordings for their assigned phones
- Non-org members: Access denied

**Response**:
```json
{
  "recordings": [
    {
      "id": "rec_123",
      "call_id": "call_456",
      "from_number": "+17323286846",
      "to_number": "+15162621322",
      "duration": 1234,
      "duration_seconds": 1234,
      "recording_date": "2024-02-04T10:30:00Z",
      "recording_url": "https://...",
      "org_name": "Test Org",
      "direction": "inbound",
      "metadata": {...}
    }
  ]
}
```

### GET /api/recordings/filter
Advanced filtering endpoint for recordings.

**Parameters**:
- `org_id` (required): Organization ID
- `start_date` (optional): ISO date string
- `end_date` (optional): ISO date string
- `phone_number` (optional): Phone number to filter (partial match)
- `direction` (optional): "inbound", "outbound", or "all"
- `min_duration` (optional): Minimum duration in seconds
- `limit` (optional): Max results (default: 100)

**Example**:
```
GET /api/recordings/filter?org_id=ORG_123&start_date=2024-02-01&end_date=2024-02-05&direction=inbound&min_duration=60&limit=50
```

### GET /api/recordings/:id/download
Stream/download a single recording file.

**Parameters**:
- `id` (required): Recording ID

**Access Control**:
- Authenticated users only
- Respects same phone assignment filtering as GET /api/recordings

**Response**: Binary audio file (mp3, wav, etc.)

### POST /api/admin/orgs/:orgId/phone-numbers
Assign phone numbers to an organization.

**Body**:
```json
{
  "phoneNumberIds": ["phone_id_1", "phone_id_2"]
}
```

**Response**:
```json
{
  "success": true,
  "assigned": 2
}
```

---

## Frontend Components

### RecordingsPage
**Location**: [client/src/pages/RecordingsPage.tsx](client/src/pages/RecordingsPage.tsx)

**Features**:
- Display list of recordings with caller/recipient numbers
- Filter by date range (start/end dates)
- Apply filters button to refresh data
- Sync button for manual sync from MightyCall
- Play audio inline with HTML5 audio player
- Download recordings as mp3/wav files
- Show recording metadata (direction, duration, date)
- Status messages for user feedback

**How to Use**:
1. Select an organization from the sidebar
2. (Optional) Set start and end dates
3. Click "Filter" button
4. View results in the grid below
5. Click "Play" to listen inline or "Download" to save file

### PhoneAssignmentsPage (NEW)
**Location**: [client/src/pages/PhoneAssignmentsPage.tsx](client/src/pages/PhoneAssignmentsPage.tsx)

**Features**:
- List all available phone numbers from the system
- Checkbox interface to select which phones belong to the org
- Save assignments button
- Status messages confirming saves
- Auto-refresh capability
- Help text explaining how filters work

**How to Use**:
1. Navigate to Phone Assignments
2. Select an organization
3. Check/uncheck phone numbers
4. Click "Save Assignments"
5. Org members will now be restricted to recordings for selected phones

---

## Database Schema Requirements

### Assumed Tables

#### mightycall_recordings
```
id, call_id, org_id, phone_number_id, from_number, to_number,
recording_url, recording_date, duration_seconds, metadata, ...
```

#### calls
```
id, from_number, to_number, duration_seconds, recording_url,
recording_file_name, started_at, ended_at, ...
```

#### org_phone_numbers (for org assignments)
```
id, org_id, phone_number_id, phone_number, label, created_at
```

#### org_users (for membership)
```
id, org_id, user_id, role, mightycall_extension, created_at
```

---

## Access Control Matrix

|Role|See Org Recordings?|Filtered by Assigned Phones?|Assign Phones?|
|---|---|---|---|
|Platform Admin|All org recordings|No|Yes|
|Org Admin|All org recordings|No|Yes|
|Org Member (with phones)|Only assigned phones|Yes|No|
|Org Member (no phones)|All org recordings|No|No|
|Non-member|None|N/A|No|

---

## Testing Checklist

- [ ] Admin can see all org recordings
- [ ] Org member without assigned phones can see all org recordings  
- [ ] Org member WITH assigned phones sees only those recordings
- [ ] Filter by date range works
- [ ] Play recording button works in browser
- [ ] Download recording works
- [ ] Phone numbers display correctly (from and to)
- [ ] Direction field displays (inbound/outbound)
- [ ] Phone assignment UI loads available phones
- [ ] Saving phone assignments restricts data properly
- [ ] Non-org members cannot access recordings

---

## Known Limitations

1. **Recording URLs must be accessible**: Download relies on external recording URLs being available
2. **Date filtering is client-side for direction/duration**: These filters are applied after fetching data
3. **No batch download**: Individual recordings must be downloaded one at a time
4. **No export formats**: Only native format downloads available

---

## Future Enhancements

1. **Call Recording Transcription**: Add transcription search
2. **Advanced Analytics**: Call duration trends, peak hours, agent performance
3. **Call Tagging**: Tag recordings for easy filtering
4. **Quality Score**: Add call quality indicators
5. **Notes/Comments**: Add notes to specific calls
6. **Batch Operations**: Download multiple recordings as ZIP
7. **Real-time Sync**: Auto-sync new recordings instead of manual button
8. **Search**: Full-text search on transcripts and metadata

---

## Troubleshooting

### "Access Denied" when viewing recordings
- Check that user is added to the organization (org_users table)
- Verify user has appropriate role (org_member, org_admin, etc.)
- If org phones are assigned, check if user's assigned phones match

### "Recording not found" on download
- Verify recording_url field is not null in database
- Check that external recording URL is still accessible
- Confirm recording ID exists in mightycall_recordings table

### Filters return no results
- Check date range is correct (no leading zeros required)
- Verify phone numbers match exactly (include +1 for US numbers)
- Try "limit" parameter to increase results returned
- Check direction parameter spelling (inbound/outbound/all)

---

## Developer Notes

All backend changes maintain backward compatibility with existing API clients. The `/api/recordings` endpoint works as before, but now correctly allows org member access.

New `/api/recordings/filter` endpoint is additive and doesn't break existing code.

Frontend RecordingsPage now has:
- Dedicated filter UI with "Filter" button
- Client-side filtering for post-fetch operations
- Better messaging about applied filters

---

**Last Updated**: February 4, 2026  
**Version**: 2.0 - Client Visibility & Phone Assignment Release
