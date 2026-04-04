import React, { useEffect, useState } from 'react';
import Navbar from '../components/Navbar';
import api from '../services/api';
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, BarChart, Bar,
} from 'recharts';
import LoadingSpinner from '../components/LoadingSpinner';
import { formatFileSize } from '../utils/format';
import styles from './Analytics.module.css';

const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899'];

const Analytics = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

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

  useEffect(() => {
    fetchAnalytics();
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await api.post('/api/analytics/refresh');
      // Wait a bit for the background process to start/finish
      setTimeout(() => {
        fetchAnalytics();
        setRefreshing(false);
      }, 2000);
    } catch (err) {
      console.error('Refresh failed', err);
      setRefreshing(false);
    }
  };

  // Trajectory Chart Data (Last 20 uploads)
  const trajectoryData = data?.recentUploads?.map((file, i) => ({
    name: `File ${i + 1}`,
    size: (file.file_size / (1024 * 1024)).toFixed(2), // MB
    uploadedAt: file.uploaded_at ? new Date(file.uploaded_at).toLocaleDateString() : 'N/A'
  })).reverse() || [];

  // User Activity Bar Chart Data
  const userActivityData = Object.entries(data?.userActivity || {}).map(([user, count]) => ({
    user: user.substring(0, 8),
    uploads: count
  }));

  return (
    <div className={styles.page}>
      <Navbar />
      
      <main className={styles.main}>
        <div className={styles.header}>
          <div className={styles.titleRow}>
            <div>
              <h1 className={styles.title}>Vault Analytics</h1>
              <p className={styles.subtitle}>Audit trail and storage utilization overview</p>
            </div>
            <button 
              className={styles.refreshButton} 
              onClick={handleRefresh}
              disabled={refreshing}
            >
              {refreshing ? 'Syncing...' : 'Refresh Analytics'}
            </button>
          </div>
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
                  <h3 className={styles.kpiValue}>{data.totalFiles || 0}</h3>
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
                  <h3 className={styles.kpiValue}>{formatFileSize(data.totalStorage || 0)}</h3>
                  <p className={styles.kpiLabel}>Vault Storage Used</p>
                </div>
              </div>
            </div>

            <div className={styles.chartsGrid}>
              <div className={styles.chartSection}>
                <h2>File Type Distribution</h2>
                <div className={styles.chartContainer}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={data.fileTypeDistribution || []}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        outerRadius={100}
                        fill="#8884d8"
                        dataKey="value"
                        label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                      >
                        {(data.fileTypeDistribution || []).map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip 
                         contentStyle={{ backgroundColor: '#1F2937', borderColor: '#374151', color: '#F9FAFB' }}
                      />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className={styles.chartSection}>
                <h2>User Activity (Top Uploaders)</h2>
                <div className={styles.chartContainer}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={userActivityData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false} />
                      <XAxis dataKey="user" stroke="#9CA3AF" />
                      <YAxis stroke="#9CA3AF" />
                      <Tooltip 
                        cursor={{fill: 'rgba(59, 130, 246, 0.1)'}}
                        contentStyle={{ backgroundColor: '#1F2937', borderColor: '#374151', color: '#F9FAFB' }}
                      />
                      <Bar dataKey="uploads" fill="#3B82F6" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            <div className={`${styles.chartSection} ${styles.fullWidth}`}>
              <h2>Upload Trajectory (MB)</h2>
              <div className={styles.chartContainer}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={trajectoryData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorSize" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#3B82F6" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false} />
                    <XAxis dataKey="uploadedAt" stroke="#9CA3AF" />
                    <YAxis stroke="#9CA3AF" />
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#1F2937', borderColor: '#374151', color: '#F9FAFB' }}
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
