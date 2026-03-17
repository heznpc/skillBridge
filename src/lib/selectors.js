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
  courseTime: '.course-time',

  // Lesson navigation
  lessonRow: '.lesson-row',
  sectionTitle: '.section-title',
  leftNavReturn: '.left-nav-return-text',
  courseOverview: '.sj-text-course-overview',
  lessonTop: '.lesson-top',
  detailsPane: '.details-pane-description',
  focusLink: '.focus-link-v2',

  // FAQ
  faqTitle: '.faq-title',
  faqPost: '.faq-post',
};
