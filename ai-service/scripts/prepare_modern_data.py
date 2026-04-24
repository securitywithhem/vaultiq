import pandas as pd
from datasets import load_dataset
from tqdm import tqdm
import os
import numpy as np
from pathlib import Path
from typing import List, Dict, Optional, Union

# Goal: Gather modern LLM outputs (GPT-4, Claude 3, etc.)
# artem9k/ai-text-detection-pile is a large collection.
# We will filter it based on the 'source' field.

DATASETS_DIR = Path(__file__).parent.parent / "datasets"
OUTPUT_FILE = DATASETS_DIR / "modern_llm_corpus.csv"

def prepare_modern_data():
    print("🚀 Preparing modern LLM dataset...")
    os.makedirs(DATASETS_DIR, exist_ok=True)
    
    all_data = []

    # 1. artem9k/ai-text-detection-pile
    print("📥 Loading artem9k/ai-text-detection-pile...")
    try:
        ds1 = load_dataset("artem9k/ai-text-detection-pile", split="train")
        df1 = ds1.to_pandas()
        print(f"   Found {len(df1)} samples in pile.")
        
        # Map labels based on source
        # According to the sample output, 'human' is human, 'ai' is AI.
        df1['label'] = df1['source'].apply(lambda x: 1 if x == 'ai' else 0)
        df1['source_tag'] = 'pile_' + df1['source']
        
        all_data.append(df1[['text', 'label', 'source_tag']].rename(columns={'source_tag': 'source'}))
    except Exception as e:
        print(f"⚠️ Failed to load pile: {e}")

    # 2. Hello-SimpleAI/HC3 (Classic ChatGPT)
    print("📥 Loading Hello-SimpleAI/HC3...")
    try:
        ds2 = load_dataset("Hello-SimpleAI/HC3", "all", split="train")
        df2 = ds2.to_pandas()
        
        hc3_ai = []
        hc3_human = []
        
        # Fields: 'human_answers' (list), 'chatgpt_answers' (list)
        for _, row in df2.iterrows():
            cg_ans = row.get('chatgpt_answers', [])
            # Fix: handle potential numpy arrays or lists correctly
            if isinstance(cg_ans, (list, np.ndarray)) and len(cg_ans) > 0:
                for ans in cg_ans:
                    hc3_ai.append({'text': str(ans), 'label': 1, 'source': 'hc3_chatgpt'})
            
            h_ans = row.get('human_answers', [])
            if isinstance(h_ans, (list, np.ndarray)) and len(h_ans) > 0:
                for ans in h_ans:
                    hc3_human.append({'text': str(ans), 'label': 0, 'source': 'hc3_human'})
        
        if hc3_ai:
            all_data.append(pd.DataFrame(hc3_ai))
        if hc3_human:
            all_data.append(pd.DataFrame(hc3_human))
        print(f"   Collected {len(hc3_ai)} AI and {len(hc3_human)} Human samples from HC3.")
    except Exception as e:
        print(f"⚠️ Failed to load HC3: {e}")

    # Combine
    if not all_data:
        print("❌ No data collected!")
        return

    print("🔄 Combining and cleaning...")
    combined_df = pd.concat(all_data, ignore_index=True)
    
    # Basic cleaning
    combined_df = combined_df.dropna(subset=['text'])
    combined_df = combined_df[combined_df['text'].str.len() > 100]
    
    # Drop duplicates
    initial_len = len(combined_df)
    combined_df = combined_df.drop_duplicates(subset=['text'])
    print(f"🧹 Removed {initial_len - len(combined_df)} duplicates.")

    # Balance classes (Human vs AI)
    ai_df = combined_df[combined_df['label'] == 1]
    human_df = combined_df[combined_df['label'] == 0]
    
    print(f"📊 Before balancing: {len(ai_df)} AI, {len(human_df)} Human")
    
    n_samples = min(len(ai_df), len(human_df), 100000)
    if n_samples > 0:
        balanced_df = pd.concat([
            ai_df.sample(n=n_samples, random_state=42) if len(ai_df) > n_samples else ai_df,
            human_df.sample(n=n_samples, random_state=42) if len(human_df) > n_samples else human_df
        ])
    else:
        balanced_df = combined_df.sample(n=min(len(combined_df), 100000), random_state=42)

    print(f"💾 Saving {len(balanced_df)} samples to {OUTPUT_FILE}...")
    balanced_df.to_csv(OUTPUT_FILE, index=False)
    print("✅ Modern data preparation complete!")

if __name__ == "__main__":
    prepare_modern_data()
