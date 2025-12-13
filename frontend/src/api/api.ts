// // frontend/src/api.ts
// import axios from "axios";

// // Vite injects VITE_API_BASE; for local dev either use VITE_API_BASE=/api (proxied by Vite)
// // or fallback to the direct backend address for non-proxied setups.
// const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:4000/api";

// export function apiClient() {
//   return axios.create({
//     baseURL: API_BASE,
//     timeout: 10000,
//     withCredentials: true, // important when using HttpOnly cookies
//   });
// }
// frontend/src/api.ts
import axios from "axios";

// const API_BASE =
//   import.meta.env.MODE === "production"
//     ? "/api"
//     : import.meta.env.VITE_API_BASE || "http://localhost:4000/api";
const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:4000/api";

export const apiClient = () =>
  axios.create({
    baseURL: API_BASE,
    timeout: 10000,
    withCredentials: true,
  });
