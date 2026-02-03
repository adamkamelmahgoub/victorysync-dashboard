import requests
import json

org_id = 'cfbaf78a-3caa-4cb2-a367-d3b3eb161ba1'
base_url = 'http://localhost:4000'

print('Testing /api/recordings endpoint...')
try:
    r = requests.get(f'{base_url}/api/recordings?org_id={org_id}&limit=2')
    data = r.json()
    print(f'Status: {r.status_code}')
    print(f'Recordings count: {len(data.get("recordings", []))}')
    if data.get('recordings'):
        print(f'First recording phone_number_id: {data["recordings"][0].get("phone_number_id")}')
except Exception as e:
    print(f'Error: {e}')

print('\nTesting /api/sms/messages endpoint...')
try:
    r = requests.get(f'{base_url}/api/sms/messages?org_id={org_id}&limit=2')
    data = r.json()
    print(f'Status: {r.status_code}')
    print(f'SMS count: {len(data.get("messages", []))}')
    if data.get('messages'):
        print(f'First message phone_number_id: {data["messages"][0].get("phone_number_id")}')
except Exception as e:
    print(f'Error: {e}')
