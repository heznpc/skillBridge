<div align="center">

🌐 [English](../../README.md) · [한국어](README_KO.md) · [日本語](README_JA.md) · [中文](README_ZH-CN.md) · [Español](README_ES.md) · [Français](README_FR.md) · **Deutsch**

</div>

---

<div align="center">

<img src="../../assets/icons/icon128.png" alt="SkillBridge" width="90" />

# SkillBridge for Anthropic Academy

[![MIT License](https://img.shields.io/badge/License-MIT-green.svg)](../../LICENSE)
[![Chrome MV3](https://img.shields.io/badge/Chrome-Extension_MV3-blue.svg)](https://developer.chrome.com/docs/extensions/)
[![GitHub stars](https://img.shields.io/github/stars/heznpc/skillbridge?style=social)](https://github.com/heznpc/skillbridge/stargazers)
[![GitHub contributors](https://img.shields.io/github/contributors/heznpc/skillbridge)](https://github.com/heznpc/skillbridge/graphs/contributors)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](../../CONTRIBUTING.md)

**Übersetzen Sie Anthropic Academy in Ihre Sprache — sofort.**

Überwindung der Sprachbarriere bei Anthropics kostenlosen KI-Kursen.

[Installation](#installation) · [Fehler melden](https://github.com/heznpc/skillbridge/issues) · [Funktion anfordern](https://github.com/heznpc/skillbridge/issues)

</div>

---

<div align="center">

<img src="../../assets/screenshots/skillbridge-demo.gif" alt="SkillBridge Demo — Anthropic Academy in Echtzeit übersetzen" width="720" />

*Installieren Sie SkillBridge, besuchen Sie Anthropic Academy, und die gesamte Seite wird sofort übersetzt.*

</div>

---

## Das Problem

[Anthropic Academy](https://anthropic.skilljar.com/) ist der beste Ort, um Claude, Prompt Engineering und KI-Sicherheit zu lernen — kostenlos. SkillBridge macht diese Kurse für jeden zugänglich, unabhängig von der Sprache.

Aber die Kurse sind **nur auf Englisch verfügbar**, und generische Übersetzer reichen nicht aus:

| | Google Translate (Seite) | SkillBridge |
|---|---|---|
| KI-Terminologie | ❌ „Prompt" → „Aufforderung" (falsch) | ✅ „Prompt" → „Prompt" (korrekt) |
| Technische Genauigkeit | ❌ Generische maschinelle Übersetzung | ✅ 570+ kuratierte Begriffe + KI-Verifizierung |
| Kontextbewusste Hilfe | ❌ Keine | ✅ KI-Tutor beantwortet Fragen zur Lektion |
| Video-Untertitel | ❌ Separate manuelle Umschaltung | ✅ Automatisch übersetzte Untertitel |
| UI-Erhaltung | ❌ Zerstört Kontrollkästchen, Fortschrittsbalken | ✅ Behält alle interaktiven Elemente |
| Kosten | Kostenlos | Kostenlos — keine API-Schlüssel erforderlich |

> **Keine API-Schlüssel. Keine Kosten. Einfach installieren und lernen.**

## Schnellstart

1. Erweiterung installieren ([siehe unten](#installation))
2. [Anthropic Academy](https://anthropic.skilljar.com/) besuchen
3. SkillBridge übersetzt die gesamte Seite automatisch

Das ist alles.

## Funktionen

### 🌐 Vollständige Seitenübersetzung

Jedes Textelement auf der Seite wird übersetzt, wobei KI-spezifische Begriffe über kuratierte Wörterbücher korrekt behandelt werden. Fortschrittsfelder, Symbole, Navigation und CJK-Schriftarten bleiben erhalten.

<div align="center">
<img src="../../assets/screenshots/01-lesson-translated.png" alt="Lektionsseite mit vollständig übersetztem Curriculum" width="720" />
<br/>
<em>Lektionsseite mit vollständig übersetztem Curriculum — UI-Elemente bleiben erhalten.</em>
</div>

### 🤖 KI-Tutor

Ein von **Claude Sonnet 4** betriebener Seitenleisten-Chatbot über [Puter.js](https://docs.puter.com/). Er kennt Ihren aktuellen Kurs und Ihre Lektion. Stellen Sie Fragen in Ihrer Sprache und erhalten Sie Stream-Antworten.

### 🎬 Automatische Untertitel

Kursvideos aktivieren automatisch übersetzte Untertitel, wenn Sie diese abspielen — keine manuelle Umschaltung erforderlich.

### 🔍 Intelligente Erkennung

Erkennt Ihre Browsersprache beim ersten Besuch und bietet Übersetzung an. Keine Einrichtung erforderlich.

### 🛡️ Geschützte Begriffe

Generische Übersetzungstools übersetzen häufig **Markennamen und technische Begriffe falsch**. SkillBridge korrigiert diese Fehler nach der Übersetzung automatisch:

<div align="center">

| Vorher (Google Translate) | Nachher (SkillBridge) |
|:---:|:---:|
| ❌ Anthropologische Kurse | ✅ Anthropic Kurse |
| ❌ Klaud | ✅ Claude |
| ❌ Schnelle Ingenieurskunst | ✅ Prompt Engineering |

</div>

<div align="center">
<img src="../../assets/screenshots/catalog-translated.png" alt="Anthropic Academy-Kurskatalog ins Koreanische übersetzt mit korrekter Terminologie" width="720" />
<br/>
<em>Kurskatalog ins Koreanische übersetzt — Markennamen und KI-Begriffe bleiben korrekt.</em>
</div>

## Installation

> Chrome Web Store-Eintrag kommt bald — geben Sie diesem Repository einen Stern, um benachrichtigt zu werden.

**Manuelle Installation** (Entwicklermodus):

```bash
git clone https://github.com/heznpc/skillbridge.git
```

1. Öffnen Sie `chrome://extensions/` in Chrome
2. Aktivieren Sie den **Entwicklermodus** (Umschalter oben rechts)
3. Klicken Sie auf **Entpackte Erweiterung laden** → wählen Sie den geklonten Ordner
4. Besuchen Sie [anthropic.skilljar.com](https://anthropic.skilljar.com/) und beginnen Sie zu lernen!

Funktioniert auch in Edge, Brave, Arc und anderen Chromium-basierten Browsern.

## Wie es Funktioniert

SkillBridge verwendet eine **fünfstufige Übersetzungs-Engine**, die Geschwindigkeit und Genauigkeit priorisiert:

```
Seitentext
  │
  ├─ 570+ kuratierte Begriffe-Wörterbuch ──→ Sofort (KI-Begriffe korrekt übersetzt)
  │
  ├─ Lokaler Cache (IndexedDB) ───────→ Sofort (zuvor verifiziert)
  │
  ├─ Enthält Inline-HTML-Tags? (<strong>, <a>, <code>...)
  │     └─ Ja → Gemini 2.0 Flash übersetzt mit Tag-Erhaltung
  │
  └─ Klartext → Google Translate ─→ ~200ms
       │
       ├─ Automatische Korrektur geschützter Begriffe ─→ Stellt Marken-/Fachbegriffe wieder her, die GT falsch übersetzt
       │
       └─ Komplexer Satz? → Gemini 2.0 Flash verifiziert → korrigiert bei Bedarf
```

Übersetzungsanfragen werden über [Puter.js](https://docs.puter.com/) an Google Translate und die Gemini/Claude-APIs gesendet — es werden keine Daten auf unseren Servern gespeichert, und es ist kein Konto oder API-Schlüssel erforderlich.

## Unterstützte Sprachen

### Premium — Kuratiertes Wörterbuch + Google Translate + KI-Verifizierung

| Sprache | Code | Wörterbuch |
|---------|------|-----------|
| 🇰🇷 한국어 (Korean) | `ko` | 570+ Einträge |
| 🇯🇵 日本語 (Japanese) | `ja` | 570+ Einträge |
| 🇨🇳 中文简体 (Chinese Simplified) | `zh-CN` | 570+ Einträge |
| 🇹🇼 中文繁體 (Chinese Traditional) | `zh-TW` | 570+ Einträge |
| 🇪🇸 Español (Spanish) | `es` | 570+ Einträge |
| 🇫🇷 Français (French) | `fr` | 570+ Einträge |
| 🇩🇪 Deutsch (German) | `de` | 570+ Einträge |
| 🇧🇷 Português (Brazilian) | `pt-BR` | 570+ Einträge |
| 🇷🇺 Русский (Russian) | `ru` | 570+ Einträge |
| 🇻🇳 Tiếng Việt (Vietnamese) | `vi` | 570+ Einträge |

### Standard — Google Translate + KI-Verifizierung

🇵🇹 Português (PT) · 🇮🇹 Italiano · 🇳🇱 Nederlands · 🇵🇱 Polski · 🇺🇦 Українська · 🇨🇿 Čeština · 🇸🇪 Svenska · 🇩🇰 Dansk · 🇫🇮 Suomi · 🇳🇴 Norsk · 🇹🇷 Türkçe · 🇸🇦 العربية · 🇮🇳 हिन्दी · 🇹🇭 ภาษาไทย · 🇮🇩 Bahasa Indonesia · 🇲🇾 Bahasa Melayu · 🇵🇭 Filipino · 🇧🇩 বাংলা · 🇮🇱 עברית · 🇷🇴 Română · 🇭🇺 Magyar · 🇬🇷 Ελληνικά

> Möchten Sie Ihre Sprache als Premium hinzufügen? Tragen Sie ein kuratiertes Wörterbuch bei — siehe [CONTRIBUTING.md](../../CONTRIBUTING.md).

## Architektur

```
skillbridge/
├── manifest.json              # Chrome MV3 Manifest
├── _locales/                  # Chrome i18n (en, ko, ja, zh_CN)
├── src/
│   ├── background/            # Google Translate API Proxy
│   ├── bridge/                # Puter.js KI-Brücke (Gemini, Claude)
│   ├── content/               # DOM-Übersetzung + Seitenleisten-UI + Schriftarten
│   ├── popup/                 # Erweiterungs-Popup-UI
│   ├── lib/                   # Übersetzungs-Engine, Untertitel, Konstanten
│   └── data/                  # Kuratierte Wörterbücher (10 Sprachen × 570+)
└── assets/icons/
```

## Tech Stack

| Komponente | Technologie |
|-----------|-----------|
| Seitenübersetzung | Google Translate API |
| Inline-Tag-Übersetzung | Gemini 2.0 Flash (behält `<strong>`, `<a>`, `<code>`) |
| Qualitätsverifizierung | Gemini 2.0 Flash über [Puter.js](https://docs.puter.com/) |
| Geschützte Begriffe | Automatische Korrektur von GT-Marken-/Fachbegriff-Fehlern pro Sprache |
| KI-Tutor | Claude Sonnet 4 über Puter.js |
| Kuratierte Wörterbücher | Manuell angepasstes JSON (570+ × 10 Sprachen) |
| Übersetzungs-Cache | IndexedDB |
| CJK-Schriftartenrendering | Google Fonts Noto Sans |

> **Mit [Claude Code](https://docs.anthropic.com/en/docs/claude-code) gebaut.**
> Dieses Projekt — von der Architekturgestaltung und Funktionsimplementierung bis zum Debugging und der Demo-GIF — wurde unter Verwendung von Claude Code als KI-Pair-Programming-Partner entwickelt.

## Übersetzungsphilosophie

Das Wörterbuch jeder Sprache wird sorgfältig kuratiert, um natürlich für Muttersprachler zu klingen. Wir richten uns an [Anthropics offizielle mehrsprachige Dokumentation](https://docs.anthropic.com) als Grundlage, aber Community-Konventionen sind auch wichtig — wenn deutsche Entwickler „Prompt" statt „Aufforderung" sagen, ist das, was wir verwenden.

Stimmen Sie nicht mit einer Begriffswahl überein? Das ist genau die Art von PR, die wir haben möchten — siehe [CONTRIBUTING.md](../../CONTRIBUTING.md).

> [!IMPORTANT]
> **Geben Sie diesem Repository einen Stern**, um über neue Funktionen und Sprachaktualisierungen benachrichtigt zu werden.

## Beitragen

**Muttersprachler gesucht!** Die wirkungsvollste Art beizutragen ist die Verbesserung des Übersetzungswörterbuchs Ihrer Sprache — kein Code erforderlich, nur eine JSON-Datei bearbeiten. Selbst das Beheben einer falschen Übersetzung hilft allen Lernenden dieser Sprache.

Siehe [CONTRIBUTING.md](../../CONTRIBUTING.md) für den vollständigen Leitfaden und [Good First Issues](https://github.com/heznpc/skillbridge/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22) zum Starten.

## Haftungsausschluss

SkillBridge ist ein persönliches Übersetzungstool, ähnlich der integrierten Übersetzungsfunktion Ihres Browsers. Der Text wird in Echtzeit in Ihrem Browser übersetzt — wird niemals gespeichert oder weitergegeben.

> **SkillBridge for Anthropic Academy** ist ein inoffizielles Community-Projekt. Es ist nicht mit Anthropic verbunden und wird nicht von Anthropic genehmigt oder gesponsert. „Anthropic", „Claude" und „Skilljar" sind Marken ihrer jeweiligen Eigentümer.

## Lizenz

[MIT](../../LICENSE)
