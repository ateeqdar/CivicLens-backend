const { GoogleGenerativeAI } = require('@google/generative-ai');
const axios = require('axios');
require('dotenv').config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

/**
 * Classifies a civic issue using Gemini Vision and Text models.
 * @param {string} imageUrl - The public URL of the issue image in Supabase Storage.
 * @param {string} description - The user-provided description of the issue.
 * @returns {Promise<Object>} - The AI-generated classification (type, authority, confidence).
 */
const classifyIssue = async (imageUrl, description) => {
  try {
    // 1. Initialize models
    // Using gemini-2.5-flash as the current model for image analysis (free-tier friendly)
    const visionModel = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    // 2. Prepare the prompt for classification
    // We combine vision and text analysis in one step if possible, 
    // or use vision to describe and text to categorize.
    // For a hackathon, a single combined prompt for gemini-1.5-flash is efficient.
    
    const prompt = `
      You are an AI civic assistant for the CivicLens platform.
      Analyze the following civic issue based on the image provided and the user's description.

      First, determine if the provided image and description are genuinely related to a civic issue.
      If the image and description are NOT related to a civic issue (e.g., personal photos, irrelevant content),
      return ONLY the following JSON object:
      {
        "error": "Image/description not related to civic issues."
      }
      DO NOT proceed with classification if it's not a civic issue.

      If it IS a civic issue, proceed with the following tasks:

      User Description: "${description}"

      Tasks:
      1. **Analyze the image and description carefully.**
      2. Identify the most specific type of issue from this EXACT list: ["pothole", "garbage", "damagestreetlight", "waterlog", "other"].
         - **"pothole"**: Look for depressions or holes in the road surface.
         - **"garbage"**: Look for waste, litter, or refuse in public areas.
         - **"damagestreetlight"**: Look for broken, flickering, or non-functional streetlights.
         - **"waterlog"**: Look for standing water, flooding, or blocked drainage.
         - **"other"**: Use this ONLY if the issue clearly does not fit any of the above categories, even after thorough image analysis.
      3. Map the identified issue_type to the correct assigned_authority based on these DETERMINISTIC rules:
         - If issue_type is "waterlog", assigned_authority is "drainage".
         - If issue_type is "damagestreetlight", assigned_authority is "streetlight".
         - If issue_type is "pothole", assigned_authority is "road".
         - If issue_type is "garbage", assigned_authority is "garbage".
         - If issue_type is "other", assigned_authority is "head".

      Return the result ONLY as a valid JSON object with the following keys:
      {
        "issue_type": "string",
        "assigned_authority": "string"
      }

      Example:
      User Description: "There's a huge hole in the road near the park."
      Image: (Image showing a pothole)
      Expected Output:
      {
        "issue_type": "pothole",
        "assigned_authority": "road"
      }

      DO NOT include any extra text, explanations, or markdown. Just the raw JSON object.
    `;

    // 3. Fetch image data as bytes (Gemini requires base64/bytes for URL-based images in Node.js)
    // Note: For a real production app, you might download the image first.
    // For this implementation, we assume the frontend sends a public URL.
    const imageResp = await fetch(imageUrl).then(response => response.arrayBuffer());
    const imageData = {
      inlineData: {
        data: Buffer.from(imageResp).toString("base64"),
        mimeType: "image/jpeg" // Adjust if needed, or detect from URL
      },
    };

    // 4. Run AI classification
    const result = await visionModel.generateContent([prompt, imageData]);
    const response = await result.response;
    const text = response.text();
    
    // 5. Parse JSON from response
    // Sometimes Gemini wraps JSON in markdown code blocks
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('AI response did not contain a valid JSON object:', text);
      throw new Error("Could not parse AI response as JSON");
    }
    
    const resultJson = JSON.parse(jsonMatch[0]);

    // Handle the case where the AI determines the image is not related to civic issues
    if (resultJson.error) {
      return {
        issue_type: "Not a civic issue", // Special type to indicate this
        assigned_authority: "none", // No authority assigned
        error: resultJson.error
      };
    }

    return resultJson;

  } catch (error) {
    console.error('Gemini Classification Error:', error);
    // Fallback classification if AI fails or for other errors
    return {
      issue_type: "other",
      assigned_authority: "head"
    };
  }
};

module.exports = { classifyIssue };
