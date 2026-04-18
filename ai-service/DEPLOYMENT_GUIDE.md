# Model Deployment Guide

## Pre-Deployment Checklist

- [ ] Retrained model exists at `models/lr_model.pkl`
- [ ] Backup created at `models/lr_model.pkl.bak`
- [ ] Scaler exists at `models/scaler.pkl`
- [ ] All git commits pushed to remote
- [ ] Tests passing locally

## Deployment Steps

### Step 1: Backup Current Model (automatic during retrain)
Already handled by retrain script - old model backed up before replacing.

### Step 2: Verify Services Running
```bash
# Check AI Service health
curl -s http://localhost:8001/health | jq '.'

# Check Backend health
curl -s http://localhost:5000/api/health | jq '.'
```

Expected: Both return `"status": "ok"`

### Step 3: Restart AI Service
```bash
# If using Docker
docker-compose restart ai-service

# If running locally
pkill -f "uvicorn main:app"
cd ai-service && python3 -m uvicorn main:app --host 0.0.0.0 --port 8001 &
```

Wait 5 seconds for service to start.

### Step 4: Verify Service Health
```bash
curl -s http://localhost:8001/health | jq '.'
```

Expected:
```json
{
  "status": "ok",
  "model_loaded": true,
  "version": "0.1.0"
}
```

### Step 5: Test with Sample File
```bash
# Create test file
cat > /tmp/test_academic.txt << 'EOF'
This lab report investigates the effect of pH on enzyme activity. 
The experiment was conducted using amylase enzyme and various pH buffers. 
Results show optimal activity at pH 7.0.
EOF

# Test detection
curl -F "files=@/tmp/test_academic.txt" http://localhost:8001/detect | jq '.results[0]'
```

Expected response:
```json
{
  "filename": "test_academic.txt",
  "status": "ok",
  "score": 0.65,
  "verdict": "mixed",
  "confidence": "high",
  "chunk_scores": [0.65]
}
```

## Rollback Procedure

If issues arise after deployment:

```bash
# 1. Restore backup
cp ai-service/models/lr_model.pkl.bak ai-service/models/lr_model.pkl

# 2. Restart service
docker-compose restart ai-service  # Docker
# OR
pkill -f "uvicorn main:app"
cd ai-service && python3 -m uvicorn main:app --host 0.0.0.0 --port 8001 &

# 3. Verify health
curl -s http://localhost:8001/health | jq '.'

# 4. Test again
curl -F "files=@/tmp/test_academic.txt" http://localhost:8001/detect | jq '.results[0]'
```

**Time to rollback:** < 2 minutes

## Deployment Timeline

| Phase | Duration | Status |
|-------|----------|--------|
| Generate synthetic data (Task 2) | 45-60 min | Pending API key |
| Retrain model (Task 4) | 15-20 min | Pending Task 2 |
| Validate model (Task 6) | 5 min | Pending Task 4 |
| Deploy to production (Task 7) | 5 min | Ready |
| Monitor (Task 8) | Continuous | Ready |

## Success Criteria

✅ **Deployment successful when:**
- AI Service responds to health check
- Model loads without errors
- Sample test returns valid detection result
- No errors in service logs
- Confidence levels improved (verified by validation)

✅ **Rollback successful when:**
- Old model restored from backup
- Service restarted and healthy
- Test results return to pre-deployment accuracy
