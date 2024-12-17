require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { OpenAI } = require('openai');
const app = express();
const PORT = 5000;
const openaiApiKey = process.env.OPENAI_API_KEY;

const openai = new OpenAI({
  apiKey: openaiApiKey,
});

app.use(cors({   
  origin: 'https://meinlehrer.com',  // C'est ici que tu autorises le frontend à accéder au backend
  methods: ['GET', 'POST'],         // Méthodes HTTP autorisées
  allowedHeaders: ['Content-Type'], // En-têtes autorisés 
  }));

app.use(express.json({ limit: '10mb' })); // Increase the request body size limit

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});

// Define the prompt based on the selected level
const generatePrompt = (niveau, texte) => {
  const commonRules = `Korrigiere diesen Text auf das Sprachniveau ${niveau}.
    Berücksichtige dabei nur die Grammatikregeln und Grammatikstrukturen, die bis einschließlich Niveau ${niveau} relevant sind.`;
  
  const levelSpecificRules = {
    A1: `Personalpronomen, bestimmte/unbestimmte Artikel, Präsens, Perfekt, einfache Satzstrukturen.`,
    A2: `Reflexivverben, Modalverben, einfache Nebensätze (weil, dass), trennbare/untrennbare Verben.`,
    B1: `Passiv, Konjunktiv II, Relativsätze, Plusquamperfekt, komplexere Satzverbindungen.`
  };

  const conclusion = `
    Falls im Text Grammatikstrukturen oberhalb von Niveau ${niveau} vorkommen, korrigiere sie nur, wenn sie falsch sind.
    Zeige zuerst den korrigierten Text und dann die Fehler mit einfachen Erklärungen.
    Am Ende gib mir Empfehlungen für Grammatikübungen.
    Hier ist mein Text: ${texte}
  `;

  return `${commonRules} ${levelSpecificRules[niveau]} ${conclusion}`;
};


  app.post('/api/correct', async (req, res) => {
  const { texte, niveau } = req.body; // Add language level from the request

  if (!texte || !niveau) {
    return res.status(400).json({ error: 'Text and level are required.' });
  }

  const prompt = generatePrompt(niveau, texte);

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4",  // Assurez-vous que vous utilisez le modèle approprié
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
      max_tokens: 3000,
      temperature: 0.5,
    });

    let corrections = response.data.choices[0].message.content;
    let suggestion = "";

    // Check if the text is already correct
    if (corrections.includes("Der Text ist korrekt")) {
      corrections = "Der Text ist korrekt.";
    } else {
      // Search for the suggested correction in the response (if available)
      const suggestionMatch = corrections.match(/Korrigierte Version:\s*(.*)/);
      if (suggestionMatch) {
        suggestion = suggestionMatch[1];
        corrections = corrections.replace(suggestionMatch[0], ""); // Remove corrected version from explanations
      }

      // Organize explanations in a numbered list
      const explanationStart = corrections.indexOf("Erklärung:");
      if (explanationStart !== -1) {
        let explanations = corrections.substring(explanationStart);
        explanations = explanations.split("\n").filter(line => line.trim() !== "");

        // Add numbers to the explanations
        explanations = explanations.map((explanation, index) => `${index + 1}. ${explanation.trim()}`).join("\n");

        corrections = corrections.replace("Erklärung:", explanations);
      }
    }

    // Send the response to the frontend with corrections, explanations, and suggestions
    res.json({ corrections, suggestion });

  } catch (error) {
    if (error.response) {
      console.error('API Response Error:', error.response.data);
    } else if (error.request) {
      console.error('API Request Error:', error.request);
    } else {
      console.error('Unknown Error:', error.message);
    }
    res.status(500).json({ error: 'Error while correcting the text' });
  }
});

module.exports = app;
