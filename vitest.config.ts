import { defineConfig } from 'vitest/config'

// Тестийн орчин — ЗӨВХӨН цэвэр функцүүдэд (src/lib, src/i18n).
// UI/DOM тест байхгүй тул node орчин хангалттай (хурдан, jsdom хэрэггүй);
// хөтчийн цөөн API-г (localStorage) src/test/setup.ts хуурамчаар нөхнө.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    setupFiles: ['./src/test/setup.ts'],
    // supabaseClient.ts эдгээргүй бол import үедээ алдаа шиднэ. Утга нь
    // хуурамч — тест сүлжээнд огт хандахгүй (RPC дуудагч функцүүдийг
    // тестлэхгүй, зөвхөн тэдгээрийн цэвэр туслахуудыг).
    env: {
      VITE_SUPABASE_URL: 'http://localhost:54321',
      VITE_SUPABASE_ANON_KEY: 'test-anon-key',
    },
  },
})
