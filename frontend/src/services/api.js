const API_BASE_URL = 'http://localhost:3000/api';

// Helper function to get auth token
const getAuthToken = () => {
  return localStorage.getItem('token');
};

// Helper function to create headers
const createHeaders = (includeAuth = true) => {
  const headers = {
    'Content-Type': 'application/json',
  };
  
  if (includeAuth) {
    const token = getAuthToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
  }
  
  return headers;
};

// Generic API call function with better error handling
const apiCall = async (endpoint, options = {}) => {
  const url = `${API_BASE_URL}${endpoint}`;
  const config = {
    ...options,
    headers: {
      ...createHeaders(options.auth !== false),
      ...options.headers,
    },
  };

  try {
    console.log('API Call:', url, config); // Debug log
    const response = await fetch(url, config);
    
    // Parse response
    let data;
    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      data = await response.json();
    } else {
      const text = await response.text();
      console.error('Non-JSON response:', text);
      throw new Error('Server returned non-JSON response');
    }
    
    console.log('API Response:', data); // Debug log
    
    if (!response.ok) {
      throw new Error(data.message || data.error || 'Something went wrong');
    }
    
    return data;
  } catch (error) {
    console.error('API Error:', error); // Debug log
    throw error;
  }
};

const createMultipartFormData = (payload) => {
  if (typeof globalThis.FormData === 'undefined') {
    throw new Error('FormData is not available in this environment');
  }

  const formData = new globalThis.FormData();
  Object.keys(payload).forEach((key) => {
    if (payload[key] !== null && payload[key] !== undefined) {
      formData.append(key, payload[key]);
    }
  });

  return formData;
};

// Auth APIs
export const authAPI = {
  login: (email, password) => 
    apiCall('/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
      auth: false,
    }),
  
  register: (userData) =>
    apiCall('/register', {
      method: 'POST',
      body: JSON.stringify(userData),
      auth: false,
    }),
  
  getProfile: () => apiCall('/profile'),
};

// User APIs
export const userAPI = {
  getAll: () => apiCall('/users'),
  getById: (id) => apiCall(`/users/${id}`),
  update: (id, userData) =>
    apiCall(`/users/${id}`, {
      method: 'PUT',
      body: JSON.stringify(userData),
    }),
  delete: (id) =>
    apiCall(`/users/${id}`, {
      method: 'DELETE',
    }),
};

// Category APIs
export const categoryAPI = {
  getAll: () => apiCall('/kategori'),
  getById: (id) => apiCall(`/kategori/${id}`),
  create: (categoryData) =>
    apiCall('/kategori', {
      method: 'POST',
      body: JSON.stringify(categoryData),
    }),
  update: (id, categoryData) =>
    apiCall(`/kategori/${id}`, {
      method: 'PUT',
      body: JSON.stringify(categoryData),
    }),
  delete: (id) =>
    apiCall(`/kategori/${id}`, {
      method: 'DELETE',
    }),
};

// Item APIs
export const itemAPI = {
  getAll: () => apiCall('/alat'),
  getById: (id) => apiCall(`/alat/${id}`),
  getAvailable: () => apiCall('/alat/tersedia'),
  create: async (itemData) => {
    const formData = createMultipartFormData(itemData);
    
    const token = getAuthToken();
    const response = await fetch(`${API_BASE_URL}/alat`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
      body: formData,
    });
    
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.message || 'Failed to create item');
    }
    return data;
  },
  update: async (id, itemData) => {
    const formData = createMultipartFormData(itemData);
    
    const token = getAuthToken();
    const response = await fetch(`${API_BASE_URL}/alat/${id}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
      body: formData,
    });
    
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.message || 'Failed to update item');
    }
    return data;
  },
  delete: (id) =>
    apiCall(`/alat/${id}`, {
      method: 'DELETE',
    }),
};

// Borrow APIs
export const borrowAPI = {
  getAll: () => apiCall('/peminjaman'),
  getById: (id) => apiCall(`/peminjaman/${id}`),
  getMy: () => apiCall(`/peminjaman/my`),
  getRequests: () => apiCall(`/peminjaman/requests`),
  getBatches: () => apiCall('/peminjaman/batches'),
  approveBatch: (requestId) => apiCall(`/peminjaman/request/${requestId}/approve`, { method: 'PUT' }),
  requestReturnBatch: (requestId) => apiCall(`/peminjaman/request/${requestId}/return`, { method: 'PUT' }),
  getPending: () => apiCall('/peminjaman/pending'),
  getActive: () => apiCall('/peminjaman/active'),
  getReturnRequests: () => apiCall('/peminjaman/return-requests'),
  expirePending: () => apiCall('/peminjaman/expire-pending'),
  createBatch: (borrowData, idempotencyKey) =>
    apiCall('/peminjaman', {
      method: 'POST',
      headers: idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {},
      body: JSON.stringify(borrowData),
    }),
  create: (borrowData, idempotencyKey) =>
    apiCall('/peminjaman', {
      method: 'POST',
      headers: idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {},
      body: JSON.stringify(borrowData),
    }),
  approve: (id) =>
    apiCall(`/peminjaman/${id}/approve`, {
      method: 'PUT',
    }),
  reject: (id, notes) =>
    apiCall(`/peminjaman/${id}/reject`, {
      method: 'PUT',
      body: JSON.stringify({ notes }),
    }),
  cancel: (id) =>
    apiCall(`/peminjaman/${id}/cancel`, {
      method: 'PUT',
    }),
  requestReturn: (id) =>
    apiCall(`/peminjaman/${id}/return`, {
      method: 'PUT',
    }),
  delete: (id) =>
    apiCall(`/peminjaman/${id}`, {
      method: 'DELETE',
    }),
};

// Return APIs
export const returnAPI = {
  getAll: () => apiCall('/pengembalian'),
  getById: (id) => apiCall(`/pengembalian/${id}`),
  create: (returnData) =>
    apiCall('/pengembalian', {
      method: 'POST',
      body: JSON.stringify(returnData),
    }),
  delete: (id) =>
    apiCall(`/pengembalian/${id}`, {
      method: 'DELETE',
    }),
    confirm: (id, payload) =>
      apiCall(`/pengembalian/${id}/confirm`, {
        method: 'PUT',
        body: JSON.stringify(payload || {}),
      }),
};

// Log APIs
export const logAPI = {
  getAll: () => apiCall('/log-aktivitas'),
};

export default {
  auth: authAPI,
  user: userAPI,
  category: categoryAPI,
  item: itemAPI,
  borrow: borrowAPI,
  return: returnAPI,
  log: logAPI,
};
