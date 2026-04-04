import os
import json
import requests
from datetime import datetime
from collections import Counter

def get_env_var(name, default=None):
    return os.environ.get(name, default)

# Configuration
HDFS_BASE_URL = get_env_var("HDFS_WEBHDFS_URL", "http://localhost:9870/webhdfs/v1")
SUPABASE_URL = get_env_var("SUPABASE_URL")
SUPABASE_KEY = get_env_var("SUPABASE_SERVICE_KEY")

def fetch_hdfs_logs():
    """Fetch all log files from HDFS /vaultiq/logs/"""
    logs = []
    try:
        list_url = f"{HDFS_BASE_URL}/vaultiq/logs?op=LISTSTATUS"
        response = requests.get(list_url, timeout=5)
        if response.status_code == 200:
            files = response.json().get("FileStatuses", {}).get("FileStatus", [])
            for f in files:
                if f["type"] == "FILE" and f["pathSuffix"].endswith("_event.json"):
                    # Open and read each file
                    read_url = f"{HDFS_BASE_URL}/vaultiq/logs/{f['pathSuffix']}?op=OPEN"
                    file_res = requests.get(read_url, timeout=5, allow_redirects=True)
                    if file_res.status_code == 200:
                        try:
                            logs.append(file_res.json())
                        except:
                            pass
    except Exception as e:
        print(f"[fetch_hdfs_logs] Error: {e}")
    return logs

def fetch_supabase_fallback_logs():
    """Fetch logs from Supabase system_logs table"""
    logs = []
    if not SUPABASE_URL or not SUPABASE_KEY:
        return logs
    
    try:
        url = f"{SUPABASE_URL}/rest/v1/system_logs?select=payload"
        headers = {
            "apikey": SUPABASE_KEY,
            "Authorization": f"Bearer {SUPABASE_KEY}"
        }
        response = requests.get(url, headers=headers, timeout=5)
        if response.status_code == 200:
            data = response.json()
            for entry in data:
                logs.append(entry.get("payload", {}))
    except Exception as e:
        print(f"[fetch_supabase_logs] Error: {e}")
    return logs

def process_logs():
    print(f"[{datetime.now()}] Starting log processing...")
    
    # Map Phase: Collect all entries
    hdfs_entries = fetch_hdfs_logs()
    supabase_entries = fetch_supabase_fallback_logs()
    all_entries = hdfs_entries + supabase_entries
    
    print(f"Collected {len(hdfs_entries)} from HDFS and {len(supabase_entries)} from Supabase.")

    # Reduce Phase: Aggregate metrics
    user_counts = Counter()
    mime_counts = Counter()
    event_counts = Counter()
    total_size = 0
    recent_uploads = []

    for entry in all_entries:
        user_id = entry.get("user_id", "anonymous")
        event = entry.get("event", "unknown")
        file_size = entry.get("file_size", 0)
        filename = entry.get("filename", "unknown")
        
        # Aggregate bytes for successful uploads
        if event == "upload":
            total_size += file_size
            user_counts[user_id] += 1
            
            # Extract extension/mime
            ext = os.path.splitext(filename)[1].lower() or ".unknown"
            mime_counts[ext] += 1
            
            # Track for trajectory chart
            recent_uploads.append({
                "user_id": user_id,
                "file_size": file_size,
                "uploaded_at": entry.get("timestamp")
            })

        event_counts[event] += 1

    # Sort recent uploads by date and limit
    recent_uploads.sort(key=lambda x: x.get("uploaded_at") or "", reverse=True)
    
    analytics_result = {
        "totalFiles": event_counts.get("upload", 0),
        "totalStorage": total_size,
        "eventDistribution": dict(event_counts),
        "userActivity": dict(user_counts),
        "fileTypeDistribution": [{"name": k, "value": v} for k, v in mime_counts.items()],
        "recentUploads": recent_uploads[:20],
        "lastUpdated": datetime.now().isoformat()
    }

    # Write back to HDFS results/analytics.json
    try:
        output_path = "/vaultiq/results/analytics.json"
        create_url = f"{HDFS_BASE_URL}{output_path}?op=CREATE&overwrite=true"
        res = requests.put(create_url, timeout=5)
        
        if res.status_code == 307:
            redirect_url = res.headers.get('location')
            write_res = requests.put(redirect_url, data=json.dumps(analytics_result), headers={'Content-Type': 'application/json'})
            if write_res.status_code in [200, 201]:
                print("Successfully updated analytics.json in HDFS")
            else:
                print(f"Failed to write data to HDFS: {write_res.status_code}")
    except Exception as e:
        print(f"Error writing analytics to HDFS: {e}")

if __name__ == "__main__":
    process_logs()
