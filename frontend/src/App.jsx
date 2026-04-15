import { Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';

import Login                    from './pages/Login';
import Signup                   from './pages/Signup';
import Dashboard                from './pages/Dashboard';
import FilesPage                from './pages/FilesPage';
import Analytics                from './pages/Analytics';
import TextAiDetection          from './pages/TextAiDetection';
import CollectionsPage          from './pages/CollectionsPage';
import CreateCollectionPage     from './pages/CreateCollectionPage';
import CollectionDetailsPage    from './pages/CollectionDetailsPage';
import StudentSubmissionPage    from './pages/StudentSubmissionPage';
import ProtectedRoute           from './components/ProtectedRoute';

function App() {
  return (
    <>
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 3500,
          style: {
            background: '#1F2937',
            color: '#F9FAFB',
            border: '1px solid #374151',
            fontSize: '0.875rem',
            borderRadius: '10px',
          },
        }}
      />

      <Routes>
        {/* Public */}
        <Route path="/login"  element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/submit/:shareCode" element={<StudentSubmissionPage />} />

        {/* Protected */}
        <Route element={<ProtectedRoute />}>
          <Route path="/dashboard"    element={<Dashboard />} />
          <Route path="/files"        element={<FilesPage />} />
          <Route path="/analytics"    element={<Analytics />} />
          <Route path="/ai-detection" element={<TextAiDetection />} />
          <Route path="/collections"  element={<CollectionsPage />} />
          <Route path="/collections/new" element={<CreateCollectionPage />} />
          <Route path="/collections/:id" element={<CollectionDetailsPage />} />
        </Route>

        {/* Default — ProtectedRoute handles the auth check and redirects */}
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </>
  );
}

export default App;
