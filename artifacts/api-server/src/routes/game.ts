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
          content:
            "You are a physique judge. Rate the visible physique in the image on a scale of 1 to 10, considering muscle definition, build, and overall fitness. Give a concise score and one short sentence of feedback. Respond ONLY with valid JSON like: {\"score\": 7, \"feedback\": \"Good muscle definition and solid build.\"}. If you cannot see a physique clearly, give a score of 3 with appropriate feedback.",
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
