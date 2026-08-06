import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
    },
  },
  {
    // shadcn/ui-ийн үүсгэсэн файлууд компонентын хажуугаар variants/hooks
    // экспортолдог нь тэдний стандарт хэв маяг — fast-refresh дүрмээс чөлөөлнө.
    files: ['src/components/ui/**/*.{ts,tsx}'],
    rules: {
      'react-refresh/only-export-components': 'off',
    },
  },
  {
    // "lib = логик, components = UI" — компонент supabase-тэй ШУУД ярихгүй,
    // өгөгдөл татах/бичих код lib/-д амьдарна (нэг ойлголт = нэг эх сурвалж).
    // Түвшин нь warn: одоо байгаа 17 файл CI-г унагахгүй (аажмаар цэгцэлнэ),
    // харин шинэ код бичихэд editor + CI логт анхааруулга харагдана.
    files: ['src/components/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'warn',
        {
          patterns: [
            {
              group: ['**/supabaseClient'],
              message:
                'Компонентоос supabase-г шууд бүү дуудаарай — өгөгдлийн логикоо src/lib/-ийн функц болгоод түүнийгээ импортлоорой (CLAUDE.md: lib = логик, components = UI).',
            },
          ],
        },
      ],
    },
  },
  {
    // Vendored код (tnks-data-table registry + shadcn calendar) — гадны эх
    // сурвалжийн хэв маягийг манай хатуу дүрмээр дарж засахгүй (шинэчлэхэд
    // диффыг бага байлгана). Өөрийн кодод эдгээр дүрэм хэвээр хатуу.
    files: ['src/components/data-table/**/*.{ts,tsx}', 'src/components/calendar-date-picker.tsx'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/refs': 'off',
      'react-hooks/exhaustive-deps': 'off',
      'react-hooks/preserve-manual-memoization': 'off',
      'no-useless-assignment': 'off',
      '@typescript-eslint/no-unused-vars': 'warn',
    },
  },
])
