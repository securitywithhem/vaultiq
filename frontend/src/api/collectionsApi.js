import api from '../services/api';

export async function createCollection(data) {
  const response = await api.post('/api/collections', data);
  return response.data;
}

export async function fetchCollectionDetails(id) {
  const response = await api.get(`/api/collections/${id}`);
  return response.data;
}
