/**
 * Vercel Serverless Function: 모든 사용자 간 투표 주제 및 득표수 실시간 공유 API (api/topics.js)
 *
 * 저장소 우선순위:
 * 1. Upstash Redis (Vercel Marketplace 연동 시 UPSTASH_REDIS_REST_URL / KV_REST_API_URL 자동 인식)
 * 2. Vercel Fluid Compute 공유 인스턴스 상태 (환경변수 미설정 시에도 즉시 공유 동작)
 */

const REDIS_KEY = 'vibe_vote_shared_topics_v1';

const INITIAL_TOPICS = [
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
    voters: ['user_sample_1', 'user_sample_2']
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
    voters: ['user_sample_3']
  }
];

function getRedisConfig() {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (url && token) {
    return { url: url.replace(/\/$/, ''), token };
  }
  return null;
}

function getFallbackTopics() {
  if (!Array.isArray(globalThis.__VIBE_SHARED_TOPICS__)) {
    globalThis.__VIBE_SHARED_TOPICS__ = structuredClone(INITIAL_TOPICS);
  }
  return globalThis.__VIBE_SHARED_TOPICS__;
}

function setFallbackTopics(topics) {
  globalThis.__VIBE_SHARED_TOPICS__ = topics;
}

async function loadSharedTopics() {
  const redis = getRedisConfig();
  if (!redis) {
    return { topics: getFallbackTopics(), storageType: 'memory' };
  }

  try {
    const res = await fetch(`${redis.url}/get/${REDIS_KEY}`, {
      headers: { Authorization: `Bearer ${redis.token}` },
      cache: 'no-store'
    });
    if (!res.ok) {
      throw new Error(`Redis GET failed with status ${res.status}`);
    }
    const data = await res.json();
    if (!data.result) {
      await saveSharedTopics(INITIAL_TOPICS);
      return { topics: structuredClone(INITIAL_TOPICS), storageType: 'upstash-redis' };
    }
    const parsed = typeof data.result === 'string' ? JSON.parse(data.result) : data.result;
    if (Array.isArray(parsed)) {
      return { topics: parsed, storageType: 'upstash-redis' };
    }
    return { topics: structuredClone(INITIAL_TOPICS), storageType: 'upstash-redis' };
  } catch (error) {
    console.error('[api/topics] Failed to load topics from Upstash Redis:', error);
    return { topics: getFallbackTopics(), storageType: 'memory-fallback' };
  }
}

async function saveSharedTopics(topics) {
  setFallbackTopics(topics);
  const redis = getRedisConfig();
  if (!redis) return;

  try {
    const res = await fetch(`${redis.url}/set/${REDIS_KEY}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${redis.token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(topics)
    });
    if (!res.ok) {
      throw new Error(`Redis SET failed with status ${res.status}`);
    }
  } catch (error) {
    console.error('[api/topics] Failed to save topics to Upstash Redis:', error);
  }
}

export async function GET() {
  try {
    const { topics, storageType } = await loadSharedTopics();
    return Response.json(
      { ok: true, storageType, topics },
      {
        status: 200,
        headers: { 'Cache-Control': 'no-store, max-age=0' }
      }
    );
  } catch (error) {
    console.error('[api/topics GET] Unexpected error:', error);
    return Response.json(
      { ok: false, message: '투표 목록을 불러오지 못했습니다.' },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { action } = body || {};
    const { topics, storageType } = await loadSharedTopics();

    // 1. 새 투표 주제 추가
    if (action === 'addTopic') {
      const { topic } = body;
      if (!topic || !topic.id || !topic.title || !Array.isArray(topic.options)) {
        return Response.json(
          { ok: false, message: '유효하지 않은 투표 주제 데이터입니다.' },
          { status: 400 }
        );
      }
      const updated = [topic, ...topics.filter((t) => t.id !== topic.id)];
      await saveSharedTopics(updated);
      return Response.json({
        ok: true,
        storageType,
        topic,
        topics: updated
      });
    }

    // 2. 투표 참여 (서버 측 1인 1표 중복 검증 포함)
    if (action === 'castVote') {
      const { topicId, optionId, voterId } = body;
      if (!topicId || !optionId || !voterId) {
        return Response.json(
          { ok: false, message: '투표 주제, 선택지, 참여자 식별값이 모두 필요합니다.' },
          { status: 400 }
        );
      }

      const topicIndex = topics.findIndex((t) => t.id === topicId);
      if (topicIndex === -1) {
        return Response.json(
          { ok: false, message: '해당 투표 주제를 찾을 수 없습니다.' },
          { status: 404 }
        );
      }

      const topic = topics[topicIndex];
      topic.voters = Array.isArray(topic.voters) ? topic.voters : [];

      if (topic.voters.includes(voterId)) {
        return Response.json(
          { ok: false, message: '이미 참여한 투표입니다. (중복 투표 불가)', topic, topics },
          { status: 409 }
        );
      }

      const option = (topic.options || []).find((opt) => opt.id === optionId);
      if (!option) {
        return Response.json(
          { ok: false, message: '선택한 항목이 존재하지 않습니다.' },
          { status: 404 }
        );
      }

      option.votes = (Number(option.votes) || 0) + 1;
      topic.voters.push(voterId);
      topics[topicIndex] = topic;

      await saveSharedTopics(topics);

      return Response.json({
        ok: true,
        storageType,
        topic,
        topics
      });
    }

    return Response.json(
      { ok: false, message: '지원하지 않는 요청(action)입니다.' },
      { status: 400 }
    );
  } catch (error) {
    console.error('[api/topics POST] Unexpected error:', error);
    return Response.json(
      { ok: false, message: '서버 요청 처리 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

