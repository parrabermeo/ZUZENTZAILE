# Idazlan & Irakurketa Ebaluatzailea LH6

Aplicación web educativa diseñada para docentes de 6º de Educación Primaria en Euskadi (alineada con el **Decreto 77/2023**), con interfaz bilingüe (**Euskara / Castellano**), persistencia híbrida (**Firebase Firestore + respaldo automático en LocalStorage**), copia de seguridad JSON e integración con el SDK oficial `@google/genai` (modelos **Gemini 4 Neon** y **Gemini 4 Hydrogen**).

## Puesta en marcha

```bash
npm install
npm run dev
```

## Variables de entorno opcionales (`.env`)

Puedes copiar `.env.example` a `.env` o configurar la API Key directamente desde el modal **Ajustes / Ezarpenak** de la interfaz:

- `VITE_GEMINI_API_KEY`: clave de API de Google Gemini (opcional si se introduce en Ajustes).
- `VITE_FIREBASE_*`: configuración opcional de Firebase Firestore. Si no está definida o la red del centro escolar restringe Firebase, la aplicación funciona de forma transparente con `localStorage`.

## Módulos

1. **Alumnado / Ikasleria (Módulo 1 — Completo)**: Gestión de grupos/aulas, importador inteligente desde texto/Excel/CSV/TXT con vista previa y detección de duplicados, etiquetas pedagógicas (NEE/HPB, Refuerzo, Altas capacidades, HIPI, personalizadas), alta/edición manual y expediente individual.
2. **Rúbricas y Criterios / Errubrikak eta Irizpideak**: Esqueleto alineado con el Decreto 77/2023 (LH6).
3. **Nueva Evaluación (IA) / Ebaluazio Berria (AA)**: Esqueleto preparado y conectado al selector de alumnado y al motor Gemini 4 activo.
4. **Informes y Evolución / Txostenak eta Bilakaera**: Esqueleto analítico con gráficas Recharts y métricas en vivo del alumnado.
