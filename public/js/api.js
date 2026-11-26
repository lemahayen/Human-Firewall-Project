
// Human Firewall - API communication layer
// All protected requests use the pseudonymous session token.

const API = (() => {
  const BASE_URL = '/api/v2';
  const TOKEN_KEY = 'hf_session_token';
  const CODE_KEY = 'hf_participant_code';

  function getToken() {
    return sessionStorage.getItem(TOKEN_KEY);
  }

  function saveSession(data) {
    sessionStorage.setItem(TOKEN_KEY, data.sessionToken);
    sessionStorage.setItem(CODE_KEY, data.participantCode);
  }

  function clearSession() {
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(CODE_KEY);
  }

  function getParticipantCode() {
    return sessionStorage.getItem(CODE_KEY);
  }

  async function request(url, options = {}, authenticated = true) {
    const headers = {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    };

    if (authenticated) {
      const token = getToken();

      if (!token) {
        throw new Error('Your session has expired. Please register again.');
      }

      headers.Authorization = `Bearer ${token}`;
    }

    let response;

    try {
      response = await fetch(url, {
        ...options,
        headers,
        cache: 'no-store'
      });
    } catch {
      throw new Error('Unable to connect to the server. Check your connection and try again.');
    }

    let data;

    try {
      data = await response.json();
    } catch {
      throw new Error('The server returned an invalid response.');
    }

    if (!response.ok) {
      if (response.status === 401) {
        clearSession();
      }

      throw new Error(data.error || `Request failed (${response.status}).`);
    }

    return data;
  }

  function post(url, body, authenticated = true) {
    return request(url, {
      method: 'POST',
      body: JSON.stringify(body)
    }, authenticated);
  }

  return {
    getToken,
    getParticipantCode,
    clearSession,

    async register(consentAccepted) {
      const data = await post(
        `${BASE_URL}/register`,
        { consentAccepted },
        false
      );

      saveSession(data);
      return data;
    },

    getSession() {
      return request(`${BASE_URL}/session`);
    },

    startAssessment(type) {
      return post(`${BASE_URL}/assessments/${encodeURIComponent(type)}/start`, {});
    },

    submitAssessment(type, attemptId, answers) {
      return post(
        `${BASE_URL}/assessments/${encodeURIComponent(type)}/submit`,
        { attemptId, answers }
      );
    },

    getCheckpoints(moduleId) {
      return request(
        `${BASE_URL}/modules/${encodeURIComponent(moduleId)}/checkpoints`
      );
    },

    answerCheckpoint(moduleId, questionId, selectedOption) {
      return post(
        `${BASE_URL}/modules/${encodeURIComponent(moduleId)}/checkpoints/${encodeURIComponent(questionId)}/answer`,
        { selectedOption }
      );
    },

    completeVideo(moduleId) {
      return post(
        `${BASE_URL}/modules/${encodeURIComponent(moduleId)}/video-complete`,
        {}
      );
    },

    getProgress() {
      return request(`${BASE_URL}/progress`);
    },

    getLeaderboard() {
      return request('/api/leaderboard', {}, false);
    }
  };
})();
