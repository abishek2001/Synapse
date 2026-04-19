import { chatCompletion } from "@/lib/logging/openai";

export interface StudyModule {
  id: string;
  title: string;
  description: string;
  keyTerms: string[];
  estimatedMinutes: number;
  order: number;
}

export interface StudyPlan {
  topic: string;
  totalModules: number;
  estimatedMinutes: number;
  modules: StudyModule[];
  prerequisites: string[];
}

export async function generateStudyPlan(
  topic: string,
  documentContext?: string,
): Promise<StudyPlan> {
  const docHint = documentContext
    ? `\n\nThe student uploaded materials. Here's a preview:\n${documentContext.slice(0, 3000)}`
    : "";

  const res = await chatCompletion("study-plan.generate", {
    model: process.env.OPENAI_MODEL ?? "gpt-4o",
    messages: [
      {
        role: "system",
        content: `You generate structured study plans as JSON. Break a topic into 3-8 sequential learning modules. Each module should be a digestible concept (5-15 minutes). Output ONLY valid JSON, no markdown.`,
      },
      {
        role: "user",
        content: `Create a study plan for: "${topic}"${docHint}

Return JSON:
{
  "topic": "...",
  "prerequisites": ["prior knowledge needed"],
  "modules": [
    {
      "title": "Module title",
      "description": "What this module covers (1 sentence)",
      "keyTerms": ["term1", "term2"],
      "estimatedMinutes": 10
    }
  ]
}`,
      },
    ],
    temperature: 0.4,
    max_tokens: 1500,
  });

  const raw = res.choices[0]?.message?.content ?? "{}";
  const cleaned = raw.replace(/```(?:json)?\n?/g, "").replace(/```$/g, "").trim();

  try {
    const parsed = JSON.parse(cleaned);
    const modules: StudyModule[] = (parsed.modules || []).map(
      (m: Omit<StudyModule, "id" | "order">, i: number) => ({
        id: `sp-${Date.now()}-${i}`,
        title: m.title,
        description: m.description,
        keyTerms: m.keyTerms || [],
        estimatedMinutes: m.estimatedMinutes || 10,
        order: i,
      }),
    );

    return {
      topic: parsed.topic || topic,
      totalModules: modules.length,
      estimatedMinutes: modules.reduce((sum, m) => sum + m.estimatedMinutes, 0),
      modules,
      prerequisites: parsed.prerequisites || [],
    };
  } catch {
    return {
      topic,
      totalModules: 1,
      estimatedMinutes: 15,
      modules: [
        {
          id: `sp-${Date.now()}-0`,
          title: topic,
          description: `Explore ${topic}`,
          keyTerms: [],
          estimatedMinutes: 15,
          order: 0,
        },
      ],
      prerequisites: [],
    };
  }
}
