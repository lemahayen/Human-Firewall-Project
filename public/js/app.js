
/*
 * ============================================================
 * HUMAN FIREWALL
 * Main application controller
 *
 * Responsibilities:
 * - Participant registration and consent
 * - Session management
 * - Screen navigation
 * - Assessment and training integration
 * - Mission and results integration
 * - Game XP tracking
 *
 * ============================================================
 */

'use strict';

const App = (() => {

  // ==========================================================
  // APPLICATION STATE
  // ==========================================================

  const state = {
    currentScreen: 'registration',

    participantCode: null,
    session: null,
    progress: null,

    startedAt: null,

    assessmentResults: {
      pre: null,
      post: null,
      final: null
    },

    missionResults: [],

    gameXP: 0,

    completedMissions: [],

    currentModuleIndex: 0
  };

  // ==========================================================
  // APPLICATION SCREENS
  // ==========================================================

  const screens = [
    'registration',
    'pretest',
    'training',
    'missions',
    'posttest',
    'finalquiz',
    'results'
  ];

  let registrationInProgress = false;
  let initialisationInProgress = false;

  // ==========================================================
  // DOM HELPER
  // ==========================================================

  function $(id) {
    return document.getElementById(id);
  }

  // ==========================================================
  // SCREEN NAVIGATION
  // ==========================================================

  function showScreen(screenName) {

    if (!screens.includes(screenName)) {
      console.error(
        `Unknown application screen: ${screenName}`
      );

      return;
    }

    const target = $(`screen-${screenName}`);

    if (!target) {
      console.error(
        `Screen element not found: screen-${screenName}`
      );

      return;
    }

    document.querySelectorAll('.screen').forEach(screen => {
      screen.classList.remove('active');
    });

    target.classList.add('active');

    state.currentScreen = screenName;

    window.scrollTo({
      top: 0,
      behavior: 'smooth'
    });

    updateNavigation();
  }

  // ==========================================================
  // NAVIGATION AND PARTICIPANT PROGRESS
  // ==========================================================

  function updateNavigation() {

    const codeElement = $('participant-code');

    if (codeElement) {
      codeElement.textContent =
        state.participantCode || 'NOT REGISTERED';
    }

    const progressElement = $('overall-progress');

    if (progressElement) {

      const currentIndex =
        screens.indexOf(state.currentScreen);

      const percentage = Math.max(
        0,
        Math.round(
          (currentIndex / (screens.length - 1)) * 100
        )
      );

      progressElement.style.width = `${percentage}%`;
    }

  }

  // ==========================================================
  // FEEDBACK MESSAGES
  // ==========================================================

  function showMessage(
    message,
    type = 'error',
    targetId = 'app-message'
  ) {

    const target = $(targetId);

    if (!target) {
      console.error(message);
      return;
    }

    target.textContent = message;

    target.className = `feedback ${type}`;

    target.classList.remove('hidden');
  }

  function clearMessage(targetId = 'app-message') {

    const target = $(targetId);

    if (target) {
      target.textContent = '';
      target.className = 'feedback hidden';
    }

  }

  // ==========================================================
  // BUTTON LOADING STATE
  // ==========================================================

  function setButtonLoading(
    button,
    loading,
    originalText = ''
  ) {

    if (!button) return;

    button.disabled = loading;

    if (loading) {

      if (!button.dataset.originalText) {
        button.dataset.originalText =
          button.textContent;
      }

      button.textContent = 'PLEASE WAIT...';

    } else {

      button.textContent =
        originalText ||
        button.dataset.originalText ||
        'CONTINUE';

    }

  }

  // ==========================================================
  // PARTICIPANT REGISTRATION
  // ==========================================================

  async function register() {

    if (registrationInProgress) {
      return;
    }

    clearMessage();

    const consent = $('consent-accepted');
    const button = $('register-button');

    if (!consent || !consent.checked) {

      showMessage(
        'Please read the participant information and provide consent before continuing.',
        'warning'
      );

      return;
    }

    registrationInProgress = true;

    try {

      setButtonLoading(button, true);

      const registration =
        await API.register(true);

      if (
        !registration ||
        typeof registration.participantCode !== 'string' ||
        !registration.participantCode
      ) {
        throw new Error(
          'Registration was unsuccessful. The server did not return a participant code.'
        );
      }

      state.participantCode =
        registration.participantCode;

      state.session = registration;

      state.startedAt = Date.now();

      await refreshProgress();

      const codeElement = $('registration-code');

      if (codeElement) {
        codeElement.textContent =
          registration.participantCode;
      }

      showMessage(
        `Registration successful. Your participant code is ${registration.participantCode}.`,
        'success'
      );

      showScreen('pretest');

      if (
        window.Assessments &&
        typeof window.Assessments.start === 'function'
      ) {
        await window.Assessments.start('pre');
      } else {
        throw new Error(
          'The assessment module could not be loaded.'
        );
      }

    } catch (error) {

      showMessage(
        error.message || 'Registration failed. Please try again.',
        'error'
      );

    } finally {

      registrationInProgress = false;

      setButtonLoading(
        button,
        false,
        'BEGIN MISSION'
      );

    }

  }

  // ==========================================================
  // SERVER PROGRESS
  // ==========================================================

  async function refreshProgress() {

    const progress = await API.getProgress();

    state.progress = progress;

    return progress;
  }

  // ==========================================================
  // SESSION VALIDATION
  // ==========================================================

  async function validateSession() {

    if (!API.getToken()) {
      return false;
    }

    try {

      state.session = await API.getSession();

      if (
        !state.session ||
        !state.session.participantCode
      ) {
        throw new Error(
          'The server returned an invalid session.'
        );
      }

      state.participantCode =
        state.session.participantCode;

      await refreshProgress();

      return true;

    } catch (error) {

      API.clearSession();

      state.session = null;
      state.participantCode = null;
      state.progress = null;

      return false;

    }

  }

  // ==========================================================
  // TRAINING MODULE
  // ==========================================================

  async function continueToTraining() {

    clearMessage();

    try {

      await refreshProgress();

      if (
        !window.Training ||
        typeof window.Training.initialise !== 'function'
      ) {
        throw new Error(
          'The training module could not be loaded.'
        );
      }

      showScreen('training');

      await window.Training.initialise();

    } catch (error) {

      showMessage(
        error.message || 'Unable to open the training module.'
      );

    }

  }

  // ==========================================================
  // INTERACTIVE MISSIONS
  // ==========================================================

  async function continueToMissions() {

    clearMessage();

    try {

      await refreshProgress();

      showScreen('missions');

      if (
        window.Missions &&
        typeof window.Missions.initialise === 'function'
      ) {
        await window.Missions.initialise();
      } else {
        showMessage(
          'The mission module is not available yet.',
          'warning'
        );
      }

    } catch (error) {

      showMessage(
        error.message || 'Unable to open the missions.'
      );

    }

  }

  // ==========================================================
  // POST-TRAINING ASSESSMENT
  // ==========================================================

  async function continueToPostTest() {

    clearMessage();

    try {

      await refreshProgress();

      if (
        !window.Assessments ||
        typeof window.Assessments.start !== 'function'
      ) {
        throw new Error(
          'The assessment module could not be loaded.'
        );
      }

      showScreen('posttest');

      await window.Assessments.start('post');

    } catch (error) {

      showMessage(
        error.message || 'Unable to start the post-assessment.'
      );

    }

  }

  // ==========================================================
  // FINAL ASSESSMENT
  // ==========================================================

  async function continueToFinalQuiz() {

    clearMessage();

    try {

      await refreshProgress();

      if (
        !window.Assessments ||
        typeof window.Assessments.start !== 'function'
      ) {
        throw new Error(
          'The assessment module could not be loaded.'
        );
      }

      showScreen('finalquiz');

      await window.Assessments.start('final');

    } catch (error) {

      showMessage(
        error.message || 'Unable to start the final assessment.'
      );

    }

  }

  // ==========================================================
  // FINAL RESULTS
  // ==========================================================

  async function showResults(result) {

    if (!result) {
      showMessage(
        'The final assessment results could not be retrieved.',
        'error'
      );

      return;
    }

    state.assessmentResults.final = result;

    showScreen('results');

    if (
      window.Results &&
      typeof window.Results.render === 'function'
    ) {

      try {

        await window.Results.render(result);

      } catch (error) {

        showMessage(
          error.message || 'Unable to display the results.'
        );

      }

    } else {

      showMessage(
        'Your final assessment has been recorded. The results display is not available yet.',
        'warning'
      );

    }

  }

  // ==========================================================
  // GAME XP
  // ==========================================================

  function addGameXP(points) {

    if (
      !Number.isInteger(points) ||
      points < 0
    ) {
      throw new Error('Invalid game XP value.');
    }

    state.gameXP += points;

    const xpElement = $('game-xp');

    if (xpElement) {
      xpElement.textContent = state.gameXP;
    }

    return state.gameXP;
  }

  // ==========================================================
  // MISSION COMPLETION TRACKING
  // ==========================================================

  function markMissionCompleted(missionId, result) {

    if (
      typeof missionId !== 'string' ||
      !missionId.trim()
    ) {
      throw new Error('Invalid mission identifier.');
    }

    if (
      state.completedMissions.includes(missionId)
    ) {
      return false;
    }

    state.completedMissions.push(missionId);

    state.missionResults.push({
      missionId,
      result
    });

    return true;
  }

  // ==========================================================
  // LOGOUT
  // ==========================================================

  function logout() {

    const confirmed = window.confirm(
      'Are you sure you want to leave this session? Your completed records will remain stored.'
    );

    if (!confirmed) return;

    API.clearSession();

    state.currentScreen = 'registration';

    state.participantCode = null;
    state.session = null;
    state.progress = null;
    state.startedAt = null;

    state.assessmentResults = {
      pre: null,
      post: null,
      final: null
    };

    state.missionResults = [];

    state.gameXP = 0;

    state.completedMissions = [];

    state.currentModuleIndex = 0;

    window.location.reload();

  }

  // ==========================================================
  // EVENT BINDING
  // ==========================================================

  function bindClickEvent(
    elementId,
    callback,
    bindingName
  ) {

    const element = $(elementId);

    if (!element) return;

    const flag = `app${bindingName}Bound`;

    if (element.dataset[flag] === 'true') {
      return;
    }

    element.addEventListener('click', callback);

    element.dataset[flag] = 'true';

  }

  function bindEvents() {

    bindClickEvent(
      'register-button',
      register,
      'Register'
    );

    bindClickEvent(
      'continue-training',
      continueToTraining,
      'Training'
    );

    bindClickEvent(
      'continue-missions',
      continueToMissions,
      'Missions'
    );

    bindClickEvent(
      'continue-posttest',
      continueToPostTest,
      'Posttest'
    );

    bindClickEvent(
      'continue-finalquiz',
      continueToFinalQuiz,
      'Finalquiz'
    );

    bindClickEvent(
      'logout-button',
      logout,
      'Logout'
    );

  }

  // ==========================================================
  // APPLICATION INITIALISATION
  // ==========================================================

  async function initialise() {

    if (initialisationInProgress) {
      return;
    }

    initialisationInProgress = true;

    bindEvents();

    try {

      const authenticated =
        await validateSession();

      if (authenticated) {

        showMessage(
          'An existing session was found. Your participant session is still active.',
          'success'
        );

        showScreen('pretest');

        // Attempt to resume the pre-assessment.
        // The backend remains responsible for deciding
        // whether this assessment can be started again.

        if (
          window.Assessments &&
          typeof window.Assessments.start === 'function'
        ) {

          try {

            await window.Assessments.start('pre');

          } catch (error) {

            showMessage(
              error.message ||
              'Your session was restored, but the pre-assessment could not be resumed.',
              'warning'
            );

          }

        }

      } else {

        showScreen('registration');

      }

    } catch (error) {

      showMessage(
        error.message ||
        'The application could not be initialised.'
      );

      showScreen('registration');

    } finally {

      initialisationInProgress = false;

    }

  }

  // ==========================================================
  // PUBLIC APPLICATION INTERFACE
  // ==========================================================

  return {

    state,

    $,

    showScreen,

    showMessage,

    clearMessage,

    refreshProgress,

    validateSession,

    continueToTraining,

    continueToMissions,

    continueToPostTest,

    continueToFinalQuiz,

    showResults,

    addGameXP,

    markMissionCompleted,

    logout,

    bindEvents,

    initialise

  };

})();

// ============================================================
// EXPOSE APPLICATION CONTROLLER
// ============================================================

window.App = App;

// ============================================================
// START APPLICATION
// ============================================================

document.addEventListener(
  'DOMContentLoaded',
  () => {
    App.initialise();
  }
);
