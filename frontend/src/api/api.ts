import axios from "axios";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:4000/api";

export function apiClient() {
  return axios.create({
    baseURL: API_BASE,
    timeout: 10000,
    withCredentials: true, // important for HttpOnly cookie auth
  });
}
