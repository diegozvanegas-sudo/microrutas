import js from '@eslint/js';
import globals from 'globals';

export default [
  js.configs.recommended,
  {
    files: ['src/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      // Variables que dejan los scripts clásicos de public/ (data/*.js, js/coordenadas.js)
      globals: { ...globals.browser },
    },
    // Estilo de la página original: catch vacíos donde el almacenamiento del celular puede fallar sin importar
    rules: { 'no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none' }], 'no-empty': ['error', { allowEmptyCatch: true }], 'no-useless-escape': 'off' },
  },
];
