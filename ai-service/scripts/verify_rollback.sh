#!/bin/bash
set -e

echo "🔄 Verifying rollback..."

# Check if backup exists
if [ ! -f "models/lr_model.pkl.bak" ]; then
    echo "❌ Backup not found at models/lr_model.pkl.bak"
    exit 1
fi

echo "✅ Backup exists"

# Check current model
if [ ! -f "models/lr_model.pkl" ]; then
    echo "❌ Current model not found at models/lr_model.pkl"
    exit 1
fi

echo "✅ Current model exists"

# Show file sizes for comparison
echo ""
echo "📊 Model file sizes:"
ls -lh models/lr_model.pkl*

echo ""
echo "✅ Rollback ready - backup and current model both present"
