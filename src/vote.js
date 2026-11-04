/**
 * 작업자 2 담당 모듈: 투표 진행 및 중복 투표 방지 로직 (src/vote.js)
 *
 * 주요 기능:
 * 1. 선택된 투표 주제의 선택지 렌더링 및 선택(라디오 버튼) UI
 * 2. 중복 투표 방지 (1인 1표 검증)
 *    - localStorage 기반의 투표 이력 관리 (`vibe_vote_user_votes`)
 *    - 브라우저 고유 참여자 식별값(Voter ID) 자동 생성 및 유지
 *    - 토픽 객체의 voters 목록 검증
 * 3. 이미 투표한 주제는 투표 폼 비활성화 및 '투표 완료' 배지/안내 메시지 표시
 * 4. 투표 제출 처리 및 작업자 1, 작업자 3과의 이벤트 통신 (`vote:submitted`)
 */

const VOTER_ID_KEY = 'vibe_vote_voter_id';
const USER_VOTES_KEY = 'vibe_vote_user_votes';
const TOPICS_STORAGE_KEY = 'vibe_vote_topics';

/**
 * 내부 상태 관리
 */
const state = {
  currentTopic: null,
  selectedOptionId: null,
  externalStore: null,
  onVoteSubmittedCallback: null
};

/**
 * 현재 브라우저(사용자)의 고유 식별자 반환 (없으면 자동 생성하여 localStorage에 저장)
 * @returns {string} 고유 Voter ID (예: 'voter_1730000000_abc12')
 */
export function getOrCreateVoterId() {
  if (typeof localStorage === 'undefined') return 'voter_anonymous';
  let voterId = localStorage.getItem(VOTER_ID_KEY);
  if (!voterId) {
    const randomStr = Math.random().toString(36).substring(2, 8);
    voterId = `voter_${Date.now()}_${randomStr}`;
    localStorage.setItem(VOTER_ID_KEY, voterId);
  }
  return voterId;
}

/**
 * 사용자가 특정 주제에 투표했는지 여부 확인
 * 1) 로컬 사용자 투표 기록(USER_VOTES_KEY) 확인
 * 2) topic.voters 목록에 본인 voterId 포함 여부 확인
 * @param {string} topicId
 * @param {object} [topic]
 * @returns {boolean}
 */
export function hasUserVoted(topicId, topic = null) {
  if (!topicId) return false;
  const voterId = getOrCreateVoterId();

  // 1. localStorage 기록 확인
  if (typeof localStorage !== 'undefined') {
    try {
      const records = JSON.parse(localStorage.getItem(USER_VOTES_KEY) || '{}');
      if (records[topicId]) return true;
    } catch {
      // 파싱 에러 시 무시하고 다음 단계 검사
    }
  }

  // 2. topic 객체 내부의 voters 배열 확인
  const targetTopic = topic || state.currentTopic;
  if (targetTopic && Array.isArray(targetTopic.voters)) {
    if (targetTopic.voters.includes(voterId)) return true;
  }

  return false;
}

/**
 * 사용자가 선택했던 옵션 ID 반환 (이전 투표 내역 조회)
 * @param {string} topicId
 * @returns {string|null}
 */
export function getUserVotedOptionId(topicId) {
  if (!topicId || typeof localStorage === 'undefined') return null;
  try {
    const records = JSON.parse(localStorage.getItem(USER_VOTES_KEY) || '{}');
    return records[topicId]?.optionId || null;
  } catch {
    return null;
  }
}

/**
 * 투표 완료 기록 저장 (중복 방지용 마킹)
 * @param {string} topicId
 * @param {string} optionId
 */
export function recordUserVote(topicId, optionId) {
  if (!topicId || typeof localStorage === 'undefined') return;
  try {
    const records = JSON.parse(localStorage.getItem(USER_VOTES_KEY) || '{}');
    records[topicId] = {
      optionId,
      votedAt: new Date().toISOString()
    };
    localStorage.setItem(USER_VOTES_KEY, JSON.stringify(records));
  } catch (e) {
    console.error('투표 기록 저장 실패:', e);
  }
}

/**
 * 작업자 3의 store와 통신하기 위한 어댑터
 */
function getStore() {
  if (state.externalStore) return state.externalStore;
  if (typeof window !== 'undefined') {
    if (window.VibeStore) return window.VibeStore;
    if (window.store) return window.store;
  }
  return {
    getTopics() {
      if (typeof localStorage === 'undefined') return [];
      try {
        return JSON.parse(localStorage.getItem(TOPICS_STORAGE_KEY) || '[]');
      } catch {
        return [];
      }
    },
    castVote(topicId, optionId, voterId) {
      const topics = this.getTopics();
      const topicIndex = topics.findIndex((t) => t.id === topicId);
      if (topicIndex === -1) return { success: false, message: '투표 주제를 찾을 수 없습니다.' };

      const topic = topics[topicIndex];
      topic.voters = topic.voters || [];

      // 중복 체크
      if (topic.voters.includes(voterId)) {
        return { success: false, message: '이미 참여한 투표입니다. 중복 투표는 불가능합니다.' };
      }

      const option = (topic.options || []).find((o) => o.id === optionId);
      if (!option) {
        return { success: false, message: '선택한 옵션이 존재하지 않습니다.' };
      }

      option.votes = (Number(option.votes) || 0) + 1;
      topic.voters.push(voterId);

      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(TOPICS_STORAGE_KEY, JSON.stringify(topics));
      }

      return { success: true, topic, updatedOptionId: optionId };
    }
  };
}

/**
 * HTML 특수문자 이스케이프
 */
function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * 투표 섹션 UI 렌더링
 * @param {HTMLElement} container
 */
export function renderVoteSection(container) {
  if (!container) return;

  if (!state.currentTopic) {
    const topics = getStore().getTopics() || [];
    if (topics.length > 0) {
      state.currentTopic = topics[0];
    }
  }

  const topic = state.currentTopic;

  // 주제가 선택되지 않았을 때의 상태
  if (!topic) {
    container.innerHTML = `
      <div class="vote-container">
        <div class="vote-empty-state">
          <p class="vote-empty-text">투표할 주제를 왼쪽 목록에서 선택해 주세요.</p>
        </div>
      </div>
    `;
    return;
  }

  const alreadyVoted = hasUserVoted(topic.id, topic);
  const votedOptionId = getUserVotedOptionId(topic.id);

  const optionsHtml = (topic.options || [])
    .map((option) => {
      const isSelected = state.selectedOptionId === option.id;
      const isMyChoice = alreadyVoted && votedOptionId === option.id;

      return `
        <label class="vote-option-item ${isSelected ? 'is-selected' : ''} ${alreadyVoted ? 'is-disabled' : ''} ${isMyChoice ? 'is-my-choice' : ''}">
          <input
            type="radio"
            name="vote-option"
            value="${escapeHtml(option.id)}"
            class="vote-option-radio"
            ${isSelected ? 'checked' : ''}
            ${alreadyVoted ? 'disabled' : ''}
          />
          <span class="vote-option-label">${escapeHtml(option.text)}</span>
          ${isMyChoice ? '<span class="vote-my-choice-badge">내 선택 ✓</span>' : ''}
        </label>
      `;
    })
    .join('');

  container.innerHTML = `
    <div class="vote-container">
      <div class="vote-header">
        <div class="vote-badge-group">
          ${
            alreadyVoted
              ? '<span class="vote-badge vote-badge-completed">투표 완료</span>'
              : '<span class="vote-badge vote-badge-active">투표 진행중</span>'
          }
          <span class="vote-voter-id-info">내 식별코드: <code>${escapeHtml(getOrCreateVoterId().slice(-6))}</code></span>
        </div>
        <h2 class="vote-title">${escapeHtml(topic.title)}</h2>
        ${
          topic.description
            ? `<p class="vote-description">${escapeHtml(topic.description)}</p>`
            : ''
        }
      </div>

      <form id="vote-form" class="vote-form">
        <div class="vote-options-group">
          ${optionsHtml}
        </div>

        <div id="vote-message" class="vote-message" hidden></div>

        <div class="vote-actions">
          ${
            alreadyVoted
              ? `
                <div class="vote-already-box">
                  <p class="vote-already-text">이미 이 투표에 참여하셨습니다. (1인 1표 제한)</p>
                  <span class="vote-already-sub">하단 결과 창에서 실시간 득표율을 확인하실 수 있습니다.</span>
                </div>
              `
              : `
                <button
                  type="submit"
                  class="vote-btn-submit"
                  id="btn-vote-submit"
                  ${!state.selectedOptionId ? 'disabled' : ''}
                >
                  투표 제출하기
                </button>
              `
          }
        </div>
      </form>
    </div>
  `;

  bindVoteEvents(container);
}

/**
 * 이벤트 바인딩
 */
function bindVoteEvents(container) {
  const form = container.querySelector('#vote-form');
  const optionRadios = container.querySelectorAll('.vote-option-radio');
  const submitBtn = container.querySelector('#btn-vote-submit');
  const messageBox = container.querySelector('#vote-message');

  // 라디오 선택 이벤트
  optionRadios.forEach((radio) => {
    radio.addEventListener('change', (e) => {
      state.selectedOptionId = e.target.value;
      container.querySelectorAll('.vote-option-item').forEach((item) => {
        item.classList.remove('is-selected');
      });
      const parentLabel = e.target.closest('.vote-option-item');
      if (parentLabel) parentLabel.classList.add('is-selected');

      if (submitBtn) submitBtn.disabled = false;
      if (messageBox) messageBox.hidden = true;
    });
  });

  // 투표 제출 폼 처리
  if (form) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();

      if (!state.currentTopic) {
        showMessage(messageBox, '투표할 주제가 선택되지 않았습니다.', 'error');
        return;
      }

      if (!state.selectedOptionId) {
        showMessage(messageBox, '투표할 항목을 하나 선택해 주세요.', 'error');
        return;
      }

      const voterId = getOrCreateVoterId();

      // 중복 체크
      if (hasUserVoted(state.currentTopic.id, state.currentTopic)) {
        showMessage(messageBox, '이미 참여한 투표입니다. 중복 투표는 허용되지 않습니다.', 'error');
        renderVoteSection(container);
        return;
      }

      const store = getStore();
      const result = store.castVote(state.currentTopic.id, state.selectedOptionId, voterId);

      if (!result.success) {
        showMessage(messageBox, result.message || '투표 처리에 실패했습니다.', 'error');
        return;
      }

      // 1인 1표 로컬 기록 저장
      recordUserVote(state.currentTopic.id, state.selectedOptionId);

      // 최신 상태 반영
      state.currentTopic = result.topic;

      // 성공 메시지 및 다시 렌더링 (투표 완료 상태로 전환)
      renderVoteSection(container);

      // 이벤트 전파: 다른 모듈(목록의 카운트 갱신, 결과창의 그래프 갱신)
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('vote:submitted', {
            detail: {
              topicId: state.currentTopic.id,
              optionId: state.selectedOptionId,
              topic: state.currentTopic
            }
          })
        );
      }

      if (typeof state.onVoteSubmittedCallback === 'function') {
        state.onVoteSubmittedCallback(state.currentTopic);
      }
    });
  }
}

function showMessage(element, text, type = 'info') {
  if (!element) return;
  element.textContent = text;
  element.className = `vote-message vote-message-${type}`;
  element.hidden = false;
}

/**
 * 모듈 초기화 함수
 * @param {object} options
 */
export function initVoteSystem(options = {}) {
  const {
    container = '#vote-section',
    store = null,
    onVoteSubmitted = null
  } = options;

  if (store) state.externalStore = store;
  if (onVoteSubmitted) state.onVoteSubmittedCallback = onVoteSubmitted;

  if (typeof document === 'undefined') return null;

  const targetEl = typeof container === 'string'
    ? document.querySelector(container)
    : container;

  if (!targetEl) return null;

  // 작업자 1(토픽 선택) 및 공유 서버 갱신 이벤트 수신
  if (typeof window !== 'undefined') {
    window.addEventListener('topic:selected', (e) => {
      const topic = e.detail?.topic;
      if (topic) {
        state.currentTopic = topic;
        state.selectedOptionId = null;
        renderVoteSection(targetEl);
      }
    });

    window.addEventListener('store:updated', () => {
      const topics = getStore().getTopics() || [];
      if (state.currentTopic) {
        const updated = topics.find((t) => t.id === state.currentTopic.id);
        if (updated) {
          state.currentTopic = updated;
          renderVoteSection(targetEl);
        }
      } else if (topics.length > 0) {
        state.currentTopic = topics[0];
        renderVoteSection(targetEl);
      }
    });
  }

  // 초기 렌더링
  renderVoteSection(targetEl);

  return {
    setTopic: (topic) => {
      state.currentTopic = topic;
      state.selectedOptionId = null;
      renderVoteSection(targetEl);
    },
    hasVoted: (topicId) => hasUserVoted(topicId),
    refresh: () => renderVoteSection(targetEl)
  };
}

// 브라우저 전역 등록
if (typeof window !== 'undefined') {
  window.VoteSystem = {
    initVoteSystem,
    renderVoteSection,
    hasUserVoted,
    getOrCreateVoterId,
    recordUserVote
  };

  if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', () => {
      const defaultContainer = document.querySelector('#vote-section');
      if (defaultContainer && !defaultContainer.hasChildNodes()) {
        initVoteSystem({ container: defaultContainer });
      }
    });
  }
}
