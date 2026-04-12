export interface AgentMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface FriendResponse {
  analogy: string;
  followUp: string;
}
