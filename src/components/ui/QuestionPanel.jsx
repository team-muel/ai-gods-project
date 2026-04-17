import { useEffect, useMemo, useState } from 'react';
import { useDiscussionStore } from '../../store/discussionStore';
import { useWorkbenchStore } from '../../store/workbenchStore';
import {
  downloadBlobResult,
  exportWorkbenchArtifact,
  generateAutonomousTopics,
  generateOutlineDraft,
  generateWorkbenchArtifacts,
  getGoogleExportStatus,
  startGoogleOAuth,
  submitArtifactFeedback,
} from '../../services/workbenchService';
import { searchWeb } from '../../services/searchService';
import { extractVideoId, fetchTranscript, isYoutubeUrl } from '../../services/youtubeService';

const MODE_CARDS = [
  {
    id: 'docs',
    label: '문서 만들기',
    eyebrow: 'DOCUMENT STUDIO',
    accent: '#67e8f9',
    description: '브리프를 바탕으로 과제형 문서, 전략 메모, 분석 보고서를 바로 설계합니다.',
  },
  {
    id: 'ppt',
    label: 'PPT 만들기',
    eyebrow: 'DECK STUDIO',
    accent: '#93c5fd',
    description: '청중과 설득 목적에 맞춘 deck 구조를 먼저 설계하고 슬라이드로 전개합니다.',
  },
  {
    id: 'debate',
    label: '토론 실험실',
    eyebrow: 'DEBATE LAB',
    accent: '#f59e0b',
    description: '학습용 토론과 인사이트 수집을 위한 별도 실험실입니다. 문서/PPT의 필수 선행 단계가 아닙니다.',
  },
];

const THEME_OPTIONS = [
  { id: 'business', label: 'Business', note: '임원 보고, 전략 문서, 투자자용 정돈된 톤' },
  { id: 'editorial', label: 'Editorial', note: '해석과 논지를 앞세운 읽기 좋은 구성' },
  { id: 'academic', label: 'Academic', note: '과제물, 연구 발표, 근거 중심 구조' },
  { id: 'pitch', label: 'Bold Pitch', note: '짧고 강한 메시지, 설득 우선 전개' },
  { id: 'minimal-research', label: 'Minimal Research', note: '차분하고 정제된 리서치 표현' },
];

const TEXT_DENSITY_OPTIONS = [
  { id: 'light', label: '짧게', note: '한 페이지나 한 장에 메시지를 선명하게 압축' },
  { id: 'balanced', label: '보통', note: '설명과 압축의 균형을 유지' },
  { id: 'dense', label: '많이', note: '배경과 설명을 충분히 포함' },
];

const AI_IMAGE_OPTIONS = [
  { id: 'off', label: '사용 안 함', note: '텍스트, 수치, 도식 중심으로 구성' },
  { id: 'support', label: '보조 사용', note: '핵심 장면에만 이미지나 visual cue 사용' },
  { id: 'hero', label: '많이 사용', note: '장표마다 강한 시각적 분위기를 적극 반영' },
];

const CARD_COUNT_OPTIONS = [4, 6, 8, 10];

const LAYOUT_PRESET_OPTIONS = [
  { id: 'basic', label: '기본', note: '균형 잡힌 일반 작업물 구조' },
  { id: 'story', label: '서사형', note: '도입과 전개 흐름을 강조' },
  { id: 'grid', label: '카드형', note: '카드 단위 핵심 메시지를 분명하게 분리' },
];

const LANGUAGE_OPTIONS = [
  { id: 'ko', label: '한국어' },
  { id: 'en', label: 'English' },
];

const VISUAL_PRESET_OPTIONS = [
  {
    id: 'bee-happy',
    label: 'Bee Happy',
    frameBackground: 'linear-gradient(180deg, #111827 0%, #1f2937 100%)',
    cardBackground: 'rgba(31, 41, 55, 0.94)',
    titleColor: '#facc15',
    bodyColor: 'rgba(255, 255, 255, 0.9)',
    cardBorder: '1px solid rgba(250, 204, 21, 0.14)',
  },
  {
    id: 'clementa',
    label: 'Clementa',
    frameBackground: 'linear-gradient(180deg, #eadac2 0%, #f4e6cf 100%)',
    cardBackground: 'rgba(255, 248, 235, 0.96)',
    titleColor: '#7c3f2c',
    bodyColor: 'rgba(84, 55, 36, 0.88)',
    cardBorder: '1px solid rgba(124, 63, 44, 0.12)',
  },
  {
    id: 'stardust',
    label: 'Stardust',
    frameBackground: 'linear-gradient(180deg, #020617 0%, #111827 100%)',
    cardBackground: 'rgba(2, 6, 23, 0.92)',
    titleColor: '#f8fafc',
    bodyColor: 'rgba(226, 232, 240, 0.84)',
    cardBorder: '1px solid rgba(148, 163, 184, 0.18)',
  },
  {
    id: 'seafoam',
    label: 'Seafoam',
    frameBackground: 'linear-gradient(180deg, #d1fae5 0%, #cffafe 100%)',
    cardBackground: 'rgba(255, 255, 255, 0.94)',
    titleColor: '#1e3a8a',
    bodyColor: 'rgba(51, 65, 85, 0.88)',
    cardBorder: '1px solid rgba(30, 64, 175, 0.12)',
  },
  {
    id: 'aurum',
    label: 'Aurum',
    frameBackground: 'linear-gradient(135deg, #0f172a 0%, #1f2937 60%, #b45309 100%)',
    cardBackground: 'rgba(17, 24, 39, 0.94)',
    titleColor: '#fcd34d',
    bodyColor: 'rgba(255, 255, 255, 0.9)',
    cardBorder: '1px solid rgba(245, 158, 11, 0.18)',
  },
  {
    id: 'terracotta',
    label: 'Terracotta',
    frameBackground: 'linear-gradient(180deg, #f5e7e0 0%, #f8ede8 100%)',
    cardBackground: 'rgba(255, 255, 255, 0.95)',
    titleColor: '#7f1d1d',
    bodyColor: 'rgba(87, 35, 35, 0.84)',
    cardBorder: '1px solid rgba(127, 29, 29, 0.12)',
  },
];

const IMAGE_SOURCE_OPTIONS = [
  { id: 'ai', label: 'AI 이미지', note: '생성 이미지를 우선 사용' },
  { id: 'reference', label: '참조 이미지', note: '레퍼런스 톤을 우선 유지' },
  { id: 'hybrid', label: '혼합', note: '필요한 카드에만 시각 보강' },
];

const IMAGE_STYLE_PRESET_OPTIONS = [
  { id: 'isometric', label: '아이소메트릭', background: 'linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%)' },
  { id: 'bold-poster', label: '대담한 포스터', background: 'linear-gradient(135deg, #1e3a8a 0%, #ef4444 100%)' },
  { id: 'narrative', label: '내러티브', background: 'linear-gradient(135deg, #082f49 0%, #38bdf8 100%)' },
  { id: 'photo-real', label: '정물 사진', background: 'linear-gradient(135deg, #e7e5e4 0%, #c4b5fd 100%)' },
  { id: 'watercolor', label: '깔끔한 수채화', background: 'linear-gradient(135deg, #ecfccb 0%, #fef3c7 100%)' },
  { id: 'user-directed', label: '사용자 지정', background: 'linear-gradient(135deg, #e5e7eb 0%, #cbd5e1 100%)' },
];

const DEBATE_USAGE_OPTIONS = [
  { id: 'off', label: '사용 안 함', note: '브리프와 구조만으로 결과물을 설계' },
  { id: 'auto', label: '자동 참조', note: '토론이 있으면 필요한 부분만 보조적으로 사용' },
  { id: 'strong', label: '강하게 참조', note: '기존 토론 인사이트를 적극 반영' },
];

const SECTION_CITATION_OPTIONS = [
  { id: 'off', label: '인용 안 함', note: '이 항목은 메시지와 구조 중심으로 작성합니다.' },
  { id: 'optional', label: '선택 인용', note: '필요한 주장에만 논문이나 자료를 보조적으로 붙입니다.' },
  { id: 'required', label: '인용 필수', note: '핵심 주장마다 논문이나 자료 근거를 명시적으로 연결합니다.' },
];

const DOMAIN_LIBRARY = [
  {
    id: 'it',
    label: 'IT',
    note: 'AI, SaaS, 플랫폼, 제품 전략',
    docs: [
      { title: 'AI 에이전트 운영체제 시장의 2026 경쟁 구도를 경영진 보고서로 정리', audience: '경영진', theme: 'business', textDensity: 'balanced' },
      { title: '멀티모달 LLM의 기업 적용 사례를 대학 과제형 문서로 정리', audience: '교수 / 심사자', theme: 'academic', textDensity: 'dense' },
      { title: 'B2B SaaS에 AI copilots를 붙일 때의 제품 전략을 분석 메모로 작성', audience: '제품팀 / 전략팀', theme: 'editorial', textDensity: 'balanced' },
    ],
    ppt: [
      { title: 'AI 에이전트 시장의 투자 포인트를 투자자 deck으로 정리', audience: '투자자', theme: 'pitch', textDensity: 'light' },
      { title: '멀티모달 AI 도입 로드맵을 사내 경영진 발표자료로 구성', audience: '경영진', theme: 'business', textDensity: 'balanced' },
      { title: '오픈소스 LLM 서빙 전략을 연구발표형 슬라이드로 설명', audience: '기술 세미나 청중', theme: 'academic', textDensity: 'dense' },
    ],
  },
  {
    id: 'economics',
    label: '경제학',
    note: '시장 구조, 노동, 생산성, 수익모델',
    docs: [
      { title: '구독경제와 AI SaaS의 수익모델을 경영진 브리프로 정리', audience: '경영진', theme: 'business', textDensity: 'balanced' },
      { title: '생성형 AI 확산이 노동시장 생산성에 미치는 영향을 대학 과제 형식으로 작성', audience: '교수 / 심사자', theme: 'academic', textDensity: 'dense' },
      { title: 'AI 투자 붐이 스타트업 자본 조달 환경을 어떻게 바꾸는지 해석형 문서로 정리', audience: '전략팀', theme: 'editorial', textDensity: 'balanced' },
    ],
    ppt: [
      { title: 'AI 생산성 도입의 경제적 파급효과를 경영진 발표자료로 요약', audience: '경영진', theme: 'business', textDensity: 'light' },
      { title: '구독형 AI 서비스의 unit economics를 투자자용 deck으로 구성', audience: '투자자', theme: 'pitch', textDensity: 'light' },
      { title: '행동경제학 관점에서 AI 추천시스템의 소비자 반응을 연구 발표 자료로 작성', audience: '세미나 청중', theme: 'academic', textDensity: 'dense' },
    ],
  },
  {
    id: 'sociology',
    label: '사회학',
    note: '사회 구조, 신뢰, 제도, 플랫폼',
    docs: [
      { title: 'AI 감시기술이 사회적 신뢰에 미치는 영향을 비판적 보고서로 작성', audience: '교수 / 심사자', theme: 'academic', textDensity: 'dense' },
      { title: '플랫폼 노동과 알고리즘 관리 문제를 사회학적 분석 메모로 정리', audience: '정책팀', theme: 'editorial', textDensity: 'balanced' },
      { title: '생성형 AI가 창작자 정체성에 주는 영향을 인사이트 리포트로 구성', audience: '콘텐츠 전략팀', theme: 'business', textDensity: 'balanced' },
    ],
    ppt: [
      { title: '플랫폼 알고리즘이 노동자 통제에 미치는 영향을 발표자료로 구성', audience: '강연 청중', theme: 'editorial', textDensity: 'balanced' },
      { title: 'AI 감시기술의 사회적 비용을 정책 제안 deck으로 설명', audience: '정책 담당자', theme: 'business', textDensity: 'light' },
      { title: '디지털 사회에서 신뢰 붕괴와 회복 메커니즘을 연구 발표형 슬라이드로 작성', audience: '학술 세미나', theme: 'academic', textDensity: 'dense' },
    ],
  },
  {
    id: 'humanities',
    label: '인문학',
    note: '철학, 인간성, 윤리, 역사적 해석',
    docs: [
      { title: '생성형 AI와 저자성 개념의 변화를 인문학 과제 형식으로 작성', audience: '교수 / 심사자', theme: 'academic', textDensity: 'dense' },
      { title: '기술 발전과 인간성 문제를 비평 에세이형 문서로 정리', audience: '일반 독자', theme: 'editorial', textDensity: 'balanced' },
      { title: 'AI 윤리 논쟁을 역사적 전환점과 연결한 해설 보고서로 구성', audience: '교육 콘텐츠 기획자', theme: 'minimal-research', textDensity: 'balanced' },
    ],
    ppt: [
      { title: '생성형 AI와 인간 창의성 논쟁을 인문학 발표자료로 설명', audience: '강연 청중', theme: 'editorial', textDensity: 'balanced' },
      { title: '기술윤리와 책임 문제를 학부 발표용 슬라이드로 구성', audience: '학부 발표 청중', theme: 'academic', textDensity: 'balanced' },
      { title: 'AI 시대 인간성의 의미를 설득형 keynote deck으로 정리', audience: '컨퍼런스 청중', theme: 'pitch', textDensity: 'light' },
    ],
  },
  {
    id: 'physics',
    label: '물리학',
    note: '과학 개론, 기술 상용화, 연구 배경',
    docs: [
      { title: '양자컴퓨팅 상용화의 현실적 장벽을 개론 보고서로 정리', audience: '비전공 경영진', theme: 'minimal-research', textDensity: 'balanced' },
      { title: '핵융합 에너지의 최근 연구 동향을 대학 과제형 문서로 작성', audience: '교수 / 심사자', theme: 'academic', textDensity: 'dense' },
      { title: '우주산업에서 고체 물리 기반 기술이 사업화되는 경로를 해설형 문서로 정리', audience: '전략팀', theme: 'editorial', textDensity: 'balanced' },
    ],
    ppt: [
      { title: '양자컴퓨팅의 현재와 한계를 비전공자용 발표자료로 설명', audience: '비전공자', theme: 'business', textDensity: 'light' },
      { title: '핵융합 연구의 기술적 병목을 연구 발표형 deck으로 구성', audience: '세미나 청중', theme: 'academic', textDensity: 'dense' },
      { title: '우주산업 기술의 상업적 가능성을 투자자용 슬라이드로 요약', audience: '투자자', theme: 'pitch', textDensity: 'light' },
    ],
  },
  {
    id: 'other',
    label: '기타',
    note: '자유 주제, 융합형 프로젝트',
    docs: [
      { title: '사용자 정의 주제를 구조화된 전략 문서로 정리', audience: '원하는 독자층', theme: 'business', textDensity: 'balanced' },
      { title: '융합 주제를 학술형 보고서로 정리', audience: '교수 / 심사자', theme: 'academic', textDensity: 'dense' },
      { title: '하나의 메시지를 해석형 에세이 문서로 구성', audience: '일반 독자', theme: 'editorial', textDensity: 'balanced' },
    ],
    ppt: [
      { title: '사용자 정의 주제를 발표용 deck으로 빠르게 구성', audience: '원하는 청중', theme: 'business', textDensity: 'light' },
      { title: '융합 프로젝트를 스토리형 pitch deck으로 정리', audience: '투자자 / 파트너', theme: 'pitch', textDensity: 'light' },
      { title: '실험적 아이디어를 세미나 발표자료로 차분하게 설명', audience: '세미나 청중', theme: 'academic', textDensity: 'balanced' },
    ],
  },
];

const OUTLINE_PRESETS = {
  docs: {
    business: ['표지', 'Executive Summary', '배경과 맥락', '핵심 분석', '권고안', 'Appendix / Sources'],
    editorial: ['표지', '핵심 질문', '맥락', '주요 해석', '쟁점과 의미', '참고자료'],
    academic: ['표지', '문제 제기', '배경 / 선행연구', '핵심 분석', '결론 및 제언', '참고문헌'],
    pitch: ['표지', '왜 지금', '문제 정의', '기회와 방향', '실행 포인트', '다음 단계'],
    'minimal-research': ['표지', '연구 질문', '배경', '핵심 발견', '해석', '참고문헌'],
  },
  ppt: {
    business: ['Cover', 'Why Now', '핵심 인사이트', 'Evidence', 'Recommendation', 'Next Step'],
    editorial: ['Title', 'Question', 'Context', 'Interpretation', 'Tension', 'Takeaway'],
    academic: ['Title', 'Research Question', 'Background', 'Findings', 'Discussion', 'References'],
    pitch: ['Cover', 'Problem', 'Opportunity', 'Proof', 'Why Us', 'Ask'],
    'minimal-research': ['Title', 'Question', 'Background', 'Insight', 'Implication', 'References'],
  },
};

const DEFAULT_DOC_BRIEF = {
  overview: '',
  userRole: '',
  audience: '경영진',
  domain: 'it',
  theme: 'business',
  visualPreset: 'bee-happy',
  textDensity: 'balanced',
  aiImageMode: 'support',
  imageSource: 'ai',
  imageStylePreset: 'bold-poster',
  cardCount: 8,
  layoutPreset: 'basic',
  language: 'ko',
  writingNote: '',
  toneNote: '',
  outlineTitles: [],
  sectionPlans: [],
  debateUsage: 'auto',
};

const DEFAULT_PPT_BRIEF = {
  overview: '',
  userRole: '',
  audience: '투자자 / 경영진',
  domain: 'it',
  theme: 'pitch',
  visualPreset: 'stardust',
  textDensity: 'light',
  aiImageMode: 'hero',
  imageSource: 'ai',
  imageStylePreset: 'bold-poster',
  cardCount: 6,
  layoutPreset: 'grid',
  language: 'ko',
  writingNote: '',
  toneNote: '',
  outlineTitles: [],
  sectionPlans: [],
  debateUsage: 'auto',
};

const cleanText = (value = '') => String(value || '').replace(/\s+/g, ' ').trim();
const cleanFreeformText = (value = '') => String(value || '').replace(/\r/g, '').trim();

const getDomainEntry = (domainId = 'other') => DOMAIN_LIBRARY.find((item) => item.id === domainId) || DOMAIN_LIBRARY[DOMAIN_LIBRARY.length - 1];
const getThemeEntry = (themeId = 'business') => THEME_OPTIONS.find((item) => item.id === themeId) || THEME_OPTIONS[0];
const getTextDensityEntry = (densityId = 'balanced') => TEXT_DENSITY_OPTIONS.find((item) => item.id === densityId) || TEXT_DENSITY_OPTIONS[1];
const getAiImageEntry = (imageId = 'support') => AI_IMAGE_OPTIONS.find((item) => item.id === imageId) || AI_IMAGE_OPTIONS[1];
const getLayoutPresetEntry = (layoutId = 'basic') => LAYOUT_PRESET_OPTIONS.find((item) => item.id === layoutId) || LAYOUT_PRESET_OPTIONS[0];
const getLanguageEntry = (languageId = 'ko') => LANGUAGE_OPTIONS.find((item) => item.id === languageId) || LANGUAGE_OPTIONS[0];
const getVisualPresetEntry = (presetId = 'bee-happy') => VISUAL_PRESET_OPTIONS.find((item) => item.id === presetId) || VISUAL_PRESET_OPTIONS[0];
const getImageSourceEntry = (sourceId = 'ai') => IMAGE_SOURCE_OPTIONS.find((item) => item.id === sourceId) || IMAGE_SOURCE_OPTIONS[0];
const getImageStylePresetEntry = (presetId = 'bold-poster') => IMAGE_STYLE_PRESET_OPTIONS.find((item) => item.id === presetId) || IMAGE_STYLE_PRESET_OPTIONS[0];
const getSectionCitationOptionEntry = (citationMode = 'optional') => SECTION_CITATION_OPTIONS.find((item) => item.id === citationMode) || SECTION_CITATION_OPTIONS[1];

const getCardCount = (value, fallback = 6) => {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) return fallback;
  return Math.max(4, Math.min(10, parsed));
};

const buildOutlineTailTitles = (modeKey = 'docs', domainLabel = '일반') => (
  modeKey === 'ppt'
    ? [`${domainLabel} 사례`, '비교와 선택지', '실행 로드맵', '리스크', '마무리']
    : [`${domainLabel} 사례`, '비교 분석', '리스크와 한계', '적용 시나리오', '참고자료']
);

const ensureOutlineCount = (items = [], targetCount = 6, { modeKey = 'docs', domainLabel = '일반' } = {}) => {
  const safeItems = Array.isArray(items) ? items.filter(Boolean).slice(0, targetCount) : [];
  const extras = buildOutlineTailTitles(modeKey, domainLabel);
  const nextItems = [...safeItems];

  while (nextItems.length < targetCount) {
    const fallback = extras[nextItems.length - safeItems.length] || `${modeKey === 'ppt' ? '추가 슬라이드' : '추가 섹션'} ${nextItems.length + 1}`;
    nextItems.push(fallback);
  }

  return nextItems.slice(0, targetCount);
};

const buildOutlinePreview = (mode, brief = {}) => {
  const modeKey = mode === 'ppt' ? 'ppt' : 'docs';
  const templateSet = OUTLINE_PRESETS[modeKey] || OUTLINE_PRESETS.docs;
  const overview = cleanText(brief.overview);
  const domainLabel = getDomainEntry(brief.domain).label;
  const targetCount = getCardCount(brief.cardCount, modeKey === 'ppt' ? DEFAULT_PPT_BRIEF.cardCount : DEFAULT_DOC_BRIEF.cardCount);
  const explicitOutline = ensureOutlineCount((Array.isArray(brief.outlineTitles) ? brief.outlineTitles : []).map((item) => cleanText(item)).filter(Boolean), targetCount, { modeKey, domainLabel });

  if (Array.isArray(brief.outlineTitles) && brief.outlineTitles.filter((item) => cleanText(item)).length > 0) {
    return explicitOutline;
  }

  const template = ensureOutlineCount(templateSet[brief.theme] || templateSet.business, targetCount, { modeKey, domainLabel });

  if (!overview) return template;
  if (modeKey === 'docs') {
    return template.map((title, index) => {
      if (index === 0) return overview.length > 28 ? '표지 / 주제' : overview;
      if (index === 1 && title === 'Executive Summary') return `${domainLabel} 관점 요약`;
      return title;
    });
  }

  return template.map((title, index) => {
    if (index === 0) return overview.length > 30 ? 'Cover / Topic' : overview;
    if (index === 2 && title === '핵심 인사이트') return `${domainLabel} Insight`;
    return title;
  });
};

const buildDefaultSectionCitationMode = ({ title = '', index = 0 } = {}) => {
  const normalized = cleanText(title).toLowerCase();
  if (index === 0 || /표지|cover|title/.test(normalized)) return 'off';
  if (/참고|references|reference|bibliography|sources|출처/.test(normalized)) return 'required';
  return 'optional';
};

const buildSectionContentPlaceholder = ({ mode = 'docs', title = '', index = 0, domainLabel = '일반' } = {}) => {
  const normalized = cleanText(title).toLowerCase();

  if (index === 0 || /표지|cover|title/.test(normalized)) {
    return mode === 'ppt'
      ? '발표 제목, 청중, 발표 목적, 핵심 메시지를 한 줄로 정리'
      : '문서 제목, 작성 목적, 제출 맥락, 대상 독자를 짧게 정리';
  }
  if (/summary|executive|요약|핵심 인사이트|insight/.test(normalized)) {
    return `${domainLabel} 관점에서 가장 먼저 전달할 핵심 주장 2~3개를 정리`;
  }
  if (/배경|background|맥락|question|문제 제기/.test(normalized)) {
    return '왜 이 주제를 다루는지, 현재 상황과 문제 배경을 설명';
  }
  if (/분석|analysis|findings|evidence|비교/.test(normalized)) {
    return '핵심 근거, 비교 기준, 데이터나 사례 해석을 중심으로 구성';
  }
  if (/권고|recommend|next|ask|결론|takeaway/.test(normalized)) {
    return '최종 판단, 실행안, 다음 단계, 의사결정 포인트를 정리';
  }
  if (/참고|reference|sources|bibliography|출처/.test(normalized)) {
    return '본문에서 사용할 논문, 보고서, 기사, 데이터 출처를 정리';
  }

  return mode === 'ppt'
    ? `${cleanText(title) || `슬라이드 ${index + 1}`}에서 전달할 headline과 supporting bullet 방향을 적기`
    : `${cleanText(title) || `섹션 ${index + 1}`}에서 다룰 주장, 사례, 근거 방향을 적기`;
};

const buildSectionCitationPlaceholder = ({ overview = '', title = '' } = {}) => cleanText([overview, title, '관련 논문 / review / benchmark / survey'].join(' ')).slice(0, 120);

const createCitationCandidateId = (paper = {}) => cleanText(paper?.id || paper?.link || paper?.url || paper?.title || '').toLowerCase().slice(0, 240);

const normalizeSectionCitations = (items = []) => {
  const nextItems = [];
  const seen = new Set();

  (Array.isArray(items) ? items : []).forEach((item) => {
    const id = createCitationCandidateId(item);
    const title = cleanText(item?.title || '');
    if (!id || !title || seen.has(id)) return;

    seen.add(id);
    nextItems.push({
      id,
      title,
      link: cleanText(item?.link || item?.url || ''),
      year: cleanText(item?.year || ''),
      venue: cleanText(item?.venue || item?.sourceLabel || ''),
      scholarlyScore: Number.isFinite(Number(item?.scholarlyScore)) ? Math.round(Number(item.scholarlyScore)) : 0,
    });
  });

  return nextItems.slice(0, 4);
};

const buildPaperPool = (searchData = {}) => {
  const academicResults = Array.isArray(searchData?.academicResults) ? searchData.academicResults : [];
  const nextPool = [];
  const seen = new Set();

  academicResults.forEach((result) => {
    const paper = {
      id: createCitationCandidateId(result),
      title: cleanText(result?.title || result?.link || '논문'),
      link: cleanText(result?.link || result?.url || ''),
      snippet: cleanText(result?.snippet || ''),
      year: cleanText(result?.metadata?.year || ''),
      venue: cleanText(result?.metadata?.venue || result?.metadata?.sourceLabel || result?.provider || ''),
      authors: Array.isArray(result?.metadata?.authors) ? result.metadata.authors.slice(0, 3).join(', ') : '',
      sourceLabel: cleanText(result?.metadata?.sourceLabel || result?.provider || ''),
      scholarlyScore: Number.isFinite(Number(result?.metadata?.scholarlyScore || result?.metadata?.rankingSignals?.total))
        ? Math.round(Number(result.metadata?.scholarlyScore || result.metadata?.rankingSignals?.total))
        : 0,
    };

    if (!paper.id || !paper.title || seen.has(paper.id)) return;
    seen.add(paper.id);
    nextPool.push(paper);
  });

  return nextPool.slice(0, 8);
};

const buildPaperMetaLine = (paper = {}) => [
  paper.year,
  paper.venue,
  paper.authors,
  paper.scholarlyScore > 0 ? `scholar ${paper.scholarlyScore}/100` : '',
].filter(Boolean).join(' · ');

const buildSectionPlans = (mode, brief = {}) => {
  const outlineTitles = buildOutlinePreview(mode, brief);
  const existingPlans = Array.isArray(brief.sectionPlans) ? brief.sectionPlans : [];
  const domainLabel = getDomainEntry(brief.domain).label;

  return outlineTitles.map((fallbackTitle, index) => {
    const current = existingPlans[index] && typeof existingPlans[index] === 'object' ? existingPlans[index] : {};
    return {
      fallbackTitle,
      title: typeof current.title === 'string' ? current.title : fallbackTitle,
      contentNote: typeof current.contentNote === 'string' ? current.contentNote : '',
      contentPlaceholder: buildSectionContentPlaceholder({
        mode,
        title: cleanText(current.title || fallbackTitle) || fallbackTitle,
        index,
        domainLabel,
      }),
      citationMode: SECTION_CITATION_OPTIONS.some((item) => item.id === current.citationMode)
        ? current.citationMode
        : buildDefaultSectionCitationMode({ title: fallbackTitle, index }),
      citationQuery: typeof current.citationQuery === 'string' ? current.citationQuery : '',
      citationPlaceholder: buildSectionCitationPlaceholder({
        overview: brief.overview,
        title: cleanText(current.title || fallbackTitle) || fallbackTitle,
      }),
      citations: normalizeSectionCitations(current.citations),
    };
  });
};

const buildSectionPlansFromDraft = (mode, brief = {}, draftItems = []) => {
  const domainLabel = getDomainEntry(brief.domain).label;
  const normalizedDraftItems = (Array.isArray(draftItems) ? draftItems : []).filter((item) => item && typeof item === 'object');

  if (normalizedDraftItems.length === 0) {
    return buildSectionPlans(mode, brief).map((plan) => ({
      title: plan.title,
      contentNote: plan.contentNote,
      citationMode: plan.citationMode,
      citationQuery: plan.citationQuery,
      citations: normalizeSectionCitations(plan.citations),
    }));
  }

  return normalizedDraftItems.map((item, index) => {
    const fallbackTitle = cleanText(item?.title || '') || (mode === 'ppt' ? `슬라이드 ${index + 1}` : `섹션 ${index + 1}`);
    const bullets = Array.isArray(item?.bullets)
      ? item.bullets
      : cleanFreeformText(item?.contentNote || '').split(/\n/);
    const contentLines = (Array.isArray(bullets) ? bullets : [])
      .map((entry) => cleanText(String(entry || '').replace(/^[-*•]\s*/, '')))
      .filter(Boolean)
      .slice(0, 3)
      .map((entry) => `• ${entry}`);

    return {
      title: fallbackTitle,
      contentNote: contentLines.join('\n'),
      citationMode: SECTION_CITATION_OPTIONS.some((option) => option.id === item?.citationMode)
        ? item.citationMode
        : buildDefaultSectionCitationMode({ title: fallbackTitle, index }),
      citationQuery: cleanText(item?.citationQuery || buildSectionCitationPlaceholder({ overview: brief.overview, title: fallbackTitle })).slice(0, 180),
      citations: [],
      fallbackTitle,
      contentPlaceholder: buildSectionContentPlaceholder({ mode, title: fallbackTitle, index, domainLabel }),
      citationPlaceholder: buildSectionCitationPlaceholder({ overview: brief.overview, title: fallbackTitle }),
    };
  });
};

const buildSectionPlanInstructionLines = (sectionPlans = [], { mode = 'docs' } = {}) => {
  const blockLabel = mode === 'ppt' ? '슬라이드' : '섹션';

  return (Array.isArray(sectionPlans) ? sectionPlans : []).map((plan, index) => {
    const title = cleanText(plan?.title || '') || plan?.fallbackTitle || `${blockLabel} ${index + 1}`;
    const citationOption = getSectionCitationOptionEntry(plan?.citationMode);
    const citationTitles = normalizeSectionCitations(plan?.citations).map((item) => item.title).slice(0, 3);

    return [
      `${blockLabel} ${index + 1}: ${title}`,
      cleanText(plan?.contentNote || '') ? `들어갈 내용: ${cleanText(plan.contentNote)}` : '',
      `인용 사용: ${citationOption.label}`,
      cleanText(plan?.citationQuery || '') ? `찾을 논문/자료 방향: ${cleanText(plan.citationQuery)}` : '',
      citationTitles.length > 0 ? `우선 인용 후보: ${citationTitles.join(' ; ')}` : '',
    ].filter(Boolean).join(' | ');
  });
};

const buildSuggestedPapersForPlan = ({ plan = {}, paperPool = [], overview = '' } = {}) => {
  const queryText = cleanText([overview, plan?.title, plan?.contentNote, plan?.citationQuery].join(' ')).toLowerCase();
  const tokens = queryText.split(/\s+/).filter((token) => token.length >= 2);

  return (Array.isArray(paperPool) ? paperPool : [])
    .map((paper) => {
      const haystack = cleanText([paper.title, paper.snippet, paper.venue, paper.authors, paper.sourceLabel].join(' ')).toLowerCase();
      const score = tokens.reduce((sum, token) => (haystack.includes(token) ? sum + (token.length >= 4 ? 10 : 5) : sum), Number(paper.scholarlyScore || 0));
      return { paper, score };
    })
    .sort((left, right) => right.score - left.score)
    .slice(0, 3)
    .map((entry) => entry.paper);
};

const hashString = (value = '') => Array.from(String(value)).reduce((hash, char) => (((hash * 31) + char.charCodeAt(0)) >>> 0), 2166136261);

const createSeededRandom = (seedValue = 1) => {
  let seed = (seedValue >>> 0) || 1;
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
};

const shuffleWithSeed = (items = [], random = Math.random) => {
  const nextItems = [...items];
  for (let index = nextItems.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [nextItems[index], nextItems[swapIndex]] = [nextItems[swapIndex], nextItems[index]];
  }
  return nextItems;
};

const normalizeRecommendationTopic = (overview = '', domainLabel = '일반') => {
  const normalized = cleanText(overview);
  if (!normalized) return `${domainLabel} 주제`;

  if (normalized.length > 80 && /(기준으로|최종 결과물|인용은|구성하고|만들고)/.test(normalized)) {
    const matched = normalized.match(/^(.+?)(?:를|을)\s/);
    if (matched?.[1]) return cleanText(matched[1]);
  }

  return normalized;
};

const DOC_RECOMMENDATION_PROFILES = [
  {
    id: 'executive-brief',
    label: 'Executive Brief',
    frame: '브리프 문서',
    emphasis: '결론과 판단이 첫 문단에 바로 보이게 정리',
    structure: '문제-판단-근거-실행 순서로 구성',
    theme: 'business',
    textDensity: 'balanced',
    writingNote: '첫 문단에서 결론을 먼저 제시하고, 핵심 근거와 실행 포인트를 분리해서 정리',
    toneNote: '임원 보고용으로 짧고 단정한 톤 유지',
  },
  {
    id: 'evidence-report',
    label: 'Evidence Report',
    frame: '분석 보고서',
    emphasis: '주장과 근거가 섞이지 않게 단락을 분리',
    structure: '배경-근거-해석-시사점 순서로 구성',
    theme: 'academic',
    textDensity: 'dense',
    writingNote: '핵심 근거마다 출처 후보를 붙일 수 있게 문단을 나누고, 사례와 데이터는 따로 정리',
    toneNote: '근거 중심으로 차분하고 정확한 톤 유지',
  },
  {
    id: 'strategy-memo',
    label: 'Strategy Memo',
    frame: '전략 메모',
    emphasis: '배경보다 선택지와 우선순위가 먼저 보이게 재정리',
    structure: '현황-선택지-우선순위-권고안 순서로 구성',
    theme: 'editorial',
    textDensity: 'balanced',
    writingNote: '선택지 비교와 우선순위를 표처럼 읽히게 정리하고 마지막에 권고안을 명확히 제시',
    toneNote: '전략 검토 메모처럼 빠르게 읽히는 톤 유지',
  },
  {
    id: 'research-note',
    label: 'Research Note',
    frame: '리서치 노트',
    emphasis: '배경과 선행 사례를 분리해서 읽히게 정리',
    structure: '문제 제기-배경-사례-해석 순서로 구성',
    theme: 'minimal-research',
    textDensity: 'dense',
    writingNote: '선행 사례와 최신 사례를 분리하고, 각 사례에서 무엇을 배울지 짧게 정리',
    toneNote: '리서처가 정리한 노트처럼 깔끔하고 절제된 톤 유지',
  },
  {
    id: 'comparative-analysis',
    label: 'Comparative Analysis',
    frame: '비교 분석 문서',
    emphasis: '기준별 비교가 한눈에 보이게 재배치',
    structure: '비교 기준-옵션별 분석-차이점-선택 포인트 순서로 구성',
    theme: 'business',
    textDensity: 'balanced',
    writingNote: '비교 기준을 먼저 제시하고, 옵션별 장단점과 선택 포인트를 분리해서 정리',
    toneNote: '의사결정용 비교 문서처럼 명료한 톤 유지',
  },
  {
    id: 'class-report',
    label: 'Class Report',
    frame: '과제형 보고서',
    emphasis: '배경 설명과 본론을 분리해 읽기 쉽게 정리',
    structure: '문제 제기-배경-핵심 분석-결론 순서로 구성',
    theme: 'academic',
    textDensity: 'dense',
    writingNote: '교수나 심사자가 읽기 쉽게 배경, 본론, 결론을 명확히 나누고 참고자료 방향도 함께 제시',
    toneNote: '학술 과제 제출용으로 차분하고 논리적인 톤 유지',
  },
];

const PPT_RECOMMENDATION_PROFILES = [
  {
    id: 'investor-deck',
    label: 'Investor Deck',
    frame: '설득형 발표자료',
    emphasis: '배경보다 투자 판단 포인트가 먼저 보이게 구성',
    structure: '왜 지금-핵심 판단-근거-다음 단계 순서로 구성',
    theme: 'pitch',
    textDensity: 'light',
    writingNote: '첫 장과 마지막 장에서 투자 판단 메시지가 명확히 보이게 정리',
    toneNote: '짧고 강한 설득형 발표 톤 유지',
  },
  {
    id: 'executive-briefing',
    label: 'Executive Briefing',
    frame: '브리핑 슬라이드',
    emphasis: '핵심 판단과 시사점이 바로 보이도록 요약',
    structure: '상황-핵심 인사이트-리스크-권고안 순서로 구성',
    theme: 'business',
    textDensity: 'balanced',
    writingNote: '장표마다 headline이 먼저 보이게 만들고, supporting bullet은 2~3개로 제한',
    toneNote: '사내 경영진 보고용으로 짧고 명료한 톤 유지',
  },
  {
    id: 'research-presentation',
    label: 'Research Presentation',
    frame: '세미나 deck',
    emphasis: '질문과 근거가 분리되게 장표 흐름을 정리',
    structure: '질문-배경-근거-해석-결론 순서로 구성',
    theme: 'academic',
    textDensity: 'balanced',
    writingNote: '연구 발표처럼 연구 질문, 핵심 발견, 해석이 각 장표에서 분명히 나뉘게 구성',
    toneNote: '학술 발표용으로 차분하고 설명적인 톤 유지',
  },
  {
    id: 'story-deck',
    label: 'Story Deck',
    frame: '요약 발표자료',
    emphasis: '장면 전환이 자연스럽게 이어지도록 재배열',
    structure: '오프닝-핵심 장면-전환점-마무리 순서로 구성',
    theme: 'editorial',
    textDensity: 'light',
    writingNote: '슬라이드 간 연결감이 보이도록 전환 문장과 장면 중심으로 정리',
    toneNote: '스토리텔링 발표처럼 유연한 톤 유지',
  },
  {
    id: 'roadmap-deck',
    label: 'Roadmap Deck',
    frame: '제안 발표자료',
    emphasis: '실행 단계와 우선순위가 먼저 보이게 정리',
    structure: '현황-목표-실행 단계-우선순위-다음 액션 순서로 구성',
    theme: 'business',
    textDensity: 'balanced',
    writingNote: '실행 로드맵과 우선순위가 장표 흐름에서 자연스럽게 읽히게 정리',
    toneNote: '제안 발표처럼 실행 중심의 톤 유지',
  },
  {
    id: 'evidence-deck',
    label: 'Evidence Deck',
    frame: '근거 중심 발표자료',
    emphasis: '주장과 데이터 근거가 분리되어 보이게 정리',
    structure: '핵심 주장-데이터-사례-결론 순서로 구성',
    theme: 'academic',
    textDensity: 'balanced',
    writingNote: '핵심 주장 장표와 근거 장표를 구분하고, 필요한 곳만 출처를 붙일 수 있게 구성',
    toneNote: '근거 중심 브리핑처럼 신뢰감 있는 톤 유지',
  },
];

const RECOMMENDATION_SUPPORT_LINES = [
  '한 카드에는 한 메시지만 남기고 주변 설명은 줄이기',
  '도입과 결론의 문장을 더 짧게 다듬기',
  '목차가 보자마자 흐름을 이해할 수 있게 제목을 짓기',
  '필요하면 비교, 사례, 리스크를 별도 블록으로 분리하기',
  '근거가 약한 부분은 비워두고 강한 근거가 있는 부분만 강조하기',
  '이미지가 들어갈 장면과 텍스트만 필요한 장면을 먼저 구분하기',
];

const RECOMMENDATION_EVIDENCE_LINES = [
  '인용은 필요한 부분에만 선택적으로 붙이기',
  '논문과 기사 출처는 분리해서 정리하기',
  '핵심 주장마다 근거 후보를 한 줄씩 남기기',
  '배경 설명보다는 검증 가능한 근거를 우선 배치하기',
  '리뷰 논문과 최신 사례를 함께 묶어서 제시하기',
  '정량 데이터와 사례 서술을 한 장에 섞지 않기',
];

const buildPromptRecommendations = (mode, brief = {}, refreshKey = 0) => {
  const domainEntry = getDomainEntry(brief.domain);
  const topic = normalizeRecommendationTopic(brief.overview, domainEntry.label);
  const userRole = cleanText(brief.userRole);
  const audience = cleanText(brief.audience) || (mode === 'docs' ? '독자' : '청중');
  const languageId = brief.language === 'en' ? 'en' : 'ko';
  const languageLabel = getLanguageEntry(languageId).label;
  const rolePhrase = userRole ? `${userRole} 기준` : `${audience} 기준`;
  const seed = hashString(`${mode}:${topic}:${brief.domain}:${userRole}:${audience}:${brief.language}:${refreshKey}`);
  const random = createSeededRandom(seed);
  const profiles = shuffleWithSeed(mode === 'docs' ? DOC_RECOMMENDATION_PROFILES : PPT_RECOMMENDATION_PROFILES, random);
  const supportLines = shuffleWithSeed(RECOMMENDATION_SUPPORT_LINES, random);
  const evidenceLines = shuffleWithSeed(RECOMMENDATION_EVIDENCE_LINES, random);

  return profiles.slice(0, 6).map((profile, index) => {
    const supportLine = supportLines[index % supportLines.length];
    const evidenceLine = evidenceLines[index % evidenceLines.length];

    return {
      title: `${topic} · ${profile.label}`,
      description: `${rolePhrase} ${profile.frame}로 만들고, ${profile.emphasis}. ${profile.structure}. ${supportLine}. ${evidenceLine}.`,
      overview: topic,
      audience,
      theme: profile.theme,
      textDensity: profile.textDensity,
      domainId: domainEntry.id,
      domainLabel: domainEntry.label,
      language: languageLabel,
      languageId,
      writingNote: `${profile.writingNote}. ${supportLine}. ${evidenceLine}.`,
      toneNote: `${profile.toneNote}. 최종 결과물은 ${languageLabel} 기준으로 정리.`,
      recommendationId: `${mode}-${profile.id}-${refreshKey}`,
    };
  });
};

const buildModeSubtitle = (mode, brief = {}) => {
  const domainLabel = getDomainEntry(brief.domain).label;
  const themeLabel = getThemeEntry(brief.theme).label;
  const densityLabel = getTextDensityEntry(brief.textDensity).label;
  return `${domainLabel} · ${themeLabel} · 텍스트 ${densityLabel}`;
};

const buildGenerationInstructions = ({ mode, brief, outlineTitles = [], sectionPlans = [], hasDebateContext = false } = {}) => {
  const modeLabel = mode === 'ppt' ? '발표자료' : '문서';
  const domainEntry = getDomainEntry(brief.domain);
  const themeEntry = getThemeEntry(brief.theme);
  const densityEntry = getTextDensityEntry(brief.textDensity);
  const aiImageEntry = getAiImageEntry(brief.aiImageMode);
  const layoutPresetEntry = getLayoutPresetEntry(brief.layoutPreset);
  const languageEntry = getLanguageEntry(brief.language);
  const visualPresetEntry = getVisualPresetEntry(brief.visualPreset);
  const imageSourceEntry = getImageSourceEntry(brief.imageSource);
  const imageStyleEntry = getImageStylePresetEntry(brief.imageStylePreset);
  const targetCount = getCardCount(brief.cardCount, mode === 'ppt' ? DEFAULT_PPT_BRIEF.cardCount : DEFAULT_DOC_BRIEF.cardCount);

  return [
    cleanText(brief.overview),
    `형식: ${modeLabel}`,
    `도메인: ${domainEntry.label}`,
    cleanText(brief.userRole) ? `작성자 직업/역할: ${cleanText(brief.userRole)}` : '',
    `대상 독자: ${cleanText(brief.audience) || '일반 독자'}`,
    `언어: ${languageEntry.label}`,
    `카드 수: ${targetCount}`,
    `레이아웃 모드: ${layoutPresetEntry.label} (${layoutPresetEntry.note})`,
    `시각 테마: ${themeEntry.label} (${themeEntry.note})`,
    `비주얼 프리셋: ${visualPresetEntry.label}`,
    `텍스트 양: ${densityEntry.label} (${densityEntry.note})`,
    `AI 이미지: ${aiImageEntry.label} (${aiImageEntry.note})`,
    `이미지 출처: ${imageSourceEntry.label} (${imageSourceEntry.note})`,
    `이미지 스타일: ${imageStyleEntry.label}`,
    brief.writingNote ? `추가 작성 메모: ${cleanText(brief.writingNote)}` : '',
    brief.toneNote ? `톤 메모: ${cleanText(brief.toneNote)}` : '',
    outlineTitles.length > 0 ? `권장 윤곽선: ${outlineTitles.join(' -> ')}` : '',
    ...buildSectionPlanInstructionLines(sectionPlans, { mode }),
    brief.language === 'en' ? '최종 결과물의 제목, 본문, 목차, 슬라이드 문구를 모두 영어로 작성하세요.' : '최종 결과물은 한국어 기준으로 자연스럽게 작성하세요.',
    brief.debateUsage === 'off'
      ? '토론 내용은 기본 입력으로 사용하지 말고 브리프와 윤곽선만으로 결과물을 설계하세요.'
      : brief.debateUsage === 'strong'
        ? '기존 토론 인사이트가 있으면 적극 반영하되, 최종 결과물이 토론 요약처럼 보이지 않게 다시 설계하세요.'
        : hasDebateContext
          ? '기존 토론 인사이트가 있으면 필요한 부분만 보조 재료로 참조하세요.'
          : '토론 인사이트가 없어도 브리프만으로 결과물을 설계하세요.',
    mode === 'ppt'
      ? (brief.aiImageMode === 'off'
        ? '슬라이드는 텍스트, 수치, 도표 중심으로 설계하고 불필요한 이미지 지시를 줄이세요.'
        : brief.aiImageMode === 'support'
          ? '슬라이드마다 필요한 visual cue만 제안하고 headline-first 구조를 유지하세요.'
          : '슬라이드별 hero visual 또는 supporting visual 컨셉을 분명히 제안하세요.')
      : (brief.aiImageMode === 'off'
        ? '문서는 문단과 구조 중심으로 작성하고 표, 도식 정도만 보조 요소로 간주하세요.'
        : '문서는 핵심 섹션에서 도식, 표, 이미지 컨셉을 보조적으로 제안하세요.'),
  ].filter(Boolean).join('\n');
};

const buildCitationOverrides = ({ mode, brief } = {}) => {
  if (mode === 'docs') {
    if (brief.theme === 'academic') return { reportCitationMode: 'strict', reportCitationVisibility: 'inline', reportStylePreset: 'research' };
    if (brief.theme === 'pitch') return { reportCitationMode: 'none', reportCitationVisibility: 'hidden', reportStylePreset: 'ideation' };
    if (brief.theme === 'business') return { reportCitationMode: 'light', reportCitationVisibility: 'bibliography-only', reportStylePreset: 'brief' };
    return { reportCitationMode: 'selective', reportCitationVisibility: 'inline', reportStylePreset: 'analysis' };
  }

  if (brief.theme === 'academic') return { slideCitationMode: 'strict', slideCitationVisibility: 'inline', slideStylePreset: 'research' };
  if (brief.theme === 'pitch') return { slideCitationMode: 'none', slideCitationVisibility: 'hidden', slideStylePreset: 'pitch' };
  if (brief.theme === 'business') return { slideCitationMode: 'light', slideCitationVisibility: 'bibliography-only', slideStylePreset: 'investor' };
  return { slideCitationMode: 'selective', slideCitationVisibility: 'inline', slideStylePreset: 'evidence' };
};

const buildModeCardStyle = (active, accent = '#67e8f9') => ({
  textAlign: 'left',
  padding: '16px',
  borderRadius: '16px',
  border: `1px solid ${active ? accent : 'rgba(148, 163, 184, 0.18)'}`,
  background: active
    ? `linear-gradient(180deg, ${accent}22 0%, rgba(15, 23, 42, 0.86) 100%)`
    : 'linear-gradient(180deg, rgba(15, 23, 42, 0.78) 0%, rgba(2, 6, 23, 0.9) 100%)',
  cursor: 'pointer',
  minHeight: '142px',
  boxShadow: active ? `0 0 28px ${accent}22` : 'none',
});

const buildChipStyle = (active, palette = 'rgba(125, 211, 252, 0.38)') => ({
  padding: '8px 11px',
  borderRadius: '999px',
  border: `1px solid ${active ? palette : 'rgba(148, 163, 184, 0.18)'}`,
  background: active ? `${palette.replace('0.38', '0.18')}` : 'rgba(15, 23, 42, 0.74)',
  color: active ? '#ecfeff' : 'rgba(226, 232, 240, 0.78)',
  fontFamily: 'Orbitron, sans-serif',
  fontSize: '9px',
  letterSpacing: '0.08em',
  cursor: 'pointer',
});

const buildPrimaryButtonStyle = (disabled = false, palette = 'cyan') => {
  const themes = {
    cyan: 'linear-gradient(135deg, #0f5fcc 0%, #22d3ee 100%)',
    green: 'linear-gradient(135deg, #0f766e 0%, #22c55e 100%)',
    amber: 'linear-gradient(135deg, #b45309 0%, #f59e0b 100%)',
  };

  return {
    width: '100%',
    padding: '12px 14px',
    borderRadius: '10px',
    border: '1px solid rgba(125, 211, 252, 0.2)',
    background: disabled ? 'rgba(51, 65, 85, 0.46)' : themes[palette],
    color: disabled ? 'rgba(226, 232, 240, 0.46)' : '#eff6ff',
    fontSize: '12px',
    fontWeight: 700,
    cursor: disabled ? 'not-allowed' : 'pointer',
  };
};

const secondaryButtonStyle = (disabled = false) => ({
  width: '100%',
  padding: '10px 12px',
  borderRadius: '10px',
  border: '1px solid rgba(148, 163, 184, 0.18)',
  background: disabled ? 'rgba(30, 41, 59, 0.5)' : 'rgba(15, 23, 42, 0.72)',
  color: disabled ? 'rgba(148, 163, 184, 0.5)' : '#dbeafe',
  fontSize: '11px',
  cursor: disabled ? 'not-allowed' : 'pointer',
});

const fieldLabelStyle = {
  display: 'block',
  marginBottom: '6px',
  fontFamily: 'Orbitron, sans-serif',
  fontSize: '9px',
  color: 'rgba(191, 248, 255, 0.78)',
  letterSpacing: '0.12em',
};

const inputStyle = {
  width: '100%',
  padding: '11px 12px',
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(148, 163, 184, 0.18)',
  borderRadius: '10px',
  color: 'white',
  fontSize: '13px',
  outline: 'none',
  boxSizing: 'border-box',
};

const segmentedGridStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
  gap: '8px',
};

const advancedSectionStyle = {
  border: '1px solid rgba(148, 163, 184, 0.14)',
  borderRadius: '16px',
  padding: '16px',
  background: 'rgba(255, 255, 255, 0.9)',
  boxShadow: '0 12px 32px rgba(15, 23, 42, 0.08)',
};

const advancedSectionLabelStyle = {
  fontFamily: 'Orbitron, sans-serif',
  fontSize: '10px',
  color: '#1d4ed8',
  letterSpacing: '0.12em',
  marginBottom: '10px',
};

const advancedBodyTextStyle = {
  fontFamily: 'Rajdhani, sans-serif',
  fontSize: '13px',
  color: 'rgba(15, 23, 42, 0.72)',
  lineHeight: 1.45,
};

const advancedFieldLabelStyle = {
  display: 'block',
  marginBottom: '6px',
  fontFamily: 'Rajdhani, sans-serif',
  fontSize: '13px',
  fontWeight: 700,
  color: '#334155',
};

const advancedInputStyle = {
  width: '100%',
  padding: '10px 12px',
  background: '#ffffff',
  border: '1px solid rgba(191, 219, 254, 0.9)',
  borderRadius: '12px',
  color: '#0f172a',
  fontSize: '14px',
  outline: 'none',
  boxSizing: 'border-box',
};

const buildAdvancedChipStyle = (active, accent = '#2563eb') => ({
  padding: '10px 12px',
  borderRadius: '12px',
  border: `1px solid ${active ? accent : 'rgba(148, 163, 184, 0.18)'}`,
  background: active ? 'rgba(219, 234, 254, 0.9)' : '#ffffff',
  color: active ? accent : '#475569',
  fontFamily: 'Rajdhani, sans-serif',
  fontSize: '13px',
  fontWeight: active ? 700 : 600,
  cursor: 'pointer',
  textAlign: 'center',
});

const buildAdvancedTileStyle = (active) => ({
  borderRadius: '14px',
  border: `1px solid ${active ? 'rgba(37, 99, 235, 0.5)' : 'rgba(148, 163, 184, 0.18)'}`,
  background: active ? 'rgba(239, 246, 255, 0.95)' : '#ffffff',
  padding: '10px',
  cursor: 'pointer',
  boxShadow: active ? '0 0 0 2px rgba(59, 130, 246, 0.12)' : 'none',
});

const buildAdvancedActionButtonStyle = (primary = false, disabled = false) => ({
  width: '100%',
  padding: '11px 12px',
  borderRadius: '12px',
  border: primary ? '1px solid rgba(37, 99, 235, 0.25)' : '1px solid rgba(148, 163, 184, 0.18)',
  background: disabled
    ? 'rgba(226, 232, 240, 0.7)'
    : primary
      ? 'linear-gradient(135deg, #2563eb 0%, #38bdf8 100%)'
      : '#ffffff',
  color: disabled ? 'rgba(100, 116, 139, 0.8)' : primary ? '#eff6ff' : '#1e293b',
  fontFamily: 'Rajdhani, sans-serif',
  fontSize: '13px',
  fontWeight: 700,
  cursor: disabled ? 'not-allowed' : 'pointer',
});

export default function QuestionPanel({ onOpenDashboard }) {
  const [docsBrief, setDocsBrief] = useState(DEFAULT_DOC_BRIEF);
  const [pptBrief, setPptBrief] = useState(DEFAULT_PPT_BRIEF);
  const [builderStage, setBuilderStage] = useState({ docs: 'overview', ppt: 'overview' });
  const [paperPools, setPaperPools] = useState({ docs: [], ppt: [] });
  const [paperPoolLoading, setPaperPoolLoading] = useState({ docs: false, ppt: false });
  const [paperPoolQuery, setPaperPoolQuery] = useState({ docs: '', ppt: '' });
  const [paperPoolError, setPaperPoolError] = useState({ docs: '', ppt: '' });
  const [debateInput, setDebateInput] = useState('');
  const [focusInput, setFocusInput] = useState('');
  const [isFetchingTranscript, setIsFetchingTranscript] = useState(false);
  const [topicsLoading, setTopicsLoading] = useState(false);
  const [artifactBusy, setArtifactBusy] = useState({ docs: false, ppt: false, export: '', feedback: '' });
  const [googleExportState, setGoogleExportState] = useState({ loading: true, connected: false, mode: 'service-account', requiresUserConnection: false });
  const [transcriptError, setTranscriptError] = useState('');
  const [panelMessage, setPanelMessage] = useState('');
  const [topicSuggestions, setTopicSuggestions] = useState([]);
  const [promptRefreshKey, setPromptRefreshKey] = useState({ docs: 0, ppt: 0 });
  const [outlineDraftLoading, setOutlineDraftLoading] = useState({ docs: false, ppt: false });
  const [outlineDraftError, setOutlineDraftError] = useState({ docs: '', ppt: '' });
  const [outlineDraftSource, setOutlineDraftSource] = useState({ docs: '', ppt: '' });

  const {
    isDiscussing,
    startDiscussion,
    currentRound,
    totalRounds,
    statusText,
    clearDiscussion,
    consensus,
    topic: debateTopic,
    messages,
    debateId,
    setStatusText,
  } = useDiscussionStore();

  const {
    activeMode,
    setActiveMode,
    setPreview,
    dossier,
    artifacts,
    outputSource,
    debateSeedDossier,
    applyGeneratedOutput,
    clearGeneratedOutput,
  } = useWorkbenchStore();

  const docsOutlinePreview = useMemo(() => buildOutlinePreview('docs', docsBrief), [docsBrief]);
  const pptOutlinePreview = useMemo(() => buildOutlinePreview('ppt', pptBrief), [pptBrief]);
  const docsSectionPlans = useMemo(() => buildSectionPlans('docs', docsBrief), [docsBrief]);
  const pptSectionPlans = useMemo(() => buildSectionPlans('ppt', pptBrief), [pptBrief]);
  const docsPromptRecommendations = useMemo(() => buildPromptRecommendations('docs', docsBrief, promptRefreshKey.docs), [docsBrief, promptRefreshKey.docs]);
  const pptPromptRecommendations = useMemo(() => buildPromptRecommendations('ppt', pptBrief, promptRefreshKey.ppt), [pptBrief, promptRefreshKey.ppt]);
  const isLoading = isDiscussing || isFetchingTranscript;
  const isYT = isYoutubeUrl(debateInput);
  const displayTotalRounds = Math.max(totalRounds || 0, 1);
  const progressWidth = Math.min(100, Math.max(0, (currentRound / displayTotalRounds) * 100));
  const effectiveTopic = cleanText(
    activeMode === 'docs'
      ? docsBrief.overview
      : activeMode === 'ppt'
        ? pptBrief.overview
        : debateTopic || dossier?.topic || '',
  );

  useEffect(() => {
    let active = true;

    const syncGoogleExportState = async () => {
      try {
        const status = await getGoogleExportStatus();
        if (!active) return;
        setGoogleExportState({
          loading: false,
          connected: Boolean(status?.connected),
          mode: status?.mode || 'service-account',
          requiresUserConnection: Boolean(status?.requiresUserConnection),
        });
      } catch {
        if (!active) return;
        setGoogleExportState({ loading: false, connected: false, mode: 'service-account', requiresUserConnection: false });
      }
    };

    const currentUrl = new URL(window.location.href);
    const oauthState = currentUrl.searchParams.get('google_oauth');
    const oauthError = currentUrl.searchParams.get('google_oauth_error');

    if (oauthState === 'connected') {
      setPanelMessage('Google 계정 연결이 완료되었습니다. 이제 Google Docs/Slides export를 실행할 수 있습니다.');
      currentUrl.searchParams.delete('google_oauth');
      currentUrl.searchParams.delete('google_oauth_error');
      window.history.replaceState({}, '', `${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}`);
    } else if (oauthState === 'error') {
      setPanelMessage(`Google 계정 연결에 실패했습니다${oauthError ? ` (${oauthError})` : ''}. 다시 시도하세요.`);
      currentUrl.searchParams.delete('google_oauth');
      currentUrl.searchParams.delete('google_oauth_error');
      window.history.replaceState({}, '', `${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}`);
    }

    syncGoogleExportState();

    return () => {
      active = false;
    };
  }, []);

  const fetchPaperPool = async (mode, { force = false } = {}) => {
    const brief = mode === 'docs' ? docsBrief : pptBrief;
    const overview = cleanText(brief.overview);
    if (overview.length < 6) {
      setPaperPools((state) => ({ ...state, [mode]: [] }));
      setPaperPoolError((state) => ({ ...state, [mode]: '' }));
      setPaperPoolQuery((state) => ({ ...state, [mode]: '' }));
      return;
    }

    const query = cleanText([overview, getDomainEntry(brief.domain).label, '논문'].join(' '));
    if (!force && paperPoolQuery[mode] === query && (paperPools[mode].length > 0 || paperPoolError[mode])) {
      return;
    }

    setPaperPoolLoading((state) => ({ ...state, [mode]: true }));
    setPaperPoolError((state) => ({ ...state, [mode]: '' }));

    try {
      const searchData = await searchWeb(query, 8);
      const nextPool = buildPaperPool(searchData);
      setPaperPools((state) => ({ ...state, [mode]: nextPool }));
      setPaperPoolQuery((state) => ({ ...state, [mode]: query }));
      setPaperPoolError((state) => ({
        ...state,
        [mode]: nextPool.length > 0 ? '' : '현재 개요 기준으로 바로 쓸 학술 결과를 찾지 못했습니다. 직접 검색어를 적어도 됩니다.',
      }));
    } catch {
      setPaperPoolError((state) => ({ ...state, [mode]: '인용 후보 논문을 불러오지 못했습니다. 잠시 후 다시 시도하세요.' }));
    } finally {
      setPaperPoolLoading((state) => ({ ...state, [mode]: false }));
    }
  };

  useEffect(() => {
    if (!['details', 'advanced'].includes(builderStage.docs) || cleanText(docsBrief.overview).length < 6) return undefined;
    const timeoutId = window.setTimeout(() => {
      fetchPaperPool('docs');
    }, 250);

    return () => window.clearTimeout(timeoutId);
  }, [builderStage.docs, docsBrief.overview, docsBrief.domain]);

  useEffect(() => {
    if (!['details', 'advanced'].includes(builderStage.ppt) || cleanText(pptBrief.overview).length < 6) return undefined;
    const timeoutId = window.setTimeout(() => {
      fetchPaperPool('ppt');
    }, 250);

    return () => window.clearTimeout(timeoutId);
  }, [builderStage.ppt, pptBrief.overview, pptBrief.domain]);

  useEffect(() => {
    if (activeMode === 'docs') {
      setPreview({
        mode: 'docs',
        title: cleanText(docsBrief.overview) || '문서 스튜디오',
        subtitle: buildModeSubtitle('docs', docsBrief),
        outline: docsOutlinePreview,
        theme: docsBrief.theme,
      });
      return;
    }

    if (activeMode === 'ppt') {
      setPreview({
        mode: 'ppt',
        title: cleanText(pptBrief.overview) || 'PPT 스튜디오',
        subtitle: buildModeSubtitle('ppt', pptBrief),
        outline: pptOutlinePreview,
        theme: pptBrief.theme,
      });
      return;
    }

    if (activeMode === 'debate') {
      setPreview({
        mode: 'debate',
        title: cleanText(debateInput) || '토론 실험실',
        subtitle: cleanText(focusInput) || '내부 reasoning / 학습 인사이트용',
        outline: ['주제 설정', '다중 에이전트 토론', '합의안 / 인사이트 저장'],
        theme: 'debate',
      });
      return;
    }

    setPreview({
      mode: 'home',
      title: 'AI GODS STUDIO',
      subtitle: '문서, PPT, 토론 실험실을 목적에 맞게 분리합니다.',
      outline: ['문서 만들기', 'PPT 만들기', '토론 실험실'],
      theme: 'business',
    });
  }, [activeMode, debateInput, docsBrief, docsOutlinePreview, focusInput, pptBrief, pptOutlinePreview, setPreview]);

  const updateBrief = (mode, updates = {}) => {
    if (mode === 'docs') {
      setDocsBrief((state) => ({ ...state, ...updates }));
      return;
    }
    setPptBrief((state) => ({ ...state, ...updates }));
  };

  const updateSectionPlans = (mode, updater) => {
    const currentPlans = mode === 'docs' ? docsSectionPlans : pptSectionPlans;
    const nextPlans = typeof updater === 'function' ? updater(currentPlans) : updater;
    const serializedPlans = (Array.isArray(nextPlans) ? nextPlans : currentPlans).map((plan, index) => {
      const fallbackTitle = currentPlans[index]?.fallbackTitle || (mode === 'ppt' ? `슬라이드 ${index + 1}` : `섹션 ${index + 1}`);
      return {
        title: typeof plan?.title === 'string' ? plan.title : fallbackTitle,
        contentNote: typeof plan?.contentNote === 'string' ? plan.contentNote : '',
        citationMode: SECTION_CITATION_OPTIONS.some((item) => item.id === plan?.citationMode)
          ? plan.citationMode
          : buildDefaultSectionCitationMode({ title: fallbackTitle, index }),
        citationQuery: typeof plan?.citationQuery === 'string' ? plan.citationQuery : '',
        citations: normalizeSectionCitations(plan?.citations),
      };
    });

    updateBrief(mode, {
      sectionPlans: serializedPlans,
      outlineTitles: serializedPlans.map((plan, index) => cleanText(plan.title) || currentPlans[index]?.fallbackTitle || (mode === 'ppt' ? `슬라이드 ${index + 1}` : `섹션 ${index + 1}`)),
      cardCount: serializedPlans.length,
    });
  };

  const handleModeSelect = (mode) => {
    setActiveMode(mode);
    setPanelMessage('');
    setTranscriptError('');
    if (mode === 'docs') {
      setBuilderStage((state) => ({ ...state, docs: 'overview' }));
      setStatusText('문서 스튜디오 준비 완료');
    }
    else if (mode === 'ppt') {
      setBuilderStage((state) => ({ ...state, ppt: 'overview' }));
      setStatusText('PPT 스튜디오 준비 완료');
    }
    else if (mode === 'debate') setStatusText('토론 실험실 준비 완료');
  };

  const handleRefreshPromptRecommendations = (mode) => {
    setPromptRefreshKey((state) => ({ ...state, [mode]: state[mode] + 1 }));
    setPanelMessage(mode === 'docs' ? '문서 추천 프롬프트를 새로 갱신했습니다.' : 'PPT 추천 프롬프트를 새로 갱신했습니다.');
  };

  const handleGenerateOutlineDraft = async (mode) => {
    const brief = mode === 'docs' ? docsBrief : pptBrief;
    if (!cleanText(brief.overview)) {
      setPanelMessage('주제 개요를 먼저 입력하세요.');
      return;
    }

    setOutlineDraftLoading((state) => ({ ...state, [mode]: true }));
    setOutlineDraftError((state) => ({ ...state, [mode]: '' }));
    setPanelMessage(mode === 'docs' ? 'AI가 문서 목차 기틀을 만들고 있습니다.' : 'AI가 PPT 목차 기틀을 만들고 있습니다.');

    try {
      const data = await generateOutlineDraft({
        mode,
        brief: {
          overview: cleanText(brief.overview),
          userRole: cleanText(brief.userRole),
          audience: cleanText(brief.audience),
          domain: brief.domain,
          domainLabel: getDomainEntry(brief.domain).label,
          theme: brief.theme,
          textDensity: brief.textDensity,
          aiImageMode: brief.aiImageMode,
          language: brief.language,
          cardCount: getCardCount(brief.cardCount, mode === 'docs' ? DEFAULT_DOC_BRIEF.cardCount : DEFAULT_PPT_BRIEF.cardCount),
          writingNote: cleanText(brief.writingNote),
          toneNote: cleanText(brief.toneNote),
        },
      });

      const nextPlans = buildSectionPlansFromDraft(mode, brief, data?.items || []);
      updateBrief(mode, {
        sectionPlans: nextPlans.map((plan) => ({
          title: plan.title,
          contentNote: plan.contentNote,
          citationMode: plan.citationMode,
          citationQuery: plan.citationQuery,
          citations: normalizeSectionCitations(plan.citations),
        })),
        outlineTitles: nextPlans.map((plan) => cleanText(plan.title) || plan.fallbackTitle),
        cardCount: nextPlans.length,
      });
      setOutlineDraftSource((state) => ({ ...state, [mode]: data?.source || 'fallback' }));
      setPanelMessage(mode === 'docs' ? 'AI가 문서 목차 초안을 먼저 구성했습니다.' : 'AI가 PPT 목차 초안을 먼저 구성했습니다.');
    } catch (error) {
      setOutlineDraftError((state) => ({ ...state, [mode]: error.message || 'AI 목차 초안을 불러오지 못했습니다.' }));
      updateBrief(mode, { outlineTitles: [], sectionPlans: [] });
      setOutlineDraftSource((state) => ({ ...state, [mode]: '' }));
      setPanelMessage(error.message || 'AI 목차 초안 생성 실패');
    } finally {
      setOutlineDraftLoading((state) => ({ ...state, [mode]: false }));
    }
  };

  const handleSelectExample = (mode, example = {}, domainId = 'other') => {
    const currentBrief = mode === 'docs' ? docsBrief : pptBrief;
    updateBrief(mode, {
      overview: example.overview || normalizeRecommendationTopic(currentBrief.overview, getDomainEntry(domainId).label),
      audience: example.audience || (mode === 'docs' ? DEFAULT_DOC_BRIEF.audience : DEFAULT_PPT_BRIEF.audience),
      theme: example.theme || (mode === 'docs' ? DEFAULT_DOC_BRIEF.theme : DEFAULT_PPT_BRIEF.theme),
      textDensity: example.textDensity || 'balanced',
      language: example.languageId || currentBrief.language,
      writingNote: example.writingNote || currentBrief.writingNote,
      toneNote: example.toneNote || currentBrief.toneNote,
      domain: domainId,
      outlineTitles: [],
      sectionPlans: [],
    });
    setPanelMessage(`${mode === 'docs' ? '문서' : 'PPT'} 추천 구성을 적용했습니다. 주제 개요는 유지하고 추천 스타일만 반영했습니다.`);
  };

  const handleAdvanceBuilder = (mode) => {
    const brief = mode === 'docs' ? docsBrief : pptBrief;
    if (!cleanText(brief.overview)) {
      setPanelMessage('주제 개요를 먼저 입력하세요.');
      return;
    }

    updateBrief(mode, { sectionPlans: [], outlineTitles: [] });
    setBuilderStage((state) => ({ ...state, [mode]: 'details' }));
    void handleGenerateOutlineDraft(mode);
  };

  const handleBackToOverview = (mode) => {
    setBuilderStage((state) => ({ ...state, [mode]: 'overview' }));
    setPanelMessage(mode === 'docs' ? '문서 개요 입력 단계로 돌아갔습니다.' : 'PPT 개요 입력 단계로 돌아갔습니다.');
  };

  const handleOpenAdvancedBuilder = (mode) => {
    const brief = mode === 'docs' ? docsBrief : pptBrief;
    if (!cleanText(brief.overview)) {
      setPanelMessage('주제 개요를 먼저 입력하세요.');
      return;
    }

    setBuilderStage((state) => ({ ...state, [mode]: 'advanced' }));
    setPanelMessage(mode === 'docs' ? '문서 고급 모드를 열었습니다.' : 'PPT 고급 모드를 열었습니다.');
  };

  const handleCloseAdvancedBuilder = (mode) => {
    setBuilderStage((state) => ({ ...state, [mode]: 'details' }));
    setPanelMessage(mode === 'docs' ? '문서 기본 설정 화면으로 돌아갔습니다.' : 'PPT 기본 설정 화면으로 돌아갔습니다.');
  };

  const handleOutlineTitleChange = (mode, index, value) => {
    updateSectionPlans(mode, (plans) => {
      const nextPlans = [...plans];
      nextPlans[index] = { ...nextPlans[index], title: value };
      return nextPlans;
    });
  };

  const handleAddOutlineItem = (mode) => {
    updateSectionPlans(mode, (plans) => {
      const nextLength = Math.min(plans.length + 1, 10);
      const fallbackTitle = mode === 'docs' ? `추가 섹션 ${plans.length + 1}` : `추가 슬라이드 ${plans.length + 1}`;
      return [
        ...plans,
        {
          title: fallbackTitle,
          contentNote: '',
          citationMode: 'optional',
          citationQuery: '',
          citations: [],
          fallbackTitle,
        },
      ].slice(0, nextLength);
    });
  };

  const handleRemoveOutlineItem = (mode, index) => {
    updateSectionPlans(mode, (plans) => plans.filter((_, itemIndex) => itemIndex !== index));
  };

  const handleResetAutoOutline = (mode) => {
    void handleGenerateOutlineDraft(mode);
  };

  const handleSectionContentNoteChange = (mode, index, value) => {
    updateSectionPlans(mode, (plans) => {
      const nextPlans = [...plans];
      nextPlans[index] = { ...nextPlans[index], contentNote: value };
      return nextPlans;
    });
  };

  const handleSectionCitationModeChange = (mode, index, citationMode) => {
    updateSectionPlans(mode, (plans) => {
      const nextPlans = [...plans];
      nextPlans[index] = {
        ...nextPlans[index],
        citationMode,
        citations: citationMode === 'off' ? [] : nextPlans[index].citations,
      };
      return nextPlans;
    });
  };

  const handleSectionCitationQueryChange = (mode, index, value) => {
    updateSectionPlans(mode, (plans) => {
      const nextPlans = [...plans];
      nextPlans[index] = { ...nextPlans[index], citationQuery: value };
      return nextPlans;
    });
  };

  const handleToggleSectionCitationCandidate = (mode, index, paper) => {
    updateSectionPlans(mode, (plans) => {
      const nextPlans = [...plans];
      const current = nextPlans[index];
      const paperId = createCitationCandidateId(paper);
      const currentCitations = normalizeSectionCitations(current.citations);
      const hasExisting = currentCitations.some((item) => item.id === paperId);
      nextPlans[index] = {
        ...current,
        citations: hasExisting
          ? currentCitations.filter((item) => item.id !== paperId)
          : [...currentCitations, paper].slice(0, 4),
      };
      return nextPlans;
    });
  };

  const handleDebateSubmit = async (event) => {
    event.preventDefault();
    if (!debateInput.trim() || isLoading) return;

    setTranscriptError('');
    setPanelMessage('');

    if (isYT) {
      const videoId = extractVideoId(debateInput);
      if (!videoId) {
        setTranscriptError('유효한 YouTube URL이 아닙니다.');
        return;
      }

      setIsFetchingTranscript(true);
      try {
        const transcript = await fetchTranscript(videoId);
        setIsFetchingTranscript(false);
        await startDiscussion(`YouTube 영상 분석: ${debateInput}`, transcript);
        setPanelMessage('YouTube 기반 토론을 시작했습니다.');
      } catch (error) {
        setIsFetchingTranscript(false);
        setTranscriptError(error.message || 'YouTube transcript를 불러오지 못했습니다.');
        return;
      }
    } else {
      await startDiscussion(debateInput);
      setPanelMessage('토론을 시작했습니다.');
    }
  };

  const handleGenerateTopics = async () => {
    if (topicsLoading) return;
    setTopicsLoading(true);
    setPanelMessage('');

    try {
      const data = await generateAutonomousTopics({ focus: focusInput, count: 5 });
      setTopicSuggestions(data?.candidates || []);
      setPanelMessage(`${data?.candidates?.length || 0}개의 자율 주제 후보를 만들었습니다.`);
    } catch (error) {
      setPanelMessage(error.message || '자율 주제 생성 실패');
    } finally {
      setTopicsLoading(false);
    }
  };

  const handleGenerateArtifact = async (mode) => {
    const brief = mode === 'docs' ? docsBrief : pptBrief;
    const sectionPlans = mode === 'docs' ? docsSectionPlans : pptSectionPlans;
    const outlineTitles = sectionPlans.map((plan) => cleanText(plan.title) || plan.fallbackTitle);
    const hasDebateContext = Boolean(debateSeedDossier || consensus || messages.length > 0);
    const useDebateContext = brief.debateUsage !== 'off' && hasDebateContext;
    const busyKey = mode === 'docs' ? 'docs' : 'ppt';

    if (artifactBusy[busyKey]) return;
    if (!cleanText(brief.overview)) {
      setPanelMessage('주제 개요를 먼저 입력하세요.');
      return;
    }

    setArtifactBusy((state) => ({ ...state, [busyKey]: true }));
    setStatusText(mode === 'docs' ? '문서 초안 설계 중...' : 'PPT 구조 설계 중...');
    setPanelMessage('');

    try {
      const instructions = buildGenerationInstructions({
        mode,
        brief,
        outlineTitles,
        sectionPlans,
        hasDebateContext: useDebateContext,
      });

      const data = await generateWorkbenchArtifacts({
        mode,
        topic: cleanText(brief.overview),
        instructions,
        audience: cleanText(brief.audience),
        dossier: useDebateContext ? debateSeedDossier : null,
        consensus: useDebateContext ? consensus : '',
        messages: useDebateContext ? messages : [],
        artifacts,
        brief: {
          overview: cleanText(brief.overview),
          userRole: cleanText(brief.userRole),
          domain: brief.domain,
          domainLabel: getDomainEntry(brief.domain).label,
          visualTheme: brief.theme,
          visualPreset: brief.visualPreset,
          textDensity: brief.textDensity,
          aiImageMode: brief.aiImageMode,
          imageSource: brief.imageSource,
          imageStylePreset: brief.imageStylePreset,
          cardCount: getCardCount(brief.cardCount, mode === 'docs' ? DEFAULT_DOC_BRIEF.cardCount : DEFAULT_PPT_BRIEF.cardCount),
          layoutPreset: brief.layoutPreset,
          language: brief.language,
          writingNote: cleanText(brief.writingNote),
          toneNote: cleanText(brief.toneNote),
          debateUsage: brief.debateUsage,
          outlineTitles,
          sectionPlans: sectionPlans.map((plan) => ({
            title: cleanText(plan.title) || plan.fallbackTitle,
            contentNote: cleanFreeformText(plan.contentNote),
            citationMode: plan.citationMode,
            citationQuery: cleanText(plan.citationQuery),
            citations: normalizeSectionCitations(plan.citations),
          })),
          mode,
        },
        ...buildCitationOverrides({ mode, brief }),
      });

      applyGeneratedOutput({
        topic: data?.topic || cleanText(brief.overview),
        dossier: data?.dossier,
        artifacts: data?.artifacts,
        source: 'brief',
        mode,
        preview: {
          mode,
          title: cleanText(brief.overview),
          subtitle: buildModeSubtitle(mode, brief),
          outline: outlineTitles,
          theme: brief.theme,
        },
      });

      setPanelMessage(mode === 'docs' ? '브리프를 바탕으로 문서 초안을 생성했습니다.' : '브리프를 바탕으로 PPT 초안을 생성했습니다.');
    } catch (error) {
      setPanelMessage(error.message || '산출물 생성 실패');
    } finally {
      setArtifactBusy((state) => ({ ...state, [busyKey]: false }));
    }
  };

  const handleExport = async (target, artifactType) => {
    const artifact = artifactType === 'report' ? artifacts?.report : artifacts?.slides;
    if (!artifact || artifactBusy.export) {
      if (!artifact) setPanelMessage('먼저 해당 산출물을 생성하세요.');
      return;
    }

    if ((target === 'google-docs' || target === 'google-slides') && googleExportState.mode === 'oauth' && !googleExportState.connected) {
      setPanelMessage('Google 계정 연결 화면으로 이동합니다.');
      startGoogleOAuth();
      return;
    }

    setArtifactBusy((state) => ({ ...state, export: `${target}:${artifactType}` }));
    setPanelMessage('');

    try {
      const result = await exportWorkbenchArtifact({ target, topic: effectiveTopic, artifact });
      if (result?.blob) {
        downloadBlobResult(result);
        setPanelMessage(`${target.toUpperCase()} 파일을 내려받았습니다.`);
      } else if (result?.url) {
        window.open(result.url, '_blank', 'noopener,noreferrer');
        setPanelMessage(`${target} 문서를 새 탭에서 열었습니다.`);
      }
    } catch (error) {
      if (error?.code === 'oauth_required' || error?.code === 'oauth_reconnect_required') {
        setGoogleExportState((state) => ({ ...state, loading: false, connected: false }));
        setPanelMessage('Google 계정 연결이 필요해 연결 화면으로 이동합니다.');
        startGoogleOAuth();
        return;
      }

      setPanelMessage(error.message || 'export 실패');
    } finally {
      setArtifactBusy((state) => ({ ...state, export: '' }));
    }
  };

  const handleArtifactFeedback = async (artifactType, direction) => {
    const artifact = artifactType === 'report' ? artifacts?.report : artifacts?.slides;
    if (!artifact || artifactBusy.feedback) {
      if (!artifact) setPanelMessage('피드백을 줄 산출물이 없습니다.');
      return;
    }

    setArtifactBusy((state) => ({ ...state, feedback: `${artifactType}:${direction}` }));

    try {
      const result = await submitArtifactFeedback({
        debateId,
        topic: effectiveTopic,
        artifactType,
        direction,
        artifact,
        dossier,
      });
      setPanelMessage(
        result?.onlineLearning?.triggered
          ? '피드백이 저장되었고 artifact 품질 신호로 학습 루프를 트리거했습니다.'
          : direction === 'up'
            ? '좋은 산출물 피드백을 저장했습니다.'
            : '개선 필요 피드백을 저장했습니다.',
      );
    } catch (error) {
      setPanelMessage(error.message || '피드백 저장 실패');
    } finally {
      setArtifactBusy((state) => ({ ...state, feedback: '' }));
    }
  };

  const renderHome = () => (
    <div style={{ display: 'grid', gap: '12px' }}>
      <div style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '13px', color: 'rgba(226, 232, 240, 0.76)', lineHeight: 1.45 }}>
        결과물 생성은 토론의 하위 단계가 아니라 별도 Studio 흐름입니다. 먼저 무엇을 만들지 선택하세요.
      </div>
      <div style={{ display: 'grid', gap: '10px' }}>
        {MODE_CARDS.map((card) => (
          <button key={card.id} type="button" onClick={() => handleModeSelect(card.id)} style={buildModeCardStyle(activeMode === card.id, card.accent)}>
            <div style={{ fontFamily: 'Orbitron, sans-serif', fontSize: '9px', color: card.accent, letterSpacing: '0.18em', marginBottom: '8px' }}>
              {card.eyebrow}
            </div>
            <div style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '18px', fontWeight: 700, color: '#f8fafc', marginBottom: '8px' }}>
              {card.label}
            </div>
            <div style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '13px', color: 'rgba(226, 232, 240, 0.72)', lineHeight: 1.45 }}>
              {card.description}
            </div>
          </button>
        ))}
      </div>
    </div>
  );

  const renderOutlinePreview = (mode, outlineItems = [], theme = 'business', brief = {}) => {
    const isDeck = mode === 'ppt';
    const themeLabel = getThemeEntry(theme).label;
    const normalizedItems = (Array.isArray(outlineItems) ? outlineItems : []).map((item, index) => {
      const title = typeof item === 'string'
        ? cleanText(item)
        : cleanText(item?.title || item?.fallbackTitle || (isDeck ? `슬라이드 ${index + 1}` : `섹션 ${index + 1}`));
      const contentLines = typeof item === 'string'
        ? []
        : cleanFreeformText(item?.contentNote || '')
          .split(/\n/)
          .map((entry) => cleanText(String(entry || '').replace(/^[-*•]\s*/, '')))
          .filter(Boolean)
          .slice(0, 2)
          .map((entry) => `• ${entry}`);
      const citationTitles = typeof item === 'string' ? [] : normalizeSectionCitations(item?.citations).map((paper) => paper.title).slice(0, 2);
      const citationMode = typeof item === 'string'
        ? buildDefaultSectionCitationMode({ title, index })
        : item?.citationMode || buildDefaultSectionCitationMode({ title, index });
      const citationLine = citationMode === 'off'
        ? (isDeck ? '메시지와 장면 전환 중심으로 설계' : '설명 흐름 중심으로 정리')
        : citationTitles.length > 0
          ? `인용 후보: ${citationTitles.join(' / ')}`
          : cleanText(item?.citationQuery || '')
            ? `인용 탐색: ${cleanText(item.citationQuery)}`
            : '관련 논문, 기사, 보고서를 연결할 수 있게 설계';
      const shouldShowImageCue = brief.aiImageMode !== 'off' && (isDeck || brief.aiImageMode === 'hero' || index % 2 === 0);
      const visualLine = shouldShowImageCue
        ? `[image] ${isDeck ? '대표 장면 또는 도식 포인트 배치' : '대표 이미지나 도식이 들어갈 위치 표시'}`
        : '';

      return {
        label: isDeck ? `SLIDE ${index + 1}` : `${index + 1}부`,
        title,
        lines: [...(contentLines.length > 0 ? contentLines : [isDeck ? '이 슬라이드에서 전달할 핵심 메시지와 supporting point 정리' : '이 파트에서 무엇을 설명할지와 사례, 해석 방향 정리']), citationLine, visualLine].filter(Boolean).slice(0, 3),
      };
    });

    return (
      <div style={{ border: '1px solid rgba(125, 211, 252, 0.14)', borderRadius: '14px', padding: '14px', background: 'rgba(2, 6, 23, 0.46)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', marginBottom: '10px', flexWrap: 'wrap' }}>
          <div style={{ fontFamily: 'Orbitron, sans-serif', fontSize: '9px', color: '#bff8ff', letterSpacing: '0.14em' }}>
            TOC BLUEPRINT
          </div>
          <div style={{ fontFamily: 'Orbitron, sans-serif', fontSize: '9px', color: 'rgba(191, 248, 255, 0.58)', letterSpacing: '0.08em' }}>
            {themeLabel}
          </div>
        </div>
        <div style={{ display: 'grid', gap: '10px' }}>
          {cleanText(brief.overview) && (
            <div style={{ padding: '12px 14px', borderRadius: '12px', border: '1px solid rgba(125, 211, 252, 0.16)', background: 'rgba(15, 23, 42, 0.74)' }}>
              <div style={{ fontFamily: 'Orbitron, sans-serif', fontSize: '8px', color: '#7dd3fc', letterSpacing: '0.12em', marginBottom: '6px' }}>
                {isDeck ? 'PRESENTATION TITLE' : 'DOCUMENT TITLE'}
              </div>
              <div style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '16px', fontWeight: 700, color: '#f8fafc', lineHeight: 1.35 }}>
                {cleanText(brief.overview)}
              </div>
            </div>
          )}
          {normalizedItems.map((item, index) => (
            <div key={`${item.title}-${index}`} style={{ padding: '12px 14px', borderRadius: '12px', border: '1px solid rgba(148, 163, 184, 0.14)', background: 'rgba(15, 23, 42, 0.62)' }}>
              <div style={{ fontFamily: 'Orbitron, sans-serif', fontSize: '8px', color: 'rgba(125, 211, 252, 0.72)', letterSpacing: '0.12em', marginBottom: '6px' }}>
                {item.label}
              </div>
              <div style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '15px', fontWeight: 700, color: '#e2e8f0', lineHeight: 1.35, marginBottom: '8px' }}>
                {item.title}
              </div>
              <div style={{ display: 'grid', gap: '5px' }}>
                {item.lines.map((line, lineIndex) => (
                  <div key={`${line}-${lineIndex}`} style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '13px', color: 'rgba(226, 232, 240, 0.76)', lineHeight: 1.45 }}>
                    {line}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderAdvancedBuilder = (mode) => {
    const brief = mode === 'docs' ? docsBrief : pptBrief;
    const sectionPlans = mode === 'docs' ? docsSectionPlans : pptSectionPlans;
    const outlineTitles = mode === 'docs' ? docsOutlinePreview : pptOutlinePreview;
    const domainEntry = getDomainEntry(brief.domain);
    const promptRecommendations = (mode === 'docs' ? docsPromptRecommendations : pptPromptRecommendations).slice(0, 3);
    const artifact = mode === 'docs' ? artifacts?.report : artifacts?.slides;
    const busyKey = mode === 'docs' ? 'docs' : 'ppt';
    const outputLabel = mode === 'docs' ? '문서' : 'PPT';
    const hasDebateContext = Boolean(debateSeedDossier || consensus || messages.length > 0);
    const visualPresetEntry = getVisualPresetEntry(brief.visualPreset);

    return (
      <div style={{ display: 'grid', gap: '16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '14px', flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontFamily: 'Orbitron, sans-serif', fontSize: '10px', color: mode === 'docs' ? '#67e8f9' : '#93c5fd', letterSpacing: '0.16em', marginBottom: '6px' }}>
              {mode === 'docs' ? 'DOCUMENT STUDIO' : 'DECK STUDIO'}
            </div>
            <div style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '22px', fontWeight: 700, color: '#f8fafc', marginBottom: '6px' }}>
              프롬프트 편집기 · 고급 모드
            </div>
            <div style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '13px', color: 'rgba(226, 232, 240, 0.74)', lineHeight: 1.5, maxWidth: '720px' }}>
              카드 수, 레이아웃, 언어, 시각 프리셋, 이미지 스타일, 윤곽선을 한 번에 열어둔 편집 화면입니다. 여기서 조정한 내용이 바로 {outputLabel} 생성 지침으로 반영됩니다.
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', minWidth: '320px' }}>
            <button type="button" onClick={() => handleCloseAdvancedBuilder(mode)} style={secondaryButtonStyle(false)}>
              기본 설정으로
            </button>
            <button type="button" onClick={() => handleBackToOverview(mode)} style={secondaryButtonStyle(false)}>
              개요 수정
            </button>
            <button type="button" onClick={() => handleModeSelect('home')} style={secondaryButtonStyle(false)}>
              시작 화면으로
            </button>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 320px) minmax(420px, 1fr) minmax(260px, 300px)', gap: '16px', alignItems: 'start' }}>
          <div style={{ display: 'grid', gap: '14px' }}>
            <div style={advancedSectionStyle}>
              <div style={advancedSectionLabelStyle}>TEXT CONTENT</div>
              <div style={{ ...advancedBodyTextStyle, marginBottom: '12px' }}>카드 수와 레이아웃, 언어, 텍스트 밀도를 한 번에 조정합니다.</div>

              <div style={{ display: 'grid', gap: '12px' }}>
                <div>
                  <div style={advancedFieldLabelStyle}>카드 수</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '8px' }}>
                    {CARD_COUNT_OPTIONS.map((count) => (
                      <button key={count} type="button" onClick={() => updateBrief(mode, { cardCount: count, outlineTitles: [] })} style={buildAdvancedChipStyle(getCardCount(brief.cardCount, 6) === count)}>
                        {count}개
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div style={advancedFieldLabelStyle}>레이아웃 모드</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '8px' }}>
                    {LAYOUT_PRESET_OPTIONS.map((item) => (
                      <button key={item.id} type="button" onClick={() => updateBrief(mode, { layoutPreset: item.id })} style={buildAdvancedChipStyle(brief.layoutPreset === item.id, '#0f766e')}>
                        {item.label}
                      </button>
                    ))}
                  </div>
                  <div style={{ ...advancedBodyTextStyle, marginTop: '6px' }}>{getLayoutPresetEntry(brief.layoutPreset).note}</div>
                </div>

                <label>
                  <span style={advancedFieldLabelStyle}>언어</span>
                  <select value={brief.language} onChange={(event) => updateBrief(mode, { language: event.target.value })} style={advancedInputStyle}>
                    {LANGUAGE_OPTIONS.map((item) => (
                      <option key={item.id} value={item.id}>{item.label}</option>
                    ))}
                  </select>
                </label>

                <div>
                  <div style={advancedFieldLabelStyle}>카드당 텍스트 양</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '8px' }}>
                    {TEXT_DENSITY_OPTIONS.map((item) => (
                      <button key={item.id} type="button" onClick={() => updateBrief(mode, { textDensity: item.id })} style={buildAdvancedChipStyle(brief.textDensity === item.id, '#2563eb')}>
                        {item.label}
                      </button>
                    ))}
                  </div>
                  <div style={{ ...advancedBodyTextStyle, marginTop: '6px' }}>{getTextDensityEntry(brief.textDensity).note}</div>
                </div>

                <label>
                  <span style={advancedFieldLabelStyle}>쓰기 내용</span>
                  <textarea value={brief.writingNote} onChange={(event) => updateBrief(mode, { writingNote: event.target.value })} rows={3} placeholder="예: 3부에서 한국 공룡 화석 사례를 더 강조" style={{ ...advancedInputStyle, resize: 'vertical' }} />
                </label>

                <label>
                  <span style={advancedFieldLabelStyle}>톤</span>
                  <textarea value={brief.toneNote} onChange={(event) => updateBrief(mode, { toneNote: event.target.value })} rows={3} placeholder="예: 초등학생도 읽기 쉽게, 지나치게 학술적으로 쓰지 않기" style={{ ...advancedInputStyle, resize: 'vertical' }} />
                </label>
              </div>
            </div>

            <div style={advancedSectionStyle}>
              <div style={advancedSectionLabelStyle}>BRIEF CONTEXT</div>
              <div style={{ display: 'grid', gap: '12px' }}>
                <label>
                  <span style={advancedFieldLabelStyle}>내 직업 / 역할</span>
                  <input value={brief.userRole} onChange={(event) => updateBrief(mode, { userRole: event.target.value })} placeholder="예: 대학생, 변호사, 마케터, PM" style={advancedInputStyle} />
                </label>

                <label>
                  <span style={advancedFieldLabelStyle}>{mode === 'docs' ? '독자 / 제출 대상' : '청중 / 발표 대상'}</span>
                  <input value={brief.audience} onChange={(event) => updateBrief(mode, { audience: event.target.value })} style={advancedInputStyle} />
                </label>

                <div>
                  <div style={advancedFieldLabelStyle}>도메인</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                    {DOMAIN_LIBRARY.map((item) => (
                      <button key={item.id} type="button" onClick={() => updateBrief(mode, { domain: item.id, outlineTitles: [] })} style={buildAdvancedChipStyle(brief.domain === item.id, '#7c3aed')}>
                        {item.label}
                      </button>
                    ))}
                  </div>
                  <div style={{ ...advancedBodyTextStyle, marginTop: '6px' }}>{domainEntry.note}</div>
                </div>

                <div>
                  <div style={advancedFieldLabelStyle}>토론 인사이트 사용</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '8px' }}>
                    {DEBATE_USAGE_OPTIONS.map((item) => (
                      <button key={item.id} type="button" onClick={() => updateBrief(mode, { debateUsage: item.id })} style={buildAdvancedChipStyle(brief.debateUsage === item.id, '#db2777')}>
                        {item.label}
                      </button>
                    ))}
                  </div>
                  <div style={{ ...advancedBodyTextStyle, marginTop: '6px', color: hasDebateContext ? '#7c3aed' : 'rgba(15, 23, 42, 0.56)' }}>
                    {hasDebateContext ? DEBATE_USAGE_OPTIONS.find((item) => item.id === brief.debateUsage)?.note : '현재 저장된 토론 seed가 없어도 브리프만으로 생성됩니다.'}
                  </div>
                </div>
              </div>
            </div>

            <div style={advancedSectionStyle}>
              <div style={advancedSectionLabelStyle}>VISUAL ELEMENTS</div>
              <div style={{ display: 'grid', gap: '12px' }}>
                <div>
                  <div style={advancedFieldLabelStyle}>테마 방향</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '8px' }}>
                    {THEME_OPTIONS.map((item) => (
                      <button key={item.id} type="button" onClick={() => updateBrief(mode, { theme: item.id, outlineTitles: [] })} style={buildAdvancedChipStyle(brief.theme === item.id, '#0f766e')}>
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div style={advancedFieldLabelStyle}>테마 프리셋</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '10px' }}>
                    {VISUAL_PRESET_OPTIONS.map((item) => (
                      <button key={item.id} type="button" onClick={() => updateBrief(mode, { visualPreset: item.id })} style={buildAdvancedTileStyle(brief.visualPreset === item.id)}>
                        <div style={{ height: '96px', borderRadius: '10px', padding: '16px', background: item.frameBackground, boxSizing: 'border-box' }}>
                          <div style={{ height: '100%', borderRadius: '16px', background: item.cardBackground, border: item.cardBorder, padding: '14px', boxSizing: 'border-box' }}>
                            <div style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '14px', fontWeight: 700, color: item.titleColor, marginBottom: '4px' }}>제목</div>
                            <div style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '11px', color: item.bodyColor }}>본문 및 링크</div>
                          </div>
                        </div>
                        <div style={{ marginTop: '8px', fontFamily: 'Rajdhani, sans-serif', fontSize: '13px', color: '#334155', fontWeight: 600 }}>{item.label}</div>
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div style={advancedFieldLabelStyle}>이미지 사용 강도</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '8px' }}>
                    {AI_IMAGE_OPTIONS.map((item) => (
                      <button key={item.id} type="button" onClick={() => updateBrief(mode, { aiImageMode: item.id })} style={buildAdvancedChipStyle(brief.aiImageMode === item.id, '#d97706')}>
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div style={advancedFieldLabelStyle}>이미지 출처</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '8px' }}>
                    {IMAGE_SOURCE_OPTIONS.map((item) => (
                      <button key={item.id} type="button" onClick={() => updateBrief(mode, { imageSource: item.id })} style={buildAdvancedChipStyle(brief.imageSource === item.id, '#2563eb')}>
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div style={advancedFieldLabelStyle}>이미지 스타일</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '10px' }}>
                    {IMAGE_STYLE_PRESET_OPTIONS.map((item) => (
                      <button key={item.id} type="button" onClick={() => updateBrief(mode, { imageStylePreset: item.id })} style={buildAdvancedTileStyle(brief.imageStylePreset === item.id)}>
                        <div style={{ height: '74px', borderRadius: '10px', background: item.background, marginBottom: '8px' }} />
                        <div style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '12px', color: '#334155', fontWeight: 600 }}>{item.label}</div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gap: '14px' }}>
            <div style={advancedSectionStyle}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap', marginBottom: '10px' }}>
                <div>
                  <div style={advancedSectionLabelStyle}>PROMPT EDITOR</div>
                  <div style={advancedBodyTextStyle}>카드별 제목을 직접 편집하고, 필요한 경우 카드를 추가하거나 자동 윤곽선으로 되돌릴 수 있습니다.</div>
                </div>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <button type="button" onClick={() => handleResetAutoOutline(mode)} disabled={outlineDraftLoading[mode]} style={buildAdvancedActionButtonStyle(false, outlineDraftLoading[mode])}>
                    {outlineDraftLoading[mode] ? 'AI 초안 생성 중...' : 'AI 목차 다시 만들기'}
                  </button>
                  <button type="button" onClick={() => handleAddOutlineItem(mode)} disabled={outlineTitles.length >= 10} style={buildAdvancedActionButtonStyle(true, outlineTitles.length >= 10)}>
                    카드 추가
                  </button>
                </div>
              </div>

              <div style={{ display: 'grid', gap: '10px' }}>
                {outlineTitles.map((title, index) => (
                  <div key={`${title}-${index}`} style={{ display: 'grid', gridTemplateColumns: '56px 1fr auto', gap: '0', borderRadius: '12px', overflow: 'hidden', border: '1px solid rgba(191, 219, 254, 0.9)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#eff6ff', fontFamily: 'Orbitron, sans-serif', fontSize: '12px', color: '#2563eb' }}>
                      {index + 1}
                    </div>
                    <div style={{ background: '#ffffff', padding: '8px 10px' }}>
                      <input
                        value={title}
                        onChange={(event) => handleOutlineTitleChange(mode, index, event.target.value)}
                        style={{ ...advancedInputStyle, border: 'none', padding: '4px 0', fontWeight: 700 }}
                      />
                    </div>
                    <button type="button" onClick={() => handleRemoveOutlineItem(mode, index)} disabled={outlineTitles.length <= 4} style={{ width: '52px', border: 'none', borderLeft: '1px solid rgba(191, 219, 254, 0.9)', background: '#ffffff', color: outlineTitles.length <= 4 ? 'rgba(148, 163, 184, 0.7)' : '#64748b', cursor: outlineTitles.length <= 4 ? 'not-allowed' : 'pointer' }}>
                      -
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {renderOutlinePreview(mode, sectionPlans, brief.theme, brief)}
          </div>

          <div style={{ display: 'grid', gap: '14px' }}>
            <div style={advancedSectionStyle}>
              <div style={advancedSectionLabelStyle}>TITLE AND BRIEF</div>
              <div style={{ display: 'grid', gap: '12px' }}>
                <label>
                  <span style={advancedFieldLabelStyle}>제목 / 주제 개요</span>
                  <textarea value={brief.overview} onChange={(event) => updateBrief(mode, { overview: event.target.value })} rows={5} style={{ ...advancedInputStyle, resize: 'vertical' }} />
                </label>
                <div style={{ padding: '12px', borderRadius: '12px', background: '#f8fafc', border: '1px solid rgba(226, 232, 240, 0.9)' }}>
                  <div style={{ ...advancedBodyTextStyle, color: '#334155' }}>현재 프리셋 · {getThemeEntry(brief.theme).label} / {visualPresetEntry.label} / {getLanguageEntry(brief.language).label}</div>
                  <div style={{ ...advancedBodyTextStyle, marginTop: '4px', color: '#475569' }}>{buildModeSubtitle(mode, brief)}</div>
                </div>
              </div>
            </div>

            <div style={advancedSectionStyle}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', alignItems: 'center', marginBottom: '10px', flexWrap: 'wrap' }}>
                <div style={advancedSectionLabelStyle}>PROMPT EXAMPLES</div>
                <button type="button" onClick={() => handleRefreshPromptRecommendations(mode)} style={{ ...buildAdvancedActionButtonStyle(false, false), width: 'auto', padding: '8px 10px' }}>
                  새 추천 받기
                </button>
              </div>
              <div style={{ display: 'grid', gap: '8px' }}>
                {promptRecommendations.map((example, index) => (
                  <button key={`${example.title}-${index}`} type="button" onClick={() => handleSelectExample(mode, example, example.domainId)} style={{ textAlign: 'left', padding: '12px', borderRadius: '12px', border: '1px solid rgba(191, 219, 254, 0.9)', background: '#ffffff', cursor: 'pointer' }}>
                    <div style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '14px', fontWeight: 700, color: '#0f172a', marginBottom: '4px' }}>{example.title}</div>
                    <div style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '12px', color: '#475569', lineHeight: 1.45, marginBottom: '8px' }}>{example.description}</div>
                    <div style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '12px', color: '#64748b' }}>{example.domainLabel} · {example.audience} · {example.language}</div>
                  </button>
                ))}
              </div>
            </div>

            <div style={advancedSectionStyle}>
              <div style={advancedSectionLabelStyle}>GUIDE</div>
              <div style={{ display: 'grid', gap: '8px' }}>
                {[
                  '소개 카드는 짧고 강하게, 중간 카드는 근거와 사례를 채우는 편이 안정적입니다.',
                  '테마 프리셋은 화면 분위기, 시각 테마는 문서의 전개 방식에 더 가깝습니다.',
                  '윤곽선 제목을 직접 고치면 그 순서를 우선해 생성합니다.',
                ].map((item, index) => (
                  <div key={`${item}-${index}`} style={{ padding: '10px 12px', borderRadius: '12px', background: '#eff6ff', color: '#334155', fontFamily: 'Rajdhani, sans-serif', fontSize: '13px', lineHeight: 1.45 }}>
                    {item}
                  </div>
                ))}
              </div>
            </div>

            <div style={advancedSectionStyle}>
              <div style={advancedSectionLabelStyle}>RUN</div>
              <div style={{ display: 'grid', gap: '8px' }}>
                <button type="button" onClick={() => handleGenerateArtifact(mode)} disabled={artifactBusy[busyKey]} style={buildAdvancedActionButtonStyle(true, artifactBusy[busyKey])}>
                  {artifactBusy[busyKey] ? `${outputLabel} 생성 중...` : `${outputLabel} 생성`}
                </button>
                <button type="button" onClick={() => handleExport(mode === 'docs' ? 'docx' : 'pptx', mode === 'docs' ? 'report' : 'slides')} disabled={!artifact || !!artifactBusy.export} style={buildAdvancedActionButtonStyle(false, !artifact || !!artifactBusy.export)}>
                  {mode === 'docs' ? 'DOCX 다운로드' : 'PPTX 다운로드'}
                </button>
                <button type="button" onClick={() => handleExport(mode === 'docs' ? 'google-docs' : 'google-slides', mode === 'docs' ? 'report' : 'slides')} disabled={!artifact || !!artifactBusy.export} style={buildAdvancedActionButtonStyle(false, !artifact || !!artifactBusy.export)}>
                  {googleExportState.mode === 'oauth' && !googleExportState.connected ? `Google 연결 후 ${mode === 'docs' ? 'Docs' : 'Slides'}` : mode === 'docs' ? 'Google Docs' : 'Google Slides'}
                </button>
                <button type="button" onClick={clearGeneratedOutput} style={buildAdvancedActionButtonStyle(false, false)}>
                  결과물 비우기
                </button>
                {artifact && (
                  <div style={{ padding: '12px', borderRadius: '12px', background: '#f8fafc', border: '1px solid rgba(226, 232, 240, 0.9)', fontFamily: 'Rajdhani, sans-serif', fontSize: '13px', color: '#475569', lineHeight: 1.45 }}>
                    현재 {outputLabel} 출력 소스 · {outputSource === 'debate' ? '토론 기반 seed' : '브리프 기반 생성'}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderBuilder = (mode) => {
    const brief = mode === 'docs' ? docsBrief : pptBrief;
    const sectionPlans = mode === 'docs' ? docsSectionPlans : pptSectionPlans;
    const hasExplicitSectionPlans = Array.isArray(brief.sectionPlans) && brief.sectionPlans.length > 0;
    const visibleSectionPlans = outlineDraftLoading[mode] && !hasExplicitSectionPlans ? [] : sectionPlans;
    const outlineTitles = visibleSectionPlans.map((plan) => cleanText(plan.title) || plan.fallbackTitle);
    const domainEntry = getDomainEntry(brief.domain);
    const promptRecommendations = mode === 'docs' ? docsPromptRecommendations : pptPromptRecommendations;
    const artifact = mode === 'docs' ? artifacts?.report : artifacts?.slides;
    const busyKey = mode === 'docs' ? 'docs' : 'ppt';
    const outputLabel = mode === 'docs' ? '문서' : 'PPT';
    const hasDebateContext = Boolean(debateSeedDossier || consensus || messages.length > 0);
    const stage = builderStage[mode] || 'overview';
    const citationPaperPool = paperPools[mode] || [];

    if (stage === 'advanced') {
      return renderAdvancedBuilder(mode);
    }

    if (stage === 'overview') {
      return (
        <div style={{ display: 'grid', gap: '14px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontFamily: 'Orbitron, sans-serif', fontSize: '10px', color: mode === 'docs' ? '#67e8f9' : '#93c5fd', letterSpacing: '0.16em', marginBottom: '6px' }}>
                {mode === 'docs' ? 'DOCUMENT STUDIO' : 'DECK STUDIO'}
              </div>
              <div style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '18px', fontWeight: 700, color: '#f8fafc', marginBottom: '4px' }}>
                {mode === 'docs' ? '주제 개요부터 시작' : '발표 개요부터 시작'}
              </div>
              <div style={{ fontFamily: 'Orbitron, sans-serif', fontSize: '9px', color: 'rgba(191, 248, 255, 0.62)', letterSpacing: '0.12em', marginBottom: '8px' }}>
                STEP 1 / 2 · OVERVIEW
              </div>
              <div style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '12px', color: 'rgba(226, 232, 240, 0.7)', lineHeight: 1.45 }}>
                먼저 주제 개요를 정리하면 다음 단계에서 AI가 실제 목차 초안과 내용 기틀을 먼저 만들어 줍니다.
              </div>
            </div>
            <button type="button" onClick={() => handleModeSelect('home')} style={secondaryButtonStyle(false)}>
              시작 화면으로
            </button>
          </div>

          <div style={{ display: 'grid', gap: '12px' }}>
            <label>
              <span style={fieldLabelStyle}>주제 개요</span>
              <textarea
                value={brief.overview}
                onChange={(event) => updateBrief(mode, { overview: event.target.value })}
                placeholder={mode === 'docs' ? '예: 우주산업에서 고체 물리 기반 기술이 사업화되는 경로를 해설형 문서로 정리' : '예: AI 에이전트 시장의 투자 포인트를 투자자용 발표자료로 정리'}
                rows={6}
                style={{ ...inputStyle, resize: 'vertical' }}
              />
            </label>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
              <label>
                <span style={fieldLabelStyle}>내 직업 / 역할</span>
                <input
                  value={brief.userRole}
                  onChange={(event) => updateBrief(mode, { userRole: event.target.value })}
                  placeholder="예: 대학생, 디자이너, PM, 연구원"
                  style={inputStyle}
                />
              </label>

              <label>
                <span style={fieldLabelStyle}>생성 언어</span>
                <select value={brief.language} onChange={(event) => updateBrief(mode, { language: event.target.value })} style={inputStyle}>
                  {LANGUAGE_OPTIONS.map((item) => (
                    <option key={item.id} value={item.id}>{item.label}</option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          <div style={{ border: '1px solid rgba(148, 163, 184, 0.14)', borderRadius: '14px', padding: '14px', background: 'rgba(2, 6, 23, 0.4)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap', marginBottom: '10px' }}>
              <div style={{ fontFamily: 'Orbitron, sans-serif', fontSize: '9px', color: '#c4f1ff', letterSpacing: '0.14em' }}>PROMPT RECOMMENDATIONS</div>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '12px', color: 'rgba(226, 232, 240, 0.68)' }}>
                  개요를 기준으로 갱신할 때마다 새롭게 바뀌는 추천 프롬프트입니다.
                </div>
                <button type="button" onClick={() => handleRefreshPromptRecommendations(mode)} style={{ ...secondaryButtonStyle(false), width: 'auto', padding: '8px 10px' }}>
                  새 추천 받기
                </button>
              </div>
            </div>
            <div style={{ display: 'grid', gap: '10px' }}>
              {promptRecommendations.map((example, index) => (
                <button key={`${example.title}-${index}`} type="button" onClick={() => handleSelectExample(mode, example, example.domainId)} style={{ textAlign: 'left', padding: '12px', borderRadius: '12px', border: '1px solid rgba(148, 163, 184, 0.14)', background: 'rgba(15, 23, 42, 0.66)', cursor: 'pointer' }}>
                  <div style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '14px', fontWeight: 700, color: '#f8fafc', marginBottom: '6px' }}>
                    {example.title}
                  </div>
                  <div style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '12px', color: 'rgba(226, 232, 240, 0.74)', lineHeight: 1.45, marginBottom: '8px' }}>
                    {example.description}
                  </div>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    <div style={{ fontFamily: 'Orbitron, sans-serif', fontSize: '8px', color: '#7dd3fc', letterSpacing: '0.1em' }}>DOMAIN · {example.domainLabel}</div>
                    <div style={{ fontFamily: 'Orbitron, sans-serif', fontSize: '8px', color: '#86efac', letterSpacing: '0.1em' }}>AUDIENCE · {example.audience}</div>
                    <div style={{ fontFamily: 'Orbitron, sans-serif', fontSize: '8px', color: '#fcd34d', letterSpacing: '0.1em' }}>THEME · {getThemeEntry(example.theme).label}</div>
                    <div style={{ fontFamily: 'Orbitron, sans-serif', fontSize: '8px', color: '#c4b5fd', letterSpacing: '0.1em' }}>LANGUAGE · {example.language}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div style={{ padding: '14px', borderRadius: '14px', border: '1px solid rgba(125, 211, 252, 0.14)', background: 'rgba(8, 47, 73, 0.18)' }}>
            <div style={{ fontFamily: 'Orbitron, sans-serif', fontSize: '9px', color: '#bff8ff', letterSpacing: '0.14em', marginBottom: '8px' }}>
              NEXT STEP · AI DRAFT
            </div>
            <div style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '12px', color: 'rgba(226, 232, 240, 0.72)', lineHeight: 1.5 }}>
              다음 단계로 넘어가면 AI가 사진처럼 실제 편집 가능한 목차 초안, 내용 bullet, 이미지 카드 위치를 먼저 구성합니다. 그 다음에 사용자가 수정하는 흐름으로 진행됩니다.
            </div>
          </div>

          <button type="button" onClick={() => handleAdvanceBuilder(mode)} disabled={!cleanText(brief.overview)} style={buildPrimaryButtonStyle(!cleanText(brief.overview), mode === 'docs' ? 'green' : 'cyan')}>
            {mode === 'docs' ? '다음으로 문서 구조 설정하기' : '다음으로 PPT 구조 설정하기'}
          </button>
        </div>
      );
    }

    return (
      <div style={{ display: 'grid', gap: '14px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontFamily: 'Orbitron, sans-serif', fontSize: '10px', color: mode === 'docs' ? '#67e8f9' : '#93c5fd', letterSpacing: '0.16em', marginBottom: '6px' }}>
              {mode === 'docs' ? 'DOCUMENT STUDIO' : 'DECK STUDIO'}
            </div>
            <div style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '18px', fontWeight: 700, color: '#f8fafc', marginBottom: '4px' }}>
              {mode === 'docs' ? '목차 / 내용 / 인용 설계' : '슬라이드 / 내용 / 인용 설계'}
            </div>
            <div style={{ fontFamily: 'Orbitron, sans-serif', fontSize: '9px', color: 'rgba(191, 248, 255, 0.62)', letterSpacing: '0.12em', marginBottom: '8px' }}>
              STEP 2 / 2 · CONTENT PLAN
            </div>
            <div style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '12px', color: 'rgba(226, 232, 240, 0.7)', lineHeight: 1.45 }}>
              개요를 바탕으로 AI가 먼저 기틀을 만들고, 그 초안을 사용자가 수정한 뒤 결과물을 생성합니다.
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px', minWidth: '200px' }}>
            <button type="button" onClick={() => handleBackToOverview(mode)} style={secondaryButtonStyle(false)}>
              개요 수정
            </button>
            <button type="button" onClick={() => handleModeSelect('home')} style={secondaryButtonStyle(false)}>
              시작 화면으로
            </button>
            <button type="button" onClick={clearGeneratedOutput} style={secondaryButtonStyle(false)}>
              결과물 비우기
            </button>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(260px, 300px) minmax(0, 1fr)', gap: '14px', alignItems: 'start' }}>
          <div style={{ display: 'grid', gap: '12px' }}>
            <div style={{ padding: '12px', borderRadius: '12px', border: '1px solid rgba(125, 211, 252, 0.14)', background: 'rgba(15, 23, 42, 0.56)' }}>
              <div style={{ ...fieldLabelStyle, marginBottom: '8px' }}>주제 개요</div>
              <div style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '14px', color: '#f8fafc', lineHeight: 1.45 }}>
                {cleanText(brief.overview) || '개요 없음'}
              </div>
            </div>

            <label>
              <span style={fieldLabelStyle}>내 직업 / 역할</span>
              <input
                value={brief.userRole}
                onChange={(event) => updateBrief(mode, { userRole: event.target.value })}
                placeholder="예: 대학생, 데이터 분석가, 정책 담당자"
                style={inputStyle}
              />
            </label>

            <label>
              <span style={fieldLabelStyle}>{mode === 'docs' ? '독자 / 제출 대상' : '청중 / 발표 대상'}</span>
              <input
                value={brief.audience}
                onChange={(event) => updateBrief(mode, { audience: event.target.value })}
                placeholder={mode === 'docs' ? '예: 경영진, 교수, 고객사' : '예: 투자자, 사내 임원, 세미나 청중'}
                style={inputStyle}
              />
            </label>

            <label>
              <span style={fieldLabelStyle}>생성 언어</span>
              <select value={brief.language} onChange={(event) => updateBrief(mode, { language: event.target.value })} style={inputStyle}>
                {LANGUAGE_OPTIONS.map((item) => (
                  <option key={item.id} value={item.id}>{item.label}</option>
                ))}
              </select>
            </label>

            <div>
              <div style={fieldLabelStyle}>도메인</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {DOMAIN_LIBRARY.map((item) => (
                  <button key={item.id} type="button" onClick={() => updateBrief(mode, { domain: item.id })} style={buildChipStyle(brief.domain === item.id)}>
                    {item.label}
                  </button>
                ))}
              </div>
              <div style={{ marginTop: '6px', fontFamily: 'Rajdhani, sans-serif', fontSize: '12px', color: 'rgba(226, 232, 240, 0.66)' }}>
                {domainEntry.note}
              </div>
            </div>

            <div>
              <div style={fieldLabelStyle}>토론 인사이트 사용</div>
              <div style={segmentedGridStyle}>
                {DEBATE_USAGE_OPTIONS.map((option) => (
                  <button key={option.id} type="button" onClick={() => updateBrief(mode, { debateUsage: option.id })} style={buildChipStyle(brief.debateUsage === option.id, 'rgba(244, 114, 182, 0.38)')}>
                    {option.label}
                  </button>
                ))}
              </div>
              <div style={{ marginTop: '6px', fontFamily: 'Rajdhani, sans-serif', fontSize: '12px', color: hasDebateContext ? '#c4b5fd' : 'rgba(226, 232, 240, 0.56)' }}>
                {hasDebateContext ? DEBATE_USAGE_OPTIONS.find((item) => item.id === brief.debateUsage)?.note : '현재 저장된 토론 seed가 없습니다. 선택해도 브리프 기반 생성으로 동작합니다.'}
              </div>
            </div>

            <div>
              <div style={fieldLabelStyle}>시각 테마</div>
              <div style={segmentedGridStyle}>
                {THEME_OPTIONS.map((item) => (
                  <button key={item.id} type="button" onClick={() => updateBrief(mode, { theme: item.id })} style={buildChipStyle(brief.theme === item.id, 'rgba(56, 189, 248, 0.38)')}>
                    {item.label}
                  </button>
                ))}
              </div>
              <div style={{ marginTop: '6px', fontFamily: 'Rajdhani, sans-serif', fontSize: '12px', color: 'rgba(226, 232, 240, 0.66)' }}>
                {getThemeEntry(brief.theme).note}
              </div>
            </div>

            <div>
              <div style={fieldLabelStyle}>텍스트 양</div>
              <div style={segmentedGridStyle}>
                {TEXT_DENSITY_OPTIONS.map((item) => (
                  <button key={item.id} type="button" onClick={() => updateBrief(mode, { textDensity: item.id })} style={buildChipStyle(brief.textDensity === item.id, 'rgba(52, 211, 153, 0.38)')}>
                    {item.label}
                  </button>
                ))}
              </div>
              <div style={{ marginTop: '6px', fontFamily: 'Rajdhani, sans-serif', fontSize: '12px', color: 'rgba(226, 232, 240, 0.66)' }}>
                {getTextDensityEntry(brief.textDensity).note}
              </div>
            </div>

            <div>
              <div style={fieldLabelStyle}>AI 이미지</div>
              <div style={segmentedGridStyle}>
                {AI_IMAGE_OPTIONS.map((item) => (
                  <button key={item.id} type="button" onClick={() => updateBrief(mode, { aiImageMode: item.id })} style={buildChipStyle(brief.aiImageMode === item.id, 'rgba(250, 204, 21, 0.38)')}>
                    {item.label}
                  </button>
                ))}
              </div>
              <div style={{ marginTop: '6px', fontFamily: 'Rajdhani, sans-serif', fontSize: '12px', color: 'rgba(226, 232, 240, 0.66)' }}>
                {getAiImageEntry(brief.aiImageMode).note}
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gap: '12px' }}>
            <div style={{ padding: '14px', borderRadius: '14px', border: '1px solid rgba(125, 211, 252, 0.14)', background: 'rgba(2, 6, 23, 0.44)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap', marginBottom: '10px' }}>
                <div>
                  <div style={{ ...fieldLabelStyle, marginBottom: '6px' }}>CONTENTS PLAN</div>
                  <div style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '12px', color: 'rgba(226, 232, 240, 0.72)', lineHeight: 1.45 }}>
                    AI가 먼저 만든 목차 기틀을 바탕으로 제목, 내용, 인용 전략을 다듬습니다. 여기서 정한 구조가 바로 생성 프롬프트로 들어갑니다.
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <button type="button" onClick={() => handleResetAutoOutline(mode)} disabled={outlineDraftLoading[mode]} style={{ ...secondaryButtonStyle(outlineDraftLoading[mode]), width: 'auto' }}>
                    {outlineDraftLoading[mode] ? 'AI 초안 생성 중...' : 'AI 목차 다시 만들기'}
                  </button>
                  <button type="button" onClick={() => handleAddOutlineItem(mode)} disabled={sectionPlans.length >= 10 || outlineDraftLoading[mode]} style={{ ...secondaryButtonStyle(sectionPlans.length >= 10 || outlineDraftLoading[mode]), width: 'auto' }}>
                    항목 추가
                  </button>
                  <button type="button" onClick={() => fetchPaperPool(mode, { force: true })} disabled={paperPoolLoading[mode]} style={{ ...secondaryButtonStyle(paperPoolLoading[mode]), width: 'auto' }}>
                    {paperPoolLoading[mode] ? '논문 후보 갱신 중...' : '논문 후보 새로고침'}
                  </button>
                </div>
              </div>

              <div style={{ marginBottom: '12px' }}>
                {visibleSectionPlans.length > 0 ? renderOutlinePreview(mode, visibleSectionPlans, brief.theme, brief) : null}
              </div>

              {outlineDraftLoading[mode] && (
                <div style={{ marginBottom: '12px', padding: '12px 14px', borderRadius: '12px', border: '1px solid rgba(125, 211, 252, 0.16)', background: 'rgba(15, 23, 42, 0.72)', fontFamily: 'Rajdhani, sans-serif', fontSize: '13px', color: '#e2e8f0', lineHeight: 1.45 }}>
                  {mode === 'docs' ? 'AI가 문서 목차 기틀을 만드는 중입니다. 몇 초 후 실제 초안이 채워집니다.' : 'AI가 PPT 목차 기틀을 만드는 중입니다. 몇 초 후 실제 초안이 채워집니다.'}
                </div>
              )}

              {outlineDraftError[mode] && (
                <div style={{ marginBottom: '12px', padding: '12px 14px', borderRadius: '12px', border: '1px solid rgba(248, 113, 113, 0.18)', background: 'rgba(69, 10, 10, 0.28)', fontFamily: 'Rajdhani, sans-serif', fontSize: '13px', color: '#fecaca', lineHeight: 1.45 }}>
                  {outlineDraftError[mode]}
                </div>
              )}

              {paperPoolError[mode] && !citationPaperPool.length && (
                <div style={{ marginBottom: '10px', padding: '10px 12px', borderRadius: '12px', background: 'rgba(30, 41, 59, 0.72)', border: '1px solid rgba(148, 163, 184, 0.16)', fontFamily: 'Rajdhani, sans-serif', fontSize: '12px', color: '#e2e8f0', lineHeight: 1.4 }}>
                  {paperPoolError[mode]}
                </div>
              )}

              <div style={{ display: 'grid', gap: '12px' }}>
                {visibleSectionPlans.map((plan, index) => {
                  const citationOption = getSectionCitationOptionEntry(plan.citationMode);
                  const suggestedPapers = buildSuggestedPapersForPlan({ plan, paperPool: citationPaperPool, overview: brief.overview });
                  const selectedCitationIds = new Set(normalizeSectionCitations(plan.citations).map((item) => item.id));

                  return (
                    <div key={`${plan.fallbackTitle}-${index}`} style={{ padding: '14px', borderRadius: '14px', border: '1px solid rgba(148, 163, 184, 0.14)', background: 'rgba(15, 23, 42, 0.62)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap', marginBottom: '10px' }}>
                        <div>
                          <div style={{ fontFamily: 'Orbitron, sans-serif', fontSize: '8px', color: '#7dd3fc', letterSpacing: '0.12em', marginBottom: '4px' }}>
                            {mode === 'ppt' ? `SLIDE ${index + 1}` : `SECTION ${index + 1}`}
                          </div>
                          <div style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '12px', color: 'rgba(226, 232, 240, 0.7)' }}>
                            {mode === 'ppt' ? '이 슬라이드에서 전달할 메시지와 근거를 먼저 설계합니다.' : '이 섹션에 어떤 내용과 근거를 넣을지 먼저 설계합니다.'}
                          </div>
                        </div>
                        <button type="button" onClick={() => handleRemoveOutlineItem(mode, index)} disabled={visibleSectionPlans.length <= 4 || outlineDraftLoading[mode]} style={{ ...secondaryButtonStyle(visibleSectionPlans.length <= 4 || outlineDraftLoading[mode]), width: 'auto', padding: '8px 10px' }}>
                          삭제
                        </button>
                      </div>

                      <div style={{ display: 'grid', gap: '10px' }}>
                        <label>
                          <span style={fieldLabelStyle}>목차 제목</span>
                          <input value={plan.title} onChange={(event) => handleOutlineTitleChange(mode, index, event.target.value)} style={inputStyle} />
                        </label>

                        <label>
                          <span style={fieldLabelStyle}>{mode === 'ppt' ? '이 슬라이드에 들어갈 내용' : '이 섹션에 들어갈 내용'}</span>
                          <textarea
                            value={plan.contentNote}
                            onChange={(event) => handleSectionContentNoteChange(mode, index, event.target.value)}
                            placeholder={plan.contentPlaceholder}
                            rows={3}
                            style={{ ...inputStyle, resize: 'vertical' }}
                          />
                        </label>

                        <div>
                          <div style={fieldLabelStyle}>인용 사용 방식</div>
                          <div style={segmentedGridStyle}>
                            {SECTION_CITATION_OPTIONS.map((item) => (
                              <button key={item.id} type="button" onClick={() => handleSectionCitationModeChange(mode, index, item.id)} style={buildChipStyle(plan.citationMode === item.id, 'rgba(96, 165, 250, 0.38)')}>
                                {item.label}
                              </button>
                            ))}
                          </div>
                          <div style={{ marginTop: '6px', fontFamily: 'Rajdhani, sans-serif', fontSize: '12px', color: 'rgba(226, 232, 240, 0.66)' }}>
                            {citationOption.note}
                          </div>
                        </div>

                        {plan.citationMode !== 'off' && (
                          <>
                            <label>
                              <span style={fieldLabelStyle}>찾을 논문 / 자료 방향</span>
                              <input
                                value={plan.citationQuery}
                                onChange={(event) => handleSectionCitationQueryChange(mode, index, event.target.value)}
                                placeholder={plan.citationPlaceholder}
                                style={inputStyle}
                              />
                            </label>

                            <div style={{ display: 'grid', gap: '8px' }}>
                              <div style={fieldLabelStyle}>추천 인용 후보</div>
                              {suggestedPapers.length > 0 ? suggestedPapers.map((paper) => (
                                <div key={paper.id} style={{ padding: '10px 12px', borderRadius: '12px', border: '1px solid rgba(148, 163, 184, 0.14)', background: 'rgba(2, 6, 23, 0.62)' }}>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                                    <div style={{ minWidth: 0, flex: 1 }}>
                                      <div style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '13px', fontWeight: 700, color: '#f8fafc', lineHeight: 1.35 }}>
                                        {paper.title}
                                      </div>
                                      <div style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '11px', color: 'rgba(191, 219, 254, 0.72)', lineHeight: 1.35, marginTop: '4px' }}>
                                        {buildPaperMetaLine(paper) || '메타데이터 없음'}
                                      </div>
                                    </div>
                                    <button type="button" onClick={() => handleToggleSectionCitationCandidate(mode, index, paper)} style={{ ...secondaryButtonStyle(false), width: 'auto', padding: '8px 10px' }}>
                                      {selectedCitationIds.has(paper.id) ? '제거' : '추가'}
                                    </button>
                                  </div>
                                  {paper.snippet && (
                                    <div style={{ marginTop: '6px', fontFamily: 'Rajdhani, sans-serif', fontSize: '12px', color: 'rgba(226, 232, 240, 0.68)', lineHeight: 1.4 }}>
                                      {paper.snippet}
                                    </div>
                                  )}
                                </div>
                              )) : (
                                <div style={{ padding: '10px 12px', borderRadius: '12px', border: '1px dashed rgba(148, 163, 184, 0.2)', color: 'rgba(226, 232, 240, 0.64)', fontFamily: 'Rajdhani, sans-serif', fontSize: '12px' }}>
                                  자동 추천 논문이 없으면 위 검색어에 직접 원하는 방향을 적고 생성해도 됩니다.
                                </div>
                              )}
                            </div>

                            {plan.citations.length > 0 && (
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                                {plan.citations.map((paper) => (
                                  <button key={paper.id} type="button" onClick={() => handleToggleSectionCitationCandidate(mode, index, paper)} style={{ ...buildChipStyle(true, 'rgba(52, 211, 153, 0.38)'), fontSize: '10px' }}>
                                    {paper.title}
                                  </button>
                                ))}
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div style={{ padding: '12px', borderRadius: '12px', border: '1px solid rgba(125, 211, 252, 0.14)', background: 'rgba(8, 47, 73, 0.18)' }}>
              <div style={{ ...fieldLabelStyle, marginBottom: '6px' }}>CURRENT STRUCTURE</div>
              <div style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '12px', color: 'rgba(226, 232, 240, 0.72)', lineHeight: 1.45, marginBottom: '8px' }}>
                현재 목차는 생성 시 우선 순서로 반영됩니다. 전체 항목 수는 {visibleSectionPlans.length}개이고, 인용 후보는 전체 개요 기준으로 불러온 학술 결과 {citationPaperPool.length}건에서 추천됩니다.
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                <div style={{ ...buildChipStyle(true, 'rgba(125, 211, 252, 0.32)'), fontSize: '10px', cursor: 'default' }}>THEME · {getThemeEntry(brief.theme).label}</div>
                <div style={{ ...buildChipStyle(true, 'rgba(196, 181, 253, 0.32)'), fontSize: '10px', cursor: 'default' }}>LANGUAGE · {getLanguageEntry(brief.language).label}</div>
                <div style={{ ...buildChipStyle(true, 'rgba(74, 222, 128, 0.32)'), fontSize: '10px', cursor: 'default' }}>ITEMS · {visibleSectionPlans.length}</div>
                <div style={{ ...buildChipStyle(true, 'rgba(244, 114, 182, 0.32)'), fontSize: '10px', cursor: 'default' }}>SOURCE · {outlineDraftSource[mode] === 'llm' ? 'AI DRAFT' : outlineDraftSource[mode] === 'fallback' ? 'SAFE FALLBACK' : 'PENDING'}</div>
              </div>
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '8px' }}>
          <button type="button" onClick={() => handleGenerateArtifact(mode)} disabled={artifactBusy[busyKey]} style={buildPrimaryButtonStyle(artifactBusy[busyKey], mode === 'docs' ? 'green' : 'cyan')}>
            {artifactBusy[busyKey] ? `${outputLabel} 생성 중...` : `${outputLabel} 생성`}
          </button>
          <button type="button" onClick={() => handleExport(mode === 'docs' ? 'docx' : 'pptx', mode === 'docs' ? 'report' : 'slides')} disabled={!artifact || !!artifactBusy.export} style={secondaryButtonStyle(!artifact || !!artifactBusy.export)}>
            {mode === 'docs' ? 'DOCX 다운로드' : 'PPTX 다운로드'}
          </button>
          <button type="button" onClick={() => handleExport(mode === 'docs' ? 'google-docs' : 'google-slides', mode === 'docs' ? 'report' : 'slides')} disabled={!artifact || !!artifactBusy.export} style={secondaryButtonStyle(!artifact || !!artifactBusy.export)}>
            {googleExportState.mode === 'oauth' && !googleExportState.connected ? `Google 연결 후 ${mode === 'docs' ? 'Docs' : 'Slides'}` : mode === 'docs' ? 'Google Docs' : 'Google Slides'}
          </button>
          <button type="button" onClick={() => handleArtifactFeedback(mode === 'docs' ? 'report' : 'slides', 'up')} disabled={!artifact || !!artifactBusy.feedback} style={secondaryButtonStyle(!artifact || !!artifactBusy.feedback)}>
            좋은 {outputLabel}
          </button>
        </div>

        {artifact && (
          <button type="button" onClick={() => handleArtifactFeedback(mode === 'docs' ? 'report' : 'slides', 'down')} disabled={!!artifactBusy.feedback} style={secondaryButtonStyle(!!artifactBusy.feedback)}>
            개선 필요 {outputLabel}
          </button>
        )}

        {artifact && (
          <div style={{ padding: '10px 12px', borderRadius: '10px', border: '1px solid rgba(125, 211, 252, 0.14)', background: 'rgba(8, 47, 73, 0.18)', fontFamily: 'Rajdhani, sans-serif', fontSize: '12px', color: '#dbeafe', lineHeight: 1.45 }}>
            현재 {outputLabel} 출력 소스 · {outputSource === 'debate' ? '토론 기반 seed' : '브리프 기반 생성'}
          </div>
        )}

        <button type="button" onClick={() => handleOpenAdvancedBuilder(mode)} style={secondaryButtonStyle(false)}>
          고급 모드 열기
        </button>
      </div>
    );
  };

  const renderDebateLab = () => (
    <div style={{ display: 'grid', gap: '14px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontFamily: 'Orbitron, sans-serif', fontSize: '10px', color: '#f59e0b', letterSpacing: '0.16em', marginBottom: '6px' }}>DEBATE LAB</div>
          <div style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '18px', fontWeight: 700, color: '#f8fafc', marginBottom: '4px' }}>학습용 토론과 인사이트 수집</div>
          <div style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '12px', color: 'rgba(226, 232, 240, 0.72)', lineHeight: 1.45 }}>
            이 공간은 내부 reasoning과 학습 데이터 축적용입니다. 문서/PPT 생성의 필수 단계는 아닙니다.
          </div>
        </div>
        <button type="button" onClick={() => handleModeSelect('home')} style={secondaryButtonStyle(false)}>
          시작 화면으로
        </button>
      </div>

      <div style={{ display: 'grid', gap: '10px' }}>
        <div>
          <div style={fieldLabelStyle}>자율 주제 발굴</div>
          <input value={focusInput} onChange={(event) => setFocusInput(event.target.value)} placeholder="예: 규제, AI agent, 제조, 헬스케어" style={inputStyle} />
        </div>
        <button type="button" onClick={handleGenerateTopics} disabled={topicsLoading} style={secondaryButtonStyle(topicsLoading)}>
          {topicsLoading ? '주제 후보 생성 중...' : '자율 주제 후보 만들기'}
        </button>
      </div>

      {topicSuggestions.length > 0 && (
        <div style={{ display: 'grid', gap: '8px' }}>
          {topicSuggestions.map((item, index) => (
            <button key={`${item.title}-${index}`} type="button" onClick={() => setDebateInput(item.title)} style={{ textAlign: 'left', padding: '10px', borderRadius: '12px', border: '1px solid rgba(148, 163, 184, 0.16)', background: 'rgba(15, 23, 42, 0.64)', cursor: 'pointer' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', marginBottom: '4px' }}>
                <div style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '13px', fontWeight: 700, color: '#ecfeff' }}>{item.title}</div>
                <div style={{ fontFamily: 'Orbitron, sans-serif', fontSize: '9px', color: '#fbbf24' }}>N {item.noveltyScore} / U {item.urgencyScore}</div>
              </div>
              <div style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '12px', color: 'rgba(226, 232, 240, 0.72)', lineHeight: 1.4 }}>{item.rationale}</div>
            </button>
          ))}
        </div>
      )}

      <form onSubmit={handleDebateSubmit} style={{ display: 'grid', gap: '10px' }}>
        <div style={{ position: 'relative' }}>
          <textarea
            value={debateInput}
            onChange={(event) => { setDebateInput(event.target.value); setTranscriptError(''); }}
            placeholder={'토론 주제 또는 YouTube URL\n\n예: 데이터 주권과 AI 학습 데이터 확보 전략\n예: https://youtu.be/...'}
            disabled={isLoading}
            rows={5}
            style={{ ...inputStyle, resize: 'vertical', border: `1px solid ${isYT ? 'rgba(248, 113, 113, 0.42)' : 'rgba(148, 163, 184, 0.18)'}` }}
          />
          {isYT && (
            <div style={{ position: 'absolute', top: '10px', right: '10px', background: 'rgba(239, 68, 68, 0.9)', color: 'white', fontFamily: 'Orbitron, sans-serif', fontSize: '8px', padding: '4px 7px', borderRadius: '999px', letterSpacing: '0.1em' }}>
              YOUTUBE
            </div>
          )}
        </div>

        {transcriptError && (
          <div style={{ color: '#fca5a5', fontFamily: 'Rajdhani, sans-serif', fontSize: '12px' }}>
            {transcriptError}
          </div>
        )}

        <button type="submit" disabled={isLoading || !debateInput.trim()} style={buildPrimaryButtonStyle(isLoading || !debateInput.trim(), isYT ? 'amber' : 'cyan')}>
          {isFetchingTranscript ? '영상 맥락 로딩 중...' : isDiscussing ? '토론 진행 중...' : isYT ? 'YouTube 토론 시작' : '토론 시작'}
        </button>

        {consensus && !isDiscussing && (
          <button type="button" onClick={clearDiscussion} style={secondaryButtonStyle(false)}>
            토론 상태 비우기
          </button>
        )}
      </form>
    </div>
  );

  const currentBuilderStage = (activeMode === 'docs' || activeMode === 'ppt') ? (builderStage[activeMode] || 'overview') : 'overview';
  const isBuilderOverviewStage = (activeMode === 'docs' || activeMode === 'ppt') && currentBuilderStage === 'overview';
  const isBuilderDetailsStage = (activeMode === 'docs' || activeMode === 'ppt') && currentBuilderStage === 'details';
  const isBuilderAdvancedStage = (activeMode === 'docs' || activeMode === 'ppt') && currentBuilderStage === 'advanced';

  return (
    <div style={{
      position: 'absolute',
      top: '20px',
      left: '20px',
      zIndex: isBuilderAdvancedStage ? 160 : 100,
      background: isBuilderAdvancedStage
        ? 'linear-gradient(180deg, rgba(239, 246, 255, 0.98) 0%, rgba(224, 242, 254, 0.95) 100%)'
        : 'linear-gradient(180deg, rgba(2, 6, 23, 0.94) 0%, rgba(10, 18, 34, 0.9) 100%)',
      backdropFilter: 'blur(16px)',
      padding: '18px',
      borderRadius: '18px',
      border: isBuilderAdvancedStage ? '1px solid rgba(191, 219, 254, 0.9)' : '1px solid rgba(125, 211, 252, 0.16)',
      width: activeMode === 'home' ? '380px' : activeMode === 'debate' ? '430px' : isBuilderAdvancedStage ? 'calc(100vw - 40px)' : isBuilderOverviewStage ? '480px' : isBuilderDetailsStage ? 'min(1080px, calc(100vw - 40px))' : 'min(620px, calc(100vw - 40px))',
      maxHeight: '92vh',
      overflowY: 'auto',
      transition: 'width 0.25s ease, border-color 0.3s ease',
      boxSizing: 'border-box',
      color: isBuilderAdvancedStage ? '#0f172a' : 'inherit',
    }}>
      <div style={{ marginBottom: '14px' }}>
        <div style={{ color: isBuilderAdvancedStage ? '#1d4ed8' : '#c4f1ff', fontSize: '16px', marginBottom: '6px', fontFamily: 'Orbitron, monospace', letterSpacing: '0.14em' }}>
          AI GODS STUDIO
        </div>
        <div style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '12px', color: isBuilderAdvancedStage ? 'rgba(15, 23, 42, 0.68)' : 'rgba(226, 232, 240, 0.72)', lineHeight: 1.4 }}>
          토론은 내부 reasoning 엔진으로 두고, 문서와 PPT는 브리프 중심 Studio로 따로 설계합니다.
        </div>
      </div>

      {activeMode === 'home' ? renderHome() : activeMode === 'debate' ? renderDebateLab() : renderBuilder(activeMode)}

      <button type="button" onClick={onOpenDashboard} style={{ width: '100%', padding: '10px', marginTop: '12px', background: 'linear-gradient(135deg, rgba(8, 145, 178, 0.24) 0%, rgba(37, 99, 235, 0.22) 100%)', border: '1px solid rgba(125, 211, 252, 0.2)', borderRadius: '8px', color: '#bff8ff', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer' }}>
        운영 대시보드 열기
      </button>

      {(isDiscussing || isFetchingTranscript || statusText) && (
        <div style={{ marginTop: '14px' }}>
          {isDiscussing && (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                <span style={{ fontFamily: 'Orbitron, sans-serif', fontSize: '9px', color: 'rgba(100,200,255,0.6)' }}>ROUND {currentRound}</span>
                <span style={{ fontFamily: 'Orbitron, sans-serif', fontSize: '9px', color: 'rgba(100,200,255,0.3)' }}>/ MAX {displayTotalRounds}</span>
              </div>
              <div style={{ height: '3px', background: 'rgba(100,200,255,0.1)', borderRadius: '999px', marginBottom: '8px' }}>
                <div style={{ height: '100%', width: `${progressWidth}%`, background: 'linear-gradient(90deg, #0ea5e9, #34d399)', borderRadius: '999px', transition: 'width 0.5s ease' }} />
              </div>
            </>
          )}
          <div style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '12px', color: 'rgba(255,180,0,0.84)', lineHeight: 1.4 }}>
            {isFetchingTranscript ? 'YouTube transcript 수집 중...' : statusText}
          </div>
        </div>
      )}

      {panelMessage && (
        <div style={{ marginTop: '12px', padding: '10px', borderRadius: '10px', background: 'rgba(12, 74, 110, 0.2)', border: '1px solid rgba(125, 211, 252, 0.16)', fontFamily: 'Rajdhani, sans-serif', fontSize: '12px', color: '#e0f2fe', lineHeight: 1.4 }}>
          {panelMessage}
        </div>
      )}

      {dossier?.citationSummary && (
        <div style={{ marginTop: '12px', padding: '10px', borderRadius: '10px', background: 'rgba(6, 78, 59, 0.16)', border: '1px solid rgba(52, 211, 153, 0.16)' }}>
          <div style={{ fontFamily: 'Orbitron, sans-serif', fontSize: '9px', color: '#6ee7b7', letterSpacing: '0.14em', marginBottom: '6px' }}>SOURCE HEALTH</div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <div style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '12px', color: '#ecfdf5' }}>평균 {dossier.citationSummary.averageCitationScore || 0}/100</div>
            <div style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '12px', color: '#d1fae5' }}>검증 {dossier.citationSummary.verifiedCount || 0}</div>
            <div style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '12px', color: '#fecaca' }}>재검토 {dossier.citationSummary.needsReviewCount || 0}</div>
          </div>
        </div>
      )}
    </div>
  );
}