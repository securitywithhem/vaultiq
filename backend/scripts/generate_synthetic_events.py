#!/usr/bin/env python3
"""
Generate synthetic event logs for presentation demonstration.
Writes to Supabase event_logs table via REST API.
"""

import os
import sys
import random
import requests
from typing import Dict, Any, List
from dotenv import load_dotenv

# Load .env file
env_path = os.path.join(os.path.dirname(__file__), '..', '.env')
load_dotenv(env_path)

# Global cache for user IDs
EXISTING_USER_IDS: List[str] = []

def get_headers():
    """Get headers for Supabase API requests."""
    key = os.getenv('SUPABASE_SERVICE_KEY')
    if not key:
        raise ValueError("SUPABASE_SERVICE_KEY required in .env")
    return {
        'apikey': key,
        'Authorization': f'Bearer {key}',
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
    }

def fetch_existing_user_ids(url: str, headers: Dict[str, str]) -> List[str]:
    """Fetch all existing user IDs from the database."""
    global EXISTING_USER_IDS

    if EXISTING_USER_IDS:
        return EXISTING_USER_IDS

    try:
        response = requests.get(
            f"{url}/rest/v1/users?select=id",
            headers=headers
        )

        if response.status_code == 200:
            users = response.json()
            EXISTING_USER_IDS = [user['id'] for user in users]
            print(f"✓ Loaded {len(EXISTING_USER_IDS)} existing user IDs")
            return EXISTING_USER_IDS
        else:
            raise Exception(f"Failed to fetch users: {response.status_code}")
    except Exception as e:
        raise Exception(f"Error fetching existing user IDs: {e}")

def generate_event(event_type: str) -> Dict[str, Any]:
    """Generate a single synthetic event with absolute minimal schema."""
    # Use one of the existing user IDs
    user_id = random.choice(EXISTING_USER_IDS)

    # Use only event_type and user_id (timestamp will use DB default)
    event = {
        'event_type': event_type,
        'user_id': user_id
    }

    return event

def generate_synthetic_logs(num_events: int = 50000):
    """Generate synthetic events."""
    events = []
    event_types = ['file_upload', 'download', 'ai_detection', 'delete']

    for i in range(num_events):
        event_type = random.choice(event_types)
        event = generate_event(event_type)
        events.append(event)

    return events

def main():
    """Main entry point."""
    try:
        url = os.getenv('SUPABASE_URL')
        if not url:
            raise ValueError("SUPABASE_URL required in .env")

        headers = get_headers()
        print("✓ Connected to Supabase API")

        # Fetch existing user IDs
        user_ids = fetch_existing_user_ids(url, headers)
        if not user_ids:
            raise ValueError("No existing users found in database")

        # Generate events
        print("Generating 50,000 synthetic events...")
        events = generate_synthetic_logs(num_events=50000)
        print(f"✓ Generated {len(events)} events")

        # Insert in batches
        batch_size = 1000
        for i in range(0, len(events), batch_size):
            batch = events[i:i+batch_size]

            # Use REST API to insert directly
            response = requests.post(
                f"{url}/rest/v1/event_logs",
                json=batch,
                headers=headers
            )

            if response.status_code not in [200, 201]:
                raise Exception(f"Insert failed: {response.status_code} - {response.text}")

            print(f"✓ Inserted events {i+1}-{min(i+batch_size, len(events))}")

        # Verify count via REST API
        response = requests.get(
            f"{url}/rest/v1/event_logs?select=count()",
            headers=headers
        )

        if response.status_code == 200:
            count_data = response.json()
            if count_data and len(count_data) > 0:
                final_count = count_data[0].get('count', 'unknown')
                print(f"\n✓ SUCCESS: Total events in database: {final_count}")
        else:
            print(f"\nEvents inserted but count verification failed: {response.status_code}")

    except Exception as e:
        print(f"✗ Error: {e}")
        sys.exit(1)

if __name__ == '__main__':
    main()
