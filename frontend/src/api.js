import axios from 'axios';
import { beginRequest, endRequest } from './requestTracker';

const api = axios.create({
  baseURL: 'http://localhost:5000',
});

// Attach JWT token to every request automatically
api.interceptors.request.use((config) => {
  beginRequest();
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
}, (error) => {
  endRequest();
  return Promise.reject(error);
});

api.interceptors.response.use((response) => {
  endRequest();
  return response;
}, (error) => {
  endRequest();
  return Promise.reject(error);
});

export default api;
