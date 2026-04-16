export async function createCollection(data) {
  const response = await fetch('/api/collections', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${localStorage.getItem('token')}`,
    },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to create collection');
  }

  return await response.json();
}

export async function fetchCollectionDetails(id) {
  const response = await fetch(`/api/collections/${id}`, {
    headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
  });

  if (!response.ok) {
    throw new Error('Failed to fetch collection');
  }

  return await response.json();
}
