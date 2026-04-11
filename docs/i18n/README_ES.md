<div align="center">

🌐 [English](../../README.md) · [한국어](README_KO.md) · [日本語](README_JA.md) · [中文](README_ZH-CN.md) · **Español** · [Français](README_FR.md) · [Deutsch](README_DE.md)

</div>

---

<div align="center">

<img src="../../assets/icons/icon128.png" alt="SkillBridge" width="90" />

# SkillBridge for Anthropic Academy <!-- VERSION_START -->v3.5.4<!-- VERSION_END -->

[![MIT License](https://img.shields.io/badge/License-MIT-green.svg)](../../LICENSE)
[![Chrome MV3](https://img.shields.io/badge/Chrome-Extension_MV3-blue.svg)](https://developer.chrome.com/docs/extensions/)
[![GitHub stars](https://img.shields.io/github/stars/heznpc/skillbridge?style=social)](https://github.com/heznpc/skillbridge/stargazers)
[![GitHub contributors](https://img.shields.io/github/contributors/heznpc/skillbridge)](https://github.com/heznpc/skillbridge/graphs/contributors)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](../../CONTRIBUTING.md)

**Traduce Anthropic Academy a tu idioma — al instante.**

Elimina la barrera del idioma en los cursos gratuitos de IA de Anthropic.

[Instalar](#instalación) · [Reportar Error](https://github.com/heznpc/skillbridge/issues) · [Solicitar Función](https://github.com/heznpc/skillbridge/issues)

</div>

---

<div align="center">

<img src="../../assets/screenshots/skillbridge-demo.gif" alt="Demostración de SkillBridge — traducción de Anthropic Academy en tiempo real" width="720" />

*Instala SkillBridge, visita Anthropic Academy y toda la página se traduce al instante.*

</div>

---

## El Problema

[Anthropic Academy](https://anthropic.skilljar.com/) es el mejor lugar para aprender Claude, ingeniería de prompts y seguridad de IA — gratis. SkillBridge hace que estos cursos sean accesibles para todos, sin importar el idioma.

Pero los cursos están **disponibles solo en inglés**, y los traductores genéricos se quedan cortos:

| | Google Translate (página) | SkillBridge |
|---|---|---|
| Terminología de IA | ❌ "Prompt" → "rápido" (incorrecto) | ✅ "Prompt" → "prompt" (correcto) |
| Precisión técnica | ❌ Traducción automática genérica | ✅ 570+ términos curados + verificación IA |
| Ayuda contextual | ❌ Ninguna | ✅ Tutor de IA responde preguntas sobre la lección |
| Subtítulos de video | ❌ Toggle manual separado | ✅ Subtítulos autotraducidos |
| Preservación de UI | ❌ Rompe casillas, barras de progreso | ✅ Preserva todos los elementos interactivos |
| Costo | Gratis | Gratis — sin claves API necesarias |

> **Sin claves API. Sin costo. Solo instala y aprende.**

## Inicio Rápido

1. Instala la extensión ([ver abajo](#instalación))
2. Visita [Anthropic Academy](https://anthropic.skilljar.com/)
3. SkillBridge traduce toda la página automáticamente

Eso es todo.

## Características

### 🌐 Traducción de Página Completa

Cada elemento de texto en la página se traduce, con terminología específica de IA manejada correctamente a través de diccionarios curados. Las casillas de progreso, iconos, navegación y fuentes CJK se mantienen intactos.

<div align="center">
<img src="../../assets/screenshots/01-lesson-translated.png" alt="Página de lección con currículo completamente traducido" width="720" />
<br/>
<em>Página de lección con currículo completamente traducido — elementos de UI preservados.</em>
</div>

### 🤖 Tutor de IA

Un chatbot de barra lateral impulsado por **Claude Sonnet 4** a través de [Puter.js](https://docs.puter.com/). Sabe en qué curso y lección estás. Haz preguntas en tu idioma, obtén respuestas en streaming.

### 🎬 Subtítulos Automáticos

Los videos del curso activan automáticamente subtítulos traducidos cuando los reproduces — sin toggle manual necesario.

### 🔍 Detección Inteligente

Detecta tu idioma de navegador en la primera visita y ofrece traducción. Sin configuración necesaria.

### 🛡️ Términos Protegidos

Las herramientas de traducción genéricas frecuentemente **traducen mal nombres de marcas y términos técnicos**. SkillBridge autocorrige estos errores después de la traducción:

<div align="center">

| Antes (Google Translate) | Después (SkillBridge) |
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

## Instalación

> Publicación en Chrome Web Store próximamente — dale estrella a este repositorio para recibir la notificación.

**Instalación manual** (modo desarrollador):

```bash
git clone https://github.com/heznpc/skillbridge.git
```

1. Abre `chrome://extensions/` en Chrome
2. Activa **Modo de desarrollador** (alternar arriba a la derecha)
3. Haz clic en **Cargar extensión sin empaquetar** → selecciona la carpeta clonada
4. Visita [anthropic.skilljar.com](https://anthropic.skilljar.com/) ¡y comienza a aprender!

También funciona en Edge, Brave, Arc y otros navegadores basados en Chromium.

## Cómo Funciona

SkillBridge utiliza un **motor de traducción de cinco niveles** que prioriza velocidad y precisión:

```
Texto de página
  │
  ├─ 570+ diccionario de términos curados ──→ Instantáneo (términos de IA traducidos correctamente)
  │
  ├─ Caché local (IndexedDB) ───────→ Instantáneo (previamente verificado)
  │
  ├─ ¿Tiene etiquetas HTML inline? (<strong>, <a>, <code>...)
  │     └─ Sí → Gemini 2.0 Flash traduce preservando etiquetas
  │
  └─ Texto plano → Google Translate ─→ ~200ms
       │
       ├─ Corrección automática de Términos Protegidos ─→ Restaura marca/términos técnicos que GT traduce mal
       │
       └─ ¿Oración compleja? → Gemini 2.0 Flash verifica → corrige si es necesario
```

Las solicitudes de traducción se envían a Google Translate y las APIs de Gemini/Claude a través de [Puter.js](https://docs.puter.com/) — no se almacenan datos en nuestros servidores, y no se requiere cuenta ni clave API.

## Idiomas Soportados

### Premium — Diccionario Curado + Google Translate + Verificación IA

| Idioma | Código | Diccionario |
|--------|--------|-------------|
| 🇰🇷 한국어 (Korean) | `ko` | 570+ entradas |
| 🇯🇵 日本語 (Japanese) | `ja` | 570+ entradas |
| 🇨🇳 中文简体 (Chinese Simplified) | `zh-CN` | 570+ entradas |
| 🇹🇼 中文繁體 (Chinese Traditional) | `zh-TW` | 570+ entradas |
| 🇪🇸 Español (Spanish) | `es` | 570+ entradas |
| 🇫🇷 Français (French) | `fr` | 570+ entradas |
| 🇩🇪 Deutsch (German) | `de` | 570+ entradas |
| 🇧🇷 Português (Brazilian) | `pt-BR` | 570+ entradas |
| 🇷🇺 Русский (Russian) | `ru` | 570+ entradas |
| 🇻🇳 Tiếng Việt (Vietnamese) | `vi` | 570+ entradas |

### Estándar — Google Translate + Verificación IA

🇵🇹 Português (PT) · 🇮🇹 Italiano · 🇳🇱 Nederlands · 🇵🇱 Polski · 🇺🇦 Українська · 🇨🇿 Čeština · 🇸🇪 Svenska · 🇩🇰 Dansk · 🇫🇮 Suomi · 🇳🇴 Norsk · 🇹🇷 Türkçe · 🇸🇦 العربية · 🇮🇳 हिन्दी · 🇹🇭 ภาษาไทย · 🇮🇩 Bahasa Indonesia · 🇲🇾 Bahasa Melayu · 🇵🇭 Filipino · 🇧🇩 বাংলা · 🇮🇱 עברית · 🇷🇴 Română · 🇭🇺 Magyar · 🇬🇷 Ελληνικά

> ¿Quieres agregar tu idioma como Premium? Contribuye un diccionario curado — ver [CONTRIBUTING.md](../../CONTRIBUTING.md).

## Arquitectura

```
skillbridge/
├── manifest.json              # Manifiesto Chrome MV3
├── _locales/                  # Chrome i18n (en, ko, ja, zh_CN)
├── src/
│   ├── background/            # Proxy de Google Translate API
│   ├── bridge/                # Puente de IA Puter.js (Gemini, Claude)
│   ├── content/               # Traducción DOM + UI de barra lateral + fuentes
│   ├── popup/                 # UI de popup de extensión
│   ├── lib/                   # Motor de traducción, subtítulos, constantes
│   └── data/                  # Diccionarios curados (10 idiomas × 570+)
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
| Diccionarios Curados | JSON ajustado manualmente (570+ × 10 idiomas) |
| Caché de Traducción | IndexedDB |
| Renderizado de Fuentes CJK | Google Fonts Noto Sans |

> **Construido con [Claude Code](https://docs.anthropic.com/en/docs/claude-code).**
> Este proyecto — desde el diseño de arquitectura e implementación de características hasta depuración y el GIF de demostración — fue desarrollado usando Claude Code como socio de programación en pareja de IA.

## Filosofía de Traducción

El diccionario de cada idioma se cura cuidadosamente para sonar natural a los hablantes nativos. Nos alineamos con los [documentos multilingües oficiales de Anthropic](https://docs.anthropic.com) como línea de base, pero las convenciones comunitarias también importan — si los desarrolladores hispanohablantes dicen "prompt" en lugar de "aviso rápido", eso es lo que usamos.

¿No estás de acuerdo con una elección de término? Ese es exactamente el tipo de PR que queremos — ver [CONTRIBUTING.md](../../CONTRIBUTING.md).

> [!IMPORTANT]
> **Dale estrella a este repositorio** para recibir notificaciones de nuevas funciones y actualizaciones de idiomas.

## Contribuir

**¡Se buscan hablantes nativos!** La forma más impactante de contribuir es mejorar el diccionario de traducción de tu idioma — no se requiere código, solo editar un archivo JSON. Incluso corregir una mala traducción ayuda a todos los estudiantes que usan ese idioma.

Consulta [CONTRIBUTING.md](../../CONTRIBUTING.md) para la guía completa y [Good First Issues](https://github.com/heznpc/skillbridge/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22) para empezar.

## Descargo de Responsabilidad

SkillBridge es una herramienta de traducción personal, similar a la función de traducción integrada de tu navegador. El texto se traduce sobre la marcha en tu navegador — nunca se almacena ni redistribuye.

> **SkillBridge for Anthropic Academy** es un proyecto comunitario no oficial. No está afiliado con, ni respaldado o patrocinado por Anthropic. "Anthropic", "Claude" y "Skilljar" son marcas registradas de sus respectivos propietarios.

## Licencia

[MIT](../../LICENSE)
