/**
 * SkillBridge — Skilljar DOM Selector Registry
 *
 * Update these selectors when Skilljar changes their DOM structure.
 *
 * This is the SINGLE source of truth for all Skilljar-specific CSS selectors
 * used across content scripts. When Skilljar updates their DOM, only this
 * file needs to change.
 */

/* eslint-disable no-unused-vars */

const SKILLJAR_SELECTORS = {
  // Page structure
  headerRight: '#header-right',
  headerLinks: '.header-links-container',

  // Course content
  lessonMain: '#lesson-main',
  lessonContent: '.lesson-content',
  courseContent: '.course-content',
  courseTitle: '.dp-summary-wrapper h1, h1.break-word, .course-title',

  // Catalog
  courseBox: '.coursebox-text',
  courseBoxDesc: '.coursebox-text-description',
  ribbonText: '.sj-ribbon-text',
  courseTime: '.course-time, .coursebox-duration',

  // Lesson navigation
  lessonRow: 'li.lesson-modular, .lesson-row',
  sectionTitle: 'li.section, .section-title',
  leftNavReturn: '.left-nav-return-text',
  courseOverview: '.sj-text-course-overview, .course-description, .sj-course-info-wrapper',
  lessonTop: '.lesson-top',
  detailsPane: '.details-pane-description',
  focusLink: '.focus-link-v2',

  // FAQ
  faqTitle: '.faq-title',
  faqPost: '.faq-post',

  // Quiz / Assessment (course-completion quizzes only; certification exams are fully disabled)
  quizForm: '.quiz-form, .assessment-form, form[class*="quiz"], form[class*="assessment"]',
  answerOption: '.answer-option, .answer-choice, .quiz-option, .assessment-option',
  answerLabel: 'label[class*="answer"], label[class*="option"], label[class*="choice"]',
  quizResult: '.quiz-result, .assessment-result, .quiz-score, .score-display',
  certificateSection: '.certificate-section, .certificate-panel, .certificate-container',

  // ─── Defensive selectors for Skilljar features not yet on Anthropic's tenant ───
  // Not observed on live anthropic.skilljar.com as of 2026-04-19; kept so
  // only values (not consumers) change when Anthropic enables them. Broad
  // `[class*="..."]` matchers absorb minor class renames.

  // Skilljar AI Tutor (open beta 2026) — exclude from translation if present.
  aiTutor: '.sj-ai-tutor, .ai-tutor-widget, [class*="ai-tutor"], [data-ai-tutor]',
  aiTutorButton: '.sj-ai-tutor-btn, .ai-tutor-button, button[class*="ai-tutor"]',
  aiTutorPanel: '.sj-ai-tutor-panel, .ai-tutor-panel, [class*="ai-tutor-panel"]',

  // Course Families (Jan 2026 Skilljar release) — grouped catalog listings
  courseFamily: '.course-family, .sj-course-family, [class*="course-family"]',
  courseFamilyTitle: '.course-family-title, .sj-course-family-title',

  // Course Ratings (Jan 2026 Skilljar release)
  courseRating: '.course-rating, .sj-course-rating, [class*="course-rating"]',
  courseRatingStars: '.course-rating-stars, .sj-rating-stars',
  courseRatingText: '.course-rating-text, .sj-rating-text',

  // AI Feedback Summaries (Mar 2026 Skilljar release)
  aiFeedback: '.ai-feedback-summary, .sj-ai-feedback, [class*="ai-feedback"]',
};
