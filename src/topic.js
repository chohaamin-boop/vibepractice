/**
 * 작업자 1 담당 모듈: 투표 주제 생성 및 목록 관리 (src/topic.js)
 *
 * 주요 기능:
 * 1. 새 투표 주제 생성 폼 및 모달 UI 렌더링
 * 2. 선택지(옵션) 동적 추가 및 삭제 (최소 2개 ~ 최대 10개)
 * 3. 입력값 유효성 검사 (빈 제목, 선택지 부족, 중복 선택지 방지)
 * 4. 전체 투표 주제 목록 카드 렌더링, 검색 및 정렬
 * 5. 작업자 2(투표 모듈) 및 작업자 3(스토어/결과 모듈)과의 데이터·이벤트 연동
 */

const STORAGE_KEY = 'vibe_vote_topics';
const MIN_OPTIONS = 2;
const MAX_OPTIONS = 10;

// 초기 샘플 데이터 (작업자 3의 store.js가 아직 로드되지 않았을 때 사용되는 기본값)
const DEFAULT_TOPICS = [
  {
    id: 'topic_1730000001',
    title: '오늘 팀 점심 메뉴 투표',
    description: '가장 먹고 싶은 점심 메뉴 한 가지를 골라주세요! (중복 투표 불가)',
    createdAt: '2026-11-04T11:30:00',
    options: [
      { id: 'opt_1', text: '김치찌개 & 계란말이', votes: 5 },
      { id: 'opt_2', text: '수제 등심 돈까스', votes: 8 },
      { id: 'opt_3', text: '연어 초밥 세트', votes: 3 }
    ],
    voters: ['user_a', 'user_b']
  },
  {
    id: 'topic_1730000002',
    title: '다음 스프린트 회고 요일 선택',
    description: '팀원 모두가 참석 가능한 선호 요일에 투표해 주세요.',
    createdAt: '2026-11-04T12:00:00',
    options: [
      { id: 'opt_1', text: '목요일 오후 4시', votes: 4 },
      { id: 'opt_2', text: '금요일 오후 2시', votes: 7 },
      { id: 'opt_3', text: '금요일 오후 4시', votes: 2 }
    ],
    voters: ['user_c']
  }
];

/**
 * 내부 상태 관리
 */
const state = {
  selectedTopicId: null,
  searchQuery: '',
  sortBy: 'latest', // 'latest' | 'popular'
  isModalOpen: false,
  draftOptions: ['', ''], // 생성 폼의 기본 선택지 2개
  externalStore: null,
  onSelectCallback: null
};

/**
 * 작업자 3의 store.js와 연동하기 위한 스토어 어댑터
 * 외부 store가 주입되거나 window.store / window.VibeStore가 있으면 우선 사용하고,
 * 없을 경우 localStorage를 직접 사용하여 단독 실행도 지원합니다.
 */
function getStore() {
  if (state.externalStore) {
    return state.externalStore;
  }
  if (typeof window !== 'undefined') {
    if (window.VibeStore) return window.VibeStore;
    if (window.store) return window.store;
  }
  return {
    getTopics() {
      if (typeof localStorage === 'undefined') return [...DEFAULT_TOPICS];
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_TOPICS));
        return [...DEFAULT_TOPICS];
      }
      try {
        return JSON.parse(raw);
      } catch {
        return [...DEFAULT_TOPICS];
      }
    },
    addTopic(newTopic) {
      const topics = this.getTopics();
      const updated = [newTopic, ...topics];
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      }
      return newTopic;
    }
  };
}

/**
 * HTML 특수문자 이스케이프 (XSS 방지)
 * @param {string} str
 * @returns {string}
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
 * 투표 주제 생성 입력값 유효성 검사
 * @param {{ title: string, description?: string, options: string[] }} input
 * @returns {{ valid: boolean, message: string, cleanedOptions: string[] }}
 */
export function validateTopicInput({ title, description = '', options = [] }) {
  const trimmedTitle = String(title ?? '').trim();
  if (!trimmedTitle) {
    return {
      valid: false,
      message: '투표 제목을 입력해 주세요.',
      cleanedOptions: []
    };
  }
  if (trimmedTitle.length < 2) {
    return {
      valid: false,
      message: '투표 제목은 최소 2글자 이상 입력해 주세요.',
      cleanedOptions: []
    };
  }
  if (trimmedTitle.length > 80) {
    return {
      valid: false,
      message: '투표 제목은 80자 이내로 입력해 주세요.',
      cleanedOptions: []
    };
  }
  if (String(description ?? '').trim().length > 300) {
    return {
      valid: false,
      message: '상세 설명은 300자 이내로 입력해 주세요.',
      cleanedOptions: []
    };
  }

  // 빈 문자열을 제외한 유효 선택지 추출
  const cleanedOptions = options
    .map((opt) => String(opt ?? '').trim())
    .filter((opt) => opt.length > 0);

  if (cleanedOptions.length < MIN_OPTIONS) {
    return {
      valid: false,
      message: `최소 ${MIN_OPTIONS}개 이상의 선택지를 입력해 주세요.`,
      cleanedOptions
    };
  }

  if (cleanedOptions.length > MAX_OPTIONS) {
    return {
      valid: false,
      message: `선택지는 최대 ${MAX_OPTIONS}개까지만 등록할 수 있습니다.`,
      cleanedOptions
    };
  }

  // 중복 선택지 검사 (대소문자 및 앞뒤 공백 무시)
  const normalizedSet = new Set(cleanedOptions.map((opt) => opt.toLowerCase()));
  if (normalizedSet.size !== cleanedOptions.length) {
    return {
      valid: false,
      message: '중복된 선택지가 있습니다. 서로 다른 선택지를 입력해 주세요.',
      cleanedOptions
    };
  }

  return {
    valid: true,
    message: '유효한 입력입니다.',
    cleanedOptions
  };
}

/**
 * PROJECT_PLAN.md의 공통 데이터 규약(Topic Schema)에 맞는 새 투표 객체 생성
 * @param {{ title: string, description?: string, options: string[] }} params
 * @returns {object} Topic 객체
 */
export function createTopicObject({ title, description = '', options = [] }) {
  const now = new Date();
  const timestamp = now.getTime();
  return {
    id: `topic_${timestamp}`,
    title: String(title).trim(),
    description: String(description ?? '').trim(),
    createdAt: now.toISOString().slice(0, 19),
    options: options.map((text, index) => ({
      id: `opt_${index + 1}`,
      text: String(text).trim(),
      votes: 0
    })),
    voters: []
  };
}

/**
 * 주제의 총 득표수 합산
 * @param {object} topic
 * @returns {number}
 */
function getTotalVotes(topic) {
  if (!topic || !Array.isArray(topic.options)) return 0;
  return topic.options.reduce((sum, opt) => sum + (Number(opt.votes) || 0), 0);
}

/**
 * 날짜 문자열을 읽기 좋은 한국어 형식으로 변환
 * @param {string} isoString
 * @returns {string}
 */
function formatDate(isoString) {
  if (!isoString) return '';
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return isoString;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${year}.${month}.${day} ${hours}:${minutes}`;
}

/**
 * 검색어 및 정렬 기준에 따라 투표 목록 필터링
 * @param {Array} topics
 * @returns {Array}
 */
function getFilteredTopics(topics) {
  const query = state.searchQuery.trim().toLowerCase();
  const filtered = topics.filter((topic) => {
    if (!query) return true;
    const matchTitle = String(topic.title ?? '').toLowerCase().includes(query);
    const matchDesc = String(topic.description ?? '').toLowerCase().includes(query);
    const matchOptions =
      Array.isArray(topic.options) &&
      topic.options.some((opt) => String(opt.text ?? '').toLowerCase().includes(query));
    return matchTitle || matchDesc || matchOptions;
  });

  return filtered.sort((a, b) => {
    if (state.sortBy === 'popular') {
      return getTotalVotes(b) - getTotalVotes(a);
    }
    return String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? ''));
  });
}

/**
 * 다른 모듈(작업자 2, 작업자 3)과 통신하기 위한 커스텀 이벤트 디스패치
 * @param {string} eventName
 * @param {object} detail
 */
function emitTopicEvent(eventName, detail) {
  if (typeof window !== 'undefined' && typeof CustomEvent !== 'undefined') {
    window.dispatchEvent(new CustomEvent(eventName, { detail }));
  }
}

/**
 * 전체 투표 주제 관리 섹션 렌더링
 * @param {HTMLElement} container
 */
export function renderTopicList(container) {
  if (!container) return;

  const store = getStore();
  const allTopics = store.getTopics() || [];
  const filteredTopics = getFilteredTopics(allTopics);

  // 선택된 주제가 없으면 첫 번째 주제를 기본 선택
  if (!state.selectedTopicId && allTopics.length > 0) {
    state.selectedTopicId = allTopics[0].id;
  }

  const cardsHtml =
    filteredTopics.length === 0
      ? `
      <div class="topic-empty-state">
        <p class="topic-empty-title">등록된 투표 주제가 없습니다.</p>
        <p class="topic-empty-desc">우측 상단의 <strong>+ 새 투표 만들기</strong> 버튼을 눌러 첫 투표를 시작해 보세요!</p>
      </div>
    `
      : filteredTopics
          .map((topic) => {
            const totalVotes = getTotalVotes(topic);
            const isSelected = topic.id === state.selectedTopicId;
            const optionPreview = (topic.options || [])
              .slice(0, 3)
              .map((opt) => `<span class="topic-option-chip">${escapeHtml(opt.text)}</span>`)
              .join('');
            const extraCount = (topic.options || []).length - 3;
            const extraBadge =
              extraCount > 0
                ? `<span class="topic-option-chip topic-option-more">+${extraCount}개</span>`
                : '';

            return `
            <article
              class="topic-card ${isSelected ? 'is-selected' : ''}"
              data-topic-id="${escapeHtml(topic.id)}"
              tabindex="0"
              role="button"
              aria-pressed="${isSelected}"
            >
              <div class="topic-card-header">
                <span class="topic-badge-status">진행중</span>
                <span class="topic-vote-count">총 <strong>${totalVotes}</strong>표 참여</span>
              </div>
              <h3 class="topic-card-title">${escapeHtml(topic.title)}</h3>
              ${
                topic.description
                  ? `<p class="topic-card-desc">${escapeHtml(topic.description)}</p>`
                  : ''
              }
              <div class="topic-option-chips">
                ${optionPreview}
                ${extraBadge}
              </div>
              <div class="topic-card-footer">
                <span class="topic-card-date">${escapeHtml(formatDate(topic.createdAt))}</span>
                <span class="topic-card-action">${isSelected ? '현재 선택됨 ✓' : '투표/결과 보기 →'}</span>
              </div>
            </article>
          `;
          })
          .join('');

  const optionInputsHtml = state.draftOptions
    .map(
      (val, idx) => `
      <div class="topic-option-row" data-option-index="${idx}">
        <span class="topic-option-number">${idx + 1}</span>
        <input
          type="text"
          class="topic-input topic-option-input"
          name="topic-option"
          placeholder="선택지 ${idx + 1} 내용을 입력하세요"
          value="${escapeHtml(val)}"
          maxlength="60"
          required
        />
        <button
          type="button"
          class="topic-btn-remove-option"
          data-remove-index="${idx}"
          title="선택지 삭제"
          ${state.draftOptions.length <= MIN_OPTIONS ? 'disabled' : ''}
        >
          ✕
        </button>
      </div>
    `
    )
    .join('');

  container.innerHTML = `
    <div class="topic-manager-wrapper">
      <!-- 상단 헤더 및 새 투표 만들기 버튼 -->
      <div class="topic-header-bar">
        <div class="topic-header-title-group">
          <h2 class="topic-section-title">투표 주제 목록</h2>
          <span class="topic-total-badge">${allTopics.length}개의 투표</span>
        </div>
        <button type="button" class="topic-btn-primary" id="btn-open-topic-modal">
          + 새 투표 만들기
        </button>
      </div>

      <!-- 검색 및 정렬 툴바 -->
      <div class="topic-toolbar">
        <div class="topic-search-box">
          <input
            type="search"
            id="topic-search-input"
            class="topic-input topic-search-input"
            placeholder="투표 제목, 설명, 선택지 검색..."
            value="${escapeHtml(state.searchQuery)}"
          />
        </div>
        <div class="topic-sort-box">
          <label for="topic-sort-select" class="sr-only">정렬 기준</label>
          <select id="topic-sort-select" class="topic-select">
            <option value="latest" ${state.sortBy === 'latest' ? 'selected' : ''}>최신 등록순</option>
            <option value="popular" ${state.sortBy === 'popular' ? 'selected' : ''}>참여 많은순</option>
          </select>
        </div>
      </div>

      <!-- 투표 카드 그리드 목록 -->
      <div class="topic-card-list" id="topic-card-list">
        ${cardsHtml}
      </div>

      <!-- 새 투표 주제 생성 모달/폼 -->
      <div
        class="topic-modal-backdrop ${state.isModalOpen ? 'is-open' : ''}"
        id="topic-modal-backdrop"
        aria-hidden="${!state.isModalOpen}"
      >
        <div class="topic-modal" role="dialog" aria-modal="true" aria-labelledby="topic-modal-title">
          <div class="topic-modal-header">
            <h3 id="topic-modal-title" class="topic-modal-title">새 투표 주제 만들기</h3>
            <button type="button" class="topic-modal-close" id="btn-close-topic-modal" aria-label="닫기">
              ✕
            </button>
          </div>

          <form id="topic-create-form" class="topic-create-form" novalidate>
            <div class="topic-form-group">
              <label for="topic-title-input" class="topic-label">
                투표 제목 <span class="topic-required">*</span>
              </label>
              <input
                type="text"
                id="topic-title-input"
                name="title"
                class="topic-input"
                placeholder="예: 이번 주 회식 장소는 어디가 좋을까요?"
                maxlength="80"
                required
              />
            </div>

            <div class="topic-form-group">
              <label for="topic-desc-input" class="topic-label">
                상세 설명 <span class="topic-optional">(선택)</span>
              </label>
              <textarea
                id="topic-desc-input"
                name="description"
                class="topic-textarea"
                rows="2"
                placeholder="참여자들에게 안내할 설명이나 투표 기준을 적어주세요."
                maxlength="300"
              ></textarea>
            </div>

            <div class="topic-form-group">
              <div class="topic-options-header">
                <label class="topic-label">
                  투표 선택지 <span class="topic-required">* (최소 ${MIN_OPTIONS}개 ~ 최대 ${MAX_OPTIONS}개)</span>
                </label>
                <button
                  type="button"
                  class="topic-btn-add-option"
                  id="btn-add-option"
                  ${state.draftOptions.length >= MAX_OPTIONS ? 'disabled' : ''}
                >
                  + 선택지 추가
                </button>
              </div>
              <div class="topic-options-container" id="topic-options-container">
                ${optionInputsHtml}
              </div>
            </div>

            <p class="topic-form-error" id="topic-form-error" role="alert" hidden></p>

            <div class="topic-modal-footer">
              <button type="button" class="topic-btn-secondary" id="btn-cancel-topic-modal">
                취소
              </button>
              <button type="submit" class="topic-btn-primary" id="btn-submit-topic">
                투표 등록하기
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  `;

  bindTopicEvents(container);
}

/**
 * 모달 내 선택지 입력창 값들을 state.draftOptions에 동기화
 * @param {HTMLElement} container
 */
function syncDraftInputs(container) {
  const inputs = container.querySelectorAll('.topic-option-input');
  if (inputs.length > 0) {
    state.draftOptions = Array.from(inputs).map((input) => input.value);
  }
}

/**
 * 모달 내 선택지 목록 영역만 부분 갱신 (제목/설명 입력값 유지)
 * @param {HTMLElement} container
 */
function refreshOptionInputsUI(container) {
  const optionsContainer = container.querySelector('#topic-options-container');
  const addBtn = container.querySelector('#btn-add-option');
  if (!optionsContainer) return;

  optionsContainer.innerHTML = state.draftOptions
    .map(
      (val, idx) => `
      <div class="topic-option-row" data-option-index="${idx}">
        <span class="topic-option-number">${idx + 1}</span>
        <input
          type="text"
          class="topic-input topic-option-input"
          name="topic-option"
          placeholder="선택지 ${idx + 1} 내용을 입력하세요"
          value="${escapeHtml(val)}"
          maxlength="60"
          required
        />
        <button
          type="button"
          class="topic-btn-remove-option"
          data-remove-index="${idx}"
          title="선택지 삭제"
          ${state.draftOptions.length <= MIN_OPTIONS ? 'disabled' : ''}
        >
          ✕
        </button>
      </div>
    `
    )
    .join('');

  if (addBtn) {
    addBtn.disabled = state.draftOptions.length >= MAX_OPTIONS;
  }
}

/**
 * 에러 메시지 표시/숨김 도우미
 * @param {HTMLElement} container
 * @param {string} message
 */
function showFormError(container, message) {
  const errorEl = container.querySelector('#topic-form-error');
  if (!errorEl) return;
  if (!message) {
    errorEl.textContent = '';
    errorEl.hidden = true;
  } else {
    errorEl.textContent = message;
    errorEl.hidden = false;
  }
}

/**
 * 이벤트 리스너 바인딩
 * @param {HTMLElement} container
 */
function bindTopicEvents(container) {
  const openModalBtn = container.querySelector('#btn-open-topic-modal');
  const closeModalBtn = container.querySelector('#btn-close-topic-modal');
  const cancelModalBtn = container.querySelector('#btn-cancel-topic-modal');
  const modalBackdrop = container.querySelector('#topic-modal-backdrop');
  const addOptionBtn = container.querySelector('#btn-add-option');
  const optionsContainer = container.querySelector('#topic-options-container');
  const createForm = container.querySelector('#topic-create-form');
  const searchInput = container.querySelector('#topic-search-input');
  const sortSelect = container.querySelector('#topic-sort-select');
  const cardList = container.querySelector('#topic-card-list');

  // 모달 열기
  if (openModalBtn) {
    openModalBtn.addEventListener('click', () => {
      state.isModalOpen = true;
      state.draftOptions = ['', ''];
      renderTopicList(container);
      const titleInput = container.querySelector('#topic-title-input');
      if (titleInput) titleInput.focus();
    });
  }

  // 모달 닫기 함수
  const closeModal = () => {
    state.isModalOpen = false;
    state.draftOptions = ['', ''];
    renderTopicList(container);
  };

  if (closeModalBtn) closeModalBtn.addEventListener('click', closeModal);
  if (cancelModalBtn) cancelModalBtn.addEventListener('click', closeModal);
  if (modalBackdrop) {
    modalBackdrop.addEventListener('click', (e) => {
      if (e.target === modalBackdrop) closeModal();
    });
  }

  // 선택지 동적 추가
  if (addOptionBtn) {
    addOptionBtn.addEventListener('click', () => {
      syncDraftInputs(container);
      if (state.draftOptions.length >= MAX_OPTIONS) {
        showFormError(container, `선택지는 최대 ${MAX_OPTIONS}개까지 추가할 수 있습니다.`);
        return;
      }
      state.draftOptions.push('');
      showFormError(container, '');
      refreshOptionInputsUI(container);
      const inputs = container.querySelectorAll('.topic-option-input');
      if (inputs.length > 0) inputs[inputs.length - 1].focus();
    });
  }

  // 선택지 동적 삭제 (이벤트 위임)
  if (optionsContainer) {
    optionsContainer.addEventListener('click', (e) => {
      const removeBtn = e.target.closest('.topic-btn-remove-option');
      if (!removeBtn) return;
      syncDraftInputs(container);
      if (state.draftOptions.length <= MIN_OPTIONS) {
        showFormError(container, `최소 ${MIN_OPTIONS}개의 선택지가 필요합니다.`);
        return;
      }
      const removeIdx = Number(removeBtn.dataset.removeIndex);
      if (!Number.isNaN(removeIdx)) {
        state.draftOptions.splice(removeIdx, 1);
        showFormError(container, '');
        refreshOptionInputsUI(container);
      }
    });
  }

  // 새 투표 주제 폼 제출
  if (createForm) {
    createForm.addEventListener('submit', (e) => {
      e.preventDefault();
      syncDraftInputs(container);

      const titleInput = container.querySelector('#topic-title-input');
      const descInput = container.querySelector('#topic-desc-input');
      const title = titleInput ? titleInput.value : '';
      const description = descInput ? descInput.value : '';

      const validation = validateTopicInput({
        title,
        description,
        options: state.draftOptions
      });

      if (!validation.valid) {
        showFormError(container, validation.message);
        return;
      }

      const newTopic = createTopicObject({
        title,
        description,
        options: validation.cleanedOptions
      });

      const store = getStore();
      store.addTopic(newTopic);

      state.selectedTopicId = newTopic.id;
      state.isModalOpen = false;
      state.draftOptions = ['', ''];

      renderTopicList(container);

      // 작업자 2(투표 모듈) 및 작업자 3(결과 모듈)에 이벤트 전파
      emitTopicEvent('topic:created', { topic: newTopic, topicId: newTopic.id });
      emitTopicEvent('topic:selected', { topic: newTopic, topicId: newTopic.id });
      if (typeof state.onSelectCallback === 'function') {
        state.onSelectCallback(newTopic);
      }
    });
  }

  // 검색어 입력
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      state.searchQuery = e.target.value;
      const cursorPosition = e.target.selectionStart;
      renderTopicList(container);
      const newSearchInput = container.querySelector('#topic-search-input');
      if (newSearchInput) {
        newSearchInput.focus();
        newSearchInput.setSelectionRange(cursorPosition, cursorPosition);
      }
    });
  }

  // 정렬 변경
  if (sortSelect) {
    sortSelect.addEventListener('change', (e) => {
      state.sortBy = e.target.value;
      renderTopicList(container);
    });
  }

  // 투표 주제 카드 선택 (클릭 및 키보드 Enter/Space 지원)
  if (cardList) {
    const selectCard = (cardEl) => {
      const topicId = cardEl.dataset.topicId;
      if (!topicId) return;
      state.selectedTopicId = topicId;
      renderTopicList(container);

      const store = getStore();
      const selectedTopic = (store.getTopics() || []).find((t) => t.id === topicId) || null;
      emitTopicEvent('topic:selected', { topic: selectedTopic, topicId });
      if (typeof state.onSelectCallback === 'function' && selectedTopic) {
        state.onSelectCallback(selectedTopic);
      }
    };

    cardList.addEventListener('click', (e) => {
      const cardEl = e.target.closest('.topic-card');
      if (cardEl) selectCard(cardEl);
    });

    cardList.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        const cardEl = e.target.closest('.topic-card');
        if (cardEl) {
          e.preventDefault();
          selectCard(cardEl);
        }
      }
    });
  }
}

/**
 * 투표 주제 관리 모듈 초기화 함수
 * @param {object} [options]
 * @param {HTMLElement|string} [options.container='#topic-section'] 렌더링할 DOM 요소 또는 선택자
 * @param {object} [options.store] 작업자 3의 store 객체 ({ getTopics, addTopic })
 * @param {Function} [options.onSelectTopic] 주제 카드 선택 시 호출할 콜백
 */
export function initTopicManager(options = {}) {
  const {
    container = '#topic-section',
    store = null,
    onSelectTopic = null
  } = options;

  if (store) state.externalStore = store;
  if (onSelectTopic) state.onSelectCallback = onSelectTopic;

  if (typeof document === 'undefined') return null;

  const targetEl = typeof container === 'string'
    ? document.querySelector(container)
    : container;

  if (!targetEl) return null;

  renderTopicList(targetEl);

  // 외부 모듈(작업자 2의 투표 완료 등)이나 공유 서버에서 데이터가 갱신되었을 때 목록 리렌더링
  window.addEventListener('vote:submitted', () => renderTopicList(targetEl));
  window.addEventListener('store:updated', () => {
    if (!state.isModalOpen) {
      renderTopicList(targetEl);
    }
  });

  // 초기 선택된 주제 알림
  const currentTopics = getStore().getTopics() || [];
  if (currentTopics.length > 0) {
    const initialTopic =
      currentTopics.find((t) => t.id === state.selectedTopicId) || currentTopics[0];
    state.selectedTopicId = initialTopic.id;
    emitTopicEvent('topic:selected', { topic: initialTopic, topicId: initialTopic.id });
    if (typeof state.onSelectCallback === 'function') {
      state.onSelectCallback(initialTopic);
    }
  }

  return {
    refresh: () => renderTopicList(targetEl),
    getSelectedTopicId: () => state.selectedTopicId
  };
}

// 브라우저 환경에서 페이지 로드 시 #topic-section이 존재하면 자동 마운트 및 전역 등록
if (typeof window !== 'undefined') {
  window.TopicManager = {
    initTopicManager,
    renderTopicManager: renderTopicList,
    renderTopicList,
    validateTopicInput,
    createTopicObject
  };

  if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', () => {
      const defaultContainer = document.querySelector('#topic-section');
      if (defaultContainer && !defaultContainer.hasChildNodes()) {
        initTopicManager({ container: defaultContainer });
      }
    });
  }
}
