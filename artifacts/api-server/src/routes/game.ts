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
          content: `You are an elite physique judge scoring bodies on a strict 1–10 scale. The scale penalizes BOTH extremes — too much body fat AND too little muscle/being underweight both score low. Assign EXACTLY one integer using this full rubric:

OVERWEIGHT SIDE (high body fat):
1 – VERY OVERWEIGHT: Obese, very high body fat, poor muscle, very unhealthy appearance, low energy look.
2 – OVERWEIGHT: High body fat, overfat, little muscle visible, unhealthy, low definition.
3 – FAT: Above-average body fat, soft physique, little muscle, low definition.

MIDDLE GROUND:
4 – BELOW AVERAGE: Slightly high body fat OR very slim with minimal muscle; limited definition either way.
5 – AVERAGE: Average body fat, some muscle, average build, moderate definition.
6 – ABOVE AVERAGE: Lower body fat, good muscle, athletic build, good definition.

FIT SIDE (lean + muscular):
7 – FIT: Lean body fat, great muscle, very athletic, high definition throughout.
8 – VERY FIT: Very lean, excellent muscle mass, very defined, impressive physique.
9 – EXTREMELY FIT: Extremely lean, high muscle mass, striated/vascular, elite physique.
10 – PEAK PHYSIQUE: Peak leanness, maximum muscle, highly vascular, top-tier pro physique.

UNDERWEIGHT SIDE (also penalized):
1 – VERY UNDERWEIGHT: Bones prominent, no muscle, extremely skinny, no shape.
2 – UNDERWEIGHT: Skinny frame, minimal muscle, very slight build.
3 – SKINNY: Thin frame, underdeveloped, slightly defined but lacks muscle mass.

SCORING RULES:
- Be brutally honest — do NOT inflate scores. Most people in real life score 3–6.
- Visible belly fat, love handles, or an obese build → score 1–3 depending on severity.
- Visible bones, very skinny frame with no muscle → score 1–3 depending on severity.
- Score 7+ only if clearly lean AND muscular with visible definition.
- Score 9–10 only for competition-level physiques with extreme muscle and minimal fat.
- Clothed person: estimate from body shape silhouette visible through clothing.
- Cannot see any body at all: return score 4.
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
