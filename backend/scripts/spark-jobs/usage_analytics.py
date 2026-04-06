from pyspark.sql import SparkSession
from pyspark.sql.functions import col, count, window, from_json
from pyspark.sql.types import StructType, StructField, StringType, TimestampType

# Define schema for the incoming logs
log_schema = StructType([
    StructField("timestamp", TimestampType(), True),
    StructField("action", StringType(), True),
    StructField("status", StringType(), True),
    StructField("user_id", StringType(), True),
    StructField("file_id", StringType(), True)
])

def process_usage_analytics():
    spark = SparkSession.builder \
        .appName("VaultIQ-Usage-Analytics") \
        .getOrCreate()

    # Read logs from HDFS (JSON format)
    raw_logs = spark.read.json("hdfs://namenode:9000/vaultiq/logs/*.json", schema=log_schema)

    # 1. Total Action Counts
    usage_stats = raw_logs.groupBy("action").agg(count("*").alias("total_count"))

    # 2. Hourly Activity (Windowed)
    hourly_activity = raw_logs.groupBy(window(col("timestamp"), "1 hour")).agg(count("*").alias("requests"))

    # Write results back to HDFS for the dashboard to read
    usage_stats.write.mode("overwrite").json("hdfs://namenode:9000/vaultiq/analytics/usage_summary")
    hourly_activity.write.mode("overwrite").json("hdfs://namenode:9000/vaultiq/analytics/hourly_activity")

    spark.stop()

if __name__ == "__main__":
    process_usage_analytics()
