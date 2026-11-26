
// ============================================================
// HUMAN FIREWALL
// Assessment module: pre-test, post-test and final assessment
// Scores and answer validation are handled by the backend.
// ============================================================

const Assessments = (() => {
  let currentType = null;
  let currentAttemptId = null;
  let currentQuestions = [];
  let submitting = false;

  function $(id) {
    return document.getElementById(id);
  }

  function setText(id, value) {
    const element = $(id);
    if (element) element.textContent = value;
  }

  function showFeedback(message, type = 'info') {
    const element = $('assessment-feedback');
    if (!element) return;

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

  function getAssessmentTitle(type) {
    const titles = {
      pre: 'BASELINE SECURITY ASSESSMENT',
      post: 'POST-TRAINING ASSESSMENT',
      final: 'FINAL CYBERSECURITY CHALLENGE'
    };

    return titles[type] || 'ASSESSMENT';
  }

  function getInstructions(type) {
    if (type === 'pre') {
      return 'Answer all six questions. This assessment establishes your starting cybersecurity awareness level. You will not receive individual answer feedback while completing it.';
    }

    if (type === 'post') {
      return 'Answer all six questions. These questions assess the knowledge covered during your training. Select the best response for each situation.';
    }

    return 'Complete all ten scenario-based questions. You must achieve at least 50% to pass the final assessment.';
  }

  function renderQuestions(questions) {
    const container = $('assessment-questions');

    if (!container) {
      throw new Error('Assessment question container is missing from the page.');
    }

    container.replaceChildren();

    questions.forEach((question, index) => {
      const card = document.createElement('section');
      card.className = 'question-card';

      const heading = document.createElement('h3');
      heading.textContent = `QUESTION ${index + 1} OF ${questions.length}`;

      const topic = document.createElement('p');
      topic.className = 'question-topic';
      topic.textContent = question.topic.replaceAll('_', ' ').toUpperCase();

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
        radio.name = `question-${question.question_id}`;
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
      const selected = document.querySelector(
        `input[name="question-${CSS.escape(question.question_id)}"]:checked`
      );

      if (!selected) {
        throw new Error('Please answer every question before submitting.');
      }

      answers.push({
        questionId: question.question_id,
        selectedOption: selected.value
      });
    }

    return answers;
  }

  function setSubmitting(value) {
    submitting = value;

    const button = $('assessment-submit');
    if (!button) return;

    button.disabled = value;
    button.textContent = value ? 'SUBMITTING...' : 'SUBMIT ASSESSMENT';
  }

  async function start(type) {
    if (!['pre', 'post', 'final'].includes(type)) {
      throw new Error('Invalid assessment type.');
    }

    currentType = type;
    currentAttemptId = null;
    currentQuestions = [];
    submitting = false;

    clearFeedback();

    setText('assessment-title', getAssessmentTitle(type));
    setText('assessment-instructions', getInstructions(type));

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
    if (nextButton) nextButton.classList.add('hidden');

    try {
      showFeedback('Loading assessment questions...', 'info');

      const response = await API.startAssessment(type);

      if (!response.attemptId || !Array.isArray(response.questions)) {
        throw new Error('The server returned an incomplete assessment.');
      }

      currentAttemptId = response.attemptId;
      currentQuestions = response.questions;

      const expectedCount = type === 'final' ? 10 : 6;

      if (currentQuestions.length !== expectedCount) {
        throw new Error(
          `Expected ${expectedCount} questions but received ${currentQuestions.length}.`
        );
      }

      renderQuestions(currentQuestions);
      clearFeedback();

    } catch (error) {
      showFeedback(error.message, 'error');
      throw error;
    }
  }

  async function submit() {
    if (submitting || !currentAttemptId || !currentType) return;

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

      // Store server-calculated results only.
      App.state.assessmentResults[currentType] = result;

      const questionContainer = $('assessment-questions');
      if (questionContainer) {
        questionContainer.replaceChildren();
      }

      const submitButton = $('assessment-submit');
      if (submitButton) submitButton.classList.add('hidden');

      if (currentType === 'final') {
        showFeedback(
          `Final assessment completed. Your score is ${result.percentage}%.`,
          result.passed ? 'success' : 'warning'
        );
      } else {
        showFeedback(
          `Assessment completed. Your score is ${result.score} out of ${result.total}.`,
          'success'
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

    } catch (error) {
      showFeedback(error.message, 'error');
    } finally {
      setSubmitting(false);
    }
  }

  function continueAfterAssessment() {
    if (!currentType) return;

    if (currentType === 'pre') {
      App.continueToTraining();
    } else if (currentType === 'post') {
      App.continueToFinalQuiz();
    } else if (currentType === 'final') {
      const result = App.state.assessmentResults.final;
      if (result) App.showResults(result);
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
