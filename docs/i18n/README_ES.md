<div align="center">

🌐 [English](../../README.md) · [한국어](README_KO.md) · [日本語](README_JA.md) · [中文](README_ZH-CN.md) · **Español** · [Français](README_FR.md) · [Deutsch](README_DE.md)

</div>

---

<div align="center">

<img src="assets/icons/icon128.png" alt="SkillBridge" width="80" />

# SkillBridge for Anthropic Academy

[![MIT License](https://img.shields.io/badge/License-MIT-green.svg)](../../LICENSE)
[![Chrome MV3](https://img.shields.io/badge/Chrome-Extension_MV3-blue.svg)](https://developer.chrome.com/docs/extensions/)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](../../CONTRIBUTING.md)

**Elimina la barrera del idioma en los cursos gratuitos de IA de Anthropic.**

</div>

Los [cursos de Anthropic Academy](https://anthropic.skilljar.com/) ofrecen formación de primer nivel sobre Claude, ingeniería de prompts y seguridad de IA, pero solo en inglés. **SkillBridge** es una extensión de Chrome desarrollada por la comunidad que traduce toda la experiencia de aprendizaje a más de 30 idiomas, con un tutor de IA que responde tus preguntas en tiempo real.

> Sin claves API. Sin costos. Solo instala y aprende.

---

## Características

### Motor de traducción de 3 niveles

1. **Diccionario estático** — 559+ traducciones ajustadas manualmente por idioma, carga instantánea
2. **Caché IndexedDB** — traducciones verificadas anteriormente se recuperan del almacenamiento local
3. **Google Translate + verificación Gemini** — el texto restante se traduce con Google Translate, luego Gemini 2.0 Flash verifica las oraciones complejas en segundo plano

### Tutor IA (Claude Sonnet 4)

Chatbot basado en Claude Sonnet 4 a través de [Puter.js](https://docs.puter.com/). Respuestas en streaming con conciencia del contexto de la página actual.

### Traducción automática de subtítulos de YouTube

Los videos incrustados activan automáticamente los subtítulos traducidos en tu idioma seleccionado.

---

## Idiomas compatibles

### Premium (Diccionario estático + Google Translate + verificación IA)

한국어, 日本語, 中文简体, Español, Français, Deutsch — 559 entradas de diccionario estático cada uno

### Estándar (Google Translate + verificación IA)

中文繁體, Português, Italiano, Nederlands, Русский, Polski, Türkçe, العربية, हिन्दी, ภาษาไทย, Tiếng Việt, Bahasa Indonesia y 25+ idiomas más

---

## Instalación

1. Clonar: `git clone https://github.com/heznpc/skillbridge.git`
2. Chrome → `chrome://extensions/` → Activar **Modo desarrollador**
3. **Cargar extensión sin empaquetar** → seleccionar la carpeta clonada
4. Ir a [anthropic.skilljar.com](https://anthropic.skilljar.com/)

## Cómo se respeta los derechos de autor

SkillBridge es una herramienta de traducción personal, similar a la función de traducción integrada de tu navegador. El texto se traduce sobre la marcha en tu navegador. Ningún contenido se almacena ni redistribuye. Los diccionarios estáticos contienen solo cadenas de UI, no contenido del curso.

> **Descargo de responsabilidad:** SkillBridge for Anthropic Academy es un proyecto comunitario no oficial. No está afiliado con, ni respaldado o patrocinado por Anthropic. Esta extensión traduce contenido sobre la marcha para el aprendizaje personal, no almacena ni redistribuye ningún contenido del curso original. "Anthropic", "Claude" y "Skilljar" son marcas registradas de sus respectivos propietarios.

## Contribuir

SkillBridge está construido por la comunidad, para la comunidad. ¡Damos la bienvenida a contribuciones de todo tipo!

- **Mejoras de traducción** — Corregir traducciones incorrectas o agregar entradas a los diccionarios estáticos
- **Nuevos idiomas** — Agregar un idioma estándar o promover uno a premium con un diccionario curado
- **Contribuciones de código** — Mejorar el motor de traducción, AI Tutor o funciones de YouTube
- **Documentación** — Mejorar READMEs, escribir tutoriales, agregar capturas de pantalla

Consulta [CONTRIBUTING.md](../../CONTRIBUTING.md) para la guía completa. Comienza con nuestros [Good First Issues](../../issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22).

Consulta [ROADMAP.md](../ROADMAP.md) para la dirección del proyecto.

## Licencia

MIT — ver [LICENSE](../../LICENSE)

---

**Hecho para la comunidad global de aprendizaje de IA.**
