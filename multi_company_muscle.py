import os
import sqlite3
import json
from supabase import create_client, Client

# --- 1. INITIALIZE THE MULTI-CLIENT BRIDGE ---
# We pull unique credentials for each project from your environment variables [cite: 639, 683, 699]
vs_url = os.environ.get("VS_SUPABASE_URL")
vs_key = os.environ.get("VS_SUPABASE_KEY")
supabase_vs: Client = create_client(vs_url, vs_key)

gem_url = os.environ.get("GEM_SUPABASE_URL")
gem_key = os.environ.get("GEM_SUPABASE_KEY")
supabase_gem: Client = create_client(gem_url, gem_key)

# --- 2. DEFINE LOCAL VAULT PATHS ---
# These paths point to your specific business databases [cite: 584, 585, 729]
BUSINESS_CONFIGS = {
    "VictorySync": {
        "db_path": r"C:\VictorySync\data\victorysync_leads.db",
        "table_name": "lead_buffer",
        "supabase_client": supabase_vs,
        "cloud_table": "leads"
    },
    "Gambry El Mon": {
        "db_path": r"C:\VictorySync\data\gambry_el_mon.db",
        "table_name": "daily_reports",
        "supabase_client": supabase_gem,
        "cloud_table": "reports"
    }
}

def push_pending_data():
    """
    The main execution loop that checks every company database for 'Pending' work.
    [cite: 535, 588, 662, 727]
    """
    for company, config in BUSINESS_CONFIGS.items():
        print(f"--- Processing {company} ---")
        
        try:
            # Connect to local SQLite "State Store" [cite: 50, 52, 248]
            conn = sqlite3.connect(config["db_path"])
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()

            # Grab any leads or reports marked as 'Pending' [cite: 63, 116, 708]
            cursor.execute(f"SELECT * FROM {config['table_name']} WHERE Status = 'Pending'")
            pending_items = cursor.fetchall()

            for item in pending_items:
                # Convert the SQLite row to a dictionary for JSON transmission [cite: 54, 73, 85]
                payload = dict(item)
                item_id = payload.get("id")

                # Push to the correct Supabase cloud vault [cite: 642, 643, 716, 725, 726]
                print(f"Pushing item {item_id} to {company} cloud...")
                response = config["supabase_client"].table(config["cloud_table"]).insert(payload).execute()

                # If successful, mark as 'Sent' in the local buffer to prevent duplicates [cite: 66, 715]
                if response:
                    cursor.execute(f"UPDATE {config['table_name']} SET Status = 'Sent' WHERE id = ?", (item_id,))
                    conn.commit()
                    print(f"Success: Item {item_id} synced.")

            conn.close()
        except Exception as e:
            print(f"Error processing {company}: {e}")

if __name__ == "__main__":
    # This acts as the "Watchdog" trigger [cite: 36, 535, 662]
    push_pending_data()