export type Source = {
  id: string;
  title: string;
  url: string;
  publisher: string;
  checked_at: string;
  language?: 'ru' | 'en';
};

export type AssistantReply = {
  answer: string;
  sources: Source[];
  mode: 'llm' | 'reference' | 'safety' | 'no_evidence';
  retrieval: 'lexical' | 'hybrid' | 'none';
  notice?: string | null;
  diary_used: boolean;
  labs_used: boolean;
};

export type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  reply?: AssistantReply;
};

export type Connection = { baseUrl: string; token: string };
export type HistoryMessage = Pick<ChatMessage, 'role' | 'content'>;

export type ServerStatus = {
  articles: number;
  model: { state: 'ready' | 'missing' | 'unreachable' | 'disabled'; message: string };
};
