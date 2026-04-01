import React, { useEffect, useState } from 'react';
import Navbar from '../components/Navbar';
import api from '../services/api';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import LoadingSpinner from '../components/LoadingSpinner';
import useDocumentTitle from '../hooks/useDocumentTitle';
import { formatFileSize } from '../utils/formatters';
import styles from './Analytics.module.css';

const Analytics = () => {
  useDocumentTitle('Analytics | VaultIQ');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAnalytics = async () => {
      try {
        const res = await api.get('/api/analytics');
        setData(res.data.data);
      } catch (err) {
        console.error('Failed to load analytics', err);
      } finally {
        setLoading(false);
      }
    };
    fetchAnalytics();
  }, []);



  const chartData = data?.recentUploads?.map((file, i) => ({
    name: `File ${i+1}`,
    size: file.file_size / (1024 * 1024), // MB
    uploadedAt: new Date(file.uploaded_at).toLocaleDateString()
  })) || [];

  return (
    <div className={styles.page}>
      <Navbar />
      
      <main className={styles.main}>
        <div className={styles.header}>
          <h1 className={styles.title}>Vault Analytics</h1>
          <p className={styles.subtitle}>Audit trail and storage utilization overview</p>
        </div>

        {loading ? (
          <div className={styles.loaderArea}>
            <LoadingSpinner text="Aggregating metrics..." />
          </div>
        ) : !data ? (
          <div className={styles.errorState}>Unable to load analytics data at this time.</div>
        ) : (
          <>
            <div className={styles.kpiGrid}>
              <div className={styles.kpiCard}>
                <div className={styles.kpiIconWrapper}>
                  <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
                  </svg>
                </div>
                <div>
                  <h3 className={styles.kpiValue}>{data.totalFiles}</h3>
                  <p className={styles.kpiLabel}>Total Encrypted Files</p>
                </div>
              </div>

              <div className={styles.kpiCard}>
                <div className={`${styles.kpiIconWrapper} ${styles.iconGreen}`}>
                  <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                  </svg>
                </div>
                <div>
                  <h3 className={styles.kpiValue}>{formatFileSize(data.totalStorage)}</h3>
                  <p className={styles.kpiLabel}>Vault Storage Used</p>
                </div>
              </div>
            </div>

            <div className={styles.chartSection}>
              <h2>Upload Trajectory (MB)</h2>
              <div className={styles.chartContainer}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorSize" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#3B82F6" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false} />
                    <XAxis dataKey="uploadedAt" stroke="#9CA3AF" tick={{fill: '#9CA3AF'}} />
                    <YAxis stroke="#9CA3AF" tick={{fill: '#9CA3AF'}} />
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#1F2937', borderColor: '#374151', color: '#F9FAFB' }}
                      itemStyle={{ color: '#3B82F6' }}
                    />
                    <Area type="monotone" dataKey="size" stroke="#3B82F6" fillOpacity={1} fill="url(#colorSize)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
};

export default Analytics;
