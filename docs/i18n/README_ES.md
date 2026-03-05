<div align="center">

🌐 [English](../../README.md) · [한국어](README_KO.md) · [日本語](README_JA.md) · [中文](README_ZH-CN.md) · **Español** · [Français](README_FR.md) · [Deutsch](README_DE.md)

</div>

---

<div align="center">

<img src="../../assets/icons/icon128.png" alt="SkillBridge" width="80" />

# SkillBridge for Anthropic Academy

[![MIT License](https://img.shields.io/badge/License-MIT-green.svg)](../../LICENSE)
[![Chrome MV3](https://img.shields.io/badge/Chrome-Extension_MV3-blue.svg)](https://developer.chrome.com/docs/extensions/)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](../../CONTRIBUTING.md)

**Elimina la barrera del idioma en los cursos gratuitos de IA de Anthropic.**

[Instalar](#instalación) · [Reportar Error](../../issues) · [Solicitar Función](../../issues)

</div>

---

<div align="center">

<img src="../../assets/screenshots/skillbridge-demo.gif" alt="Demostración de SkillBridge — traducción de Anthropic Academy en tiempo real" width="720" />

*Instala SkillBridge, visita Anthropic Academy y toda la página se traduce al instante.*

</div>

---

## ¿Por qué SkillBridge?

[Anthropic Academy](https://anthropic.skilljar.com/) ofrece formación de primer nivel sobre Claude, ingeniería de prompts y seguridad de IA — **pero solo en inglés.**

Quizás pienses: *"Solo usaré Google Translate."* Aquí está por qué no es suficiente:

| | Google Translate (página) | SkillBridge |
|---|---|---|
| Terminología de IA | ❌ "Prompt" → "rápido" (incorrecto) | ✅ "Prompt" → "prompt" (correcto) |
| Precisión técnica | ❌ Traducción automática genérica | ✅ 560+ términos curados manualmente por idioma + corrección automática de términos protegidos + verificación IA Gemini |
| Ayuda contextual | ❌ Ninguna | ✅ Tutor de IA (Claude Sonnet 4) responde preguntas sobre la lección |
| Subtítulos de video | ❌ Toggle manual separado | ✅ Subtítulos autotraducidos en tu idioma |
| Preservación de UI | ❌ Rompe casillas, barras de progreso | ✅ Preserva todos los elementos interactivos |
| Costo | Gratis | Gratis — sin claves API necesarias |

> **Sin claves API. Sin costo. Solo instala y aprende.**

### Términos Protegidos en Acción

Las herramientas de traducción de página genéricas frecuentemente **mistraduce nombres de marcas y términos técnicos**. Por ejemplo, Google Translate representa "Anthropic Courses" como "cursos antropológicos" en español — completamente incorrecto.

El motor **Términos Protegidos** de SkillBridge autocorrige estos errores después de la traducción, manteniendo nombres de marca como "Anthropic", "Claude" e términos técnicos intactos:

<div align="center">

| Antes (Solo Google Translate) | Después (SkillBridge Términos Protegidos) |
|:---:|:---:|
| ❌ cursos antropológicos | ✅ cursos Anthropic |
| ❌ Claudio | ✅ Claude |
| ❌ ingeniería rápida | ✅ ingeniería de prompts |

</div>

<div align="center">
<img src="../../assets/screenshots/catalog-translated.png" alt="Catálogo de cursos de Anthropic Academy traducido al coreano con terminología correcta" width="720" />
<br/>
<em>Catálogo de cursos traducido al coreano — nombres de marca y términos de IA se mantienen precisos.</em>
</div>

## Vélo en Acción

### Traducción de Página Completa

Cada elemento de texto en la página se traduce, con terminología específica de IA manejada correctamente a través de diccionarios curados. Las casillas de progreso, iconos y navegación se mantienen intactos.

<div align="center">
<img src="../../assets/screenshots/01-lesson-translated.png" alt="Página de lección con currículo completamente traducido" width="720" />
<br/>
<em>Página de lección con currículo completamente traducido — elementos de UI preservados.</em>
</div>

### Tutor de IA

Un chatbot de barra lateral impulsado por **Claude Sonnet 4** a través de [Puter.js](https://docs.puter.com/). Sabe en qué curso y lección estás. Haz preguntas en tu idioma, obtén respuestas en streaming.

<!-- TODO: ai-tutor.png agregar y descomentar
<div align="center">
<img src="../../assets/screenshots/ai-tutor.png" alt="Barra lateral de Tutor de IA respondiendo una pregunta en coreano" width="720" />
<br/>
<em>Pregunta al Tutor de IA sobre la lección — impulsado por Claude Sonnet 4.</em>
</div>
-->

### Subtítulos Automáticos

Los videos del curso activan automáticamente subtítulos traducidos cuando los reproduces — sin toggle manual necesario.

<!-- <div align="center">
<img src="../../assets/screenshots/subtitles.png" alt="Video de YouTube con subtítulos en coreano traducidos automáticamente" width="720" />
<br/>
<em>Subtítulos de video autotraducidos a tu idioma.</em>
</div> -->

## Cómo Funciona

SkillBridge utiliza un **motor de traducción de cinco niveles** que prioriza velocidad y precisión:

```
Texto de página
  │
  ├─ 560+ diccionario de términos curados ──→ Instantáneo (términos de IA traducidos correctamente)
  │
  ├─ Caché local (IndexedDB) ───────→ Instantáneo (previamente verificado)
  │
  ├─ ¿Tiene etiquetas HTML inline? (<strong>, <a>, <code>...)
  │     └─ Sí → Gemini 2.0 Flash traduce preservando etiquetas
  │
  └─ Texto plano → Google Translate ─→ ~200ms
       │
       ├─ Corrección automática de Términos Protegidos ─→ Restaura marca/términos técnicos que GT mistraduce
       │
       └─ ¿Oración compleja? → Gemini 2.0 Flash verifica → corrige si es necesario
```

**Términos Protegidos** — Cada idioma define errores conocidos de GT (ejemplo: GT traduce "Claude" → "Claudio" en español). Después de que GT se ejecuta, la extensión autocorrige automáticamente estos de vuelta a la forma correcta. Los nombres de marca, términos técnicos y jerarquía de productos se mantienen en inglés — coincidiendo con [documentos multilingües oficiales de Anthropic](https://docs.anthropic.com).

Toda la traducción ocurre **en tu navegador** — nada se almacena o envía a servidores de terceros.

## Características

**🌐 Traducción de Página Completa** — Cada elemento de texto en la página se traduce, con terminología específica de IA manejada correctamente a través de diccionarios curados.

**🤖 Tutor de IA** — Un chatbot de barra lateral impulsado por Claude Sonnet 4 a través de [Puter.js](https://docs.puter.com/). Sabe en qué curso y lección estás. Haz preguntas en tu idioma, obtén respuestas en streaming.

**🎬 Subtítulos Automáticos** — Los videos del curso activan automáticamente subtítulos traducidos cuando los reproduces.

**🔍 Detección Inteligente** — Detecta tu idioma de navegador en la primera visita y ofrece traducción. Sin configuración necesaria.

**✨ UI Fiel** — Las casillas de progreso, iconos y navegación se mantienen intactos. Las fuentes CJK se adaptan al diseño original.

## Idiomas Soportados

### Premium — Diccionario Curado + Google Translate + Verificación IA

| Idioma | Código | Diccionario |
|--------|--------|-------------|
| 🇰🇷 한국어 (Korean) | `ko` | 560+ entradas |
| 🇯🇵 日本語 (Japanese) | `ja` | 560+ entradas |
| 🇨🇳 中文简体 (Chinese Simplified) | `zh-CN` | 560+ entradas |
| 🇪🇸 Español (Spanish) | `es` | 560+ entradas |
| 🇫🇷 Français (French) | `fr` | 560+ entradas |
| 🇩🇪 Deutsch (German) | `de` | 560+ entradas |

### Estándar — Google Translate + Verificación IA

🇹🇼 中文繁體 · 🇧🇷 Português (BR) · 🇵🇹 Português (PT) · 🇮🇹 Italiano · 🇳🇱 Nederlands · 🇷🇺 Русский · 🇵🇱 Polski · 🇺🇦 Українська · 🇨🇿 Čeština · 🇸🇪 Svenska · 🇩🇰 Dansk · 🇫🇮 Suomi · 🇳🇴 Norsk · 🇹🇷 Türkçe · 🇸🇦 العربية · 🇮🇳 हिन्दी · 🇹🇭 ภาษาไทย · 🇻🇳 Tiếng Việt · 🇮🇩 Bahasa Indonesia · 🇲🇾 Bahasa Melayu · 🇵🇭 Filipino · 🇧🇩 বাংলা · 🇮🇱 עברית · 🇷🇴 Română · 🇭🇺 Magyar · 🇬🇷 Ελληνικά

> ¿Quieres agregar tu idioma como Premium? Contribuye un diccionario curado — ver [CONTRIBUTING.md](../../CONTRIBUTING.md).

## Instalación

<!-- **Chrome Web Store** (recomendado): [Instalar SkillBridge](https://chrome.google.com/webstore/) — próximamente -->

**Instalación manual** (modo desarrollador):

```bash
git clone https://github.com/heznpc/skillbridge.git
```

1. Abre `chrome://extensions/` en Chrome
2. Activa **Modo de desarrollador** (alternar arriba a la derecha)
3. Haz clic en **Cargar extensión sin empaquetar** → selecciona la carpeta clonada
4. Visita [anthropic.skilljar.com](https://anthropic.skilljar.com/) ¡y comienza a aprender!

## Arquitectura

```
skillbridge/
├── manifest.json              # Manifiesto Chrome MV3
├── _locales/                  # Chrome i18n (en, ko, ja, zh_CN)
├── src/
│   ├── background/            # Proxy de Google Translate API
│   ├── content/               # Traducción DOM + UI de barra lateral + fuentes
│   ├── popup/                 # UI de popup de extensión
│   ├── lib/                   # Motor de traducción, puente de IA, subtítulos
│   └── data/                  # Diccionarios curados (6 idiomas × 560+)
└── assets/icons/
```

## Stack Técnico

| Componente | Tecnología |
|-----------|-----------|
| Traducción de Página | Google Translate API |
| Traducción de Etiquetas Inline | Gemini 2.0 Flash (preserva `<strong>`, `<a>`, `<code>`) |
| Verificación de Calidad | Gemini 2.0 Flash vía [Puter.js](https://docs.puter.com/) |
| Términos Protegidos | Autocorrección de errores de marca/términos técnicos GT por idioma |
| Tutor de IA | Claude Sonnet 4 vía Puter.js |
| Diccionarios Curados | JSON ajustado manualmente (560+ × 6 idiomas) |
| Caché de Traducción | IndexedDB |
| Renderizado de Fuentes CJK | Google Fonts Noto Sans |

> **Construido con [Claude Code](https://docs.anthropic.com/en/docs/claude-code).**
> Este proyecto — desde el diseño de arquitectura e implementación de características hasta la configuración de tuberías CI/CD, pruebas unitarias, depuración e incluso el GIF de demostración — fue desarrollado usando Claude Code como socio de programación en pareja de IA.

## Filosofía de Traducción

El diccionario de cada idioma se cura cuidadosamente para sonar natural a los hablantes nativos. Actualmente nos alineamos con [documentos multilingües oficiales de Anthropic](https://docs.anthropic.com) como línea de base, pero las convenciones comunitarias también importan — si los desarrolladores hispanohablantes dicen "prompt" en lugar de "aviso rápido", eso es lo que usamos.

¿No estás de acuerdo con una elección de término? Ese es exactamente el tipo de PR que queremos — ver [CONTRIBUTING.md](../../CONTRIBUTING.md) para cómo mejorar el diccionario de tu idioma.

## Contribuir

¡Se buscan hablantes nativos! La forma más impactante de contribuir es mejorar el diccionario de traducción de tu idioma — no se requiere código, solo editar un archivo JSON. Incluso corregir una mala traducción ayuda a todos los estudiantes que usan ese idioma.

Consulta [CONTRIBUTING.md](../../CONTRIBUTING.md) para la guía completa, [Good First Issues](../../issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22) para empezar, y [ROADMAP.md](../../docs/ROADMAP.md) para ver a dónde se dirige este proyecto.

## Descargo de Responsabilidad

SkillBridge es una herramienta de traducción personal, similar a la función de traducción integrada de tu navegador. El texto se traduce sobre la marcha en tu navegador — nunca se almacena ni redistribuye.

> **SkillBridge for Anthropic Academy** es un proyecto comunitario no oficial. No está afiliado con, ni respaldado o patrocinado por Anthropic. "Anthropic", "Claude" y "Skilljar" son marcas registradas de sus respectivos propietarios.

## Licencia

[MIT](../../LICENSE)
