import axios, { AxiosInstance, InternalAxiosRequestConfig } from 'axios';
import { api } from '../api/client';

export const apiClient: AxiosInstance = axios.create({
  baseURL: '/api/v1',
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 15000,
});

apiClient.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = api.getToken() || localStorage.getItem('tr_access_token');
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    if (error.response?.status === 401 && originalRequest && !originalRequest._retry) {
      originalRequest._retry = true;
      try {
        const refreshed = await api.refreshSession();
        if (refreshed) {
          const newToken = api.getToken();
          if (newToken && originalRequest.headers) {
            originalRequest.headers.Authorization = `Bearer ${newToken}`;
          }
          return apiClient(originalRequest);
        }
      } catch {
        // ignore and proceed to reject
      }
    }

    const customError = {
      message: error.response?.data?.message || error.message || 'Lỗi mạng hoặc máy chủ không phản hồi',
      status: error.response?.status,
      code: error.response?.data?.code || 'UNKNOWN_ERROR',
      data: error.response?.data,
    };
    return Promise.reject(customError);
  }
);
