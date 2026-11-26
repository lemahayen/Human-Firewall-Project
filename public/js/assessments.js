
// ============================================================
// HUMAN FIREWALL
// Assessment module
// Pre-test, post-test and final assessment
//
// IMPORTANT:
// - Questions are retrieved from the backend.
// - Correct answers are never stored in this frontend.
// - Scores are calculated and validated by the backend.
// ============================================================

'use strict';

const Assessments = (() => {
  let currentType = null;
  let currentAttemptId = null;
  let currentQuestions = [];
  let submitting = false;

  const EXPECTED_COUNTS = {
    pre: 6,
    post: 6,
    final: 10
  };

  const TITLES = {
    pre: 'BASELINE SECURITY ASSESSMENT',
    post: 'POST-TRAINING ASSESSMENT',
    final: 'FINAL CYBERSECURITY CHALLENGE'
  };

  const INSTRUCTIONS = {
    pre: 'Answer all six questions. This assessment establishes your starting cybersecurity awareness level. You will not receive individual correctness feedback while completing it.',
    post: 'Answer all six questions. These questions assess the knowledge covered during your training.',
    final: 'Complete all ten scenario-based questions. You must achieve at least 50% to pass the final assessment.'
  };

  function $(id) {
    return document.getElementById(id);
  }

  function setText(id, value) {
    const element = $(id);
    if (element) element.textContent = value;
  }

  function showFeedback(message, type = 'info') {
    const element = $('assessment-feedback');

    if (!element) {
      console.log(message);
      return;
    }

    element.textContent = message;
    element.className = `feedback ${type}`;
    element.classList.remove('hidden');
  }

  function clearFeedback() {
    const element = $('assessment-feedback');

    if (!element) return;

    element.textContent = '';
    element.className = 'feedback hidden';
  }

  function setSubmitting(value) {
    submitting = value;

    const button = $('assessment-submit');

    if (!button) return;

    button.disabled = value;
    button.textContent = value
      ? 'SUBMITTING...'
      : 'SUBMIT ASSESSMENT';
  }

  function renderQuestions(questions) {
    const container = $('assessment-questions');

    if (!container) {
      throw new Error('The assessment question container is missing.');
    }

    container.replaceChildren();

    questions.forEach((question, index) => {
      const card = document.createElement('section');
      card.className = 'question-card';

      const heading = document.createElement('h3');
      heading.textContent =
        `QUESTION ${index + 1} OF ${questions.length}`;

      const topic = document.createElement('p');
      topic.className = 'question-topic';
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
        optionText.textContent = `${option.id}. ${option.text}`;

        label.append(radio, optionText);
        optionsContainer.appendChild(label);
      });

      card.append(heading, topic, prompt, optionsContainer);
      container.appendChild(card);
    });
  }

  function collectAnswers() {
    const answers = [];

    for (const question of currentQuestions) {
      const radios = document.querySelectorAll(
        'input[type="radio"]:checked'
      );

      const selected = Array.from(radios).find(
        radio => radio.name === `question-${question.questionId}`
      );

      if (!selected) {
        throw new Error(
          'Please answer every question before submitting.'
        );
      }

      answers.push({
        questionId: question.questionId,
        selectedOption: selected.value
      });
    }

    return answers;
  }

  function displayResult(result) {
    const percentage = Number(result.percentage);

    if (!Number.isFinite(percentage)) {
      throw new Error('The server returned an invalid assessment score.');
    }

    const message =
      `Assessment completed: ${result.score}/${result.total} correct (${percentage}%).`;

    showFeedback(message, 'success');

    if (currentType === 'final') {
      showFeedback(
        `${message} ${result.passed ? 'You passed!' : 'You did not reach the 50% pass mark.'}`,
        result.passed ? 'success' : 'warning'
      );
    }

    const nextButton = $('assessment-next');

    if (nextButton) {
      nextButton.classList.remove('hidden');

      if (currentType === 'pre') {
        nextButton.textContent = 'CONTINUE TO TRAINING';
      } else if (currentType === 'post') {
        nextButton.textContent = 'CONTINUE TO FINAL ASSESSMENT';
      } else {
        nextButton.textContent = 'VIEW FINAL RESULTS';
      }
    }

    const submitButton = $('assessment-submit');

    if (submitButton) {
      submitButton.classList.add('hidden');
    }
  }

  async function start(type) {
    if (!Object.hasOwn(EXPECTED_COUNTS, type)) {
      throw new Error('Invalid assessment type.');
    }

    currentType = type;
    currentAttemptId = null;
    currentQuestions = [];
    submitting = false;

    clearFeedback();

    setText('assessment-title', TITLES[type]);
    setText('assessment-instructions', INSTRUCTIONS[type]);

    const questionContainer = $('assessment-questions');

    if (questionContainer) {
      questionContainer.replaceChildren();
    }

    const submitButton = $('assessment-submit');

    if (submitButton) {
      submitButton.disabled = false;
      submitButton.textContent = 'SUBMIT ASSESSMENT';
      submitButton.classList.remove('hidden');
    }

    const nextButton = $('assessment-next');

    if (nextButton) {
      nextButton.classList.add('hidden');
    }

    try {
      showFeedback('Loading assessment questions...', 'info');

      const response = await API.startAssessment(type);

      if (
        !response ||
        typeof response.attemptId !== 'string' ||
        !Array.isArray(response.questions)
      ) {
        throw new Error('The server returned an invalid assessment.');
      }

      if (response.questions.length !== EXPECTED_COUNTS[type]) {
        throw new Error(
          `Expected ${EXPECTED_COUNTS[type]} questions, but received ${response.questions.length}.`
        );
      }

      for (const question of response.questions) {
        if (
          typeof question.questionId !== 'string' ||
          typeof question.prompt !== 'string' ||
          !Array.isArray(question.options) ||
          question.options.length < 2
        ) {
          throw new Error('The server returned an invalid question.');
        }

        for (const option of question.options) {
          if (
            typeof option.id !== 'string' ||
            typeof option.text !== 'string'
          ) {
            throw new Error('The server returned an invalid answer option.');
          }
        }
      }

      currentAttemptId = response.attemptId;
      currentQuestions = response.questions;

      renderQuestions(currentQuestions);
      clearFeedback();

    } catch (error) {
      showFeedback(error.message, 'error');
      throw error;
    }
  }

  async function submit() {
    if (submitting || !currentAttemptId || !currentType) {
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

      if (
        !result ||
        typeof result.score !== 'number' ||
        typeof result.total !== 'number' ||
        typeof result.percentage !== 'number'
      ) {
        throw new Error('The server returned an invalid assessment result.');
      }

      App.state.assessmentResults[currentType] = result;

      const questionContainer = $('assessment-questions');

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

  async function continueAfterAssessment() {
    if (!currentType) return;

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

  function bindEvents() {
    const submitButton = $('assessment-submit');
    const nextButton = $('assessment-next');

    if (submitButton) {
      submitButton.addEventListener('click', submit);
    }

    if (nextButton) {
      nextButton.addEventListener('click', continueAfterAssessment);
    }
  }

  return {
    start,
    submit,
    bindEvents
  };
})();
