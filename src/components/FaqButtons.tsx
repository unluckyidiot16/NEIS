// src/components/FaqButtons.tsx

interface Props {
  onSelect: (question: string) => void;
  disabled: boolean;
}

const FAQ_ITEMS = [
  {
    emoji: "🔑",
    label: "권한관리자 지정",
    question: "신학년도 나이스 권한관리자 지정 및 권한 위임 기안문은 언제, 어떻게 작성해야 하나요?",
  },
  {
    emoji: "📅",
    label: "학사일정 등록",
    question: "학사일정을 나이스에 등록하는 방법과 절차를 알려주세요.",
  },
  {
    emoji: "📝",
    label: "성적 처리",
    question: "학기말 성적 처리 절차와 성적 마감 방법을 안내해 주세요.",
  },
  {
    emoji: "👨‍🏫",
    label: "학급 편성",
    question: "신학년도 학급 편성 및 담임 배정은 나이스에서 어떻게 진행하나요?",
  },
  {
    emoji: "📊",
    label: "출결 관리",
    question: "학생 출결 관리와 출석부 작성 방법을 설명해 주세요.",
  },
  {
    emoji: "🔄",
    label: "학년도 이월",
    question: "학년도 마감 및 신학년도 이월 작업 절차를 알려주세요.",
  },
];

export default function FaqButtons({ onSelect, disabled }: Props) {
  return (
    <div className="faq-section">
      <p className="faq-title">자주 묻는 질문</p>
      <div className="faq-grid">
        {FAQ_ITEMS.map((item) => (
          <button
            key={item.label}
            className="faq-button"
            onClick={() => onSelect(item.question)}
            disabled={disabled}
          >
            <span className="faq-emoji">{item.emoji}</span>
            <span className="faq-label">{item.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
