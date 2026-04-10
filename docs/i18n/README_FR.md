<div align="center">

🌐 [English](../../README.md) · [한국어](README_KO.md) · [日本語](README_JA.md) · [中文](README_ZH-CN.md) · [Español](README_ES.md) · **Français** · [Deutsch](README_DE.md)

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

**Traduisez Anthropic Academy dans votre langue — instantanément.**

Brisez la barrière de la langue sur les cours IA gratuits d'Anthropic.

[Installer](#installation) · [Signaler un bogue](https://github.com/heznpc/skillbridge/issues) · [Demander une fonctionnalité](https://github.com/heznpc/skillbridge/issues)

</div>

---

<div align="center">

<img src="../../assets/screenshots/skillbridge-demo.gif" alt="Démo SkillBridge — traduction d'Anthropic Academy en temps réel" width="720" />

*Installez SkillBridge, visitez Anthropic Academy, et toute la page est traduite instantanément.*

</div>

---

## Le Problème

[Anthropic Academy](https://anthropic.skilljar.com/) est le meilleur endroit pour apprendre Claude, l'ingénierie de prompts et la sécurité de l'IA — gratuitement. SkillBridge rend ces cours accessibles à tous, quelle que soit la langue.

Mais les cours sont **disponibles uniquement en anglais**, et les traducteurs génériques ne suffisent pas :

| | Google Translate (page) | SkillBridge |
|---|---|---|
| Terminologie IA | ❌ « Prompt » → « Rapide » (erreur) | ✅ « Prompt » → « Prompt » (correct) |
| Précision technique | ❌ Traduction automatique générique | ✅ 570+ termes curés + vérification IA |
| Aide contextuelle | ❌ Aucune | ✅ Tuteur IA répond à vos questions sur la leçon |
| Sous-titres vidéo | ❌ Bascule manuelle distincte | ✅ Sous-titres automatiquement traduits |
| Préservation de l'interface | ❌ Casse les cases à cocher, les barres de progression | ✅ Préserve tous les éléments interactifs |
| Coût | Gratuit | Gratuit — aucune clé API nécessaire |

> **Pas de clés API. Pas de frais. Installez et apprenez.**

## Démarrage Rapide

1. Installez l'extension ([voir ci-dessous](#installation))
2. Visitez [Anthropic Academy](https://anthropic.skilljar.com/)
3. SkillBridge traduit toute la page automatiquement

C'est tout.

## Fonctionnalités

### 🌐 Traduction de Page Complète

Chaque élément de texte sur la page est traduit, avec une terminologie spécifique à l'IA gérée correctement via des dictionnaires curés. Les cases de progression, les icônes, la navigation et les polices CJK restent intactes.

<div align="center">
<img src="../../assets/screenshots/01-lesson-translated.png" alt="Page de leçon avec programme entièrement traduit" width="720" />
<br/>
<em>Page de leçon avec programme entièrement traduit — éléments d'interface préservés.</em>
</div>

### 🤖 Tuteur IA

Un chatbot de barre latérale alimenté par **Claude Sonnet 4** via [Puter.js](https://docs.puter.com/). Il sait quel cours et quelle leçon vous suivez. Posez des questions dans votre langue, obtenez des réponses en streaming.

### 🎬 Sous-titres Automatiques

Les vidéos de cours activent automatiquement les sous-titres traduits lorsque vous les lisez — aucune bascule manuelle nécessaire.

### 🔍 Détection Intelligente

Détecte la langue de votre navigateur à la première visite et offre une traduction. Aucune configuration nécessaire.

### 🛡️ Termes Protégés

Les outils de traduction génériques **traduisent souvent mal les noms de marques et les termes techniques**. SkillBridge corrige automatiquement ces erreurs après la traduction :

<div align="center">

| Avant (Google Translate) | Après (SkillBridge) |
|:---:|:---:|
| ❌ Cours anthropologiques | ✅ Cours Anthropic |
| ❌ Claude | ✅ Claude |
| ❌ Ingénierie rapide | ✅ Ingénierie des prompts |

</div>

<div align="center">
<img src="../../assets/screenshots/catalog-translated.png" alt="Catalogue de cours Anthropic Academy traduit en coréen avec une terminologie correcte" width="720" />
<br/>
<em>Catalogue de cours traduit en coréen — noms de marque et termes IA conservés avec précision.</em>
</div>

## Installation

> Publication sur le Chrome Web Store bientôt — mettez une étoile à ce dépôt pour être notifié.

**Installation manuelle** (mode développeur) :

```bash
git clone https://github.com/heznpc/skillbridge.git
```

1. Ouvrez `chrome://extensions/` dans Chrome
2. Activez le **Mode développeur** (bascule en haut à droite)
3. Cliquez sur **Charger l'extension non empaquetée** → sélectionnez le dossier cloné
4. Visitez [anthropic.skilljar.com](https://anthropic.skilljar.com/) et commencez à apprendre !

Fonctionne aussi dans Edge, Brave, Arc et autres navigateurs basés sur Chromium.

## Comment ça Marche

SkillBridge utilise un **moteur de traduction à cinq niveaux** qui priorise la vitesse et la précision :

```
Texte de page
  │
  ├─ Dictionnaire de 570+ termes curés ──→ Instantané (termes IA traduits correctement)
  │
  ├─ Cache local (IndexedDB) ───────→ Instantané (précédemment vérifié)
  │
  ├─ Contient des balises HTML inline ? (<strong>, <a>, <code>...)
  │     └─ Oui → Gemini 2.0 Flash traduit en préservant les balises
  │
  └─ Texte brut → Google Translate ─→ ~200ms
       │
       ├─ Correction automatique des Termes Protégés ─→ Restaure les marques/termes techniques que GT traduit mal
       │
       └─ Phrase complexe ? → Gemini 2.0 Flash vérifie → corrige si nécessaire
```

Les demandes de traduction sont envoyées à Google Translate et aux APIs Gemini/Claude via [Puter.js](https://docs.puter.com/) — aucune donnée n'est stockée sur nos serveurs, et aucun compte ou clé API n'est requis.

## Langues Supportées

### Premium — Dictionnaire Curé + Google Translate + Vérification IA

| Langue | Code | Dictionnaire |
|--------|------|------------|
| 🇰🇷 한국어 (Korean) | `ko` | 570+ entrées |
| 🇯🇵 日本語 (Japanese) | `ja` | 570+ entrées |
| 🇨🇳 中文简体 (Chinese Simplified) | `zh-CN` | 570+ entrées |
| 🇹🇼 中文繁體 (Chinese Traditional) | `zh-TW` | 570+ entrées |
| 🇪🇸 Español (Spanish) | `es` | 570+ entrées |
| 🇫🇷 Français (French) | `fr` | 570+ entrées |
| 🇩🇪 Deutsch (German) | `de` | 570+ entrées |
| 🇧🇷 Português (Brazilian) | `pt-BR` | 570+ entrées |
| 🇷🇺 Русский (Russian) | `ru` | 570+ entrées |
| 🇻🇳 Tiếng Việt (Vietnamese) | `vi` | 570+ entrées |

### Standard — Google Translate + Vérification IA

🇵🇹 Português (PT) · 🇮🇹 Italiano · 🇳🇱 Nederlands · 🇵🇱 Polski · 🇺🇦 Українська · 🇨🇿 Čeština · 🇸🇪 Svenska · 🇩🇰 Dansk · 🇫🇮 Suomi · 🇳🇴 Norsk · 🇹🇷 Türkçe · 🇸🇦 العربية · 🇮🇳 हिन्दी · 🇹🇭 ภาษาไทย · 🇮🇩 Bahasa Indonesia · 🇲🇾 Bahasa Melayu · 🇵🇭 Filipino · 🇧🇩 বাংলা · 🇮🇱 עברית · 🇷🇴 Română · 🇭🇺 Magyar · 🇬🇷 Ελληνικά

> Vous voulez ajouter votre langue en tant que Premium ? Contribuez un dictionnaire curé — voir [CONTRIBUTING.md](../../CONTRIBUTING.md).

## Architecture

```
skillbridge/
├── manifest.json              # Manifeste Chrome MV3
├── _locales/                  # Chrome i18n (en, ko, ja, zh_CN)
├── src/
│   ├── background/            # Proxy Google Translate API
│   ├── bridge/                # Pont IA Puter.js (Gemini, Claude)
│   ├── content/               # Traduction DOM + UI de barre latérale + polices
│   ├── popup/                 # UI de popup d'extension
│   ├── lib/                   # Moteur de traduction, sous-titres, constantes
│   └── data/                  # Dictionnaires curés (10 langues × 570+)
└── assets/icons/
```

## Stack Technologique

| Composant | Technologie |
|-----------|-----------|
| Traduction de Page | Google Translate API |
| Traduction des Balises Inline | Gemini 2.0 Flash (préserve `<strong>`, `<a>`, `<code>`) |
| Vérification de Qualité | Gemini 2.0 Flash via [Puter.js](https://docs.puter.com/) |
| Termes Protégés | Correction automatique des erreurs de marque/termes techniques GT par langue |
| Tuteur IA | Claude Sonnet 4 via Puter.js |
| Dictionnaires Curés | JSON ajusté manuellement (570+ × 10 langues) |
| Cache de Traduction | IndexedDB |
| Rendu des Polices CJK | Google Fonts Noto Sans |

> **Construit avec [Claude Code](https://docs.anthropic.com/en/docs/claude-code).**
> Ce projet — de la conception de l'architecture et de la mise en œuvre des fonctionnalités au débogage et au GIF de démonstration — a été développé en utilisant Claude Code comme partenaire de programmation en binôme IA.

## Philosophie de Traduction

Le dictionnaire de chaque langue est curé pour sonner naturel aux locuteurs natifs. Nous nous alignons sur la [documentation multilingue officielle d'Anthropic](https://docs.anthropic.com) comme référence, mais les conventions communautaires comptent aussi — si les développeurs francophones disent « prompt » au lieu de « demande », c'est ce que nous utilisons.

Vous n'êtes pas d'accord avec un choix de terme ? C'est exactement le type de PR que nous voulons — voir [CONTRIBUTING.md](../../CONTRIBUTING.md).

> [!IMPORTANT]
> **Mettez une étoile à ce dépôt** pour être notifié des nouvelles fonctionnalités et mises à jour de langues.

## Contribuer

**Locuteurs natifs recherchés !** La façon la plus impactante de contribuer est d'améliorer le dictionnaire de traduction de votre langue — aucun code requis, il suffit d'éditer un fichier JSON. Même corriger une mauvaise traduction aide tous les apprenants utilisant cette langue.

Consultez [CONTRIBUTING.md](../../CONTRIBUTING.md) pour le guide complet et [Good First Issues](https://github.com/heznpc/skillbridge/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22) pour commencer.

## Clause de Non-responsabilité

SkillBridge est un outil de traduction personnel, similaire à la fonction de traduction intégrée de votre navigateur. Le texte est traduit à la volée dans votre navigateur — jamais stocké ou redistribué.

> **SkillBridge for Anthropic Academy** est un projet communautaire non officiel. Il n'est pas affilié à Anthropic, n'est pas approuvé ou sponsorisé par Anthropic. « Anthropic », « Claude » et « Skilljar » sont des marques commerciales de leurs propriétaires respectifs.

## Licence

[MIT](../../LICENSE)
