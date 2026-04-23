import api from '../services/api';

export async function createCollection(data) {
  try {
    console.log('📡 API Request to /api/collections:', data);
    const response = await api.post('/api/collections', data);
    console.log('📡 API Response:', response.data);
    return response.data;
  } catch (err) {
    console.error('📡 API Error:', err.response?.data || err.message);
    throw err;
  }
}

export async function updateCollection(id, data) {
  try {
    console.log('📡 API Request to PATCH /api/collections/:id', data);
    const response = await api.patch(`/api/collections/${id}`, data);
    console.log('📡 API Response:', response.data);
    return response.data;
  } catch (err) {
    console.error('📡 API Error:', err.response?.data || err.message);
    throw err;
  }
}

export async function fetchCollectionDetails(id) {
  const response = await api.get(`/api/collections/${id}`);
  return response.data;
}

export async function updateSubmissionStatus(collectionId, submissionId, reviewStatus) {
  try {
    const response = await api.patch(
      `/api/collections/${collectionId}/submissions/${submissionId}`,
      { review_status: reviewStatus }
    );
    return response.data;
  } catch (err) {
    console.error('📡 API Error:', err.response?.data || err.message);
    throw err;
  }
}

export async function bulkUpdateSubmissionStatus(collectionId, submissionIds, reviewStatus) {
  try {
    const response = await api.patch(
      `/api/collections/${collectionId}/submissions/bulk-status`,
      { submissionIds, review_status: reviewStatus }
    );
    return response.data;
  } catch (err) {
    console.error('📡 API Error:', err.response?.data || err.message);
    throw err;
  }
}

export async function bulkDeleteSubmissions(collectionId, submissionIds) {
  try {
    const response = await api.delete(
      `/api/collections/${collectionId}/submissions/bulk`,
      { data: { submissionIds } }
    );
    return response.data;
  } catch (err) {
    console.error('📡 API Error:', err.response?.data || err.message);
    throw err;
  }
}
