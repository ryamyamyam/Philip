/**
 * Food photo analysis prompt shared by the Gemini adapter and the manual Claude handoff,
 * so both produce the same JSON shape and go through the same validator.
 */

export const FOOD_JSON_SHAPE = `{
  "items": [
    {
      "name": "string — short common name, e.g. \\"Grilled chicken breast\\"",
      "description": "string — what you see and how you sized it",
      "grams": number,
      "calories": number,
      "protein_g": number,
      "fat_g": number,
      "carbs_g": number,
      "confidence": "low" | "medium" | "high"
    }
  ],
  "total": { "calories": number, "protein_g": number, "fat_g": number, "carbs_g": number },
  "uncertainties": ["string", "..."]
}`;

export const FOOD_ANALYSIS_INSTRUCTIONS = `You are a careful nutrition analyst. Estimate the nutrition of the food in this photo.

Steps:
1. Identify each distinct food or drink that is visible. Treat a mixed dish (stew, salad, sandwich, burrito) as one item unless its components are clearly separate on the plate.
2. Estimate the edible weight in grams of each item as served. Use visual cues for scale: plate or bowl size (a standard dinner plate is about 26–28 cm), utensils, hands, packaging, and typical serving sizes.
3. Estimate calories, protein, fat, and carbohydrates for that weight using standard food composition values (e.g. USDA FoodData Central). Keep each item internally consistent: calories should be close to 4 × protein + 4 × carbs + 9 × fat.
4. Account for likely cooking oil, butter, dressings, and sauces. If they are probably present but not visible, include a reasonable typical amount in the estimate and say so in "uncertainties".
5. Set "confidence" per item: "high" only when the food and portion are both clear; "medium" when either is somewhat uncertain; "low" when the food is hard to identify, partly hidden, or the portion is hard to judge.
6. List the main sources of uncertainty, such as portion size, hidden ingredients, cooking oil, sauces, mixed dishes, and food hidden behind other food. Do not claim more certainty than the photo supports.
7. Always give your best reasonable estimate, even for ambiguous photos. Only return an empty "items" array if there is clearly no food or drink in the photo.

Rules:
- Use metric units. Numbers must be plain numbers (no units, no ranges, no strings). Round grams and calories to whole numbers and macros to one decimal.
- "total" must equal the sum of the items.
- Respond with JSON only, matching this shape exactly, with no markdown and no extra commentary:
${FOOD_JSON_SHAPE}`;

/** Text the user copies into the Claude iOS app along with their photo. */
export function claudeHandoffPrompt(): string {
  return `${FOOD_ANALYSIS_INSTRUCTIONS}

The photo is attached. Reply with only the JSON object.`;
}

/** Gemini structured-output schema (OpenAPI subset). */
export const GEMINI_RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    items: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          name: { type: 'STRING' },
          description: { type: 'STRING' },
          grams: { type: 'NUMBER' },
          calories: { type: 'NUMBER' },
          protein_g: { type: 'NUMBER' },
          fat_g: { type: 'NUMBER' },
          carbs_g: { type: 'NUMBER' },
          confidence: { type: 'STRING', enum: ['low', 'medium', 'high'] },
        },
        required: ['name', 'description', 'grams', 'calories', 'protein_g', 'fat_g', 'carbs_g', 'confidence'],
        propertyOrdering: ['name', 'description', 'grams', 'calories', 'protein_g', 'fat_g', 'carbs_g', 'confidence'],
      },
    },
    total: {
      type: 'OBJECT',
      properties: {
        calories: { type: 'NUMBER' },
        protein_g: { type: 'NUMBER' },
        fat_g: { type: 'NUMBER' },
        carbs_g: { type: 'NUMBER' },
      },
      required: ['calories', 'protein_g', 'fat_g', 'carbs_g'],
    },
    uncertainties: { type: 'ARRAY', items: { type: 'STRING' } },
  },
  required: ['items', 'total', 'uncertainties'],
  propertyOrdering: ['items', 'total', 'uncertainties'],
} as const;
