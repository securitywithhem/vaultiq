from pyspark.sql import SparkSession
from pyspark.sql.functions import col, avg, max, min, count

# Log Schema for AI detections
# { "timestamp": "...", "verdict": "Likely AI", "score": 0.95 }
log_schema = "timestamp string, verdict string, score float"

def process_ai_trends():
    spark = SparkSession.builder \
        .appName("VaultIQ-AI-Trends") \
        .getOrCreate()

    # Read from HDFS
    ai_logs = spark.read.json("hdfs://namenode:9000/vaultiq/ai_logs/*.json", schema=log_schema)

    # 1. Distribution by Verdict
    verdict_dist = ai_logs.groupBy("verdict").agg(count("*").alias("count"))

    # 2. Daily Average Score
    ai_logs = ai_logs.withColumn("date", col("timestamp").substr(1, 10))
    daily_avg = ai_logs.groupBy("date").agg(avg("score").alias("avg_score"))

    # Write back to HDFS
    verdict_dist.write.mode("overwrite").json("hdfs://namenode:9000/vaultiq/analytics/ai_distribution")
    daily_avg.write.mode("overwrite").json("hdfs://namenode:9000/vaultiq/analytics/ai_daily_averages")

    spark.stop()

if __name__ == "__main__":
    process_ai_trends()
