import type { YFNewsItem, NewsSentiment } from "@/types";
import { timeAgo } from "@/lib/utils";

interface NewsPanelProps {
  news: YFNewsItem[];
}

const POS_WORDS = ["beat", "surge", "rally", "growth", "strong", "record", "rise", "gain", "top", "exceed"];
const NEG_WORDS = ["miss", "fall", "drop", "cut", "risk", "loss", "decline", "concern", "warn", "weak", "crash"];

function deriveSentiment(title: string): NewsSentiment {
  const lower = title.toLowerCase();
  const posScore = POS_WORDS.filter((w) => lower.includes(w)).length;
  const negScore = NEG_WORDS.filter((w) => lower.includes(w)).length;
  if (posScore > negScore) return "positive";
  if (negScore > posScore) return "negative";
  return "neutral";
}

const sentimentClass: Record<NewsSentiment, string> = {
  positive: "tag-up",
  negative: "tag-dn",
  neutral: "tag-muted",
};

const sentimentLabel: Record<NewsSentiment, string> = {
  positive: "利好",
  negative: "利空",
  neutral: "中性",
};

export default function NewsPanel({ news }: NewsPanelProps) {
  if (!news.length) return null;

  return (
    <div className="panel p-5">
      <p className="text-[10px] tracking-[0.18em] text-muted/60 mb-3">// LATEST NEWS</p>
      <div className="space-y-3">
        {news.map((item) => {
          const sentiment = deriveSentiment(item.title);
          return (
            <div key={item.uuid} className="border-b border-border/30 last:border-0 pb-3 last:pb-0">
              <div className="flex items-start justify-between gap-2 mb-1">
                <a
                  href={item.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-txt/90 hover:text-txt leading-snug transition-colors flex-1"
                >
                  {item.title}
                </a>
                <span className={`tag ${sentimentClass[sentiment]} text-[9px] shrink-0`}>
                  {sentimentLabel[sentiment]}
                </span>
              </div>
              <div className="flex gap-2 text-[10px] text-muted/50 font-trading">
                <span>{item.publisher}</span>
                <span>·</span>
                <span>{timeAgo(item.providerPublishTime)}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
