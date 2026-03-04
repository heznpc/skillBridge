<div align="center">

🌐 [English](../../README.md) · [한국어](README_KO.md) · [日本語](README_JA.md) · [中文](README_ZH-CN.md) · [Español](README_ES.md) · [Français](README_FR.md) · **Deutsch**

</div>

---

<div align="center">

<img src="../../assets/icons/icon128.png" alt="SkillBridge" width="80" />

# SkillBridge for Anthropic Academy

[![MIT License](https://img.shields.io/badge/License-MIT-green.svg)](../../LICENSE)
[![Chrome MV3](https://img.shields.io/badge/Chrome-Extension_MV3-blue.svg)](https://developer.chrome.com/docs/extensions/)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](../../CONTRIBUTING.md)

**Überwindung der Sprachbarriere bei Anthropics kostenlosen KI-Kursen.**

[Installation](#installation) · [Fehler melden](../../issues) · [Funktion anfordern](../../issues)

</div>

---

<div align="center">

<img src="../../assets/screenshots/skillbridge-demo.gif" alt="SkillBridge Demo — Anthropic Academy in Echtzeit übersetzen" width="720" />

*Installiere SkillBridge, besuche Anthropic Academy, und die gesamte Seite wird sofort übersetzt.*

</div>

---

## Warum SkillBridge?

Die [Anthropic Academy](https://anthropic.skilljar.com/) bietet erstklassige kostenlose Schulungen zu Claude, Prompt Engineering und KI-Sicherheit — **aber nur auf Englisch.**

Sie könnten denken: *„Ich verwende einfach Google Translate."* Hier ist der Grund, warum das nicht ausreicht:

| | Google Translate (Seite) | SkillBridge |
|---|---|---|
| KI-Terminologie | ❌ „Prompt" → „Aufforderung" (falsch) | ✅ „Prompt" → „Prompt" (korrekt) |
| Technische Genauigkeit | ❌ Generische maschinelle Übersetzung | ✅ 560+ handverlesene Begriffe pro Sprache + automatische Korrektur geschützter Begriffe + Gemini AI-Verifizierung |
| Kontextbewusste Hilfe | ❌ Keine | ✅ KI-Tutor (Claude Sonnet 4) beantwortet Fragen zur Lektion |
| Video-Untertitel | ❌ Separate manuelle Umschaltung | ✅ Automatisch übersetzte Untertitel in Ihrer Sprache |
| UI-Erhaltung | ❌ Zerstört Kontrollkästchen, Fortschrittsbalken | ✅ Behält alle interaktiven Elemente |
| Kosten | Kostenlos | Kostenlos — keine API-Schlüssel erforderlich |

> **Keine API-Schlüssel. Keine Kosten. Einfach installieren und lernen.**

### Geschützte Begriffe in Aktion

Generische Seitenübersetzungstools übersetzen häufig **Markennamen und technische Begriffe falsch**. Google Translate gibt beispielsweise „Anthropic Courses" mit „Anthropologische Kurse" wieder — völlig falsch.

SkillBridges **Geschützte Begriffe**-Engine korrigiert diese Fehler nach der Übersetzung automatisch und behält Markennamen wie „Anthropic" und „Claude" sowie technische Begriffe bei:

<div align="center">

| Vorher (nur Google Translate) | Nachher (SkillBridge geschützte Begriffe) |
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

## Sehen Sie es in Aktion

### Vollständige Seitenübersetzung

Jedes Textelement auf der Seite wird übersetzt, wobei KI-spezifische Begriffe über kuratierte Wörterbücher korrekt verwaltet werden. Fortschrittsfelder, Symbole und Navigation bleiben erhalten.

<div align="center">
<img src="../../assets/screenshots/01-lesson-translated.png" alt="Lektionsseite mit vollständig übersetztem Curriculum" width="720" />
<br/>
<em>Lektionsseite mit vollständig übersetztem Curriculum — UI-Elemente bleiben erhalten.</em>
</div>

### KI-Tutor

Ein von **Claude Sonnet 4** betriebener Seitenleisten-Chatbot über [Puter.js](https://docs.puter.com/). Er kennt Ihren aktuellen Kurs und Ihre Lektion. Stellen Sie Fragen in Ihrer Sprache und erhalten Sie Stream-Antworten.

<!-- TODO: ai-tutor.png hinzufügen und Kommentar entfernen
<div align="center">
<img src="../../assets/screenshots/ai-tutor.png" alt="KI-Tutor-Seitenleiste antwortet auf eine Frage auf Koreanisch" width="720" />
<br/>
<em>Fragen Sie den KI-Tutor zur Lektion — betrieben von Claude Sonnet 4.</em>
</div>
-->

### Automatische Untertitel

Kursvideos aktivieren automatisch übersetzte Untertitel, wenn Sie diese abspielen — keine manuelle Umschaltung erforderlich.

<!-- <div align="center">
<img src="../../assets/screenshots/subtitles.png" alt="YouTube-Video mit automatisch übersetzten koreanischen Untertiteln" width="720" />
<br/>
<em>Video-Untertitel werden automatisch in Ihre Sprache übersetzt.</em>
</div> -->

## Wie es funktioniert

SkillBridge verwendet eine **fünfstufige Übersetzungs-Engine**, die Geschwindigkeit und Genauigkeit priorisiert:

```
Seitentext
  │
  ├─ 560+ kuratierte Begriffe-Wörterbuch ──→ Sofort (KI-Begriffe korrekt übersetzt)
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

**Geschützte Begriffe** — Jede Sprache definiert bekannte GT-Fehler (Beispiel: GT übersetzt „Claude" → „Klaud" auf Deutsch). Nach der GT-Ausführung korrigiert die Erweiterung diese automatisch in die richtige Form. Markennamen, technische Begriffe und Produkthierarchie bleiben auf Englisch — entsprechend [Anthropics offizieller mehrsprachiger Dokumentation](https://docs.anthropic.com).

Alle Übersetzungen finden **in Ihrem Browser** statt — nichts wird an Drittanbieterserver gesendet oder gespeichert.

## Funktionen

**🌐 Vollständige Seitenübersetzung** — Jedes Textelement auf der Seite wird übersetzt, mit KI-spezifischen Begriffen korrekt über kuratierte Wörterbücher verwaltet.

**🤖 KI-Tutor** — Ein von Claude Sonnet 4 betriebener Seitenleisten-Chatbot über [Puter.js](https://docs.puter.com/). Er kennt Ihren aktuellen Kurs und Ihre Lektion. Stellen Sie Fragen in Ihrer Sprache und erhalten Sie Stream-Antworten.

**🎬 Automatische Untertitel** — Kursvideos aktivieren automatisch übersetzte Untertitel, wenn Sie diese abspielen.

**🔍 Intelligente Erkennung** — Erkennt Ihre Browsersprache bei Ihrem ersten Besuch und bietet Übersetzung an. Keine Einrichtung erforderlich.

**✨ Treue UI** — Fortschrittsfelder, Symbole und Navigation bleiben erhalten. CJK-Schriftarten entsprechen dem ursprünglichen Design.

## Unterstützte Sprachen

### Premium — Kuratiertes Wörterbuch + Google Translate + KI-Verifizierung

| Sprache | Code | Wörterbuch |
|---------|------|-----------|
| 🇰🇷 한국어 (Korean) | `ko` | 560+ Einträge |
| 🇯🇵 日本語 (Japanese) | `ja` | 560+ Einträge |
| 🇨🇳 中文简体 (Chinese Simplified) | `zh-CN` | 560+ Einträge |
| 🇪🇸 Español (Spanish) | `es` | 560+ Einträge |
| 🇫🇷 Français (French) | `fr` | 560+ Einträge |
| 🇩🇪 Deutsch (German) | `de` | 560+ Einträge |

### Standard — Google Translate + KI-Verifizierung

🇹🇼 中文繁體 · 🇧🇷 Português (BR) · 🇵🇹 Português (PT) · 🇮🇹 Italiano · 🇳🇱 Nederlands · 🇷🇺 Русский · 🇵🇱 Polski · 🇺🇦 Українська · 🇨🇿 Čeština · 🇸🇪 Svenska · 🇩🇰 Dansk · 🇫🇮 Suomi · 🇳🇴 Norsk · 🇹🇷 Türkçe · 🇸🇦 العربية · 🇮🇳 हिन्दी · 🇹🇭 ภาษาไทย · 🇻🇳 Tiếng Việt · 🇮🇩 Bahasa Indonesia · 🇲🇾 Bahasa Melayu · 🇵🇭 Filipino · 🇧🇩 বাংলা · 🇮🇱 עברית · 🇷🇴 Română · 🇭🇺 Magyar · 🇬🇷 Ελληνικά

> Möchten Sie Ihre Sprache als Premium hinzufügen? Tragen Sie ein kuratiertes Wörterbuch bei — siehe [CONTRIBUTING.md](../../CONTRIBUTING.md).

## Installation

<!-- **Chrome Web Store** (empfohlen): [Installieren Sie SkillBridge](https://chrome.google.com/webstore/) — bald verfügbar -->

**Manuelle Installation** (Entwicklermodus):

```bash
git clone https://github.com/heznpc/skillbridge.git
```

1. Öffnen Sie `chrome://extensions/` in Chrome
2. Aktivieren Sie den **Entwicklermodus** (Umschalter oben rechts)
3. Klicken Sie auf **Entpackte Erweiterung laden** → wählen Sie den geklonten Ordner
4. Besuchen Sie [anthropic.skilljar.com](https://anthropic.skilljar.com/) und beginnen Sie zu lernen!

## Architektur

```
skillbridge/
├── manifest.json              # Chrome MV3 Manifest
├── _locales/                  # Chrome i18n (en, ko, ja, zh_CN)
├── src/
│   ├── background/            # Google Translate API Proxy
│   ├── content/               # DOM-Übersetzung + Seitenleisten-UI + Schriftarten
│   ├── popup/                 # Erweiterungs-Popup-UI
│   ├── lib/                   # Übersetzungs-Engine, KI-Brücke, Untertitel
│   └── data/                  # Kuratierte Wörterbücher (6 Sprachen × 560+)
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
| Kuratierte Wörterbücher | Manuell angepasstes JSON (560+ × 6 Sprachen) |
| Übersetzungs-Cache | IndexedDB |
| CJK-Schriftartenrendering | Google Fonts Noto Sans |

> **Mit [Claude Code](https://docs.anthropic.com/en/docs/claude-code) gebaut.**
> Dieses Projekt — von der Architekturgestaltung und Funktionsimplementierung bis zur CI/CD-Pipeline-Einrichtung, Unit-Tests, Debugging und sogar der Demo-GIF — wurde unter Verwendung von Claude Code als KI-Pair-Programming-Partner entwickelt.

## Übersetzungsphilosophie

Das Wörterbuch jeder Sprache wird sorgfältig kuratiert, um natürlich für Muttersprachler zu klingen. Wir richten uns derzeit an [Anthropics offizielle mehrsprachige Dokumentation](https://docs.anthropic.com) als Grundlage, aber Community-Konventionen sind auch wichtig — wenn deutsche Entwickler „Prompt" statt „Aufforderung" sagen, ist das das, was wir verwenden.

Stimmen Sie nicht mit einer Wahl des Begriffs überein? Das ist genau die Art von PR, die wir haben möchten — siehe [CONTRIBUTING.md](../../CONTRIBUTING.md) zum Verbessern des Wörterbuchs Ihrer Sprache.

## Beitragen

**Muttersprachler gesucht!** Die wirkungsvollste Art zu beitragen, ist die Verbesserung des Übersetzungswörterbuchs Ihrer Sprache — kein Code erforderlich, nur JSON-Datei bearbeiten. Selbst das Beheben einer falschen Übersetzung hilft allen Lernenden dieser Sprache.

Siehe [CONTRIBUTING.md](../../CONTRIBUTING.md) für den vollständigen Leitfaden, [Good First Issues](../../issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22) zum Starten und [ROADMAP.md](../../docs/ROADMAP.md) zum Sehen der Projektrichtung.

## Haftungsausschluss

SkillBridge ist ein persönliches Übersetzungstool, ähnlich der integrierten Übersetzungsfunktion Ihres Browsers. Der Text wird in Echtzeit in Ihrem Browser übersetzt — wird niemals gespeichert oder weitergegeben.

> **SkillBridge for Anthropic Academy** ist ein inoffizielles Community-Projekt. Es ist nicht mit Anthropic verbunden und wird nicht von Anthropic genehmigt oder gesponsert. „Anthropic", „Claude" und „Skilljar" sind Marken ihrer jeweiligen Eigentümer.

## Lizenz

[MIT](../../LICENSE)
