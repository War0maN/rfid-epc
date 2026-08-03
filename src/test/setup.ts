// ============================================================
// Тестийн орчны бэлтгэл (vitest setupFiles) — тест файлуудаас ӨМНӨ ажиллана.
//   node орчинд localStorage байхгүй; i18n/index.ts модуль ачаалагдах МӨЧид
//   хадгалсан хэлээ уншдаг тул энгийн санах ойн хуурамч storage тавина.
// ============================================================

class MemoryStorage implements Storage {
  private map = new Map<string, string>()

  get length(): number {
    return this.map.size
  }
  clear(): void {
    this.map.clear()
  }
  getItem(key: string): string | null {
    return this.map.get(key) ?? null
  }
  key(index: number): string | null {
    return [...this.map.keys()][index] ?? null
  }
  removeItem(key: string): void {
    this.map.delete(key)
  }
  setItem(key: string, value: string): void {
    this.map.set(key, String(value))
  }
}

globalThis.localStorage = new MemoryStorage()
globalThis.sessionStorage = new MemoryStorage()
