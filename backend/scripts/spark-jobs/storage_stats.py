from pyspark.sql import SparkSession
from pyspark.sql.functions import col, sum, avg, count, when

# Storage Log Schema
# { "timestamp": "...", "file_id": "...", "size_bytes": 1024, "ext": ".pdf" }
storage_schema = "timestamp string, file_id string, size_bytes long, ext string"

def process_storage_stats():
    spark = SparkSession.builder \
        .appName("VaultIQ-Storage-Stats") \
        .getOrCreate()

    # Read storage logs from HDFS
    storage_logs = spark.read.json("hdfs://namenode:9000/vaultiq/storage_logs/*.json", schema=storage_schema)

    # 1. Total Storage Used
    total_storage = storage_logs.agg(sum("size_bytes").alias("total_bytes"))

    # 2. Distribution by File Extension
    ext_dist = storage_logs.groupBy("ext").agg(
        count("*").alias("count"),
        sum("size_bytes").alias("total_ext_bytes")
    )

    # 3. Average File Size
    avg_size = storage_logs.agg(avg("size_bytes").alias("avg_file_size"))

    # Write out to HDFS
    total_storage.write.mode("overwrite").json("hdfs://namenode:9000/vaultiq/analytics/total_storage")
    ext_dist.write.mode("overwrite").json("hdfs://namenode:9000/vaultiq/analytics/extension_distribution")
    avg_size.write.mode("overwrite").json("hdfs://namenode:9000/vaultiq/analytics/average_file_size")

    spark.stop()

if __name__ == "__main__":
    process_storage_stats()
