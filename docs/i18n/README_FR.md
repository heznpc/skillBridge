<div align="center">

🌐 [English](../../README.md) · [한국어](README_KO.md) · [日本語](README_JA.md) · [中文](README_ZH-CN.md) · [Español](README_ES.md) · **Français** · [Deutsch](README_DE.md)

</div>

---

<div align="center">

<img src="../../assets/icons/icon128.png" alt="SkillBridge" width="80" />

# SkillBridge for Anthropic Academy

[![MIT License](https://img.shields.io/badge/License-MIT-green.svg)](../../LICENSE)
[![Chrome MV3](https://img.shields.io/badge/Chrome-Extension_MV3-blue.svg)](https://developer.chrome.com/docs/extensions/)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](../../CONTRIBUTING.md)

**Brisez la barrière de la langue sur les cours IA gratuits d'Anthropic.**

[Installer](#installation) · [Signaler un bogue](../../issues) · [Demander une fonctionnalité](../../issues)

</div>

---

<div align="center">

<img src="../../assets/screenshots/skillbridge-demo.gif" alt="Démo SkillBridge — traduction d'Anthropic Academy en temps réel" width="720" />

*Installez SkillBridge, visitez Anthropic Academy, et toute la page est traduite instantanément.*

</div>

---

## Pourquoi SkillBridge?

Les [cours Anthropic Academy](https://anthropic.skilljar.com/) offrent une formation de premier ordre sur Claude, l'ingénierie de prompts et la sécurité de l'IA — **mais uniquement en anglais.**

Vous pouvez penser : *« Je vais juste utiliser Google Translate. »* Voici pourquoi ce n'est pas suffisant :

| | Google Translate (page) | SkillBridge |
|---|---|---|
| Terminologie IA | ❌ « Prompt » → « Rapide » (erreur) | ✅ « Prompt » → « Prompt » (correct) |
| Précision technique | ❌ Traduction automatique générique | ✅ 560+ termes curés manuellement par langue + correction automatique des termes protégés + vérification IA Gemini |
| Aide contextuelle | ❌ Aucune | ✅ Tuteur IA (Claude Sonnet 4) répond à vos questions sur la leçon |
| Sous-titres vidéo | ❌ Bascule manuelle distincte | ✅ Sous-titres automatiquement traduits dans votre langue |
| Préservation de l'interface | ❌ Casse les cases à cocher, les barres de progression | ✅ Préserve tous les éléments interactifs |
| Coût | Gratuit | Gratuit — aucune clé API nécessaire |

> **Pas de clés API. Pas de frais. Installez et apprenez.**

### Termes Protégés en Action

Les outils de traduction de page génériques **mistradent souvent les noms de marques et les termes techniques**. Par exemple, Google Translate rend « Anthropic Courses » comme « Cours anthropologiques » en français — complètement faux.

Le moteur **Termes Protégés** de SkillBridge corrige automatiquement ces erreurs après la traduction, gardant les noms de marque comme « Anthropic » et « Claude » et les termes techniques intacts :

<div align="center">

| Avant (Google Translate uniquement) | Après (SkillBridge Termes Protégés) |
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

## Voyez-le en action

### Traduction de Page Complète

Chaque élément de texte sur la page est traduit, avec une terminologie spécifique à l'IA gérée correctement via des dictionnaires curés. Les cases de progression, les icônes et la navigation restent intactes.

<div align="center">
<img src="../../assets/screenshots/01-lesson-translated.png" alt="Page de leçon avec programme entièrement traduit" width="720" />
<br/>
<em>Page de leçon avec programme entièrement traduit — éléments d'interface préservés.</em>
</div>

### Tuteur IA

Un chatbot de barre latérale alimenté par **Claude Sonnet 4** via [Puter.js](https://docs.puter.com/). Il sait quel cours et quelle leçon vous suivez. Posez des questions dans votre langue, obtenez des réponses en streaming.

<!-- TODO: ai-tutor.png ajouter et décommenter
<div align="center">
<img src="../../assets/screenshots/ai-tutor.png" alt="Barre latérale du tuteur IA répondant à une question en coréen" width="720" />
<br/>
<em>Posez une question au tuteur IA sur la leçon — alimenté par Claude Sonnet 4.</em>
</div>
-->

### Sous-titres Automatiques

Les vidéos de cours activent automatiquement les sous-titres traduits lorsque vous les lisez — aucune bascule manuelle nécessaire.

<!-- <div align="center">
<img src="../../assets/screenshots/subtitles.png" alt="Vidéo YouTube avec sous-titres coréens traduits automatiquement" width="720" />
<br/>
<em>Les sous-titres vidéo sont automatiquement traduits dans votre langue.</em>
</div> -->

## Comment ça marche

SkillBridge utilise un **moteur de traduction à cinq niveaux** qui priorise la vitesse et la précision :

```
Texte de page
  │
  ├─ Dictionnaire de 560+ termes curés ──→ Instantané (termes IA traduits correctement)
  │
  ├─ Cache local (IndexedDB) ───────→ Instantané (précédemment vérifié)
  │
  ├─ Contient des balises HTML inline? (<strong>, <a>, <code>...)
  │     └─ Oui → Gemini 2.0 Flash traduit en préservant les balises
  │
  └─ Texte brut → Google Translate ─→ ~200ms
       │
       ├─ Correction automatique des Termes Protégés ─→ Restaure les marques/termes techniques que GT mistraduit
       │
       └─ Phrase complexe? → Gemini 2.0 Flash vérifie → corrige si nécessaire
```

**Termes Protégés** — Chaque langue définit les erreurs connues de GT (exemple : GT traduit « Claude » → « Claude » en français). Après l'exécution de GT, l'extension autocorrige automatiquement ceux-ci à la forme correcte. Les noms de marques, les termes techniques et la hiérarchie des produits restent en anglais — correspondent à la [documentation multilingue officielle d'Anthropic](https://docs.anthropic.com).

Toute la traduction se déroule **dans votre navigateur** — rien n'est stocké ou envoyé à des serveurs tiers.

## Fonctionnalités

**🌐 Traduction de Page Complète** — Chaque élément de texte sur la page est traduit, avec une terminologie spécifique à l'IA gérée correctement via des dictionnaires curés.

**🤖 Tuteur IA** — Un chatbot de barre latérale alimenté par Claude Sonnet 4 via [Puter.js](https://docs.puter.com/). Il sait quel cours et quelle leçon vous suivez. Posez des questions dans votre langue, obtenez des réponses en streaming.

**🎬 Sous-titres Automatiques** — Les vidéos de cours activent automatiquement les sous-titres traduits lorsque vous les lisez.

**🔍 Détection Intelligente** — Détecte la langue de votre navigateur à la première visite et offre une traduction. Aucune configuration nécessaire.

**✨ Interface Fidèle** — Les cases de progression, les icônes et la navigation restent intactes. Les polices CJK sont adaptées au design original.

## Langues Supportées

### Premium — Dictionnaire Curé + Google Translate + Vérification IA

| Langue | Code | Dictionnaire |
|--------|------|------------|
| 🇰🇷 한국어 (Korean) | `ko` | 560+ entrées |
| 🇯🇵 日本語 (Japanese) | `ja` | 560+ entrées |
| 🇨🇳 中文简体 (Chinese Simplified) | `zh-CN` | 560+ entrées |
| 🇪🇸 Español (Spanish) | `es` | 560+ entrées |
| 🇫🇷 Français (French) | `fr` | 560+ entrées |
| 🇩🇪 Deutsch (German) | `de` | 560+ entrées |

### Standard — Google Translate + Vérification IA

🇹🇼 中文繁體 · 🇧🇷 Português (BR) · 🇵🇹 Português (PT) · 🇮🇹 Italiano · 🇳🇱 Nederlands · 🇷🇺 Русский · 🇵🇱 Polski · 🇺🇦 Українська · 🇨🇿 Čeština · 🇸🇪 Svenska · 🇩🇰 Dansk · 🇫🇮 Suomi · 🇳🇴 Norsk · 🇹🇷 Türkçe · 🇸🇦 العربية · 🇮🇳 हिन्दी · 🇹🇭 ภาษาไทย · 🇻🇳 Tiếng Việt · 🇮🇩 Bahasa Indonesia · 🇲🇾 Bahasa Melayu · 🇵🇭 Filipino · 🇧🇩 বাংলা · 🇮🇱 עברית · 🇷🇴 Română · 🇭🇺 Magyar · 🇬🇷 Ελληνικά

> Vous voulez ajouter votre langue en tant que Premium? Contribuez un dictionnaire curé — voir [CONTRIBUTING.md](../../CONTRIBUTING.md).

## Installation

<!-- **Chrome Web Store** (recommandé) : [Installer SkillBridge](https://chrome.google.com/webstore/) — bientôt disponible -->

**Installation manuelle** (mode développeur) :

```bash
git clone https://github.com/heznpc/skillbridge.git
```

1. Ouvrez `chrome://extensions/` dans Chrome
2. Activez le **Mode développeur** (bascule en haut à droite)
3. Cliquez sur **Charger l'extension non empaquetée** → sélectionnez le dossier cloné
4. Visitez [anthropic.skilljar.com](https://anthropic.skilljar.com/) et commencez à apprendre!

## Architecture

```
skillbridge/
├── manifest.json              # Manifeste Chrome MV3
├── _locales/                  # Chrome i18n (en, ko, ja, zh_CN)
├── src/
│   ├── background/            # Proxy Google Translate API
│   ├── content/               # Traduction DOM + UI de barre latérale + polices
│   ├── popup/                 # UI de popup d'extension
│   ├── lib/                   # Moteur de traduction, pont IA, sous-titres
│   └── data/                  # Dictionnaires curés (6 langues × 560+)
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
| Dictionnaires Curés | JSON ajusté manuellement (560+ × 6 langues) |
| Cache de Traduction | IndexedDB |
| Rendu des Polices CJK | Google Fonts Noto Sans |

> **Construit avec [Claude Code](https://docs.anthropic.com/en/docs/claude-code).**
> Ce projet — de la conception de l'architecture et de la mise en œuvre des fonctionnalités à la configuration du pipeline CI/CD, aux tests unitaires, au débogage et même au GIF de démonstration — a été développé en utilisant Claude Code comme partenaire de programmation en binôme IA.

## Philosophie de Traduction

Le dictionnaire de chaque langue est curé pour sonner naturel aux locuteurs natifs. Nous nous alignons actuellement sur la [documentation multilingue officielle d'Anthropic](https://docs.anthropic.com) comme référence, mais les conventions communautaires comptent aussi — si les développeurs francophones disent « prompt » au lieu de « demande », c'est ce que nous utilisons.

Vous n'êtes pas d'accord avec un choix de terme? C'est exactement le type de PR que nous voulons — voir [CONTRIBUTING.md](../../CONTRIBUTING.md) pour améliorer le dictionnaire de votre langue.

## Contribuer

**Locuteurs natifs recherchés!** La façon la plus impactante de contribuer est d'améliorer le dictionnaire de traduction de votre langue — aucun code requis, il suffit d'éditer un fichier JSON. Même corriger une mauvaise traduction aide tous les apprenants utilisant cette langue.

Consultez [CONTRIBUTING.md](../../CONTRIBUTING.md) pour le guide complet, [Good First Issues](../../issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22) pour commencer, et [ROADMAP.md](../../docs/ROADMAP.md) pour voir où ce projet se dirige.

## Clause de non-responsabilité

SkillBridge est un outil de traduction personnel, similaire à la fonction de traduction intégrée de votre navigateur. Le texte est traduit à la volée dans votre navigateur — jamais stocké ou redistribué.

> **SkillBridge for Anthropic Academy** est un projet communautaire non officiel. Il n'est pas affilié à Anthropic, n'est pas approuvé ou sponsorisé par Anthropic. « Anthropic », « Claude » et « Skilljar » sont des marques commerciales de leurs propriétaires respectifs.

## Licence

[MIT](../../LICENSE)
