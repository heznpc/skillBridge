# SkillBridge for Anthropic Academy

[![MIT License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Chrome Extension](https://img.shields.io/badge/Chrome-Extension-blue.svg)](https://developer.chrome.com/docs/extensions/)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)
[![Good First Issues](https://img.shields.io/github/issues/heznpc/skillbridge/good%20first%20issue)](../../issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22)

**Überwindung der Sprachbarriere bei Anthropics kostenlosen KI-Kursen.**

Die [Anthropic Skilljar-Kurse](https://anthropic.skilljar.com/) bieten erstklassige kostenlose Schulungen zu Claude, Prompt Engineering und KI-Sicherheit — aber nur auf Englisch. **SkillBridge for Anthropic Academy** ist eine von der Community entwickelte Chrome-Erweiterung, die das gesamte Lernerlebnis in über 30 Sprachen übersetzt, mit einem KI-Tutor, der Ihre Fragen in Echtzeit beantwortet.

> Keine API-Schlüssel. Keine Kosten. Einfach installieren und lernen.

<p align="center">
  <img src="assets/icons/icon128.png" alt="SkillBridge" width="96" />
</p>

[English](README.md) · [한국어](README_KO.md) · [日本語](README_JA.md) · [中文](README_ZH-CN.md) · [Español](README_ES.md) · [Français](README_FR.md)

---

## Funktionen

### 3-stufige Übersetzungs-Engine

1. **Statisches Wörterbuch** — 559+ manuell optimierte Übersetzungen pro Sprache, sofort geladen
2. **IndexedDB-Cache** — zuvor verifizierte Übersetzungen werden aus dem lokalen Speicher abgerufen
3. **Google Translate + Gemini-Verifizierung** — verbleibender Text wird von Google Translate übersetzt, dann verifiziert Gemini 2.0 Flash komplexe Sätze im Hintergrund

### KI-Tutor (Claude Sonnet 4)

Chatbot basierend auf Claude Sonnet 4 über [Puter.js](https://docs.puter.com/). Streaming-Antworten mit Kontextbewusstsein der aktuellen Seite.

### Automatische YouTube-Untertitelübersetzung

Eingebettete Kursvideos aktivieren automatisch übersetzte Untertitel in Ihrer ausgewählten Sprache.

---

## Unterstützte Sprachen

### Premium (Statisches Wörterbuch + Google Translate + KI-Verifizierung)

한국어, 日本語, 中文简体, Español, Français, Deutsch — je 559 Einträge im statischen Wörterbuch

### Standard (Google Translate + KI-Verifizierung)

中文繁體, Português, Italiano, Nederlands, Русский, Polski, Türkçe, العربية, हिन्दी, ภาษาไทย, Tiếng Việt, Bahasa Indonesia und 25+ weitere Sprachen

---

## Installation

1. Klonen: `git clone https://github.com/heznpc/skillbridge.git`
2. Chrome → `chrome://extensions/` → **Entwicklermodus** aktivieren
3. **Entpackte Erweiterung laden** → geklonten Ordner auswählen
4. [anthropic.skilljar.com](https://anthropic.skilljar.com/) besuchen!

## Wie das Urheberrecht respektiert wird

SkillBridge ist ein persönliches Übersetzungstool, ähnlich der integrierten Übersetzungsfunktion Ihres Browsers. Der Text wird im Browser in Echtzeit übersetzt. Keine Inhalte werden gespeichert oder weitergegeben. Statische Wörterbücher enthalten nur UI-Strings, keine Kursinhalte.

> **Disclaimer:** SkillBridge for Anthropic Academy ist ein inoffizielles Community-Projekt. Es ist nicht mit Anthropic verbunden und wird nicht von Anthropic genehmigt oder gesponsert. Diese Erweiterung übersetzt Inhalte in Echtzeit zum persönlichen Lernen — sie speichert oder verbreitet keine ursprünglichen Kursinhalte. „Anthropic", „Claude" und „Skilljar" sind Marken ihrer jeweiligen Eigentümer.

## Beitragen

SkillBridge wird von der Community für die Community entwickelt. Wir freuen uns über Beiträge jeder Art!

- **Übersetzungsverbesserungen** — Fehlerhafte Übersetzungen korrigieren oder Einträge zu den statischen Wörterbüchern hinzufügen
- **Neue Sprachen** — Eine Standardsprache hinzufügen oder mit einem kuratierten Wörterbuch zu Premium befördern
- **Code-Beiträge** — Übersetzungsengine, AI Tutor oder YouTube-Funktionen verbessern
- **Dokumentation** — READMEs verbessern, Tutorials schreiben, Screenshots hinzufügen

Siehe [CONTRIBUTING.md](CONTRIBUTING.md) für den vollständigen Leitfaden. Starten Sie mit unseren [Good First Issues](../../issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22).

Siehe [ROADMAP.md](ROADMAP.md) für die Projektrichtung.

## Lizenz

MIT — siehe [LICENSE](LICENSE)

---

**Für die globale KI-Lerngemeinschaft entwickelt.**
