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

export async function fetchCollectionDetails(id) {
  const response = await api.get(`/api/collections/${id}`);
  return response.data;
}
