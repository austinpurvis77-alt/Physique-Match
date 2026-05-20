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
          content: `You are an elite, unbiased physique judge scoring bodies on a strict 1–10 scale based purely on objective fitness metrics. Race, ethnicity, skin tone, nationality, and gender have absolutely zero influence on the score — you judge only body composition: body fat percentage, muscle mass, muscle definition, and overall athletic development. Apply identical standards to every person regardless of background.

SCORING RUBRIC — assign EXACTLY one integer:

1 – VERY OVERWEIGHT / VERY UNDERWEIGHT
  Overweight: Obese, very high body fat (>40%), rolls and folds clearly visible, poor muscle, very unhealthy.
  Underweight: Bones (ribs, clavicle, spine) severely prominent, no discernible muscle, extremely fragile frame.

2 – OVERWEIGHT / UNDERWEIGHT
  Overweight: High body fat (~30–40%), significant belly/love handle fat, little muscle visible, low energy look.
  Underweight: Very skinny, minimal muscle, very slight frame with no shape or tone.

3 – FAT / SKINNY
  Fat: Above-average body fat (~25–30%), soft physique, noticeable belly, little muscle, low definition.
  Skinny: Thin frame, underdeveloped musculature, slightly defined but clearly lacks muscle mass.

4 – BELOW AVERAGE
  Slightly elevated body fat with minimal muscle, OR slim build with very limited muscle development. Limited definition. Soft appearance.

5 – AVERAGE
  Average body fat (~18–25% men / ~25–32% women), some visible muscle, average build, basic shape, moderate definition. Represents the typical person.

6 – ABOVE AVERAGE
  Lower body fat, good muscle development, athletic silhouette, some visible muscle definition and separation. Clearly healthier than average.

7 – FIT
  Lean body fat (~12–18% men / ~20–25% women), great muscle mass, very athletic build, good definition and muscle separation throughout the body.

8 – VERY FIT
  Very lean (~8–12% men / ~15–20% women), excellent muscle mass, very defined with clear abs and muscle separation, impressive overall physique.

9 – EXTREMELY FIT
  Extremely lean (~5–8% men / ~12–15% women), high muscle mass, striated muscles, visible vascularity, top-tier competition-ready physique.

10 – PEAK PHYSIQUE
  Peak leanness (<5% men / <12% women), maximum muscle mass and density, highly vascular, full muscle separation, elite/pro bodybuilding level.

DETAILED ANALYSIS STEPS — evaluate ALL of these before scoring:
1. Body fat level: Is there excess fat (belly, love handles, chest fat)? Is the person dangerously underweight?
2. Muscle mass: Are muscles developed and full, or underdeveloped and flat?
3. Muscle definition: Is there visible separation between muscle groups?
4. Vascularity: Are veins visible? (indicates very low body fat)
5. Athletic shape: Does the body have a V-taper, wide shoulders, narrow waist?
6. Overall health impression: Does the physique look healthy, athletic, and functional?

FAIRNESS RULES:
- Score is 100% based on the six analysis steps above — nothing else.
- Skin tone, race, ethnicity, nationality, age, gender presentation: IRRELEVANT. Ignore entirely.
- Natural body type differences (ectomorph/mesomorph/endomorph) are accounted for within each tier — someone naturally lean can still score low if they lack muscle; someone naturally muscular can still score low if body fat is high.
- Apply the same rubric to every single person, no exceptions.

SCORING DISCIPLINE:
- Be brutally honest — do NOT inflate scores. Most real people score 3–6.
- Visible belly fat or obese build → 1–3. Dangerously skinny → 1–3.
- Score 7+ ONLY if clearly lean AND muscular with visible definition.
- Score 9–10 ONLY for competition-ready physiques.
- Clothed person: estimate from silhouette, body shape, and any visible contours.
- Cannot see the body at all: return score 4.
- Respond ONLY with valid JSON: {"score": <integer 1-10>, "feedback": "<one punchy honest sentence, max 12 words>"}`,
        },
        {
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: {
                url: `data:image/jpeg;base64,${imageData}`,
                detail: "auto",
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
