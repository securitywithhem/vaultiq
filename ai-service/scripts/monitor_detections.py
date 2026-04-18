"""
Monitor AI detection performance post-deployment.
Tracks confidence levels, verdicts, and response times.
"""

import json
import time
from pathlib import Path
from datetime import datetime, timedelta

def load_detections(filepath):
    """Load detection history from JSON file."""
    if not Path(filepath).exists():
        return []

    with open(filepath, 'r') as f:
        data = json.load(f)

    return data.get('detections', [])

def analyze_detections(detections, hours=24):
    """Analyze detections from last N hours."""
    if not detections:
        return {}

    cutoff_time = datetime.utcnow() - timedelta(hours=hours)
    recent = []

    for d in detections:
        try:
            ts = datetime.fromisoformat(d['timestamp'].replace('Z', '+00:00'))
            if ts > cutoff_time:
                recent.append(d)
        except:
            pass

    if not recent:
        return {'total': 0, 'recent_hours': hours, 'message': 'No detections in period'}

    verdicts = {}
    confidences = {'high': 0, 'medium': 0, 'low': 0}
    scores = []

    for d in recent:
        verdict = d.get('verdict', 'unknown')
        verdicts[verdict] = verdicts.get(verdict, 0) + 1

        confidence = d.get('confidence', 'unknown')
        if confidence in confidences:
            confidences[confidence] += 1

        try:
            scores.append(float(d.get('score', 0)))
        except:
            pass

    analysis = {
        'total_detections': len(recent),
        'recent_hours': hours,
        'verdicts': verdicts,
        'confidence_distribution': confidences,
        'avg_score': sum(scores) / len(scores) if scores else 0,
        'min_score': min(scores) if scores else 0,
        'max_score': max(scores) if scores else 0,
        'high_confidence_pct': (confidences['high'] / len(recent) * 100) if recent else 0
    }

    return analysis

def print_report(analysis):
    """Print monitoring report."""
    print("=" * 70)
    print("AI Detection Performance Report")
    print("=" * 70)
    print(f"Timestamp: {datetime.utcnow().isoformat()}Z")

    if analysis.get('message'):
        print(f"\n{analysis['message']}")
        return

    print(f"\n📊 Last {analysis['recent_hours']} hours:")
    print(f"   Total detections: {analysis['total_detections']}")

    print(f"\n🎯 Verdicts:")
    for verdict, count in analysis['verdicts'].items():
        pct = (count / analysis['total_detections'] * 100)
        print(f"   {verdict}: {count} ({pct:.1f}%)")

    print(f"\n📈 Confidence distribution:")
    for conf in ['high', 'medium', 'low']:
        count = analysis['confidence_distribution'].get(conf, 0)
        pct = (count / analysis['total_detections'] * 100) if analysis['total_detections'] > 0 else 0
        bar = '█' * int(pct / 5)
        print(f"   {conf:6s}: {count:3d} ({pct:5.1f}%) {bar}")

    print(f"\n📉 Score statistics:")
    print(f"   Average: {analysis['avg_score']:.3f}")
    print(f"   Min: {analysis['min_score']:.3f}")
    print(f"   Max: {analysis['max_score']:.3f}")
    print(f"   High confidence: {analysis['high_confidence_pct']:.1f}%")

    print("\n" + "=" * 70)

def main():
    """Monitor detection performance."""
    detections_file = Path('backend/data/ai_detections.json')

    if not detections_file.exists():
        print(f"Detection file not found: {detections_file}")
        return

    # Analyze last 24 hours
    detections = load_detections(str(detections_file))
    analysis = analyze_detections(detections, hours=24)
    print_report(analysis)

    # Analyze last 7 days
    analysis_7d = analyze_detections(detections, hours=168)
    print("\n" + "=" * 70)
    print("7-Day Trend")
    print("=" * 70)
    if analysis_7d.get('total_detections', 0) > 0:
        print(f"Total detections (7 days): {analysis_7d['total_detections']}")
        print(f"High confidence rate: {analysis_7d.get('high_confidence_pct', 0):.1f}%")
    else:
        print("No detections in last 7 days")

if __name__ == "__main__":
    main()
