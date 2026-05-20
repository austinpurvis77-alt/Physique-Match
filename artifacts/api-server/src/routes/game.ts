import { Router, type IRouter } from "express";
import { openai } from "@workspace/integrations-openai-ai-server";
import { RateFrameBody, GetGameStatsResponse } from "@workspace/api-zod";
import { getStats } from "../lib/gameManager";

const router: IRouter = Router();

router.post("/rate-frame", async (req, res): Promise<void> => {
  const parsed = RateFrameBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { imageData } = parsed.data;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-5-mini",
      max_completion_tokens: 200,
      messages: [
        {
          role: "system",
          content: `You are an elite physique judge scoring bodies on a strict 1–10 scale. Analyze the visible body in the image and assign EXACTLY one integer score using this rubric:

1 – VERY UNDERWEIGHT: Extremely skinny, no visible muscle, bones prominent, little to no shape.
2 – UNDERWEIGHT: Skinny frame, minimal muscle, low body fat but no definition, very slight build.
3 – SKINNY: Thin frame, little muscle, low body fat, slightly defined but underdeveloped.
4 – BELOW AVERAGE: Slim build, some muscle present, low body fat, limited muscle definition.
5 – AVERAGE: Average build, moderate muscle, moderate body fat, basic shape with no standout features.
6 – ABOVE AVERAGE: Lean build, good muscle development, low body fat, some visible muscle definition.
7 – FIT: Athletic build, solid muscle mass, low body fat, good muscle definition throughout.
8 – VERY FIT: Muscular build, high muscle mass, low body fat, very defined with visible abs and muscle separation.
9 – EXTREMELY FIT: Extremely muscular, very low body fat, striated/vascular muscles, top-tier competition physique.
10 – PEAK PHYSIQUE: Peak muscularity, extremely low body fat, maximum definition and muscle separation, elite/pro level.

SCORING RULES:
- Be brutally honest and accurate — do NOT inflate scores. Most people score 3–6.
- Only award 7+ if there is clearly visible muscle definition, low body fat, and an athletic build.
- Only award 9–10 for competition-level physiques with extreme muscularity and definition.
- If the person is clothed, score based on visible body shape and estimate accordingly.
- If you cannot see the body at all, return score 3.
- Penalize high body fat heavily — visible belly fat, love handles, or soft physique caps the score at 5.
- Respond ONLY with valid JSON: {"score": <integer 1-10>, "feedback": "<one punchy sentence max 12 words>"}`,
        },
        {
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: {
                url: `data:image/jpeg;base64,${imageData}`,
                detail: "low",
              },
            },
          ],
        },
      ],
    });

    const raw = response.choices[0]?.message?.content ?? '{"score":3,"feedback":"Could not assess physique clearly."}';

    let result: { score: number; feedback: string };
    try {
      result = JSON.parse(raw);
    } catch {
      result = { score: 3, feedback: "Could not assess physique clearly." };
    }

    const score = Math.min(10, Math.max(1, Math.round(result.score)));
    res.json({ score, feedback: result.feedback ?? "Keep pushing!" });
  } catch (err) {
    req.log.error({ err }, "AI rating failed");
    res.json({ score: 5, feedback: "AI is warming up — keep going!" });
  }
});

router.get("/game/stats", async (_req, res): Promise<void> => {
  const stats = getStats();
  res.json(GetGameStatsResponse.parse(stats));
});

export default router;
