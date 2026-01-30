// Simple local development server
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 3000;
const MAX_ATTEMPTS = 10;

// MIME types
const mimeTypes = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

// Helper function to call OpenRouter API
async function callOpenRouter(prompt) {
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'openai/gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }]
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenRouter API error: ${response.status} ${errorText}`);
  }

  const data = await response.json();
  return data.choices[0].message.content;
}

// Helper function to call Google Gemini API
async function callGemini(prompt) {
  const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

  const result = await model.generateContent(prompt);
  const response = await result.response;
  return response.text();
}

// AI Handler function
async function handleAIRequest(body) {
  const { userInput, currentStep, problemData, conversationHistory } = body;

  // Check attempt limit
  if (conversationHistory && conversationHistory.length >= MAX_ATTEMPTS) {
    return {
      hint: `הסתיימה מכסת ${MAX_ATTEMPTS} ניסיונות. להלן הפתרון המלא:\n\n` + problemData.fullSolution
    };
  }

  // Determine which AI provider to use
  const aiProvider = process.env.AI_PROVIDER || 'google';

  // Build conversation history text
  let conversationText = '';
  if (conversationHistory && conversationHistory.length > 0) {
    conversationHistory.forEach(turn => {
      conversationText += `תשובת סטודנט: ${turn.user}\nתגובת מורה: ${turn.ai}\n\n`;
    });
  }

  const prompt = `
# CRITICAL INSTRUCTIONS
1. Respond in HEBREW only
2. Be PRACTICAL and SPECIFIC - give concrete mathematical guidance
3. Keep responses 2-4 sentences
4. Use gender-neutral language (plural forms)
5. NEVER give the complete final answer until ${MAX_ATTEMPTS} attempts exhausted
6. NEVER repeat the same hint - check conversation history and progress
7. NEVER put quotes around equations - write them directly without '' or "" marks
8. ACCEPT ANY MATHEMATICALLY EQUIVALENT FORM of the correct answer

---

# The Exercise: 3×3 Non-Homogeneous ODE System with Double Eigenvalue

## The Problem:
x' = Ax + b

A = [4, -1, -1; 1, 5, 2; 0, 1, 5]
b = e^{3t}[1, 1, 0]^T

Find the general solution.

## COMPLETE SOLUTIONS (your reference):

**Step 1 - Find Eigenvalues:**
- Characteristic polynomial: |λI - A| = (λ-4)²(λ-6)
- ANSWER: λ₁ = 6 (simple), λ₂ = 4 (double, multiplicity 2)

**Step 2 - Eigenvector for λ = 6:**
- (6I - A)v = 0
- Row reduce [2, 1, 1; -1, 1, -2; 0, -1, 1]
- ANSWER: v₁ = [-1, 1, 1]^T

**Step 3 - Eigenvector for λ = 4:**
- (4I - A)v = 0
- Row reduce [0, 1, 1; -1, -1, -2; 0, -1, -1]
- Geometric multiplicity = 1 (only one eigenvector)
- ANSWER: v₂ = [1, 1, -1]^T

**Step 4 - Generalized Eigenvector (Third Solution):**
- Since λ=4 has algebraic multiplicity 2 but geometric multiplicity 1, need generalized eigenvector
- Solve (A - 4I)w = v₂
- w₁ is free, choose w₁ = 0: w₂ = -3, w₃ = 2
- ANSWER: w = [0, -3, 2]^T
- Third solution: x₃(t) = te^{4t}v₂ + e^{4t}w = e^{4t}[t, t-3, 2-t]^T

**Step 5 - Particular Solution:**
- Since 3 is NOT an eigenvalue, try x_p = e^{3t}[a₁, a₂, a₃]^T
- Solve (3I - A)[a₁, a₂, a₃]^T = [1, 1, 0]^T
- ANSWER: a₁ = -1, a₂ = 0, a₃ = 0
- x_p(t) = e^{3t}[-1, 0, 0]^T

**General Solution:**
x(t) = -C₁e^{6t} + C₂e^{4t} + C₃te^{4t} - e^{3t}
y(t) = C₁e^{6t} + C₂e^{4t} + C₃(t-3)e^{4t}
z(t) = C₁e^{6t} - C₂e^{4t} + C₃(2-t)e^{4t}

---

## Current Step: ${currentStep}
## Expected Answer: ${problemData.correctAnswer}
## Student Input: ${userInput}

${conversationText ? `## Previous Conversation:\n${conversationText}` : ''}

---

# SPECIFIC HINTS BY STEP (give progressively):

## If Step 1 (eigenvalues):
- Hint 1: "חשבו את הפולינום האופייני |λI - A| = 0. זוהי מטריצה 3×3."
- Hint 2: "פתחו את הדטרמיננטה לפי שורה או עמודה. נסו לפי העמודה הראשונה."
- Hint 3: "הפולינום האופייני הוא (λ-4)²(λ-6)."
- Hint 4: "λ₁ = 6 (ערך עצמי פשוט), λ₂ = 4 (ערך עצמי כפול)."

## If Step 2 (eigenvector for λ=6):
- Hint 1: "הציבו λ = 6 במטריצה (λI - A) ופתרו (6I - A)v = 0."
- Hint 2: "המטריצה היא [2, 1, 1; -1, 1, -2; 0, -1, 1]. דרגו אותה."
- Hint 3: "אחרי דירוג: v₃ = t (חופשי), v₂ = t, v₁ = -t."
- Hint 4: "הוקטור העצמי הוא v₁ = [-1, 1, 1]^T."

## If Step 3 (eigenvector for λ=4):
- Hint 1: "הציבו λ = 4 במטריצה (λI - A) ופתרו (4I - A)v = 0."
- Hint 2: "המטריצה היא [0, 1, 1; -1, -1, -2; 0, -1, -1]. דרגו אותה."
- Hint 3: "שימו לב שהריבוי הגאומטרי הוא 1 - יש רק וקטור עצמי אחד!"
- Hint 4: "הוקטור העצמי הוא v₂ = [1, 1, -1]^T."

## If Step 4 (generalized eigenvector):
- Hint 1: "מכיוון שלערך העצמי הכפול λ=4 יש רק וקטור עצמי אחד, צריך וקטור מוכלל w."
- Hint 2: "פתרו את המערכת (A - 4I)w = v₂, כלומר [0,-1,-1; 1,1,2; 0,1,1]w = [1,1,-1]^T."
- Hint 3: "w₁ הוא פרמטר חופשי. בחרו w₁ = 0 ומצאו w₂ ו-w₃."
- Hint 4: "w₂ = -3, w₃ = 2. הוקטור המוכלל הוא w = [0, -3, 2]^T."

## If Step 5 (particular solution):
- Hint 1: "מכיוון ש-3 אינו ערך עצמי, ננסה פתרון פרטי x_p = e^{3t}[a₁, a₂, a₃]^T."
- Hint 2: "הציבו במערכת וצמצמו את e^{3t}. תקבלו (3I - A)a = [1, 1, 0]^T."
- Hint 3: "המטריצה (3I - A) = [-1, 1, 1; -1, -2, -2; 0, -1, -2]. פתרו את המערכת."
- Hint 4: "a₁ = -1, a₂ = 0, a₃ = 0. הפתרון הפרטי הוא x_p = e^{3t}[-1, 0, 0]^T."

# COMMON ERRORS TO CHECK:
- Wrong determinant calculation for 3×3 matrix
- Confusing simple and double eigenvalue
- Not recognizing that geometric multiplicity < algebraic multiplicity
- Wrong sign in (A - 4I) vs (4I - A)
- Forgetting that 3 is not an eigenvalue (so simple ansatz works)
- Sign errors in the particular solution system

# YOUR RESPONSE:
1. If CORRECT: "נכון! [brief confirmation]" and encourage next step
2. If INCORRECT: Identify the specific error and give the appropriate hint from above
3. If student asks for help/hint: Give the next hint in progression
4. After 3+ attempts: Give more explicit guidance, show intermediate steps
`;

  // Call the appropriate AI provider
  let hint;
  if (aiProvider === 'openrouter') {
    hint = await callOpenRouter(prompt);
  } else {
    // Default to Google Gemini
    hint = await callGemini(prompt);
  }

  return { hint, provider: aiProvider };
}

// Create server
const server = http.createServer(async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  // API endpoint
  if (req.url === '/api/ai-hint' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const data = JSON.parse(body);
        const result = await handleAIRequest(data);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      } catch (error) {
        console.error('AI API Error:', error);
        const aiProvider = process.env.AI_PROVIDER || 'google';
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          error: 'שגיאה בעיבוד הבקשה. נסו שוב.',
          provider: aiProvider,
          details: error.message
        }));
      }
    });
    return;
  }

  // Static files
  let filePath = req.url === '/' ? '/index.html' : req.url;
  filePath = path.join(__dirname, filePath);

  const ext = path.extname(filePath);
  const contentType = mimeTypes[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, content) => {
    if (err) {
      if (err.code === 'ENOENT') {
        res.writeHead(404);
        res.end('File not found');
      } else {
        res.writeHead(500);
        res.end('Server error');
      }
    } else {
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content);
    }
  });
});

server.listen(PORT, () => {
  const aiProvider = process.env.AI_PROVIDER || 'google';
  const providerName = aiProvider === 'openrouter' ? 'OpenRouter GPT-4o-mini' : 'Google Gemini 2.5 Flash';

  console.log(`\n🚀 Server running at http://localhost:${PORT}`);
  console.log(`\n🤖 AI Provider: ${providerName}`);
  console.log(`\n📝 Open this URL in your browser to test the exercise`);
  console.log(`\n🧐 Click "Digital Friend" to test the AI assistant`);
  console.log(`\n   Press Ctrl+C to stop the server\n`);
});
