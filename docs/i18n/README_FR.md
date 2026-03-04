<div align="center">

🌐 [English](../../README.md) · [한국어](README_KO.md) · [日本語](README_JA.md) · [中文](README_ZH-CN.md) · [Español](README_ES.md) · **Français** · [Deutsch](README_DE.md)

</div>

---

<div align="center">

<img src="assets/icons/icon128.png" alt="SkillBridge" width="80" />

# SkillBridge for Anthropic Academy

[![MIT License](https://img.shields.io/badge/License-MIT-green.svg)](../../LICENSE)
[![Chrome MV3](https://img.shields.io/badge/Chrome-Extension_MV3-blue.svg)](https://developer.chrome.com/docs/extensions/)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](../../CONTRIBUTING.md)

**Brisez la barrière de la langue sur les cours IA gratuits d'Anthropic.**

</div>

Les [cours Anthropic Academy](https://anthropic.skilljar.com/) offrent une formation de premier ordre sur Claude, l'ingénierie de prompts et la sécurité de l'IA — mais uniquement en anglais. **SkillBridge** est une extension Chrome développée par la communauté qui traduit toute l'expérience d'apprentissage dans plus de 30 langues, avec un tuteur IA qui répond à vos questions en temps réel.

> Pas de clés API. Pas de frais. Installez et apprenez.

---

## Fonctionnalités

### Moteur de traduction à 3 niveaux

1. **Dictionnaire statique** — 559+ traductions ajustées manuellement par langue, chargement instantané
2. **Cache IndexedDB** — les traductions vérifiées sont récupérées du stockage local
3. **Google Translate + vérification Gemini** — le texte restant est traduit par Google Translate, puis Gemini 2.0 Flash vérifie les phrases complexes en arrière-plan

### Tuteur IA (Claude Sonnet 4)

Chatbot basé sur Claude Sonnet 4 via [Puter.js](https://docs.puter.com/). Réponses en streaming avec conscience du contexte de la page actuelle.

### Traduction automatique des sous-titres YouTube

Les vidéos intégrées activent automatiquement les sous-titres traduits dans votre langue.

---

## Langues prises en charge

### Premium (Dictionnaire statique + Google Translate + vérification IA)

한국어, 日本語, 中文简体, Español, Français, Deutsch — 559 entrées de dictionnaire statique chacune

### Standard (Google Translate + vérification IA)

中文繁體, Português, Italiano, Nederlands, Русский, Polski, Türkçe, العربية, हिन्दी, ภาษาไทย, Tiếng Việt, Bahasa Indonesia et 25+ autres langues

---

## Installation

1. Cloner : `git clone https://github.com/heznpc/skillbridge.git`
2. Chrome → `chrome://extensions/` → Activer le **Mode développeur**
3. **Charger l'extension non empaquetée** → sélectionner le dossier cloné
4. Aller sur [anthropic.skilljar.com](https://anthropic.skilljar.com/)

## Comment nous respectons le droit d'auteur

SkillBridge est un outil de traduction personnel, similaire à la fonction de traduction intégrée de votre navigateur. Le texte est traduit à la volée dans votre navigateur. Aucun contenu n'est stocké ou redistribué. Les dictionnaires statiques contiennent uniquement des chaînes d'interface, pas du contenu de cours.

> **Clause de non-responsabilité :** SkillBridge for Anthropic Academy est un projet communautaire non officiel. Il n'est pas affilié à Anthropic, n'est pas approuvé ou sponsorisé par Anthropic. Cette extension traduit le contenu à la volée pour l'apprentissage personnel — elle ne stocke ni ne redistribue aucun contenu de cours original. « Anthropic », « Claude » et « Skilljar » sont des marques commerciales de leurs propriétaires respectifs.

## Contribuer

SkillBridge est construit par la communauté, pour la communauté. Toutes les contributions sont les bienvenues !

- **Améliorations de traduction** — Corriger une mauvaise traduction ou ajouter des entrées aux dictionnaires statiques
- **Nouvelles langues** — Ajouter une langue standard ou promouvoir en premium avec un dictionnaire curé
- **Contributions de code** — Améliorer le moteur de traduction, l'AI Tutor ou les fonctionnalités YouTube
- **Documentation** — Améliorer les READMEs, écrire des tutoriels, ajouter des captures d'écran

Consultez [CONTRIBUTING.md](../../CONTRIBUTING.md) pour le guide complet. Commencez par nos [Good First Issues](../../issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22).

Consultez [ROADMAP.md](../ROADMAP.md) pour la direction du projet.

## Licence

MIT — voir [LICENSE](../../LICENSE)

---

**Fait pour la communauté mondiale d'apprentissage de l'IA.**
