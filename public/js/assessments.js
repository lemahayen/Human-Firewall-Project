
/*
 * ============================================================
 * HUMAN FIREWALL
 * Server-driven assessment module
 *
 * Pre-test: 6 questions
 * Post-test: 6 different questions
 * Final assessment: 10 questions
 *
 * The backend handles:
 * - Question selection
 * - Correct answers
 * - Score calculation
 * - Individual response storage
 * - Topic performance
 * ============================================================
 */

'use strict';

const Assessments = (() => {

  // ==========================================================
  // MODULE STATE
  // ==========================================================

  let currentType = null;
  let currentAttemptId = null;
  let currentQuestions = [];

  let submitting = false;
  let assessmentCompleted = false;
  let assessmentLoading = false;

  const EXPECTED_COUNTS = {
    pre: 6,
    post: 6,
    final: 10
  };

  // ==========================================================
  // HTML ELEMENT REFERENCES
  // ==========================================================

  const ELEMENTS = {
    pre: {
      title: 'assessment-title',
      instructions: 'assessment-instructions',
      questions: 'assessment-questions',
      feedback: 'assessment-feedback',
      submit: 'assessment-submit',
      next: 'assessment-next'
    },

    post: {
      title: 'assessment-title-post',
      instructions: null,
      questions: 'assessment-questions-post',
      feedback: 'assessment-feedback-post',
      submit: 'assessment-submit-post',
      next: 'assessment-next-post'
    },

    final: {
      title: 'assessment-title-final',
      instructions: null,
      questions: 'assessment-questions-final',
      feedback: 'assessment-feedback-final',
      submit: 'assessment-submit-final',
      next: 'assessment-next-final'
    }
  };

  const TITLES = {
    pre: 'BASELINE SECURITY ASSESSMENT',
    post: 'POST-TRAINING ASSESSMENT',
    final: 'FINAL CYBERSECURITY CHALLENGE'
  };

  const INSTRUCTIONS = {
    pre:
      'Answer all six questions based on your current knowledge. No correctness feedback is displayed during this assessment.',

    post:
      'Answer all six questions based on the knowledge covered during your training.',

    final:
      'Complete all ten scenario-based questions. You must achieve at least 50% to pass.'
  };

  // ==========================================================
  // GENERAL HELPERS
  // ==========================================================

  function $(id) {
    return document.getElementById(id);
  }

  function element(name) {
    if (!currentType) return null;

    const id = ELEMENTS[currentType][name];

    return id ? $(id) : null;
  }

  function setText(name, value) {
    const target = element(name);

    if (target) {
      target.textContent = value;
    }
  }

  // ==========================================================
  // FEEDBACK
  // ==========================================================

  function showFeedback(message, type = 'info') {
    const target = element('feedback');

    if (!target) {
      console.log(message);
      return;
    }

    target.textContent = message;
    target.className = `feedback ${type}`;
    target.classList.remove('hidden');
  }

  function clearFeedback() {
    const target = element('feedback');

    if (!target) return;

    target.textContent = '';
    target.className = 'feedback hidden';
  }

  // ==========================================================
  // BUTTON STATE
  // ==========================================================

  function setSubmitting(value) {
    submitting = value;

    const button = element('submit');

    if (!button) return;

    button.disabled = value;

    if (value) {
      button.textContent = 'SUBMITTING...';
    } else if (!assessmentCompleted) {
      button.textContent = 'SUBMIT ANSWERS';
    }
  }

  function setLoading(value) {
    assessmentLoading = value;

    const submitButton = element('submit');

    if (submitButton) {
      submitButton.disabled = value;
    }
  }

  // ==========================================================
  // QUESTION VALIDATION
  // ==========================================================

  function validateQuestion(question) {
    if (
      !question ||
      typeof question.questionId !== 'string' ||
      typeof question.prompt !== 'string' ||
      !Array.isArray(question.options) ||
      question.options.length < 2
    ) {
      throw new Error(
        'The server returned an invalid assessment question.'
      );
    }

    const optionIds = new Set();

    for (const option of question.options) {
      if (
        !option ||
        typeof option.id !== 'string' ||
        typeof option.text !== 'string' ||
        option.id.trim() === '' ||
        option.text.trim() === ''
      ) {
        throw new Error(
          'The server returned an invalid answer option.'
        );
      }

      if (optionIds.has(option.id)) {
        throw new Error(
          'The server returned duplicate answer options.'
        );
      }

      optionIds.add(option.id);
    }

    return true;
  }

  // ==========================================================
  // QUESTION RENDERING
  // ==========================================================

  function renderQuestions(questions) {
    const container = element('questions');

    if (!container) {
      throw new Error(
        `The ${currentType} assessment question container is missing.`
      );
    }

    container.replaceChildren();

    questions.forEach((question, index) => {

      const card = document.createElement('section');

      card.className = 'question-card';

      const heading = document.createElement('h3');

      heading.textContent =
        `QUESTION ${index + 1} OF ${questions.length}`;

      const topic = document.createElement('p');

      topic.className = 'muted';

      topic.textContent = String(question.topic || '')
        .replaceAll('_', ' ')
        .toUpperCase();

      const prompt = document.createElement('p');

      prompt.className = 'question-prompt';
      prompt.textContent = question.prompt;

      const optionsContainer = document.createElement('div');

      optionsContainer.className = 'options-list';

      question.options.forEach(option => {

        const label = document.createElement('label');

        label.className = 'option';

        const radio = document.createElement('input');

        radio.type = 'radio';
        radio.name = `question-${question.questionId}`;
        radio.value = option.id;
        radio.required = true;

        const optionText = document.createElement('span');

        optionText.textContent =
          `${option.id}. ${option.text}`;

        label.append(radio, optionText);

        optionsContainer.appendChild(label);

      });

      card.append(
        heading,
        topic,
        prompt,
        optionsContainer
      );

      container.appendChild(card);

    });
  }

  // ==========================================================
  // ANSWER COLLECTION
  // ==========================================================

  function collectAnswers() {
    const answers = [];

    for (const question of currentQuestions) {

      const selected = document.querySelector(
        `input[name="question-${CSS.escape(question.questionId)}"]:checked`
      );

      if (!selected) {
        throw new Error(
          'Please answer every question before submitting.'
        );
      }

      const validOption = question.options.some(
        option => option.id === selected.value
      );

      if (!validOption) {
        throw new Error(
          'An invalid answer was selected. Please review your answers.'
        );
      }

      answers.push({
        questionId: question.questionId,
        selectedOption: selected.value
      });

    }

    return answers;
  }

  // ==========================================================
  // RESULT VALIDATION
  // ==========================================================

  function validateResult(result) {
    if (
      !result ||
      !Number.isInteger(result.score) ||
      !Number.isInteger(result.total) ||
      typeof result.percentage !== 'number' ||
      !Number.isFinite(result.percentage) ||
      result.score < 0 ||
      result.total !== EXPECTED_COUNTS[currentType] ||
      result.score > result.total ||
      result.percentage < 0 ||
      result.percentage > 100
    ) {
      throw new Error(
        'The server returned an invalid assessment result.'
      );
    }

    return true;
  }

  // ==========================================================
  // DISPLAY ASSESSMENT RESULT
  // ==========================================================

  function displayResult(result) {

    const percentage = result.percentage;

    let message =
      `Assessment completed: ${result.score}/${result.total} correct (${percentage}%).`;

    if (currentType === 'final') {

      message += result.passed
        ? ' You passed the final assessment.'
        : ' You did not reach the 50% passing mark.';

    }

    showFeedback(
      message,
      currentType === 'final' && !result.passed
        ? 'warning'
        : 'success'
    );

    const nextButton = element('next');

    if (nextButton) {

      nextButton.classList.remove('hidden');

      if (currentType === 'pre') {

        nextButton.textContent = 'CONTINUE TO TRAINING';

      } else if (currentType === 'post') {

        nextButton.textContent =
          'CONTINUE TO FINAL ASSESSMENT';

      } else {

        nextButton.textContent = 'VIEW FINAL RESULTS';

      }

    }

    const submitButton = element('submit');

    if (submitButton) {
      submitButton.classList.add('hidden');
      submitButton.disabled = true;
    }

  }

  // ==========================================================
  // START ASSESSMENT
  // ==========================================================

  async function start(type) {

    if (!Object.hasOwn(EXPECTED_COUNTS, type)) {
      throw new Error('Invalid assessment type.');
    }

    currentType = type;

    currentAttemptId = null;
    currentQuestions = [];

    submitting = false;
    assessmentCompleted = false;
    assessmentLoading = true;

    clearFeedback();

    setText('title', TITLES[type]);
    setText('instructions', INSTRUCTIONS[type]);

    const questionContainer = element('questions');

    if (questionContainer) {
      questionContainer.replaceChildren();
    }

    const submitButton = element('submit');

    if (submitButton) {
      submitButton.disabled = true;
      submitButton.textContent = 'LOADING ASSESSMENT...';
      submitButton.classList.remove('hidden');
    }

    const nextButton = element('next');

    if (nextButton) {
      nextButton.classList.add('hidden');
    }

    try {

      showFeedback(
        'Loading assessment questions...',
        'info'
      );

      const response = await API.startAssessment(type);

      if (
        !response ||
        typeof response.attemptId !== 'string' ||
        !Array.isArray(response.questions)
      ) {
        throw new Error(
          'The server returned an invalid assessment.'
        );
      }

      if (
        response.questions.length !== EXPECTED_COUNTS[type]
      ) {
        throw new Error(
          `Expected ${EXPECTED_COUNTS[type]} questions, but received ${response.questions.length}.`
        );
      }

      response.questions.forEach(validateQuestion);

      currentAttemptId = response.attemptId;
      currentQuestions = response.questions;

      renderQuestions(currentQuestions);

      clearFeedback();

    } catch (error) {

      showFeedback(error.message, 'error');

      throw error;

    } finally {

      assessmentLoading = false;

      if (submitButton && !assessmentCompleted) {
        submitButton.disabled = false;
        submitButton.textContent = 'SUBMIT ANSWERS';
      }

    }

  }

  // ==========================================================
  // SUBMIT ASSESSMENT
  // ==========================================================

  async function submit() {

    if (
      submitting ||
      assessmentLoading ||
      assessmentCompleted ||
      !currentAttemptId ||
      !currentType
    ) {
      return;
    }

    clearFeedback();

    let answers;

    try {

      answers = collectAnswers();

    } catch (error) {

      showFeedback(error.message, 'warning');

      return;

    }

    try {

      setSubmitting(true);

      const result = await API.submitAssessment(
        currentType,
        currentAttemptId,
        answers
      );

      validateResult(result);

      if (!App || !App.state || !App.state.assessmentResults) {
        throw new Error(
          'The application could not store the assessment result.'
        );
      }

      App.state.assessmentResults[currentType] = result;

      assessmentCompleted = true;

      const questionContainer = element('questions');

      if (questionContainer) {
        questionContainer.replaceChildren();
      }

      displayResult(result);

    } catch (error) {

      showFeedback(error.message, 'error');

    } finally {

      setSubmitting(false);

    }

  }

  // ==========================================================
  // CONTINUE TO NEXT STAGE
  // ==========================================================

  async function continueAfterAssessment() {

    if (!currentType || !assessmentCompleted) {
      return;
    }

    if (currentType === 'pre') {

      await App.continueToTraining();

      return;

    }

    if (currentType === 'post') {

      await App.continueToFinalQuiz();

      return;

    }

    if (currentType === 'final') {

      const result = App.state.assessmentResults.final;

      if (result) {
        await App.showResults(result);
      }

    }

  }

  // ==========================================================
  // EVENT BINDING
  // ==========================================================

  function bindEvents() {

    Object.keys(ELEMENTS).forEach(type => {

      const ids = ELEMENTS[type];

      const submitButton = $(ids.submit);
      const nextButton = $(ids.next);

      if (
        submitButton &&
        !submitButton.dataset.assessmentBound
      ) {

        submitButton.addEventListener(
          'click',
          submit
        );

        submitButton.dataset.assessmentBound = 'true';

      }

      if (
        nextButton &&
        !nextButton.dataset.assessmentBound
      ) {

        nextButton.addEventListener(
          'click',
          continueAfterAssessment
        );

        nextButton.dataset.assessmentBound = 'true';

      }

    });

  }

  // ==========================================================
  // PUBLIC MODULE INTERFACE
  // ==========================================================

  return {
    start,
    submit,
    bindEvents
  };

})();

// Expose the module to the other frontend scripts.
window.Assessments = Assessments;
