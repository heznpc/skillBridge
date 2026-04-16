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
  courseTitle: '.course-title',

  // Catalog
  courseBox: '.coursebox-text',
  courseBoxDesc: '.coursebox-text-description',
  ribbonText: '.sj-ribbon-text',
  courseTime: '.course-time, .coursebox-duration',

  // Lesson navigation
  lessonRow: '.lesson-row',
  sectionTitle: '.section-title',
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

  // Skilljar AI Tutor (open beta 2026) — exclude from translation to avoid DOM conflicts
  aiTutor: '.sj-ai-tutor, .ai-tutor-widget, [class*="ai-tutor"], [data-ai-tutor]',
  aiTutorButton: '.sj-ai-tutor-btn, .ai-tutor-button, button[class*="ai-tutor"]',
  aiTutorPanel: '.sj-ai-tutor-panel, .ai-tutor-panel, [class*="ai-tutor-panel"]',

  // Course Families (Jan 2026) — grouped course catalog listings
  courseFamily: '.course-family, .sj-course-family, [class*="course-family"]',
  courseFamilyTitle: '.course-family-title, .sj-course-family-title',

  // Course Ratings (Jan 2026)
  courseRating: '.course-rating, .sj-course-rating, [class*="course-rating"]',
  courseRatingStars: '.course-rating-stars, .sj-rating-stars',
  courseRatingText: '.course-rating-text, .sj-rating-text',

  // AI Feedback Summaries (Mar 2026)
  aiFeedback: '.ai-feedback-summary, .sj-ai-feedback, [class*="ai-feedback"]',
};
